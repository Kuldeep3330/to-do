import { z } from 'zod';
import { createZodDto } from '../../common/dto/zod-dto';

const money = z.number().int().min(0).max(10_000_000_000);

export const feeRuleSchema = z
  .object({
    method: z.enum(['FIXED', 'PERCENT']),
    value: z.number().positive().max(10_000_000_000),
    minFee: money.nullable().optional(),
    maxFee: money.nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (Math.round(v.value * 100) / 100 !== v.value) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'Use at most 2 decimal places' });
    }
    if (v.method === 'PERCENT' && v.value > 100) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['value'], message: 'A percentage cannot be more than 100' });
    }
    if (v.minFee != null && v.maxFee != null && v.minFee > v.maxFee) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['minFee'], message: 'The minimum cannot be more than the maximum' });
    }
  });

export class FeeRuleDto extends createZodDto(feeRuleSchema) {}

export type FeeRuleView = {
  intent: 'RENT' | 'BUY';
  method: 'FIXED' | 'PERCENT';
  value: number;
  minFee: number | null;
  maxFee: number | null;
  updatedAt: string;
};
