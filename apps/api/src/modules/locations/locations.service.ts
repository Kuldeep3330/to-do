import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
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

  /**
   * Facts for a city or locality landing page, computed from published listings only:
   * how many homes, the price range and median, and which areas nearby have homes too.
   * Rent and sale are never mixed because their prices mean different things.
   */
  async areaSummary(citySlug: string, localitySlug: string | null, intent: 'BUY' | 'RENT') {
    const city = await this.prisma.city.findFirst({
      where: { slug: citySlug, isActive: true },
      select: { id: true, name: true, slug: true },
    });
    if (!city) {
      throw AppError.notFound('City not found');
    }
    const locality = localitySlug
      ? await this.prisma.locality.findFirst({
          where: { cityId: city.id, slug: localitySlug, isActive: true },
          select: { id: true, name: true, slug: true },
        })
      : null;
    if (localitySlug && !locality) {
      throw AppError.notFound('Locality not found');
    }

    const live = Prisma.sql`l.status = 'PUBLISHED' AND l.deleted_at IS NULL AND p.deleted_at IS NULL
      AND l.intent = ${intent}::listing_intent AND p.city_id = ${city.id}::uuid`;

    const [stats] = await this.prisma.$queryRaw<
      { count: bigint; min: bigint | null; max: bigint | null; median: number | null; verified: bigint }[]
    >(Prisma.sql`
      SELECT COUNT(*) AS count,
             MIN(l.price_amount) AS min,
             MAX(l.price_amount) AS max,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY l.price_amount) AS median,
             COUNT(*) FILTER (WHERE l.verified_at IS NOT NULL) AS verified
      FROM listings l JOIN properties p ON p.id = l.property_id
      WHERE ${live} ${locality ? Prisma.sql`AND p.locality_id = ${locality.id}::uuid` : Prisma.empty}`);

    const perLocality = await this.prisma.$queryRaw<{ locality_id: string; count: bigint }[]>(Prisma.sql`
      SELECT p.locality_id, COUNT(*) AS count
      FROM listings l JOIN properties p ON p.id = l.property_id
      WHERE ${live}
      GROUP BY p.locality_id`);
    const names = await this.prisma.locality.findMany({
      where: { cityId: city.id, isActive: true, id: { in: perLocality.map((r) => r.locality_id) } },
      select: { id: true, name: true, slug: true },
    });
    const counts = new Map(perLocality.map((r) => [r.locality_id, Number(r.count)]));
    const localities = names
      .filter((n) => n.id !== locality?.id)
      .map((n) => ({ name: n.name, slug: n.slug, count: counts.get(n.id) ?? 0 }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));

    const count = Number(stats?.count ?? 0);
    return {
      city: { name: city.name, slug: city.slug },
      locality: locality ? { name: locality.name, slug: locality.slug } : null,
      intent,
      stats: {
        count,
        minPrice: count > 0 && stats.min != null ? Number(stats.min) : null,
        maxPrice: count > 0 && stats.max != null ? Number(stats.max) : null,
        medianPrice: count > 0 && stats.median != null ? Math.round(Number(stats.median)) : null,
        verifiedCount: Number(stats?.verified ?? 0),
      },
      localities,
    };
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
