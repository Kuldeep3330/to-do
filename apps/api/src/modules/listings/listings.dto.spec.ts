import {
  createListingSchema,
  patchListingSchema,
  adminListingListQuerySchema,
  searchListingsQuerySchema,
} from './listings.dto';

const propertyId = '11111111-1111-4111-8111-111111111111';

describe('listing DTOs', () => {
  const valid = {
    propertyId,
    intent: 'RENT' as const,
    title: '3 BHK Dwarka',
    pricePeriod: 'MONTHLY' as const,
    priceAmount: 25000,
  };

  it('accepts a valid create payload', () => {
    const parsed = createListingSchema.parse(valid);
    expect(parsed.intent).toBe('RENT');
    expect(parsed.pricePeriod).toBe('MONTHLY');
  });

  it('rejects missing required fields', () => {
    const result = createListingSchema.safeParse({ title: 'x' });
    expect(result.success).toBe(false);
  });

  it('rejects RENT with ONE_TIME', () => {
    const result = createListingSchema.safeParse({ ...valid, pricePeriod: 'ONE_TIME' });
    expect(result.success).toBe(false);
  });

  it('rejects BUY with MONTHLY', () => {
    const result = createListingSchema.safeParse({
      ...valid,
      intent: 'BUY',
      pricePeriod: 'MONTHLY',
    });
    expect(result.success).toBe(false);
  });

  it('rejects unsafe / non-integer money', () => {
    expect(createListingSchema.safeParse({ ...valid, priceAmount: 12.5 }).success).toBe(false);
    expect(createListingSchema.safeParse({ ...valid, priceAmount: 0 }).success).toBe(false);
  });

  it('rejects PATCH status / intent / slug / propertyId', () => {
    const parsed = patchListingSchema.parse({
      title: 'New',
      status: 'PUBLISHED',
      intent: 'BUY',
      slug: 'hack',
      propertyId,
    } as never);
    expect(parsed).toEqual({ title: 'New' });
  });

  it('defaults admin pagination', () => {
    const parsed = adminListingListQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(24);
  });

  it('defaults public search pagination and sort', () => {
    const parsed = searchListingsQuerySchema.parse({});
    expect(parsed.page).toBe(1);
    expect(parsed.pageSize).toBe(24);
    expect(parsed.sort).toBe('newest');
  });

  it('rejects invalid search enums and short q', () => {
    expect(searchListingsQuerySchema.safeParse({ intent: 'LEASE' }).success).toBe(false);
    expect(searchListingsQuerySchema.safeParse({ sort: 'relevance' }).success).toBe(false);
    expect(searchListingsQuerySchema.safeParse({ type: 'VILLA' }).success).toBe(false);
    expect(searchListingsQuerySchema.safeParse({ furnishing: 'LUXURY' }).success).toBe(false);
    expect(searchListingsQuerySchema.safeParse({ q: 'x' }).success).toBe(false);
    expect(searchListingsQuerySchema.safeParse({ pageSize: 25 }).success).toBe(false);
  });

  it('accepts search whitelist and strips unknown keys', () => {
    const parsed = searchListingsQuerySchema.parse({
      intent: 'RENT',
      city: 'delhi',
      locality: 'dwarka',
      type: 'RESIDENTIAL',
      bedrooms: '3',
      bedroomsMin: '4',
      minPrice: '10000',
      maxPrice: '50000',
      minArea: '800',
      maxArea: '2000',
      furnishing: 'SEMI',
      q: 'bhk',
      sort: 'price_asc',
      extra: 'ignored',
    });
    expect(parsed.bedrooms).toBe(3);
    expect(parsed.bedroomsMin).toBe(4);
    expect(parsed.minPrice).toBe(10000);
    expect(parsed).not.toHaveProperty('extra');
  });
});
