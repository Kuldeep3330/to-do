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
  | 'INTERNAL_ERROR';

const HTTP_BY_CODE: Record<ErrorCode, number> = {
  VALIDATION_ERROR: 400,
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PAYLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA: 415,
  RATE_LIMITED: 429,
  INTERNAL_ERROR: 500,
};

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details: unknown[];

  constructor(code: ErrorCode, message: string, details: unknown[] = []) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = HTTP_BY_CODE[code];
    this.details = details;
  }

  static validation(message = 'Invalid input', details: unknown[] = []): AppError {
    return new AppError('VALIDATION_ERROR', message, details);
  }

  static unauthenticated(message = 'Authentication required'): AppError {
    return new AppError('UNAUTHENTICATED', message);
  }

  static invalidCredentials(): AppError {
    return new AppError('INVALID_CREDENTIALS', 'Invalid email or password');
  }

  static forbidden(message = 'Forbidden'): AppError {
    return new AppError('FORBIDDEN', message);
  }

  static notFound(message = 'Not found'): AppError {
    return new AppError('NOT_FOUND', message);
  }

  static conflict(message = 'Conflict'): AppError {
    return new AppError('CONFLICT', message);
  }

  static payloadTooLarge(message = 'Payload too large'): AppError {
    return new AppError('PAYLOAD_TOO_LARGE', message);
  }

  static unsupportedMedia(message = 'Unsupported media type'): AppError {
    return new AppError('UNSUPPORTED_MEDIA', message);
  }

  static rateLimited(): AppError {
    return new AppError('RATE_LIMITED', 'Too many requests');
  }
}
