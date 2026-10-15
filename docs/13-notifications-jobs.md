# Real Estate Platform — Notifications and Background Jobs

**Document:** Deliverable 13 / Step 13  
**Depends on:** `docs/07-nestjs-backend.md`, `docs/02-requirements-specification.md`, `docs/03-traffic-capacity.md`  
**Status:** Corrected confirmation — Architecture Freeze v1 (C15: no rollback)  
**Date:** 2026-09-26  
**Out of this document:** WhatsApp Business API setup, SMS vendor, worker code

---

## 1. Decision

| Mechanism | MVP |
| --- | --- |
| Channel | Email only |
| Abstraction | `NotificationService` + `EmailPort` |
| Queue | **No Redis/BullMQ** (D5/D6) |
| Send timing | After DB commit, in-request, best-effort |
| Failure | Log `notification_logs` FAILED; do not roll back domain write |
| SMS / WhatsApp / push | Not implemented; click-to-chat link is not a notification |

At 5–50 emails/day, a queue is operational cost without benefit. Introduce BullMQ when: image pipeline is async, email provider latency blocks HTTP, or multi-instance retry is required.

---

## 2. Abstraction

```text
NotificationService.send({
  template: TemplateId,
  to: email,
  data: Record<string, string>,
  idempotencyKey?: string
})
```

Business modules never import Resend/SES. They call this service.

`EmailPort.send` is the only adapter in P0.

Templates are code (HTML + text), not a marketing CMS.

---

## 3. P0 templates

| Template id | To | Trigger | Data (examples) |
| --- | --- | --- | --- |
| `lead_received_customer` | Enquirer email if present | Lead created | firstName, listingTitle, city |
| `lead_received_ops` | `OPS_INBOX_EMAIL` | Lead created | name, phone masked or full to ops, listing slug, admin URL |
| `service_enquiry_ops` | Ops | Service enquiry | name, phone, service title, message |
| `password_reset` | User | Forgot password | reset URL (token in path, HTTPS) |
| `visit_requested_ops` | Ops | If visits ship | name, listing, preferred slot |

Do not email the customer a copy of other leads. Do not include access tokens in emails. Reset URL is single-use.

---

## 4. Logging and identity

`notification_logs`: template, channel EMAIL, `to_masked` (e.g. `j***@gmail.com`), status PENDING/SENT/FAILED, provider id, error, created_at.

Do not store full HTML body (PII + size). Store template id + provider id.

Idempotency P0: duplicate lead window already prevents double ops email for the same enquiry burst. Password reset: new token invalidates previous unused tokens (app rule).

---

## 5. Retry

P0: one send attempt. If provider throws, status FAILED. Ops notices missing mail; lead still exists.

P1: retry 3× with backoff via BullMQ.

Do not busy-loop retry inside the HTTP request.

---

## 6. Jobs that stay synchronous

| Job | Sync? | Why |
| --- | --- | --- |
| Enquiry email | Sync after commit | Volume tiny |
| Password reset email | Sync after commit | User is waiting; still OK |
| sharp resize | Sync on upload | Few admin uploads/day |
| Analytics insert | Sync catch-and-ignore | Tiny |
| Audit insert | Sync | Tiny |

---

## 7. Jobs that must not be invented in P0

Lead reminder cron, listing expiry, PDF generation, WhatsApp templates, SMS OTP, fan-out newsletters, nightly aggregations.

If a daily backup dump is needed on VPS, that is **infra cron**, not an app queue.

---

## 8. Click-to-WhatsApp (not a notification)

Listing CTA opens `https://wa.me/{platformNumber}?text=...` encoded listing slug. This is a frontend link + `contact_clicked` analytics event. No provider webhook.

---

## 9. Provider choice

Transactional email: Resend, Amazon SES, or Postmark. Dev: Mailhog/Ethereal.

SPF/DKIM on the sending domain before prod (otherwise ops mail lands in spam).

---

## 10. Next

Step 14 — Payments (`docs/14-payments.md`) as an extensible non-MVP design.
