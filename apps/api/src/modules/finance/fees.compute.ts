export type FeeRuleLike = {
  method: 'FIXED' | 'PERCENT';
  /** INR for FIXED; percent (0-100, at most 2 decimals) for PERCENT. */
  value: number;
  minFee: number | null;
  maxFee: number | null;
};

/**
 * What NCR Homes earns on a closed deal.
 *
 * FIXED charges the flat value. PERCENT charges that share of the closed amount (monthly rent for a
 * rental, sale price for a purchase), rounded to the nearest rupee. The optional floor and cap are
 * applied last, so a cap always wins over the percentage.
 *
 * Returns null when there is no rule, so an unconfigured fee never shows up as a misleading zero.
 * Percent maths runs in hundredths of a percent to avoid floating-point drift.
 */
export function computeFee(rule: FeeRuleLike | null, closedAmount: number): number | null {
  if (!rule) return null;
  let fee: number;
  if (rule.method === 'FIXED') {
    fee = Math.round(rule.value);
  } else {
    const hundredths = Math.round(rule.value * 100);
    fee = Math.round((closedAmount * hundredths) / 10_000);
  }
  if (rule.minFee != null) fee = Math.max(fee, rule.minFee);
  if (rule.maxFee != null) fee = Math.min(fee, rule.maxFee);
  return fee;
}
