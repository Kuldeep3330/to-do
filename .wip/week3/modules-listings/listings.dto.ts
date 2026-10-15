import { z } from 'zod';
import { createZodDto } from '../../common/dto/zod-dto';
import { paginationQuerySchema } from '../../common/dto/pagination';

const intent = z.enum(['BUY', 'RENT']);
const pricePeriod = z.enum(['MONTHLY', 'ONE_TIME']);
const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const safeMoney = z
  .number()
  .int()
  .refine((v) => Number.isSafeInteger(v), { message: 'Money must be a safe integer' });

const listingFields = {
  intent,
  title: z.string().min(1).max(160),
  description: z.string().max(20000).optional(),
  priceAmount: safeMoney.positive().nullable().optional(),
  pricePeriod,
  maintenanceAmount: safeMoney.nonnegative().nullable().optional(),
  depositAmount: safeMoney.nonnegative().nullable().optional(),
  negotiable: z.boolean().optional(),
  availableFrom: dateOnly.nullable().optional(),
};

function checkPeriodMatch(v: { intent?: 'BUY' | 'RENT'; pricePeriod?: 'MONTHLY' | 'ONE_TIME' }) {
  if (v.intent && v.pricePeriod) {
    return (v.intent === 'RENT' && v.pricePeriod === 'MONTHLY') || (v.intent === 'BUY' && v.pricePeriod === 'ONE_TIME');
  }
  return true;
}

export const createListingSchema = z
  .object({
    propertyId: z.string().uuid(),
    ...listingFields,
  })
  .refine(checkPeriodMatch, {
    message: 'RENT requires MONTHLY and BUY requires ONE_TIME',
    path: ['pricePeriod'],
  });

export const patchListingSchema = z
  .object({
    title: z.string().min(1).max(160).optional(),
    description: z.string().max(20000).optional(),
    priceAmount: safeMoney.positive().nullable().optional(),
    maintenanceAmount: safeMoney.nonnegative().nullable().optional(),
    depositAmount: safeMoney.nonnegative().nullable().optional(),
    negotiable: z.boolean().optional(),
    availableFrom: dateOnly.nullable().optional(),
  });

export const adminListingListQuerySchema = paginationQuerySchema.extend({
  propertyId: z.string().uuid().optional(),
  intent: intent.optional(),
  status: z.enum(['DRAFT', 'PUBLISHED', 'PAUSED', 'CLOSED']).optional(),
});

export const searchQuerySchema = z.object({
  intent: intent.optional(),
  city: z.string().min(1).max(80).optional(),
  locality: z.string().min(1).max(120).optional(),
  type: z.enum(['RESIDENTIAL', 'COMMERCIAL', 'PLOT']).optional(),
  bedrooms: z.coerce.number().int().min(0).max(50).optional(),
  bedroomsMin: z.coerce.number().int().min(0).max(50).optional(),
  minPrice: z.coerce.number().int().nonnegative().optional(),
  maxPrice: z.coerce.number().int().positive().optional(),
  minArea: z.coerce.number().nonnegative().optional(),
  maxArea: z.coerce.number().positive().optional(),
  furnishing: z.enum(['UNFURNISHED', 'SEMI', 'FURNISHED']).optional(),
  q: z.string().min(2).max(80).optional(),
  sort: z.enum(['newest', 'price_asc', 'price_desc']).default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(24).default(24),
});

export class CreateListingDto extends createZodDto(createListingSchema) {}
export class PatchListingDto extends createZodDto(patchListingSchema) {}
export class AdminListingListQueryDto extends createZodDto(adminListingListQuerySchema) {}
export class SearchQueryDto extends createZodDto(searchQuerySchema) {}
