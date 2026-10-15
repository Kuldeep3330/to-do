# Real Estate Platform — Traffic and Capacity Freeze

**Document:** Deliverable 03 / Step 3  
**Depends on:** `docs/01-system-design-master.md`, `docs/02-requirements-specification.md`  
**Status:** Draft freeze — numbers are assumptions, not forecasts  
**Date:** 2026-09-26  

This document locks planning ranges so later schema and infra choices are sized correctly. It does not change the MVP. If real traffic exceeds Scenario B, revisit search and caching — not the domain model.

---

## 1. Purpose

Use these ranges for:

- Instance sizing  
- Whether Redis / queues / search engines are justified  
- Index strategy (Postgres is enough)  
- Image storage and CDN  
- Rate-limit defaults  

Do not use them as investor metrics or SLAs.

---

## 2. Formulas

All scenarios share:

```text
daily_api_requests ≈ DAU × requests_per_user_per_day

peak_rps ≈ daily_api_requests / (active_hours × 3600) × peak_factor
```

Defaults:

- `active_hours` = 14 (08:00–22:00 IST)  
- `peak_factor` = 4 (evening browse)  
- `requests_per_user_per_day` = 20–40 (HTML + JSON + images counted separately below)

Image bandwidth is **not** API RPS. Treat origin image traffic as CDN traffic.

---

## 3. Scenario A — MVP (months 0–3) — design for this

| Item | Range | Notes |
| --- | --- | --- |
| Live published listings | 50–300 | Manual admin inventory |
| Cities / localities | 5–6 cities, 50–200 localities | Seeded + admin add |
| Registered users | 100–1,000 | |
| MAU (mostly anonymous) | 500–3,000 | |
| DAU | 50–300 | |
| Concurrent browsers | 5–30 | |
| Leads / day | 2–20 | |
| Visit requests / day | 0–5 | |
| Service enquiries / day | 0–3 | |
| Admin users | 1–5 | |
| Daily API JSON requests | 1,000–12,000 | |
| Peak JSON RPS | 0.1–1 | |
| Images / listing | 5–12 | Cap 20 |
| Original image store | ~5–15 GB | 300 × 12 × ~2 MB |
| Daily image transfer if no CDN | could exceed JSON by 10–50× | **CDN is the real capacity item** |
| Emails / day | 5–50 | Lead + reset |

**Capacity conclusion for Scenario A**

- 1 small API process (1–2 vCPU, 1–2 GB)  
- 1 Next.js deployment  
- Managed Postgres 2–4 GB RAM, 20 GB disk  
- No Redis required  
- No replica required  
- No search cluster  
- Object storage + CDN required for images  
- Connection pool: 10–20 API connections to Postgres is plenty  

**Burst headroom (planning assumption, not a forecast):** the same topology must absorb short bursts of **5–10 JSON RPS** without redesign (still one API, one Postgres, no Redis).

**Path before dedicated search:** approximately **~30 RPS** via CDN, then a second API instance, then Redis — not OpenSearch.

These numbers are engineering planning assumptions, not forecasts.

---

## 4. Scenario B — Growth (if SEO works, year 1)

| Item | Range |
| --- | --- |
| Listings | 1,000–5,000 |
| DAU | 1,000–8,000 |
| Leads / day | 30–150 |
| Daily API JSON | 40k–400k |
| Peak JSON RPS | 3–30 |
| Image store | 50–200 GB with variants |

**Then add, in order:** CDN (if not already), Redis rate-limit/cache, second API instance, PgBouncer, read replica only if CPU/IO proven.

PostgreSQL search remains valid. Re-evaluate OpenSearch only if EXPLAIN shows search p95 > 500 ms after indexes, or listings exceed ~50k with heavy keyword ranking needs.

---

## 5. Scenario C — Marketplace (not a 70-day target)

| Item | Range |
| --- | --- |
| Listings | 50k–500k |
| DAU | 50k–300k |
| Peak RPS | 150–1,500 |

This scenario justifies dedicated search, workers, and possible module extraction. **Do not size MVP servers for C.**

---

## 6. Bottleneck order (frozen)

1. Unoptimized images (LCP, egress)  
2. Missing composite indexes on listing search  
3. Enquiry/login abuse (bots)  
4. Untested backups  
5. N+1 listing-card queries  
6. Only later: CPU of API or Postgres  

---

## 7. Rate-limit starting values (assumptions)

| Endpoint class | Start |
| --- | --- |
| POST /leads | 5 / IP / 10 min; 3 / phone / hour |
| POST /auth/login | 10 / IP / 10 min; 10 / email / 15 min |
| POST /auth/register | 5 / IP / hour |
| Public GET search | 60 / IP / min |
| Upload | 30 / admin / 10 min |

Tune after observing false positives. In-memory limiter is enough for a single API instance (Scenario A). Multi-instance requires Redis.

---

## 8. Freeze statement

I will design architecture, domain, and (later) schema for **Scenario A with headroom to low Scenario B**. I will not introduce Elasticsearch, Kafka, Kubernetes, or a second region for capacity reasons.

---

## 9. Next

Step 4 — Architecture design (`docs/04-architecture.md`).
