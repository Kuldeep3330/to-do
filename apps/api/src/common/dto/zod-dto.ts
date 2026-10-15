import { ZodType, z } from 'zod';

export type ZodDtoCtor<T extends ZodType> = {
  readonly schema: T;
  new (): z.infer<T>;
};

export function createZodDto<T extends ZodType>(schema: T): ZodDtoCtor<T> {
  class ZodDto {
    static readonly schema = schema;
  }
  return ZodDto as unknown as ZodDtoCtor<T>;
}
