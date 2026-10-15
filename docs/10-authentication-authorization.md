# Real Estate Platform — Authentication and Authorization

**Document:** Deliverable 10 / Step 10  
**Depends on:** `docs/07-nestjs-backend.md`, `docs/09-api-specification.md`, `docs/02-requirements-specification.md`  
**Status:** Corrected — Architecture Freeze v1  
**Date:** 2026-09-26  
**Out of this document:** Implementation code, Auth0/Cognito setup

Frozen: D3 email/password; D4 access JWT + rotating refresh in httpOnly cookies; D12 guest enquiry; same-origin CSRF stance.

---

## 1. Goals

- Staff can operate admin safely  
- Customers can save listings and see their enquiries  
- Guests can submit leads without an account  
- Attackers cannot enumerate or mutate other users’ leads  
- Public register cannot create staff  

---

## 2. Authentication (P0)

### 2.1 Flows

| Flow | Who | Notes |
| --- | --- | --- |
| Register | Customer | email, password, name, phone; role CUSTOMER only |
| Login | All users | email + password |
| Refresh | All | rotating refresh |
| Logout | All | revoke current refresh |
| Forgot / reset | All | email token 1 hour, single use; revoke all refresh on success |
| Email verify | — | **P1**, not required to login |

No Google, no phone OTP in P0.

### 2.2 Tokens (frozen)

| Token | Life | Storage | Contains |
| --- | --- | --- | --- |
| Access JWT | ~15 minutes | httpOnly cookie, `Secure` in production, `SameSite=Lax` | Required claims: `sub`, `iat`, `exp`. Roles **must not** be the authorization source. |
| Refresh | ~7 days customer, ~1 day staff | httpOnly cookie, `Secure` in production, `SameSite=Lax`; opaque random; **hash in DB** | No JWT. Rotation on refresh. Reuse of a revoked/rotated token: revoke the family / all user refresh tokens (P0: revoke all for that user). |

Authentication establishes **identity**. Authorization loads current roles/permissions from the database (or a process cache ≤ 30s). Do not permanently trust JWT role claims. No JWT denylist in MVP.

Never store access or refresh tokens in `localStorage`.

### 2.2b CSRF (frozen)

P0 uses same-origin web/API (`/api` rewrite), httpOnly cookies, SameSite=Lax. **No separate CSRF token.**

If deployment becomes cross-site (API on another registrable domain with cookies), **do not enable that** until explicit CSRF protection is added. This is an architectural constraint, not optional polish.

### 2.3 Password

- Min 8 characters  
- Hash argon2id (preferred) or bcrypt ≥ 12  
- Never log password, never return hash  
- Reset invalidates all refresh tokens for that user  

### 2.4 Lockout (frozen)

Threshold: 10 failed attempts per email per 15 minutes. Full machine: `docs/24-final-postgresql-prisma-design.md` section 6.1.

On failed login (unknown or wrong password, account not DISABLED): `failed_login_count += 1`. When threshold reached: `status = LOCKED`, `locked_until = now + 15 minutes`. Generic `Invalid credentials` — do not leak whether the email exists, is locked, or is DISABLED.

If `status = LOCKED` and `locked_until > now()`, reject with the same generic message.

If `status = LOCKED` and `locked_until <= now()` (expired): set `status = ACTIVE`, `locked_until = NULL`, `failed_login_count = 0` **before** verifying the password. Do not leave the user permanently LOCKED.

On successful login (not DISABLED): `failed_login_count = 0`, `locked_until = NULL`, `status = ACTIVE`.

On password reset success: `failed_login_count = 0`, `locked_until = NULL`, revoke all refresh tokens. If the user was `DISABLED`, **remain DISABLED** (do not auto-reactivate).

`DISABLED` is never auto-unlocked by login, lock expiry, or reset. Staff unlock/disable is admin/ops.

Register and login are also rate limited by IP.  

### 2.5 Cookie domain

Same-origin as the public site. API `Set-Cookie` on the web origin via reverse proxy/rewrite. No second API cookie domain in P0.

---

## 3. Guest vs customer

| Action | Guest | Customer |
| --- | --- | --- |
| Search, view published listing | Yes | Yes |
| POST lead | Yes | Yes (user_id attached) |
| List my leads | No | Yes |
| Save listing | No | Yes |
| Visit request | Customer-only (default) | Yes |
| Admin | No | No |

---

## 4. Authorization model

```text
User 1— * UserRole * —1 Role 1— * RolePermission * —1 Permission
```

Permission codes are the contract. Roles are bundles.

### 4.1 Seed matrix

| Permission | CUSTOMER | SALES_AGENT | ADMIN | SUPER_ADMIN |
| --- | --- | --- | --- | --- |
| listing.read_public | implicit | implicit | implicit | implicit |
| listing.manage | | | Y | Y |
| property.manage | | | Y | Y |
| location.manage | | | Y | Y |
| media.manage | | | Y | Y |
| lead.create | Y | Y | Y | Y |
| lead.read_own | Y | | Y | Y |
| lead.read_assigned | | Y | Y | Y |
| lead.read_all | | | Y | Y |
| lead.update_assigned | | Y | Y | Y |
| lead.update_all | | | Y | Y |
| lead.assign | | | Y | Y |
| visit.read_own | Y | | Y | Y |
| visit.manage_staff | | Y | Y | Y |
| user.manage | | | Y | Y |
| role.manage | | | | Y |
| audit.read | | | Y | Y |
| dashboard.read | | Y | Y | Y |

`listing.read_public` is not stored; public GET uses status filter.

### 4.2 Enforcement layers

1. **Missing auth** → 401 on non-public routes  
2. **Permission** (role lacks the operation entirely) → 403 (e.g. customer hitting `/admin/*`, agent `lead.assign`)  
3. **Resource scope** → query includes owner/assignee predicate. If no row → **404**. Do not fetch-then-403.  

UI hiding is not security.

### 4.2b Scoped queries (frozen)

Do **not**:

```text
GET /leads/:id
fetch lead
if not owner → 403
```

Do:

```text
WHERE id = :leadId AND user_id = :currentUserId      -- customer
WHERE id = :leadId AND assigned_to_user_id = :id     -- sales agent
```

If not found → `404`. Applies to customer leads, saved listings, visits, other customer resources, and sales-agent assigned leads.

| Actor | Resource | Result |
| --- | --- | --- |
| Customer A GET B’s lead/visit/save | 404 |
| Sales agent GET/PATCH unassigned lead | 404 |
| Sales agent assign leads | 403 |
| Admin permitted resource | 200 |
| Super Admin | full permitted access |
| Guest protected route | 401 |
| Customer admin endpoint | 403 |
| Public draft listing slug | 404 |
| Admin grants SUPER_ADMIN | 403 unless actor is SUPER_ADMIN |

---

## 5. JWT vs DB roles

JWT `roles` may be stale. At Scenario A, load roles from DB on each authenticated request (cheap). If we cache, TTL ≤ 30s.

Revocation: refresh table + short access TTL. No JWT denylist in P0.

---

## 6. Password reset (first-class schema, not an addendum)

Table `password_reset_tokens` is in Deliverable 06 (migration step 2).

Forgot-password always returns 200 to avoid account enumeration. Token hashed at rest. Valid only if not expired and `used_at IS NULL`. Success transaction: mark used, new password hash, revoke all refresh tokens, clear lockout counters.

---

## 7. Future (do not implement)

OAuth Google, phone OTP, session device list UI, step-up auth for payments, API keys for brokers.

---

## 8. Next

Remaining platform docs: search, media, notifications, payments (extension only), security, testing, observability, infra, CI/CD, cost, sprint plan, ADRs.
