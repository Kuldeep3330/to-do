# Real Estate Platform — Infrastructure and Deployment

**Document:** Deliverable 18 / Step 18  
**Depends on:** `docs/04-architecture.md`, `docs/03-traffic-capacity.md`, `docs/12-media-storage.md`  
**Status:** Corrected — Architecture Freeze v1  
**Date:** 2026-09-26  
**Out of this document:** Terraform for three clouds, Kubernetes manifests, application code

---

## 1. Frozen topology (architecture) vs providers (choice)

**Architecture (do not change without a new freeze):**

```text
Browser
   → CDN / DNS / HTTPS
   → Next.js (one deployment)
   → same-origin /api rewrite
   → NestJS API (one instance)
   → PostgreSQL (one managed instance)
   → Object storage
Email provider is external.
```

MVP: one API instance, one PostgreSQL, object storage, CDN, one Next.js deployment. **No Redis, no worker, no search cluster, no Kubernetes, no multi-region.** Same-origin `/api` is required for the P0 CSRF decision.

**Provider choices (replaceable without redesign):**

| Piece | Example choice | Architectural requirement |
| --- | --- | --- |
| Web host | Vercel or equivalent | SSR/ISR-capable Next.js host |
| API host | Docker on VPS or PaaS | Single container/process |
| Postgres | Neon / RDS / Render Postgres | Managed, automated backups |
| Objects | Cloudflare R2 or S3 | S3-compatible API |
| CDN | Cloudflare / R2 custom domain | Public image/HTML edge |
| Email | SES / Resend / Postmark | Transactional email |
| DNS | Cloudflare or registrar | HTTPS |

**Acceptable cheaper topology (still architecture-compliant):** Docker Compose on one VPS for `web` + `api` + Caddy, **still managed Postgres**. Self-hosting Postgres on the app VPS without offsite dumps is not production.

**Rejected:** Kubernetes, multi-region, service mesh, Elasticsearch VM, Redis in MVP.

---

## 2. Environments

| | Development | Staging | Production |
| --- | --- | --- | --- |
| Purpose | Laptop | Prod-like UAT | Live |
| Web | `next dev` | Platform preview or staging project | Prod project |
| API | `nest start --watch` | Same image as prod | Prod |
| DB | Compose Postgres | Isolated managed/small | Isolated managed |
| Objects | MinIO or dev prefix | Staging bucket | Prod bucket |
| PII | Fake | Synthetic | Real |
| Secrets | `.env` local gitignored | Platform secrets | Platform secrets |

Never share prod DB with staging. Never commit `.env`.

---

## 3. Docker (API)

Single image: Node LTS, `apps/api` build, non-root user, `PORT` env.  
Compose for local: `api`, `postgres`, `minio`, `mailhog`, optional `web`.

Do not run `prisma migrate dev` in prod. Use `prisma migrate deploy` as a release step **before** new API traffic (job or start script that fails boot if migrate fails).

---

## 4. Reverse proxy

- Dev: Next.js rewrite `/api` → `localhost:3001`  
- Prod Vercel: rewrite `/api/:path*` to API origin  
- Prod all-VPS: Caddy/Nginx TLS, `/` → web, `/api` → api  
- Cookies are set on the **web origin**. Do not deploy a separate API cookie domain in P0 (that would break the CSRF freeze).  

`allowedHosts` must include the preview domain pattern when using Vite; for Next.js follow platform hostname config. Do not leave `localhost` only.

---

## 5. Secrets

Platform secret store. Rotation: JWT secrets invalidate sessions (accept). Database URL, S3 keys, mail keys, Sentry DSN.

Local `.env.example` placeholders only (`your-api-key-here`). User-project names: `DATABASE_URL`, `JWT_ACCESS_SECRET`, not platform LLM variables.

---

## 6. Backups and DR (ops)

See also Deliverable 01 / later DR note:

- Managed Postgres daily snapshot, 7–14 day retention  
- RPO ≤ 24 h, RTO ≤ 8 h MVP  
- Restore drill week 8 onto a throwaway instance  
- Bucket versioning  
- Runbook: restore DB, set `DATABASE_URL`, restart API, verify `/ready`  

---

## 7. Scaling actions (do not pre-buy)

1. CDN images  
2. Second API container  
3. Redis for rate limit  
4. Larger Postgres  
5. Read replica  

---

## 8. Next

Step 19 — CI/CD (`docs/19-cicd.md`).
