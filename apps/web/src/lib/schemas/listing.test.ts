import { describe, expect, it } from 'vitest';
import {
  emptyListingValues,
  listingCreateSchema,
  listingEditSchema,
  listingToEditValues,
  pricePeriodFor,
  publishChecklist,
} from './listing';
import type { AdminListing } from '@/lib/api/types';

const uuid = '3f2504e0-4f89-41d3-9a0c-0305e82c3301';

describe('listingCreateSchema', () => {
  const base = () => ({ ...emptyListingValues(uuid), title: '3 BHK in Sector 62' });

  it('parses money with Indian separators into integers', () => {
    const out = listingCreateSchema.parse({ ...base(), priceAmount: '₹ 45,00,000', depositAmount: '90000' });
    expect(out.priceAmount).toBe(4_500_000);
    expect(out.depositAmount).toBe(90_000);
    expect(out.maintenanceAmount).toBeNull();
    expect(out.availableFrom).toBeNull();
  });

  it('allows a draft with no price', () => {
    expect(listingCreateSchema.parse(base()).priceAmount).toBeNull();
  });

  it('rejects zero, negative, fractional and non-numeric prices', () => {
    for (const bad of ['0', '-5', '1200.5', 'abc']) {
      expect(listingCreateSchema.safeParse({ ...base(), priceAmount: bad }).success).toBe(false);
    }
  });

  it('allows zero maintenance but not negative', () => {
    expect(listingCreateSchema.safeParse({ ...base(), maintenanceAmount: '0' }).success).toBe(true);
    expect(listingCreateSchema.safeParse({ ...base(), maintenanceAmount: '-1' }).success).toBe(false);
  });

  it('requires a title and a property', () => {
    const r = listingCreateSchema.safeParse({ ...base(), title: '  ', propertyId: '' });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.map((i) => i.path[0])).toEqual(expect.arrayContaining(['title', 'propertyId']));
    }
  });

  it('validates the date format', () => {
    expect(listingCreateSchema.safeParse({ ...base(), availableFrom: '2026-12-01' }).success).toBe(true);
    expect(listingCreateSchema.safeParse({ ...base(), availableFrom: '01/12/2026' }).success).toBe(false);
  });
});

describe('pricePeriodFor', () => {
  it('maps intent to the period the API requires', () => {
    expect(pricePeriodFor('RENT')).toBe('MONTHLY');
    expect(pricePeriodFor('BUY')).toBe('ONE_TIME');
  });
});

const listing = (over: Partial<AdminListing> = {}): AdminListing => ({
  id: uuid,
  propertyId: uuid,
  slug: 's',
  intent: 'RENT',
  status: 'DRAFT',
  title: 'T',
  description: '',
  priceAmount: 25_000,
  pricePeriod: 'MONTHLY',
  maintenanceAmount: null,
  depositAmount: 50_000,
  negotiable: true,
  availableFrom: '2026-12-01',
  publishedAt: null,
  closedAt: null,
  verifiedAt: null,
  verifiedBy: null,
  lastConfirmedAt: null,
  originalCount: 2,
  property: {
    id: uuid,
    type: 'RESIDENTIAL',
    status: 'ACTIVE',
    internalTitle: 'P',
    areaValue: 900,
    areaUnit: 'SQFT',
    bedrooms: 2,
    bathrooms: 2,
  },
  city: { id: uuid, name: 'Noida', slug: 'noida' },
  locality: { id: uuid, name: 'Sector 62', slug: 'sector-62' },
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

describe('listingToEditValues', () => {
  it('round-trips through the edit schema', () => {
    const out = listingEditSchema.parse(listingToEditValues(listing()));
    expect(out).toMatchObject({
      title: 'T',
      priceAmount: 25_000,
      depositAmount: 50_000,
      maintenanceAmount: null,
      negotiable: true,
      availableFrom: '2026-12-01',
    });
  });
});

describe('publishChecklist', () => {
  it('passes when everything is present', () => {
    expect(publishChecklist(listing()).every((c) => c.ok)).toBe(true);
  });

  it('flags each missing requirement', () => {
    const failing = (over: Partial<AdminListing>) => publishChecklist(listing(over)).filter((c) => !c.ok).map((c) => c.key);
    expect(failing({ priceAmount: null })).toEqual(['priceAmount']);
    expect(failing({ originalCount: 0 })).toEqual(['media']);
    expect(failing({ title: ' ' })).toEqual(['title']);
    expect(failing({ property: { ...listing().property, areaValue: null } })).toEqual(['area']);
  });
});
