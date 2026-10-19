import { z } from 'zod';
import { parseMoneyInput } from '@/lib/format';

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Calendar date (YYYY-MM-DD) in India. Matches the day the API treats as "today". */
export function istToday(now = new Date()): string {
  return new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/**
 * Closing value and day for a won lead.
 * `earliest` is the day the enquiry arrived: a deal cannot close before it.
 */
export function createDealSchema(earliest: string, now = new Date()) {
  const today = istToday(now);
  return z.object({
    amount: z
      .string()
      .trim()
      .min(1, 'Enter the amount agreed')
      .refine((v) => parseMoneyInput(v) !== null, 'Enter a valid amount')
      .refine((v) => (parseMoneyInput(v) ?? 0) > 0, 'Amount must be more than zero')
      .refine((v) => (parseMoneyInput(v) ?? 0) <= 100_000_000_000, 'That amount looks too large')
      .transform((v) => parseMoneyInput(v) as number),
    closedOn: z
      .string()
      .min(1, 'Choose the closing date')
      .refine((v) => v <= today, 'A deal cannot close in the future')
      .refine((v) => v >= earliest, 'The deal cannot close before the enquiry arrived'),
  });
}

export type DealValues = z.input<ReturnType<typeof createDealSchema>>;
export type DealOutput = z.output<ReturnType<typeof createDealSchema>>;
