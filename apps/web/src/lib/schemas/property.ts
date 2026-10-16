import { z } from 'zod';
import type { AdminProperty } from '@/lib/api/types';

/** Optional integer typed into a text box: "" → null, otherwise a bounded integer. */
const optInt = (min: number, max: number, label: string) =>
  z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : Number(v)))
    .pipe(
      z
        .number({ invalid_type_error: `${label} must be a number` })
        .int(`${label} must be a whole number`)
        .min(min, `${label} must be at least ${min}`)
        .max(max, `${label} must be at most ${max}`)
        .nullable(),
    );

const optDecimal = (min: number, max: number, label: string, positive = false) =>
  z
    .string()
    .trim()
    .transform((v) => (v === '' ? null : Number(v)))
    .pipe(
      z
        .number({ invalid_type_error: `${label} must be a number` })
        .min(min, `${label} must be at least ${min}`)
        .max(max, `${label} must be at most ${max}`)
        .refine((n) => !positive || n > 0, `${label} must be greater than 0`)
        .nullable(),
    );

const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use at most ${max} characters`)
    .transform((v) => (v === '' ? null : v));

export const propertyFormSchema = z
  .object({
    internalTitle: z.string().trim().min(1, 'Enter an internal title').max(160),
    type: z.enum(['RESIDENTIAL', 'COMMERCIAL', 'PLOT']),
    cityId: z.string().uuid('Select a city'),
    localityId: z.string().uuid('Select a locality'),
    societyName: optText(160),
    addressText: optText(500),
    lat: optDecimal(-90, 90, 'Latitude'),
    lng: optDecimal(-180, 180, 'Longitude'),
    areaValue: optDecimal(0, 9_999_999_999.99, 'Area', true),
    bedrooms: optInt(0, 50, 'Bedrooms'),
    bathrooms: optInt(0, 50, 'Bathrooms'),
    balconies: optInt(0, 50, 'Balconies'),
    floor: optInt(-5, 500, 'Floor'),
    totalFloors: optInt(0, 500, 'Total floors'),
    furnishing: z
      .enum(['', 'UNFURNISHED', 'SEMI', 'FURNISHED'])
      .transform((v) => (v === '' ? null : v)),
    facing: optText(30),
    ageYears: optInt(0, 200, 'Age'),
    parkingCount: optInt(0, 50, 'Parking'),
    amenityIds: z.array(z.string().uuid()).max(50, 'Select at most 50 amenities'),
  })
  .refine((v) => (v.lat === null) === (v.lng === null), {
    path: ['lat'],
    message: 'Enter both latitude and longitude, or leave both empty',
  });

export type PropertyFormValues = z.input<typeof propertyFormSchema>;
export type PropertyFormOutput = z.output<typeof propertyFormSchema>;

export const PROPERTY_FIELDS = [
  'internalTitle',
  'type',
  'cityId',
  'localityId',
  'societyName',
  'addressText',
  'lat',
  'lng',
  'areaValue',
  'bedrooms',
  'bathrooms',
  'balconies',
  'floor',
  'totalFloors',
  'furnishing',
  'facing',
  'ageYears',
  'parkingCount',
  'amenityIds',
] as const;

const s = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n));

export function emptyPropertyValues(): PropertyFormValues {
  return {
    internalTitle: '',
    type: 'RESIDENTIAL',
    cityId: '',
    localityId: '',
    societyName: '',
    addressText: '',
    lat: '',
    lng: '',
    areaValue: '',
    bedrooms: '',
    bathrooms: '',
    balconies: '',
    floor: '',
    totalFloors: '',
    furnishing: '',
    facing: '',
    ageYears: '',
    parkingCount: '',
    amenityIds: [],
  };
}

export function propertyToFormValues(p: AdminProperty): PropertyFormValues {
  return {
    internalTitle: p.internalTitle,
    type: p.type,
    cityId: p.cityId,
    localityId: p.localityId,
    societyName: p.societyName ?? '',
    addressText: p.addressText ?? '',
    lat: s(p.lat),
    lng: s(p.lng),
    areaValue: s(p.areaValue),
    bedrooms: s(p.bedrooms),
    bathrooms: s(p.bathrooms),
    balconies: s(p.balconies),
    floor: s(p.floor),
    totalFloors: s(p.totalFloors),
    furnishing: p.furnishing ?? '',
    facing: p.facing ?? '',
    ageYears: s(p.ageYears),
    parkingCount: s(p.parkingCount),
    amenityIds: p.amenityIds,
  };
}
