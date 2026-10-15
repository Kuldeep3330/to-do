# Real Estate Platform — PostgreSQL Schema

**Document:** Deliverable 06 / Step 6  
**Depends on:** `docs/05-domain-model.md`, `docs/04-architecture.md`, `docs/02-requirements-specification.md`  
**Status:** Corrected — aligned with Architecture Freeze v1 (`docs/00-architecture-freeze.md`)  
**Date:** 2026-09-26  
**Out of this document:** Prisma schema file, SQL dump as a runnable migration, application code

This is the logical/physical design for P0. Implementation will translate it through Prisma (D2 default) after approval. Types are PostgreSQL.

Conventions:

- PK: `uuid` primary key, generated in application or `gen_random_uuid()`  
- Timestamps: `timestamptz` not null, `created_at` default `now()`, `updated_at` maintained in app/ORM  
- Soft delete: `deleted_at timestamptz null` where specified  
- Money: **`bigint` INR** (paise not used; whole rupees). API JSON: number (see `docs/24-final-postgresql-prisma-design.md` section 29).  
- Enums: PostgreSQL enums **or** text + check. **Recommendation: Prisma enums → Postgres enums** for P0 closed sets  
- Naming: `snake_case` tables and columns  

---

## 1. Extensions

| Extension | MVP | Why |
| --- | --- | --- |
| `pgcrypto` or `pg_uuidv7` | `pgcrypto` / `uuid-ossp` | UUID generation if not app-side |
| `pg_trgm` | Optional week 5 | Keyword `q` if ILIKE is slow |
| `citext` | Optional | Case-insensitive email; else lower() unique index |
| PostGIS | **No** | No radius search in P0 |

---

## 2. Identity

### 2.1 `users`

| Column | Type | Constraints |
| --- | --- | --- |
| id | uuid | PK |
| email | varchar(255) | NOT NULL |
| phone | varchar(20) | NOT NULL |
| password_hash | varchar(255) | NOT NULL |
| name | varchar(80) | NOT NULL |
| status | user_status | NOT NULL DEFAULT `ACTIVE` |
| failed_login_count | integer | NOT NULL DEFAULT 0 |
| locked_until | timestamptz | NULL |
| email_verified_at | timestamptz | NULL |
| created_at | timestamptz | NOT NULL |
| updated_at | timestamptz | NOT NULL |
| deleted_at | timestamptz | NULL |

Indexes:

- Unique `(email)` — **unconditional**. Soft-deleted rows still occupy the email. Identity cannot be reused.  
- Unique `(phone)` — **unconditional**. Same rule.  

Email stored lowercase. Phone E.164.

Soft delete hides the user from login (`deleted_at IS NOT NULL` ⇒ treat as unknown credentials). It does **not** free email/phone for a new account. Recovery of a soft-deleted user is an admin/ops procedure, not self-serve register.

### 2.2 `roles`

| Column | Type | Constraints |
| --- | --- | --- |
| id | uuid | PK |
| code | varchar(50) | NOT NULL UNIQUE |
| name | varchar(80) | NOT NULL |

Seed: `SUPER_ADMIN`, `ADMIN`, `SALES_AGENT`, `CUSTOMER`.

### 2.3 `permissions`

| Column | Type | Constraints |
| --- | --- | --- |
| id | uuid | PK |
| code | varchar(80) | NOT NULL UNIQUE |

### 2.4 `role_permissions`

| Column | Type | Constraints |
| --- | --- | --- |
| role_id | uuid | FK roles ON DELETE CASCADE |
| permission_id | uuid | FK permissions ON DELETE CASCADE |
| PK | (role_id, permission_id) | |

### 2.5 `user_roles`

| Column | Type | Constraints |
| --- | --- | --- |
| user_id | uuid | FK users ON DELETE CASCADE |
| role_id | uuid | FK roles ON DELETE RESTRICT |
| PK | (user_id, role_id) | |

### 2.6 `refresh_tokens`

| Column | Type | Constraints |
| --- | --- | --- |
| id | uuid | PK |
| user_id | uuid | FK users ON DELETE CASCADE |
| token_hash | varchar(255) | NOT NULL UNIQUE |
| expires_at | timestamptz | NOT NULL |
| revoked_at | timestamptz | NULL |
| created_at | timestamptz | NOT NULL |

Index: `(user_id, expires_at)` for cleanup.

### 2.7 `password_reset_tokens`

Mandatory P0. Forgot/reset password.

| Column | Type | Constraints |
| --- | --- | --- |
| id | uuid | PK |
| user_id | uuid | FK users ON DELETE CASCADE |
| token_hash | varchar(255) | NOT NULL UNIQUE |
| expires_at | timestamptz | NOT NULL |
| used_at | timestamptz | NULL |
| created_at | timestamptz | NOT NULL |

Index: `(user_id, created_at DESC)`  
Index: `(expires_at)` for cleanup of unused expired rows  

Rules (application):

- Store only a hash of the token (SHA-256 or equivalent). Never plaintext.  
- Valid reset: row exists, hash matches, `expires_at > now()`, `used_at IS NULL`.  
- On success, in one transaction: set `used_at`, update `users.password_hash`, set `failed_login_count = 0`, `locked_until = NULL`, revoke **all** `refresh_tokens` for that user (`revoked_at = now()`).  
- Invalidate unused prior tokens for the user when issuing a new one (set `used_at` or delete unused).  

---

## 3. Locations

### 3.1 `cities`

| Column | Type | Constraints |
| --- | --- | --- |
| id | uuid | PK |
| name | varchar(80) | NOT NULL |
| slug | varchar(80) | NOT NULL UNIQUE |
| is_active | boolean | NOT NULL DEFAULT true |
| created_at / updated_at | timestamptz | NOT NULL |

### 3.2 `localities`

| Column | Type | Constraints |
| --- | --- | --- |
| id | uuid | PK |
| city_id | uuid | FK cities ON DELETE RESTRICT |
| name | varchar(120) | NOT NULL |
| slug | varchar(120) | NOT NULL |
| is_active | boolean | NOT NULL DEFAULT true |
| lat / lng | numeric(9,6) | NULL |
| created_at / updated_at | timestamptz | NOT NULL |

Unique: `(city_id, slug)`  
Unique: `(id, city_id)` — required so properties can composite-FK to this pair  
Index: `(city_id, is_active)`

---

## 4. Inventory

### 4.1 `amenities`

| Column | Type | Constraints |
| --- | --- | --- |
| id | uuid | PK |
| code | varchar(50) | NOT NULL UNIQUE |
| name | varchar(80) | NOT NULL |
| is_active | boolean | NOT NULL DEFAULT true |

### 4.2 `properties`

| Column | Type | Constraints |
| --- | --- | --- |
| id | uuid | PK |
| type | property_type | NOT NULL |
| status | property_status | NOT NULL DEFAULT `ACTIVE` |
| city_id | uuid | NOT NULL, part of composite FK |
| locality_id | uuid | NOT NULL, part of composite FK |
| society_name | varchar(160) | NULL |
| address_text | varchar(500) | NULL |
| lat / lng | numeric(9,6) | NULL |
| area_value | numeric(12,2) | NULL CHECK (> 0) |
| area_unit | area_unit | NOT NULL DEFAULT `SQFT` |
| bedrooms | smallint | NULL CHECK (>= 0) |
| bathrooms | smallint | NULL CHECK (>= 0) |
| balconies | smallint | NULL CHECK (>= 0) |
| floor | smallint | NULL |
| total_floors | smallint | NULL |
| furnishing | furnishing | NULL |
| facing | varchar(30) | NULL |
| age_years | smallint | NULL CHECK (>= 0) |
| parking_count | smallint | NULL CHECK (>= 0) |
| internal_title | varchar(160) | NOT NULL |
| created_at / updated_at | timestamptz | NOT NULL |
| deleted_at | timestamptz | NULL |

**City/locality integrity (mandatory, database-enforced):**

```text
localities: UNIQUE (id, city_id)
properties: FOREIGN KEY (locality_id, city_id)
            REFERENCES localities (id, city_id)
            ON DELETE RESTRICT
```

A property cannot point at a locality in a different city. Do not rely on application validation alone.

Prisma: model `Locality` with `@@unique([id, cityId])` and `Property` relation `fields: [localityId, cityId] references: [id, cityId]`. If Prisma version cannot emit this FK, add it in a raw SQL migration. Do not drop the invariant to avoid SQL.

Also keep `properties.locality_id` useful for joins; the composite FK is the integrity control. Optional additional `FK locality_id → localities.id` is redundant if the composite FK exists.

Index: `(locality_id)`  
Index: `(city_id, type)`  
Check: lat and lng either both null or both non-null (app or CHECK).

Draft properties may still omit area; **publish listing** requires property `type`, `locality_id`/`city_id`, and `area_value` — application invariant.

**Removed from MVP:** `is_new_project`. Do not add it.

### 4.3 `property_amenities`

| Column | Type | Constraints |
| --- | --- | --- |
| property_id | uuid | FK properties CASCADE |
| amenity_id | uuid | FK amenities RESTRICT |
| PK | (property_id, amenity_id) | |

### 4.4 `listings`

| Column | Type | Constraints |
| --- | --- | --- |
| id | uuid | PK |
| property_id | uuid | FK properties RESTRICT |
| intent | listing_intent | NOT NULL |
| status | listing_status | NOT NULL DEFAULT `DRAFT` |
| title | varchar(160) | NOT NULL |
| description | text | NOT NULL DEFAULT `''` |
| slug | varchar(180) | NOT NULL |
| price_amount | integer | NULL CHECK (> 0) |
| price_period | price_period | NOT NULL |
| maintenance_amount | integer | NULL CHECK (>= 0) |
| deposit_amount | integer | NULL CHECK (>= 0) |
| negotiable | boolean | NOT NULL DEFAULT false |
| available_from | date | NULL |
| published_at | timestamptz | NULL |
| closed_at | timestamptz | NULL |
| created_at / updated_at | timestamptz | NOT NULL |
| deleted_at | timestamptz | NULL |

Constraints:

- Unique `slug` WHERE `deleted_at IS NULL`  
- Unique `(property_id, intent)` WHERE `status = 'PUBLISHED' AND deleted_at IS NULL` — **partial unique index** enforcing FR-PR-04  
- Check: `intent = RENT` ⇒ `price_period = MONTHLY`; `intent = BUY` ⇒ `price_period = ONE_TIME` (app or CHECK)

Indexes (named queries):

- `listings_search_default`: `(intent, published_at DESC, id DESC)` WHERE `status = 'PUBLISHED' AND deleted_at IS NULL`  
- `listings_search_city`: need city on listing **or** join property. **Do not denormalize city on listing in P0**; index `properties(city_id, locality_id)` and filter via join. If EXPLAIN hurts, add `city_id`/`locality_id` denormalized columns P1.  
- `listings_price`: `(intent, price_amount, id)` WHERE `status = 'PUBLISHED' AND deleted_at IS NULL`  
- `listings_property`: `(property_id)`

**Search join (frozen):**

```text
listings
  JOIN properties ON properties.id = listings.property_id
  JOIN localities ON localities.id = properties.locality_id
  JOIN cities ON cities.id = properties.city_id
WHERE listings.status = 'PUBLISHED'
  AND listings.deleted_at IS NULL
  AND properties.deleted_at IS NULL
```

Cover image: lateral join or subquery `media` `ORDER BY sort_order` `LIMIT 1` where variant ORIGINAL or CARD.

### 4.5 `media`

| Column | Type | Constraints |
| --- | --- | --- |
| id | uuid | PK |
| listing_id | uuid | FK listings CASCADE |
| storage_key | varchar(500) | NOT NULL UNIQUE |
| content_type | varchar(50) | NOT NULL |
| byte_size | integer | NOT NULL CHECK (> 0) |
| width | integer | NULL |
| height | integer | NULL |
| sort_order | integer | NOT NULL DEFAULT 0 |
| variant | media_variant | NOT NULL DEFAULT `ORIGINAL` |
| created_at | timestamptz | NOT NULL |

Index: `(listing_id, variant, sort_order)`  
Check: `content_type IN ('image/jpeg','image/png','image/webp')` — app also enforces.

---

## 5. Demand

### 5.1 `leads`

| Column | Type | Constraints |
| --- | --- | --- |
| id | uuid | PK |
| listing_id | uuid | FK listings SET NULL — **prefer RESTRICT** and allow NULL listing_id without FK skip; use FK listings ON DELETE RESTRICT, listing_id nullable |
| user_id | uuid | FK users SET NULL, nullable |
| assigned_to_user_id | uuid | FK users SET NULL, nullable |
| name | varchar(80) | NOT NULL |
| phone | varchar(20) | NOT NULL |
| email | varchar(255) | NULL |
| message | varchar(1000) | NULL |
| status | lead_status | NOT NULL DEFAULT `NEW` |
| source | lead_source | NOT NULL DEFAULT `WEB_FORM` |
| created_at / updated_at | timestamptz | NOT NULL |

Indexes:

- `(status, created_at DESC)` inbox  
- `(assigned_to_user_id, status, created_at DESC)` agent inbox  
- `(user_id, created_at DESC)` my enquiries  
- `(phone, listing_id, created_at DESC)` duplicate window  

**Duplicate window (frozen):** same `phone` + `listing_id` within 24 hours, status not `SPAM`/`LOST`/`WON`, should return the existing lead.

P0 implementation: application transaction (`SELECT` recent row then `INSERT` if none). **A rare concurrent duplicate is an accepted MVP trade-off.** Do not add Redis, advisory locks, or a time-window unique index unless measured duplicate rates justify it.

There is **no** database unique constraint on `(phone, listing_id)`. Indexes support the lookup only.

### 5.2 `visits`

Include in first migration (week 7 UI optional).

| Column | Type | Constraints |
| --- | --- | --- |
| id | uuid | PK |
| lead_id | uuid | FK leads RESTRICT |
| listing_id | uuid | FK listings RESTRICT |
| preferred_date | date | NULL |
| preferred_slot | visit_slot | NOT NULL DEFAULT `ANY` |
| status | visit_status | NOT NULL DEFAULT `REQUESTED` |
| notes | varchar(1000) | NULL |
| created_at / updated_at | timestamptz | NOT NULL |

Index: `(lead_id, created_at DESC)`  
Index: `(status, preferred_date)`

**Invariant:** `visits.listing_id` must equal `leads.listing_id` for `visits.lead_id`. Enforce in the same application transaction as insert/update. Not a cheap CHECK without a composite FK; do not add a trigger in P0. Contact-form leads with `listing_id` null cannot have visits.

### 5.3 `saved_listings`

| Column | Type | Constraints |
| --- | --- | --- |
| user_id | uuid | FK users CASCADE |
| listing_id | uuid | FK listings CASCADE |
| created_at | timestamptz | NOT NULL |
| PK | (user_id, listing_id) | |

Index: `(user_id, created_at DESC)`

---

## 6. Services marketing

### 6.1 `service_catalog_items`

| Column | Type | Constraints |
| --- | --- | --- |
| id | uuid | PK |
| slug | varchar(80) | NOT NULL UNIQUE |
| title | varchar(120) | NOT NULL |
| summary | text | NOT NULL DEFAULT `''` |
| is_active | boolean | NOT NULL DEFAULT true |
| sort_order | integer | NOT NULL DEFAULT 0 |
| created_at / updated_at | timestamptz | NOT NULL |

### 6.2 `service_enquiries`

| Column | Type | Constraints |
| --- | --- | --- |
| id | uuid | PK |
| catalog_item_id | uuid | FK service_catalog_items RESTRICT |
| name | varchar(80) | NOT NULL |
| phone | varchar(20) | NOT NULL |
| email | varchar(255) | NULL |
| message | varchar(1000) | NULL |
| city | varchar(80) | NULL |
| status | service_enquiry_status | NOT NULL DEFAULT `NEW` |
| created_at | timestamptz | NOT NULL |
| updated_at | timestamptz | NOT NULL |

Index: `(created_at DESC)`  
Index: `(phone, created_at DESC)`

Enum `service_enquiry_status`: `NEW` | `CONTACTED`.  
P0 transition: `NEW → CONTACTED` only (admin). Do **not** reuse `lead_status`. Separate lifecycle from property leads.

---

## 7. Platform

### 7.1 `audit_logs`

| Column | Type | Constraints |
| --- | --- | --- |
| id | uuid | PK |
| actor_user_id | uuid | FK users SET NULL |
| action | varchar(80) | NOT NULL |
| entity_type | varchar(80) | NOT NULL |
| entity_id | uuid | NULL |
| metadata | jsonb | NOT NULL DEFAULT `{}` |
| created_at | timestamptz | NOT NULL |

Index: `(entity_type, entity_id, created_at DESC)`  
Index: `(actor_user_id, created_at DESC)`  
No updates, no deletes from app.

### 7.2 `analytics_events`

| Column | Type | Constraints |
| --- | --- | --- |
| id | uuid | PK |
| name | varchar(80) | NOT NULL |
| listing_id | uuid | NULL |
| user_id | uuid | NULL |
| properties | jsonb | NOT NULL DEFAULT `{}` |
| request_id | varchar(64) | NULL |
| created_at | timestamptz | NOT NULL |

Index: `(name, created_at DESC)`  
Index: `(listing_id, created_at DESC)` WHERE listing_id IS NOT NULL  

Do not FK listing_id (keep events if listing removed). Partitioning: not in P0.

### 7.3 `notification_logs`

| Column | Type | Constraints |
| --- | --- | --- |
| id | uuid | PK |
| template | varchar(80) | NOT NULL |
| channel | notification_channel | NOT NULL |
| to_masked | varchar(255) | NOT NULL |
| status | notification_status | NOT NULL |
| provider_message_id | varchar(160) | NULL |
| error | varchar(500) | NULL |
| created_at | timestamptz | NOT NULL |

Index: `(created_at DESC)`

---

## 8. What is not a table

Do **not** create MVP tables or empty placeholders for:

`owners`, `brokers`, `broker_profiles`, `commissions`, `service_providers`, `quotations`, `work_orders`, `transactions`, `payments`, `subscriptions`, `reviews`, `documents`, `kyc`, `property_units`, `follow_ups`, `lead_notes`, `chat`, `messages`, `societies`.

---

## 9. Referential delete policy (summary)

| Child | Parent | On delete |
| --- | --- | --- |
| listings | properties | RESTRICT (unpublish/archive first) |
| media | listings | CASCADE |
| leads.listing_id | listings | RESTRICT (keep history; do not delete listings with leads — use CLOSED) |
| visits | leads | RESTRICT |
| saved_listings | users/listings | CASCADE |
| user_roles | users | CASCADE |
| refresh_tokens | users | CASCADE |
| password_reset_tokens | users | CASCADE |

---

## 10. Seed data (required for empty system)

- Roles + permissions + mappings  
- Super Admin user (local/staging only via env; prod via runbook)  
- Cities: Delhi, Noida, Greater Noida, Ghaziabad, Gurugram  
- ~20–40 localities minimum to make search real  
- Amenities: lift, security, park, power_backup, gym, clubhouse, visitor_parking, water_supply, gas, wheelchair (trim as needed)  
- Service catalog: interior, painting, cleaning, packers_movers, home_loan  

---

## 11. Migration order (frozen)

Do not reorder. Do not insert deferred entities.

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

Safety: no breaking column drops after prod without expand/contract. Test partial unique publish conflict. RLS is not P0; app RBAC is the control.

---

## 12. Prisma mapping notes (not the schema file)

Prisma is the ORM. **Do not generate `schema.prisma` in this pass.**

Use Prisma for models and most FKs. Use **explicit SQL migrations** for:

- Partial unique index: one `PUBLISHED` listing per `(property_id, intent)` where `deleted_at IS NULL`  
- Composite FK `properties(locality_id, city_id) → localities(id, city_id)` if Prisma cannot emit it  
- Partial search indexes if Prisma cannot express `WHERE`  
- Unconditional unique on `users.email` and `users.phone` (Prisma `@@unique` is fine here)

Do not distort the database design merely to avoid a small amount of raw SQL.

Soft delete: repositories filter `deleted_at`; uniqueness of email/phone does **not** use a partial index.

---

## 13. Next

Schema is corrected. Prisma schema is the next implementation artifact **only when implementation is requested**.

**End of Deliverable 06 (corrected).**
