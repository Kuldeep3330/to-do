import { describe, expect, it } from 'vitest';
import { computeFee, describeRule, parseFeeRuleForm, ruleToForm, type FeeRuleLike } from './fees';

const percent = (value: number, minFee: number | null = null, maxFee: number | null = null): FeeRuleLike => ({
  method: 'PERCENT',
  value,
  minFee,
  maxFee,
});

// These are the same cases as the API's fees.compute.spec.ts: the preview must match the server.
describe('computeFee (matches the API)', () => {
  it('returns null without a rule', () => {
    expect(computeFee(null, 30000)).toBeNull();
    expect(computeFee(undefined, 30000)).toBeNull();
  });

  it('prices rentals and sales', () => {
    expect(computeFee(percent(50), 28000)).toBe(14000);
    expect(computeFee(percent(1), 8_500_000)).toBe(85_000);
    expect(computeFee(percent(0.5), 8_500_000)).toBe(42_500);
  });

  it('rounds on exact hundredths of a percent', () => {
    expect(computeFee(percent(0.75), 33_333)).toBe(250);
    expect(computeFee(percent(0.01), 49_999)).toBe(5);
    expect(computeFee(percent(33.33), 100)).toBe(33);
  });

  it('charges a flat fee regardless of deal size', () => {
    const fixed: FeeRuleLike = { method: 'FIXED', value: 5000, minFee: null, maxFee: null };
    expect(computeFee(fixed, 1)).toBe(5000);
    expect(computeFee(fixed, 90_000_000)).toBe(5000);
  });

  it('applies the floor and the cap, cap last', () => {
    expect(computeFee(percent(1, 10_000, null), 200_000)).toBe(10_000);
    expect(computeFee(percent(1, null, 50_000), 8_500_000)).toBe(50_000);
    expect(computeFee(percent(1, 60_000, 50_000), 8_500_000)).toBe(50_000);
  });
});

describe('describeRule', () => {
  it('reads like a sentence', () => {
    expect(describeRule('RENT', percent(50))).toBe('50% of the monthly rent');
    expect(describeRule('BUY', percent(1, 20_000, 60_000))).toBe('1% of the sale price, at least ₹20,000 and at most ₹60,000');
    expect(describeRule('BUY', { method: 'FIXED', value: 12500, minFee: null, maxFee: null })).toBe('₹12,500 per deal');
  });
});

describe('parseFeeRuleForm', () => {
  const ok = { method: 'PERCENT' as const, value: '50', minFee: '', maxFee: '' };

  it('accepts a normal rule and treats blank bounds as none', () => {
    expect(parseFeeRuleForm(ok)).toEqual({ ok: true, data: { method: 'PERCENT', value: 50, minFee: null, maxFee: null } });
  });

  it('accepts rupee-formatted input', () => {
    const r = parseFeeRuleForm({ method: 'FIXED', value: '₹ 5,000', minFee: '1,000', maxFee: '₹9,000' });
    expect(r).toEqual({ ok: true, data: { method: 'FIXED', value: 5000, minFee: 1000, maxFee: 9000 } });
  });

  it('explains each problem', () => {
    const bad = (v: Partial<typeof ok>) => {
      const r = parseFeeRuleForm({ ...ok, ...v });
      return r.ok ? null : r.errors;
    };
    expect(bad({ value: '' })?.value).toBe('Enter a number');
    expect(bad({ value: 'abc' })?.value).toBe('Enter a number');
    expect(bad({ value: '0' })?.value).toBe('Must be more than zero');
    expect(bad({ value: '150' })?.value).toBe('A percentage cannot be more than 100');
    expect(bad({ value: '1.234' })?.value).toBe('Use at most 2 decimal places');
    expect(bad({ minFee: 'x' })?.minFee).toBe('Enter an amount in rupees');
    expect(bad({ minFee: '9000', maxFee: '1000' })?.minFee).toBe('The minimum cannot be more than the maximum');
  });

  it('allows a fixed amount above 100', () => {
    expect(parseFeeRuleForm({ method: 'FIXED', value: '15000', minFee: '', maxFee: '' }).ok).toBe(true);
  });
});

describe('ruleToForm', () => {
  it('starts empty when no rule is saved and round-trips a saved one', () => {
    expect(ruleToForm(undefined)).toEqual({ method: 'PERCENT', value: '', minFee: '', maxFee: '' });
    expect(ruleToForm(percent(1, 20_000, 60_000))).toEqual({ method: 'PERCENT', value: '1', minFee: '20000', maxFee: '60000' });
  });
});
