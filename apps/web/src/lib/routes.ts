import type { Intent } from '@/lib/api/types';

/** Canonical public URL of a listing: /buy|rent/{city}/{locality}/{slug}. */
export function listingPath(l: {
  intent: Intent;
  slug: string;
  city: { slug: string };
  locality: { slug: string };
}): string {
  return `/${l.intent === 'BUY' ? 'buy' : 'rent'}/${l.city.slug}/${l.locality.slug}/${l.slug}`;
}
