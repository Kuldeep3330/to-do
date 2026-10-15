# Real Estate Platform — NestJS Backend Architecture & API Design

**Document:** Deliverable 24  
**File:** `docs/25-nestjs-backend-api-design.md`  
**Depends on:** Architecture Freeze v1, `docs/24-final-postgresql-prisma-design.md`, corrected 02, 07, 09, 10–13, 15–17, 21  
**Date:** 2026-09-30  
**Out of this document:** `schema.prisma`, SQL migrations, Nest/Next source, Docker, CI YAML, generated OpenAPI

If this file disagrees with drafts 07/09, **this file + freeze + doc 24** win. Database structure is owned by doc 24. Product scope is owned by freeze + Deliverable 02.

**Status:** NestJS module and REST contract freeze. **Not** an implicit go-ahead to generate application code.

---

## 1. Document Status

Authoritative NestJS backend blueprint for the Delhi-NCR discovery + lead CRM MVP.

No application code in this pass. When implementation is explicitly requested, follow section 36 order (bootstrap → Prisma → auth → core loop). Do not generate the entire API in one pass.

---

## 2. Source Documents

| Source | Use |
| --- | --- |
| `docs/00-architecture-freeze.md` | Topology, auth cookies, CSRF, deferred list |
| `docs/02-requirements-specification.md` | P0 functional requirements |
| `docs/03-traffic-capacity.md` | Scenario A, rate-limit starting values |
| `docs/04-architecture.md` | Modular monolith |
| `docs/05-domain-model.md` | Aggregates |
| `docs/10-authentication-authorization.md` | Authn/z, scoped 404 |
| `docs/11-search.md` | Postgres search |
| `docs/12-media-storage.md` | Upload / ORIGINAL cap |
| `docs/13-notifications-jobs.md` | Email after commit |
| `docs/15-security.md` | Headers, threats |
| `docs/16-testing.md` | Required cases |
| `docs/17-observability.md` | Logs, Sentry, health |
| `docs/24-final-postgresql-prisma-design.md` | Schema, indexes, grants, BigInt, lock machine |

Do not invent P0 features. Do not add deferred tables (brokers, payments, KYC, …).

---

## 3. Backend Architecture Summary

One NestJS process. One PostgreSQL. Object storage for bytes. Next.js same-origin `/api` rewrite. No Redis, workers, OpenSearch, Kafka, GraphQL, K8s, microservices.

```text
Browser → Next.js → /api rewrite → NestJS (api/v1)
                              → Prisma → PostgreSQL
                              → S3-compatible storage
                              → EmailPort (after commit)
```

Scenario A: 50–300 listings, 0.1–1 typical peak JSON RPS, bursts 5–10 RPS without redesign.

**Internal pattern (frozen):** Controller → Service → PrismaService. Controllers never import Prisma. No generic `BaseRepository`. No DDD folder ceremony.

---

## 4. Database Audit

Source: doc 24 after D23-C1–C7. Schema supports P0. No new tables.

| Check | Result |
| --- | --- |
| A. City/locality | Composite FK `(locality_id, city_id) → localities(id, city_id)` RESTRICT. PostgreSQL is authoritative. Prisma 6 multi-field `@relation` is valid PSL; add SQL if migrate omits. |
| B. Published uniqueness | Partial unique `(property_id, intent)` WHERE PUBLISHED and not deleted. |
| C. Slug | Partial unique among non-deleted. Immutable after first publish = application. |
| D. Soft delete | `users`, `properties`, `listings` only. Public: PUBLISHED + both `deleted_at IS NULL`. Soft-deleted user: generic invalid credentials. |
| E. Leads | Guest `user_id` null; customer attached; `listing_id` null = CONTACT_FORM; assignee column; 24h dup in TX; rare race accepted. |
| F. Visits | `visit.listing_id = lead.listing_id` in same TX. Not a CHECK. |
| G. Media | **MAX ORIGINAL = 20**. CARD/DETAIL excluded. Count `variant = ORIGINAL`. |
| H. Money | PG `bigint` / Prisma `BigInt` / HTTP JSON **number**. |
| I. Auth | Reset + refresh hashed; rotation; logout revokes **current**; reset revokes **all**. Expired LOCKED auto-clears. DISABLED never auto-unlocks. |
| J. Append-only | App role INSERT+SELECT on `audit_logs` and `analytics_events`. `notification_logs` INSERT+SELECT+UPDATE, no DELETE. |
| K. UUID | **Only** `gen_random_uuid()` (PG 16 built-in). Prisma `@default(dbgenerated("gen_random_uuid()"))`. Object keys: app UUID. |
| L. Prisma pin | **6.x** `prisma-client-js`, `url = env("DATABASE_URL")`. Gate: `prisma validate` && `prisma format` && inspect SQL. |

---

## 5. Module Architecture

```text
apps/api/src/
  main.ts
  app.module.ts
  config/env.ts
  prisma/prisma.module.ts
  prisma/prisma.service.ts
  common/          # guards, pipes, filters, interceptors
  modules/
    health/
    auth/
    users/
    rbac/
    locations/
    amenities/
    properties/
    listings/
    media/
    leads/         # visits inside this module
    saved-listings/
    service-catalog/
    notifications/
    audit/
    analytics/
```

No top-level `roles/` (rbac owns it). No `services/` catch-all. Catalog is `service-catalog`.

Each domain module: `*.module.ts`, `*.controller.ts` (HTTP only), `*.service.ts` (rules + Prisma), `dto/`, `mappers/` where a public DTO exists.

---

## 6. Module Ownership

| Domain concept | Owning module | Tables | HTTP surface |
| --- | --- | --- | --- |
| User identity | users | users | `/me`; admin users |
| Session / reset | auth | password_reset_tokens, refresh_tokens | `/auth/*` |
| Roles / permissions | rbac | roles, permissions, role_permissions, user_roles | admin role assign |
| City / locality | locations | cities, localities | public GET; admin write |
| Amenity | amenities | amenities | admin; embedded on listing DTO |
| Property | properties | properties, property_amenities | admin |
| Listing, publish, search | listings | listings | public GET; admin write |
| Media | media | media | admin upload; URLs on listing DTO |
| Lead + visit | leads | leads, visits | public POST lead; `/me`; admin |
| Saved listing | saved-listings | saved_listings | customer |
| Service catalog / enquiry | service-catalog | service_catalog_items, service_enquiries | public GET + POST; admin |
| Email | notifications | notification_logs | none |
| Audit | audit | audit_logs | admin GET |
| Analytics | analytics | analytics_events | none (internal write) |
| Health | health | — | `/health`, `/ready` |

Only the owner writes those tables. Other modules call the owner’s service. No Kafka. No EventEmitter in P0. `notificationService.send` after commit.

---

## 7. Internal Application Architecture

**Chosen:** Option A+ — Controller → Service → PrismaService.

Not Option B (repository) unless a service exceeds ~300 lines. Not Option C (full DDD).

```text
HTTP
  → Helmet / body limit
  → requestId interceptor
  → JwtAuthGuard (global; skip @Public)
  → PermissionsGuard
  → Zod pipe
  → Controller
  → Service (invariants, $transaction)
  → PrismaService
commit
  → NotificationService / AnalyticsService (no TX)
  → BigInt JSON interceptor
```

Business rules live in services: publish, lock machine, ORIGINAL count, lead duplicate, visit listing match, RBAC scope.

---

## 8. Dependency Rules

Allowed:

```text
auth → users, rbac
users → rbac
listings → properties, media, locations
properties → locations, amenities
media → listings (read id / ORIGINAL count; listings own publish)
leads → listings (read published), users (read), notifications
saved-listings → listings, users
service-catalog → notifications
audit ← interceptor after 2xx admin mutation
analytics ← listings / leads / saved-listings / service-catalog
health → prisma
```

Forbidden:

```text
listings → leads
notifications → domain modules
properties → listing publish
controllers → PrismaService
forwardRef() in P0
circular users ↔ leads
```

If a cycle appears, move the shared function (usually notifications or analytics) — do not `forwardRef`.

---

## 9. API Versioning

```text
/api/v1/...
```

REST only. Breaking change → `/api/v2`. Additive JSON fields are not breaking. `GET /health` and `GET /ready` are unversioned.

Next.js rewrites `/api` to Nest. Browser is same-origin in P0.

---

## 10. Public API

Anonymous may: GET cities/localities/published listings/services; POST lead and service enquiry; POST auth register/login/forgot/reset/refresh/logout.

Never expose: hashes, tokens, audit, assignments, unpublished listings, `internalTitle`, other users’ PII, storage write keys.

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/api/v1/cities` | Active cities `{ id, name, slug }` |
| GET | `/api/v1/cities/:citySlug/localities` | 404 unknown/inactive city |
| GET | `/api/v1/listings` | Search; see section 22 |
| GET | `/api/v1/listings/:slug` | 404 if not published/deleted |
| POST | `/api/v1/leads` | Guest `{ data: { ok: true } }` always |
| GET | `/api/v1/services` | Active catalog |
| GET | `/api/v1/services/:slug` | 404 inactive |
| POST | `/api/v1/service-enquiries` | `{ data: { ok: true } }` |

Lead body: `listingSlug` or `listingId`, `name`, `phone`, `email?`, `message?`. Listing must be published. 24h duplicate TX. Email after commit.

---

## 11. Customer API

JWT required. Scoped `WHERE user_id = me`; miss → 404. Never Customer B’s leads/visits/saves.

| Method | Path | Notes |
| --- | --- | --- |
| POST | `/api/v1/auth/register` | CUSTOMER only; 201 + cookies |
| POST | `/api/v1/auth/login` | 200 + cookies |
| POST | `/api/v1/auth/refresh` | refresh cookie |
| POST | `/api/v1/auth/logout` | revoke **current** refresh; 204 |
| POST | `/api/v1/auth/forgot-password` | always 200 |
| POST | `/api/v1/auth/reset-password` | token + password |
| GET | `/api/v1/me` | PublicUser: id, email, name, phone, roles[] |
| PATCH | `/api/v1/me` | name, phone |
| GET | `/api/v1/me/saved-listings` | paginated cards |
| POST | `/api/v1/me/saved-listings` | `{ listingId }`; max 100 |
| DELETE | `/api/v1/me/saved-listings/:listingId` | 204 / 404 |
| GET | `/api/v1/me/leads` | own |
| GET | `/api/v1/me/leads/:id` | scoped 404 |
| POST | `/api/v1/me/visits` | customer-only; week 7 killable |
| GET | `/api/v1/me/visits` | scoped |
| POST | `/api/v1/me/visits/:id/cancel` | own REQUESTED |

---

## 12. Admin API

Prefix `/api/v1/admin`. JWT + permission. Mutations `@Audit()` except GET.

**Properties** (`property.manage`): GET/POST list, GET/PATCH `:id`, POST `:id/archive`. Soft delete only if no live listings (409). Composite city+locality; DB rejects mismatch.

**Listings** (`listing.manage`): GET/POST, GET/PATCH `:id`, POST `:id/publish|pause|close`. Never `PATCH { status: PUBLISHED }`. Slug immutable after first publish.

**Media** (`media.manage`): POST `/admin/listings/:id/media` multipart; PATCH `/admin/media/:id` sortOrder; DELETE `/admin/media/:id` (409 last ORIGINAL of PUBLISHED).

**Leads:** GET list/`:id` with `lead.read_all` or scoped `lead.read_assigned` (404). PATCH status: `lead.update_all` / `lead.update_assigned`. PATCH `assignedToUserId`: **`lead.assign` else 403**.

**Visits** (`visit.manage_staff`): GET, POST `:id/confirm|complete|no-show|cancel`. Killable week 7.

**Locations** (`location.manage`): POST/PATCH cities and localities.

**Amenities:** GET/POST/PATCH `/admin/amenities` under `property.manage`.

**Service catalog:** CRUD with `listing.manage` (no new permission). Enquiries GET: `lead.read_all`. PATCH CONTACTED: `lead.update_all`. NEW→CONTACTED only.

**Users:** GET/POST/PATCH `user.manage`. Grant SUPER_ADMIN: Super Admin only else 403. PATCH roles: `role.manage`.

**Audit** (`audit.read`): GET `/admin/audit-logs`.

**Dashboard** (`dashboard.read`): `{ publishedListings, leadsNew, leadsToday }`.

---

## 13. Authentication

Cookies: access JWT ~15m claims `sub`,`iat`,`exp` only; refresh opaque SHA-256 hashed, httpOnly, Secure prod, SameSite=Lax; 7d customer / 1d staff. No localStorage. No Bearer in P0.

Password: Argon2id preferred; bcrypt cost ≥12 acceptable.

**Register:** rate limit → validate → hash → insert user → CUSTOMER role → issue cookies in TX → 201.

**Login:** rate limit → missing/deleted/DISABLED → generic fail → LOCKED and `locked_until > now` → generic fail → expired LOCKED → set ACTIVE, count 0, locked_until NULL **then** verify password → fail increments; at 10 set LOCKED + 15m → success (not DISABLED): count 0, locked_until NULL, status ACTIVE → cookies.

**Refresh:** hash cookie → TX `SELECT … FOR UPDATE` on token row → missing/expired/revoked → 401 → **reuse of revoked:** revoke **all** user refresh, 401 → else insert new, revoke old, new access. Concurrent refresh: row lock so only one rotation succeeds.

**Logout:** revoke **current** refresh only. Other devices remain. 204.

**Forgot:** always 200. If user exists and not deleted: invalidate unused prior tokens, insert hashed 1h token, email after commit.

**Reset:** valid unused unexpired hash → TX: used_at, new hash, revoke **all** refresh, count 0, locked_until NULL; LOCKED→ACTIVE; **DISABLED stays DISABLED**.

PublicUser never includes `passwordHash`, `failedLoginCount`, `lockedUntil`.

---

## 14. Authorization

```text
Who are you?     JwtAuthGuard
May you do this? PermissionsGuard (permission codes from DB, cache ≤30s)
This record?     Service scoped WHERE → 404
```

JWT roles are never the authorization source.

| Actor | Result |
| --- | --- |
| Guest protected | 401 |
| Customer `/admin` | 403 |
| Customer A reads B | 404 |
| Agent unassigned lead | 404 |
| Agent assign | 403 |
| Public draft slug | 404 |

Permission matrix: Deliverable 10. Unchanged.

---

## 15. Guards and Decorators

| Name | Role |
| --- | --- |
| `@Public()` | Skip JWT |
| `@RequirePermissions('lead.assign')` | Permission codes |
| `@CurrentUser()` | `{ id }` from `sub` |
| `@Audit()` | Admin mutation → audit write |

Guards: **JwtAuthGuard** (global) then **PermissionsGuard**. No RolesGuard. Resource scope is not a guard.

---

## 16. DTO and Validation Strategy

**Zod** (frozen over class-validator: inferred types, share later with Next). Global Zod pipe. Strip unknown keys.

Controllers return **mapped DTOs**, never Prisma entities. Prevents leaking `passwordHash`, `internalTitle`, `deletedAt`, token hashes, assignee on public listing.

Named response models:

| DTO | Used on |
| --- | --- |
| `PublicListingCard` | search, saved, home |
| `PublicListingDetail` | public slug |
| `AdminListingDetail` | admin GET listing |
| `PublicUser` | auth / me |
| `AdminLeadDetail` | admin lead (includes assignee, phone) |
| `GuestLeadAck` | `{ ok: true }` |

Public listing query (service, not controller):

```text
status = PUBLISHED
listings.deleted_at IS NULL
properties.deleted_at IS NULL
```

Admin listing query may include DRAFT/PUBLISHED/PAUSED/CLOSED subject to `listing.manage`.

Validation: email lowercase; phone E.164 `+91` + 10 digits; UUID; ISO dates; varchar max lengths; money `z.number().int()`; `page`/`pageSize` bounds; enums matching PG.

---

## 17. Error Handling

Envelope (frozen, no `success` boolean):

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "Invalid input", "details": [] } }
```

Success: `{ data: T }` or `{ data: T[], meta: { page, pageSize, total } }`. Health unwrapped.

| Code | HTTP | When |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | Zod; public offset > 1000; unsafe money |
| `UNAUTHENTICATED` | 401 | Missing/invalid/expired access |
| `INVALID_CREDENTIALS` | 401 | Bad login, active lock, DISABLED, deleted — **same message** |
| `FORBIDDEN` | 403 | Authenticated, operation not permitted |
| `NOT_FOUND` | 404 | Missing, out of scope, public draft |
| `CONFLICT` | 409 | Identity unique, second PUBLISHED intent, last ORIGINAL, publish rules, 21st ORIGINAL |
| `PAYLOAD_TOO_LARGE` | 413 | Upload > 8 MB |
| `UNSUPPORTED_MEDIA` | 415 | MIME/magic/ext |
| `RATE_LIMITED` | 429 | Auth/lead/enquiry/upload |
| `INTERNAL_ERROR` | 500 | Unexpected; generic |

**Not public codes:** `ACCOUNT_LOCKED`, `LISTING_NOT_PUBLISHED`, `DUPLICATE_LEAD`, `EMAIL_ALREADY_EXISTS` as login leaks. Register may 409 `CONFLICT` on email/phone for UX. Guest lead never returns duplicate. Prisma/PG errors mapped; never send SQLSTATE to clients. `requestId` is a log/header field (`x-request-id`), not required inside `error` (optional additive).

---

## 18. Transaction Boundaries

Use `prisma.$transaction` (interactive) for multi-row invariants. Default isolation: PostgreSQL **Read Committed**. No serializable in P0. Timeout: **5s** (Prisma `$transaction({ timeout: 5000 })`). Do **not** send email, sharp, or S3 inside the TX.

| Operation | In TX | Outside TX |
| --- | --- | --- |
| Register | user + CUSTOMER role + refresh | — |
| Login success | lock reset + refresh insert | — |
| Refresh rotation | lock row, revoke, insert | — |
| Password reset | used_at, hash, revoke all refresh, lock clear | email already sent on forgot |
| CreateLead | SELECT recent dup + INSERT | email, analytics |
| PublishListing | ORIGINAL count ≥ 1, property complete, status+published_at | — |
| CreateVisit | ownership + listing_id = lead.listing_id + insert | ops email |
| Media insert | ORIGINAL+CARD+DETAIL rows | S3 puts **before** TX; on DB fail delete objects |
| Assign/update lead | single UPDATE is enough; no multi-table TX required | audit interceptor |
| Saved listing | count + insert (section 19) | analytics |

Never hold a TX while calling Resend/SES/S3/sharp.

---

## 19. Concurrency and Race Conditions

**Publish uniqueness:** DB partial unique. Concurrent second PUBLISHED → unique_violation → 409. Application checks first for a clean error.

**Lead 24h duplicate:** application SELECT+INSERT in TX. **No DB unique.** Rare concurrent duplicate **accepted** (Scenario A 2–20 leads/day).

**Refresh rotation:** `SELECT … FOR UPDATE` on the refresh row. Reuse of revoked token → revoke all for user.

**Saved listing max 100:** in TX `SELECT COUNT(*) FROM saved_listings WHERE user_id = $1`; if ≥ 100 → 409; else insert. PK prevents duplicate listing. Concurrent 100th+1: both counts can read 99 — **accepted rare 101**. No advisory lock in P0. Kill if abused.

**Media max 20 ORIGINAL:** in TX `SELECT COUNT(*) … WHERE variant = 'ORIGINAL' FOR UPDATE` of listing row (`SELECT id FROM listings WHERE id = $1 FOR UPDATE`) then count then insert. Listing row lock serializes concurrent uploads. No trigger.

**Slug uniqueness:** partial unique; generate with suffix on conflict.

---

## 20. BigInt and Serialization

| Layer | Type |
| --- | --- |
| PostgreSQL | `bigint` whole INR |
| Prisma | `BigInt` |
| HTTP JSON | **number** (`priceAmount`: 7500000) |
| Logs | number or stringified decimal; never raw BigInt into pino without coerce |

Do not store money as float/decimal/varchar. `JSON.stringify` throws on BigInt — mapper/interceptor **before** response.

Reject writes not `Number.isSafeInteger`. Delhi-NCR prices ≪ 2^53−1.

**Decimal area:** Prisma `Decimal` → JSON **number** (or string if scale requires; P0 number with 2 dp is enough for SQFT).

**Dates:** ISO-8601 UTC strings. `available_from` date-only `YYYY-MM-DD`.

**UUIDs:** strings.

---

## 21. Prisma / Data Access

One `PrismaService` extends `PrismaClient`, global module.

Services in owning modules call Prisma. **Controllers never import Prisma.** No `BaseRepository<T>`. Domain-specific queries in the service.

Raw SQL only for: EXPLAIN-driven search if Prisma cannot, and migrations for partial indexes/CHECKs/grants/composite FK.

`prisma validate` && `prisma format` before Nest feature work.

---

## 22. Search

PostgreSQL only. Owned by listings service.

```text
HTTP GET /listings
  → SearchQuery DTO (whitelist)
  → ListingsService.searchPublic
  → Prisma where + order
  → PostgreSQL (indexes in doc 24 §16.1)
```

Always: PUBLISHED, listing not deleted, property not deleted.

Query: `intent`, `city` slug, `locality` slug, `type`, `bedrooms`, `bedroomsMin`, `minPrice`, `maxPrice`, `minArea`, `maxArea`, `furnishing`, `q` (≥2, title ILIKE), `sort` newest|price_asc|price_desc, `page`, `pageSize`.

Order: primary + `id DESC`. Cover: CARD then ORIGINAL. No OpenSearch. No pg_trgm until EXPLAIN at 1k/5k listings.

---

## 23. Media

Bytes in object storage. Metadata in `media`. JPEG/PNG/WebP. Magic + MIME + ext. ≤8 MB. ≤8000px. UUID keys. No remote URL. No PG bytea.

**MAX ORIGINAL = 20.** CARD/DETAIL do not count (~60 rows max).

Flow: auth → listing lock → count ORIGINAL → validate → put ORIGINAL → sharp CARD/DETAIL → TX insert rows → return URLs. Storage OK / DB fail: best-effort delete objects, fail HTTP. Cannot delete last ORIGINAL of PUBLISHED. Cover = lowest `sort_order` among ORIGINAL.

---

## 24. Notifications

Email only. `EmailPort`. After commit. One attempt. Failure logged; **does not** roll back lead/enquiry/user.

Templates: `lead_received_customer`, `lead_received_ops`, `service_enquiry_ops`, `password_reset`, `visit_requested_ops`.

`notification_logs`: insert PENDING, UPDATE SENT/FAILED. No Redis/BullMQ.

---

## 25. Rate Limiting

In-memory per instance (Scenario A, one API). Redis when a second instance exists — **not now**.

**Implementation status:** in-memory per-process limiter is wired for POST `/leads` (5/IP/10min, 3/phone/hour), POST `/auth/login` (10/IP/10min), POST `/auth/register` (5/IP/hour), POST `/auth/forgot-password` (10/IP/15min). Public GET search and admin upload remain unwired. `RATE_LIMIT_ENABLED=false` skips. Not a distributed limiter. `@nestjs/throttler` is not registered.

From Deliverable 03:

| Class | Start |
| --- | --- |
| POST /leads, /service-enquiries | 5 / IP / 10 min; 3 / phone / hour |
| POST /auth/login | 10 / IP / 10 min |
| POST /auth/register | 5 / IP / hour |
| POST /auth/forgot-password | 10 / IP / 15 min |
| Public GET search | 60 / IP / min |
| Admin upload | 30 / admin / 10 min |

Login/enquiry limiter errors: fail **closed**. Public GET limiter errors: fail **open**. 429 `RATE_LIMITED`.

---

## 26. Caching

No Redis. No cache of authenticated responses.

| Resource | P0 |
| --- | --- |
| Cities / localities / services | HTTP `Cache-Control: public, max-age=60` |
| Public listing HTML | Next.js ISR ~60s (web, not API) |
| Search JSON | optional `max-age=30` |
| Admin / me / leads | `private, no-store` |

Invalidation: TTL. Staff wait up to TTL after publish. CDN for images.

---

## 27. Security Middleware

| Control | P0 |
| --- | --- |
| Helmet | nosniff, `X-Frame-Options: DENY`, CSP `frame-ancestors 'none'` (overrides Helmet default `'self'` so CSP matches DENY), HSTS in prod, Referrer-Policy |
| CORS | **off in production** (same-origin rewrite). Dev: explicit `CORS_ORIGIN`, never `*` with credentials |
| CSRF | **none** while same-origin. Do not deploy cross-site cookies until CSRF exists |
| Body size | JSON 32 KB; multipart 8 MB |
| SQL | Prisma parameterized only |
| XSS | listing description untrusted text; no raw HTML |
| SSRF | no URL ingest |
| Upload | magic/MIME/ext/size/dimension |
| Cookies | httpOnly, Secure prod, SameSite=Lax |

---

## 28. Configuration

Zod-parse `process.env` at boot. Fail fast if required missing in production.

| Name | Notes |
| --- | --- |
| `DATABASE_URL` | Prisma migrate/seed (owner role) |
| `APP_DATABASE_URL` | Runtime API role. Required in staging/production. Tests use `ncr_homes_test` |
| `JWT_ACCESS_SECRET` | |
| `JWT_REFRESH_SECRET` | |
| `PUBLIC_APP_URL` | reset links |
| `S3_ENDPOINT` `S3_BUCKET` `S3_ACCESS_KEY` `S3_SECRET_KEY` `S3_PUBLIC_BASE_URL` | |
| `MAIL_FROM` `OPS_INBOX_EMAIL` | EmailPort adapter config |
| `SMTP_HOST` `SMTP_PORT` `SMTP_USER` `SMTP_PASS` `SMTP_SECURE` | Real SMTP when `SMTP_HOST` is set; otherwise log adapter |
| `SENTRY_DSN` | optional |
| `RATE_LIMIT_ENABLED` | |
| `BOOTSTRAP_ADMIN_EMAIL` | prod seed only |
| `NODE_ENV` | development / staging / production |

Cookie `Secure` follows `COOKIE_SECURE` (`true`/`false`). Required in staging and production so HTTPS staging is explicit. No `PASSWORD_RESET_SECRET` (tokens are random hashed, not JWT). No Agent LLM env names. Never commit values. `.env.example` placeholders only.

Dev: local Postgres + MinIO. Staging/prod: managed Postgres TLS, real bucket, real email.

---

## 29. Health Checks

| Path | Meaning | Body |
| --- | --- | --- |
| `GET /health` | process alive | `{ "status": "ok" }` |
| `GET /ready` | `SELECT 1` | 200 ok or 503 `{ "status": "not_ready" }` |

No credentials, config, or stack traces. Prompt `/health/ready` is **not** used; freeze is `/ready`.

---

## 30. Audit Logging

Append-only. App role cannot UPDATE/DELETE. Interceptor after **2xx** admin mutations. Do not audit GET.

Actions: `CREATE_PROPERTY`, `UPDATE_PROPERTY`, `ARCHIVE_PROPERTY`, `CREATE_LISTING`, `UPDATE_LISTING`, `PUBLISH_LISTING`, `PAUSE_LISTING`, `CLOSE_LISTING`, `CREATE_MEDIA`, `DELETE_MEDIA`, `REORDER_MEDIA`, `ASSIGN_LEAD`, `UPDATE_LEAD_STATUS`, `UPDATE_VISIT`, `USER_ROLE_CHANGE`, `USER_STATUS_CHANGE`.

Fields: `actor_user_id`, `action`, `entity_type`, `entity_id`, `metadata` (no passwords/tokens), `created_at`. `requestId` may live in metadata.

---

## 31. Analytics

Fire-and-forget insert (catch errors). No PII in `properties`. No FK to listings.

P0 names: `property_search`, `listing_viewed`, `lead_created`, `listing_saved`, `service_enquiry_created`, `visit_requested`. `contact_clicked` is frontend-only if needed; API may skip.

Synchronous insert in-request is acceptable at Scenario A (not a second hop). Do not block HTTP on analytics failure.

---

## 32. Observability

JSON logs: `timestamp`, `level`, `msg`, `requestId`, `userId`, `route`, `status`, `durationMs`.

Never log passwords, tokens, cookies, full phone/email (mask). Sentry on 500. No distributed tracing. Rate-limit and auth failures at `warn` without identifiers that enumerate users.

---

## 33. Swagger / OpenAPI

`GET /api/docs` **non-production only** (`NODE_ENV !== production`) or admin-gated. Not a public attack surface.

Documents routes, DTOs, errors, pagination, enums. Cookie auth scheme. **Not** the source of truth (this file + Zod are). Do not put secrets in examples. No Swagger codegen as architecture.

---

## 34. Testing Architecture

| Module | Unit | Integration |
| --- | --- | --- |
| auth | lock machine, reset revoke, CUSTOMER-only register | register, duplicate identity, login, lock, expiry unlock, DISABLED, refresh reuse, logout, reset |
| rbac | permission mapping | 401/403/404 matrix |
| properties | — | composite FK reject |
| listings | publish rules, slug immutable | draft 404 public, unique published intent |
| media | ORIGINAL count | MIME/magic/size/21st ORIGINAL, last ORIGINAL 409 |
| leads | duplicate window (non-race) | guest `{ ok: true }`, IDOR 404 |
| saved-listings | max 100 | IDOR |
| service-catalog | NEW→CONTACTED | invalid transition |
| search | pageSize/offset | offset > 1000 → 400; stable sort |

E2E (Playwright, few): search→enquiry; admin publish→public 200; customer register→save.

---

## 35. Folder Structure

```text
apps/api/
  prisma/                 # created only when implementing
  src/
    main.ts
    app.module.ts
    config/env.ts
    prisma/prisma.module.ts
    prisma/prisma.service.ts
    common/
      decorators/
      guards/
      interceptors/
      filters/
      pipes/
      dto/pagination.query.ts
      errors/
    modules/
      health/
      auth/          auth.module.ts auth.controller.ts auth.service.ts dto/
      users/
      rbac/
      locations/
      amenities/
      properties/
      listings/      public + admin controllers in same module
      media/
      leads/         visits as leads/visits.service.ts
      saved-listings/
      service-catalog/
      notifications/ email.port.ts templates/
      audit/
      analytics/
```

---

## 36. Implementation Order

When explicitly requested, in this order (each phase done before the next):

1. Bootstrap Nest app, config, logger, health (no DB)  
2. Prisma schema + SQL follow-up (partial uniques, CHECKs, grants, composite FK); `validate` / `format`  
3. Common: filters, requestId, Zod pipe, BigInt interceptor  
4. Auth + users + rbac + cookies + lock machine + reset  
5. Locations + amenities seed  
6. Properties  
7. Listings CRUD (draft)  
8. Media  
9. Publish command + public search + public slug  
10. Leads guest + admin inbox  
11. Saved listings + `/me`  
12. Notifications emails  
13. Audit + analytics  
14. Visits and service catalog (killable)  
15. Rate limit, Helmet, `/api/docs` non-prod  
16. Tests from section 34  

Core loop first: Auth → Property → Listing → Media → Search → Lead → Admin CRM. Do not start visits/services if 6–10 slip.

---

## 37. Backend Decision Table

| # | Decision | Choice | Reason | Status |
| --- | --- | --- | --- | --- |
| 1 | Shape | Modular monolith, one Nest process | Scenario A | Frozen |
| 2 | API style | REST | Freeze; no GraphQL | Frozen |
| 3 | Version | `/api/v1` | URL version | Frozen |
| 4 | ORM | Prisma 6.x + SQL extras | ADR-003 | Frozen |
| 5 | DB | PostgreSQL 16 one primary | Freeze | Frozen |
| 6 | Repository | None; Service → Prisma | Solo speed | Frozen |
| 7 | Authn | Email/password | D3 | Frozen |
| 8 | Cookies | httpOnly access + refresh | D4 | Frozen |
| 9 | JWT | 15m `sub,iat,exp`; roles from DB | Freeze | Frozen |
| 10 | Refresh | Rotate; logout current; reuse revokes all | Section 13 | Frozen |
| 11 | Authz | Permissions + scoped 404 | Doc 10 | Frozen |
| 12 | Validation | Zod, not class-validator | D24-D1 | Frozen |
| 13 | Errors | `{ error: { code, message } }` | D24-D2 | Frozen |
| 14 | BigInt | JSON number | Safe INR range | Frozen |
| 15 | Pagination | `page` + `pageSize`; public max 24; offset > 1000 → 400 | Freeze; not `limit` | Frozen |
| 16 | Search | PostgreSQL | Doc 11 | Frozen |
| 17 | Media | S3 + 20 ORIGINAL | Doc 12 | Frozen |
| 18 | Rate limit | In-memory; Redis later | One instance | Frozen |
| 19 | Cache | HTTP/CDN/ISR; no Redis | Scenario A | Frozen |
| 20 | Email | After commit, one try | C15 | Frozen |
| 21 | Transactions | Short; no I/O inside | Section 18 | Frozen |
| 22 | Audit | Append-only interceptor | Grants | Frozen |
| 23 | Analytics | Fire-and-forget insert | No PII | Frozen |
| 24 | Swagger | `/api/docs` non-prod | Not public | Frozen |
| 25 | Testing | Doc 16 + lock/ORIGINAL | Section 34 | Frozen |
| 26 | Config | Zod env, placeholders | Section 28 | Frozen |
| 27 | Health | `/health` + `/ready` | Freeze | Frozen |
| 28 | CSRF | None while same-origin | Freeze | Frozen |
| 29 | Logout | Current refresh only | D24-D7 | Frozen |
| 30 | Me path | `GET /api/v1/me` | D24-D4 | Frozen |

---

## 38. Remaining Blocking Decisions

None that block NestJS implementation.

Non-blocking ops (not Nest architecture):

- Production `BOOTSTRAP_ADMIN_EMAIL` / hash provision  
- Final production locality list (admin data)  
- `OPS_INBOX_EMAIL` and public WhatsApp/call CTA numbers (env at deploy)

---

## 39. Final Readiness Checklist

- [x] Every P0 requirement has a module owner  
- [x] Every P0 table has a module owner  
- [x] Public, customer, admin APIs defined  
- [x] Scoped 404 / permission 403 / unauth 401  
- [x] Controllers do not use Prisma  
- [x] Prisma models not returned raw  
- [x] Transactions listed  
- [x] Races documented (publish DB, lead accepted, refresh locked, media listing lock, saves rare 101)  
- [x] BigInt JSON number frozen  
- [x] Refresh rotation frozen  
- [x] Lock expiry + DISABLED frozen  
- [x] Audit append-only frozen  
- [x] 20 ORIGINAL frozen  
- [x] Search = PostgreSQL  
- [x] Redis / OpenSearch / payments / microservices deferred  
- [x] No new P0 scope  
- [x] `/api/v1`, error envelope, in-memory rate limits (leads + auth login/register/forgot), env, tests, Swagger defined  

---

## 40. Next Deliverable

On explicit **implement**: Prisma schema + SQL migrations, then Phase 1–4 (health, config, auth). Not before.

Do not generate Nest source, `schema.prisma`, Docker, or CI YAML in this step.

---

## Explicit contradictions vs the long prompt

| Prompt suggestion | Frozen here |
| --- | --- |
| class-validator | Zod |
| `{ success, error }` | `{ error }` only |
| `ACCOUNT_LOCKED` public code | Generic `INVALID_CREDENTIALS` |
| `GET /auth/me` | `GET /api/v1/me` |
| Query `limit` / pagination `limit` | `pageSize` |
| `/health/ready` | `/ready` |
| Swagger as default public | Non-production only |
| Separate visits module | Inside `leads` |

---

## NESTJS DESIGN STATUS

```text
READY FOR IMPLEMENTATION
```

No genuine architecture blockers. Application code has not started. Await explicit implementation request.