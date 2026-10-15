# Real Estate Platform — Cost Strategy

**Document:** Deliverable 20 / Step 20  
**Depends on:** `docs/03-traffic-capacity.md`, `docs/18-infrastructure.md`  
**Status:** Order-of-magnitude only — verify current vendor prices  
**Date:** 2026-09-26  

**These are planning estimates only. Verify current vendor pricing before deployment.** They are not quotes, invoices, or architecture requirements.

Optimization principles (architecture): avoid oversized images; use CDN; use managed PostgreSQL; avoid Redis until justified; avoid a search cluster; avoid SMS/OTP initially; avoid unnecessary maps API calls; avoid Kubernetes; keep one region; monitor actual usage.

---

## 1. MVP (Scenario A)

| Category | Range | Notes |
| --- | --- | --- |
| Next.js host | 0–20 | Hobby may suffice until team/auth limits |
| API compute | 5–20 | 1–2 vCPU VPS/PaaS |
| Managed Postgres | 0–30 | Must include backups |
| Object storage | 1–10 | Storage cheap |
| CDN / egress | 0–10 | R2-like helps |
| Email | 0–10 | Low volume |
| Domain + DNS | 1–2 | |
| Sentry | 0 | Free tier |
| SMS | 0 | Not in MVP |
| Maps | 0–20 | **Off by default**; pin only |
| **Total** | **~15–80** | |

---

## 2. Growth (Scenario B)

Redis 10–30, larger DB 30–80, CDN 20–100, second instance, Vercel Pro possible. **~100–400** before ads.

---

## 3. Traps

- 4K unoptimized images  
- Maps SDK on every card  
- SMS OTP to every visitor  
- Elasticsearch cluster  
- Three paid observability tools  
- Unused Kubernetes  

---

## 4. Optimization order

1. Image variants + CDN  
2. Managed DB (avoid outage cost)  
3. Defer Redis/OTP/maps  
4. One region  

---

## 5. Next

Step 21 — 60–70 day sprint plan (`docs/21-sprint-plan.md`).
