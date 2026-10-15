# Real Estate Platform — API Specification

**Document:** Deliverable 09 / Step 9  
**Depends on:** `docs/07-nestjs-backend.md`, `docs/02-requirements-specification.md`, `docs/06-database-schema.md`  
**Status:** Corrected — Architecture Freeze v1 — endpoint detail superseded by `docs/25-nestjs-backend-api-design.md`  
**Date:** 2026-09-26  
**Out of this document:** Every admin field of every screen, client SDKs, application code

Base path: `/api/v1`  
Format: JSON UTF-8  
Versioning: URL prefix. Breaking change ⇒ `/api/v2`. Additive fields are not breaking.

---

## 1. Conventions

| Topic | Rule |
| --- | --- |
| Auth | httpOnly access + refresh cookies (same-origin). Unauthenticated public GETs. No localStorage. |
| Pagination | `page` ≥ 1, `pageSize` 1–24 public. `offset = (page-1)*pageSize`. Public search `offset > 1000` → 400. `meta.total` on lists. |
| Filtering | Query params, whitelist only. Unknown params ignored. |
| Sorting | Whitelist. Public search always appends `id DESC` for stability. |
| Timestamps | ISO-8601 UTC |
| Money | JSON **number** (integer INR). DB `bigint`. Never JSON.stringify a Prisma BigInt. |
| IDs | UUID in bodies; public listing identity also `slug` |
| Idempotency | POST `/leads` natural 24h window; no `Idempotency-Key` header in P0 |
| Methods | GET read, POST create, PATCH partial, DELETE soft or unsave |

---

## 2. Error body

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input",
    "details": [{ "field": "phone", "message": "Invalid Indian mobile number" }]
  }
}
```

Codes: see Deliverable 02 section 20. `details` only on 400.

---

## 3. Public DTOs (shape, not exhaustive)

**Listing card**

- slug, title, intent, status (always PUBLISHED), priceAmount, pricePeriod, bedrooms, areaValue, areaUnit, furnishing, city slug/name, locality slug/name, coverImageUrl, publishedAt

**Listing detail** — card + description, bathrooms, floor, amenities[], gallery urls[], lat/lng if present, propertyType, negotiable, deposit/maintenance if rent, availableFrom

Never: assigned agents, lead counts, internalTitle, other customers, storage keys as writable paths.

---

## 4. Representative endpoints

### 4.1 Health (no prefix or `/api` exception)

- `GET /health` → `{ "status": "ok" }`  
- `GET /ready` → `{ "status": "ok" }` or 503 `{ "status": "not_ready" }` without DB internals  

### 4.2 Auth

- `POST /api/v1/auth/register` body: email, password, name, phone  
- `POST /api/v1/auth/login` body: email, password  
- `POST /api/v1/auth/refresh` cookie  
- `POST /api/v1/auth/logout`  
- `POST /api/v1/auth/forgot-password` body: email (always 200)  
- `POST /api/v1/auth/reset-password` body: token, password  
- `GET /api/v1/me`  
- `PATCH /api/v1/me` body: name, phone  

Login/register return `{ data: { user: PublicUser } }` and set cookies. `PublicUser`: id, email, name, phone, roles[].

### 4.3 Locations

- `GET /api/v1/cities`  
- `GET /api/v1/cities/:citySlug/localities`  

### 4.4 Listings public

- `GET /api/v1/listings`  
  Query: intent, city, locality, type, bedrooms, minPrice, maxPrice, minArea, maxArea, furnishing, q, page, pageSize, sort  
- `GET /api/v1/listings/:slug`  

404 if not published.

### 4.5 Leads public

- `POST /api/v1/leads`  
  Body: listingSlug or listingId, name, phone, email?, message?  
  201 new or 200 existing duplicate window. Response `{ data: { id, duplicate: boolean } }` — **do not** return other people’s data. Id is enough for nothing public; alternatively return no id to guests (`{ data: { ok: true } }`) to reduce enumeration. **Recommendation: `{ ok: true }` for guests; id only when authenticated as the owner.**  

### 4.6 Saved

- `GET /api/v1/me/saved-listings`  
- `POST /api/v1/me/saved-listings` `{ listingId }`  
- `DELETE /api/v1/me/saved-listings/:listingId`  

### 4.7 My leads / visits

- `GET /api/v1/me/leads`  
- `POST /api/v1/me/visits` `{ listingId, preferredDate?, preferredSlot?, notes? }`  
- `POST /api/v1/me/visits/:id/cancel`  

### 4.8 Services

- `GET /api/v1/services`  
- `GET /api/v1/services/:slug`  
- `POST /api/v1/service-enquiries` `{ slug, name, phone, email?, message?, city? }` → `{ ok: true }`  
- `GET /api/v1/admin/service-enquiries`  
- `PATCH /api/v1/admin/service-enquiries/:id` `{ status: "CONTACTED" }` — only `NEW → CONTACTED`  

### 4.9 Admin listings / properties

- `GET /api/v1/admin/properties`  
- `POST /api/v1/admin/properties`  
- `GET /api/v1/admin/properties/:id`  
- `PATCH /api/v1/admin/properties/:id`  
- `GET /api/v1/admin/listings` query status, intent, q  
- `POST /api/v1/admin/listings` `{ propertyId, intent, ... }`  
- `GET /api/v1/admin/listings/:id`  
- `PATCH /api/v1/admin/listings/:id`  
- `POST /api/v1/admin/listings/:id/publish`  
- `POST /api/v1/admin/listings/:id/pause`  
- `POST /api/v1/admin/listings/:id/close`  
- `POST /api/v1/admin/listings/:id/media` multipart  
- `PATCH /api/v1/admin/media/:id` `{ sortOrder }`  
- `DELETE /api/v1/admin/media/:id`  

Publish is a **command**, not `PATCH { status: PUBLISHED }`.

### 4.10 Admin leads

- `GET /api/v1/admin/leads` query status, assignedTo, page  
- `GET /api/v1/admin/leads/:id`  
- `PATCH /api/v1/admin/leads/:id` `{ status?, assignedToUserId? }`  

Agent: same routes; **scoped query** `assigned_to_user_id = current user`. Miss → 404. Assigning (`assignedToUserId`) requires `lead.assign` else 403.

### 4.11 Admin locations / users / dashboard

- `POST /api/v1/admin/localities`  
- `GET /api/v1/admin/users` (admin+)  
- `POST /api/v1/admin/users` create staff (super/admin policy)  
- `GET /api/v1/admin/dashboard` `{ publishedListings, leadsNew, leadsToday }`  

---

## 5. Status codes on writes

- 201 created (property, listing, media, user)  
- 200 duplicate lead window, PATCH, publish success  
- 204 DELETE save  

---

## 6. Rate limits (headers optional P1)

P0 may omit `X-RateLimit-*`. Still return 429 JSON.

---

## 7. Compatibility

Additive JSON fields allowed. Do not remove or rename fields after launch without version bump.

---

## 8. Next

Step 10 — Authentication and authorization (`docs/10-authentication-authorization.md`).
