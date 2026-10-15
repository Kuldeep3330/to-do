import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AppError } from '../../common/errors/app-error';
import { offsetOf } from '../../common/dto/response';
import { PrismaService } from '../../prisma/prisma.service';
import { toAdminProperty } from './properties.mapper';
import { CreatePropertyDto, PatchPropertyDto, PropertyListQueryDto } from './properties.dto';

type CreatePropertyInput = z.infer<typeof CreatePropertyDto.schema>;
type PatchPropertyInput = z.infer<typeof PatchPropertyDto.schema>;

const WITH_AMENITIES = { amenities: { select: { amenityId: true } } } as const;

@Injectable()
export class PropertiesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: PropertyListQueryDto) {
    const where: Prisma.PropertyWhereInput = {
      deletedAt: null,
      ...(query.cityId ? { cityId: query.cityId } : {}),
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.q
        ? {
            OR: [
              { internalTitle: { contains: query.q, mode: 'insensitive' } },
              { societyName: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.property.findMany({
        where,
        include: WITH_AMENITIES,
        orderBy: { createdAt: 'desc' },
        skip: offsetOf(query.page, query.pageSize),
        take: query.pageSize,
      }),
      this.prisma.property.count({ where }),
    ]);
    return {
      data: rows.map(toAdminProperty),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  async get(id: string) {
    const row = await this.prisma.property.findFirst({
      where: { id, deletedAt: null },
      include: WITH_AMENITIES,
    });
    if (!row) {
      throw AppError.notFound('Property not found');
    }
    return toAdminProperty(row);
  }

  async create(input: CreatePropertyInput) {
    const { amenityIds, ...fields } = input;
    await this.assertLocalityInCity(fields.localityId, fields.cityId);
    await this.assertAmenities(amenityIds);
    const row = await this.prisma.property.create({
      data: {
        ...fields,
        ...(amenityIds && amenityIds.length > 0
          ? { amenities: { create: amenityIds.map((amenityId) => ({ amenityId })) } }
          : {}),
      },
      include: WITH_AMENITIES,
    });
    return toAdminProperty(row);
  }

  async patch(id: string, input: PatchPropertyInput) {
    const current = await this.prisma.property.findFirst({
      where: { id, deletedAt: null },
      include: WITH_AMENITIES,
    });
    if (!current) {
      throw AppError.notFound('Property not found');
    }
    const { amenityIds, ...fields } = input;
    const nextCityId = fields.cityId ?? current.cityId;
    const nextLocalityId = fields.localityId ?? current.localityId;
    if (fields.cityId || fields.localityId) {
      await this.assertLocalityInCity(nextLocalityId, nextCityId);
    }
    if (amenityIds) {
      await this.assertAmenities(amenityIds);
    }
    const row = await this.prisma.property.update({
      where: { id },
      data: {
        ...fields,
        ...(amenityIds
          ? {
              amenities: {
                deleteMany: {},
                create: amenityIds.map((amenityId) => ({ amenityId })),
              },
            }
          : {}),
      },
      include: WITH_AMENITIES,
    });
    return toAdminProperty(row);
  }

  async archive(id: string) {
    const current = await this.prisma.property.findFirst({
      where: { id, deletedAt: null },
      include: { listings: { select: { status: true } } },
    });
    if (!current) {
      throw AppError.notFound('Property not found');
    }
    const liveListings = current.listings.filter((l) => l.status !== 'CLOSED').length;
    if (liveListings > 0) {
      throw AppError.conflict('Cannot archive a property with live listings');
    }
    const row = await this.prisma.property.update({
      where: { id },
      data: { status: 'ARCHIVED', deletedAt: new Date() },
      include: WITH_AMENITIES,
    });
    return toAdminProperty(row);
  }

  private async assertLocalityInCity(localityId: string, cityId: string): Promise<void> {
    const locality = await this.prisma.locality.findFirst({
      where: { id: localityId, cityId },
      select: { id: true },
    });
    if (!locality) {
      throw AppError.validation('Locality does not belong to the selected city', [
        { path: 'localityId', message: 'City/locality mismatch' },
      ]);
    }
  }

  private async assertAmenities(amenityIds?: string[]): Promise<void> {
    if (!amenityIds || amenityIds.length === 0) {
      return;
    }
    const count = await this.prisma.amenity.count({ where: { id: { in: amenityIds } } });
    if (count !== new Set(amenityIds).size) {
      throw AppError.validation('Unknown amenity id', [
        { path: 'amenityIds', message: 'One or more amenities do not exist' },
      ]);
    }
  }
}
