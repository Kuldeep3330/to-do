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
| 4 | **Lead response timer**: overdue highlighting in the inbox against the 2-hour target | Planned |
| 5 | **Deal tracking**: closed price and date when a lead becomes WON, so revenue and conversion can be measured | Planned |
| 6 | **Amenities on listing detail** (known gap from doc 26) | Planned |
| 7 | **Locality landing pages** for search traffic | Planned |

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

## 9. Open questions for the owner

1. Confirm the starting area and the renter-first focus.
2. How many field staff will visit homes, and how many agents will answer enquiries? This sets realistic targets for sections 5 and 7.
3. Is a 15-day freshness window right, or should it be shorter for rentals?
4. Confirm the success-fee default, or choose another model, before the first deal closes.
