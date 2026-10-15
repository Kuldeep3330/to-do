import { describe, expect, it } from 'vitest';
import { emptyPropertyValues, propertyFormSchema, propertyToFormValues } from './property';
import type { AdminProperty } from '@/lib/api/types';

const uuid = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

const valid = () => ({
  ...emptyPropertyValues(),
  internalTitle: 'Tower B 1204',
  cityId: uuid,
  localityId: uuid,
});

describe('propertyFormSchema', () => {
  it('turns empty strings into nulls and numbers into integers', () => {
    const out = propertyFormSchema.parse({ ...valid(), bedrooms: '3', areaValue: '1250.5', floor: '' });
    expect(out.bedrooms).toBe(3);
    expect(out.areaValue).toBe(1250.5);
    expect(out.floor).toBeNull();
    expect(out.societyName).toBeNull();
    expect(out.furnishing).toBeNull();
  });

  it('requires a title, city and locality', () => {
    const r = propertyFormSchema.safeParse({ ...valid(), internalTitle: ' ', cityId: '', localityId: '' });
    expect(r.success).toBe(false);
    if (!r.success) {
      const paths = r.error.issues.map((i) => i.path[0]);
      expect(paths).toEqual(expect.arrayContaining(['internalTitle', 'cityId', 'localityId']));
    }
  });

  it('rejects fractional bedrooms and out-of-range values', () => {
    expect(propertyFormSchema.safeParse({ ...valid(), bedrooms: '2.5' }).success).toBe(false);
    expect(propertyFormSchema.safeParse({ ...valid(), bedrooms: '51' }).success).toBe(false);
    expect(propertyFormSchema.safeParse({ ...valid(), areaValue: '0' }).success).toBe(false);
    expect(propertyFormSchema.safeParse({ ...valid(), bedrooms: 'abc' }).success).toBe(false);
  });

  it('requires lat and lng together', () => {
    const lone = propertyFormSchema.safeParse({ ...valid(), lat: '28.6' });
    expect(lone.success).toBe(false);
    const both = propertyFormSchema.safeParse({ ...valid(), lat: '28.6', lng: '77.2' });
    expect(both.success).toBe(true);
  });

  it('bounds latitude and longitude', () => {
    expect(propertyFormSchema.safeParse({ ...valid(), lat: '91', lng: '0' }).success).toBe(false);
    expect(propertyFormSchema.safeParse({ ...valid(), lat: '0', lng: '181' }).success).toBe(false);
  });
});

describe('propertyToFormValues', () => {
  it('round-trips through the schema', () => {
    const p: AdminProperty = {
      id: uuid,
      type: 'RESIDENTIAL',
      status: 'ACTIVE',
      cityId: uuid,
      localityId: uuid,
      societyName: 'Green Park',
      addressText: null,
      lat: 28.6,
      lng: 77.2,
      areaValue: 1200,
      areaUnit: 'SQFT',
      bedrooms: 2,
      bathrooms: 2,
      balconies: null,
      floor: 4,
      totalFloors: 10,
      furnishing: 'SEMI',
      facing: null,
      ageYears: null,
      parkingCount: 1,
      internalTitle: 'Green Park 402',
      amenityIds: [uuid],
      deletedAt: null,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    };
    const out = propertyFormSchema.parse(propertyToFormValues(p));
    expect(out).toMatchObject({
      societyName: 'Green Park',
      addressText: null,
      lat: 28.6,
      bedrooms: 2,
      balconies: null,
      furnishing: 'SEMI',
      amenityIds: [uuid],
    });
  });
});
