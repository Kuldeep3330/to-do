import type { MetadataRoute } from 'next';
import { serverApi } from '@/lib/api/server';
import { publicData } from '@/lib/api/public';
import type { Paged, PublicListingCard } from '@/lib/api/types';
import { config } from '@/lib/config';
import { areaPath, listingPath } from '@/lib/routes';
import { searchHref } from '@/lib/search-params';

export const revalidate = 3600;

const PAGE_SIZE = 24;
const MAX_OFFSET = 1000; // the public API refuses deeper offsets

async function allPublished(): Promise<PublicListingCard[]> {
  const out: PublicListingCard[] = [];
  for (let page = 1; (page - 1) * PAGE_SIZE <= MAX_OFFSET; page++) {
    const res = await serverApi<Paged<PublicListingCard>>('/api/v1/listings', {
      query: { page, pageSize: PAGE_SIZE, sort: 'newest' },
      revalidate: 3600,
      tags: ['listings'],
    });
    out.push(...res.data);
    if (out.length >= res.meta.total || res.data.length < PAGE_SIZE) break;
  }
  return out;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const abs = (path: string) => `${config.appUrl}${path}`;
  const now = new Date();

  const entries: MetadataRoute.Sitemap = [
    { url: abs('/'), lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: abs(searchHref({ intent: 'BUY' })), changeFrequency: 'daily', priority: 0.8 },
    { url: abs(searchHref({ intent: 'RENT' })), changeFrequency: 'daily', priority: 0.8 },
    ...['/about', '/contact', '/privacy', '/terms'].map((p) => ({
      url: abs(p),
      changeFrequency: 'yearly' as const,
      priority: 0.3,
    })),
  ];

  // Never fail the whole sitemap because the API is briefly unavailable.
  try {
    const cities = await publicData.cities();
    for (const c of cities) {
      entries.push({ url: abs(searchHref({ city: c.slug })), changeFrequency: 'daily', priority: 0.6 });
    }
  } catch {}
  // Landing pages only for areas that actually have homes: empty pages are noindex and stay out of the sitemap.
  try {
    const cities = await publicData.cities();
    for (const intent of ['RENT', 'BUY'] as const) {
      for (const c of cities) {
        const area = await publicData.area(intent, c.slug);
        if (area.stats.count === 0) continue;
        entries.push({ url: abs(areaPath(intent, c.slug)), changeFrequency: 'daily', priority: 0.7 });
        for (const l of area.localities) {
          entries.push({ url: abs(areaPath(intent, c.slug, l.slug)), changeFrequency: 'daily', priority: 0.6 });
        }
      }
    }
  } catch {}
  try {
    for (const l of await allPublished()) {
      entries.push({
        url: abs(listingPath(l)),
        lastModified: l.publishedAt ? new Date(l.publishedAt) : undefined,
        changeFrequency: 'weekly',
        priority: 0.7,
      });
    }
  } catch {}

  return entries;
}
