import { computeFee, FeeRuleLike } from './fees.compute';

const percent = (value: number, minFee: number | null = null, maxFee: number | null = null): FeeRuleLike => ({
  method: 'PERCENT',
  value,
  minFee,
  maxFee,
});

describe('computeFee', () => {
  it('returns null (not zero) when there is no rule', () => {
    expect(computeFee(null, 30000)).toBeNull();
  });

  it('charges half a month of rent as 50 percent of the monthly rent', () => {
    expect(computeFee(percent(50), 28000)).toBe(14000);
    expect(computeFee(percent(100), 28000)).toBe(28000);
  });

  it('charges a share of the sale price', () => {
    expect(computeFee(percent(1), 8_500_000)).toBe(85_000);
    expect(computeFee(percent(0.5), 8_500_000)).toBe(42_500);
  });

  it('rounds to the nearest rupee using exact hundredths of a percent', () => {
    expect(computeFee(percent(0.75), 33_333)).toBe(250); // 249.9975
    expect(computeFee(percent(0.01), 49_999)).toBe(5); // 4.9999
    expect(computeFee(percent(33.33), 100)).toBe(33);
  });

  it('charges the flat value for a fixed rule, whatever the deal size', () => {
    const fixed: FeeRuleLike = { method: 'FIXED', value: 5000, minFee: null, maxFee: null };
    expect(computeFee(fixed, 1)).toBe(5000);
    expect(computeFee(fixed, 90_000_000)).toBe(5000);
  });

  it('applies the floor and the cap, with the cap winning', () => {
    expect(computeFee(percent(1, 10_000, null), 200_000)).toBe(10_000); // 2,000 raised to the floor
    expect(computeFee(percent(1, null, 50_000), 8_500_000)).toBe(50_000); // 85,000 cut to the cap
    expect(computeFee(percent(1, 60_000, 50_000), 8_500_000)).toBe(50_000); // inconsistent bounds: cap last
    expect(computeFee(percent(1, 1_000, 50_000), 500_000)).toBe(5_000); // inside the bounds: untouched
  });

  it('handles the largest allowed deal without losing precision', () => {
    expect(computeFee(percent(2), 100_000_000_000)).toBe(2_000_000_000);
  });
});
