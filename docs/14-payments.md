# Real Estate Platform — Payment Architecture (Deferred)

**Document:** Deliverable 14 / Step 14  
**Depends on:** `docs/01-system-design-master.md`, `docs/05-domain-model.md`  
**Status:** Design for extension — **do not implement in 60–70 days**  
**Date:** 2026-09-26  
**Out of this document:** Razorpay account setup, PCI SAQ, application code

---

## 1. Decision

**Payments are out of MVP (D14).** There is no chargeable product at launch (no token money, no paid listings, no service checkout).

This document only records how to add payments later without rewriting inventory/leads.

Do not create `payments` tables in the first migration.

---

## 2. Future charge types (not requirements)

| Use | When it might appear | Notes |
| --- | --- | --- |
| Service booking / token | Phase 6+ | After a real fulfillment process exists |
| Premium listing | After inventory is not the bottleneck | Easy to abuse; product decision |
| Subscription (brokers) | Marketplace phase | |
| Property token / booking amount | High legal/compliance | **Requires validation** |

Never store card/UPI credentials. Use an Indian gateway (Razorpay or equivalent) when needed.

---

## 3. Extensible shape (later)

Keep money as a separate bounded context:

```text
Order (why we charge)
  → PaymentAttempt (gateway)
  → Payment (succeeded)
```

- `Order`: `id`, `type` (SERVICE | LISTING_BOOST | TOKEN), `amount`, `currency INR`, `status`, `payer_user_id`, `reference_type`, `reference_id`  
- Gateway session/order id on attempt  
- Webhook endpoint verifies signature, idempotent on `gateway_payment_id`  
- Ledger is gateway + our order status; we are not a bank  

Application rule: domain modules emit “create order” ; they do not talk to Razorpay.

---

## 4. What we will not do now

- Razorpay keys in `.env.example` as if live  
- Fake “Pay now” buttons  
- Storing PAN/Aadhaar to “know your customer” for payments  

Legal/settlement/RERA implications **require business validation** before any token-money feature.

---

## 5. Next

Step 15 — Security and threat model (`docs/15-security.md`).
