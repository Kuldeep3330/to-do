# Real Estate Platform — Search Architecture

**Document:** Deliverable 11 / Step 11  
**Depends on:** `docs/06-database-schema.md`, `docs/03-traffic-capacity.md`, `docs/02-requirements-specification.md`  
**Status:** Corrected — Architecture Freeze v1  
**Date:** 2026-09-26  
**Out of this document:** Elasticsearch, application code, raw SQL files

---

## 1. Decision

**P0 search is PostgreSQL.** No OpenSearch/Elasticsearch.

Justified by Scenario A (50–300 listings, peak < 1 JSON RPS) and low Scenario B (≤ 5k listings, peak ≤ 30 RPS) if composite indexes exist.

Revisit dedicated search only when:

- Published listings exceed ~50k **and**  
- Search p95 stays > 500 ms after EXPLAIN/index work **or**  
- Product needs true relevance ranking, typo-heavy autocomplete at scale, or faceted aggregations Postgres cannot cheaply provide  

---

## 2. What “search” means in P0

Not a search engine product. A **filtered browse**:

1. Mandatory: `listings.status = PUBLISHED` AND not deleted AND property not deleted  
2. Optional equality filters  
3. Optional range filters  
4. Optional weak keyword `q` on title  
5. Whitelisted sort  
6. Offset pagination  

There is no personalization, no “did you mean”, no synonym graph, no map viewport search.

---

## 3. Query parameters

| Param | Type | Behavior |
| --- | --- | --- |
| intent | BUY \| RENT | equality |
| city | slug | join cities.slug |
| locality | slug | join localities.slug (must belong to city if both set) |
| type | RESIDENTIAL \| COMMERCIAL \| PLOT | properties.type |
| bedrooms | integer | exact; `4` means ≥4 **proposed** for 4+ UI chip |
| minPrice / maxPrice | integer INR | listings.price_amount |
| minArea / maxArea | number | properties.area_value in SQFT |
| furnishing | enum | equality |
| q | string | if length ≥ 2, case-insensitive contains on listings.title |
| sort | newest \| price_asc \| price_desc | default newest = `published_at DESC, id DESC` |
| page / pageSize | int | see section 9 |

Unknown params ignored. Invalid enum → 400.

**Bedrooms 4+:** document as `bedrooms_min` internally if UI sends `4+`. Do not silently treat `bedrooms=4` as ≥4 unless the UI label says 4+. **Recommendation:** exact match for 1,2,3; `bedroomsMin=4` for 4+.

---

## 4. Execution plan (logical)

```text
FROM listings
JOIN properties ON properties.id = listings.property_id
JOIN localities ON localities.id = properties.locality_id
JOIN cities ON cities.id = properties.city_id
LEFT JOIN LATERAL (
  SELECT storage_key FROM media
  WHERE listing_id = listings.id AND variant IN ('CARD','ORIGINAL')
  ORDER BY CASE variant WHEN 'CARD' THEN 0 ELSE 1 END, sort_order
  LIMIT 1
) cover ON true
WHERE listings.status = 'PUBLISHED'
  AND listings.deleted_at IS NULL
  AND properties.deleted_at IS NULL
  AND ...filters
ORDER BY <deterministic>
LIMIT :pageSize OFFSET :offset
```

Count query: same WHERE without lateral join.

At 300 rows this is trivial. At 5k with indexes, still fine.

---

## 5. Indexes (repeat from schema — search-owned)

Must exist before launch:

- Partial published-only: `(intent, published_at DESC, id DESC)` WHERE `status = 'PUBLISHED' AND deleted_at IS NULL`  
- Partial published-only: `(intent, price_amount, id)` WHERE `status = 'PUBLISHED' AND deleted_at IS NULL`  
- `properties(city_id, locality_id)`  
- `properties(type)`  
- Unique slug  

Validate with `EXPLAIN ANALYZE` at **1,000** and **5,000** listings on the main filter patterns before adding indexes beyond the list above.

Add `pg_trgm` GIN on `listings.title` **only if** those plans show title `ILIKE` as a real problem. Do not add unnecessary GIN. Do not add GIN on description in P0. No OpenSearch.

---

## 6. Keyword `q`

P0: `title ILIKE '%' || escaped || '%'`.

Not: full-text rank, description search, phonetic, multilingual Hindi stemmer.

If abuse (leading wildcard CPU): require 3 chars, or switch to `title ILIKE q || '%'` prefix, or trigram.

---

## 7. Geo

Store lat/lng for display. **No** `ST_DWithin`, no “within 2 km”. Map pin on detail only if coords exist and maps enabled.

---

## 8. Facets

P0: no server-side facet counts. UI shows static filter controls. Empty results are OK.

P1: `GROUP BY locality` counts for locality pages.

---

## 9. Pagination (frozen)

```text
page >= 1
pageSize >= 1
pageSize <= 24
offset = (page - 1) * pageSize
```

Public search: if `offset > 1000` → **400** (`VALIDATION_ERROR`). Do not return an empty page that looks like “no listings”.

**Deterministic ordering** (unstable pagination is a bug):

- newest: `published_at DESC, id DESC`  
- price_asc: `price_amount ASC, id DESC`  
- price_desc: `price_amount DESC, id DESC`  

Offset pagination is acceptable through Scenario B.

---

## 10. Caching

- Home “latest 8”: ISR 60s  
- Search pages: optional Cache-Control 30s public  
- Do not cache authenticated responses  

Invalidation: TTL. Staff wait up to TTL after publish.

---

## 11. SEO vs search API

HTML listing URLs are the SEO objects. The JSON search API is `noindex` (it’s `/api`). Public HTML `/search` should have a canonical and unique titles from the selected filters **only if** we ship HTML search; avoid thousands of thin URLs (noindex combinations with 0 results).

---

## 12. Next

Step 12 — Media (`docs/12-media-storage.md`).
