import { describe, expect, it } from 'vitest';
import type { AreaSummary } from '@/lib/api/types';
import { areaHeading, areaName, areaSummaryText } from './area-copy';
import { areaPath } from './routes';

const base: AreaSummary = {
  city: { name: 'Noida', slug: 'noida' },
  locality: { name: 'Sector 62', slug: 'sector-62' },
  intent: 'RENT',
  stats: { count: 4, minPrice: 18000, maxPrice: 45000, medianPrice: 25000, verifiedCount: 2 },
  localities: [],
};

describe('area copy', () => {
  it('names and headings follow the intent and level', () => {
    expect(areaName(base)).toBe('Sector 62, Noida');
    expect(areaName({ ...base, locality: null })).toBe('Noida');
    expect(areaHeading(base)).toBe('Homes for rent in Sector 62, Noida');
    expect(areaHeading({ ...base, intent: 'BUY', locality: null })).toBe('Homes for sale in Noida');
  });

  it('states count, price range, middle price and verified share from the data', () => {
    expect(areaSummaryText(base)).toBe(
      '4 homes for rent in Sector 62, Noida. Prices range from ₹18,000/mo to ₹45,000/mo, with a middle price of ₹25,000/mo. 2 were visited and verified by our team.',
    );
  });

  it('only quotes a middle price when there are enough homes for it to mean something', () => {
    const few = { ...base, stats: { ...base.stats, count: 2, verifiedCount: 0 } };
    expect(areaSummaryText(few)).not.toContain('middle price');
    expect(areaSummaryText(few)).not.toContain('verified');
  });

  it('handles one home, all verified, and sale prices', () => {
    const one: AreaSummary = {
      ...base,
      intent: 'BUY',
      stats: { count: 1, minPrice: 9_500_000, maxPrice: 9_500_000, medianPrice: 9_500_000, verifiedCount: 1 },
    };
    expect(areaSummaryText(one)).toBe(
      '1 home for sale in Sector 62, Noida. Priced at ₹95 L. All were visited and verified by our team.',
    );
  });

  it('says plainly when there is nothing, without inventing numbers', () => {
    const none = { ...base, stats: { count: 0, minPrice: null, maxPrice: null, medianPrice: null, verifiedCount: 0 } };
    expect(areaSummaryText(none)).toBe('We have no homes for rent in Sector 62, Noida right now.');
  });
});

describe('areaPath', () => {
  it('builds city and locality URLs per intent', () => {
    expect(areaPath('RENT', 'noida')).toBe('/rent/noida');
    expect(areaPath('BUY', 'noida', 'sector-62')).toBe('/buy/noida/sector-62');
  });
});
