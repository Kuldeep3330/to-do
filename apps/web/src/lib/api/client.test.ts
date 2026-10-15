import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, buildQuery } from './client';
import { ApiError, errorMessage, parseErrorBody } from './errors';

afterEach(() => vi.unstubAllGlobals());

function mockFetch(...responses: Response[]) {
  const fn = vi.fn();
  responses.forEach((r) => fn.mockResolvedValueOnce(r));
  vi.stubGlobal('fetch', fn);
  return fn;
}

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status });

describe('buildQuery', () => {
  it('skips empty values and encodes the rest', () => {
    expect(buildQuery({ a: 1, b: '', c: undefined, d: 'x y' })).toBe('?a=1&d=x+y');
    expect(buildQuery({})).toBe('');
  });
});

describe('parseErrorBody', () => {
  it('reads the API error envelope', () => {
    const err = parseErrorBody(400, {
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid input',
        details: [{ field: 'phone', message: 'bad' }],
      },
    });
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.details).toEqual([{ field: 'phone', message: 'bad' }]);
  });
  it('accepts the { path } detail shape the API emits', () => {
    const err = parseErrorBody(400, {
      error: { code: 'VALIDATION_ERROR', message: 'Invalid input', details: [{ path: 'localityId', message: 'bad' }] },
    });
    expect(err.details).toEqual([{ field: 'localityId', message: 'bad' }]);
  });
  it('falls back to status when body is not an envelope', () => {
    expect(parseErrorBody(429, undefined).code).toBe('RATE_LIMITED');
  });
});

describe('errorMessage', () => {
  it('maps codes to friendly copy', () => {
    expect(errorMessage(new ApiError('INVALID_CREDENTIALS', 401, 'x'))).toMatch(/incorrect email or password/i);
    expect(errorMessage(new Error('boom'))).toMatch(/something went wrong/i);
  });
});

describe('api', () => {
  it('returns the parsed envelope', async () => {
    mockFetch(json(200, { data: { id: 1 } }));
    await expect(api('/api/v1/me')).resolves.toEqual({ data: { id: 1 } });
  });

  it('throws ApiError on failure', async () => {
    mockFetch(json(403, { error: { code: 'FORBIDDEN', message: 'no' } }));
    await expect(api('/api/v1/admin/leads')).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
  });

  it('refreshes once on 401 and retries', async () => {
    const fn = mockFetch(
      json(401, { error: { code: 'UNAUTHENTICATED', message: 'x' } }),
      json(200, {}),
      json(200, { data: 'ok' }),
    );
    await expect(api('/api/v1/me')).resolves.toEqual({ data: 'ok' });
    expect(fn.mock.calls[1][0]).toBe('/api/v1/auth/refresh');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('does not refresh for auth endpoints', async () => {
    const fn = mockFetch(json(401, { error: { code: 'INVALID_CREDENTIALS', message: 'x' } }));
    await expect(api('/api/v1/auth/login', { method: 'POST', body: {} })).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('returns undefined for 204', async () => {
    mockFetch(new Response(null, { status: 204 }));
    await expect(api('/api/v1/auth/logout', { method: 'POST' })).resolves.toBeUndefined();
  });

  it('wraps network failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('failed')));
    await expect(api('/api/v1/me')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
  });
});
