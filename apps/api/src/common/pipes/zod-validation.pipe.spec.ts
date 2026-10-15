import { ArgumentMetadata } from '@nestjs/common';
import { z } from 'zod';
import { createZodDto } from '../dto/zod-dto';
import { AppError } from '../errors/app-error';
import { ZodValidationPipe } from './zod-validation.pipe';

const schema = z.object({ name: z.string().min(1), age: z.coerce.number().int() });
class SampleDto extends createZodDto(schema) {}

const meta: ArgumentMetadata = { type: 'body', metatype: SampleDto };

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe();

  it('returns parsed data for valid input', () => {
    expect(pipe.transform({ name: 'A', age: '3' }, meta)).toEqual({ name: 'A', age: 3 });
  });

  it('throws VALIDATION_ERROR with details for invalid input', () => {
    try {
      pipe.transform({ name: '', age: 'x' }, meta);
      fail('expected throw');
    } catch (e) {
      expect(e).toBeInstanceOf(AppError);
      const err = e as AppError;
      expect(err.code).toBe('VALIDATION_ERROR');
      expect(err.status).toBe(400);
      expect(err.details.length).toBeGreaterThan(0);
    }
  });

  it('passes through when metatype has no schema', () => {
    const passthrough: ArgumentMetadata = { type: 'body', metatype: Object };
    const value = { anything: true };
    expect(pipe.transform(value, passthrough)).toBe(value);
  });
});
