import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError, errorMessage } from '@/lib/api/errors';

/**
 * Map an API validation error onto form fields. Returns a message for the form-level
 * banner when the error could not be attached to a specific field.
 */
export function applyApiError<T extends FieldValues>(
  err: unknown,
  setError: UseFormSetError<T>,
  knownFields: readonly string[],
): string | null {
  if (err instanceof ApiError && err.code === 'VALIDATION_ERROR' && err.details.length > 0) {
    let unattached = false;
    for (const d of err.details) {
      if (knownFields.includes(d.field)) {
        setError(d.field as Path<T>, { type: 'server', message: d.message });
      } else {
        unattached = true;
      }
    }
    return unattached ? errorMessage(err) : null;
  }
  return errorMessage(err);
}
