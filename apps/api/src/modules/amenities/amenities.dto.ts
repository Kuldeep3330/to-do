import { z } from 'zod';
import { createZodDto } from '../../common/dto/zod-dto';

export const createAmenitySchema = z.object({
  code: z.string().min(1).max(50).regex(/^[a-z0-9_]+$/),
  name: z.string().min(1).max(80),
  isActive: z.boolean().optional(),
});

export const patchAmenitySchema = z.object({
  name: z.string().min(1).max(80).optional(),
  isActive: z.boolean().optional(),
});

export class CreateAmenityDto extends createZodDto(createAmenitySchema) {}
export class PatchAmenityDto extends createZodDto(patchAmenitySchema) {}
