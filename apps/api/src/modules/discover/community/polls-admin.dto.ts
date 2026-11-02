import { z } from 'zod';
import { createZodDto } from '../../../common/dto/zod-dto';

const optionLabel = z.string().trim().min(1, 'Option cannot be empty').max(120);

const options = z
  .array(optionLabel)
  .min(2, 'Add at least 2 options')
  .max(6, 'Use at most 6 options')
  .refine((all) => new Set(all.map((o) => o.toLowerCase())).size === all.length, 'Options must be different');

const question = z.string().trim().min(8, 'Write the full question').max(200);
const when = z.coerce.date().nullable();

export const createPollSchema = z
  .object({ question, options, opensAt: when.optional(), closesAt: when.optional() })
  .strict();

export const patchPollSchema = z
  .object({ question: question.optional(), options: options.optional(), opensAt: when.optional(), closesAt: when.optional() })
  .strict()
  .refine((p) => Object.keys(p).length > 0, 'Nothing to change');

export class CreatePollDto extends createZodDto(createPollSchema) {}
export class PatchPollDto extends createZodDto(patchPollSchema) {}
