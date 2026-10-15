import { z } from 'zod';
import { AppError } from '../errors/app-error';

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(24).default(24),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export function offsetOf(page: number, pageSize: number): number {
  return (page - 1) * pageSize;
}

export function publicOffsetOrThrow(page: number, pageSize: number): number {
  const offset = offsetOf(page, pageSize);
  if (offset > 1000) {
    throw AppError.validation('Offset too large');
  }
  return offset;
}
