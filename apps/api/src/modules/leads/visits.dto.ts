import { z } from 'zod';
import { createZodDto } from '../../common/dto/zod-dto';
import { paginationQuerySchema } from '../../common/dto/pagination';

const visitSlot = z.enum(['ANY', 'MORNING', 'AFTERNOON', 'EVENING']);
const visitStatus = z.enum(['REQUESTED', 'CONFIRMED', 'COMPLETED', 'NO_SHOW', 'CANCELLED']);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD');

export const createVisitSchema = z.object({
  listingId: z.string().uuid(),
  preferredDate: isoDate.optional(),
  preferredSlot: visitSlot.default('ANY'),
  notes: z.string().trim().max(1000).optional(),
});

export const confirmVisitSchema = z.object({
  preferredDate: isoDate.optional(),
  preferredSlot: visitSlot.optional(),
});

export const adminVisitListQuerySchema = paginationQuerySchema.extend({
  status: visitStatus.optional(),
});

export class CreateVisitDto extends createZodDto(createVisitSchema) {}
export class ConfirmVisitDto extends createZodDto(confirmVisitSchema) {}
export class AdminVisitListQueryDto extends createZodDto(adminVisitListQuerySchema) {}
export class MeVisitListQueryDto extends createZodDto(paginationQuerySchema) {}
