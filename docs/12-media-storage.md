# Real Estate Platform — Media and File Storage

**Document:** Deliverable 12 / Step 12  
**Depends on:** `docs/06-database-schema.md`, `docs/07-nestjs-backend.md`, `docs/02-requirements-specification.md`  
**Status:** Corrected — Architecture Freeze v1  
**Date:** 2026-09-26  
**Out of this document:** Cloudinary lock-in as default, virus-scanner vendor setup, application code

---

## 1. Decision

- **Bytes live in S3-compatible object storage.** Never in PostgreSQL.  
- **Metadata lives in `media`.**  
- **P0 files:** listing photographs only.  
- **P0 upload path:** multipart through NestJS (auth + allowlist + size). Presigned PUT is P1.  
- **Public listing images:** public-read via CDN. No signed URLs.  
- **Private documents / KYC / agreements:** not in P0. When added, separate prefix + non-public ACL + signed GET + audit.

**Provider choice (not architecture):** Cloudflare R2 or any S3-compatible API with low egress. Local/dev: MinIO. Swapping vendor does not change this design.

**Transforms (D9):** `sharp` on the API after upload — ORIGINAL plus CARD (~600px wide) and DETAIL (~1600px). Sync is acceptable at Scenario A. If uploads regularly exceed ~5s, move to BullMQ later.

Do not adopt Cloudinary/ImageKit in MVP unless you explicitly prefer ops simplicity over portability.

---

## 2. What is stored

| Kind | P0 | Visibility | Prefix |
| --- | --- | --- | --- |
| Listing photo ORIGINAL | Yes | Public | `listings/{listingId}/{uuid}.ext` |
| Listing photo CARD | Yes if sharp runs | Public | `listings/{listingId}/{uuid}_card.webp` |
| Listing photo DETAIL | Yes if sharp runs | Public | `listings/{listingId}/{uuid}_detail.webp` |
| Floor plan PDF | No | — | — |
| Video | No | — | — |
| KYC / agreements | No | Private later | `private/...` |

Variant rows share listing_id; CARD/DETAIL point at derived keys. Cover = lowest `sort_order` among ORIGINAL (cards may prefer CARD url in DTO).

---

## 3. Constraints

| Rule | Value |
| --- | --- |
| MIME | `image/jpeg`, `image/png`, `image/webp` only |
| Extension | jpg/jpeg/png/webp matching MIME (sniff magic bytes, do not trust filename) |
| Max size | 8 MB per ORIGINAL |
| Max count | **20 ORIGINAL** per listing (not 20 `media` rows). CARD/DETAIL excluded. Max ~60 rows. |
| Min for publish | 1 ORIGINAL |
| Dimensions | reject if either side > 8000px (decompression bomb) |
| SVG / HTML / HEIC / GIF / PDF | reject |

Virus scan: P1. P0 rely on type/size/magic-bytes.

---

## 4. Upload flow

```text
Admin multipart POST
  → JWT + media.manage
  → listing exists and not deleted
  → ORIGINAL count < 20
  → magic-byte + MIME + size + dimension checks
  → put ORIGINAL
  → optional sharp → put CARD, DETAIL
  → insert media rows
  → return public URLs
```

**Failure handling (frozen):**

1. Validate permission, listing, file, count, MIME/magic bytes, dimensions, size.  
2. Upload ORIGINAL, then create CARD/DETAIL variants (sync sharp).  
3. Insert `media` rows.  
4. Return public URLs.

If object storage succeeds and DB insert fails: **best-effort delete** the objects just uploaded; log any leftover as orphans; **fail the HTTP request**. Do not return success with missing rows. Periodic GC of orphans is P1, not a worker pipeline in MVP.

If DB delete of a media row succeeds and object delete fails: log failure; allow retry/GC later; the application listing state remains consistent (row gone).

If listing is PUBLISHED and ORIGINAL count would hit 0, reject delete (409).

No background media pipeline in MVP. Synchronous sharp is acceptable at Scenario A.

Delete media: delete DB row then objects (best-effort). Reorder: PATCH sort_order. Cover is sort_order 0.

Reorder: PATCH sort_order. Cover is sort_order 0.

---

## 5. Public URLs

`S3_PUBLIC_BASE_URL` + `/` + storage_key, or CDN in front of the bucket.

Next.js `images.remotePatterns` allowlist that host only.

Do not stream files through NestJS on the public path (wastes API). Admin download of private files later: short-lived signed GET.

---

## 6. Image SEO and performance

- Card/detail WebP/AVIF if sharp output WebP (P0 WebP is enough)  
- `alt` from listing title + locality (frontend)  
- OG image = cover ORIGINAL or DETAIL  
- Do not upload 20 MB phone photos without client-side resize **nice-to-have**; server still enforces 8 MB  

---

## 7. Security

| Threat | Control |
| --- | --- |
| Executable upload | Magic-byte allowlist |
| Path traversal in key | UUID keys, never user filename as key |
| SSRF via URL fetch | No remote-URL ingest in P0 |
| Bucket listing | Disable public list |
| Stolen admin session | Same as auth; upload rate limit |
| Hotlink cost | CDN + cache headers; optional referrer later |

---

## 8. Backup

Enable bucket versioning or replicate to a second bucket. Images are replaceable but painful. RPO for media: same day is acceptable if versioning on.

---

## 9. Cost notes

Unoptimized originals dominate. CARD/DETAIL + CDN are the mitigation. Cap 20 images. Educate admin to compress.

---

## 10. Next

Step 13 — Notifications and background jobs (`docs/13-notifications-jobs.md`).
