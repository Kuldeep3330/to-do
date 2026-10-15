import { toAdminProperty, PropertyRow } from './properties.mapper';

describe('toAdminProperty', () => {
  it('maps prisma decimals and amenity ids without leaking extra relations', () => {
    const row: PropertyRow = {
      id: 'p1',
      type: 'RESIDENTIAL',
      status: 'ACTIVE',
      cityId: 'c1',
      localityId: 'l1',
      societyName: 'Green',
      addressText: null,
      lat: { toString: () => '28.613900' },
      lng: '77.209000',
      areaValue: '1250.50',
      areaUnit: 'SQFT',
      bedrooms: 3,
      bathrooms: 2,
      balconies: 1,
      floor: 5,
      totalFloors: 12,
      furnishing: 'SEMI',
      facing: 'EAST',
      ageYears: 4,
      parkingCount: 1,
      internalTitle: 'Staff title',
      amenities: [{ amenityId: 'a1' }, { amenityId: 'a2' }],
      deletedAt: null,
      createdAt: new Date('2026-10-01T00:00:00.000Z'),
      updatedAt: new Date('2026-10-02T00:00:00.000Z'),
    };
    const dto = toAdminProperty(row);
    expect(dto.lat).toBeCloseTo(28.6139);
    expect(dto.lng).toBeCloseTo(77.209);
    expect(dto.areaValue).toBeCloseTo(1250.5);
    expect(dto.amenityIds).toEqual(['a1', 'a2']);
    expect(dto.deletedAt).toBeNull();
    expect(dto.createdAt).toBe('2026-10-01T00:00:00.000Z');
    expect(dto).not.toHaveProperty('listings');
    expect(dto).not.toHaveProperty('locality');
  });
});
