import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { AppError } from '../../common/errors/app-error';
import { clientIp } from '../../common/rate-limit/client-ip';
import { SlidingWindowLimiter } from '../../common/rate-limit/sliding-window';

const WINDOW_MS = 10 * 60 * 1000;
/** Submissions and start pings are cheap to abuse; reading a result needs the unguessable token anyway. */
const WRITE_MAX = 20;
const READ_MAX = 60;

@Injectable()
export class DiscoverRateLimitGuard implements CanActivate {
  private readonly limiter = new SlidingWindowLimiter();

  canActivate(context: ExecutionContext): boolean {
    if (process.env.RATE_LIMIT_ENABLED === 'false') {
      return true;
    }
    const req = context.switchToHttp().getRequest<Request>();
    const ip = clientIp(req);
    const write = req.method !== 'GET';
    if (!ip || !this.limiter.allow(`${write ? 'w' : 'r'}:${ip}`, write ? WRITE_MAX : READ_MAX, WINDOW_MS)) {
      throw AppError.rateLimited();
    }
    return true;
  }
}
