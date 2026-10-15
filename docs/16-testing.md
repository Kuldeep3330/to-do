# Real Estate Platform — Testing Strategy

**Document:** Deliverable 16 / Step 16  
**Depends on:** `docs/02-requirements-specification.md`, `docs/07-nestjs-backend.md`, `docs/08-nextjs-frontend.md`  
**Status:** Corrected — Architecture Freeze v1  
**Date:** 2026-09-26  
**Out of this document:** Full test source, 100% coverage mandate

Solo-developer pyramid: **few E2E, real integration on domain, unit on invariants.**

---

## 1. Pyramid

```text
        E2E (3–5 journeys, Playwright)
      Integration (Nest + Postgres)
    Unit (invariants, RBAC, parsers)
```

Do not clone every controller with a mock-heavy unit test.

---

## 2. Unit (CI required)

| Area | Examples |
| --- | --- |
| Listing publish | Missing image → reject; two published RENT → reject |
| Lead duplicate | Same phone+listing < 24h → existing |
| Lead transitions | NEW → WON illegal unless via allowed graph (if encoded) |
| Slug | Immutable after publish |
| Phone normalize | `9876543210` → `+919876543210`; invalid reject |
| Pagination clamp | pageSize 999 → max |
| Open redirect | `next=https://evil` rejected |

No Prisma required if logic is pure functions.

---

## 3. Integration (CI if Docker Postgres available)

Supertest against Nest. **Required:**

### Auth

- Register customer  
- Customer cannot register ADMIN  
- Duplicate email rejected (including vs soft-deleted)  
- Duplicate phone rejected (including vs soft-deleted)  
- Login success  
- Login failure (generic message)  
- Lockout after threshold (`status=LOCKED`, `locked_until` set)  
- Login during active lock rejected (generic message)  
- Expired lock auto-clears to ACTIVE before credential check  
- Successful login resets `failed_login_count`, `locked_until`, status ACTIVE  
- DISABLED never auto-reactivated by login, expiry, or reset  
- Refresh rotation  
- Logout revokes refresh token  
- Expired refresh token rejected  
- Password reset success  
- Expired reset token rejected  
- Used reset token rejected  
- Password reset revokes all refresh sessions  
- Customer cannot access another customer's resource (404)  

### Authorization

- Guest protected endpoint → 401  
- Customer admin endpoint → 403  
- Customer B reading customer A lead → 404  
- Sales agent unassigned lead → 404  
- Sales agent assign → 403  
- Admin → allowed  
- Super admin → allowed  

### Listing

- Draft not public  
- Publish requirements  
- Publish without media fails  
- Duplicate published BUY listing fails  
- Duplicate published RENT listing fails  
- Slug uniqueness  
- Slug immutability after first publish  

### Property

- Invalid city/locality combination rejected **at DB level** (composite FK)  

### Lead

- Guest enquiry  
- Customer enquiry  
- Duplicate within 24h (non-racy path)  
- Lead transition rules  

### Media

- Invalid MIME  
- Fake extension / magic-byte mismatch  
- Oversized file  
- Dimensions too large  
- Maximum **ORIGINAL** count = 20 (21st ORIGINAL rejected; CARD/DETAIL do not count)  
- Cannot delete final ORIGINAL from published listing  
- Storage OK / DB fail: request fails (no success with missing rows)  

### Service enquiry

- Create  
- Starts NEW  
- Admin NEW → CONTACTED  
- Invalid transition rejected  

### Search

- `pageSize` > 24 rejected or clamped per API (max 24)  
- `offset > 1000` on public search → 400  
- Results stable given the same sort (secondary `id`)  

---

## 4. E2E (pre-release / nightly)

Playwright:

1. Search rent + city → open listing → submit enquiry → success UI  
2. Admin login → create listing → publish → public URL 200  
3. Customer register → save listing → appears in account  

Skip visual regression. No full admin matrix.

---

## 5. Security tests

Fold into unit/integration (section 3 items 4–8). No separate scanner in CI for P0 besides lint + audit.

---

## 6. Performance

Not in CI. Before adding `pg_trgm` or claiming search is slow: seed 1,000 and 5,000 listings and run `EXPLAIN ANALYZE` on the main filter patterns. Only then add trigram. No OpenSearch.

---

## 7. What CI runs

```text
lint → typecheck → unit → integration (if service available) → build web + api
```

E2E not blocking every push until stable.

---

## 8. Definition of done vs tests

A P0 feature needs at least: one unit or integration test for its main invariant, plus the E2E journey if it is search, enquiry, or publish.

---

## 9. Next

Step 17 — Observability (`docs/17-observability.md`).
