import '../../load-env';
import { AppError } from '../../common/errors/app-error';
import { ListingsService } from './listings.service';

const propertyId = '11111111-1111-4111-8111-111111111111';
const listingId = '55555555-5555-4555-8555-555555555555';

function listingRow(overrides: Record<string, unknown> = {}) {
  return {
    id: listingId,
    propertyId,
    slug: '3-bhk-dwarka',
    intent: 'RENT',
    status: 'DRAFT',
    title: '3 BHK Dwarka',
    description: '',
    priceAmount: BigInt(25000),
    pricePeriod: 'MONTHLY',
    maintenanceAmount: null,
    depositAmount: null,
    negotiable: false,
    availableFrom: null,
    publishedAt: null,
    closedAt: null,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    updatedAt: new Date('2026-10-01T00:00:00.000Z'),
    media: [],
    property: {
      id: propertyId,
      type: 'RESIDENTIAL',
      status: 'ACTIVE',
      internalTitle: 'Staff',
      societyName: null,
      areaValue: '1200',
      areaUnit: 'SQFT',
      bedrooms: 3,
      bathrooms: 2,
      balconies: 1,
      floor: 5,
      totalFloors: 12,
      furnishing: 'SEMI',
      facing: 'EAST',
      locality: {
        id: 'l1',
        name: 'Dwarka',
        slug: 'dwarka',
        city: { id: 'c1', name: 'Delhi', slug: 'delhi' },
      },
    },
    ...overrides,
  };
}

describe('ListingsService', () => {
  let prisma: {
    listing: {
      findMany: jest.Mock;
      count: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    property: { findFirst: jest.Mock };
    media: { count: jest.Mock };
    $transaction: jest.Mock;
    $queryRaw: jest.Mock;
  };
  let service: ListingsService;

  beforeEach(() => {
    prisma = {
      listing: {
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      property: { findFirst: jest.fn() },
      media: { count: jest.fn() },
      $transaction: jest.fn(),
      $queryRaw: jest.fn(),
    };
    service = new ListingsService(prisma as never);
  });

  function mockCreateTx(opts: {
    locked: { id: string; status: string; deleted_at: Date | null }[];
    property?: unknown;
    created?: unknown;
    createError?: unknown;
  }) {
    prisma.$transaction.mockImplementation(async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue(opts.locked),
        property: { findFirst: jest.fn().mockResolvedValue(opts.property ?? null) },
        listing: {
          findFirst: jest.fn().mockResolvedValue(null),
          create: opts.createError
            ? jest.fn().mockRejectedValue(opts.createError)
            : jest.fn().mockResolvedValue(opts.created ?? listingRow()),
        },
      };
      return fn(tx);
    });
  }

  it('creates a draft when the property is ACTIVE', async () => {
    mockCreateTx({
      locked: [{ id: propertyId, status: 'ACTIVE', deleted_at: null }],
      property: {
        id: propertyId,
        deletedAt: null,
        status: 'ACTIVE',
        locality: { slug: 'dwarka' },
      },
    });
    const created = await service.create({
      propertyId,
      intent: 'RENT',
      title: '3 BHK Dwarka',
      pricePeriod: 'MONTHLY',
    });
    expect(created.status).toBe('DRAFT');
    expect(created.slug).toContain('dwarka');
  });

  it('rejects create against an archived property', async () => {
    mockCreateTx({
      locked: [{ id: propertyId, status: 'ARCHIVED', deleted_at: new Date() }],
    });
    await expect(
      service.create({
        propertyId,
        intent: 'RENT',
        title: 'x',
        pricePeriod: 'MONTHLY',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', status: 400 });
  });

  it('rejects create against a missing property', async () => {
    mockCreateTx({ locked: [] });
    await expect(
      service.create({
        propertyId,
        intent: 'RENT',
        title: 'x',
        pricePeriod: 'MONTHLY',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('pause rejects non-PUBLISHED status', async () => {
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([{ id: listingId, status: 'DRAFT' }]),
        listing: { update: jest.fn() },
      };
      return fn(tx as never);
    });
    await expect(service.pause(listingId)).rejects.toMatchObject({ code: 'CONFLICT', status: 409 });
  });

  it('close rejects DRAFT', async () => {
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([{ id: listingId, status: 'DRAFT' }]),
        listing: { update: jest.fn() },
      };
      return fn(tx as never);
    });
    await expect(service.close(listingId)).rejects.toMatchObject({ code: 'CONFLICT', status: 409 });
  });

  it('pause rejects CLOSED after row lock', async () => {
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([{ id: listingId, status: 'CLOSED' }]),
        listing: { update: jest.fn() },
      };
      return fn(tx as never);
    });
    await expect(service.pause(listingId)).rejects.toMatchObject({ code: 'CONFLICT', status: 409 });
  });

  it('maps unique_violation on published intent to CONFLICT', async () => {
    mockCreateTx({
      locked: [{ id: propertyId, status: 'ACTIVE', deleted_at: null }],
      property: {
        id: propertyId,
        deletedAt: null,
        status: 'ACTIVE',
        locality: { slug: 'dwarka' },
      },
      createError: { code: 'P2002', meta: { target: ['property_id', 'intent'] } },
    });
    await expect(
      service.create({
        propertyId,
        intent: 'RENT',
        title: '3 BHK Dwarka',
        pricePeriod: 'MONTHLY',
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 });
  });

  it('getAdmin omits soft-deleted rows', async () => {
    prisma.listing.findFirst.mockResolvedValue(null);
    await expect(service.getAdmin(listingId)).rejects.toBeInstanceOf(AppError);
    expect(prisma.listing.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: listingId, deletedAt: null } }),
    );
  });

  it('searchPublic uses published visibility and card mapping', async () => {
    prisma.$transaction.mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops));
    prisma.listing.findMany.mockResolvedValue([
      listingRow({
        status: 'PUBLISHED',
        publishedAt: new Date('2026-10-08T00:00:00.000Z'),
        media: [
          {
            id: 'c1',
            storageKey: 'listings/l/u_card.webp',
            contentType: 'image/webp',
            width: 600,
            height: 360,
            sortOrder: 0,
            variant: 'CARD',
          },
          {
            id: 'o1',
            storageKey: 'listings/l/u.jpg',
            contentType: 'image/jpeg',
            width: 800,
            height: 600,
            sortOrder: 0,
            variant: 'ORIGINAL',
          },
        ],
      }),
    ]);
    prisma.listing.count.mockResolvedValue(1);
    const result = await service.searchPublic({
      page: 1,
      pageSize: 24,
      sort: 'newest',
    });
    expect(result.meta.total).toBe(1);
    expect(result.data[0].status).toBe('PUBLISHED');
    expect(result.data[0].coverImageUrl).toContain('u_card.webp');
    expect(result.data[0]).not.toHaveProperty('internalTitle');
    expect(prisma.listing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: 'PUBLISHED',
          deletedAt: null,
          property: expect.objectContaining({ deletedAt: null }),
        }),
        orderBy: [{ publishedAt: 'desc' }, { id: 'desc' }],
      }),
    );
  });

  it('searchPublic maps bedroomsMin and price sort', async () => {
    prisma.$transaction.mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops));
    prisma.listing.findMany.mockResolvedValue([]);
    prisma.listing.count.mockResolvedValue(0);
    await service.searchPublic({
      page: 1,
      pageSize: 12,
      sort: 'price_asc',
      bedroomsMin: 4,
      minPrice: 1000,
      q: 'dw',
    });
    expect(prisma.listing.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          priceAmount: { gte: BigInt(1000) },
          title: { contains: 'dw', mode: 'insensitive' },
          property: expect.objectContaining({
            deletedAt: null,
            bedrooms: { gte: 4 },
          }),
        }),
        orderBy: [{ priceAmount: 'asc' }, { id: 'desc' }],
        take: 12,
      }),
    );
  });

  it('getPublicBySlug requires PUBLISHED and non-deleted property', async () => {
    prisma.listing.findFirst.mockResolvedValue(null);
    await expect(service.getPublicBySlug('missing')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    });
    expect(prisma.listing.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          slug: 'missing',
          status: 'PUBLISHED',
          deletedAt: null,
          property: { deletedAt: null },
        }),
      }),
    );
  });
});
