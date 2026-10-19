import { z } from 'zod';
import type { VisitSlot } from '@/lib/api/types';

export const VISIT_SLOTS: { value: VisitSlot; label: string }[] = [
  { value: 'ANY', label: 'Any time' },
  { value: 'MORNING', label: 'Morning (9am to 12pm)' },
  { value: 'AFTERNOON', label: 'Afternoon (12pm to 4pm)' },
  { value: 'EVENING', label: 'Evening (4pm to 7pm)' },
];

export const MAX_DAYS_AHEAD = 30;
export const NOTES_MAX = 1000;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Calendar date (YYYY-MM-DD) in India, `daysFromToday` days from now. Matches the API's date window. */
export function istDate(daysFromToday = 0, now = new Date()): string {
  return new Date(now.getTime() + IST_OFFSET_MS + daysFromToday * 86_400_000).toISOString().slice(0, 10);
}

export function createVisitSchema(now = new Date()) {
  const first = istDate(0, now);
  const last = istDate(MAX_DAYS_AHEAD, now);
  return z.object({
    // Optional: an empty date means "any day, call me to agree".
    preferredDate: z
      .string()
      .refine((v) => v === '' || (v >= first && v <= last), `Choose a date between today and ${last}`)
      .transform((v) => (v === '' ? undefined : v)),
    preferredSlot: z.enum(['ANY', 'MORNING', 'AFTERNOON', 'EVENING']),
    notes: z
      .string()
      .trim()
      .max(NOTES_MAX, `Use at most ${NOTES_MAX} characters`)
      .transform((v) => (v === '' ? undefined : v)),
  });
}

export type VisitValues = z.input<ReturnType<typeof createVisitSchema>>;
export type VisitOutput = z.output<ReturnType<typeof createVisitSchema>>;
