import Image from 'next/image';
import Link from 'next/link';
import { BedDouble, ImageOff, MapPin, Maximize2, Sofa } from 'lucide-react';
import { SaveButton } from '@/components/listing/save-button';
import { Badge } from '@/components/ui/feedback';
import type { PublicListingCard } from '@/lib/api/types';
import { formatArea, formatBedrooms, formatPrice, humanize } from '@/lib/format';
import { listingPath } from '@/lib/routes';

export function ListingCard({ listing, priority = false }: { listing: PublicListingCard; priority?: boolean }) {
  const specs = [
    { icon: BedDouble, text: formatBedrooms(listing.bedrooms) },
    { icon: Maximize2, text: formatArea(listing.areaValue, listing.areaUnit) },
    { icon: Sofa, text: listing.furnishing ? humanize(listing.furnishing) : null },
  ].filter((s): s is { icon: typeof BedDouble; text: string } => !!s.text);

  return (
    <article className="group relative overflow-hidden rounded-[var(--radius-card)] border border-border bg-surface shadow-card transition-shadow hover:shadow-pop">
      <Link href={listingPath(listing)} className="block focus-visible:outline-offset-[-2px]">
        <div className="relative aspect-[4/3] bg-surface-sunken">
          {listing.coverImageUrl ? (
            <Image
              src={listing.coverImageUrl}
              alt={`${listing.title}, ${listing.locality.name}, ${listing.city.name}`}
              fill
              sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
              className="object-cover transition-transform duration-300 group-hover:scale-[1.03]"
              priority={priority}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-ink-subtle" aria-label="No photo available">
              <ImageOff className="h-8 w-8" aria-hidden />
            </div>
          )}
          <Badge tone="brand" className="absolute left-3 top-3 bg-surface/95 shadow-card">
            {listing.intent === 'RENT' ? 'For rent' : 'For sale'}
          </Badge>
        </div>
        <div className="space-y-2 p-4">
          <p className="text-xl font-bold text-ink">{formatPrice(listing.priceAmount, listing.pricePeriod)}</p>
          <h3 className="line-clamp-2 text-sm font-medium text-ink group-hover:text-brand-700">{listing.title}</h3>
          <p className="flex items-center gap-1 text-sm text-ink-muted">
            <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
            {listing.locality.name}, {listing.city.name}
          </p>
          {specs.length > 0 && (
            <ul className="flex flex-wrap gap-x-4 gap-y-1 border-t border-border pt-3 text-xs text-ink-muted">
              {specs.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-1">
                  <Icon className="h-3.5 w-3.5" aria-hidden />
                  {text}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Link>
      <SaveButton listingId={listing.id} title={listing.title} className="absolute right-3 top-3" />
    </article>
  );
}

export function ListingGrid({ listings }: { listings: PublicListingCard[] }) {
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-label="Listings">
      {listings.map((l, i) => (
        <li key={l.id}>
          <ListingCard listing={l} priority={i < 3} />
        </li>
      ))}
    </ul>
  );
}

export function ListingGridSkeleton({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Loading listings">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="overflow-hidden rounded-[var(--radius-card)] border border-border">
          <div className="aspect-[4/3] animate-pulse bg-surface-sunken" />
          <div className="space-y-2 p-4">
            <div className="h-6 w-1/3 animate-pulse rounded bg-surface-sunken" />
            <div className="h-4 w-4/5 animate-pulse rounded bg-surface-sunken" />
            <div className="h-4 w-1/2 animate-pulse rounded bg-surface-sunken" />
          </div>
        </div>
      ))}
    </div>
  );
}
