import { z } from 'zod';
import { createZodDto } from '../../common/dto/zod-dto';

export const patchMediaSchema = z.object({
  sortOrder: z.number().int().min(0).max(10_000),
});

export class PatchMediaDto extends createZodDto(patchMediaSchema) {}

export type AdminMedia = {
  id: string;
  listingId: string;
  url: string;
  contentType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  sortOrder: number;
  variant: 'ORIGINAL' | 'CARD' | 'DETAIL';
  createdAt: string;
};
