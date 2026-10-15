# Real Estate Platform — CI/CD

**Document:** Deliverable 19 / Step 19  
**Depends on:** `docs/16-testing.md`, `docs/18-infrastructure.md`  
**Status:** Draft for review  
**Date:** 2026-09-26  
**Out of this document:** Vendor-specific YAML as the only truth, application code

---

## 1. Goals

- Every push: catch type/lint/unit failures  
- Main: deployable artifact  
- Prod: deliberate promote, not every WIP commit  
- Migrations: explicit, not click-ops  

---

## 2. Pipeline

```text
git push
  → install (lockfile)
  → lint
  → typecheck
  → unit tests
  → integration tests (Postgres service)
  → build web
  → build api
  → npm audit --production (warn/fail high)
  → (main/staging) deploy staging
  → (tag or manual) migrate deploy + deploy prod
  → smoke: GET /health, GET /ready, GET homepage 200
```

No security scanner theater (OWASP ZAP in CI) for P0.

---

## 3. Git (solo)

- `main` always green  
- Short `feat/*` `fix/*` branches  
- Conventional commits: `feat:`, `fix:`, `chore:`, `docs:`  
- PR even solo so CI is the gate  
- Tags `v0.1.0` at launch  
- Hotfix: branch from tag → PR to main  

No GitFlow, no required two reviewers.

---

## 4. Deploy rules

- Staging auto from `main`  
- Production manual or tag `v*`  
- `prisma migrate deploy` against the **target** DB before API rollout  
- Failed migrate → stop rollout  
- Secrets injected by the platform, not in GitHub variables that print in logs  

---

## 5. Smoke tests post-deploy

- `/health` 200  
- `/ready` 200  
- Homepage 200  
- Known listing slug 200 if seed exists  
- Admin login not automated with prod passwords in CI (use staging)

---

## 6. Next

Step 20 — Cost (`docs/20-cost.md`).
