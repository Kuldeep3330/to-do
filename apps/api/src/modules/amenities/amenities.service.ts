import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateAmenityDto, PatchAmenityDto } from './amenities.dto';

type CreateAmenityInput = z.infer<typeof CreateAmenityDto.schema>;

@Injectable()
export class AmenitiesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.amenity.findMany({ orderBy: { name: 'asc' } });
  }

  async create(input: CreateAmenityInput) {
    try {
      return await this.prisma.amenity.create({ data: input });
    } catch (e: unknown) {
      if ((e as { code?: string }).code === 'P2002') {
        throw AppError.conflict('Amenity code already exists');
      }
      throw e;
    }
  }

  async patch(id: string, input: PatchAmenityDto) {
    const found = await this.prisma.amenity.findUnique({ where: { id } });
    if (!found) {
      throw AppError.notFound('Amenity not found');
    }
    return this.prisma.amenity.update({ where: { id }, data: input });
  }
}
