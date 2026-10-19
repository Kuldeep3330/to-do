# NCR Homes — Project Status Report

**Document:** Deliverable 27
**Date:** 2026-10-16
**Branch state:** `main` at `453ad8b` (PR #1 merged). Remote: `github.com/Kuldeep3330/to-do`
**Audience:** the two developers and the product owner
**Purpose:** a single place that says what exists, how it was verified, what is not done, and what to do next.

> Sources: git history, the code under `apps/`, and docs 21, 26 and `DEVELOPMENT.md`. Test **counts and pass/fail results are not stated here**, because the suites were not run while writing this report. Run the commands in section 9 for current results.

---

## 1. Summary

NCR Homes is a real-estate listing platform for Delhi NCR (Delhi, Noida, Greater Noida, Ghaziabad, Gurugram). It is an npm-workspaces monorepo with a **NestJS API** (`apps/api`), a **Next.js 15 web app** (`apps/web`), and PostgreSQL, S3-compatible storage and a mail catcher run through Docker Compose.

The **core priority chain from doc 21 is built end to end**:

> Auth → Property → Listing → Media → Search → Listing page → Lead → Admin CRM

An admin can create a property, create and publish a listing with photos, and a visitor can search, view the listing and send an enquiry. Staff can then work the enquiry in the admin inbox. Frontend phases 0–8 are complete and merged.

| Area | State |
| --- | --- |
| Backend API (auth, RBAC, properties, listings, media, leads, locations, amenities, saved, dashboard, staff) | Built |
| Public site (home, search, listing detail, SEO, static pages) | Built |
| Admin (properties, listings + photos, leads CRM, staff, dashboard) | Built |
| Account area (profile, enquiries, saved homes) | Built |
| Security hardening, accessibility audits, CI with E2E | Built |
| Verified badge and listing freshness (doc 28 items 1–2) | Built 2026-10-18 |
| Visit booking (doc 28 item 3) | Built 2026-10-18 |
| Lead response timer (doc 28 item 4) | Built 2026-10-19 |
| Deal tracking (doc 28 item 5) | Built 2026-10-19 |
| Locality landing pages | Not built; promoted to the pilot scope in doc 28 |
| Services pages, maps, on-demand ISR | Deliberately not built (killable per doc 21) |
| Production deployment | Not started |

---

## 2. Timeline

| Date | Commit | What happened |
| --- | --- | --- |
| 2026-05-04 | `f0e27d4`, `5bf3a39`, `cc61800`, `f84b616` | Initial repo, a first static to-do page (`index.html`, `script.js`, `style.css` still in the root), GitHub Actions bootstrap. |
| 2026-10-15 | `e571890` | NCR Homes app added with staging hardening: design documents 00–25, the NestJS API (auth, properties, listings, media, leads, users, notifications), Prisma schema and migrations, web placeholder. |
| 2026-10-16 | `1c10f50` | Entire frontend (phases 0–8) plus the API pieces it needed. |
| 2026-10-16 | `453ad8b` | PR #1 merged into `main`. |

Update 2026-10-18: positioning defined in `docs/28-positioning-and-mvp-scope.md`; verified badge and listing freshness built (migration `20261018120000_listing_verification`). Uncommitted at the time of writing: `apps/api/prisma/seed-demo.ts` and a one-line `package.json` script (`prisma:seed:demo`). See section 8.

---

## 3. Architecture at a glance

```text
Browser ──► Next.js (apps/web, :3100) ──/api/*──► NestJS (apps/api, :3001) ──► PostgreSQL (:5433)
                  same-origin rewrite, httpOnly cookies         │
                                                                ├──► S3 storage (RustFS, :9000)
                                                                └──► SMTP (Mailpit, :1025 / UI :8025)
```

Principles that are enforced in the code:

1. **NestJS owns the domain.** The web app never touches Postgres and does not re-implement publish rules, duplicate-lead windows or RBAC.
2. **Same-origin API.** The browser calls `/api/v1/*` through a Next rewrite. Tokens live only in httpOnly cookies, never in `localStorage`.
3. **Public pages are server-rendered** (ISR); the admin and account areas are client-rendered with TanStack Query.
4. **The URL is the state** for search and filters.
5. **Money is integer INR**, formatted with `Intl.NumberFormat('en-IN')`.

Stack: Next.js 15 (App Router, React 19, TypeScript strict), Tailwind v4 with design tokens, Radix primitives, React Hook Form + Zod, TanStack Query/Table, NestJS, Prisma 6, PostgreSQL 16, Jest, Vitest, Playwright.

---

## 4. Backend (`apps/api`)

Prefix `/api/v1`. Validation is Zod DTOs (also the source of truth for the web forms).

| Module | What it provides |
| --- | --- |
| **auth** | Register, login, refresh with rotation, logout, forgot/reset password. Account lock state machine after repeated failures, auth rate-limit guard, httpOnly cookie handling. |
| **rbac** | Roles `CUSTOMER`, `SALES_AGENT`, `ADMIN`, `SUPER_ADMIN`; 17 permissions; a permissions guard. |
| **users** | `me` profile, plus admin staff management (`GET/POST /admin/users`, `GET /admin/staff`). Disabled users are rejected immediately (fixed: previously worked until the access token expired). |
| **locations** | Cities and localities (public read, admin create). |
| **amenities** | Amenity catalogue (public read). |
| **properties** | Admin CRUD. Fixed: archived properties could never be listed. |
| **listings** | Admin CRUD and public read by slug; publish / pause / close with invariant checks; public search with filters and sorting; slug allocation with collision retry. Admin detail now returns the media list. |
| **media** | Image upload, validation, derived renditions (ORIGINAL / CARD / DETAIL, 1600px for the gallery), reorder, delete. Storage is behind a port with S3 and in-memory adapters. |
| **leads** | Public enquiry (`POST /leads`) with duplicate-window and rate limiting, admin inbox, status workflow, assignment. |
| **saved** | Saved listings: list, add, remove. |
| **dashboard** | Admin dashboard counts. |
| **notifications** | Email port with SMTP, log and in-memory adapters; used by password reset and lead notifications. |
| **audit** | Audit service, decorator and interceptor, promoted from `.wip`. |
| **health** | `/health` and `/ready`. |

**Data model** (Prisma, 22 models): users, roles, permissions, refresh and password-reset tokens, cities, localities, amenities, properties, listings, media, leads, visits, saved listings, service catalogue and enquiries, audit logs, analytics events, notification logs. Visits, service enquiries and analytics tables exist in the schema, but there is no feature code on top of them yet.

**Seed data** (`npm run db:seed`): RBAC roles and permissions, 5 NCR cities with localities, 10 amenities, 5 service catalogue items, and a bootstrap super admin from `BOOTSTRAP_ADMIN_*`. Catalogue seeding is skipped in production.

---

## 5. Frontend (`apps/web`)

### 5.1 Routes

| Area | Routes |
| --- | --- |
| Public | `/`, `/search`, `/buy/[city]/[locality]/[slug]`, `/rent/[city]/[locality]/[slug]`, `/about`, `/contact`, `/privacy`, `/terms` |
| Auth | `/login`, `/register`, `/forgot-password`, `/reset-password` |
| Account | `/account`, `/account/enquiries`, `/account/saved` |
| Admin | `/admin`, `/admin/properties` (+ `new`, `[id]`), `/admin/listings` (+ `new`, `[id]`), `/admin/leads` (+ `[id]`), `/admin/users` |
| Generated | `sitemap.ts`, `robots.ts`, `not-found.tsx`, `error.tsx` |

### 5.2 Delivery phases (from doc 26)

| Phase | Scope | Status |
| --- | --- | --- |
| 0 | Environment: RustFS replaces the unpullable MinIO image, configurable ports, Mailpit, `DEVELOPMENT.md` | Done |
| 1 | Foundation: Tailwind v4 tokens, UI kit, typed API client with single-flight token refresh, auth pages, route guards, role-aware admin shell | Done |
| 2 | Properties and locations: admin property CRUD, locations and amenities API | Done |
| 3 | Listings and media: listing CRUD, photo manager (upload, reorder, delete), publish/pause/close with a requirements checklist | Done |
| 4 | Public discovery: home, URL-driven search with filters, sort and chips, mobile filter sheet, ISR | Done |
| 5 | Listing detail and SEO: gallery, canonical redirects, metadata, Open Graph, JSON-LD, sitemap, robots, real 404s | Done |
| 6 | Enquiry and lead CRM: enquiry form (desktop card, mobile sheet), admin inbox, status workflow, assignment | Done |
| 7 | Account and extras: profile, my enquiries, saved homes, dashboard counts, staff management | Done |
| 8 | Hardening: CSP and security headers, no-store on signed-in pages, axe audits, CI with E2E | Done |

---

## 6. Quality and delivery

**Backend tests (Jest, 30+ spec files):** unit tests for DTOs, services, mappers, guards, the lock state machine, slug utilities, env parsing and rate limiting; HTTP specs for auth, leads, listings, listings search, locations, media, properties, saved listings and admin users. The HTTP specs share one database (`ncr_homes_test`) and run in band.

**Frontend unit tests (Vitest):** API client, auth hook, formatters, search-param handling, listing and property schemas, auth forms, media manager.

**E2E (Playwright, 8 spec files):** auth, admin properties, admin listings, listing detail, search, enquiry and account, staff and dashboard, security and accessibility.

**CI (`.github/workflows/main.yml`):** typecheck, API tests against Postgres, web unit tests and production build, then Playwright E2E with traces uploaded as an artifact.

---

## 7. Known gaps and follow-ups

From doc 26, still open:

1. **Amenities are missing on the public listing detail.** The public listing API does not return them yet, so the page cannot show them.
2. **CSP allows `'unsafe-inline'` scripts** because Next.js needs it without per-request nonces. Moving to nonces is the next hardening step.
3. **Password reset has not been exercised end to end against real SMTP.** Locally, mail is logged or captured by Mailpit.
4. **One React hydration warning (#418)** was seen once on a cold server start and could not be reproduced in 40+ page loads.
5. **Legal pages are draft text** and need review before launch.

Other observations:

6. **No local clean-up of old artifacts.** `.wip/` is tracked in git and holds a stale `tsconfig.tsbuildinfo` plus snapshot copies of week 3 files that have since been integrated and evolved in `apps/api`. Only `modules-analytics` and `response.ts` have no counterpart. Decide whether to restore the analytics module or delete `.wip`.
7. **The original to-do app files** (`index.html`, `script.js`, `style.css`, `start.sh`) are still in the repo root and unrelated to NCR Homes.
8. **Demo listings have no photos**, since they were inserted directly rather than uploaded through the media pipeline.
9. **No deployment target is built.** Docs 18 and 19 describe infrastructure and CI/CD, but nothing is provisioned from this repo yet.

---

## 8. Local environment and demo data

Setup, ports and troubleshooting are in `docs/DEVELOPMENT.md`. Current local ports: web `:3100`, API `:3001`, Postgres `:5433`, RustFS `:9000` (console `:9001`), Mailpit `:8025`.

**Seeded logins (dev only):**

| Role | Email | Password | Source |
| --- | --- | --- | --- |
| Super admin | `admin@example.com` | `ChangeMeAdmin1` | `BOOTSTRAP_ADMIN_*` in `.env`, via `npm run db:seed` |
| Admin | `admin@demo.ncrhomes.in` | `Demo@12345` | `npm run prisma:seed:demo` (in `apps/api`) |
| Sales agent | `agent@demo.ncrhomes.in` | `Demo@12345` | same |
| Customer | `customer@demo.ncrhomes.in` | `Demo@12345` | same |

`seed-demo.ts` adds 12 published listings across all five cities (buy and rent; flats, villa, plot, office), amenity links and 5 sample leads in mixed statuses. It is idempotent, resets the demo passwords on re-run, and refuses to run when `NODE_ENV=production`. These credentials must never be used outside local or staging environments.

---

## 9. How to verify the current state

```bash
npm run typecheck
npm test                  # API Jest suite (needs the ncr_homes_test database, see DEVELOPMENT.md)
npm run test:web          # web Vitest suite
npm run test:e2e -w apps/web   # Playwright (needs API and web running)
```

---

## 10. Recommended next steps

In priority order:

1. **Commit the demo seed** (`seed-demo.ts` and the script) and decide on the `.wip` and legacy to-do files clean-up.
2. **Close the amenities gap:** return amenities from the public listing API and render them on the detail page.
3. **Staging deployment** using docs 18 and 19, with a real SMTP provider so password reset can be verified.
4. **Review the legal pages** and move CSP to nonces before launch.
5. **Reconsider the killable features** (visit requests, services pages, locality landing pages) once launch scope is confirmed. The schema for visits and service enquiries already exists.
6. **Doc 21 weeks 8–9** (hardening and launch path): load check against doc 03 capacity assumptions, backups, monitoring (doc 17), and a launch checklist.
