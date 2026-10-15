# Architecture Freeze v1

**Document:** Authoritative baseline after Deliverable 23 correction pass  
**Date:** 2026-09-26  
**Status:** Frozen for schema work — not an implementation go-ahead  
**Supersedes conflicting text in drafts 01–22 where they disagree with this file**

This is the single baseline. Provider names below are **choices**, not architecture.

---

## Architecture

Modular monolith. One Next.js web app. One NestJS API process. One PostgreSQL primary. Object storage for bytes. CDN for public assets.

Same-origin: browser talks to Next.js; `/api` rewrites to NestJS. No cross-site cookies in P0.

No microservices, Kubernetes, Kafka, Elasticsearch/OpenSearch, Redis, BullMQ, workers, GraphQL, CQRS/event sourcing, multi-region, service mesh, payments, broker/owner/provider marketplaces.

```text
Browser
  → CDN / DNS / HTTPS
  → Next.js
  → same-origin /api rewrite
  → NestJS API (one instance)
  → PostgreSQL (one instance)
  → Object storage
Email provider is external.
```

Short bursts **5–10 RPS** without redesign. Path to ~**30 RPS** (CDN, second API, then Redis) before dedicated search. Scenario A planning assumptions (not forecasts): 50–300 listings, 50–300 DAU, 0.1–1 typical peak JSON RPS, 2–20 leads/day.

---

## Stack

| Layer | Architecture | Provider choice (replaceable) |
| --- | --- | --- |
| Web | Next.js App Router, TypeScript | Vercel or equivalent |
| API | NestJS, TypeScript, Docker | Small VPS or PaaS |
| ORM | Prisma + explicit SQL where Prisma cannot express | — |
| DB | PostgreSQL, managed | Neon / RDS / Render / etc. |
| Media | S3-compatible API, public listing images | R2 preferred for egress |
| Email | `EmailPort` adapter | Resend / SES / Postmark |
| Errors | Process + Sentry-class tracker | Sentry |
| CI | GitHub Actions (or equivalent) | GitHub |

---

## Database

- UUID PKs. `timestamptz`. Soft delete where specified. Money integer INR.  
- **Email and phone globally unique** (including soft-deleted users). Unconditional UNIQUE.  
- **`password_reset_tokens` is P0.**  
- **Property city/locality:** composite FK `(locality_id, city_id) → localities(id, city_id)`.  
- **No `is_new_project`.**  
- **Service enquiry status enum:** `NEW` \| `CONTACTED` (not LeadStatus).  
- Partial unique: one `PUBLISHED` listing per `(property_id, intent)` among non-deleted.  
- Listing slug unique among non-deleted; immutable after first publish.  
- Lead 24h duplicate: application transaction; rare race accepted.  
- Visit: `lead_id` + `listing_id`; must equal `lead.listing_id` in the same transaction.  
- No deferred tables (owners, brokers, payments, quotations, work_orders, KYC, property_units, lead_notes, …).  
- Prisma cannot express some indexes/FKs → raw SQL migrations. Do not warp the model.

**Migration order (frozen):**

1. users  
2. password_reset_tokens  
3. roles  
4. permissions  
5. role_permissions  
6. user_roles  
7. refresh_tokens  
8. cities  
9. localities  
10. amenities  
11. properties  
12. property_amenities  
13. listings  
14. media  
15. leads  
16. visits  
17. saved_listings  
18. service_catalog_items  
19. service_enquiries  
20. audit_logs  
21. analytics_events  
22. notification_logs  

---

## Authentication

- Email/password. Guest enquiry allowed. No OTP, no Google, no localStorage.  
- Access: JWT ~15 min, httpOnly cookie, Secure in production, SameSite=Lax. Claims: `sub`, `iat`, `exp`. Roles in JWT optional convenience only.  
- Refresh: opaque random, hashed in DB, httpOnly, Secure prod, SameSite=Lax, ~7d customer / ~1d staff, rotate on use.  
- Authz: load roles/permissions from DB (or ≤30s process cache). No JWT denylist.  
- CSRF: none in P0 **because** same-origin rewrite. If API is cross-site, add CSRF **before** enabling that deploy.  
- Forgot/reset: hashed token, 1 hour, single use. Success: mark used, new password hash, **revoke all refresh tokens**, `failed_login_count=0`, `locked_until=NULL`. Does **not** reactivate `DISABLED`.  
- Lockout: 10 failures / email / 15 min → `status=LOCKED`, `locked_until=now+15m`. Login while lock active → generic reject. **Expired lock:** app sets `ACTIVE`, `locked_until=NULL`, `failed_login_count=0` before credential check. Success (non-DISABLED): count=0, locked_until=NULL, status=ACTIVE. **DISABLED never auto-unlocks.** Generic invalid-credential messages.  
- Password: Argon2id preferred; bcrypt cost ≥12 acceptable.  
- Public register → CUSTOMER only.

---

## Authorization

- Permission codes on API. Resource access via **scoped queries**.  
- Customer other-user resource → **404**.  
- Agent unassigned lead GET/PATCH → **404**.  
- Agent assign leads → **403**.  
- Admin/Super Admin per permission matrix. Only Super Admin grants Super Admin.

---

## Search

PostgreSQL filters + B-tree. No OpenSearch.

- `page >= 1`, `pageSize` 1–24, `offset = (page-1)*pageSize`  
- Public `offset > 1000` → **400**  
- Deterministic order: e.g. `published_at DESC, id DESC`; price sorts add `id DESC`  
- EXPLAIN ANALYZE at 1k and 5k listings before `pg_trgm`  
- No unnecessary GIN  

---

## Media

- Object storage; metadata in `media`. JPEG/PNG/WebP only.  
- 8 MB, **MAX ORIGINAL MEDIA PER LISTING = 20** (CARD/DETAIL do not count; up to 60 rows). Count with `variant = ORIGINAL`. Max dimension 8000px. Magic bytes + MIME + extension. UUID object keys. No remote URL ingest. No bucket listing. No private docs.  
- Multipart through API. Sync sharp CARD/DETAIL acceptable.  
- Storage OK / DB fail: delete objects best-effort, log orphans, fail request.  
- Cannot delete last ORIGINAL of a PUBLISHED listing.

---

## Notifications

Email only. After commit. One attempt. Failure logged. **Does not roll back** lead/enquiry/user writes. No Redis/BullMQ until latency, retries, slow images, or multi-instance jobs require it.

---

## Infrastructure and deployment

One Next.js deployment, one API instance, one Postgres, object storage, CDN. Managed Postgres with backups. No Redis/worker/search cluster/K8s.

Exact vendors are provider choices.

---

## Testing

CI: lint, typecheck, unit, integration if Postgres available, build.

Required coverage: auth (register, no admin self-register, duplicate identity, login, lockout reset, refresh rotation, logout, reset token states, reset revokes refresh), RBAC/IDOR 401/403/404, listing publish invariants, property city/locality DB reject, leads guest/dup, media allowlist, service enquiry NEW→CONTACTED, E2E search→enquiry.

---

## Observability

JSON logs + requestId. Mask phone/email. Never log passwords/tokens/cookies. Sentry. `/health` and `/ready`. No distributed tracing in MVP.

---

## Backup

Managed Postgres daily snapshot, 7–14 day retention. RPO ≤ 24 h, RTO ≤ 8 h. Restore drill before launch. Bucket versioning.

---

## Scaling strategy

1. CDN + image variants  
2. Second API instance  
3. Redis (rate limit / cache)  
4. Larger Postgres / replica  
5. OpenSearch only after ~50k listings **and** search p95 > 500 ms after indexes, or ranking PostgreSQL cannot do  

---

## Deferred (not in MVP schema or code)

Owner self-listing, brokers, commissions, service providers, quotations, work orders, transactions, payments, subscriptions, reviews, documents/KYC, property units, follow-ups, lead notes, chat, WhatsApp API, SMS OTP, push, Elasticsearch, Kubernetes, microservices.

---

## Next allowed step

Schema blueprint is frozen (`docs/24-final-postgresql-prisma-design.md`). NestJS module/API blueprint is `docs/25-nestjs-backend-api-design.md`. Prisma files and application code only when explicitly requested.

**ARCHITECTURE STATUS:** `READY FOR NESTJS IMPLEMENTATION`
