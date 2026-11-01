# 29 — NCR Homes Discover: research findings and phased plan

Status: proposal, awaiting approval of Phase 1. No Discover code exists yet.
Source spec: "NCR Homes Discover — V1 Product Specification & Implementation Brief" (v1.0).

## Part A — Market research (product view)

### What the research supports

| Finding | Evidence | Confidence |
|---|---|---|
| Trust in listings is the open problem in Indian portals. Portals aggregate broker-supplied data, and duplicates and stale listings are common. | MagicBricks said getting authentic information from brokers "has been a challenge" ([MediaNama](https://www.medianama.com/2014/01/223-outlook14-what-indian-online-properties-listing-companies-plan-to-do/)); a 99acres executive called it "buyer beware" ([Business Today](https://www.businesstoday.in/magazine/money-today/real-estate/realty-websites-99acres-housing.com-magicbricks-pros-cons/story/220835.html)); 99acres and Housing.com market on-site verification teams ([The Week](https://www.theweek.in/theweek/business/Real-estate-portals.html)). | Medium. Sources are old press and vendor material. |
| Renters worry about deposits, brokerage and fake listings. | NoBroker survey data summarised by [RentOk](https://rentok.com/blogs/case-study/security-deposits-the-hidden-cost-of-renting) (2019, multi-city); fake-listing and impersonation warnings in a [Lodha advisory](https://www.lodhagroup.com/blogs/homebuyers-handbook/rental-safety-in-india) (Oct 2025). | Low to medium. No Delhi NCR specific 2025 survey found. |
| Delhi NCR rental demand is strong. | MagicBricks Jul–Sep 2025 index: Greater Noida +29.5% QoQ, Delhi +17.8%, Noida +10.8% ([The Statesman](https://www.thestatesman.com/business/delhi-ncr-leads-indias-rental-market-as-national-momentum-cools-greater-noida-tops-charts-1503514427.html)). | Medium. |
| Big portals are moving to intent-first, personalised journeys. | Zillow's June 2026 hub starts by asking the shopper's intent and shows whether each listing fits their budget ([Zillow](https://s25.q4cdn.com/975009107/files/doc_news/Zillow-launches-a-personalized-hub-that-guides-home-buyers-from-first-search-to-closing-2026.pdf)). | Medium for the direction, none for the uplift. |
| India's DPDP Rules were notified 14 Nov 2025; notice, security and rights obligations apply after about 18 months. | [SCC Online](https://www.scconline.com/blog/post/2025/11/14/meity-notified-digital-personal-data-protection-rules-2025/), [PIB summary](https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf). | Medium. Commentary only; I did not read the gazetted text. |

### What I could not find (do not treat as proven)

- No independent evidence that a preference quiz raises search-to-enquiry conversion. Zillow's "2-3x ROI" figure is a vendor case study, not a measurement of this feature.
- No Delhi NCR specific, recent survey of tenant or buyer concerns. The spec's poll options are reasonable hypotheses, not validated categories.
- No data on whether anonymous users will finish a 10 to 14 question assessment. The 65% completion target is an assumption.
- Whether anonymised survey data is outside the DPDP Act is unconfirmed. The research exemption refers to a Second Schedule I did not read.

### Product conclusions

1. **The game-changing part is the trust and supply loop, not the quiz.** Competitors compete on listing volume. NCR Homes can compete on verified, fresh listings. Discover is a way to capture demand (customer), supply readiness (owner) and service capability (agent) in one place. That is the data flywheel to protect.
2. **Value must come back to the user immediately.** The customer result must lead straight into the existing search with filters applied. A result page that only describes the user will be skipped.
3. **The owner assessment is a funnel, not a survey.** Its success metric is assessment to property submission, so it should end at `/list-property`.
4. **Community polls are the weakest signal.** Anonymous votes can be gamed and are opinions only. This justifies shipping them last (V1.1), as the spec already says.
5. **Self-reported data must stay labelled as such,** especially agent and owner results (already in the spec).

### Recommended spec adjustments (for your decision)

- Make the customer flow adaptive: ask 5 required questions first, show a first result, then offer "refine" for the rest. This protects completion rate. The spec's full 10 questions stay available.
- Add a plain-language privacy notice before the first question, written to be reviewed by a lawyer. Do not rely on my reading of the DPDP Rules.
- Treat the listing-level match percentage (30/25/20/15/10 weights) as a Phase 5 item behind a data-sufficiency check, because current listings may not carry metro, balcony or parking data.

## Part B — Engineering plan

Reuse, do not rebuild: auth (`JwtAuthGuard`, `@Public()`), `City`/`Locality`, `AnalyticsEvent`, `SlidingWindowLimiter`, zod DTOs, react-query and the `apiData` client, `ButtonLink`/`Field`/`Alert` UI.

Key design decisions (apply to all phases):

- Questions are defined once on the server (versioned) and served to the web. The web only renders and evaluates visibility. All validation and scoring is server-side.
- Locations are stored as `Locality` ids and never copied.
- Results are fetched with a random 192-bit token. Only its SHA-256 hash is stored. Account association is optional and explicit.
- New tables only (`discover_responses`, `discover_preference_profiles`). Nothing existing is altered.

### Phases

| Phase | Scope | Needs DB | Exit criteria |
|---|---|---|---|
| **0. Validate** (this doc) | Research, plan, decisions above. | No | You approve the plan and the adjustments. |
| **1. Core logic** | Pure TypeScript in the API: question definitions (customer, owner, agent), conditional visibility, answer validation, owner readiness scoring, profile and summary builders. | No | Unit tests cover every rule: conditional questions, invalid answers, score bands, plot-only skips bedrooms, all weights sum to 100. |
| **2. Persistence and API** | Prisma models and additive migration, `discover` Nest module, submit, result by token, rate limiting, `discover_started` and `discover_completed` analytics events. | Yes | HTTP tests: anonymous submit works, invalid answers rejected, token guessing returns 404, results never list other people's data. |
| **3. Customer experience** | `/discover` landing, "Discover" nav item, step wizard (progress, back/next, review, validation), customer assessment and result page with a "see matching homes" link into existing search. | Yes | Component tests, keyboard accessible, mobile layout checked in the browser. |
| **4. Owner and agent** | Owner readiness and agent service profile on the same wizard, result copy with explicit "not verification" and "self-reported" labels. | Yes | Owner result ends at `/list-property`; agent result never shown as performance. |
| **5. Accounts and matching** | Optional "save to my account", saved preference profile, edit and delete, and (if data allows) listing match explanations with the configurable weights. | Yes | Authorization tests; deletion removes the profile and linked responses. |
| **6. Hardening** | e2e, accessibility pass, analytics review, privacy notice wiring, full typecheck, lint and test run. | Yes | Definition of done in the spec section 17. |
| **V1.1 Community** | Polls, aggregates with minimum-count thresholds, registered-user insights, light admin. | Yes | Separate release. |

Phases 1 and 2 can ship behind no UI at all, so nothing is user-visible until Phase 3.

### Blocker to know about

The local Postgres is not running (Docker Desktop is off). Phase 1 does not need it. Phase 2 onward does, and the pending owner self-list migration is also still unapplied.

### Out of scope until later

AI recommendations, personality profiling, public agent ranking, a generic form builder, ownership verification.
