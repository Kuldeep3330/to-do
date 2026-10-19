import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { ChevronRight, MapPin } from 'lucide-react';
import { EnquiryPanel } from '@/components/listing/enquiry-panel';
import { AmenityList } from '@/components/listing/amenity-list';
import { ListingGallery } from '@/components/listing/listing-gallery';
import { SaveButton } from '@/components/listing/save-button';
import { TrustNote, VerifiedBadge } from '@/components/listing/trust';
import { Badge } from '@/components/ui/feedback';
import { ApiError } from '@/lib/api/errors';
import { publicData } from '@/lib/api/public';
import type { Intent, PublicListingDetail } from '@/lib/api/types';
import { formatArea, formatBedrooms, formatDate, formatINR, formatPrice, humanize } from '@/lib/format';
import { areaPath, listingPath } from '@/lib/routes';
import { breadcrumbJsonLd, jsonLdString, listingJsonLd, truncate } from '@/lib/seo/json-ld';
import { searchHref } from '@/lib/search-params';

export type DetailParams = { city: string; locality: string; slug: string };

async function load(slug: string): Promise<PublicListingDetail> {
  try {
    return await publicData.listing(slug);
  } catch (e) {
    // Draft, paused, closed and unknown slugs all look the same to the public: 404.
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) notFound();
    throw e;
  }
}

export async function listingMetadata(params: Promise<DetailParams>): Promise<Metadata> {
  const { slug } = await params;
  let l: PublicListingDetail;
  try {
    l = await publicData.listing(slug);
  } catch {
    return { title: 'Listing not found', robots: { index: false } };
  }
  const path = listingPath(l);
  const description = truncate(
    l.description ||
      `${formatBedrooms(l.bedrooms) ?? 'Property'} ${l.intent === 'RENT' ? 'for rent' : 'for sale'} in ${l.locality.name}, ${l.city.name}.`,
    160,
  );
  return {
    title: `${l.title} | ${l.locality.name} | ${l.city.name}`,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: 'website',
      title: l.title,
      description,
      url: path,
      images: l.coverImageUrl ? [{ url: l.coverImageUrl, alt: l.title }] : undefined,
    },
    twitter: { card: l.coverImageUrl ? 'summary_large_image' : 'summary', title: l.title, description },
  };
}

export async function ListingDetail({ intent, params }: { intent: Intent; params: Promise<DetailParams> }) {
  const { slug, city, locality } = await params;
  const l = await load(slug);

  // One canonical URL per listing: wrong intent/city/locality in the path redirects, it does not duplicate.
  if (l.intent !== intent || l.city.slug !== city || l.locality.slug !== locality) {
    permanentRedirect(listingPath(l));
  }

  const price = formatPrice(l.priceAmount, l.pricePeriod);
  const specs: { label: string; value: string | null }[] = [
    { label: 'Property type', value: humanize(l.propertyType) },
    { label: 'Bedrooms', value: formatBedrooms(l.bedrooms) },
    { label: 'Bathrooms', value: l.bathrooms !== null ? String(l.bathrooms) : null },
    { label: 'Balconies', value: l.balconies !== null ? String(l.balconies) : null },
    { label: 'Area', value: formatArea(l.areaValue, l.areaUnit) },
    {
      label: 'Floor',
      value:
        l.floor !== null ? `${l.floor === 0 ? 'Ground' : l.floor}${l.totalFloors !== null ? ` of ${l.totalFloors}` : ''}` : null,
    },
    { label: 'Furnishing', value: l.furnishing ? humanize(l.furnishing) : null },
    { label: 'Facing', value: l.facing },
    { label: 'Society', value: l.societyName },
    { label: 'Available from', value: l.availableFrom ? formatDate(l.availableFrom) : null },
  ].filter((s) => s.value);

  const crumbs = [
    { name: 'Home', path: '/' },
    { name: l.intent === 'RENT' ? 'Rent' : 'Buy', path: searchHref({ intent: l.intent }) },
    { name: l.city.name, path: areaPath(l.intent, l.city.slug) },
    { name: l.locality.name, path: areaPath(l.intent, l.city.slug, l.locality.slug) },
  ];

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 pb-28 sm:px-6 lg:pb-10">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(listingJsonLd(l)) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdString(breadcrumbJsonLd(crumbs)) }} />

      <nav aria-label="Breadcrumb" className="mb-4">
        <ol className="flex flex-wrap items-center gap-1 text-sm text-ink-subtle">
          {crumbs.map((c, i) => (
            <li key={c.path} className="flex items-center gap-1">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5" aria-hidden />}
              <Link href={c.path} className="hover:text-brand-700">
                {c.name}
              </Link>
            </li>
          ))}
        </ol>
      </nav>

      <div className="grid gap-8 lg:grid-cols-[1fr_22rem]">
        <div className="min-w-0 space-y-8">
          <ListingGallery images={l.gallery} alt={`${l.title}, ${l.locality.name}, ${l.city.name}`} />

          <header>
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="brand">{l.intent === 'RENT' ? 'For rent' : 'For sale'}</Badge>
              {l.negotiable && <Badge tone="success">Negotiable</Badge>}
              <VerifiedBadge verifiedAt={l.verifiedAt} />
              <SaveButton listingId={l.id} title={l.title} variant="inline" className="ml-auto" />
            </div>
            <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">{l.title}</h1>
            <p className="mt-1 flex items-center gap-1 text-ink-muted">
              <MapPin className="h-4 w-4" aria-hidden />
              {l.societyName ? `${l.societyName}, ` : ''}
              {l.locality.name}, {l.city.name}
            </p>
            <TrustNote
              verifiedAt={l.verifiedAt}
              verifiedByFirstName={l.verifiedByFirstName}
              lastConfirmedAt={l.lastConfirmedAt}
            />
            <p className="mt-4 text-3xl font-bold text-ink">{price}</p>
            {(l.maintenanceAmount || l.depositAmount) && (
              <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-ink-muted">
                {l.maintenanceAmount ? (
                  <div className="flex gap-1">
                    <dt>Maintenance:</dt>
                    <dd className="font-medium text-ink">{formatINR(l.maintenanceAmount)}/mo</dd>
                  </div>
                ) : null}
                {l.depositAmount ? (
                  <div className="flex gap-1">
                    <dt>Security deposit:</dt>
                    <dd className="font-medium text-ink">{formatINR(l.depositAmount)}</dd>
                  </div>
                ) : null}
              </dl>
            )}
          </header>

          {specs.length > 0 && (
            <section aria-labelledby="overview-heading">
              <h2 id="overview-heading" className="text-xl font-semibold">
                Overview
              </h2>
              <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3">
                {specs.map((s) => (
                  <div key={s.label} className="bg-surface p-4">
                    <dt className="text-xs text-ink-subtle">{s.label}</dt>
                    <dd className="mt-0.5 font-medium">{s.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}

          <AmenityList amenities={l.amenities} />

          {l.description && (
            <section aria-labelledby="about-heading">
              <h2 id="about-heading" className="text-xl font-semibold">
                About this property
              </h2>
              {/* Rendered as text with preserved line breaks; never as HTML. */}
              <p className="mt-3 whitespace-pre-line leading-relaxed text-ink-muted">{l.description}</p>
            </section>
          )}
        </div>

        <aside aria-label="Enquiry">
          <EnquiryPanel listingId={l.id} listingSlug={l.slug} listingTitle={l.title} priceLabel={price} />
        </aside>
      </div>
    </div>
  );
}
