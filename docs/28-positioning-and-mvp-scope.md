# NCR Homes — Positioning and MVP Scope

**Document:** Deliverable 28
**Date:** 2026-10-18
**Status:** Draft for owner approval
**Audience:** the two developers and the product owner
**Depends on:** `docs/02-requirements-specification.md`, `docs/21-sprint-plan.md`, `docs/27-project-status.md`

Docs 00–26 describe *how* to build the platform. This document answers *why a user would choose it* over 99acres, MagicBricks and NoBroker, and what that means for scope. Where it conflicts with the "killable" list in doc 21, this document wins.

---

## 1. Decisions made

| Question | Decision |
| --- | --- |
| Who is the user? | **Buyers and renters** of homes in Delhi NCR. |
| Where does supply come from? | **Our own team's field visits** at first. Every listing is physically visited by our staff. |
| How do we make money? | **Not decided.** Default for the pilot: a success fee from the owner on a closed deal, invoiced by hand. Track closed deals from day one. See section 6. |
| Where do we start? | **Assumption, to confirm:** Noida (Sector 62, 76, 137) and Greater Noida (Knowledge Park, Gamma 1, Jagat Farm), with renters as the first audience. Target about **50 verified listings** there before opening other areas. |

## 2. The problem we solve

Large portals have the most listings, but users repeatedly report the same problems. These are hypotheses to validate in the first interviews, not facts.

| Problem | What users experience |
| --- | --- |
| Stale listings | A property shows as available when it was rented or sold weeks ago. |
| Bait listings | A price or photo that does not match the real home. |
| Spam calls | One enquiry is shared with many brokers. |
| Duplicates | The same flat posted several times by different brokers. |
| Thin local detail | Little on real maintenance cost, deposit terms, society rules or commute. |

## 3. Our promise

> **Every home on NCR Homes was visited by our team, and one person follows up your enquiry.**

Three claims, each backed by something the product actually does:

| Claim | Product behaviour |
| --- | --- |
| "Visited and verified" | Staff mark a listing verified after a physical visit. The public page shows the date and the verifier's first name. |
| "Still available" | A listing must be re-confirmed regularly or it is paused automatically. The page shows when it was last confirmed. |
| "One call, not ten" | An enquiry is assigned to one agent. Phone numbers are never published. Response time is tracked against a 2-hour target. |

## 4. Why this can work (and what could stop it)

**Works because:** quality is controlled by us, the area is small enough to cover well, and the product already has the building blocks (admin-curated inventory, enquiry inbox, assignment, status workflow).

**Risks:**

1. **Supply is the bottleneck.** Field visits cost time. Features will not fix an empty catalogue.
2. **Operations must keep the promise.** A "2-hour call" that is missed is worse than no promise. Staffing matters more than code.
3. **Discovery.** New sites get little search traffic. Locality pages and honest content are the cheapest source.
4. **Monetisation is unproven.** Avoid building payment features before one deal has closed.

## 5. MVP scope for the pilot

Ordered by value for effort. Items 1 and 2 are built.

| # | Item | Status |
| --- | --- | --- |
| 1 | **Verified badge** with date and verifying agent (admin action, public display, audit log) | Done 2026-10-18 |
| 2 | **Freshness**: "last confirmed" date, "Confirm available" action, hourly job pausing listings not confirmed within `LISTING_STALE_DAYS` (default 15, `0` disables) | Done 2026-10-18 |
| 3 | **Visit booking**: signed-in customer requests a visit, staff confirm a slot, customer can follow and cancel | Done 2026-10-18 |
| 4 | **Lead response timer**: overdue highlighting in the inbox against the 2-hour target | Done 2026-10-19 |
| 5 | **Deal tracking**: closed price and date when a lead becomes WON, so revenue and conversion can be measured | Done 2026-10-19 |
| 6 | **Amenities on listing detail** (known gap from doc 26) | Done 2026-10-19 |
| 7 | **Locality landing pages** for search traffic | Done 2026-10-19 |

**Out of scope until a deal has closed:** payments, owner self-posting, broker marketplace, maps, native apps.

## 6. Money: options and default

| Model | How it works | Assessment |
| --- | --- | --- |
| Owner or landlord success fee | Paid only when the home is rented or sold, for example about half a month's rent for a rental | **Default.** Matches the managed model, needs no payment code, rewards accurate listings. |
| Tenant or buyer fee | Service fee on a successful rental | Higher friction against free portals. Avoid at first. |
| Partner services | Commission on home loans, packers and movers, painting, cleaning | Good side income. The services catalogue already exists in the schema. Unlikely to cover costs alone. |

Revisit after the first 10 closed deals. Until then, measure rather than charge.

## 7. How we will know it works

Track from the first week of the pilot:

| Metric | Why |
| --- | --- |
| Verified listings live | Supply progress toward the 50 target |
| Share of listings confirmed within the freshness window | Is the "still available" promise holding? |
| Enquiries per published listing | Demand |
| Median time to first contact | The 2-hour promise |
| Enquiry → visit → closed-deal conversion | The only measure that proves the model |

## 8. Implementation notes for items 1–2

- **Schema:** `listings.verified_at`, `verified_by_user_id` (FK to users, set null on delete) and `last_confirmed_at`. Existing published listings were backfilled with `last_confirmed_at = published_at`. Migration `20261018120000_listing_verification`.
- **API:** `POST /api/v1/admin/listings/:id/verify` and `/confirm` (permission `listing.manage`, audited). Closed listings return 409. Publishing also sets `last_confirmed_at`.
- **Public data:** cards expose `verifiedAt` and `lastConfirmedAt`; detail adds `verifiedByFirstName`. Only the first name is public.
- **Freshness job:** `ListingFreshnessJob` runs on API start and hourly, skips in `test`, and is safe to run on several instances. A paused listing returns to the public site when staff publish it again, which counts as a new confirmation.
- **Web:** "Verified" pill on cards and the detail header, a trust note on the detail page, and verify / confirm controls in the admin publish panel.
- **Tests:** HTTP specs cover first publish state, verify (including the customer 403 and first-name-only exposure), confirm, closed-listing rejection, and `pauseStale` cut-off behaviour.

## 8b. Implementation notes for item 3 (visit booking)

- **Who can request:** signed-in customers only, as recommended in doc 02 section 12, to limit spam. Guests are sent to sign in and returned to the same home. Guests can still send an enquiry. **Trade-off:** this adds a step for first-time visitors. If visit conversion is low, consider allowing guest requests with name and phone.
- **Rules:** the listing must be published; the date is optional but must be between today and 30 days ahead (India calendar day); slot is `ANY`, `MORNING`, `AFTERNOON` or `EVENING`; one open request (requested or confirmed) per customer per home.
- **Lead link:** a request attaches to the customer's open lead for that home, or creates a `NEW` lead, so the inbox stays the single source of truth. Confirming a visit moves its lead to `VISIT_SCHEDULED`, but never reopens a lead that is already won, lost, spam or unqualified.
- **State machine:** `REQUESTED → CONFIRMED | CANCELLED`, `CONFIRMED → COMPLETED | NO_SHOW | CANCELLED`. The customer can cancel only while `REQUESTED`. Transitions are atomic, so two staff clicking at once cannot both succeed.
- **API:** `POST/GET /api/v1/me/visits`, `POST /api/v1/me/visits/:id/cancel`; `GET /api/v1/admin/visits`, `POST /api/v1/admin/visits/:id/{confirm,complete,no-show,cancel}`. Admins see all visits; agents see visits on leads assigned to them. Staff actions are audited (`UPDATE_VISIT`); an ops email (`visit_requested_ops`) and a `visit_requested` analytics event are sent on request.
- **Web:** "Book a visit" on the listing page (sidebar card and mobile bar), **My visits** in the account area, and a **Visits** queue in the admin with one-click actions.
- **Not included yet:** reminders, rescheduling by the customer, a customer email on confirmation.

## 8c. Implementation notes for item 4 (lead response timer)

- **Definition:** a lead is "waiting" while its status is `NEW` and it has no recorded first response. It is **overdue** once it has waited longer than `LEAD_RESPONSE_SLA_MINUTES` (default 120).
- **What counts as a response:** the first time staff move the lead out of `NEW` to any other status, or confirm a visit on it. Assigning a lead to an agent does **not** count, because the customer has still not heard from anyone. The first response is recorded once (`leads.first_response_at`) and later status changes never rewrite it.
- **Inbox:** a Response column shows "Respond within 45 min", "Overdue by 3 h" or "Answered in 20 min"; the lead page shows the same; an "Overdue only" filter is shareable via `?overdue=true`.
- **Dashboard:** new tiles for overdue leads and the median time to first response over the last 30 days. Both respect the viewer's scope (agents see their own assigned leads).
- **API:** admin lead payloads gain `firstResponseAt`, `respondBy`, `overdue`, `responseMinutes`; `GET /admin/leads?overdue=true`; dashboard gains `leadsOverdue`, `responseTargetMinutes`, `medianResponseMinutes`. Migration `20261019120000_lead_first_response` backfills existing worked leads using their last update time.
- **Not included yet:** notifications or escalation when a lead goes overdue, business-hours handling (the clock runs 24 hours), and per-agent response reports. Decide whether the 2-hour promise should pause overnight before launch.

## 8d. Implementation notes for item 5 (deal tracking)

- **Rule:** a lead cannot be marked **Won** without a closing value. The value is the **monthly rent** for a rental and the **sale price** for a purchase (whole INR). The closing day defaults to today, cannot be in the future, and cannot be before the enquiry arrived (India calendar day).
- **Lifecycle:** deal details exist only on won leads. Staff can correct them later ("Edit deal"). Moving a lead away from Won clears them, so the numbers never describe a deal that is no longer won.
- **Inbox:** choosing Won opens a dialog for the amount and date instead of failing server-side. The lead page shows a Deal card.
- **Dashboard (last 30 days):** deals won, an approximate win rate (deals won divided by new enquiries in the same period), total agreed monthly rent, and total agreed sale value. Rent and sale values are kept separate because adding a monthly rent to a purchase price would be meaningless. Agents see only their own assigned leads.
- **API:** `PATCH /admin/leads/:id` accepts `closedAmount` and `closedOn`; lead payloads return them; dashboard adds `dealsWon`, `winRatePercent`, `wonRentMonthly`, `wonSaleValue`. Migration `20261019130000_lead_deal_tracking` adds `closed_amount` (must be positive) and `closed_on`.
- **Legacy data:** leads that were already Won before this change have no recorded value. They show "Not recorded" with an "Add deal details" button, and are left out of the money totals.
- **Not included yet:** the fee your team earns on each deal (the money model is still undecided, see section 6), per-agent deal reports, and exporting deals for invoicing. Once a fee is chosen, it can be computed from these fields.

## 8e. Implementation notes for item 6 (amenities on listing detail)

- **API:** the public listing detail (`GET /api/v1/listings/:slug`) now returns `amenities: [{ code, name }]`, alphabetical, only for amenities that are still active. List and search results deliberately do **not** include them, to keep the cards fast.
- **Page:** an Amenities section with an icon per amenity (a check mark for any new code without its own icon). When a property has none, the section is not shown at all, so there is no empty heading.
- **SEO:** each amenity is also added to the page's structured data as an `amenityFeature`.
- **Content:** amenities come from the property in the admin form; nothing new to enter. Listings whose property has no amenities selected will show no section, so field staff should fill this in during the visit.
- **Not included yet:** filtering search by amenity.

## 8f. Implementation notes for item 7 (locality landing pages)

- **URLs:** `/rent/{city}`, `/rent/{city}/{locality}`, `/buy/{city}` and `/buy/{city}/{locality}`. They sit beside the existing listing URLs (`/rent/{city}/{locality}/{slug}`), so a listing page's breadcrumbs now link up to its locality page and city page.
- **What a page shows:** a heading, a plain-language summary, a facts strip (number of homes, lowest, middle and highest price, and how many were verified by our team), the 12 newest homes with a "View all" link into search, links to other areas that have homes, and a link to the same area for the other intent.
- **No invented content:** every sentence is built from real numbers for that area. The "middle price" is only shown when there are at least 3 homes, and rent and sale are never mixed on one page. There is no filler text, so the pages stay honest and unique.
- **Search engines:** each page has its own title, description, canonical address, structured data (a collection of the homes shown) and breadcrumbs. Pages for areas with no homes still work for visitors but are marked `noindex` and left out of the sitemap, to avoid thin pages. Unknown cities or localities return a real 404.
- **API:** `GET /api/v1/areas/:city?intent=RENT|BUY` and `GET /api/v1/areas/:city/:locality?intent=...`, public and cached for a minute. Only published, non-deleted listings are counted.
- **Freshness:** pages are cached for about 5 minutes, so a newly published home can take that long to appear on its locality page. On-demand refresh is still a non-goal.
- **Adding an area:** create the locality in the admin (or the API). It gets a page automatically once it has a published home.
- **Not included yet:** filters on the landing pages themselves (the full search handles that), neighbourhood write-ups, maps, and pages by property type or bedrooms (for example "2 BHK in Sector 62"), which would be the next source of search traffic.

## 9. Open questions for the owner

1. Confirm the starting area and the renter-first focus.
2. How many field staff will visit homes, and how many agents will answer enquiries? This sets realistic targets for sections 5 and 7.
3. Is a 15-day freshness window right, or should it be shorter for rentals?
4. Confirm the success-fee default, or choose another model, before the first deal closes.
