import { AppError } from '../../common/errors/app-error';
import { PropertiesService } from './properties.service';

const cityId = '11111111-1111-4111-8111-111111111111';
const localityId = '22222222-2222-4222-8222-222222222222';
const otherCityId = '33333333-3333-4333-8333-333333333333';
const propertyId = '44444444-4444-4444-8444-444444444444';

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: propertyId,
    type: 'RESIDENTIAL',
    status: 'ACTIVE',
    cityId,
    localityId,
    societyName: null,
    addressText: null,
    lat: null,
    lng: null,
    areaValue: null,
    areaUnit: 'SQFT',
    bedrooms: null,
    bathrooms: null,
    balconies: null,
    floor: null,
    totalFloors: null,
    furnishing: null,
    facing: null,
    ageYears: null,
    parkingCount: null,
    internalTitle: 'Test property',
    amenities: [],
    deletedAt: null,
    createdAt: new Date('2026-10-01T00:00:00.000Z'),
    updatedAt: new Date('2026-10-01T00:00:00.000Z'),
    ...overrides,
  };
}

describe('PropertiesService', () => {
  let prisma: {
    property: {
      findMany: jest.Mock;
      count: jest.Mock;
      findFirst: jest.Mock;
      create: jest.Mock;
      update: jest.Mock;
    };
    listing: { count: jest.Mock };
    locality: { findFirst: jest.Mock };
    city: { findFirst: jest.Mock };
    amenity: { count: jest.Mock };
    $transaction: jest.Mock;
    $queryRaw: jest.Mock;
  };
  let service: PropertiesService;

  beforeEach(() => {
    prisma = {
      property: {
        findMany: jest.fn(),
        count: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
      listing: { count: jest.fn() },
      locality: { findFirst: jest.fn() },
      city: { findFirst: jest.fn() },
      amenity: { count: jest.fn() },
      $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
      $queryRaw: jest.fn(),
    };
    service = new PropertiesService(prisma as never);
  });

  it('creates a property when locality belongs to city', async () => {
    prisma.locality.findFirst.mockResolvedValue({ id: localityId, cityId });
    prisma.city.findFirst.mockResolvedValue({ id: cityId });
    prisma.property.create.mockResolvedValue(row());
    const created = await service.create({
      type: 'RESIDENTIAL',
      cityId,
      localityId,
      internalTitle: 'Test property',
    });
    expect(created.id).toBe(propertyId);
    expect(created.internalTitle).toBe('Test property');
    expect(prisma.property.create).toHaveBeenCalled();
  });

  it('rejects a locality that belongs to a different city', async () => {
    prisma.locality.findFirst.mockResolvedValue({ id: localityId, cityId: otherCityId });
    prisma.city.findFirst.mockResolvedValue({ id: cityId });
    await expect(
      service.create({
        type: 'RESIDENTIAL',
        cityId,
        localityId,
        internalTitle: 'Mismatch',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', status: 400 });
    expect(prisma.property.create).not.toHaveBeenCalled();
  });

  it('rejects a nonexistent locality', async () => {
    prisma.locality.findFirst.mockResolvedValue(null);
    await expect(
      service.create({
        type: 'RESIDENTIAL',
        cityId,
        localityId,
        internalTitle: 'Missing loc',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', status: 400 });
  });

  it('rejects a nonexistent city', async () => {
    prisma.locality.findFirst.mockResolvedValue({ id: localityId, cityId });
    prisma.city.findFirst.mockResolvedValue(null);
    await expect(
      service.create({
        type: 'RESIDENTIAL',
        cityId,
        localityId,
        internalTitle: 'Missing city',
      }),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR', status: 400 });
  });

  it('get omits soft-deleted rows', async () => {
    prisma.property.findFirst.mockResolvedValue(null);
    await expect(service.get(propertyId)).rejects.toBeInstanceOf(AppError);
    expect(prisma.property.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: propertyId, deletedAt: null } }),
    );
  });

  it('list always filters deletedAt null and returns the envelope', async () => {
    prisma.property.findMany.mockResolvedValue([row()]);
    prisma.property.count.mockResolvedValue(1);
    const result = await service.list({ page: 1, pageSize: 24 });
    expect(result.meta).toEqual({ page: 1, pageSize: 24, total: 1 });
    expect(result.data).toHaveLength(1);
    expect(prisma.property.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deletedAt: null }),
        skip: 0,
        take: 24,
      }),
    );
  });

  it('patch rejects empty unknown property', async () => {
    prisma.property.findFirst.mockResolvedValue(null);
    await expect(service.patch(propertyId, { internalTitle: 'x' })).rejects.toMatchObject({
      code: 'NOT_FOUND',
      status: 404,
    });
  });

  it('archive conflicts when a non-deleted live listing exists', async () => {
    prisma.$transaction.mockImplementation(async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([{ id: propertyId, status: 'ACTIVE', deleted_at: null }]),
        listing: { count: jest.fn().mockResolvedValue(1) },
        property: { update: jest.fn() },
      };
      return fn(tx);
    });
    await expect(service.archive(propertyId)).rejects.toMatchObject({
      code: 'CONFLICT',
      status: 409,
    });
  });

  it('archive sets ARCHIVED and deletedAt when no live listings', async () => {
    const archivedRow = row({ status: 'ARCHIVED', deletedAt: new Date() });
    prisma.$transaction.mockImplementation(async (fn: (tx: Record<string, unknown>) => Promise<unknown>) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([{ id: propertyId, status: 'ACTIVE', deleted_at: null }]),
        listing: { count: jest.fn().mockResolvedValue(0) },
        property: {
          update: jest.fn().mockResolvedValue(archivedRow),
        },
      };
      return fn(tx);
    });
    const archived = await service.archive(propertyId);
    expect(archived.status).toBe('ARCHIVED');
  });
});
