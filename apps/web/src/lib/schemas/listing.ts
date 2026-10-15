import { z } from 'zod';
import type { AdminListing } from '@/lib/api/types';

/** Whole-rupee amount typed with optional separators/₹: "45,00,000" → 4500000. "" → null. */
const money = (label: string, { min }: { min: number }) =>
  z
    .string()
    .trim()
    .transform((v) => v.replace(/[₹,\s]/g, ''))
    .transform((v) => (v === '' ? null : Number(v)))
    .pipe(
      z
        .number({ invalid_type_error: `${label} must be a number` })
        .int(`${label} must be a whole number`)
        .min(min, min > 0 ? `${label} must be greater than 0` : `${label} cannot be negative`)
        .refine((n) => Number.isSafeInteger(n), `${label} is too large`)
        .nullable(),
    );

const baseShape = {
  title: z.string().trim().min(1, 'Enter a title').max(160, 'Use at most 160 characters'),
  description: z.string().max(20000, 'Use at most 20,000 characters'),
  priceAmount: money('Price', { min: 1 }),
  maintenanceAmount: money('Maintenance', { min: 0 }),
  depositAmount: money('Deposit', { min: 0 }),
  negotiable: z.boolean(),
  availableFrom: z
    .string()
    .trim()
    .regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Use the date picker')
    .transform((v) => (v === '' ? null : v)),
};

export const listingEditSchema = z.object(baseShape);

export const listingCreateSchema = z.object({
  ...baseShape,
  propertyId: z.string().uuid('Select a property'),
  intent: z.enum(['BUY', 'RENT']),
});

export type ListingEditValues = z.input<typeof listingEditSchema>;
export type ListingEditOutput = z.output<typeof listingEditSchema>;
export type ListingCreateValues = z.input<typeof listingCreateSchema>;
export type ListingCreateOutput = z.output<typeof listingCreateSchema>;

export const LISTING_FIELDS = [
  'propertyId',
  'intent',
  'title',
  'description',
  'priceAmount',
  'maintenanceAmount',
  'depositAmount',
  'negotiable',
  'availableFrom',
] as const;

const s = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n));

export function emptyListingValues(propertyId = ''): ListingCreateValues {
  return {
    propertyId,
    intent: 'RENT',
    title: '',
    description: '',
    priceAmount: '',
    maintenanceAmount: '',
    depositAmount: '',
    negotiable: false,
    availableFrom: '',
  };
}

export function listingToEditValues(l: AdminListing): ListingEditValues {
  return {
    title: l.title,
    description: l.description,
    priceAmount: s(l.priceAmount),
    maintenanceAmount: s(l.maintenanceAmount),
    depositAmount: s(l.depositAmount),
    negotiable: l.negotiable,
    availableFrom: l.availableFrom ?? '',
  };
}

export function pricePeriodFor(intent: 'BUY' | 'RENT'): 'MONTHLY' | 'ONE_TIME' {
  return intent === 'RENT' ? 'MONTHLY' : 'ONE_TIME';
}

/** What must be true before the API will publish. Mirrors ListingsService.publish. */
export type PublishCheck = { key: string; label: string; ok: boolean };

export function publishChecklist(l: AdminListing): PublishCheck[] {
  return [
    { key: 'title', label: 'Has a title', ok: l.title.trim().length > 0 },
    { key: 'priceAmount', label: 'Price is set', ok: (l.priceAmount ?? 0) > 0 },
    { key: 'area', label: 'Property has an area', ok: (l.property.areaValue ?? 0) > 0 },
    { key: 'media', label: 'At least one photo', ok: l.originalCount >= 1 },
  ];
}
