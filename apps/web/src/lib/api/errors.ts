export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'UNAUTHENTICATED'
  | 'INVALID_CREDENTIALS'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'PAYLOAD_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA'
  | 'RATE_LIMITED'
  | 'INTERNAL_ERROR'
  | 'NETWORK_ERROR';

export type FieldIssue = { field: string; message: string };

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: FieldIssue[];

  constructor(code: ErrorCode, status: number, message: string, details: FieldIssue[] = []) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

const FRIENDLY: Record<ErrorCode, string> = {
  VALIDATION_ERROR: 'Please check the highlighted fields and try again.',
  UNAUTHENTICATED: 'Your session has expired. Please sign in again.',
  INVALID_CREDENTIALS: 'Incorrect email or password.',
  FORBIDDEN: 'You do not have permission to do that.',
  NOT_FOUND: 'We could not find what you were looking for.',
  CONFLICT: 'That conflicts with the current state. Refresh and try again.',
  PAYLOAD_TOO_LARGE: 'That file is too large.',
  UNSUPPORTED_MEDIA: 'That file type is not supported.',
  RATE_LIMITED: 'Too many attempts. Please wait a moment and try again.',
  INTERNAL_ERROR: 'Something went wrong on our side. Please try again.',
  NETWORK_ERROR: 'Could not reach the server. Check your connection and try again.',
};

/** User-facing message for any thrown value. */
export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.code === 'CONFLICT' || err.code === 'VALIDATION_ERROR') {
      return err.message && err.message !== 'Invalid input' ? err.message : FRIENDLY[err.code];
    }
    return FRIENDLY[err.code] ?? err.message;
  }
  return FRIENDLY.INTERNAL_ERROR;
}

type ErrorEnvelope = {
  error?: { code?: string; message?: string; details?: unknown[] };
};

export function parseErrorBody(status: number, body: unknown): ApiError {
  const env = (body ?? {}) as ErrorEnvelope;
  const code = (env.error?.code as ErrorCode | undefined) ?? statusToCode(status);
  const details: FieldIssue[] = Array.isArray(env.error?.details)
    ? env.error.details.flatMap((d) => {
        // The API emits { path, message }; older docs say { field, message }. Accept both.
        const x = d as { path?: unknown; field?: unknown; message?: unknown };
        const field = typeof x.path === 'string' ? x.path : typeof x.field === 'string' ? x.field : null;
        return field !== null && typeof x.message === 'string' ? [{ field, message: x.message }] : [];
      })
    : [];
  return new ApiError(code, status, env.error?.message ?? FRIENDLY[code], details);
}

function statusToCode(status: number): ErrorCode {
  if (status === 400) return 'VALIDATION_ERROR';
  if (status === 401) return 'UNAUTHENTICATED';
  if (status === 403) return 'FORBIDDEN';
  if (status === 404) return 'NOT_FOUND';
  if (status === 409) return 'CONFLICT';
  if (status === 413) return 'PAYLOAD_TOO_LARGE';
  if (status === 415) return 'UNSUPPORTED_MEDIA';
  if (status === 429) return 'RATE_LIMITED';
  return 'INTERNAL_ERROR';
}

/** Per-requirement messages the API attaches to a failed command (e.g. publish requirements). */
export function errorDetailMessages(err: unknown): string[] {
  return err instanceof ApiError ? err.details.map((d) => d.message) : [];
}
