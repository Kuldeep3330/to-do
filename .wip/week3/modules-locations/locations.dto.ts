import { z } from 'zod';
import { createZodDto } from '../../common/dto/zod-dto';

export const createCitySchema = z.object({
  name: z.string().min(1).max(80),
  slug: z.string().min(1).max(80).regex(/^[a-z0-9-]+$/),
  isActive: z.boolean().optional(),
});

export const patchCitySchema = z.object({
  name: z.string().min(1).max(80).optional(),
  isActive: z.boolean().optional(),
});

export const createLocalitySchema = z.object({
  cityId: z.string().uuid(),
  name: z.string().min(1).max(120),
  slug: z.string().min(1).max(120).regex(/^[a-z0-9-]+$/),
  isActive: z.boolean().optional(),
  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

export const patchLocalitySchema = z.object({
  name: z.string().min(1).max(120).optional(),
  isActive: z.boolean().optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
});

export class CreateCityDto extends createZodDto(createCitySchema) {}
export class PatchCityDto extends createZodDto(patchCitySchema) {}
export class CreateLocalityDto extends createZodDto(createLocalitySchema) {}
export class PatchLocalityDto extends createZodDto(patchLocalitySchema) {}
