import 'server-only';
import { cookies } from 'next/headers';
import { config } from '@/lib/config';
import { ApiError, parseErrorBody } from './errors';
import { buildQuery } from './client';

type ServerOptions = {
  query?: Record<string, string | number | boolean | null | undefined>;
  /** Forward the visitor's cookies (account/admin pages). Public pages leave this off so they can be cached. */
  withCookies?: boolean;
  /** Next.js fetch cache hints for ISR. */
  revalidate?: number | false;
  tags?: string[];
};

/** Server-component API call straight to the Nest origin (no rewrite hop). */
export async function serverApi<T>(path: string, opts: ServerOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  if (opts.withCookies) {
    const jar = await cookies();
    const cookie = jar
      .getAll()
      .map((c) => `${c.name}=${c.value}`)
      .join('; ');
    if (cookie) headers.Cookie = cookie;
  }

  let res: Response;
  try {
    res = await fetch(`${config.apiOrigin}${path}${buildQuery(opts.query)}`, {
      headers,
      ...(opts.withCookies
        ? { cache: 'no-store' as const }
        : { next: { revalidate: opts.revalidate ?? 60, tags: opts.tags } }),
    });
  } catch {
    throw new ApiError('NETWORK_ERROR', 0, 'API unreachable');
  }

  const text = await res.text();
  const json: unknown = text ? JSON.parse(text) : undefined;
  if (!res.ok) throw parseErrorBody(res.status, json);
  return json as T;
}
