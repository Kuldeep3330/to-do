# Real Estate Platform — 60–70 Day Sprint Plan

**Document:** Deliverable 21 / Step 21  
**Depends on:** all prior design docs, especially `docs/01-system-design-master.md` and `docs/02-requirements-specification.md`  
**Status:** Corrected — Architecture Freeze v1 — **implementation still not started**  
**Date:** 2026-09-26  
**Assumption:** one developer, ~6 productive hours/day, 9–10 weeks (~250–350 hours)

---

## 0. Priority (frozen)

Do not sacrifice security, migrations, tests, backups, monitoring, or the core enquiry loop to ship secondary features.

**Core (highest):**

```text
Authentication → Property → Listing → Media → Search → SEO listing page → Lead/enquiry → Admin CRM
```

**Secondary (week 7, killable):** saved listings, customer enquiry history, services, visits, sales-agent assignment UI, dashboard polish.

---

## 1. In window vs deferred

**Must complete (60–70 days)**

- Foundation (repo, CI, env, Prisma, auth, RBAC)  
- Locations + properties + listings + media  
- Public search + listing pages + SEO basics  
- Guest enquiry + admin lead inbox + email  
- Customer register/login/save/my enquiries  
- Hardening, backups, staging, production with real listings  

**Should complete if on schedule (kill order if late)**

1. Services catalog + service enquiry  
2. Visit requests  
3. Agent assignment UI  
4. Image CARD/DETAIL variants  
5. Locality landing pages  
6. Admin dashboard counts  

**Must defer**

- Payments, transactions, owner/broker portals, provider marketplace  
- WhatsApp API, SMS OTP, Elasticsearch, Kubernetes, native apps  

---

## 2. Project-wide Definition of Done

A feature is not done because it runs locally. Done means:

- P0 acceptance criteria met  
- Validation + error mapping  
- Types + lint clean  
- Invariant test where it matters  
- No secrets committed  
- Migration safe (if schema)  
- Mutation logging/audit where admin  
- UI loading / empty / error  
- Docs/ADR updated if a decision changed  

---

## 3. Week-by-week

### Week 1 — Discovery freeze (done when you approve)

**Goal:** Stop designing in circles.  
**Deliverables:** Docs 01–21 reviewed; open questions answered; ADRs accepted or amended.  
**Depends:** none.  
**Risk:** more features sneaking into P0.  
**DoD:** written yes/no on D1–D17.

*Correction pass complete. Database blueprint: `docs/24-final-postgresql-prisma-design.md`. NestJS/API blueprint: `docs/25-nestjs-backend-api-design.md`. Do not start scaffolding until you explicitly request implementation.*

### Week 2 — Foundation

**Goal:** Login as seeded admin against local Postgres.  
**Deliverables:** monorepo (or two repos), Compose Postgres+MinIO, Nest health, Prisma init **including `password_reset_tokens`**, User/Role/Permission seed, register/login/refresh/logout/**forgot+reset**, lockout, CI lint/typecheck/unit stub, Next app with **same-origin** rewrite to API, `.env.example`. Auth tests from Deliverable 16.  
**Depends:** Week 1 approvals.  
**Risk:** bike-shedding tooling.  
**DoD:** `POST /auth/login` as seed admin works; `/health` and `/ready` 200.

### Weeks 3–4 — Property core

**Goal:** Admin can create property + draft listing + photos.  
**Deliverables:** cities/localities seed, amenities, property CRUD, listing CRUD, media upload to MinIO/S3, publish command + invariants, admin forms.  
**Depends:** Week 2 auth.  
**Risk:** overbuilt amenity/society models.  
**DoD:** one published listing in DB with ≥1 image; unpublished not returned by public GET.

### Week 5 — Public discovery + SEO

**Goal:** A stranger can browse.  
**Deliverables:** home, search/filters (URL state), listing detail SSR, metadata, sitemap, robots, canonical, slug URLs `/buy|rent/{city}/{locality}/{slug}`.  
**Depends:** Weeks 3–4 publish.  
**Risk:** design polish eating the week. Ship a simple, fast UI.  
**DoD:** filter Rent + Noida + 2 BHK works; view-source shows title; draft 404.

### Week 6 — Conversion loop

**Goal:** Enquiry becomes an inbox item.  
**Deliverables:** guest POST lead, duplicate window, ops+customer email, admin inbox + status, customer `/me`, saved listings, my enquiries, rate limits, IDOR tests.  
**Depends:** Week 5 public listing.  
**Risk:** building Salesforce.  
**DoD:** public form → lead NEW; customer A cannot read B; email failure does not delete lead.

### Week 7 — Thin extras + polish

**Goal:** Should-haves only if Weeks 3–6 are actually done.  
**Deliverables (priority order):** services pages + enquiry; visit request; agent assign field; dashboard counts; sharp variants.  
**Kill if late:** services, then visits.  
**DoD:** only for items you keep; do not half-ship all.

### Week 8 — Hardening

**Goal:** Production quality bar.  
**Deliverables:** security checklist (doc 15), Sentry, JSON logs, security headers, backup restore drill, seed/empty states, 404s, integration tests in CI, image allowlist tests.  
**DoD:** restore tested; IDOR tests green; secrets scan clean.

### Week 9 — Launch path

**Goal:** Live URL you would send to a friend in Noida.  
**Deliverables:** prod infra, DNS, TLS, distinct secrets, 20+ honest listings, smoke, one-page runbook.  
**DoD:** real inventory live; `/ready` 200; enquiry emails arrive.

### Week 10 — Buffer

Slippage, SEO fixes, content, bugs. **Do not start marketplace/payments.**

---

## 4. Epic → feature map (for later tickets, not a full Jira dump)

| Epic | P0 features |
| --- | --- |
| Foundation | repo, CI, env, health |
| Identity | register, login, refresh, reset, RBAC |
| Inventory | locations, property, listing, media, publish |
| Discovery | search, detail, SEO, home |
| Demand | lead create, inbox, my enquiries, saved |
| Notify | email templates, logs |
| Admin | dashboard thin, users seed |
| Launch | staging, backups, monitoring |

Stories follow Deliverable 02 section 21.

---

## 5. Implementation rule when coding starts

For each feature: confirm requirement → implement API → test API → implement UI → test UI → integrate → security glance → mark done. Do not generate the entire application in one pass.

---

## 6. Next after this document set

**Stop.** You review. Then Step 22 (implementation) only after D1–D17 (or at least D1, D2, D3, D8, D10, D12) are approved.

If you say “implement”, Week 2 scaffolding starts — not before.

---

## 7. Pilot scope update (2026-10-18)

Weeks 1–8 of the original plan are built (see `docs/27-project-status.md`). Before the launch path (week 9), the next work is the **trust-first pilot** defined in `docs/28-positioning-and-mvp-scope.md`:

| # | Item | Status |
| --- | --- | --- |
| 1 | Verified badge (date and verifying agent) | Done |
| 2 | Freshness: last-confirmed date, confirm action, auto-pause job | Done |
| 3 | Visit booking (customer request, staff confirm slot) | Done |
| 4 | Lead response timer (2-hour target) | Planned |
| 5 | Deal tracking on WON leads | Planned |
| 6 | Amenities on listing detail | Planned |
| 7 | Locality landing pages | Planned |

Visit requests and locality pages were killable in section 1; the pilot promotes them because the positioning depends on them.
