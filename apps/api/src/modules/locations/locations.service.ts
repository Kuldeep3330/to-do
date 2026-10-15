import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../prisma/prisma.service';
import {
  CreateCityDto,
  CreateLocalityDto,
  PatchCityDto,
  PatchLocalityDto,
} from './locations.dto';

type CreateCityInput = z.infer<typeof CreateCityDto.schema>;
type CreateLocalityInput = z.infer<typeof CreateLocalityDto.schema>;

@Injectable()
export class LocationsService {
  constructor(private readonly prisma: PrismaService) {}

  async listPublicCities() {
    const cities = await this.prisma.city.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, slug: true },
    });
    return cities;
  }

  async listPublicLocalities(citySlug: string) {
    const city = await this.prisma.city.findFirst({
      where: { slug: citySlug, isActive: true },
      select: { id: true },
    });
    if (!city) {
      throw AppError.notFound('City not found');
    }
    const localities = await this.prisma.locality.findMany({
      where: { cityId: city.id, isActive: true },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, slug: true },
    });
    return localities;
  }

  async listAdminCities() {
    return this.prisma.city.findMany({ orderBy: { name: 'asc' } });
  }

  async listAdminLocalities(cityId?: string) {
    if (cityId) {
      const city = await this.prisma.city.findUnique({ where: { id: cityId } });
      if (!city) {
        throw AppError.notFound('City not found');
      }
    }
    return this.prisma.locality.findMany({
      where: cityId ? { cityId } : undefined,
      orderBy: { name: 'asc' },
    });
  }

  async createCity(input: CreateCityInput) {
    try {
      return await this.prisma.city.create({ data: input });
    } catch (e: unknown) {
      if ((e as { code?: string }).code === 'P2002') {
        throw AppError.conflict('City slug already exists');
      }
      throw e;
    }
  }

  async patchCity(id: string, input: PatchCityDto) {
    await this.requireCity(id);
    return this.prisma.city.update({ where: { id }, data: input });
  }

  async createLocality(input: CreateLocalityInput) {
    await this.requireCity(input.cityId);
    try {
      return await this.prisma.locality.create({ data: input });
    } catch (e: unknown) {
      if ((e as { code?: string }).code === 'P2002') {
        throw AppError.conflict('Locality slug already exists in this city');
      }
      throw e;
    }
  }

  async patchLocality(id: string, input: PatchLocalityDto) {
    const found = await this.prisma.locality.findUnique({ where: { id } });
    if (!found) {
      throw AppError.notFound('Locality not found');
    }
    return this.prisma.locality.update({ where: { id }, data: input });
  }

  private async requireCity(id: string) {
    const city = await this.prisma.city.findUnique({ where: { id } });
    if (!city) {
      throw AppError.notFound('City not found');
    }
    return city;
  }
}
