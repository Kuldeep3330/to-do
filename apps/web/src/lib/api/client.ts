import { ApiError, parseErrorBody } from './errors';

type Query = Record<string, string | number | boolean | null | undefined>;

export type RequestOptions = {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  body?: unknown;
  /** Multipart body (uploads). Sent as-is; the browser sets the boundary. */
  form?: FormData;
  query?: Query;
  signal?: AbortSignal;
  /** Do not attempt the refresh-and-retry flow on 401. */
  skipRefresh?: boolean;
  /** On a final 401, throw instead of redirecting to /login (used for the session probe). */
  noRedirect?: boolean;
};

export function buildQuery(query?: Query): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const s = params.toString();
  return s ? `?${s}` : '';
}

let refreshInFlight: Promise<boolean> | null = null;

/** Single-flight refresh so parallel 401s trigger only one refresh call. */
async function refreshSession(): Promise<boolean> {
  refreshInFlight ??= fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' })
    .then((r) => r.ok)
    .catch(() => false)
    .finally(() => {
      refreshInFlight = null;
    });
  return refreshInFlight;
}

export async function rawRequest(path: string, opts: RequestOptions = {}): Promise<Response> {
  const headers: Record<string, string> = { Accept: 'application/json' };
  let body: BodyInit | undefined;
  if (opts.form) {
    body = opts.form;
  } else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  try {
    return await fetch(`${path}${buildQuery(opts.query)}`, {
      method: opts.method ?? 'GET',
      headers,
      body,
      credentials: 'include',
      signal: opts.signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    throw new ApiError('NETWORK_ERROR', 0, 'Network error');
  }
}

/** Browser API call. Returns the parsed JSON envelope (`{ data }` or `{ data, meta }`). */
export async function api<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  let res = await rawRequest(path, opts);

  if (res.status === 401 && !opts.skipRefresh && !path.includes('/auth/')) {
    if (await refreshSession()) {
      res = await rawRequest(path, opts);
    }
    if (res.status === 401 && !opts.noRedirect) {
      redirectToLogin();
    }
  }

  if (res.status === 204) return undefined as T;

  const text = await res.text();
  const json: unknown = text ? safeJson(text) : undefined;
  if (!res.ok) throw parseErrorBody(res.status, json);
  return json as T;
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

function redirectToLogin(): void {
  if (typeof window === 'undefined') return;
  const here = window.location.pathname + window.location.search;
  if (window.location.pathname.startsWith('/login')) return;
  window.location.assign(`/login?next=${encodeURIComponent(here)}`);
}

/** Convenience: unwrap `{ data }`. */
export async function apiData<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await api<{ data: T }>(path, opts);
  return res.data;
}
