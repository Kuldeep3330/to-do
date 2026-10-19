import type { AreaSummary, PublicListingCard, PublicListingDetail } from '@/lib/api/types';
import { areaDescription, areaHeading } from '@/lib/area-copy';
import { config } from '@/lib/config';
import { listingPath } from '@/lib/routes';

/** Serialize for a <script type="application/ld+json"> tag. "<" is escaped so content can never close the tag. */
export function jsonLdString(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

export function truncate(text: string, max: number): string {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 20))}…`;
}

/** RealEstateListing + Offer. Only facts present in the listing; no ratings or invented values. */
export function listingJsonLd(l: PublicListingDetail) {
  const url = `${config.appUrl}${listingPath({ ...l })}`;
  return {
    '@context': 'https://schema.org',
    '@type': 'RealEstateListing',
    name: l.title,
    description: truncate(l.description || l.title, 300),
    url,
    datePosted: l.publishedAt ?? undefined,
    image: l.gallery.length > 0 ? l.gallery : undefined,
    about: {
      '@type': 'Residence',
      numberOfRooms: l.bedrooms ?? undefined,
      numberOfBathroomsTotal: l.bathrooms ?? undefined,
      amenityFeature:
        l.amenities.length > 0
          ? l.amenities.map((a) => ({ '@type': 'LocationFeatureSpecification', name: a.name, value: true }))
          : undefined,
      floorSize: l.areaValue
        ? { '@type': 'QuantitativeValue', value: l.areaValue, unitCode: l.areaUnit === 'SQFT' ? 'FTK' : undefined }
        : undefined,
      address: {
        '@type': 'PostalAddress',
        addressLocality: l.locality.name,
        addressRegion: l.city.name,
        addressCountry: 'IN',
      },
    },
    offers:
      l.priceAmount !== null
        ? {
            '@type': 'Offer',
            price: l.priceAmount,
            priceCurrency: 'INR',
            availability: 'https://schema.org/InStock',
            businessFunction:
              l.intent === 'RENT' ? 'http://purl.org/goodrelations/v1#LeaseOut' : 'http://purl.org/goodrelations/v1#Sell',
          }
        : undefined,
  };
}

/** CollectionPage for a city/locality landing page, listing the homes shown on it. */
export function areaJsonLd(area: AreaSummary, listings: PublicListingCard[], path: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: areaHeading(area),
    description: areaDescription(area),
    url: `${config.appUrl}${path}`,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: area.stats.count,
      itemListElement: listings.map((l, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${config.appUrl}${listingPath(l)}`,
        name: l.title,
      })),
    },
  };
}

export function breadcrumbJsonLd(items: { name: string; path: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((it, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: it.name,
      item: `${config.appUrl}${it.path}`,
    })),
  };
}
