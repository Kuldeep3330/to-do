import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes } from 'crypto';
import { z } from 'zod';
import { AppError } from '../../common/errors/app-error';
import { offsetOf, publicOffsetOrThrow } from '../../common/dto/pagination';
import { slugify, withSuffix } from '../../common/utils/slug';
import { PrismaService } from '../../prisma/prisma.service';
import { publicUrl, storageGroupPrefix } from '../media/media.urls';
import { toAdminListing, toPublicListingCard, toPublicListingDetail } from './listings.mapper';
import {
  AdminListingListQueryDto,
  createListingSchema,
  patchListingSchema,
  SearchListingsQueryDto,
} from './listings.dto';

type CreateListingInput = z.infer<typeof createListingSchema>;
type PatchListingInput = z.infer<typeof patchListingSchema>;

const ADMIN_INCLUDE = {
  property: {
    include: {
      locality: { include: { city: true } },
    },
  },
  media: {
    where: { variant: 'ORIGINAL' as const },
    select: { id: true },
  },
} as const;

export const PUBLIC_INCLUDE = {
  property: {
    include: {
      locality: { include: { city: true } },
    },
  },
  media: {
    select: {
      id: true,
      storageKey: true,
      contentType: true,
      width: true,
      height: true,
      sortOrder: true,
      variant: true,
    },
  },
} as const;

@Injectable()
export class ListingsService {
  constructor(private readonly prisma: PrismaService) {}

  async listAdmin(query: AdminListingListQueryDto) {
    const where: Prisma.ListingWhereInput = {
      deletedAt: null,
      ...(query.propertyId ? { propertyId: query.propertyId } : {}),
      ...(query.intent ? { intent: query.intent } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.q ? { title: { contains: query.q, mode: 'insensitive' as const } } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.listing.findMany({
        where,
        include: ADMIN_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip: offsetOf(query.page, query.pageSize),
        take: query.pageSize,
      }),
      this.prisma.listing.count({ where }),
    ]);
    return {
      data: rows.map(toAdminListing),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  async getAdmin(id: string) {
    const row = await this.prisma.listing.findFirst({
      where: { id, deletedAt: null },
      include: ADMIN_INCLUDE,
    });
    if (!row) {
      throw AppError.notFound('Listing not found');
    }
    return { ...toAdminListing(row), media: await this.adminMedia(id) };
  }

  /** ORIGINAL images in display order, each with its CARD thumbnail when one exists. */
  private async adminMedia(listingId: string) {
    const rows = await this.prisma.media.findMany({
      where: { listingId },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const cards = new Map(
      rows.filter((r) => r.variant === 'CARD').map((r) => [storageGroupPrefix(r.storageKey), r]),
    );
    return rows
      .filter((r) => r.variant === 'ORIGINAL')
      .map((o) => {
        const card = cards.get(storageGroupPrefix(o.storageKey));
        return {
          id: o.id,
          url: publicUrl(o.storageKey),
          thumbnailUrl: publicUrl((card ?? o).storageKey),
          contentType: o.contentType,
          byteSize: o.byteSize,
          width: o.width,
          height: o.height,
          sortOrder: o.sortOrder,
        };
      });
  }

  async searchPublic(query: SearchListingsQueryDto) {
    const offset = publicOffsetOrThrow(query.page, query.pageSize);
    const where = publicSearchWhere(query);
    const orderBy = publicSearchOrder(query.sort);
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.listing.findMany({
        where,
        include: PUBLIC_INCLUDE,
        orderBy,
        skip: offset,
        take: query.pageSize,
      }),
      this.prisma.listing.count({ where }),
    ]);
    return {
      data: rows.map(toPublicListingCard),
      meta: { page: query.page, pageSize: query.pageSize, total },
    };
  }

  async getPublicBySlug(slug: string) {
    const row = await this.prisma.listing.findFirst({
      where: {
        slug,
        status: 'PUBLISHED',
        deletedAt: null,
        property: { deletedAt: null },
      },
      include: PUBLIC_INCLUDE,
    });
    if (!row) {
      throw AppError.notFound('Listing not found');
    }
    return toPublicListingDetail(row);
  }

  async create(input: CreateListingInput) {
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const row = await this.prisma.$transaction(
          async (tx) => {
            const locked = await tx.$queryRaw<
              { id: string; status: string; deleted_at: Date | null }[]
            >`SELECT id, status, deleted_at FROM properties WHERE id = ${input.propertyId}::uuid FOR UPDATE`;
            if (locked.length === 0 || locked[0].deleted_at || locked[0].status !== 'ACTIVE') {
              throw AppError.validation('Property not available', [
                { path: 'propertyId', message: 'Property does not exist or is archived' },
              ]);
            }
            const property = await tx.property.findFirst({
              where: { id: input.propertyId },
              include: { locality: true },
            });
            if (!property) {
              throw AppError.validation('Property not available', [
                { path: 'propertyId', message: 'Property does not exist or is archived' },
              ]);
            }
            const slug = await this.allocateSlug(input.title, property.locality.slug, tx);
            return tx.listing.create({
              data: {
                propertyId: input.propertyId,
                intent: input.intent,
                title: input.title,
                description: input.description ?? '',
                slug,
                priceAmount: bigintOrNull(input.priceAmount),
                pricePeriod: input.pricePeriod,
                maintenanceAmount: bigintOrNull(input.maintenanceAmount),
                depositAmount: bigintOrNull(input.depositAmount),
                negotiable: input.negotiable ?? false,
                availableFrom: dateOrNull(input.availableFrom),
              },
              include: ADMIN_INCLUDE,
            });
          },
          { timeout: 5000 },
        );
        return toAdminListing(row);
      } catch (e) {
        if (e instanceof AppError) {
          throw e;
        }
        const code = (e as { code?: string }).code;
        const target = String((e as { meta?: { target?: unknown } }).meta?.target ?? '');
        if (code === 'P2002' && target.toLowerCase().includes('slug') && attempt < 4) {
          continue;
        }
        this.mapWriteError(e);
      }
    }
    throw AppError.conflict('Slug already in use');
  }

  async patch(id: string, input: PatchListingInput) {
    const current = await this.prisma.listing.findFirst({
      where: { id, deletedAt: null },
    });
    if (!current) {
      throw AppError.notFound('Listing not found');
    }
    if (current.status === 'CLOSED') {
      throw AppError.conflict('Closed listings cannot be updated');
    }
    try {
      const row = await this.prisma.listing.update({
        where: { id },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(input.priceAmount !== undefined ? { priceAmount: bigintOrNull(input.priceAmount) } : {}),
          ...(input.maintenanceAmount !== undefined
            ? { maintenanceAmount: bigintOrNull(input.maintenanceAmount) }
            : {}),
          ...(input.depositAmount !== undefined ? { depositAmount: bigintOrNull(input.depositAmount) } : {}),
          ...(input.negotiable !== undefined ? { negotiable: input.negotiable } : {}),
          ...(input.availableFrom !== undefined ? { availableFrom: dateOrNull(input.availableFrom) } : {}),
        },
        include: ADMIN_INCLUDE,
      });
      return toAdminListing(row);
    } catch (e) {
      this.mapWriteError(e);
    }
  }

  async publish(id: string) {
    try {
      const row = await this.prisma.$transaction(
        async (tx) => {
          const locked = await tx.$queryRaw<
            { id: string; status: string; property_id: string; intent: string; title: string; price_amount: bigint | null; published_at: Date | null }[]
          >`SELECT id, status, property_id, intent, title, price_amount, published_at FROM listings WHERE id = ${id}::uuid AND deleted_at IS NULL FOR UPDATE`;
          if (locked.length === 0) {
            throw AppError.notFound('Listing not found');
          }
          const listing = locked[0];
          if (listing.status !== 'DRAFT' && listing.status !== 'PAUSED') {
            throw AppError.conflict('Listing cannot be published from the current status');
          }

          const propLocked = await tx.$queryRaw<
            { id: string; status: string; deleted_at: Date | null }[]
          >`SELECT id, status, deleted_at FROM properties WHERE id = ${listing.property_id}::uuid FOR UPDATE`;
          if (
            propLocked.length === 0 ||
            propLocked[0].deleted_at ||
            propLocked[0].status !== 'ACTIVE'
          ) {
            throw AppError.conflict('Cannot publish against an archived or deleted property');
          }

          const property = await tx.property.findFirst({
            where: { id: listing.property_id },
            include: { locality: true },
          });
          if (!property || property.deletedAt) {
            throw AppError.conflict('Cannot publish against an archived or deleted property');
          }
          if (property.status !== 'ACTIVE') {
            throw AppError.conflict('Cannot publish against an archived or deleted property');
          }

          const details: { path: string; message: string }[] = [];
          if (!listing.title?.trim()) {
            details.push({ path: 'title', message: 'Title is required to publish' });
          }
          if (listing.price_amount === null || listing.price_amount <= BigInt(0)) {
            details.push({ path: 'priceAmount', message: 'Price must be greater than 0' });
          }
          if (!property.localityId || !property.cityId) {
            details.push({ path: 'property', message: 'Property city and locality are required' });
          }
          if (!property.type) {
            details.push({ path: 'property.type', message: 'Property type is required' });
          }
          if (property.areaValue === null || Number(property.areaValue) <= 0) {
            details.push({ path: 'property.areaValue', message: 'Property area is required to publish' });
          }
          const originalCount = await tx.media.count({
            where: { listingId: listing.id, variant: 'ORIGINAL' },
          });
          if (originalCount < 1) {
            details.push({ path: 'media', message: 'At least one ORIGINAL image is required to publish' });
          }
          if (details.length > 0) {
            throw new AppError('CONFLICT', 'Publish requirements not met', details);
          }

          const other = await tx.listing.findFirst({
            where: {
              propertyId: listing.property_id,
              intent: listing.intent as 'BUY' | 'RENT',
              status: 'PUBLISHED',
              deletedAt: null,
              NOT: { id: listing.id },
            },
            select: { id: true },
          });
          if (other) {
            throw AppError.conflict('A published listing already exists for this property and intent');
          }

          return tx.listing.update({
            where: { id: listing.id },
            data: {
              status: 'PUBLISHED',
              publishedAt: listing.published_at ?? new Date(),
            },
            include: ADMIN_INCLUDE,
          });
        },
        { timeout: 5000 },
      );
      return toAdminListing(row);
    } catch (e) {
      if (e instanceof AppError) {
        throw e;
      }
      this.mapWriteError(e);
    }
  }

  async pause(id: string) {
    try {
      const row = await this.prisma.$transaction(
        async (tx) => {
          const locked = await tx.$queryRaw<{ id: string; status: string }[]>`
            SELECT id, status FROM listings WHERE id = ${id}::uuid AND deleted_at IS NULL FOR UPDATE`;
          if (locked.length === 0) {
            throw AppError.notFound('Listing not found');
          }
          if (locked[0].status !== 'PUBLISHED') {
            throw AppError.conflict('Only published listings can be paused');
          }
          return tx.listing.update({
            where: { id: locked[0].id },
            data: { status: 'PAUSED' },
            include: ADMIN_INCLUDE,
          });
        },
        { timeout: 5000 },
      );
      return toAdminListing(row);
    } catch (e) {
      if (e instanceof AppError) {
        throw e;
      }
      this.mapWriteError(e);
    }
  }

  async close(id: string) {
    try {
      const row = await this.prisma.$transaction(
        async (tx) => {
          const locked = await tx.$queryRaw<{ id: string; status: string }[]>`
            SELECT id, status FROM listings WHERE id = ${id}::uuid AND deleted_at IS NULL FOR UPDATE`;
          if (locked.length === 0) {
            throw AppError.notFound('Listing not found');
          }
          if (locked[0].status !== 'PUBLISHED' && locked[0].status !== 'PAUSED') {
            throw AppError.conflict('Only published or paused listings can be closed');
          }
          return tx.listing.update({
            where: { id: locked[0].id },
            data: { status: 'CLOSED', closedAt: new Date() },
            include: ADMIN_INCLUDE,
          });
        },
        { timeout: 5000 },
      );
      return toAdminListing(row);
    } catch (e) {
      if (e instanceof AppError) {
        throw e;
      }
      this.mapWriteError(e);
    }
  }

  private async allocateSlug(
    title: string,
    localitySlug: string,
    db: Prisma.TransactionClient,
  ): Promise<string> {
    const base = slugify(`${title} ${localitySlug}`) || 'listing';
    for (let i = 0; i < 8; i++) {
      const candidate = i === 0 ? base.slice(0, 180) : withSuffix(base, randomBytes(3).toString('hex'));
      const taken = await db.listing.findFirst({
        where: { slug: candidate, deletedAt: null },
        select: { id: true },
      });
      if (!taken) {
        return candidate;
      }
    }
    return withSuffix(base, randomBytes(6).toString('hex'));
  }

  private mapWriteError(e: unknown): never {
    const code = (e as { code?: string }).code;
    const meta = (e as { meta?: { target?: string[] | string } }).meta;
    if (code === 'P2002') {
      const target = Array.isArray(meta?.target) ? meta.target.join(',') : String(meta?.target ?? '');
      if (target.includes('slug')) {
        throw AppError.conflict('Slug already in use');
      }
      throw AppError.conflict('A published listing already exists for this property and intent');
    }
    if (code === 'P2003') {
      throw AppError.validation('Invalid property', [
        { path: 'propertyId', message: 'Property does not exist' },
      ]);
    }
    throw e;
  }
}

function publicSearchWhere(query: SearchListingsQueryDto): Prisma.ListingWhereInput {
  const priceAmount: Prisma.BigIntNullableFilter | undefined =
    query.minPrice !== undefined || query.maxPrice !== undefined
      ? {
          ...(query.minPrice !== undefined ? { gte: BigInt(query.minPrice) } : {}),
          ...(query.maxPrice !== undefined ? { lte: BigInt(query.maxPrice) } : {}),
        }
      : undefined;
  const areaValue: Prisma.DecimalNullableFilter | undefined =
    query.minArea !== undefined || query.maxArea !== undefined
      ? {
          ...(query.minArea !== undefined ? { gte: query.minArea } : {}),
          ...(query.maxArea !== undefined ? { lte: query.maxArea } : {}),
        }
      : undefined;
  let bedrooms: Prisma.IntNullableFilter | number | undefined;
  if (query.bedrooms !== undefined) {
    bedrooms = query.bedrooms;
  } else if (query.bedroomsMin !== undefined) {
    bedrooms = { gte: query.bedroomsMin };
  }
  const localityFilter: Prisma.LocalityWhereInput | undefined =
    query.city || query.locality
      ? {
          ...(query.locality ? { slug: query.locality } : {}),
          ...(query.city ? { city: { slug: query.city } } : {}),
        }
      : undefined;
  return {
    status: 'PUBLISHED',
    deletedAt: null,
    ...(priceAmount ? { priceAmount } : {}),
    ...(query.intent ? { intent: query.intent } : {}),
    ...(query.q ? { title: { contains: escapeIlike(query.q), mode: 'insensitive' as const } } : {}),
    property: {
      deletedAt: null,
      ...(query.type ? { type: query.type } : {}),
      ...(bedrooms !== undefined ? { bedrooms } : {}),
      ...(areaValue ? { areaValue } : {}),
      ...(query.furnishing ? { furnishing: query.furnishing } : {}),
      ...(localityFilter ? { locality: localityFilter } : {}),
    },
  };
}

function publicSearchOrder(
  sort: SearchListingsQueryDto['sort'],
): Prisma.ListingOrderByWithRelationInput[] {
  if (sort === 'price_asc') {
    return [{ priceAmount: 'asc' }, { id: 'desc' }];
  }
  if (sort === 'price_desc') {
    return [{ priceAmount: 'desc' }, { id: 'desc' }];
  }
  return [{ publishedAt: 'desc' }, { id: 'desc' }];
}

function escapeIlike(value: string): string {
  return value.replace(/[\\%_]/g, '\\$&');
}

function bigintOrNull(value: number | null | undefined): bigint | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  return BigInt(value);
}

function dateOrNull(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  return new Date(`${value}T00:00:00.000Z`);
}
