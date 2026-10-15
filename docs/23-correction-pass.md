# Architecture Correction Pass

**Document:** Deliverable 23  
**Date:** 2026-09-26  
**Purpose:** Resolve cross-document inconsistencies before Prisma/migrations/code.  
**Does not:** Redesign the product, expand MVP, generate application code.

Related: `docs/00-architecture-freeze.md` (authoritative baseline after this pass).

---

## A. Correction summary

| ID | Issue | Previous decision | Corrected decision | Documents affected |
| --- | --- | --- | --- | --- |
| C1 | Password reset table missing from schema (only mentioned as addendum) | `password_reset_tokens` described in auth/Nest docs, not in Deliverable 06 identity section | Table is mandatory P0: hashed token, 1h expiry, single use, cascade on user delete; success revokes all refresh tokens and clears lockout | 06, 05, 07, 10, 15, 16, 22 |
| C2 | Email/phone unique only where `deleted_at IS NULL` | Soft-deleted identity could be reused | Email and phone are **globally unique** including soft-deleted rows. No reuse after delete. Unconditional UNIQUE indexes. | 06, 05, 02, 10, 16, 22 |
| C3 | `properties.city_id` and `locality.city_id` could disagree | Two independent FKs | Composite FK `(locality_id, city_id) → localities(id, city_id)` with `UNIQUE(id, city_id)` on localities. DB enforces match. Prisma via composite relation + SQL if needed. | 06, 05, 16, 22, 07 |
| C4 | Lead 24h duplicate SELECT-then-INSERT race | Implied app check was sufficient without documenting failure mode | P0: transactional SELECT+INSERT. Rare concurrent duplicate **accepted**. No Redis/DB lock. Upgrade later if measured. | 06, 02, 07, 09, 16, 22 |
| C5 | Service enquiry status inconsistent | Domain NEW/CONTACTED vs schema `varchar` | Enum `service_enquiry_status`: `NEW` \| `CONTACTED`. Admin `NEW → CONTACTED` only. Not `LeadStatus`. | 02, 05, 06, 09, 16 |
| C6 | Speculative `is_new_project` | Optional boolean on property | **Removed from MVP.** No column, DTO, form, or seed. | 02, 05, 06, 09 |
| C7 | Cookie/JWT claims not fully frozen | Roles in JWT as convenience, mixed cookie wording | Access JWT cookie 15m (`sub`,`iat`,`exp` only required). Refresh opaque hashed, httpOnly, Secure prod, SameSite=Lax. 7d customer / 1d staff. Rotate. Authz loads roles from DB. No localStorage. No JWT denylist. | 10, 07, 08, 15, 22 |
| C8 | CSRF unspecified if origin splits | Implied SameSite enough | P0: same-origin `/api` rewrite + httpOnly + SameSite=Lax, **no CSRF token**. Cross-site cookies **forbidden** until CSRF is added. | 10, 15, 18, 22 |
| C9 | Lockout state transitions incomplete | 10 failures / 15 min mentioned | Failed: increment. Threshold: set `locked_until`. Success or password reset: count=0, `locked_until` NULL. Generic errors. | 10, 16, 15 |
| C10 | IDOR might 403 after fetch | Mixed 403/404 | Scoped `WHERE` (customer `user_id`, agent `assigned_to_user_id`). Miss → **404**. Agent assign → **403**. Admin allowed. | 10, 09, 15, 16, 07 |
| C11 | Search pagination unstable / unbounded | Offset OK, scraper cap proposed | `page>=1`, `pageSize` 1–24, `offset=(page-1)*pageSize`, public `offset>1000` → **400**. Deterministic sort: primary + `id DESC`. | 11, 09, 07, 16 |
| C12 | Search perf validation missing | pg_trgm optional | Postgres only. EXPLAIN ANALYZE at 1k and 5k listings before adding trigram. No GIN unless proven. | 11, 16, 21 |
| C13 | Media orphan if storage OK / DB fail | Accept orphans in P0 | After storage success, if DB fails: **best-effort delete objects**, log leftover orphans, fail the request. No worker pipeline. | 12, 07 |
| C14 | Media security (already aligned) | Allowlist present | Freeze: JPEG/PNG/WebP only; magic+MIME+ext+size+max 8000px; UUID keys; no remote URL; no bucket listing; no private docs. | 12, 15, 16 |
| C15 | Notification failure vs lead | Already: no rollback | Freeze: email after commit, one attempt, log FAILED, **never** roll back lead. No Redis/BullMQ. | 13 (amendment note only) |
| C16 | Security doc vs implementation | Incomplete vs later docs | Align cookies, scoped 404, Argon2id, upload, SSRF, secrets, PII logs, admin noindex. | 15 |
| C17 | Tests thin on auth | Partial list | Mandatory auth/lockout/reset/IDOR/listing/property FK/lead/media/service-enquiry cases. | 16 |
| C18 | Infra topology not frozen | Recommended vs alternative | Freeze topology (one web, one API, one PG, object storage, CDN, no Redis). Providers are **choices**, not architecture. | 18, 22, 20 |
| C19 | Migration order loose | Phased groups | Frozen numbered order including `password_reset_tokens` as #2. No deferred tables. | 06 |
| C20 | Prisma vs raw SQL | Partial unique noted | Prisma is ORM. Partial unique, composite FK extras: **explicit SQL migrations**. Do not warp the model to avoid SQL. No Prisma file yet. | 06, 22 |
| C21 | Deferred entities | Listed | Must not appear in MVP migrations (owners, brokers, payments, etc.). | 06, 05 |
| C22 | Visit listing_id vs lead.listing_id | Denormalized, app should match | Keep both columns. Invariant `visit.listing_id = lead.listing_id` in the same transaction. Customer-only. Killable in week 7. | 05, 06, 07 |
| C23 | Sprint secondary vs core | Week 7 extras equal-looking | Core loop first: Auth → Property → Listing → Media → Search → SEO page → Lead → Admin CRM. Do not cut security/tests/backups for visits/services. | 21 |
| C24 | ADRs mix architecture and vendors | Hosting ADR named Vercel | Split: architecture ADRs vs provider choices. | 22 |
| C25 | Cost as implied quotes | Ranges present | Explicit: planning estimates only; verify vendor prices. | 20 |
| C26 | Traffic headroom | Scenario A only | Keep A. Design for short bursts **5–10 RPS** without redesign. Path to ~30 RPS before dedicated search. Not forecasts. | 03, 04 |

---

## B. See `docs/00-architecture-freeze.md`

---

## C. Cross-document consistency matrix

| Concept | Req 02 | Domain 05 | DB 06 | Auth 10 | API 09 | Security 15 | Testing 16 | Status |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| User | P0 register | Entity | `users` global unique email/phone | Cookies + lockout | `/auth/*` `/me` | Argon2id, no PII logs | Auth suite | Aligned |
| PasswordResetToken | Reset 1h | Entity | `password_reset_tokens` | Hashed, revoke refresh | forgot/reset | No token logging | Expired/used/revoke | Aligned |
| RefreshToken | Session | Entity | `refresh_tokens` hashed | Rotate, 7d/1d | refresh/logout | httpOnly | Rotation/logout | Aligned |
| RBAC | Roles P0 | UserRole | roles/permissions tables | Permission + scoped 404 | Admin vs public | API RBAC | 401/403/404 matrix | Aligned |
| City | Seed NCR | Entity | `cities` | — | GET cities | — | — | Aligned |
| Locality | Under city | Entity | unique (city,slug) + UNIQUE(id,city_id) | — | GET localities | — | Invalid pair DB reject | Aligned |
| Property | Asset | Aggregate | Composite FK city+locality; **no** is_new_project | Admin manage | Admin CRUD | — | FK test | Aligned |
| Listing | Offer; publish rules | Aggregate | Partial unique published (property,intent); slug unique | — | Public GET + publish commands | Untrusted description | Draft/publish/slug | Aligned |
| Media | Images P0 | Child of listing | `media` | media.manage | multipart | Magic bytes, no SSRF | MIME/size/count | Aligned |
| Lead | Guest; 24h dup | Aggregate | indexes; no unique 24h | create; scoped read | POST `{ok:true}` guest | Rate limit | Guest/dup/IDOR | Aligned (race accepted) |
| Visit | P0-thin customer | Child of lead | lead_id+listing_id | visit perms | `/me/visits` | 404 scoped | Optional week 7 | Aligned |
| SavedListing | P0 | Join | PK user+listing | own only | `/me/saved-listings` | 404 | IDOR | Aligned |
| ServiceEnquiry | Thin | Separate lifecycle | enum NEW/CONTACTED | — | POST + admin PATCH | — | Create + transition | Aligned |
| Search | Filters | Query | Postgres indexes | Public | GET listings | Offset cap | EXPLAIN later | Aligned |
| Notifications | Email after lead | NotificationLog | `notification_logs` | reset email | — | No rollback | — | Aligned |
| AuditLog | Admin mutations | Entity | `audit_logs` | — | — | Writes P0 | — | Aligned |

---

## D. Amendment notes (documents not fully rewritten)

**01 Master:** Decisions D2 Prisma, D3/D4 cookies, D5 no Redis, D8 object storage, D11 UUID, D12 guest enquiry, D14 no payments remain. Treat C2/C3/C5/C6/C7 as frozen amendments.

**02 Requirements:** See patched sections (new project removed; service status; duplicate race; lockout; 404 scoped).

**03 Traffic:** Burst 5–10 RPS; path to 30 RPS; not forecasts.

**04 Architecture:** Same topology freeze as 18; CSRF/same-origin constraint.

**05 Domain:** PasswordResetToken; global identity uniqueness; composite city/locality; no is_new_project; service enum; visit invariant; lead race.

**07 NestJS:** password_reset_tokens in identity module; JWT claims; scoped queries; media cleanup; lead transaction without claiming uniqueness.

**08 Next.js:** No localStorage; cookies only; same-origin rewrite required for CSRF freeze.

**09 API:** Service enquiry PATCH; search 400 on offset; deterministic sort; guest lead `{ok:true}`.

**11 Search:** Pagination freeze; EXPLAIN ANALYZE; deterministic order.

**13 Notifications:** No change of behavior; C15 freeze confirmed (do not roll back).

**14 Payments:** Unchanged, still deferred.

**17 Observability:** Unchanged.

**19 CI/CD:** Unchanged structure.

**20 Cost:** Planning-estimate disclaimer.

**Prisma schema / SQL files / app code:** still not generated.

---

## ARCHITECTURE STATUS

`READY FOR FINAL SCHEMA`

No remaining founder-blocking product contradictions for schema work. Provider picks (Vercel vs VPS, R2 vs S3, email vendor) may change without schema change.

Do not generate Prisma, migrations, or application code until you explicitly start implementation.
