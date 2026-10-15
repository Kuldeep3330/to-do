# Real Estate Platform — Detailed Requirements Specification

**Document:** Deliverable 02 / Step 2  
**Depends on:** `docs/01-system-design-master.md`  
**Status:** Corrected — aligned with Architecture Freeze v1  
**Date:** 2026-09-26  
**Scope of this document:** P0 (Must Have) modules only, plus thin P0 Should-Haves that are in the 60–70 day plan if schedule holds.  
**Out of this document:** Full PostgreSQL DDL, complete OpenAPI catalog, frontend folder tree, application code.

Decision defaults used here (from Deliverable 01 recommendations, still reversible until you reject them):

| ID | Default used in this spec |
| --- | --- |
| D1 | MVP = discovery + admin inventory + leads + thin customer + thin services |
| D3 | Customer email/password; phone required on enquiry and profile |
| D5 | No Redis required to satisfy these requirements |
| D7 | PostgreSQL search/filters |
| D12 | Guest enquiry allowed |
| D13 | Owner/sell self-serve out of MVP |
| D14 | No payments |

If you reject a default, this spec must be edited before schema work.

Priority in this document:

- **P0** — specified fully; implement in 60–70 days  
- **P0-thin** — specified as a reduced behavior; do not grow it  
- **P1+** — named only as a boundary so we do not accidentally specify it  

---

## 1. Purpose and how to read this

This is the requirements freeze for coding later. Each P0 module has:

- Goal  
- Actors  
- Preconditions  
- Inputs / outputs  
- Business rules  
- State transitions  
- Permissions  
- Error cases  
- UX notes (product, not visual design)  
- Acceptance criteria  
- Explicit non-goals  

Numbering: `FR-<MODULE>-<nn>`.

---

## 2. Actors (P0)

| Actor | Description | Auth |
| --- | --- | --- |
| Visitor | Unauthenticated public user | None |
| Customer | Registered person seeking property | Customer role |
| Sales Agent | Internal person working assigned leads | Agent role; UI only if you have agents |
| Admin | Internal operator of inventory and all leads | Admin role |
| Super Admin | Same as Admin plus role management | Super Admin role |
| System | Email sender, jobs, rate limiter | N/A |

Staff not in P0 as a separate portal. Finance, owner, broker, provider: not actors in this spec.

---

## 3. Cross-cutting rules (apply to every module)

**CR-01** Only `PUBLISHED` listings are visible on public pages and public APIs.  
**CR-02** Property (asset) and Listing (offer) are distinct. Public URLs and enquiries attach to a **listing**.  
**CR-03** No public page exposes owner phone, owner email, internal notes, or unpublished prices if a listing is not published.  
**CR-04** All public write endpoints (enquiry, register, login, visit request) are rate limited.  
**CR-05** PII (phone, email) is never written to client-side analytics as full values.  
**CR-06** Soft-deleted listings and properties are omitted from public search and 404 on detail.  
**CR-07** Every admin mutation writes an audit record (who, what, entity id, time).  
**CR-08** Legal pages exist as placeholders; copy is not invented as “RERA compliant”.  
**CR-09** File binaries are never stored in PostgreSQL.  
**CR-10** Guest and customer can submit an enquiry without completing a visit request.  
**CR-11** Validation failures return field-level errors; do not silently coerce invalid prices or phone numbers.  
**CR-12** Time storage is UTC; display IST in UI.

---

## 4. Module: Locations (P0 pragmatic)

### Goal

Give listings a controlled Delhi-NCR place so search, SEO path, and admin forms share one vocabulary.

### Actors

Admin (write), all (read published locality list).

### FR-LOC-01 City master

- Seeded cities at minimum: Delhi, Noida, Greater Noida, Ghaziabad, Gurugram (Gurgaon). Faridabad optional seed.  
- Fields conceptually: name, slug, is_active.  
- Visitors cannot create cities.

### FR-LOC-02 Locality master

- Each locality belongs to exactly one city.  
- Fields conceptually: name, slug, city, is_active, optional lat/lng centroid.  
- Admin can add localities. Duplicate (city + slug) is rejected.

### FR-LOC-03 Address on property

- Property stores: city, locality (required for publish), address text (optional), lat, lng (optional but required to show a map pin).  
- Society/project is a **string** on property, not a master table in P0.

### Business rules

- Inactive city/locality cannot be selected on new listings. Existing published listings remain until unpublished.  
- Slugs are URL-safe, lowercase, unique per parent.

### Errors

- Unknown locality id  
- Locality/city mismatch  
- Inactive locality on publish  

### Non-goals

- India-wide geo tree, polygons, society database, auto-complete against Google Places as source of truth.

### Acceptance

- Admin can attach a Noida locality to a property.  
- Public search can filter by city and by locality.  
- Invalid city/locality pair cannot be published.

---

## 5. Module: Property (P0)

### Goal

Record the real-world asset once, independent of whether it is for sale or rent.

### Actors

Admin create/update; Super Admin same. Public never writes properties.

### Inputs (minimum to save draft)

- Property type: `RESIDENTIAL` | `COMMERCIAL` | `PLOT` (P0). New Projects are **out of MVP** — no type and no `is_new_project` field.  
- City, locality  
- Title (internal; marketing title may live on listing)  
- Super built-up / carpet / plot area: at least one area number + unit (`SQFT` default)  
- Optional: bedrooms, bathrooms, balconies, floor, total floors, furnishing (`UNFURNISHED` | `SEMI` | `FURNISHED`), facing, age, parking, society name, lat/lng, amenities set  

### Outputs

Persisted property id; used when creating listings.

### Business rules

- **FR-PR-01** Deleting a property with a published listing is not a hard delete; block or require unpublish first. Soft delete only when no published listing exists, or cascade unpublish (choose **block publish-delete**; safer).  
- **FR-PR-02** Amenities are selected from a seeded master (parking types, security, lift, park, power backup, etc.). Free-text amenity is not P0.  
- **FR-PR-03** Area must be > 0 if present. Bedrooms 0 allowed for studios/plots.  
- **FR-PR-04** One property may have zero or more listings over time, but **at most one PUBLISHED listing per intent** (one published RENT and one published SALE is allowed; two published RENT is not).

### States

Property: `ACTIVE` | `ARCHIVED` (soft). No public state; listing state controls visibility.

### Errors

- Validation, locality missing on publish of its listing, delete blocked by published listing.

### Non-goals

- Unit-level inventory (tower/flat numbers as first-class entities).  
- Ownership/KYC documents.

### Acceptance

- Admin creates a residential property in Noida without a listing (draft asset).  
- Admin cannot publish a listing without required property fields (locality, type, at least one area).  
- Same property can later get a second listing of the other intent without duplicating the asset (schema/behavior reserved; UI can be “add listing”).

---

## 6. Module: Listing (P0)

### Goal

The commercial offer people search and enquire on.

### Actors

Admin write; Visitor/Customer read published.

### Inputs

- Property id  
- Intent: `BUY` | `RENT`  
- Price (integer INR). For rent: price is monthly unless `price_period` says otherwise. P0: monthly rent only; sale is lump sum.  
- Optional: maintenance monthly, security deposit (rent), negotiable flag  
- Marketing title, description, slug (auto from title+locality, editable)  
- Availability date optional  
- Status  

### States

```text
DRAFT --> PUBLISHED --> PAUSED --> PUBLISHED
PUBLISHED --> CLOSED
DRAFT --> (soft delete)
PAUSED --> CLOSED
```

- `DRAFT`: not public  
- `PUBLISHED`: public  
- `PAUSED`: hidden but not closed (temporarily off market)  
- `CLOSED`: deal done or withdrawn; not public  

### Business rules

- **FR-LI-01** Slug unique among non-deleted listings. Changing slug on a published listing should keep old slug as redirect **P1**; P0: slug immutable after first publish (simpler, recommended).  
- **FR-LI-02** Publish checks: property has city+locality, listing has title, price > 0, at least one image, intent set.  
- **FR-LI-03** Public card shows: title, locality, city, intent, price, BHK or plot area, primary image, furnishing if set.  
- **FR-LI-04** Description is plain text or safe markdown subset; no raw HTML.  
- **FR-LI-05** Closed/paused listings 404 or “no longer available” — **recommendation: 404 for unpublished to avoid SEO zombies; optional `GONE` page P1.** P0: 404.  
- **FR-LI-06** Admin can preview draft via authenticated admin preview URL, not the public slug.

### Permissions

- Public GET published by slug  
- Admin full CRUD per RBAC  
- Customer cannot mutate listings  

### Errors

- Publish validation failed (list missing fields)  
- Duplicate slug  
- Property archived  

### Acceptance

- Unpublished listing never appears in `GET` public search.  
- Published listing appears within the next search request (no eventual-consistency product requirement).  
- Two published rents on one property are rejected.

### Non-goals

- Premium/paid listings, boost, auto-expire engine (manual pause is enough).  
- Multi-currency.

---

## 7. Module: Media (P0)

### Goal

Attach photos to a listing (and optionally property). Serve public images from object storage.

### Actors

Admin upload/reorder/delete; public read public images.

### Rules

- **FR-ME-01** Allowed types: JPEG, PNG, WebP. No GIF/PDF/video in P0.  
- **FR-ME-02** Max file size 8 MB per ORIGINAL. Max **20 ORIGINAL** images per listing (CARD/DETAIL variants do not count).  
- **FR-ME-03** First image in sort order is the card/OG image.  
- **FR-ME-04** Storage key + content type + width/height recorded; bytes in object storage.  
- **FR-ME-05** Public listings: public-read URLs or CDN. No signed URL required for listing photos.  
- **FR-ME-06** Replace/delete: removing the last image unpublishes or blocks staying published (**block if published and images would become 0**).  
- **FR-ME-07** Virus scan is P1. P0: type/size allowlist only.

### Errors

- Wrong type, oversize, over count, storage failure.

### Non-goals

- Floor-plan PDF, video transcoding, KYC docs, private agreements.

### Acceptance

- Admin uploads 3 photos, sets cover, public detail shows them.  
- SVG/HTML/EXE upload rejected.

---

## 8. Module: Public discovery and search (P0)

### Goal

A visitor in NCR can find relevant published listings and open a detail page.

### Journeys

Home → search/filter → listing detail → enquiry.

### FR-SR-01 Home

- Value proposition, search entry (intent, city, optional locality, BHK, budget), featured/latest listings (e.g. last 8 published), link to services page.  
- No personalization engine.

### FR-SR-02 Search / browse

Filters (all optional except that results are always published only):

| Filter | Type |
| --- | --- |
| intent | BUY or RENT |
| city | slug or id |
| locality | slug or id |
| property type | residential, commercial, plot |
| bedrooms | exact or min (P0: exact 1/2/3/4+ is enough) |
| price min/max | INR |
| area min/max | sqft |
| furnishing | enum |
| q | keyword on title (simple) |

Sort: `newest` (default), `price_asc`, `price_desc`.  
Page size default 12, max 24.

Empty state: “No listings match. Clear filters.” Never invent listings.

### FR-SR-03 Listing detail

Shows marketing fields, property facts, gallery, locality, map pin **only if lat/lng present** (map is optional; if maps key missing, show address text only).  
CTAs: Enquire, Save (if logged in), WhatsApp click-to-chat if a **platform** contact number is configured (not owner number), Call if configured.

### FR-SR-04 SEO (P0)

- URL pattern **proposed:** `/buy/{city}/{locality}/{slug}` and `/rent/{city}/{locality}/{slug}`  
- Unique title and meta description from listing fields  
- Canonical URL  
- Open Graph image = cover image  
- `sitemap.xml` of published listings + static pages  
- `robots.txt` allow public, disallow `/admin`, `/api`  
- JSON-LD RealEstateListing or equivalent **if** we can populate honestly; skip fake ratings  

Locality landing pages: **P0 only if time in week 5**; otherwise P1. Do not generate empty locality pages.

### Errors

- Invalid filter values → 400 on API; UI ignores unknown  
- Unknown slug → 404  

### Non-goals

- Map bounding-box search, saved searches alerts, “similar listings” ML, Elasticsearch relevance.

### Acceptance

- Filter Rent + Noida + 2 BHK + price range returns only matching published listings.  
- Detail is server-rendered enough for Google to see title and description.  
- Search does not return drafts.

---

## 9. Module: Enquiry and Lead (P0) — core conversion

### Goal

Turn interest into a staff-workable lead with a valid phone number.

### Actors

Visitor, Customer (create); Agent (assigned); Admin (all); System (email).

### Inputs — create enquiry

| Field | Required | Notes |
| --- | --- | --- |
| listing_id or slug | Yes | Must be published |
| name | Yes | 2–80 chars |
| phone | Yes | India mobile; store E.164 `+91...` |
| email | No | If present, valid email |
| message | No | Max 1000 chars |
| intent | No | Defaults from listing |
| source | No | `web_form`, `listing_whatsapp_click` as analytics not always a lead |

WhatsApp/call clicks are analytics events; they do **not** automatically create a lead unless we add a form. P0: form creates leads.

### Guest vs logged-in

- Guest allowed (D12).  
- If logged in, attach `user_id`; still copy name/phone snapshot onto the lead.  
- Do not require account.

### Duplicate rule (FR-LD-01)

If the same `phone` + `listing_id` has a lead created within 24 hours and status is not `SPAM`/`LOST`/`WON`, **do not create a second lead**. Return success (guest: `{ ok: true }`; no extra PII). Optionally append message as a note **P0-thin: skip notes, just return success**.

Implementation: transactional SELECT then INSERT. **A rare concurrent duplicate is an accepted P0 trade-off.** No Redis and no time-window unique index unless measured rates justify it.

### Lead states

```text
NEW --> CONTACTED --> QUALIFIED --> VISIT_SCHEDULED --> WON
                 \-> UNQUALIFIED --> LOST
NEW --> SPAM
Any non-terminal --> LOST
VISIT_SCHEDULED --> LOST or WON or back to QUALIFIED
```

P0 allowed statuses: `NEW`, `CONTACTED`, `QUALIFIED`, `UNQUALIFIED`, `VISIT_SCHEDULED`, `WON`, `LOST`, `SPAM`.

Admin/agent can set status; customer cannot.

### Assignment

- `assigned_to` user id optional.  
- Admin can assign to an Agent.  
- Unassigned leads visible to Admin/Super Admin.  
- Agent sees **assigned to self** only (plus leads they created, if any).

### Permissions

| Action | Visitor | Customer | Agent | Admin |
| --- | --- | --- | --- | --- |
| Create | Y | Y | Y | Y |
| List own (by phone/user) | | Y | | |
| List assigned | | | Y | Y |
| List all | | | | Y |
| Update status/assignment | | | assigned | Y |
| Read another customer’s lead | N | N | N unless assigned | Y |

### Side effects

- **FR-LD-02** On create: email to configured ops inbox; email to customer if email present. Failure to send email must **not** roll back the lead. Log the failure.  
- **FR-LD-03** Analytics event `lead_created`.  
- **FR-LD-04** Rate limit: e.g. 5 POSTs / IP / 10 minutes and 3 / phone / hour (values tunable).

### Errors

- Listing not published → 404/409  
- Invalid phone → 400  
- Rate limited → 429  
- Missing name/phone → 400  

### Customer “my enquiries”

Logged-in customer sees leads where `user_id` matches. Guest cannot list later without account (P1: claim-by-otp).

### Non-goals

- Call masking, auto-dialer, WhatsApp templates, lead scoring ML, multi-listing cart enquiry.

### Acceptance

- Submit valid form on a published listing → lead `NEW` in admin inbox.  
- Repeat submit same phone+listing within 24h → no second row in the non-racy case; a rare concurrent duplicate is accepted.  
- Customer A cannot GET customer B’s lead by id (**404**, scoped query — never 403 that confirms existence).  
- Draft listing enquiry rejected.

---

## 10. Module: Authentication and customer account (P0 thin)

### Goal

Identify customers for saved listings and “my enquiries”; identify staff for admin.

### FR-AU-01 Register (customer)

- Email, password, name, phone.  
- Email unique, phone unique among users **including soft-deleted rows** (no reuse).  
- Password min 8, not leaked-obvious; store hash (argon2id or bcrypt).  
- Email verification **P1**; P0 login allowed unverified.  
- Role = CUSTOMER.

### FR-AU-02 Login

- Email + password → access + refresh.  
- Wrong password: generic error, increment lockout.  
- Lockout: 10 failures / 15 minutes / identifier (email).  
- Admin uses same login, different role; **admin UI is separate route**, not a flag in the public navbar.

### FR-AU-03 Session

- Access short-lived; refresh rotating; logout revokes refresh.  
- Password reset: email link, single use, expiry 1 hour.

### FR-AU-04 Me

- GET/PATCH name, phone. Cannot PATCH role.

### Staff users

- Created by Super Admin, not public register.  
- Public register cannot become Admin.

### Errors

- Duplicate email/phone, weak password, invalid credentials, locked, invalid/expired reset.

### Non-goals

- Social login P0 (Google is Could Have), WebAuthn, multi-device dashboard beyond revoke-all-on-reset.

### Acceptance

- Register → login → access `/me`.  
- Public register is never Admin.  
- Reset flow changes password and invalidates old refresh tokens.

---

## 11. Module: Saved listings (P0)

### Rules

- Authenticated customer only.  
- Save/unsave by listing id; listing must be published to save. If later unpublished, save remains but opens 404 (acceptable P0).  
- Max 100 saves per user (abuse cap).  
- No folders.

### Acceptance

- Save and list mine; another user does not see it.

---

## 12. Module: Visit requests (P0-thin)

### Goal

Express high intent. Not a calendar product.

### Create

- Auth customer **or** guest with name+phone (pick one). **Recommendation: customer-only visit request** to cut spam; guest still has enquiry. If you need guest visits, reuse enquiry fields.  
- listing must be published  
- preferred date (optional), preferred slot `ANY | MORNING | AFTERNOON | EVENING`, notes  

### States

`REQUESTED` → `CONFIRMED` | `CANCELLED`  
`CONFIRMED` → `COMPLETED` | `NO_SHOW` | `CANCELLED`

Staff updates status. Customer can cancel while `REQUESTED`.

### Link to lead

On create, if a lead exists for this user/phone + listing, attach visit to that lead and set lead to `VISIT_SCHEDULED` when staff confirms. If no lead, create a lead `NEW` then attach (so inbox is not bypassed).

### Non-goals

- Agent routing, SMS reminders, slot inventory, Google Calendar.

### Kill order

If week 7 is late, **drop this module entirely**. Enquiry remains.

---

## 13. Module: Services catalog (P0-thin)

### Goal

Marketing pages + one enquiry type, so the URL can mention services without a marketplace.

### Catalog

Seeded items examples: Interior design, Painting, Cleaning, Packers & movers, Home loan assistance. Each: slug, title, short copy, active flag. Admin can edit copy later; **P0 can be static content in CMS-less seed**.

### Service enquiry

- name, phone, email optional, service slug, message, city optional  
- Stored separately from property leads (`service_enquiries` table).  
- Status: `NEW` | `CONTACTED` (own enum). Admin may set `NEW → CONTACTED` only.  
- Email ops inbox.  
- No provider assignment.

### Non-goals

- Quotations, work orders, provider profiles, payments, SLA.

### Kill order

Drop before visits if needed; keep a static “Services coming soon” page.

---

## 14. Module: Admin operations (P0)

### Surfaces

- Login to `/admin`  
- Dashboard: counts — published listings, leads NEW, leads today (P0 numbers only)  
- Properties list/create/edit  
- Listings list/create/edit/publish/pause/close  
- Media manager on listing  
- Leads inbox filter by status, city, intent  
- Lead detail: status, assignment, snapshot contact  
- Customers list (id, email, phone, created) — no marketing automation  
- Locality list/create  
- Users: Super Admin creates Admin/Agent  

### Rules

- Admin UI is not indexed (`noindex`, robots disallow).  
- All list endpoints paginated.  
- Destructive actions confirm in UI.

### Non-goals

- Excel-like pipeline kanban polish, call logs, commission.

---

## 15. Module: Notifications (P0 email only)

### Abstraction

Business code calls `NotificationService.send(template, to, data)` and does not import SES/Resend.

### P0 templates

| Template | To | When |
| --- | --- | --- |
| `lead_received_customer` | Enquirer email if present | Lead created |
| `lead_received_ops` | Ops inbox | Lead created |
| `service_enquiry_ops` | Ops inbox | Service enquiry |
| `password_reset` | User | Reset requested |
| `visit_requested_ops` | Ops | If visits ship |

No SMS, WhatsApp API, push.

### Rules

- Retry: best-effort; P0 sync send with log on failure is acceptable.  
- Do not put other users’ PII in customer emails.  
- Idempotency: duplicate lead rule avoids duplicate ops spam.

---

## 16. Module: RBAC (P0)

Permissions are checked on the API, not only hidden buttons.

Seed roles: `SUPER_ADMIN`, `ADMIN`, `SALES_AGENT`, `CUSTOMER`.

Catalog (minimum):

- `listing.read_public` (implicit for all)  
- `listing.manage`  
- `property.manage`  
- `location.manage`  
- `media.manage`  
- `lead.create`  
- `lead.read_own`  
- `lead.read_assigned`  
- `lead.read_all`  
- `lead.update_assigned`  
- `lead.update_all`  
- `lead.assign`  
- `visit.read_own` / `visit.manage_staff`  
- `user.manage`  
- `role.manage` (super only)  
- `audit.read` (admin+)  

UI hides unauthorized routes but **API still returns 403**.

---

## 17. Module: Content and legal (P0)

Pages: Home, Search, Listing detail, Contact, About (short), Privacy placeholder, Terms placeholder, Services index + item.  
Contact: company email, phone, WhatsApp link from config, optional form that creates a generic lead without listing (`listing_id` null allowed **only** for contact form).

**Requires validation:** actual legal entity name, address, grievance officer (if applicable). Use placeholders clearly marked.

---

## 18. Module: Analytics events (P0 collect)

Server or first-party: `property_search`, `listing_viewed`, `lead_created`, `listing_saved`, `contact_clicked`, `service_enquiry_created`, `visit_requested`.

No third-party ads pixel required. If added later, consent **requires validation**.

---

## 19. Non-functional requirements (testable)

| ID | Requirement |
| --- | --- |
| NFR-01 | Public listing HTML includes title in first response (SSR/SSG) |
| NFR-02 | Enquiry POST p95 < 500 ms excluding email provider (email async-or-after-commit) |
| NFR-03 | Search p95 < 500 ms at ≤ 500 listings with indexes |
| NFR-04 | 429 on abusive enquiry/login |
| NFR-05 | `/health` does not expose internals |
| NFR-06 | Backups exist; restore tested before launch (ops requirement) |
| NFR-07 | Secrets not in git |
| NFR-08 | WCAG AA not required; forms keyboard usable |
| NFR-09 | Images via object storage URLs, not API blob streaming as primary path |

---

## 20. Error catalog (shared)

| Code | HTTP | When |
| --- | --- | --- |
| `VALIDATION_ERROR` | 400 | Field errors |
| `UNAUTHENTICATED` | 401 | No/invalid token |
| `FORBIDDEN` | 403 | Authenticated but not allowed |
| `NOT_FOUND` | 404 | Missing or not visible (do not leak existence of others’ leads: use 404) |
| `CONFLICT` | 409 | Duplicate slug, publish rule, unique phone |
| `RATE_LIMITED` | 429 | Auth/enquiry |
| `UNSUPPORTED_MEDIA` | 415 | Bad upload type |
| `PAYLOAD_TOO_LARGE` | 413 | Upload size |
| `INTERNAL_ERROR` | 500 | Unexpected |

Customer-facing messages are safe; `INTERNAL_ERROR` is generic.

---

## 21. Traceability: P0 user stories (for later tasks)

1. As a visitor I can filter rent listings in Noida by BHK and budget.  
2. As a visitor I can open a listing and submit name+phone enquiry without an account.  
3. As a visitor I receive a confirmation email if I provided email.  
4. As admin I can create a property, add a rent listing, upload photos, and publish.  
5. As admin I see the new lead and mark it contacted.  
6. As a customer I can register, save a listing, and see my enquiries.  
7. As a customer I cannot access another user’s enquiries.  
8. As admin I cannot delete a property that still has a published listing.  
9. As anyone I cannot see draft listings on the public site.  
10. As ops I get an email when a lead is created.

Visit and services stories are optional (P0-thin) and may be cut.

---

## 22. Explicit exclusions (do not write stories for these yet)

Sell-side owner onboarding, broker share, payments, Razorpay, quotations, work orders, KYC document vault, Elasticsearch, WhatsApp Business API, map-first search, multi-city outside NCR, property management, tenant management, reviews marketplace, native apps.

---

## 23. Open requirement questions (blockers)

1. Confirm guest enquiry (default yes).  
2. Confirm visit requests are customer-only or dropped.  
3. Confirm New Projects / plots in first inventory.  
4. Ops inbox email address.  
5. Public WhatsApp/call number for CTAs.  
6. Slug immutable after publish — agree?  
7. Contact form without listing — needed at launch?

---

## 24. Recommended next step

After you accept this spec (or mark amendments):

- **Step 3** can be a short traffic/capacity freeze (Deliverable 01 already has ranges; only rewrite if you disagree).  
- **Step 4–6** Architecture, domain, PostgreSQL schema.  
- Still no application code.

**End of Deliverable 02.** Waiting for review if you want to amend P0; otherwise say if I should continue to architecture + domain (Steps 4–5) next.
