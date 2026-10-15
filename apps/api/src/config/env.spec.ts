import { cookieSecure, loadEnv, runtimeDatabaseUrl } from './env';

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

describe('env runtime database URL', () => {
  it('uses DATABASE_URL in development when APP_DATABASE_URL is empty', () => {
    const parsed = loadEnv({ ...BASE, NODE_ENV: 'development' });
    expect(runtimeDatabaseUrl(parsed)).toBe(BASE.DATABASE_URL);
  });

  it('keeps DATABASE_URL in development even if APP_DATABASE_URL is set', () => {
    const parsed = loadEnv({
      ...BASE,
      NODE_ENV: 'development',
      APP_DATABASE_URL: 'postgresql://app:app@localhost:5432/ncr_homes?schema=public',
    });
    expect(runtimeDatabaseUrl(parsed)).toBe(BASE.DATABASE_URL);
  });

  it('uses DATABASE_URL in test (ncr_homes_test)', () => {
    const testUrl = 'postgresql://ncr:ncr@localhost:5432/ncr_homes_test?schema=public';
    const parsed = loadEnv({
      ...BASE,
      NODE_ENV: 'test',
      DATABASE_URL: testUrl,
      APP_DATABASE_URL: testUrl,
    });
    expect(runtimeDatabaseUrl(parsed)).toContain('ncr_homes_test');
  });

  it('rejects staging without APP_DATABASE_URL', () => {
    expect(() =>
      loadEnv({
        ...BASE,
        NODE_ENV: 'staging',
        COOKIE_SECURE: 'true',
      }),
    ).toThrow(/APP_DATABASE_URL/);
  });

  it('requires APP_DATABASE_URL in production and uses it at runtime', () => {
    const appUrl = 'postgresql://app:app@localhost:5432/ncr_homes?schema=public';
    const parsed = loadEnv({
      ...BASE,
      NODE_ENV: 'production',
      APP_DATABASE_URL: appUrl,
      COOKIE_SECURE: 'true',
    });
    expect(runtimeDatabaseUrl(parsed)).toBe(appUrl);
    expect(runtimeDatabaseUrl(parsed)).not.toBe(BASE.DATABASE_URL);
  });
});

describe('env cookieSecure', () => {
  it('is false in development when COOKIE_SECURE is unset', () => {
    expect(cookieSecure(loadEnv({ ...BASE, NODE_ENV: 'development' }))).toBe(false);
  });

  it('is true for HTTPS staging when COOKIE_SECURE=true', () => {
    const parsed = loadEnv({
      ...BASE,
      NODE_ENV: 'staging',
      APP_DATABASE_URL: 'postgresql://app:app@localhost:5432/ncr_homes?schema=public',
      COOKIE_SECURE: 'true',
    });
    expect(cookieSecure(parsed)).toBe(true);
  });

  it('is false for HTTP staging when COOKIE_SECURE=false', () => {
    const parsed = loadEnv({
      ...BASE,
      NODE_ENV: 'staging',
      APP_DATABASE_URL: 'postgresql://app:app@localhost:5432/ncr_homes?schema=public',
      COOKIE_SECURE: 'false',
    });
    expect(cookieSecure(parsed)).toBe(false);
  });

  it('is true in production when COOKIE_SECURE=true', () => {
    const parsed = loadEnv({
      ...BASE,
      NODE_ENV: 'production',
      APP_DATABASE_URL: 'postgresql://app:app@localhost:5432/ncr_homes?schema=public',
      COOKIE_SECURE: 'true',
    });
    expect(cookieSecure(parsed)).toBe(true);
  });

  it('rejects staging without COOKIE_SECURE', () => {
    expect(() =>
      loadEnv({
        ...BASE,
        NODE_ENV: 'staging',
        APP_DATABASE_URL: 'postgresql://app:app@localhost:5432/ncr_homes?schema=public',
      }),
    ).toThrow(/COOKIE_SECURE/);
  });
});
