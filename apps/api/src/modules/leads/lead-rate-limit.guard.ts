import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { AppError } from '../../common/errors/app-error';
import { clientIp } from '../../common/rate-limit/client-ip';
import { SlidingWindowLimiter } from '../../common/rate-limit/sliding-window';

const IP_MAX = 5;
const IP_WINDOW_MS = 10 * 60 * 1000;
const PHONE_MAX = 3;
const PHONE_WINDOW_MS = 60 * 60 * 1000;

@Injectable()
export class LeadRateLimitGuard implements CanActivate {
  private readonly limiter = new SlidingWindowLimiter();

  canActivate(context: ExecutionContext): boolean {
    if (process.env.RATE_LIMIT_ENABLED === 'false') {
      return true;
    }
    const req = context.switchToHttp().getRequest<Request>();
    const ip = clientIp(req);
    if (!ip || !this.limiter.allow(`ip:${ip}`, IP_MAX, IP_WINDOW_MS)) {
      throw AppError.rateLimited();
    }
    const phone = (req.body as { phone?: unknown } | undefined)?.phone;
    if (typeof phone === 'string' && phone.length > 0) {
      if (!this.limiter.allow(`phone:${phone}`, PHONE_MAX, PHONE_WINDOW_MS)) {
        throw AppError.rateLimited();
      }
    }
    return true;
  }
}
