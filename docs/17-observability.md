# Real Estate Platform — Observability and Monitoring

**Document:** Deliverable 17 / Step 17  
**Depends on:** `docs/04-architecture.md`, `docs/03-traffic-capacity.md`  
**Status:** Draft for review  
**Date:** 2026-09-26  
**Out of this document:** Datadog/Grafana stack as a requirement, tracing mesh, application code

---

## 1. MVP bar

Know when the site is down, when 5xx spike, and why an exception happened. Do not build a metrics platform.

---

## 2. Logs

- JSON stdout from Nest and Next  
- Fields: `timestamp`, `level`, `msg`, `requestId`, `userId` (if auth), `route`, `status`, `durationMs`  
- Never: password, tokens, full card (n/a), raw email/phone (mask)  
- Request id: generate in API (or trust `x-request-id` from proxy if present)  

Pino (or Nest JSON logger) is enough.

---

## 3. Metrics

P0:

- Uptime ping on `/health` or homepage (external)  
- Process memory/CPU on host (provider dashboard)  
- Sentry event rate as proxy for errors  

P1: request rate, p95 latency, 5xx ratio (Prometheus or host metrics). Queue depth N/A until Redis.

---

## 4. Tracing

**Not in MVP.** One API hop. Add OpenTelemetry when a worker process exists.

---

## 5. Error tracking

Sentry (or equivalent) on:

- `apps/api` unhandled + 500 filter  
- `apps/web` client + server  

Scrub cookies and Authorization. Sample 100% at Scenario A.

---

## 6. Health

| Endpoint | Checks | Public |
| --- | --- | --- |
| `/health` | process alive | Yes |
| `/ready` | `SELECT 1` Postgres | Yes but no internals |

Uptime monitor hits `/health`. Do not hit `/ready` from the public internet if it becomes a DB load vector — at Scenario A it is fine.

---

## 7. Product analytics vs ops

Ops: logs, Sentry, uptime.  
Product: `analytics_events` table (`listing_viewed`, `lead_created`, …). No Mixpanel required.

Admin dashboard counts are SQL, not a warehouse.

---

## 8. Alerting (human)

P0: email/Slack from Sentry on new issues; uptime email if down 3 minutes.  
You are the on-call. No pager rotation.

---

## 9. Next

Step 18 — Infrastructure and deployment (`docs/18-infrastructure.md`).
