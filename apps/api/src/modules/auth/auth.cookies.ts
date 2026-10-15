import { CookieOptions, Response } from 'express';
import {
  ACCESS_COOKIE,
  ACCESS_TTL_SECONDS,
  REFRESH_COOKIE,
  cookieSecure,
} from '../../config/env';

export function baseCookie(): CookieOptions {
  return {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: 'lax',
    path: '/',
  };
}

export function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
  refreshTtlSeconds: number,
): void {
  res.cookie(ACCESS_COOKIE, accessToken, {
    ...baseCookie(),
    maxAge: ACCESS_TTL_SECONDS * 1000,
  });
  res.cookie(REFRESH_COOKIE, refreshToken, {
    ...baseCookie(),
    maxAge: refreshTtlSeconds * 1000,
  });
}

export function clearAuthCookies(res: Response): void {
  const opts = baseCookie();
  res.clearCookie(ACCESS_COOKIE, opts);
  res.clearCookie(REFRESH_COOKIE, opts);
}
