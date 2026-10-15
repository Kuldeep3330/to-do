import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { AppError } from '../../common/errors/app-error';
import { clientIp } from '../../common/rate-limit/client-ip';
import { SlidingWindowLimiter } from '../../common/rate-limit/sliding-window';

const LOGIN_MAX = 10;
const LOGIN_WINDOW_MS = 10 * 60 * 1000;
const REGISTER_MAX = 5;
const REGISTER_WINDOW_MS = 60 * 60 * 1000;
const FORGOT_MAX = 10;
const FORGOT_WINDOW_MS = 15 * 60 * 1000;

@Injectable()
export class AuthRateLimitGuard implements CanActivate {
  private readonly limiter = new SlidingWindowLimiter();

  canActivate(context: ExecutionContext): boolean {
    if (process.env.RATE_LIMIT_ENABLED === 'false') {
      return true;
    }
    const req = context.switchToHttp().getRequest<Request>();
    const ip = clientIp(req);
    if (!ip) {
      throw AppError.rateLimited();
    }
    const path = req.path || req.url || '';
    if (path.includes('register')) {
      if (!this.limiter.allow(`register:${ip}`, REGISTER_MAX, REGISTER_WINDOW_MS)) {
        throw AppError.rateLimited();
      }
    } else if (path.includes('forgot-password')) {
      if (!this.limiter.allow(`forgot:${ip}`, FORGOT_MAX, FORGOT_WINDOW_MS)) {
        throw AppError.rateLimited();
      }
    } else {
      if (!this.limiter.allow(`login:${ip}`, LOGIN_MAX, LOGIN_WINDOW_MS)) {
        throw AppError.rateLimited();
      }
    }
    return true;
  }
}
