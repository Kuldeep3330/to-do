import '../../load-env';
import { ACCESS_COOKIE, ACCESS_TTL_SECONDS, REFRESH_COOKIE, cookieSecure, loadEnv } from '../../config/env';
import { baseCookie, clearAuthCookies, setAuthCookies } from './auth.cookies';

const BASE: NodeJS.ProcessEnv = {
  NODE_ENV: 'development',
  DATABASE_URL: 'postgresql://ncr:ncr@localhost:5432/ncr_homes?schema=public',
  JWT_ACCESS_SECRET: 'change-me-access-min-32-chars-long',
  JWT_REFRESH_SECRET: 'change-me-refresh-min-32-chars-long',
  PUBLIC_APP_URL: 'http://localhost:3000',
  S3_ENDPOINT: 'http://localhost:9000',
  S3_BUCKET: 'ncr-media',
  S3_ACCESS_KEY: 'minio',
  S3_SECRET_KEY: 'minio-secret',
  S3_PUBLIC_BASE_URL: 'http://localhost:9000/ncr-media',
  MAIL_FROM: 'noreply@localhost',
  OPS_INBOX_EMAIL: 'ops@localhost',
};

describe('auth cookies', () => {
  it('keeps HttpOnly SameSite=Lax path=/ and is not Secure in development', () => {
    const parsed = loadEnv({ ...BASE, NODE_ENV: 'development' });
    expect(cookieSecure(parsed)).toBe(false);
    const opts = baseCookie();
    expect(opts.httpOnly).toBe(true);
    expect(opts.sameSite).toBe('lax');
    expect(opts.path).toBe('/');
    expect(opts.secure).toBe(false);
  });

  it('sets Secure on HTTPS staging via COOKIE_SECURE=true', () => {
    const parsed = loadEnv({
      ...BASE,
      NODE_ENV: 'staging',
      APP_DATABASE_URL: 'postgresql://app:app@localhost:5432/ncr_homes?schema=public',
      COOKIE_SECURE: 'true',
    });
    expect(cookieSecure(parsed)).toBe(true);
  });

  it('sets cookies with access TTL and refresh TTL, and clear uses the same base options', () => {
    const cookie = jest.fn();
    const clearCookie = jest.fn();
    const res = { cookie, clearCookie } as never;
    setAuthCookies(res, 'access-token', 'refresh-token', 3600);
    expect(cookie).toHaveBeenCalledWith(ACCESS_COOKIE, 'access-token', {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      maxAge: ACCESS_TTL_SECONDS * 1000,
    });
    expect(cookie).toHaveBeenCalledWith(REFRESH_COOKIE, 'refresh-token', {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 3600 * 1000,
    });
    clearAuthCookies(res);
    expect(clearCookie).toHaveBeenCalledWith(ACCESS_COOKIE, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
    });
    expect(clearCookie).toHaveBeenCalledWith(REFRESH_COOKIE, {
      httpOnly: true,
      secure: false,
      sameSite: 'lax',
      path: '/',
    });
  });
});
