import type { FeeRule, Intent } from '@/lib/api/types';
import { formatINR, parseMoneyInput } from '@/lib/format';

export type FeeRuleLike = Pick<FeeRule, 'method' | 'value' | 'minFee' | 'maxFee'>;

/**
 * Same calculation as the API (apps/api/src/modules/finance/fees.compute.ts), used only to PREVIEW a
 * fee while a deal is being entered. The server always recomputes, so the two must agree.
 */
export function computeFee(rule: FeeRuleLike | null | undefined, closedAmount: number): number | null {
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

/** "50% of the monthly rent", "1% of the sale price", "₹5,000 per deal", plus any floor or cap. */
export function describeRule(intent: Intent, rule: FeeRuleLike): string {
  const base =
    rule.method === 'FIXED'
      ? `${formatINR(rule.value)} per deal`
      : `${rule.value}% of the ${intent === 'RENT' ? 'monthly rent' : 'sale price'}`;
  const bounds = [
    rule.minFee != null ? `at least ${formatINR(rule.minFee)}` : null,
    rule.maxFee != null ? `at most ${formatINR(rule.maxFee)}` : null,
  ].filter(Boolean);
  return bounds.length > 0 ? `${base}, ${bounds.join(' and ')}` : base;
}

export type FeeRuleFormValues = { method: 'PERCENT' | 'FIXED'; value: string; minFee: string; maxFee: string };

export type FeeRuleFormErrors = Partial<Record<keyof FeeRuleFormValues, string>>;

type Parsed =
  | { ok: true; data: { method: 'PERCENT' | 'FIXED'; value: number; minFee: number | null; maxFee: number | null } }
  | { ok: false; errors: FeeRuleFormErrors };

/** Turn what was typed into an API body, or say what is wrong with each field. */
export function parseFeeRuleForm(v: FeeRuleFormValues): Parsed {
  const errors: FeeRuleFormErrors = {};

  const raw = v.value.replace(/[,₹\s]/g, '');
  const value = raw === '' ? NaN : Number(raw);
  if (raw === '' || !Number.isFinite(value)) errors.value = 'Enter a number';
  else if (value <= 0) errors.value = 'Must be more than zero';
  else if (Math.round(value * 100) / 100 !== value) errors.value = 'Use at most 2 decimal places';
  else if (v.method === 'PERCENT' && value > 100) errors.value = 'A percentage cannot be more than 100';
  else if (value > 10_000_000_000) errors.value = 'That looks too large';

  const bound = (text: string, key: 'minFee' | 'maxFee'): number | null => {
    if (text.trim() === '') return null;
    const n = parseMoneyInput(text);
    if (n === null) {
      errors[key] = 'Enter an amount in rupees';
      return null;
    }
    if (n > 10_000_000_000) errors[key] = 'That looks too large';
    return n;
  };
  const minFee = bound(v.minFee, 'minFee');
  const maxFee = bound(v.maxFee, 'maxFee');
  if (!errors.minFee && !errors.maxFee && minFee !== null && maxFee !== null && minFee > maxFee) {
    errors.minFee = 'The minimum cannot be more than the maximum';
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, data: { method: v.method, value, minFee, maxFee } };
}

export function ruleToForm(rule: FeeRuleLike | undefined): FeeRuleFormValues {
  return {
    method: rule?.method ?? 'PERCENT',
    value: rule ? String(rule.value) : '',
    minFee: rule?.minFee != null ? String(rule.minFee) : '',
    maxFee: rule?.maxFee != null ? String(rule.maxFee) : '',
  };
}
