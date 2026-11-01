import { z } from 'zod';
import { createZodDto } from '../../common/dto/zod-dto';

export const submitAssessmentSchema = z
  .object({
    answers: z
      .record(z.string().max(40), z.unknown())
      .refine((a) => Object.keys(a).length <= 40, 'Too many answers'),
    /** Attach the result to the signed-in account. Never required. */
    saveToAccount: z.boolean().optional(),
  })
  .strict();

export class SubmitAssessmentDto extends createZodDto(submitAssessmentSchema) {}
