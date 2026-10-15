import { ExecutionContext } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error';
import { LeadRateLimitGuard } from './lead-rate-limit.guard';

function ctx(ip: string, phone = '+919876543210'): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        ip,
        headers: {},
        socket: { remoteAddress: ip },
        body: { phone },
      }),
    }),
  } as ExecutionContext;
}

describe('LeadRateLimitGuard', () => {
  const previous = process.env.RATE_LIMIT_ENABLED;

  beforeEach(() => {
    process.env.RATE_LIMIT_ENABLED = 'true';
  });

  afterAll(() => {
    process.env.RATE_LIMIT_ENABLED = previous;
  });

  it('allows 5 POSTs per IP then 429', () => {
    const guard = new LeadRateLimitGuard();
    for (let i = 0; i < 5; i++) {
      expect(guard.canActivate(ctx('203.0.113.10', `+91900000000${i}`))).toBe(true);
    }
    try {
      guard.canActivate(ctx('203.0.113.10', '+919000000099'));
      throw new Error('expected rate limit');
    } catch (err) {
      expect(err).toMatchObject({ code: 'RATE_LIMITED', status: 429 });
      expect(err).toBeInstanceOf(AppError);
    }
  });

  it('allows 3 POSTs per phone then 429', () => {
    const guard = new LeadRateLimitGuard();
    const phone = '+919111111111';
    expect(guard.canActivate(ctx('203.0.113.21', phone))).toBe(true);
    expect(guard.canActivate(ctx('203.0.113.22', phone))).toBe(true);
    expect(guard.canActivate(ctx('203.0.113.23', phone))).toBe(true);
    expect(() => guard.canActivate(ctx('203.0.113.24', phone))).toThrow(AppError);
  });

  it('is skipped when RATE_LIMIT_ENABLED=false', () => {
    process.env.RATE_LIMIT_ENABLED = 'false';
    const guard = new LeadRateLimitGuard();
    for (let i = 0; i < 8; i++) {
      expect(guard.canActivate(ctx('203.0.113.30'))).toBe(true);
    }
  });
});
