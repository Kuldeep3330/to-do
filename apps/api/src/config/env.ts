import { z } from 'zod';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'staging', 'production', 'test']).default('development'),
    DATABASE_URL: z.string().min(1),
    APP_DATABASE_URL: z.string().optional().default(''),
    COOKIE_SECURE: z.string().optional(),
    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),
    PUBLIC_APP_URL: z.string().url(),
    S3_ENDPOINT: z.string().min(1),
    S3_BUCKET: z.string().min(1),
    S3_ACCESS_KEY: z.string().min(1),
    S3_SECRET_KEY: z.string().min(1),
    S3_PUBLIC_BASE_URL: z.string().min(1),
    MAIL_FROM: z.string().min(1),
    OPS_INBOX_EMAIL: z.string().min(1),
    SMTP_HOST: z.string().optional().default(''),
    SMTP_PORT: z.preprocess(
      (v) => (v === '' || v === undefined ? 587 : v),
      z.coerce.number().int().positive(),
    ),
    SMTP_USER: z.string().optional().default(''),
    SMTP_PASS: z.string().optional().default(''),
    SMTP_SECURE: z.preprocess(
      (v) => (v === undefined || v === '' ? 'false' : v),
      z.string().transform((v) => v === 'true'),
    ),
    SENTRY_DSN: z.string().optional().default(''),
    RATE_LIMIT_ENABLED: z
      .string()
      .optional()
      .default('true')
      .transform((v) => v !== 'false'),
    BOOTSTRAP_ADMIN_EMAIL: z
      .string()
      .optional()
      .default('')
      .refine((v) => v === '' || z.string().email().safeParse(v).success, {
        message: 'Invalid email',
      }),
    BOOTSTRAP_ADMIN_PASSWORD: z.string().optional().default(''),
    BOOTSTRAP_ADMIN_PHONE: z.string().optional().default(''),
    BOOTSTRAP_ADMIN_NAME: z.string().optional().default('Bootstrap Admin'),
    // Published listings not confirmed within this many days are paused. 0 disables the job.
    LISTING_STALE_DAYS: z.coerce.number().int().min(0).default(15),
    // Target time to first response on a new lead. Leads still NEW after this are shown as overdue.
    LEAD_RESPONSE_SLA_MINUTES: z.coerce.number().int().min(1).default(120),
    API_PORT: z.coerce.number().int().positive().default(3001),
    CORS_ORIGIN: z.string().optional().default(''),
  })
  .superRefine((data, ctx) => {
    const deployed = data.NODE_ENV === 'staging' || data.NODE_ENV === 'production';
    if (deployed && data.APP_DATABASE_URL.trim() === '') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['APP_DATABASE_URL'],
        message: 'Required when NODE_ENV is staging or production',
      });
    }
    if (deployed && data.COOKIE_SECURE !== 'true' && data.COOKIE_SECURE !== 'false') {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['COOKIE_SECURE'],
        message: 'Required when NODE_ENV is staging or production (true for HTTPS, false for HTTP)',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid environment: ${issues}`);
  }
  return parsed.data;
}

export function env(): Env {
  if (!cached) {
    cached = loadEnv();
  }
  return cached;
}

export function resetEnvCache(): void {
  cached = undefined;
}

export function isProduction(): boolean {
  return env().NODE_ENV === 'production';
}

export function runtimeDatabaseUrl(source: Env = env()): string {
  if (source.NODE_ENV === 'staging' || source.NODE_ENV === 'production') {
    return source.APP_DATABASE_URL;
  }
  return source.DATABASE_URL;
}

export function cookieSecure(source: Env = env()): boolean {
  if (source.COOKIE_SECURE === 'true') {
    return true;
  }
  if (source.COOKIE_SECURE === 'false') {
    return false;
  }
  return source.NODE_ENV === 'production';
}

export const ACCESS_COOKIE = 'ncr_access';
export const REFRESH_COOKIE = 'ncr_refresh';
export const ACCESS_TTL_SECONDS = 15 * 60;
export const REFRESH_TTL_CUSTOMER_SECONDS = 7 * 24 * 60 * 60;
export const REFRESH_TTL_STAFF_SECONDS = 24 * 60 * 60;
export const LOCK_FAIL_THRESHOLD = 10;
export const LOCK_DURATION_MS = 15 * 60 * 1000;
export const RESET_TTL_MS = 60 * 60 * 1000;
