import { format as fmt, parseISO } from 'date-fns';

const inr = new Intl.NumberFormat('en-IN');

/** Full rupee amount: ₹ 45,00,000 */
export function formatINR(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return '—';
  return `₹${inr.format(amount)}`;
}

/** Compact Indian notation: ₹45 L, ₹1.2 Cr, ₹25,000. Integer math only until the final divide. */
export function formatINRCompact(amount: number | null | undefined): string {
  if (amount === null || amount === undefined) return 'Price on request';
  if (amount >= 10_000_000) return `₹${trim(amount / 10_000_000)} Cr`;
  if (amount >= 100_000) return `₹${trim(amount / 100_000)} L`;
  return `₹${inr.format(amount)}`;
}

function trim(n: number): string {
  return n.toFixed(2).replace(/\.?0+$/, '');
}

export function formatPrice(
  amount: number | null | undefined,
  period: 'MONTHLY' | 'ONE_TIME',
): string {
  const base = formatINRCompact(amount);
  return period === 'MONTHLY' && amount != null ? `${base}/mo` : base;
}

export function formatArea(value: number | null | undefined, unit = 'SQFT'): string | null {
  if (value === null || value === undefined) return null;
  const label = unit === 'SQFT' ? 'sq ft' : unit === 'SQYD' ? 'sq yd' : unit === 'SQM' ? 'sq m' : unit.toLowerCase();
  return `${inr.format(value)} ${label}`;
}

export function formatBedrooms(bedrooms: number | null | undefined): string | null {
  if (bedrooms === null || bedrooms === undefined) return null;
  return bedrooms === 0 ? 'Studio' : `${bedrooms} BHK`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  return fmt(parseISO(iso), 'd MMM yyyy');
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return fmt(parseISO(iso), 'd MMM yyyy, h:mm a');
}

export function humanize(code: string): string {
  return code
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** Accepts "98765 43210", "+91 98765 43210", "09876543210" and returns "+919876543210" or null. */
export function normalizeIndianPhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, '');
  const m = digits.match(/^(?:\+?91|0)?([6-9]\d{9})$/);
  return m ? `+91${m[1]}` : null;
}

export function formatPhone(phone: string): string {
  const m = phone.match(/^\+91(\d{5})(\d{5})$/);
  return m ? `+91 ${m[1]} ${m[2]}` : phone;
}

/** Whole-rupee integer from a user-typed string ("45,00,000" → 4500000); null when empty/invalid. */
export function parseMoneyInput(input: string): number | null {
  const digits = input.replace(/[^\d]/g, '');
  if (!digits) return null;
  const n = Number(digits);
  return Number.isSafeInteger(n) ? n : null;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
