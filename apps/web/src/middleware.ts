import { NextResponse, type NextRequest } from 'next/server';

/**
 * Coarse gate only: if there is no session cookie at all, send the visitor to /login.
 * Role checks are NOT done here; the API enforces them (403) and the admin layout shows 404
 * to non-staff so /admin's existence is not disclosed.
 */
const ACCESS_COOKIE = 'ncr_access';
const REFRESH_COOKIE = 'ncr_refresh';

export function middleware(req: NextRequest) {
  const hasSession = req.cookies.has(ACCESS_COOKIE) || req.cookies.has(REFRESH_COOKIE);
  if (hasSession) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = '/login';
  url.search = `?next=${encodeURIComponent(req.nextUrl.pathname + req.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/admin/:path*', '/account/:path*'],
};
