import { z } from 'zod';
import { createZodDto } from '../../common/dto/zod-dto';
import { paginationQuerySchema } from '../../common/dto/pagination';
import { emailSchema, phoneSchema } from '../auth/auth.dto';

const leadStatus = z.enum([
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'UNQUALIFIED',
  'VISIT_SCHEDULED',
  'WON',
  'LOST',
  'SPAM',
]);

export const createLeadSchema = z
  .object({
    listingId: z.string().uuid().optional(),
    listingSlug: z.string().min(1).max(180).optional(),
    name: z.string().min(2).max(80),
    phone: phoneSchema,
    email: emailSchema.optional(),
    message: z.string().max(1000).optional(),
  })
  .refine((v) => Boolean(v.listingId || v.listingSlug), {
    message: 'Provide listingId or listingSlug',
    path: ['listingId'],
  });

export const adminLeadListQuerySchema = paginationQuerySchema.extend({
  status: leadStatus.optional(),
  assignedTo: z.string().uuid().optional(),
});

export const patchLeadSchema = z.object({
  status: leadStatus.optional(),
  assignedToUserId: z.string().uuid().nullable().optional(),
});

export class CreateLeadDto extends createZodDto(createLeadSchema) {}
export class AdminLeadListQueryDto extends createZodDto(adminLeadListQuerySchema) {}
export class PatchLeadDto extends createZodDto(patchLeadSchema) {}
