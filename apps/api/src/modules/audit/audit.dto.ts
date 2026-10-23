import { z } from 'zod';
import { createZodDto } from '../../common/dto/zod-dto';
import { paginationQuerySchema } from '../../common/dto/pagination';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD');

export const auditListQuerySchema = paginationQuerySchema.extend({
  action: z.string().trim().min(1).max(80).optional(),
  entityType: z.string().trim().min(1).max(80).optional(),
  entityId: z.string().uuid().optional(),
  actorId: z.string().uuid().optional(),
  /** First day to include, YYYY-MM-DD in India time. */
  from: day.optional(),
  /** Last day to include, YYYY-MM-DD in India time. */
  to: day.optional(),
});

export class AuditListQueryDto extends createZodDto(auditListQuerySchema) {}
