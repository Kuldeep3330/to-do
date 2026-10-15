import { z } from 'zod';
import { createZodDto } from '../../common/dto/zod-dto';
import { paginationQuerySchema } from '../../common/dto/pagination';

const propertyType = z.enum(['RESIDENTIAL', 'COMMERCIAL', 'PLOT']);
const furnishing = z.enum(['UNFURNISHED', 'SEMI', 'FURNISHED']);

const baseFields = {
  type: propertyType,
  cityId: z.string().uuid(),
  localityId: z.string().uuid(),
  societyName: z.string().max(160).nullable().optional(),
  addressText: z.string().max(500).nullable().optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  areaValue: z.number().positive().max(9_999_999_999.99).nullable().optional(),
  bedrooms: z.number().int().min(0).max(50).nullable().optional(),
  bathrooms: z.number().int().min(0).max(50).nullable().optional(),
  balconies: z.number().int().min(0).max(50).nullable().optional(),
  floor: z.number().int().min(-5).max(500).nullable().optional(),
  totalFloors: z.number().int().min(0).max(500).nullable().optional(),
  furnishing: furnishing.nullable().optional(),
  facing: z.string().max(30).nullable().optional(),
  ageYears: z.number().int().min(0).max(200).nullable().optional(),
  parkingCount: z.number().int().min(0).max(50).nullable().optional(),
  internalTitle: z.string().min(1).max(160),
  amenityIds: z.array(z.string().uuid()).max(50).optional(),
};

export const createPropertySchema = z
  .object(baseFields)
  .refine((v) => (v.lat == null) === (v.lng == null), {
    message: 'lat and lng must both be set or both omitted',
    path: ['lat'],
  });

export const patchPropertySchema = z
  .object({
    ...baseFields,
    type: propertyType.optional(),
    cityId: z.string().uuid().optional(),
    localityId: z.string().uuid().optional(),
    internalTitle: z.string().min(1).max(160).optional(),
  })
  .refine((v) => (v.lat == null) === (v.lng == null), {
    message: 'lat and lng must both be set or both omitted',
    path: ['lat'],
  });

export const propertyListQuerySchema = paginationQuerySchema.extend({
  cityId: z.string().uuid().optional(),
  type: propertyType.optional(),
  status: z.enum(['ACTIVE', 'ARCHIVED']).optional(),
  q: z.string().min(2).max(80).optional(),
});

export class CreatePropertyDto extends createZodDto(createPropertySchema) {}
export class PatchPropertyDto extends createZodDto(patchPropertySchema) {}
export class PropertyListQueryDto extends createZodDto(propertyListQuerySchema) {}
