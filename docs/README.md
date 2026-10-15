# Design documentation

**Authoritative baseline:** `00-architecture-freeze.md`  
**Database blueprint:** `24-final-postgresql-prisma-design.md`  
**NestJS / API blueprint:** `25-nestjs-backend-api-design.md`  
**Correction log:** `23-correction-pass.md`

Status: **architecture freeze v1** + database correction D23-C1–C7 + NestJS design freeze. No Prisma schema, migrations, or application code yet.

If a draft (01–22) disagrees with `00-architecture-freeze.md`, the freeze wins. If 07/09 disagree with `25-nestjs-backend-api-design.md` on Nest/API detail, **25** wins. If 06 disagrees with 24 on schema, **24** wins.

| # | File | Notes |
| --- | --- | --- |
| 00 | `00-architecture-freeze.md` | Frozen baseline |
| 01 | `01-system-design-master.md` | Master (amended by freeze) |
| 02 | `02-requirements-specification.md` | P0 requirements (corrected) |
| 03 | `03-traffic-capacity.md` | Traffic freeze + burst headroom |
| 04 | `04-architecture.md` | System architecture |
| 05 | `05-domain-model.md` | Domain (corrected) |
| 06 | `06-database-schema.md` | PostgreSQL (corrected; 24 wins on conflict) |
| 07 | `07-nestjs-backend.md` | NestJS draft (25 wins on conflict) |
| 08 | `08-nextjs-frontend.md` | Next.js (corrected) |
| 09 | `09-api-specification.md` | REST draft (25 wins on conflict) |
| 10 | `10-authentication-authorization.md` | Authn/z (corrected) |
| 11 | `11-search.md` | Postgres search (corrected) |
| 12 | `12-media-storage.md` | Images (corrected) |
| 13 | `13-notifications-jobs.md` | Email, no queue |
| 14 | `14-payments.md` | Deferred |
| 15 | `15-security.md` | Threat model (corrected) |
| 16 | `16-testing.md` | Tests (corrected) |
| 17 | `17-observability.md` | Logs, Sentry, health |
| 18 | `18-infrastructure.md` | Topology freeze vs providers |
| 19 | `19-cicd.md` | CI/CD |
| 20 | `20-cost.md` | Planning estimates only |
| 21 | `21-sprint-plan.md` | Core loop first |
| 22 | `22-architecture-decisions.md` | ADRs (architecture vs provider) |
| 23 | `23-correction-pass.md` | C1–C26 summary + consistency matrix |
| 24 | `24-final-postgresql-prisma-design.md` | Final schema / Prisma design |
| 25 | `25-nestjs-backend-api-design.md` | NestJS modules + REST contract |

**ARCHITECTURE STATUS:** `READY FOR NESTJS IMPLEMENTATION`

Do not generate Prisma, SQL migration files, NestJS, Next.js, Dockerfiles, or GitHub Actions YAML until implementation is explicitly requested.
