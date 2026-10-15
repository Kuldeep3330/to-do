# Local development

Prerequisites: Node 20+, npm 10+, Docker Desktop.

## 1. First-time setup

```bash
cp .env.example .env          # edit host ports if 5432 / 9000 are taken
npm install
docker compose up -d          # postgres, S3 storage (+ bucket), mailpit
npm run db:generate
npm run db:migrate:deploy
npm run db:seed
```

All `db:*` scripts read the **root** `.env` (via `dotenv-cli`), so no `apps/api/.env` is needed.

If another PostgreSQL already listens on 5432 (common on Windows), set `POSTGRES_HOST_PORT=5433` in `.env` **and** change the port in `DATABASE_URL`, `TEST_DATABASE_URL` and `APP_DATABASE_URL`.

## 2. Run

```bash
npm run dev:api               # http://localhost:3001  (health: /health, /ready)
npm run dev:web               # http://localhost:3000
```

If port 3000 is taken, run `npx next dev --port 3100` inside `apps/web` and set `PUBLIC_APP_URL` / `NEXT_PUBLIC_APP_URL` to that origin.

The web app proxies `/api/*`, `/health` and `/ready` to `API_ORIGIN` (default `http://localhost:3001`), so the browser only ever talks to one origin and cookies stay first-party. The web app needs no `.env` of its own for local development: its defaults match this setup.

## 3. Services

| Service | URL | Notes |
| --- | --- | --- |
| Postgres | `localhost:${POSTGRES_HOST_PORT}` | user/password/db: `ncr` / `ncr` / `ncr_homes` |
| S3 storage (RustFS) | http://localhost:9000 | bucket `ncr-media`, anonymous read; keys `S3_ACCESS_KEY` / `S3_SECRET_KEY`; console on :9001 |
| Mailpit | http://localhost:8025 | set `SMTP_HOST=localhost`, `SMTP_PORT=1025` to capture emails |

The official `minio/minio` images are no longer pullable, so compose uses RustFS (S3-compatible). The API only speaks S3, so the code is unchanged.

## 4. Seeded login

| Role | Email | Password |
| --- | --- | --- |
| Super admin | `admin@example.com` | `ChangeMeAdmin1` |

(From `BOOTSTRAP_ADMIN_*` in `.env`. Dev/staging only.) Create sales agents from **Admin → Staff**.

## 5. Checks

```bash
npm run typecheck
npm test                      # API Jest suite (runs in band: the HTTP specs share one database)
npm run test:web              # web unit/component tests (Vitest)
```

API tests use a separate database. Create it once and seed it:

```bash
docker exec <postgres-container> psql -U ncr -d postgres -c "CREATE DATABASE ncr_homes_test"
DATABASE_URL=<TEST_DATABASE_URL> npm run db:migrate:deploy
DATABASE_URL=<TEST_DATABASE_URL> npm run db:seed
```

## 6. End-to-end tests (Playwright)

The E2E suite drives a real browser against the **production build** of the web app and a running API.

```bash
# 1. API with the login rate limiter off (tests sign in many times from one IP)
npm run build -w apps/api
RATE_LIMIT_ENABLED=false node apps/api/dist/main.js

# 2. Web production build
cd apps/web
NODE_ENV=production IMAGES_UNOPTIMIZED=true npx next build
NODE_ENV=production npx next start --port 3100

# 3. Tests (uses your installed Chrome; set E2E_CHANNEL= to use bundled Chromium)
npx playwright test
```

Notes:

- Do not start the web server with the root `.env` exported: it sets `NODE_ENV=development`, which Next warns about and which changes server rendering.
- The suite seeds its own data through the admin API using unique markers, so it can run against a database that already has data.
- Tests wait for React hydration (`waitForHydration` in `e2e/helpers.ts`) before interacting. Add it to any new test that clicks something right after `page.goto`.
- On a memory-constrained machine the suite can be flaky because Chrome, Next, Nest, Postgres and Docker all compete for RAM. It retries once locally (twice in CI). CI runs it on a clean runner.

## 7. Troubleshooting

- **`P1000 authentication failed`**: you are hitting a different Postgres on the same port. See the port note above.
- **`Environment variable not found: DATABASE_URL`**: run Prisma through the npm scripts, not `npx prisma` directly.
- **Uploads fail**: `docker compose ps` should show `storage` up and `storage-init` exited 0; re-run `docker compose up -d storage-init`.
- **Photos do not show locally**: set `IMAGES_UNOPTIMIZED=true` for the web build/start, or check that `S3_PUBLIC_BASE_URL` matches the host you open in the browser.
- **429 on sign-in**: the in-memory limiter is working. Wait, or restart the API in development.

## 8. Known advisories

`npm audit --omit=dev` still reports build-time-only advisories:

- `postcss <= 8.5.22`, pinned inside Next.js. It processes our own CSS at build time, never untrusted input. Resolved by upgrading Next when a release bumps it.
- `deepmerge-ts` via the Prisma CLI config loader. Fixed only by a Prisma major upgrade (6 → 7), which is a separate change.
