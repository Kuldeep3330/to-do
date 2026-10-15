# NCR Homes — Frontend Delivery Plan

**Document:** Deliverable 26
**Depends on:** `docs/02-requirements-specification.md`, `docs/08-nextjs-frontend.md`, `docs/09-api-specification.md`, `docs/21-sprint-plan.md`, `docs/25-nestjs-backend-api-design.md`
**Status:** Draft for team approval
**Date:** 2026-10-15
**Audience:** the two developers building `apps/web`

Doc 08 describes the *intended* frontend architecture. This document turns it into an executable, phase-by-phase build plan, checked against what the API in `apps/api` actually implements today. Where the two disagree, the code wins and the gap is listed in section 3.

---

## 0. Delivery status (updated 2026-10-16)

| Phase | Status | Notes |
| --- | --- | --- |
| 0 Environment | Done | RustFS replaces the unpullable MinIO image; configurable ports; Mailpit; `docs/DEVELOPMENT.md`. |
| 1 Foundation | Done | Tailwind v4 tokens, UI kit, typed API client with single-flight refresh, auth pages, route guards, role-aware admin shell. |
| 2 Properties + locations | Done | Locations/amenities API promoted from `.wip`; admin property CRUD. Fixed: archived properties could never be listed. |
| 3 Listings + media | Done | Listing CRUD, photo manager (upload, reorder, delete), publish/pause/close with requirement checklist. API now returns the media list on admin listing detail. |
| 4 Public discovery | Done | Home, URL-driven search with filters/sort/chips, mobile filter sheet, ISR. |
| 5 Listing detail + SEO | Done | Gallery, canonical redirects, metadata, Open Graph, JSON-LD, sitemap, robots, real 404s. Public gallery now serves the 1600px DETAIL rendition. |
| 6 Enquiry + lead CRM | Done | Enquiry form (desktop card, mobile sheet), admin inbox, status workflow, assignment. Added `GET /admin/staff`. |
| 7 Account + extras | Done | Profile, my enquiries, saved homes, dashboard counts, staff management. New API: saved listings, dashboard, admin users. Fixed: disabled users kept working until their access token expired. |
| 8 Hardening | Done | CSP and security headers, no-store on signed-in pages, axe audits on public and admin pages, CI with E2E. |

**Deliberately not built** (killable in doc 21): services pages and service enquiries, visit requests, locality landing pages, on-demand ISR revalidation, maps.

**Known gaps / follow-ups**

- The public listing API does not return amenities, so the detail page cannot show them yet.
- CSP allows inline scripts (`'unsafe-inline'`), which Next.js needs without per-request nonces. Moving to nonces is the next hardening step.
- Password reset needs SMTP to be exercised end to end; locally, emails are logged or captured by Mailpit.
- One React hydration warning (#418) was seen once on a cold server start and could not be reproduced in 40+ page loads.
- The legal pages are draft text and must be reviewed before launch.

## 1. Current state (at the start of the project)

| Area | State |
| --- | --- |
| `apps/api` | Auth, `me`, properties, listings (+ publish/pause/close), media, leads, admin lead inbox. Unit and HTTP tests present. |
| `apps/web` | Placeholder: `layout.tsx` and a static `page.tsx`. No dependencies beyond Next, React. Everything below is new. |
| `.wip/week3` | Locations, amenities, analytics, audit drafts, not wired into the API. |
| Local dev | Web on `:3100`, API on `:3001`, Postgres in Docker on `:5433`. MinIO image needs replacing before uploads can be tested. |

## 2. Goals and non-goals

**Goals:** a fast, SEO-friendly public site; a staff admin that can run the listing and enquiry loop end to end; a maintainable codebase two people can work in without stepping on each other.

**Non-goals (deferred in doc 21):** payments, owner/broker portals, provider marketplace, WhatsApp/SMS OTP, native apps, maps beyond a feature flag.

**Core priority (frozen):** Auth → Property → Listing → Media → Search → listing page → Lead → Admin CRM. Services, visits, agent assignment UI and dashboard polish are killable.

## 3. Backend gaps the frontend depends on

The frontend cannot ship some screens until these API pieces exist. Each is scheduled in a phase below.

| Needed by | Endpoint | Status | Phase |
| --- | --- | --- | --- |
| Search filters, admin property form | `GET /cities`, `GET /cities/:slug/localities` | Missing (draft in `.wip/week3/modules-locations`) | 2 |
| Admin property form | Amenities list | Missing (draft in `.wip`) | 2 |
| Locality management | `POST /admin/localities` | Missing | 2 |
| Saved listings | `GET/POST/DELETE /me/saved-listings` | Missing | 7 |
| Visit requests | `POST /me/visits`, cancel | Missing | 7 (killable) |
| Services pages | `GET /services`, `POST /service-enquiries` | Missing | 7 (killable) |
| Admin dashboard | `GET /admin/dashboard` | Missing | 7 |
| Staff management | `GET/POST /admin/users` | Missing | 7 |
| Sitemap | Published slug list (use `GET /listings` pagination, or add a lean endpoint) | Decide | 5 |
| Guest enquiry response | Confirm `POST /leads` response shape (doc 09 recommends `{ ok: true }` for guests) | Verify | 6 |

Existing endpoints and their validation rules are in the `*.dto.ts` files under `apps/api/src/modules/*`. Those Zod schemas are the source of truth for form validation.

## 4. Principles

1. **NestJS owns the domain.** The web app never opens Postgres and never re-implements publish rules, duplicate-lead windows or RBAC. No Server Actions as a second write path.
2. **Same-origin API.** Browser and server components call `/api/v1/*` through the Next rewrite. Tokens live only in httpOnly cookies, never in `localStorage`.
3. **Server-render the public site, client-render the admin.** Public pages use server fetch; TanStack Query is for admin and account only.
4. **URL is the state** for search and filters.
5. **Every page has loading, empty, error and not-found states** (project Definition of Done).
6. **Money is integer INR.** Format with `Intl.NumberFormat('en-IN')`, show lakh/crore on large values, and never do float math on prices.
7. **Done means** typecheck + lint clean, tests for the invariant that matters, no secrets committed, loading/empty/error states, docs updated if a decision changed.

## 5. Technical stack

| Concern | Choice | Notes |
| --- | --- | --- |
| Framework | Next.js 15 App Router, React 19, TypeScript strict | Already in repo |
| Styling | Tailwind CSS v4 + CSS variable design tokens | Needs team approval (doc 08 §7) |
| Primitives | Radix UI (via shadcn-style copied components) | Accessible dialogs, selects, tabs; no heavy UI kit |
| Forms | React Hook Form + `@hookform/resolvers/zod` | Zod schemas mirror API DTOs |
| Admin/account data | TanStack Query | Not used on public pages |
| Tables | TanStack Table | Admin lists |
| Icons | `lucide-react` | |
| Dates | `date-fns` | |
| Unit/component tests | Vitest + Testing Library | |
| API mocking in tests | MSW | |
| E2E | Playwright | P0 flows only |
| Analytics/errors | Sentry (DSN already in env), analytics deferred | |

**Zod sharing.** Doc 08 accepts duplicating schemas until a shared package exists. Recommendation: create `packages/contracts` in Phase 1 that exports the Zod schemas the API already defines, and have both apps import them. That removes drift. If this is too invasive, copy schemas into `apps/web/src/lib/schemas` and add a CI check that fails when they diverge.

## 6. Architecture

### 6.1 Folder layout (`apps/web/src`)

```text
app/
  (public)/            home, search, buy|rent listing detail, services, contact, about, legal
  (auth)/              login, register, forgot-password, reset-password
  account/             saved, enquiries, profile (authenticated)
  admin/               dashboard, properties, listings, leads, users (staff)
  sitemap.ts  robots.ts  not-found.tsx  error.tsx
components/
  ui/                  Button, Input, Select, Dialog, Toast, Badge, Skeleton, Tabs ...
  listing/             ListingCard, ListingGallery, PriceTag, SpecRow, AmenityList
  search/              FilterBar, FilterDrawer, SortSelect, Pagination
  forms/               EnquiryForm, LoginForm, RegisterForm, PropertyForm, ListingForm
  admin/               DataTable, StatusBadge, PageHeader, MediaUploader, Sidebar
lib/
  api/                 client.ts (fetch wrapper), server.ts (RSC fetch w/ cookies), errors.ts, endpoints/*.ts
  auth/                session helpers, useMe, route guards
  schemas/             Zod schemas (or imported from packages/contracts)
  format/              price, area, date, phone
  seo/                 metadata builders, JSON-LD
  config.ts            typed env access
middleware.ts          redirect unauthenticated /admin and /account to /login?next=
```

### 6.2 API client

- One `fetch` wrapper that sends `credentials: 'include'`, parses the error envelope `{ error: { code, message, details[] } }` into a typed `ApiError`, and maps `details[].field` onto React Hook Form fields.
- Server-side variant forwards the incoming `Cookie` header for authenticated RSC fetches.
- **401 handling:** a single shared refresh attempt (`POST /auth/refresh`), then retry once; if it still fails, redirect to `/login?next=`.
- Typed endpoint modules per resource. Response types come from the shared contracts or hand-written types kept next to each module.
- Unwrap `{ data }` and `{ data, meta }` consistently in one place.

### 6.3 Auth and authorization

- Roles seeded today: `CUSTOMER`, sales agent, `ADMIN`, `SUPER_ADMIN`; permissions include `listing.manage`, `property.manage`, `media.manage`, `lead.read_own`, `lead.assign`, `user.manage`, `dashboard.read`.
- `GET /me` returns `roles`. Middleware only checks cookie presence (not roles). The admin layout fetches `/me`; non-staff users get the site 404 so `/admin` existence is not disclosed. The API remains the real enforcement point (403).
- UI hides actions the user lacks permission for, as a convenience only.

### 6.4 Rendering strategy

| Route | Strategy |
| --- | --- |
| Home | ISR, 60s |
| Search | SSR on first load, filters in URL |
| Listing detail | ISR 60–300s, `generateMetadata`, 404 if not published |
| Legal/about | Static |
| Account, admin | Dynamic, `no-store`, `noindex` |
| Sitemap | Dynamic from published listings |

### 6.5 Design system

- Tokens as CSS variables: color (brand, neutral scale, success/warning/danger, surface), type scale, spacing, radius, shadow. Dark mode via the same tokens, off by default.
- Neutral, trustworthy real-estate look unless the client supplies a brand; one file change re-themes the site.
- Mobile-first for public pages; admin is desktop-first but must not break at tablet width.
- Required shared states: skeleton, empty, inline error, full-page error, 404, form field error, toast.

## 7. Routes

| Route | Page | Auth | Phase |
| --- | --- | --- | --- |
| `/login`, `/register`, `/forgot-password`, `/reset-password` | Auth forms | public | 1 |
| `/admin` | Dashboard | staff | 7 (shell in 1) |
| `/admin/properties`, `/new`, `/[id]` | Property CRUD, archive | staff | 2 |
| `/admin/listings`, `/new`, `/[id]` | Listing CRUD, publish/pause/close, media | staff | 3 |
| `/admin/leads`, `/[id]` | Inbox, status, assignment | staff | 6 |
| `/admin/users` | Staff list/create | admin+ | 7 |
| `/` | Home | public | 4 |
| `/search` | Search + filters | public | 4 |
| `/buy/[city]/[locality]/[slug]`, `/rent/...` | Listing detail | public | 5 |
| `/account`, `/account/saved`, `/account/enquiries` | Customer area | customer | 7 |
| `/services`, `/services/[slug]` | Services | public | 7 (killable) |
| `/contact`, `/about`, `/privacy`, `/terms` | Static | public | 8 |

## 8. Phases

Each phase ends in something demonstrable and merged to `main`. Estimates assume one developer at ~6 productive hours/day; two people working in parallel can overlap Phases 2–3 with 4.

### Phase 0 — Environment and decisions (0.5 day)

**Goal:** both developers can run the stack the same way.
- Fix the MinIO compose image (use `quay.io/minio/minio`), create the `ncr-media` bucket on startup, and document it.
- Make `docker-compose.yml` port mapping and `.env` handling not collide with local Postgres (configurable host port).
- Write `docs/DEVELOPMENT.md`: install, env, migrate, seed, run, ports, test credentials.
- Decide open items in section 11.

**Done when:** a fresh clone reaches a logged-in admin session by following the doc.

### Phase 1 — Foundation (3–4 days)

**Goal:** a styled app shell with working authentication.
- Install the stack in section 5; Tailwind config and design tokens; base `ui/` components with Storybook-free demo page at `/dev/ui` (dev only).
- API client, error mapping, `useMe`, 401 refresh flow, middleware redirects.
- Login, register, forgot-password, reset-password pages with validation, rate-limit (`429`) and lockout messaging.
- Public layout (header, footer, nav) and admin layout (sidebar, topbar, user menu, logout).
- `not-found`, `error`, loading boundaries; Sentry wiring; `lib/config.ts`.
- Vitest, MSW and Playwright set up; CI runs typecheck, lint, unit tests.

**Depends on:** auth endpoints (done).
**Done when:** seeded admin can log in, see the admin shell, log out; a non-staff user visiting `/admin` sees 404; invalid credentials and validation errors render field-level messages.
**Tests:** login form unit tests, API client error-mapping tests, Playwright login/logout.

### Phase 2 — Admin: locations and properties (4–5 days)

**Goal:** staff can create and manage properties.
- **API first:** promote `.wip/week3` locations and amenities into `apps/api` with tests (`GET /cities`, `/cities/:slug/localities`, amenities list, `POST /admin/localities`); seed Delhi-NCR cities and localities.
- Admin property list (filters by city, type, status, text search; pagination), create/edit form (city→locality dependent select, specs, amenities multi-select, lat/lng pair validation), archive.
- Reusable `DataTable`, `PageHeader`, `ConfirmDialog`, unsaved-changes guard.

**Done when:** an admin creates, edits, lists and archives a property; the form shows server validation errors per field.
**Tests:** property form schema tests, MSW-backed form submit test, API tests for new location endpoints.

### Phase 3 — Admin: listings and media (5–6 days)

**Goal:** a published listing with photos, entirely from the UI.
- Listing list (status/intent/search filters) and create/edit form (property picker, intent ↔ price-period rule, rent-only deposit/maintenance, availability date, money inputs that store integers).
- `MediaUploader`: multi-file, drag and drop, client-side type/size precheck, progress, reorder via `sortOrder`, delete; limit of 20 originals per listing (enforced by API).
- Explicit **Publish / Pause / Close** buttons wired to the command endpoints, with confirmation and the API's invariant errors surfaced (e.g. missing image).
- Status badge and publish checklist panel.

**Depends on:** Phase 2 properties; MinIO working (Phase 0).
**Done when:** the Week 3–4 DoD from doc 21 is met: one published listing with at least one image; unpublished listings are absent from the public API.
**Tests:** publish-flow component test, uploader validation tests, Playwright admin create→publish.

### Phase 4 — Public discovery (4–5 days)

**Goal:** a stranger can find listings.
- Home: hero search, latest listings (ISR), popular localities, trust section.
- `/search`: URL-driven filters (intent, city, locality, type, bedrooms, price range, area, furnishing, text query, sort), responsive filter bar and mobile drawer, pagination (API caps offset at 1000), active-filter chips, clear-all, empty and no-result states.
- `ListingCard` with `next/image`, price formatting, badges; `images.remotePatterns` for the media host.

**Depends on:** Phase 2 locations endpoints; seeded published listings.
**Done when:** filter Rent + Noida + 2 BHK works, URLs are shareable and back/forward behaves, and the page is usable at 360px width.
**Tests:** filter ↔ URL serialization unit tests, Playwright search flow.

### Phase 5 — Listing detail and SEO (3–4 days)

**Goal:** a listing page that ranks and converts.
- `/buy|rent/{city}/{locality}/{slug}`: gallery with keyboard and swipe support, spec grid, amenities, description, price/maintenance/deposit, availability, sticky enquiry card (mobile: bottom bar opening a sheet), map only behind `NEXT_PUBLIC_MAPS_ENABLED`.
- Canonical redirect if the URL's city/locality/intent does not match the listing.
- `generateMetadata` (title `{title} | {locality} | {city}`), Open Graph with cover image, canonical, JSON-LD, `sitemap.ts`, `robots.ts` (disallow `/admin`, `/account`).
- Draft/paused/closed slugs return 404.

**Done when:** view-source shows title, description and JSON-LD; a draft slug 404s; sitemap lists only published listings; Lighthouse performance ≥ 90 on mobile for a seeded listing (target LCP < 2.5s).
**Tests:** metadata builder unit tests, Playwright detail page and 404.

### Phase 6 — Conversion loop and lead CRM (4–5 days)

**Goal:** an enquiry becomes an inbox item staff can work.
- `EnquiryForm` (name, Indian mobile in `+91XXXXXXXXXX` format, optional email, message ≤ 1000 chars) with duplicate-window handling (200 vs 201), `429` rate-limit message and an honest success state. Prefill when logged in.
- Admin lead inbox: table with status filter, detail drawer/page, status change (`NEW … WON/LOST/SPAM`), assignment (shown only with `lead.assign`), linked listing, contact actions (tel/mailto).
- Sales agents see only assigned leads (API scopes; UI must handle empty and 404).

**Done when:** public form → lead appears as `NEW` in the admin inbox → status updated; email failure does not lose the lead (API behavior, verified in E2E logs).
**Tests:** enquiry form tests (validation, duplicate, 429), Playwright search→detail→enquiry→admin sees lead.

### Phase 7 — Customer account and extras (5–7 days)

**Goal:** returning-user features, then killable extras in this order.
1. **Account:** profile edit (`PATCH /me`), my enquiries (`/me/leads`, `/me/leads/:id`).
2. **Saved listings:** API + heart toggle on cards and detail, `/account/saved`.
3. **Admin dashboard:** counts (published listings, new leads, leads today) after the API endpoint exists.
4. **Staff management:** list/create staff (`user.manage`).
5. *Kill if late:* services pages and enquiries, then visit requests.

**Done when:** customer A cannot see customer B's data (E2E with two users); each shipped extra is complete, not half-built.

### Phase 8 — Hardening and launch (5–7 days)

- Accessibility pass: labels, focus management in dialogs/drawers/gallery, keyboard-only walk-through, contrast, `axe` in Playwright. Target WCAG 2.1 AA.
- Performance: bundle analysis, keep public client JS to gallery + forms, image sizing, font loading, cache headers.
- Security: CSP and security headers, cookie `Secure` in staging/prod, `API_ORIGIN` via server env, no tokens in storage, dependency audit (the install currently reports 1 critical and 4 high advisories, so triage these).
- SEO: legal pages, locality landing pages if time, structured data validation.
- Observability: Sentry release tagging, source maps, basic web-vitals reporting.
- Full Playwright P0 suite in CI; staging deploy; production checklist.

## 9. Cross-cutting standards

**Testing pyramid**
- Unit: formatters, filter↔URL, schemas, API client.
- Component: forms and tables with Testing Library + MSW.
- E2E (Playwright), required before launch: login/logout; admin create property→listing→upload→publish; search→detail→enquiry; admin inbox status change; customer isolation.
- No visual regression in P0.

**Accessibility:** semantic landmarks, labelled inputs, visible focus, `alt` from listing title + locality, no color-only status.

**Performance budget:** listing LCP < 2.5s on 4G; public listing page client JS limited to gallery and enquiry form; admin bundle may be larger.

**Security:** same-origin cookies only; render user text as text (no `dangerouslySetInnerHTML` for descriptions); validate uploads client-side but trust the API; do not expose internal fields.

**Error handling:** map codes (`VALIDATION_ERROR`, `UNAUTHENTICATED`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `RATE_LIMITED`, `PAYLOAD_TOO_LARGE`, `UNSUPPORTED_MEDIA`, `INTERNAL_ERROR`) to user-facing messages in one place.

**Env (web):** `API_ORIGIN` (server), `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_MAPS_ENABLED`, `NEXT_PUBLIC_SENTRY_DSN`. Nothing secret is prefixed `NEXT_PUBLIC_`.

## 10. Collaboration workflow

- Trunk-based on `main` with short-lived feature branches (`feat/web-<phase>-<topic>`); one PR per vertical slice.
- Conventional commits; PR template with the Definition of Done checklist from section 4.
- CI must pass typecheck, lint, unit and the relevant E2E before merge.
- Split work to avoid conflicts: one person owns admin (Phases 2, 3, 6 admin), the other public (4, 5, 6 public). Phase 1 foundation is done together first so the shared components, API client and tokens are stable.
- Any API contract change gets a note in the PR and an update to `docs/09-api-specification.md` or `docs/25`.
- Update this document's status table as phases complete.

## 11. Open decisions

| # | Decision | Recommendation |
| --- | --- | --- |
| D1 | Styling: Tailwind vs plain CSS | Tailwind v4 + tokens |
| D2 | Shared Zod package vs copy | `packages/contracts` workspace |
| D3 | Brand: colors, logo, tone | Neutral default until supplied |
| D4 | Maps provider (flagged off by default) | Defer |
| D5 | Hosting/CDN for media and web | Decide before Phase 8; affects `remotePatterns` |
| D6 | Sitemap source: paginate `GET /listings` vs lean endpoint | Add a lean endpoint |
| D7 | Is the stray root `index.html`/`script.js`/`style.css` legacy? | Remove if so |
| D8 | Real SMTP for staging | Needed to verify enquiry emails |

## 12. Milestone summary

| Phase | Outcome | Est. days |
| --- | --- | --- |
| 0 | Reproducible environment | 0.5 |
| 1 | Auth + app shell + design system | 3–4 |
| 2 | Admin properties + locations API | 4–5 |
| 3 | Admin listings + media + publish | 5–6 |
| 4 | Home + search | 4–5 |
| 5 | Listing detail + SEO | 3–4 |
| 6 | Enquiry + lead CRM | 4–5 |
| 7 | Account + extras | 5–7 |
| 8 | Hardening + launch | 5–7 |
| **Total** | | **~34–44 days single developer; ~22–28 with two in parallel** |

## 13. Risks

| Risk | Mitigation |
| --- | --- |
| Design polish consumes the schedule | Ship the token-based default look; polish only after Phase 6 |
| Backend gaps block UI work | Phase 2 and 7 schedule the API work explicitly; mock with MSW to unblock |
| Schema drift between API and web | Shared contracts package (D2) |
| Upload flow untested without MinIO | Phase 0 fixes the compose file before Phase 3 |
| Scope creep into services/visits | Kill order fixed in section 8, Phase 7 |
