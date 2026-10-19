import { describe, expect, it } from 'vitest';
import type { PublicListingDetail } from '@/lib/api/types';
import { listingJsonLd } from './json-ld';
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

describe('amenityIcon', () => {
  it('has an icon for every seeded code and a fallback for new ones', () => {
    const codes = ['lift', 'security', 'park', 'power_backup', 'gym', 'clubhouse', 'visitor_parking', 'water_supply', 'piped_gas', 'wheelchair'];
    for (const c of codes) expect(amenityIcon(c)).toBeTruthy();
    expect(amenityIcon('rooftop_pool')).toBe(amenityIcon('anything_else'));
  });
});
