# Real Estate Platform — Next.js Frontend Architecture

**Document:** Deliverable 08 / Step 8  
**Depends on:** `docs/04-architecture.md`, `docs/02-requirements-specification.md`, `docs/07-nestjs-backend.md`  
**Status:** Corrected — Architecture Freeze v1 — not approved for scaffolding  
**Date:** 2026-09-26  
**Out of this document:** Full folder tree of every component, application source, pixel design system dump

---

## 1. Role of the web app

Next.js is the **experience and SEO layer**. NestJS is the **domain layer**.

The web app may:

- Server-render public listing and search pages  
- Host customer account and admin UI  
- Call `/api/v1/*` (rewritten to NestJS)  
- Optimize images via `next/image` pointing at the CDN  

The web app must not:

- Open PostgreSQL  
- Re-implement publish rules, duplicate-lead window, or RBAC  
- Store secrets other than public env (`NEXT_PUBLIC_*` only for non-secrets)  
- Use Server Actions as a second write API that skips NestJS  

---

## 2. App Router layout

Proposed route groups (illustrative, not a generated tree):

```text
app/
  (public)/
    page.tsx                         home
    buy/[city]/[locality]/[slug]/
    rent/[city]/[locality]/[slug]/
    search/page.tsx
    services/page.tsx
    services/[slug]/page.tsx
    contact/page.tsx
    about/page.tsx
    privacy/page.tsx
    terms/page.tsx
  (auth)/
    login/page.tsx
    register/page.tsx
    forgot-password/page.tsx
    reset-password/page.tsx
    account/                         listings saved, enquiries, profile
  (admin)/
    admin/                           dashboard, properties, listings, leads, users
  sitemap.ts
  robots.ts
  not-found.tsx
```

Admin layout: `noindex`, robots already disallow `/admin`.

---

## 3. Rendering strategy

| Route | Strategy | Why |
| --- | --- | --- |
| Listing detail | SSR or ISR 60–300s | SEO + fresh enough at low inventory |
| Search | SSR on first load; client filter updates via URL | Shareable queries |
| Home | ISR 60s for latest listings | Cheap |
| Static legal/about | SSG | |
| Account / admin | Dynamic, `no-store` | PII |
| Sitemap | Dynamic from published listings API | |

On publish/pause, accept TTL delay **or** call `revalidatePath` / `revalidateTag` from a NestJS webhook/admin-only Next route. **P0: TTL is enough** (300 listings, staff can wait 1–5 minutes). P1: on-demand revalidate.

---

## 4. API communication

- Browser and RSC use same origin `/api/v1/...`  
- `next.config` rewrite `/api/:path*` → `http://localhost:3001/api/:path*` (dev) and internal API URL in prod  
- Server fetch: forwarding `Cookie` on account/admin RSC  
- Client fetch: credentials include  
- No Axios requirement; `fetch` wrapper with error catalog parse  

TanStack Query: **admin + account only**. Public listing pages: server fetch.

---

## 5. Auth UX

- Login/register forms client-side  
- Session: httpOnly cookies set by API (`Set-Cookie` on login/refresh). Web **never** puts access or refresh tokens in `localStorage`. Same-origin `/api` rewrite is mandatory for the P0 CSRF freeze.  
- Middleware: if `/admin` without cookie → `/login?next=`  
- Middleware: if `/account` without cookie → login  
- Middleware **does not** check roles (JWT signature in Edge is optional; role check is API 403 + admin layout client/server fetch `/me`). If `/me` is not staff, show 404 for `/admin` (do not confirm admin existence to random users)  

---

## 6. State and forms

- Search state in URL: `?intent=RENT&city=noida&bhk=2&minPrice=&maxPrice=`  
- React Hook Form + Zod on enquiry, login, admin listing form  
- Zod should match API fields; duplication is acceptable until `packages/types`  
- No Redux  
- No global listing cache besides TanStack Query on admin lists  

---

## 7. UI composition (not a component library mandate)

Keep a small internal set:

- `ListingCard`, `ListingGallery`, `FilterBar`, `EnquiryForm`, `StatusBadge`, `AdminDataTable`, `Pagination`  
- Tailwind or CSS modules — **recommendation: Tailwind** if you already know it; otherwise plain CSS. Do not add MUI/Ant for MVP unless you are faster with it. **Approval: styling approach.**  

Empty, loading, error, 404 states required on P0 pages (Definition of Done).

---

## 8. SEO implementation notes

- `generateMetadata` for listing: title `{title} | {locality} | {city}`, description truncated, canonical, OG image = cover  
- Slug URLs as in requirements  
- `rel=canonical` self  
- No fake aggregateRating  
- Images: `alt` from listing title + locality  

Avoid programmatic SEO of empty localities.

---

## 9. Images

- `images.remotePatterns` for CDN/bucket host  
- Card: CARD variant or ORIGINAL with sizes  
- Gallery: DETAIL or ORIGINAL  
- Never hotlink API blob routes as primary  

---

## 10. Admin UI principles

- Desktop first (staff)  
- Listing form wizard optional; single long form is faster to ship  
- Publish is an explicit button, not implicit save  
- Lead inbox: table + status select  
- Do not clone Salesforce  

---

## 11. Accessibility P0

- Form labels  
- Keyboard submit  
- Contrast good enough on text/background  
- WCAG AA audit is P1  

---

## 12. Performance budget (engineering targets)

- Listing LCP < 2.5s on 4G with compressed cover  
- JS on public listing: keep client islands small (gallery + form only)  
- Admin bundle can be larger  

---

## 13. Env (web)

`NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_MAPS_ENABLED` (false by default).  
API URL for rewrite is **server** env, not `NEXT_PUBLIC`.

---

## 14. Testing (web)

- Playwright P0: search → detail → enquiry success message  
- Admin login → create listing not required in first CI if costly; add before launch  
- No screenshot visual regression in P0  

---

## 15. Next

Step 9 — API specification (`docs/09-api-specification.md`): conventions + representative endpoints, not a full dump of every field of every admin screen.
