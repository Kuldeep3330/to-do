import { z } from 'zod';
import { createZodDto } from '../../common/dto/zod-dto';
import { paginationQuerySchema } from '../../common/dto/pagination';

const intent = z.enum(['BUY', 'RENT']);
const pricePeriod = z.enum(['MONTHLY', 'ONE_TIME']);
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const positiveMoney = z
  .number()
  .int()
  .positive()
  .refine((v) => Number.isSafeInteger(v), { message: 'Money must be a safe integer' });

const nonnegativeMoney = z
  .number()
  .int()
  .nonnegative()
  .refine((v) => Number.isSafeInteger(v), { message: 'Money must be a safe integer' });

export const createListingSchema = z
  .object({
    propertyId: z.string().uuid(),
    intent,
    title: z.string().min(1).max(160),
    description: z.string().max(20000).optional(),
    priceAmount: positiveMoney.nullable().optional(),
    pricePeriod,
    maintenanceAmount: nonnegativeMoney.nullable().optional(),
    depositAmount: nonnegativeMoney.nullable().optional(),
    negotiable: z.boolean().optional(),
    availableFrom: dateOnly.nullable().optional(),
  })
  .refine(
    (v) =>
      (v.intent === 'RENT' && v.pricePeriod === 'MONTHLY') ||
      (v.intent === 'BUY' && v.pricePeriod === 'ONE_TIME'),
    {
      message: 'RENT requires MONTHLY and BUY requires ONE_TIME',
      path: ['pricePeriod'],
    },
  );

export const patchListingSchema = z.object({
  title: z.string().min(1).max(160).optional(),
  description: z.string().max(20000).optional(),
  priceAmount: positiveMoney.nullable().optional(),
  maintenanceAmount: nonnegativeMoney.nullable().optional(),
  depositAmount: nonnegativeMoney.nullable().optional(),
  negotiable: z.boolean().optional(),
  availableFrom: dateOnly.nullable().optional(),
});

export const adminListingListQuerySchema = paginationQuerySchema.extend({
  propertyId: z.string().uuid().optional(),
  intent: intent.optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'PAUSED', 'CLOSED']).optional(),
  q: z.string().min(2).max(80).optional(),
});

export const searchListingsQuerySchema = paginationQuerySchema.extend({
  intent: intent.optional(),
  city: z.string().min(1).max(80).optional(),
  locality: z.string().min(1).max(80).optional(),
  type: z.enum(['RESIDENTIAL', 'COMMERCIAL', 'PLOT']).optional(),
  bedrooms: z.coerce.number().int().min(0).max(50).optional(),
  bedroomsMin: z.coerce.number().int().min(0).max(50).optional(),
  minPrice: z.coerce.number().int().nonnegative().optional(),
  maxPrice: z.coerce.number().int().nonnegative().optional(),
  minArea: z.coerce.number().positive().optional(),
  maxArea: z.coerce.number().positive().optional(),
  furnishing: z.enum(['UNFURNISHED', 'SEMI', 'FURNISHED']).optional(),
  q: z.string().min(2).max(80).optional(),
  sort: z.enum(['newest', 'price_asc', 'price_desc']).default('newest'),
});

export class CreateListingDto extends createZodDto(createListingSchema) {}
export class PatchListingDto extends createZodDto(patchListingSchema) {}
export class AdminListingListQueryDto extends createZodDto(adminListingListQuerySchema) {}
export class SearchListingsQueryDto extends createZodDto(searchListingsQuerySchema) {}
