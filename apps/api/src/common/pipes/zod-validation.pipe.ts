import { ArgumentMetadata, Injectable, PipeTransform } from '@nestjs/common';
import { ZodType } from 'zod';
import { AppError } from '../errors/app-error';

@Injectable()
export class ZodValidationPipe implements PipeTransform {
  transform(value: unknown, metadata: ArgumentMetadata): unknown {
    const schema = (metadata.metatype as { schema?: ZodType } | undefined)?.schema;
    if (!schema) {
      return value;
    }
    const result = schema.safeParse(value);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({
        path: i.path.join('.'),
        message: i.message,
      }));
      throw AppError.validation('Invalid input', details);
    }
    return result.data;
  }
}
