import type { Metadata } from 'next';
import Link from 'next/link';
import { SearchX, X } from 'lucide-react';
import { FilterBar } from '@/components/search/filter-bar';
import { SortSelect } from '@/components/search/sort-select';
import { ListingGrid } from '@/components/listing/listing-card';
import { ButtonLink } from '@/components/ui/button';
import { EmptyState, ErrorState } from '@/components/ui/feedback';
import { Pagination } from '@/components/ui/pagination';
import { publicData } from '@/lib/api/public';
import { ApiError } from '@/lib/api/errors';
import {
  SEARCH_PAGE_SIZE,
  filterChips,
  hasActiveFilters,
  maxPage,
  parseFilters,
  searchHeading,
  searchHref,
} from '@/lib/search-params';

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

async function lookupNames(city?: string, locality?: string) {
  if (!city) return {};
  try {
    const cities = await publicData.cities();
    const cityName = cities.find((c) => c.slug === city)?.name;
    let localityName: string | undefined;
    if (locality && cityName) {
      localityName = (await publicData.localities(city)).find((l) => l.slug === locality)?.name;
    }
    return { cityName, localityName };
  } catch {
    return {};
  }
}

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const f = parseFilters(await searchParams);
  const { cityName, localityName } = await lookupNames(f.city, f.locality);
  const heading = searchHeading(f, cityName, localityName);
  // Keep thin/duplicate result pages (keyword search, deep pages) out of the index.
  const noindex = !!f.q || f.page > 1;
  return {
    title: heading,
    description: `Browse ${heading.toLowerCase()} on NCR Homes. Verified listings with photos, prices and locality details.`,
    alternates: { canonical: searchHref({ ...f, q: undefined, page: 1, sort: 'newest' }) },
    robots: noindex ? { index: false, follow: true } : undefined,
  };
}

export default async function SearchPage({ searchParams }: Props) {
  const filters = parseFilters(await searchParams);
  const { cityName, localityName } = await lookupNames(filters.city, filters.locality);
  const heading = searchHeading(filters, cityName, localityName);
  const chips = filterChips(filters, { city: cityName, locality: localityName });
  const here = searchHref(filters);

  let result: Awaited<ReturnType<typeof publicData.searchListings>> | null = null;
  let failure: 'deep' | 'down' | null = null;
  if (filters.page > maxPage()) {
    failure = 'deep';
  } else {
    try {
      result = await publicData.searchListings(filters);
    } catch (e) {
      failure = e instanceof ApiError && e.status === 400 ? 'deep' : 'down';
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{heading}</h1>
        <p className="mt-1 text-sm text-ink-muted" aria-live="polite">
          {result ? `${result.meta.total.toLocaleString('en-IN')} ${result.meta.total === 1 ? 'property' : 'properties'} found` : ' '}
        </p>
      </header>

      <FilterBar filters={filters} />

      {chips.length > 0 && (
        <ul className="mt-4 flex flex-wrap gap-2" aria-label="Active filters">
          {chips.map((c) => (
            <li key={c.key}>
              <Link
                href={searchHref({ ...filters, ...c.clear, page: 1 })}
                className="inline-flex items-center gap-1 rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700 hover:bg-brand-100"
                aria-label={`Remove filter: ${c.label}`}
              >
                {c.label}
                <X className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6">
        {failure === 'down' && (
          <ErrorState
            title="We couldn't load listings"
            message="Something went wrong on our side. Please try again in a moment."
          />
        )}
        {failure === 'down' && (
          <div className="mt-4 text-center">
            <ButtonLink href={here} variant="outline">
              Try again
            </ButtonLink>
          </div>
        )}
        {failure === 'deep' && (
          <EmptyState
            icon={SearchX}
            title="That is further than we can page"
            description="Narrow your search with a city, locality or price range to see more homes."
            action={<ButtonLink href={searchHref({ ...filters, page: 1 })}>Back to the first page</ButtonLink>}
          />
        )}
        {result && result.data.length === 0 && (
          <EmptyState
            icon={SearchX}
            title="No homes match your search"
            description={
              hasActiveFilters(filters)
                ? 'Try removing a filter or widening your price range.'
                : 'There are no published listings yet. Please check back soon.'
            }
            action={
              hasActiveFilters(filters) ? (
                <ButtonLink href={searchHref({ sort: filters.sort })}>Clear all filters</ButtonLink>
              ) : undefined
            }
          />
        )}
        {result && result.data.length > 0 && (
          <>
            <div className="mb-4 flex justify-end">
              <SortSelect filters={filters} />
            </div>
            <ListingGrid listings={result.data} />
            <Pagination
              page={result.meta.page}
              pageSize={SEARCH_PAGE_SIZE}
              total={Math.min(result.meta.total, maxPage() * SEARCH_PAGE_SIZE)}
              hrefFor={(p) => searchHref({ ...filters, page: p })}
            />
          </>
        )}
      </div>
    </div>
  );
}
