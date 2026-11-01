'use client';

import * as React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Home } from 'lucide-react';
import { MediaManager } from '@/components/admin/media-manager';
import { PublishPanel } from '@/components/admin/publish-panel';
import { ListingForm } from '@/components/forms/listing-form';
import { ButtonLink } from '@/components/ui/button';
import { Card, EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { Pagination } from '@/components/ui/pagination';
import { ListingStatusBadge } from '@/components/ui/status-badge';
import { meListingsApi } from '@/lib/api/endpoints';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { formatDate, formatPrice } from '@/lib/format';
import { listingPath } from '@/lib/routes';

export function MyListingsView() {
  const [page, setPage] = React.useState(1);
  const q = useQuery({
    queryKey: ['me', 'listings', page],
    queryFn: () => meListingsApi.list({ page, pageSize: 10 }),
    placeholderData: (prev) => prev,
  });

  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  if (q.isLoading)
    return (
      <div className="space-y-3" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );

  const rows = q.data?.data ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">My listings</h1>
          <p className="mt-1 text-sm text-ink-muted">Homes you listed. Our team visits within 2 days of publish.</p>
        </div>
        <ButtonLink href="/list-property?mode=self">List a home</ButtonLink>
      </div>
      {rows.length === 0 ? (
        <EmptyState
          icon={Home}
          title="No listings yet"
          description="List a home yourself, or ask our team to visit and list it for you."
          action={<ButtonLink href="/list-property">List your property</ButtonLink>}
        />
      ) : (
        <ul className="space-y-3" aria-label="My listings">
          {rows.map((l) => (
            <li key={l.id}>
              <Card className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Link href={`/account/listings/${l.id}`} className="font-medium text-brand-700 hover:underline">
                      {l.title}
                    </Link>
                    <p className="text-sm text-ink-muted">
                      {l.intent === 'RENT' ? 'For rent' : 'For sale'} · {l.locality.name}, {l.city.name} ·{' '}
                      {formatPrice(l.priceAmount, l.pricePeriod)}
                    </p>
                    <p className="text-xs text-ink-subtle">Updated {formatDate(l.updatedAt)}</p>
                  </div>
                  <ListingStatusBadge status={l.status} />
                </div>
                {l.status === 'PUBLISHED' && (
                  <p className="mt-2 text-xs text-ink-muted">
                    {l.verifiedAt ? 'Verified by our team.' : 'Live. Our team will visit within 2 days.'}{' '}
                    <Link href={listingPath(l)} className="font-medium text-brand-700 hover:underline">
                      View public page
                    </Link>
                  </p>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
      {q.data && (
        <Pagination
          page={q.data.meta.page}
          pageSize={q.data.meta.pageSize}
          total={q.data.meta.total}
          onPageChange={setPage}
        />
      )}
    </div>
  );
}

export function MyListingDetailView({ id }: { id: string }) {
  const qc = useQueryClient();
  const key = ['me', 'listings', id] as const;
  const { data, error, isLoading, refetch } = useQuery({
    queryKey: key,
    queryFn: () => meListingsApi.get(id),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['me', 'listings'] });

  if (error instanceof ApiError && error.status === 404) notFound();
  if (error) return <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />;
  if (isLoading || !data) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const closed = data.status === 'CLOSED';

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-ink-muted">
          <Link href="/account/listings" className="hover:underline">
            My listings
          </Link>
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight">{data.title}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {data.intent === 'RENT' ? 'For rent' : 'For sale'} · {data.locality.name}, {data.city.name}
        </p>
      </div>
      <PublishPanel listing={data} onChanged={refresh} scope="me" />
      <Card className="p-5">
        <h2 className="mb-4 text-base font-semibold">Photos</h2>
        {closed ? (
          <p className="text-sm text-ink-muted">Photos cannot be changed on a closed listing.</p>
        ) : (
          <MediaManager listingId={data.id} media={data.media} status={data.status} onChanged={refresh} scope="me" />
        )}
      </Card>
      {closed ? (
        <Card className="p-5 text-sm text-ink-muted">Closed listings are read-only.</Card>
      ) : (
        <ListingForm key={data.updatedAt} listing={data} scope="me" cancelHref="/account/listings" />
      )}
    </div>
  );
}
