import { formatBedrooms, formatINRCompact, humanize } from '@/lib/format';

/** Page size of the public grid. The API caps offset at 1000, so deep pages are clamped. */
export const SEARCH_PAGE_SIZE = 12;
export const MAX_OFFSET = 1000;

export type Sort = 'newest' | 'price_asc' | 'price_desc';

export type SearchFilters = {
  intent?: 'BUY' | 'RENT';
  city?: string;
  locality?: string;
  type?: 'RESIDENTIAL' | 'COMMERCIAL' | 'PLOT';
  bedrooms?: number;
  bedroomsMin?: number;
  minPrice?: number;
  maxPrice?: number;
  minArea?: number;
  maxArea?: number;
  furnishing?: 'UNFURNISHED' | 'SEMI' | 'FURNISHED';
  q?: string;
  sort: Sort;
  page: number;
};

type Raw = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);
const oneOf = <T extends string>(v: string | undefined, allowed: readonly T[]): T | undefined =>
  v && (allowed as readonly string[]).includes(v) ? (v as T) : undefined;
const slug = (v: string | undefined) => (v && /^[a-z0-9-]{1,80}$/.test(v) ? v : undefined);
const int = (v: string | undefined, min: number, max: number) => {
  if (v === undefined || !/^\d+$/.test(v)) return undefined;
  const n = Number(v);
  return n >= min && n <= max ? n : undefined;
};
const num = (v: string | undefined) => {
  if (v === undefined || !/^\d+(\.\d+)?$/.test(v)) return undefined;
  const n = Number(v);
  return n > 0 && n < 1e10 ? n : undefined;
};

/** Parse and sanitize untrusted URL params. Unknown or invalid values are dropped, never thrown. */
export function parseFilters(raw: Raw): SearchFilters {
  const q = first(raw.q)?.trim();
  let minPrice = int(first(raw.minPrice), 0, 9_999_999_999);
  let maxPrice = int(first(raw.maxPrice), 0, 9_999_999_999);
  if (minPrice !== undefined && maxPrice !== undefined && minPrice > maxPrice) [minPrice, maxPrice] = [maxPrice, minPrice];
  const bedrooms = int(first(raw.bedrooms), 0, 50);
  return {
    intent: oneOf(first(raw.intent), ['BUY', 'RENT'] as const),
    city: slug(first(raw.city)),
    locality: slug(first(raw.city)) ? slug(first(raw.locality)) : undefined,
    type: oneOf(first(raw.type), ['RESIDENTIAL', 'COMMERCIAL', 'PLOT'] as const),
    bedrooms,
    bedroomsMin: bedrooms === undefined ? int(first(raw.bedroomsMin), 1, 50) : undefined,
    minPrice,
    maxPrice,
    minArea: num(first(raw.minArea)),
    maxArea: num(first(raw.maxArea)),
    furnishing: oneOf(first(raw.furnishing), ['UNFURNISHED', 'SEMI', 'FURNISHED'] as const),
    q: q && q.length >= 2 && q.length <= 80 ? q : undefined,
    sort: oneOf(first(raw.sort), ['newest', 'price_asc', 'price_desc'] as const) ?? 'newest',
    page: int(first(raw.page), 1, 10_000) ?? 1,
  };
}

/** Params for the API (page size included). */
export function toApiQuery(f: SearchFilters): Record<string, string | number> {
  const { page, ...rest } = f;
  const out: Record<string, string | number> = { page, pageSize: SEARCH_PAGE_SIZE };
  for (const [k, v] of Object.entries(rest)) if (v !== undefined) out[k] = v;
  return out;
}

/** Canonical, shareable query string. Defaults (sort=newest, page=1) are omitted. */
export function toSearchString(f: Partial<SearchFilters>): string {
  const p = new URLSearchParams();
  const order: (keyof SearchFilters)[] = [
    'intent', 'city', 'locality', 'type', 'bedrooms', 'bedroomsMin', 'minPrice', 'maxPrice',
    'minArea', 'maxArea', 'furnishing', 'q', 'sort', 'page',
  ];
  for (const k of order) {
    const v = f[k];
    if (v === undefined || v === '') continue;
    if (k === 'sort' && v === 'newest') continue;
    if (k === 'page' && v === 1) continue;
    p.set(k, String(v));
  }
  const s = p.toString();
  return s ? `?${s}` : '';
}

export const searchHref = (f: Partial<SearchFilters>) => `/search${toSearchString(f)}`;

export function hasActiveFilters(f: SearchFilters): boolean {
  const { sort, page, ...rest } = f;
  void sort;
  void page;
  return Object.values(rest).some((v) => v !== undefined);
}

/** Highest page the API will serve for this page size. */
export function maxPage(pageSize = SEARCH_PAGE_SIZE): number {
  return Math.floor(MAX_OFFSET / pageSize) + 1;
}

export type Chip = { key: string; label: string; clear: Partial<SearchFilters> };

/** Human-readable active-filter chips; `clear` is what to reset to remove each one. */
export function filterChips(f: SearchFilters, names: { city?: string; locality?: string } = {}): Chip[] {
  const chips: Chip[] = [];
  if (f.intent) chips.push({ key: 'intent', label: f.intent === 'BUY' ? 'Buy' : 'Rent', clear: { intent: undefined } });
  if (f.city) chips.push({ key: 'city', label: names.city ?? humanize(f.city.replaceAll('-', '_')), clear: { city: undefined, locality: undefined } });
  if (f.locality) chips.push({ key: 'locality', label: names.locality ?? humanize(f.locality.replaceAll('-', '_')), clear: { locality: undefined } });
  if (f.type) chips.push({ key: 'type', label: humanize(f.type), clear: { type: undefined } });
  if (f.bedrooms !== undefined) chips.push({ key: 'bedrooms', label: formatBedrooms(f.bedrooms) ?? '', clear: { bedrooms: undefined } });
  if (f.bedroomsMin !== undefined) chips.push({ key: 'bedroomsMin', label: `${f.bedroomsMin}+ BHK`, clear: { bedroomsMin: undefined } });
  if (f.minPrice !== undefined) chips.push({ key: 'minPrice', label: `Min ${formatINRCompact(f.minPrice)}`, clear: { minPrice: undefined } });
  if (f.maxPrice !== undefined) chips.push({ key: 'maxPrice', label: `Max ${formatINRCompact(f.maxPrice)}`, clear: { maxPrice: undefined } });
  if (f.minArea !== undefined) chips.push({ key: 'minArea', label: `${f.minArea}+ sq ft`, clear: { minArea: undefined } });
  if (f.maxArea !== undefined) chips.push({ key: 'maxArea', label: `Up to ${f.maxArea} sq ft`, clear: { maxArea: undefined } });
  if (f.furnishing) chips.push({ key: 'furnishing', label: humanize(f.furnishing), clear: { furnishing: undefined } });
  if (f.q) chips.push({ key: 'q', label: `“${f.q}”`, clear: { q: undefined } });
  return chips;
}

/** Page <title>/heading from the filters, e.g. "2 BHK homes for rent in Noida". */
export function searchHeading(f: SearchFilters, cityName?: string, localityName?: string): string {
  const bhk = f.bedrooms !== undefined ? `${formatBedrooms(f.bedrooms)} ` : f.bedroomsMin ? `${f.bedroomsMin}+ BHK ` : '';
  const kind = f.type === 'COMMERCIAL' ? 'commercial properties' : f.type === 'PLOT' ? 'plots' : 'homes';
  const verb = f.intent === 'RENT' ? ' for rent' : f.intent === 'BUY' ? ' for sale' : '';
  const where = localityName && cityName ? ` in ${localityName}, ${cityName}` : cityName ? ` in ${cityName}` : ' in Delhi-NCR';
  return `${bhk}${kind}${verb}${where}`.replace(/^./, (c) => c.toUpperCase());
}

export const PRICE_PRESETS = {
  RENT: [5_000, 10_000, 15_000, 25_000, 40_000, 60_000, 100_000],
  BUY: [2_500_000, 5_000_000, 7_500_000, 10_000_000, 20_000_000, 50_000_000, 100_000_000],
} as const;
