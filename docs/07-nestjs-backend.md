# Real Estate Platform — NestJS Backend Architecture

**Document:** Deliverable 07 / Step 7  
**Depends on:** `docs/04-architecture.md`, `docs/05-domain-model.md`, `docs/06-database-schema.md`  
**Status:** Corrected — Architecture Freeze v1 — superseded on Nest module/API detail by `docs/25-nestjs-backend-api-design.md`  
**Date:** 2026-09-26  
**Out of this document:** Application source files, runnable Prisma schema, OpenAPI YAML

---

## 1. Process shape

One NestJS application, one Node process, modular monolith.

```text
apps/api/
  src/
    main.ts
    app.module.ts
    common/
    config/
    prisma/
    modules/
```

`main.ts`: JSON logger, global validation, CORS off in prod if same-origin rewrite, global prefix `api/v1` except health.

---

## 2. Folder map

```text
src/common/
  filters/http-exception.filter.ts
  interceptors/request-id.interceptor.ts
  interceptors/audit.interceptor.ts      # admin mutations only
  guards/jwt-auth.guard.ts
  guards/permissions.guard.ts
  decorators/current-user.decorator.ts
  decorators/permissions.decorator.ts
  decorators/public.decorator.ts
  dto/pagination.query.ts
  errors/app.error.ts                    # domain errors → HTTP catalog
  pipes/zod-validation.pipe.ts

src/config/
  env.ts                                 # zod-parse process.env

src/prisma/
  prisma.module.ts
  prisma.service.ts

src/modules/
  health/
  auth/
  users/
  rbac/
  locations/
  amenities/
  properties/
  listings/
  media/
  leads/
  visits/                                # can live inside leads module
  saved-listings/
  service-catalog/
  notifications/
  audit/
  analytics/
```

`visits` as a folder inside `leads` is preferred (same aggregate).

---

## 3. Module dependency rules

Allowed imports (downstream):

```text
listings → properties, media, locations
properties → locations, amenities
leads → listings, users, notifications (port)
auth → users, rbac
saved-listings → listings, users
service-catalog → notifications (port)
audit ← used by interceptors / services, not imported by listings
```

Forbidden:

- `listings` → `leads`
- `notifications` → `leads` (notifications accepts a command DTO)
- circular `users` ↔ `leads` (leads may import UsersModule exports only if UsersModule does not import Leads)

`forwardRef` is a smell; do not use it in P0.

---

## 4. Layering inside a module

Example: `listings`

| Layer | Responsibility | Must not |
| --- | --- | --- |
| Controller | HTTP, auth metadata, DTO in/out | Prisma, business invariants |
| Service | Commands/queries, invariants, transactions | Express objects |
| Repository (optional) | Prisma queries | HTTP status codes |

P0: Service + PrismaService is enough if queries stay in that module. Extract repository when a service exceeds ~300 lines.

---

## 5. Controllers (ownership)

Public (Jwt optional):

- `ListingsPublicController` — GET search, GET by slug  
- `LeadsPublicController` — POST create  
- `LocationsPublicController` — GET cities, localities  
- `ServiceCatalogPublicController` — GET items, POST enquiry  
- `AuthController` — register, login, refresh, logout, forgot, reset  

Customer (Jwt + CUSTOMER):

- `MeController` — GET/PATCH me  
- `SavedListingsController`  
- `MyLeadsController` — GET mine  
- `VisitsController` — POST mine  

Admin (`listing.manage` etc.):

- `AdminPropertiesController`  
- `AdminListingsController`  
- `AdminMediaController`  
- `AdminLeadsController`  
- `AdminLocationsController`  
- `AdminUsersController` (super/admin)  
- `AdminDashboardController`  

Health: `@Public()` `HealthController` at `/health` and `/ready` **outside** `api/v1` or documented exception.

---

## 6. Guards and public routes

Order: `JwtAuthGuard` global → skip if `@Public()` → `PermissionsGuard` if `@RequirePermissions(...)`.

Resource ownership is **not** a guard. Example: `leadsService.getForUser(id, user)` returns NOT_FOUND if other customer's id.

Agent: `findAll` filters `assigned_to_user_id = currentUser.id` unless `lead.read_all`.

---

## 7. DTO and validation

- One Zod schema per command/query, inferred types.  
- Shared schemas later in `packages/types`; P0 may live in `apps/api` and be copied/imported by web when monorepo exists.  
- Never `any`. Extra fields stripped (`passthrough` off).  
- Pagination: `page` default 1, `pageSize` default 12 public / 20 admin, max 24 public / 50 admin.  

Response envelope **proposed**:

```text
Success list: { data: T[], meta: { page, pageSize, total } }
Success one:  { data: T }
Error:        { error: { code, message, details[] } }
```

Do not wrap health checks.

---

## 8. Error mapping

| Domain | HTTP | code |
| --- | --- | --- |
| Validation | 400 | VALIDATION_ERROR |
| Unauthenticated | 401 | UNAUTHENTICATED |
| Forbidden | 403 | FORBIDDEN |
| Not found / not visible | 404 | NOT_FOUND |
| Duplicate slug / unique | 409 | CONFLICT |
| Publish invariant failed | 409 | CONFLICT |
| Rate limit | 429 | RATE_LIMITED |
| Upload type | 415 | UNSUPPORTED_MEDIA |
| Upload size | 413 | PAYLOAD_TOO_LARGE |
| Unexpected | 500 | INTERNAL_ERROR |

Lead IDOR: 404 not 403.

---

## 9. Transactions (must use `$transaction`)

1. `CreateLead` — transactional select recent duplicate + insert. Rare concurrent duplicate is an **accepted P0 trade-off** (no Redis, no 24h unique index)  
2. `PublishListing` — count media, load property completeness, update status  
3. `CreateVisit` — insert visit, maybe insert lead, maybe update lead status  
4. `RotateRefreshToken` — revoke old, insert new  

Email **after** commit.

---

## 10. Auth implementation notes

- Access JWT cookie: `sub`, `iat`, `exp` only required; ~15 min; do not authorize from role claims  
- Refresh: random 32+ bytes, store SHA-256, ~7 days customer / ~1 day staff, rotate; reuse → revoke all user refresh tokens  
- Password: argon2id (preferred) or bcrypt cost ≥ 12  
- Reset: table `password_reset_tokens` (schema step 2). Hashed, 1h, single use. Success transaction: mark used, new hash, revoke all refresh, clear lockout  
- Resource GET/PATCH: scoped WHERE; miss → 404  
- Rate limit login/register/forgot in middleware

---

## 11. Media upload

`POST /api/v1/admin/listings/:id/media` multipart.

Flow: auth → listing exists → count < 20 → magic-byte + MIME + extension + size ≤ 8 MB + max 8000px → upload ORIGINAL → sync sharp CARD/DETAIL → insert rows → return URLs.

If storage succeeds and DB fails: best-effort delete objects, log orphans, fail the request. No media worker in MVP.

Storage port: `ObjectStoragePort.put/delete/publicUrl`. Adapter: S3 SDK. Local: MinIO.

---

## 12. Notifications port

```text
interface EmailPort {
  send(input: { to, subject, html, text, idempotencyKey? }): Promise<{ id: string }>
}
```

`NotificationsModule` exports `NotificationService`. Templates are functions or files in `notifications/templates/`. No React email required in P0; simple HTML strings.

---

## 13. Listing search query (service)

Parameters whitelist only. Build Prisma `where`:

- status PUBLISHED, deletedAt null, property.deletedAt null  
- intent, property.city.slug, property.locality.slug, property.type, bedrooms, furnishing  
- priceAmount gte/lte, areaValue gte/lte  
- title contains q (insensitive) if q length ≥ 2  

Order: publishedAt desc | priceAmount asc/desc.

Select a public DTO — never `password_hash`, never owner fields (none exist), never internal_title unless admin.

---

## 14. Audit

Admin controllers tagged `@Audit()`. Interceptor writes `audit_logs` after successful 2xx with entity id from result.

Do not audit GET.

---

## 15. Analytics

`AnalyticsService.track({ name, listingId, userId, properties, requestId })` fire-and-forget insert (catch errors). Call from listings GET slug, search, lead create.

---

## 16. Config keys (names only, no values)

`DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_PUBLIC_BASE_URL`, `MAIL_FROM`, `OPS_INBOX_EMAIL`, `PUBLIC_APP_URL`, `RATE_LIMIT_ENABLED`, `SENTRY_DSN`.

User project env names, not platform LLM keys.

---

## 17. Testing (API)

- Unit: lead duplicate logic, listing publish invariants, RBAC mapping, state transitions  
- Integration: supertest + testcontainers/compose Postgres — register, publish listing, public search, guest lead, IDOR  

---

## 18. What not to build

Nest CQRS kit, GraphQL, Kafka microservice transport, generic workflow engine, tenancy middleware.

---

## 19. Next

Step 8 — Next.js frontend architecture (`docs/08-nextjs-frontend.md`).
