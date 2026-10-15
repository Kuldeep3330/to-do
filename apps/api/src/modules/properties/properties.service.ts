import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AppError } from '../../common/errors/app-error';
import { offsetOf } from '../../common/dto/pagination';
import { PrismaService } from '../../prisma/prisma.service';
import { toAdminProperty } from './properties.mapper';
import { createPropertySchema, patchPropertySchema, PropertyListQueryDto } from './properties.dto';

type CreatePropertyInput = z.infer<typeof createPropertySchema>;
type PatchPropertyInput = z.infer<typeof patchPropertySchema>;

const WITH_AMENITIES = { amenities: { select: { amenityId: true } } } as const;

const LIVE_LISTING_STATUSES = ['DRAFT', 'PUBLISHED', 'PAUSED'] as const;

@Injectable()
export class PropertiesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: PropertyListQueryDto) {
    // Archiving soft-deletes the row, so the ARCHIVED view must include soft-deleted properties.
    const where: Prisma.PropertyWhereInput = {
      ...(query.status === 'ARCHIVED' ? {} : { deletedAt: null }),
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
    try {
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
    } catch (e) {
      this.mapPrismaWriteError(e);
    }
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
    try {
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
    } catch (e) {
      this.mapPrismaWriteError(e);
    }
  }

  async archive(id: string) {
    const row = await this.prisma.$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw<{ id: string; status: string; deleted_at: Date | null }[]>`
          SELECT id, status, deleted_at FROM properties WHERE id = ${id}::uuid AND deleted_at IS NULL FOR UPDATE`;
        if (locked.length === 0) {
          throw AppError.notFound('Property not found');
        }
        const liveListings = await tx.listing.count({
          where: {
            propertyId: id,
            deletedAt: null,
            status: { in: [...LIVE_LISTING_STATUSES] },
          },
        });
        if (liveListings > 0) {
          throw AppError.conflict('Cannot archive a property with live listings');
        }
        return tx.property.update({
          where: { id },
          data: { status: 'ARCHIVED', deletedAt: new Date() },
          include: WITH_AMENITIES,
        });
      },
      { timeout: 5000 },
    );
    return toAdminProperty(row);
  }

  private async assertLocalityInCity(localityId: string, cityId: string): Promise<void> {
    const locality = await this.prisma.locality.findFirst({
      where: { id: localityId },
      select: { id: true, cityId: true },
    });
    if (!locality) {
      throw AppError.validation('Locality not found', [
        { path: 'localityId', message: 'Locality does not exist' },
      ]);
    }
    const city = await this.prisma.city.findFirst({
      where: { id: cityId },
      select: { id: true },
    });
    if (!city) {
      throw AppError.validation('City not found', [
        { path: 'cityId', message: 'City does not exist' },
      ]);
    }
    if (locality.cityId !== cityId) {
      throw AppError.validation('Locality does not belong to the selected city', [
        { path: 'localityId', message: 'City/locality mismatch' },
      ]);
    }
  }

  private async assertAmenities(amenityIds?: string[]): Promise<void> {
    if (!amenityIds || amenityIds.length === 0) {
      return;
    }
    const unique = [...new Set(amenityIds)];
    const count = await this.prisma.amenity.count({ where: { id: { in: unique } } });
    if (count !== unique.length) {
      throw AppError.validation('Unknown amenity id', [
        { path: 'amenityIds', message: 'One or more amenities do not exist' },
      ]);
    }
  }

  private mapPrismaWriteError(e: unknown): never {
    const code = (e as { code?: string }).code;
    if (code === 'P2003') {
      throw AppError.validation('City/locality mismatch', [
        { path: 'localityId', message: 'City/locality mismatch' },
      ]);
    }
    if (code === 'P2002') {
      throw AppError.conflict('Conflict');
    }
    throw e;
  }
}
