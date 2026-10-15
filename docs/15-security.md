# Real Estate Platform — Security and Threat Model

**Document:** Deliverable 15 / Step 15  
**Depends on:** `docs/10-authentication-authorization.md`, `docs/12-media-storage.md`, `docs/02-requirements-specification.md`  
**Status:** Corrected — Architecture Freeze v1  
**Date:** 2026-09-26  
**Out of this document:** Penetration-test reports, legal advice, application code

This is an engineering threat model for MVP. It is not a compliance certification.

---

## 1. Assets

| Asset | Sensitivity | Location |
| --- | --- | --- |
| Customer/guest phone, email, name | High | `users`, `leads`, `service_enquiries` |
| Password hashes | High | `users.password_hash` |
| Refresh / reset token hashes | High | token tables |
| Admin session | High | cookies |
| Listing content | Low–medium | public by design when published |
| Images | Low (public) | object storage |
| Ops inbox contents | High | email |
| Env secrets | Critical | platform secret store |

No KYC, no cards, no property title deeds in P0.

---

## 2. Actors (threat)

- Anonymous internet (bots, scrapers, vandals)  
- Registered customer (curious / malicious IDOR)  
- Compromised staff account  
- Insider staff (legitimate access, data export)  
- Search engines (wanted on public pages only)  

---

## 3. Threats and controls

| Threat | Risk if unmitigated | P0 control |
| --- | --- | --- |
| Credential stuffing / brute force | Account takeover | Rate limit login; lockout; generic errors; strong hash |
| Session theft (XSS) | Account takeover | httpOnly cookies; CSP; no dangerouslySetInnerHTML; React escaping |
| CSRF | Unwanted state change | Same-origin `/api` rewrite; httpOnly; SameSite=Lax; **no CSRF token in P0**. Cross-site cookie deploy is forbidden until CSRF is added |
| IDOR on leads/visits/saves | PII leak | **Scoped WHERE**; 404 if not in scope; never fetch-then-403; UUID ids; tests |
| Privilege escalation | Inventory/PII | RBAC on every admin route; public register = CUSTOMER only; only SUPER_ADMIN grants SUPER_ADMIN |
| JWT role staleness | Extra access after demotion | Short access TTL; load roles from DB |
| SQL injection | Data breach | Prisma parameterized; no string-concat SQL |
| XSS stored in listing description | Session theft | Plain text / strict markdown; no raw HTML |
| SSRF | Cloud metadata | No URL-fetch upload |
| File upload (web shell, bomb) | RCE / DoS | Magic bytes, MIME, size, max dimensions, UUID keys, no execute on bucket |
| Enumeration of users | Privacy | Forgot-password always 200; guest lead response `{ ok: true }` |
| Lead spam | Ops overload | Rate limit IP + phone; 24h duplicate window; later captcha |
| Scraping full catalog | Competitor copy | Page offset cap; rate limit GET; robots for `/api`; do not publish owner phones |
| Admin panel indexing | Attack surface | noindex, robots disallow, separate layout |
| Secrets in git / client bundle | Total compromise | `.env.example` placeholders; no `NEXT_PUBLIC_` secrets |
| Log PII leak | Privacy | Mask phone/email in logs; never log tokens/passwords |
| Backup leak | Bulk PII | Restricted backup access; no public dump URLs |
| Dependency vulns | RCE | `npm audit` in CI (fail on high) — do not block forever on noise |
| Clickjacking | UI redress | `X-Frame-Options: DENY` and CSP `frame-ancestors 'none'` (aligned; Helmet default `'self'` would conflict) |
| MIME sniff | Content injection | `X-Content-Type-Options: nosniff` |
| Open redirect on login `next` | Phishing | Allow relative paths only |
| Payment fraud | — | No payments |

---

## 4. Privacy (engineering, not legal advice)

- Collect min: name, phone, email, listing of interest  
- Public pages do not show enquirer or owner personal numbers  
- Platform WhatsApp/call CTA uses a **company** number  
- Retention: not automated in P0; **flag for legal** (DPDP, deletion requests)  
- Staff can see lead phones — that is the product; audit logs on admin reads are P1, writes P0  
- Do not invent “we are GDPR/DPDP/RERA compliant” copy  

---

## 5. Implementation-aligned controls (frozen)

### Authentication

- Argon2id preferred; bcrypt acceptable with cost ≥ 12  
- No plaintext passwords  
- No token, cookie, or password logging  
- Access JWT ~15 min httpOnly cookie, Secure in production, SameSite=Lax  
- Refresh opaque, hashed in DB, rotated; 7d customer / 1d staff  
- Password reset hashed, 1 hour, single use; success revokes all refresh tokens and clears lockout  
- Claims required: `sub`, `iat`, `exp`. Authorization loads roles from DB  

### Authorization

- API-level RBAC (permission codes)  
- Resource-level **scoped queries**  
- Inaccessible customer/agent resources → **404**  
- Missing permission for the operation class → **403**  
- Unauthenticated protected route → **401**  

### Cookies

- httpOnly  
- Secure in production  
- SameSite=Lax  
- Never localStorage  

### Input

- DTO validation; whitelist fields; reject extras where appropriate  
- Prisma parameterized queries; no concatenated SQL  

### XSS

- No raw HTML unless explicitly sanitized  
- Listing descriptions treated as untrusted text  

### Upload

- Magic bytes, MIME, extension, dimensions ≤ 8000px, size ≤ 8 MB, UUID storage key  
- JPEG/PNG/WebP only  

### SSRF

- No remote URL ingestion in MVP  

### Secrets

Never commit: DB password, JWT secrets, email API key, storage credentials.

### Logging

Never log: passwords, tokens, cookies, full phone numbers, other sensitive PII. Mask emails/phones.

### Admin

- noindex  
- Authentication required  
- RBAC required  

---

## 6. Security headers (web + API)

- `Strict-Transport-Security` in prod  
- `X-Content-Type-Options: nosniff`  
- `Referrer-Policy: strict-origin-when-cross-origin`  
- `Permissions-Policy` disable unused camera/mic  
- CSP: default conservative; allow CDN image host; no `unsafe-eval`  
- Clickjacking (Week 2 API Helmet): `X-Frame-Options: DENY` **and** CSP `frame-ancestors 'none'`. Helmet's default CSP uses `frame-ancestors 'self'`, which would allow same-origin framing and contradict DENY. Intended policy is **no framing at all** (including same-origin). Both headers are set so old browsers (XFO) and CSP-aware browsers agree.

---

## 7. Rate limits (repeat)

See Deliverable 03. In-memory per instance. Fail closed on login (limit) even if limiter errors — **recommendation: fail open on limiter crash for public GET, fail closed for login/enquiry.**

**Week 2 implementation status: NOT IMPLEMENTED.** `RATE_LIMIT_ENABLED` is reserved config only and is unused at runtime. `@nestjs/throttler` is a dependency but is not registered in `AppModule`. Account lockout (10 failures / 15 minutes) is not an IP rate limit. This is an explicit P0 security gap. Do not treat Week 2 as rate-limit complete. Wire login/register/forgot-password (and later leads/search/upload) before public traffic.

---

## 8. Review before launch (Week 8)

- IDOR tests green  
- Upload of a renamed `.php.jpg` rejected  
- Draft listing 404 public  
- Customer token cannot call `/admin/*`  
- Secrets not in repo  
- HTTPS only  
- Backup restore with PII handling understood  

No paid pentest required for Scenario A, but do not skip the list above.

---

## 9. Next

Step 16 — Testing (`docs/16-testing.md`).
