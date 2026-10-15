import 'server-only';
import { serverApi } from './server';
import type { City, Locality, Paged, PublicListingCard, PublicListingDetail } from './types';
import { toApiQuery, type SearchFilters } from '@/lib/search-params';

const HOUR = 3600;

/** Public, cacheable server fetches (ISR). Authenticated data never goes through here. */
export const publicData = {
  searchListings: (f: SearchFilters, revalidate = 60) =>
    serverApi<Paged<PublicListingCard>>('/api/v1/listings', { query: toApiQuery(f), revalidate, tags: ['listings'] }),

  latestListings: (pageSize = 6) =>
    serverApi<Paged<PublicListingCard>>('/api/v1/listings', {
      query: { page: 1, pageSize, sort: 'newest' },
      revalidate: 60,
      tags: ['listings'],
    }),

  listing: (slug: string, revalidate = 120) =>
    serverApi<{ data: PublicListingDetail }>(`/api/v1/listings/${encodeURIComponent(slug)}`, {
      revalidate,
      tags: ['listings', `listing:${slug}`],
    }).then((r) => r.data),

  cities: () =>
    serverApi<{ data: City[] }>('/api/v1/cities', { revalidate: HOUR, tags: ['locations'] }).then((r) => r.data),

  localities: (citySlug: string) =>
    serverApi<{ data: Locality[] }>(`/api/v1/cities/${encodeURIComponent(citySlug)}/localities`, {
      revalidate: HOUR,
      tags: ['locations'],
    }).then((r) => r.data),
};
