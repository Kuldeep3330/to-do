process.env.NODE_ENV = 'test';
process.env.RATE_LIMIT_ENABLED = 'false';
process.env.COOKIE_SECURE = 'false';
const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ||
  'postgresql://ncr:ncr@localhost:5432/ncr_homes_test?schema=public';
if (!testDatabaseUrl.includes('ncr_homes_test')) {
  throw new Error('TEST_DATABASE_URL must point at ncr_homes_test');
}
process.env.DATABASE_URL = testDatabaseUrl;
process.env.APP_DATABASE_URL = testDatabaseUrl;
