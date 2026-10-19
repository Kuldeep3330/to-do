import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ChevronRight } from 'lucide-react';
import { ListingGrid } from '@/components/listing/listing-card';
import { ButtonLink } from '@/components/ui/button';
import { Card, EmptyState } from '@/components/ui/feedback';
import { ApiError } from '@/lib/api/errors';
import { publicData } from '@/lib/api/public';
import type { AreaSummary, Intent, Paged, PublicListingCard } from '@/lib/api/types';
import { areaDescription, areaHeading, areaName, areaSummaryText } from '@/lib/area-copy';
import { formatPrice } from '@/lib/format';
import { areaPath } from '@/lib/routes';
import { searchHref } from '@/lib/search-params';
import { areaJsonLd, breadcrumbJsonLd, jsonLdString } from '@/lib/seo/json-ld';

export type AreaParams = { city: string; locality?: string };

async function load(intent: Intent, p: AreaParams): Promise<AreaSummary> {
  try {
    return await publicData.area(intent, p.city, p.locality);
  } catch (e) {
    // Unknown or inactive city/locality is a real 404, never a thin page.
    if (e instanceof ApiError && (e.status === 404 || e.status === 400)) notFound();
    throw e;
  }
}

export async function areaMetadata(intent: Intent, params: Promise<AreaParams>): Promise<Metadata> {
  const p = await params;
  let area: AreaSummary;
  try {
    area = await publicData.area(intent, p.city, p.locality);
  } catch {
    return { title: 'Area not found', robots: { index: false } };
  }
  const path = areaPath(intent, p.city, p.locality);
  const title = areaHeading(area);
  const description = areaDescription(area);
  return {
    title,
    description,
    alternates: { canonical: path },
    // A page with no homes is useful to a visitor but is thin content for a search engine.
    robots: area.stats.count > 0 ? undefined : { index: false, follow: true },
    openGraph: { type: 'website', title, description, url: path },
    twitter: { card: 'summary', title, description },
  };
}

export async function AreaPage({ intent, params }: { intent: Intent; params: Promise<AreaParams> }) {
  const p = await params;
  const area = await load(intent, p);
  const { stats } = area;
  const period = intent === 'RENT' ? 'MONTHLY' : 'ONE_TIME';
  const other: Intent = intent === 'RENT' ? 'BUY' : 'RENT';

  let listings: PublicListingCard[] = [];
  let total = 0;
  if (stats.count > 0) {
    try {
      const res: Paged<PublicListingCard> = await publicData.searchListings({
        intent,
        city: p.city,
        locality: p.locality,
        sort: 'newest',
        page: 1,
      });
      listings = res.data;
      total = res.meta.total;
    } catch {
      // The facts above still render; the grid is a bonus.
    }
  }

  const crumbs = [
    { name: 'Home', path: '/' },
    { name: intent === 'RENT' ? 'Rent' : 'Buy', path: searchHref({ intent }) },
    { name: area.city.name, path: areaPath(intent, area.city.slug) },
    ...(area.locality ? [{ name: area.locality.name, path: areaPath(intent, area.city.slug, area.locality.slug) }] : []),
  ];

  const facts: { label: string; value: string }[] = [
    { label: intent === 'RENT' ? 'Homes for rent' : 'Homes for sale', value: stats.count.toLocaleString('en-IN') },
    ...(stats.minPrice !== null ? [{ label: 'Lowest price', value: formatPrice(stats.minPrice, period) }] : []),
    ...(stats.count >= 3 && stats.medianPrice !== null
      ? [{ label: 'Middle price', value: formatPrice(stats.medianPrice, period) }]
      : []),
    ...(stats.maxPrice !== null && stats.maxPrice !== stats.minPrice
      ? [{ label: 'Highest price', value: formatPrice(stats.maxPrice, period) }]
      : []),
    ...(stats.verifiedCount > 0 ? [{ label: 'Verified by our team', value: stats.verifiedCount.toLocaleString('en-IN') }] : []),
  ];

  const nearbyHeading = area.locality ? `Other areas in ${area.city.name}` : `Areas in ${area.city.name}`;

  return (
    <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLdString(areaJsonLd(area, listings, areaPath(intent, p.city, p.locality))) }}
      />
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

      <header>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{areaHeading(area)}</h1>
        <p className="mt-2 max-w-3xl text-ink-muted">{areaSummaryText(area)}</p>
      </header>

      {stats.count > 0 && (
        <dl className="mt-6 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-border bg-border sm:grid-cols-3 lg:grid-cols-5" aria-label="Area facts">
          {facts.map((f) => (
            <div key={f.label} className="bg-surface p-4">
              <dt className="text-xs text-ink-subtle">{f.label}</dt>
              <dd className="mt-0.5 text-lg font-semibold">{f.value}</dd>
            </div>
          ))}
        </dl>
      )}

      <section className="mt-8" aria-labelledby="homes-heading">
        <h2 id="homes-heading" className="text-xl font-semibold">
          {stats.count > 0 ? `Latest homes in ${areaName(area)}` : 'Homes'}
        </h2>
        {listings.length > 0 ? (
          <div className="mt-4">
            <ListingGrid listings={listings} />
            {total > listings.length && (
              <div className="mt-6 text-center">
                <ButtonLink
                  href={searchHref({ intent, city: p.city, locality: p.locality })}
                  variant="outline"
                  size="lg"
                >
                  View all {total.toLocaleString('en-IN')} homes
                </ButtonLink>
              </div>
            )}
          </div>
        ) : (
          <EmptyState
            className="mt-4"
            title={`No homes ${intent === 'RENT' ? 'for rent' : 'for sale'} here right now`}
            description="New homes are added after our team visits them. Try a nearby area or browse everything we have."
            action={<ButtonLink href={searchHref({ intent })}>Browse all homes</ButtonLink>}
          />
        )}
      </section>

      {area.localities.length > 0 && (
        <section className="mt-10" aria-labelledby="nearby-heading">
          <h2 id="nearby-heading" className="text-xl font-semibold">
            {nearbyHeading}
          </h2>
          <ul className="mt-4 flex flex-wrap gap-2" aria-label={nearbyHeading}>
            {area.localities.map((l) => (
              <li key={l.slug}>
                <Link
                  href={areaPath(intent, area.city.slug, l.slug)}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-4 py-2 text-sm font-medium hover:border-brand-600 hover:text-brand-700"
                >
                  {l.name}
                  <span className="text-xs font-normal text-ink-subtle">{l.count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Card className="mt-10 p-5">
        <h2 className="text-base font-semibold">How to read these listings</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Homes marked <strong>Verified</strong> have been visited by our team, and each page shows when availability was
          last confirmed. Homes that are not re-confirmed regularly are taken down automatically.
        </p>
        <p className="mt-3 text-sm">
          <Link href={areaPath(other, area.city.slug, area.locality?.slug)} className="font-medium text-brand-700 hover:underline">
            {other === 'BUY' ? 'Looking to buy instead?' : 'Looking to rent instead?'} See homes{' '}
            {other === 'BUY' ? 'for sale' : 'for rent'} in {areaName(area)}
          </Link>
        </p>
      </Card>
    </div>
  );
}
