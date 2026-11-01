import { z } from 'zod';
import { createZodDto } from '../../common/dto/zod-dto';
import { emailSchema, phoneSchema } from '../auth/auth.dto';

export const createOwnerEnquirySchema = z.object({
  intent: z.enum(['BUY', 'RENT']),
  city: z.string().trim().min(2).max(80),
  locality: z
    .string()
    .trim()
    .max(80)
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
  name: z.string().trim().min(2).max(80),
  phone: phoneSchema,
  email: emailSchema.optional(),
  message: z
    .string()
    .trim()
    .max(1000)
    .optional()
    .transform((v) => (v === '' ? undefined : v)),
});

export class CreateOwnerEnquiryDto extends createZodDto(createOwnerEnquirySchema) {}
