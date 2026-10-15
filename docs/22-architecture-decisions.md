# Real Estate Platform — Architecture Decision Records

**Document:** Deliverable 22 / ADRs  
**Depends on:** `docs/01-system-design-master.md`  
**Status:** Corrected — Architecture Freeze v1  

Distinguish:

- **Architecture ADRs** (001–006, 008–010, plus 011–013 below): changing these is a redesign.  
- **Provider choices** (hosting vendor, R2 vs S3, email vendor, Sentry): replaceable without a new architecture. ADR-007 is reclassified as a provider note, not an architecture requirement.  
**Date:** 2026-09-26  

Format per ADR: Decision, Context, Alternatives, Reason, Consequences, Status.

---

# ADR-001 Modular monolith

## Decision

Build one NestJS API process with module boundaries; one Next.js web app. No microservices.

## Context

Solo developer, Scenario A traffic, 60–70 day window. Prompt asked to prefer modular monolith.

## Alternatives

- Microservices per domain (leads, listings, media)  
- Modular monolith (chosen)  
- Serverless functions as the domain layer  

## Decision Reason

Network boundaries would dominate the calendar. Modules can be extracted later if load or team splits (search, media, notifications).

## Consequences

Single deploy, shared DB, discipline required to avoid circular imports (documented in `docs/07-nestjs-backend.md`).

## Status

Accepted (architecture)

## Date

2026-09-26

---

# ADR-002 PostgreSQL as system of record and search

## Decision

PostgreSQL stores all P0 entities and serves listing search via B-tree (and optional trigram later). No Elasticsearch/OpenSearch in MVP.

## Context

50–300 listings; peak JSON RPS < 1. Real estate filters are equality/range.

## Alternatives

- OpenSearch from day one  
- MongoDB for listings  
- Postgres only (chosen)  

## Decision Reason

Ops cost of a search cluster is unjustified. Threshold to revisit: ~50k listings or search p95 > 500 ms after indexes.

## Consequences

Must write the right composite/partial indexes. Keyword relevance will be weak (`ILIKE` on title).

## Status

Accepted (architecture)

## Date

2026-09-26

---

# ADR-003 Prisma ORM

## Decision

Use Prisma for migrations and queries. Raw SQL allowed for partial unique indexes and EXPLAIN-driven search if Prisma cannot express them.

## Context

You already know Prisma + NestJS + PostgreSQL.

## Alternatives

- Drizzle (closer to SQL)  
- Kysely  
- TypeORM  
- Prisma (chosen)  

## Decision Reason

DX and type safety speed a solo MVP. QPS is too low for ORM overhead to matter.

## Consequences

Partial unique index for one published listing per (property, intent) needs a SQL migration alongside Prisma.

## Status

Accepted (architecture). Prisma is frozen. Raw SQL allowed for partial unique indexes and composite FKs.  
## Date

2026-09-26

---

# ADR-004 No Redis in MVP

## Decision

Do not deploy Redis or BullMQ until a second API instance, async image pipeline, or email retry queue is required.

## Context

5–50 emails/day, one API process, Scenario A.

## Alternatives

- Redis from day one for cache, sessions, rate limit, queues  
- In-memory rate limit + sync email (chosen)  

## Decision Reason

Another moving part to back up, monitor, and fail. In-memory limiter is honest about single-instance.

## Consequences

Horizontal scale of API requires adding Redis (or sticky limiter). Documented.

## Status

Accepted (architecture)  
## Date

2026-09-26

---

# ADR-005 Object storage for media

## Decision

S3-compatible bucket for images; Postgres holds metadata only. Multipart upload through API. Public-read listing photos via CDN.

## Context

Media-heavy product; BYTEA in Postgres is a trap.

## Alternatives

- Postgres BYTEA  
- Cloudinary as system of record  
- S3-compatible (chosen; R2 preferred for egress)  

## Decision Reason

Portable, cheap, correct. Cloudinary is an optional later convenience, not the source of truth.

## Consequences

Need bucket credentials, public URL config, magic-byte checks. Storage-then-DB failure: best-effort object delete, log orphans, fail the request. **R2 vs S3 is a provider choice**, not this ADR.

## Status

Accepted (architecture). Vendor is a provider choice.  
## Date

2026-09-26

---

# ADR-006 Authentication strategy

## Decision

Email/password for customers and staff. Access JWT ~15 min in httpOnly cookie (`sub`,`iat`,`exp`). Rotating hashed refresh in httpOnly cookie (7d customer / 1d staff). Secure in production, SameSite=Lax. Authorization loads roles from DB. No OTP, no Google, no localStorage, no JWT denylist. Guest enquiry allowed. CSRF token not used while same-origin `/api` rewrite holds.

## Context

India mobile-first UX vs SMS cost. Admin needs password anyway.

## Alternatives

- Phone OTP first  
- NextAuth/Auth0 as IdP  
- localStorage JWT  
- Email/password + httpOnly cookies (chosen)  

## Decision Reason

Cheapest secure path; one identity store in NestJS; XSS-resistant cookies; guest conversion preserved.

## Consequences

Email deliverability required for reset. Phone OTP can be added as a second factor/login later.

## Status

Accepted (architecture)  
## Date

2026-09-26

---

# ADR-007 Hosting topology vs providers

## Decision

**Architecture:** Next.js deployment + one API process + managed Postgres + object storage + CDN + same-origin `/api`. No Redis, K8s, multi-region.

**Provider choice (not architecture):** Vercel or equivalent for web; VPS/PaaS for API; R2/S3; any managed Postgres with backups.

## Context

Solo ops, Scenario A, SEO important.

## Alternatives

- All-in-one VPS Compose  
- All serverless  
- Kubernetes  
- Split Vercel + managed DB + small API (chosen)  

## Decision Reason

SEO/DX for web; control for API uploads; backups for DB. K8s is unjustified.

## Consequences

Two deploy targets; `/api` rewrite to API origin. All-VPS remains an acceptable cheaper fallback.

## Status

Accepted topology (architecture). Specific vendors are provider choices.  
## Date

2026-09-26

---

# ADR-008 Property vs Listing

## Decision

Separate aggregates. Public URLs and enquiries attach to Listing. At most one PUBLISHED listing per (property, intent).

## Context

A home can be sold then rented; coupling asset to one offer would force data duplication.

## Alternatives

- Single `properties` row with price/intent  
- Split (chosen)  

## Decision Reason

Matches the product’s long-term truth; small extra join cost.

## Consequences

Admin UX is two-step (asset then offer). Search always joins.

## Status

Accepted (architecture)

## Date

2026-09-26

---

# ADR-009 Public IDs are UUIDs; URLs use slugs

## Decision

UUID primary keys. Listing pages use immutable slug after first publish.

## Context

Sequential ids make leads enumerable.

## Alternatives

- bigint PKs + slug  
- UUID + slug (chosen)  

## Decision Reason

IDOR hardness for `/api/v1/admin/leads/:id` and customer resources.

## Consequences

Slightly larger indexes; no meaningful cost at this scale.

## Status

Accepted (architecture)  
## Date

2026-09-26

---

# ADR-010 Payments out of MVP

## Decision

No payment tables, no Razorpay integration in the 60–70 day build.

## Context

No chargeable user journey at launch.

## Alternatives

- Integrate Razorpay now “for later”  
- Defer (chosen)  

## Decision Reason

Dead payment code is a fraud/security surface. Extensibility is recorded in `docs/14-payments.md`.

## Consequences

Service marketplace and token money require a later project.

## Status

Accepted (architecture)

## Date

2026-09-26

---

# ADR-011 Identity uniqueness after soft delete

## Decision

`users.email` and `users.phone` are globally unique, including soft-deleted rows. Unconditional UNIQUE indexes. Soft delete does not free identity for reuse.

## Context

Partial unique `WHERE deleted_at IS NULL` would allow a new account to inherit an old email/phone and confuse login, reset, and lead ownership.

## Alternatives

- Reuse after soft delete (rejected for MVP)
- Anonymize identity on delete (P1 possible)
- Global unique (chosen)

## Decision Reason

Avoids takeover edge cases and audit ambiguity at negligible cost at Scenario A.

## Consequences

Cannot register the same email/phone after delete without admin intervention.

## Status

Accepted (architecture)

## Date

2026-09-26

---

# ADR-012 Property city/locality composite FK

## Decision

`localities UNIQUE (id, city_id)` and `properties FOREIGN KEY (locality_id, city_id) REFERENCES localities (id, city_id)`. Database enforces city/locality match. Prisma + raw SQL if needed.

## Context

Two independent FKs allowed a locality in Noida with city Delhi.

## Alternatives

- Application-only validation (rejected)
- Store only locality_id and derive city (also valid; we keep both columns for query convenience **and** composite FK)

## Decision Reason

Integrity belongs in the database for an inventory product.

## Status

Accepted (architecture)

## Date

2026-09-26

---

# ADR-013 Lead duplicate race accepted in P0

## Decision

24h phone+listing duplicate detection is transactional SELECT+INSERT. A rare concurrent duplicate is accepted. No Redis, no time-window unique index.

## Context

True 24h uniqueness is awkward in SQL without extra columns/hash. Scenario A lead volume is 2–20/day.

## Alternatives

- Advisory lock / Redis lock (rejected)
- Unique constraint on a rounded time bucket (deferred)

## Decision Reason

Engineering cost exceeds harm of a double ops email at this volume.

## Status

Accepted (architecture)

## Date

2026-09-26

