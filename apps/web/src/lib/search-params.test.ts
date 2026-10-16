import { describe, expect, it } from 'vitest';
import {
  filterChips,
  hasActiveFilters,
  maxPage,
  parseFilters,
  searchHeading,
  searchHref,
  toApiQuery,
  toSearchString,
} from './search-params';

describe('parseFilters', () => {
  it('parses a typical query', () => {
    const f = parseFilters({ intent: 'RENT', city: 'noida', bedrooms: '2', maxPrice: '25000', sort: 'price_asc', page: '3' });
    expect(f).toMatchObject({ intent: 'RENT', city: 'noida', bedrooms: 2, maxPrice: 25000, sort: 'price_asc', page: 3 });
  });

  it('drops invalid and malicious values instead of throwing', () => {
    const f = parseFilters({
      intent: 'SELL',
      city: 'No ida!',
      type: 'HOUSE',
      bedrooms: '-1',
      minPrice: 'abc',
      furnishing: 'full',
      sort: 'random',
      page: '0',
      q: 'x',
    });
    expect(f.intent).toBeUndefined();
    expect(f.city).toBeUndefined();
    expect(f.type).toBeUndefined();
    expect(f.bedrooms).toBeUndefined();
    expect(f.minPrice).toBeUndefined();
    expect(f.furnishing).toBeUndefined();
    expect(f.q).toBeUndefined(); // shorter than the API's 2-char minimum
    expect(f.sort).toBe('newest');
    expect(f.page).toBe(1);
  });

  it('takes the first value of repeated params', () => {
    expect(parseFilters({ intent: ['BUY', 'RENT'] }).intent).toBe('BUY');
  });

  it('ignores a locality without a city', () => {
    expect(parseFilters({ locality: 'sector-62' }).locality).toBeUndefined();
    expect(parseFilters({ city: 'noida', locality: 'sector-62' }).locality).toBe('sector-62');
  });

  it('swaps an inverted price range', () => {
    const f = parseFilters({ minPrice: '50000', maxPrice: '10000' });
    expect([f.minPrice, f.maxPrice]).toEqual([10000, 50000]);
  });

  it('uses bedroomsMin only when no exact bedroom count is set', () => {
    expect(parseFilters({ bedroomsMin: '4' }).bedroomsMin).toBe(4);
    expect(parseFilters({ bedrooms: '2', bedroomsMin: '4' }).bedroomsMin).toBeUndefined();
  });

  it('trims the search text', () => {
    expect(parseFilters({ q: '  metro  ' }).q).toBe('metro');
  });
});

describe('toSearchString / round trip', () => {
  it('omits defaults and keeps a stable key order', () => {
    expect(toSearchString({ sort: 'newest', page: 1 })).toBe('');
    expect(toSearchString({ city: 'noida', intent: 'RENT', page: 2 })).toBe('?intent=RENT&city=noida&page=2');
  });

  it('round-trips through parseFilters', () => {
    const original = parseFilters({ intent: 'BUY', city: 'delhi', locality: 'dwarka', bedroomsMin: '3', minPrice: '5000000', sort: 'price_desc', q: 'metro' });
    const again = parseFilters(Object.fromEntries(new URLSearchParams(toSearchString(original))));
    expect(again).toEqual(original);
  });

  it('builds search hrefs', () => {
    expect(searchHref({})).toBe('/search');
    expect(searchHref({ intent: 'RENT' })).toBe('/search?intent=RENT');
  });
});

describe('toApiQuery', () => {
  it('sends only defined filters plus paging', () => {
    expect(toApiQuery(parseFilters({ intent: 'RENT', page: '2' }))).toEqual({
      intent: 'RENT',
      sort: 'newest',
      page: 2,
      pageSize: 12,
    });
  });
});

describe('helpers', () => {
  it('detects active filters (sort and page do not count)', () => {
    expect(hasActiveFilters(parseFilters({ sort: 'price_asc', page: '2' }))).toBe(false);
    expect(hasActiveFilters(parseFilters({ city: 'noida' }))).toBe(true);
  });

  it('caps the last reachable page to the API offset limit', () => {
    expect(maxPage(12)).toBe(84);
    expect((maxPage(12) - 1) * 12).toBeLessThanOrEqual(1000);
  });

  it('builds chips whose clear patches remove them', () => {
    const f = parseFilters({ intent: 'RENT', city: 'noida', locality: 'sector-62', bedrooms: '2', maxPrice: '25000' });
    const chips = filterChips(f, { city: 'Noida', locality: 'Sector 62' });
    expect(chips.map((c) => c.label)).toEqual(['Rent', 'Noida', 'Sector 62', '2 BHK', 'Max ₹25,000']);
    const cityChip = chips.find((c) => c.key === 'city')!;
    expect(cityChip.clear).toEqual({ city: undefined, locality: undefined });
  });

  it('writes a readable heading', () => {
    expect(searchHeading(parseFilters({ intent: 'RENT', bedrooms: '2' }), 'Noida')).toBe('2 BHK homes for rent in Noida');
    expect(searchHeading(parseFilters({}))).toBe('Homes in Delhi-NCR');
    expect(searchHeading(parseFilters({ intent: 'BUY', type: 'COMMERCIAL' }), 'Delhi', 'Saket')).toBe(
      'Commercial properties for sale in Saket, Delhi',
    );
  });
});
