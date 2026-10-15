import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Response } from 'express';
import { MulterError } from 'multer';
import { AppError, ErrorCode } from '../errors/app-error';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<{ headers?: Record<string, unknown>; requestId?: string }>();
    const requestId = (req.requestId as string | undefined) ?? (req.headers?.['x-request-id'] as string | undefined);

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code: ErrorCode = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred';
    let details: unknown[] = [];

    if (exception instanceof AppError) {
      status = exception.status;
      code = exception.code;
      message = exception.message;
      details = exception.details;
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        status = 409;
        code = 'CONFLICT';
        message = 'Conflict';
      } else if (exception.code === 'P2025') {
        status = 404;
        code = 'NOT_FOUND';
        message = 'Not found';
      } else if (exception.code === 'P2003') {
        status = 400;
        code = 'VALIDATION_ERROR';
        message = 'Invalid input';
      }
    } else if (exception instanceof MulterError) {
      if (exception.code === 'LIMIT_FILE_SIZE') {
        status = 413;
        code = 'PAYLOAD_TOO_LARGE';
        message = 'Image exceeds 8 MB';
      } else {
        status = 400;
        code = 'VALIDATION_ERROR';
        message = 'Invalid upload';
      }
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (status === 401) {
        code = 'UNAUTHENTICATED';
        message = 'Authentication required';
      } else if (status === 403) {
        code = 'FORBIDDEN';
        message = 'Forbidden';
      } else if (status === 404) {
        code = 'NOT_FOUND';
        message = 'Not found';
      } else if (status === 429) {
        code = 'RATE_LIMITED';
        message = 'Too many requests';
      } else if (status === 413) {
        code = 'PAYLOAD_TOO_LARGE';
        message = 'Payload too large';
      } else if (status >= 400 && status < 500) {
        code = 'VALIDATION_ERROR';
        message = typeof body === 'string' ? body : exception.message;
      }
    }

    if (status >= 500) {
      this.logger.error(
        exception instanceof Error ? exception.stack ?? exception.message : String(exception),
        undefined,
        requestId,
      );
    } else if (code === 'INVALID_CREDENTIALS' || code === 'RATE_LIMITED' || code === 'UNAUTHENTICATED') {
      this.logger.warn(`${code} ${status}`);
    }

    res.status(status).json({
      error: {
        code,
        message,
        details,
        ...(requestId ? { requestId } : {}),
      },
    });
  }
}
