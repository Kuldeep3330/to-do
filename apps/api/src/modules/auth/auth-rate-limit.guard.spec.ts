import { ExecutionContext } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error';
import { AuthRateLimitGuard } from './auth-rate-limit.guard';

function ctx(ip: string, path: string): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({
        ip,
        path,
        url: path,
        headers: {},
        socket: { remoteAddress: ip },
      }),
    }),
  } as ExecutionContext;
}

describe('AuthRateLimitGuard', () => {
  const previous = process.env.RATE_LIMIT_ENABLED;

  beforeEach(() => {
    process.env.RATE_LIMIT_ENABLED = 'true';
  });

  afterAll(() => {
    process.env.RATE_LIMIT_ENABLED = previous;
  });

  it('allows 10 logins per IP then 429', () => {
    const guard = new AuthRateLimitGuard();
    for (let i = 0; i < 10; i++) {
      expect(guard.canActivate(ctx('203.0.113.40', '/api/v1/auth/login'))).toBe(true);
    }
    expect(() => guard.canActivate(ctx('203.0.113.40', '/api/v1/auth/login'))).toThrow(AppError);
  });

  it('allows 5 registers per IP then 429', () => {
    const guard = new AuthRateLimitGuard();
    for (let i = 0; i < 5; i++) {
      expect(guard.canActivate(ctx('203.0.113.41', '/api/v1/auth/register'))).toBe(true);
    }
    try {
      guard.canActivate(ctx('203.0.113.41', '/api/v1/auth/register'));
      throw new Error('expected rate limit');
    } catch (err) {
      expect(err).toMatchObject({ code: 'RATE_LIMITED', status: 429 });
    }
  });

  it('allows 10 forgot-password per IP then 429', () => {
    const guard = new AuthRateLimitGuard();
    for (let i = 0; i < 10; i++) {
      expect(guard.canActivate(ctx('203.0.113.42', '/api/v1/auth/forgot-password'))).toBe(true);
    }
    expect(() => guard.canActivate(ctx('203.0.113.42', '/api/v1/auth/forgot-password'))).toThrow(AppError);
  });

  it('is skipped when RATE_LIMIT_ENABLED=false', () => {
    process.env.RATE_LIMIT_ENABLED = 'false';
    const guard = new AuthRateLimitGuard();
    for (let i = 0; i < 12; i++) {
      expect(guard.canActivate(ctx('203.0.113.43', '/api/v1/auth/login'))).toBe(true);
    }
  });
});
