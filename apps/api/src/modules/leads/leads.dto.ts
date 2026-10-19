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
  /** "true" limits the list to leads still waiting past the response target. */
  overdue: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => v === 'true'),
});

export const patchLeadSchema = z.object({
  status: leadStatus.optional(),
  assignedToUserId: z.string().uuid().nullable().optional(),
  /** Deal value in whole INR: monthly rent for a rental, sale price for a purchase. Only for won leads. */
  closedAmount: z.number().int().positive().max(100_000_000_000).optional(),
  /** What NCR Homes earns on this deal (INR). Admins only; omit to use the fee rule. */
  feeAmount: z.number().int().min(0).max(10_000_000_000).optional(),
  /** Day the deal closed, YYYY-MM-DD. Defaults to today. */
  closedOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD')
    .optional(),
});

export class CreateLeadDto extends createZodDto(createLeadSchema) {}
export class AdminLeadListQueryDto extends createZodDto(adminLeadListQuerySchema) {}
export class PatchLeadDto extends createZodDto(patchLeadSchema) {}
