import { describe, expect, it } from 'vitest';
import type { AreaSummary, PublicListingDetail } from '@/lib/api/types';
import { areaJsonLd, listingJsonLd } from './json-ld';
import { amenityIcon } from '@/components/listing/amenity-list';

const base = {
  id: 'l1',
  slug: 'two-bhk-dwarka',
  intent: 'RENT',
  status: 'PUBLISHED',
  title: '2 BHK in Dwarka',
  description: 'Bright flat',
  priceAmount: 30000,
  pricePeriod: 'MONTHLY',
  bedrooms: 2,
  bathrooms: 2,
  areaValue: 900,
  areaUnit: 'SQFT',
  city: { name: 'Delhi', slug: 'delhi' },
  locality: { name: 'Dwarka', slug: 'dwarka' },
  gallery: [],
  amenities: [],
} as unknown as PublicListingDetail;

describe('listing structured data amenities', () => {
  it('lists each amenity as a feature', () => {
    const ld = listingJsonLd({
      ...base,
      amenities: [
        { code: 'gym', name: 'Gym' },
        { code: 'lift', name: 'Lift' },
      ],
    });
    expect(ld.about.amenityFeature).toEqual([
      { '@type': 'LocationFeatureSpecification', name: 'Gym', value: true },
      { '@type': 'LocationFeatureSpecification', name: 'Lift', value: true },
    ]);
  });

  it('leaves the field out when there are no amenities', () => {
    expect(listingJsonLd(base).about.amenityFeature).toBeUndefined();
  });
});

describe('area structured data', () => {
  const area = {
    city: { name: 'Noida', slug: 'noida' },
    locality: { name: 'Sector 62', slug: 'sector-62' },
    intent: 'RENT',
    stats: { count: 2, minPrice: 18000, maxPrice: 30000, medianPrice: 24000, verifiedCount: 1 },
    localities: [],
  } as unknown as AreaSummary;

  it('describes the page as a collection of the homes shown', () => {
    const ld = areaJsonLd(area, [{ ...base, slug: 'a', city: { name: 'Noida', slug: 'noida' }, locality: { name: 'Sector 62', slug: 'sector-62' } } as never], '/rent/noida/sector-62');
    expect(ld['@type']).toBe('CollectionPage');
    expect(ld.name).toBe('Homes for rent in Sector 62, Noida');
    expect(ld.url).toMatch(/\/rent\/noida\/sector-62$/);
    expect(ld.mainEntity.numberOfItems).toBe(2);
    expect(ld.mainEntity.itemListElement).toHaveLength(1);
    expect(ld.mainEntity.itemListElement[0].url).toMatch(/\/rent\/noida\/sector-62\/a$/);
  });
});

describe('amenityIcon', () => {
  it('has an icon for every seeded code and a fallback for new ones', () => {
    const codes = ['lift', 'security', 'park', 'power_backup', 'gym', 'clubhouse', 'visitor_parking', 'water_supply', 'piped_gas', 'wheelchair'];
    for (const c of codes) expect(amenityIcon(c)).toBeTruthy();
    expect(amenityIcon('rooftop_pool')).toBe(amenityIcon('anything_else'));
  });
});
