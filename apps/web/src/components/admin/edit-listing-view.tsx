'use client';

import { notFound } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MediaManager } from '@/components/admin/media-manager';
import { PageHeader } from '@/components/admin/page-header';
import { PublishPanel } from '@/components/admin/publish-panel';
import { ListingForm } from '@/components/forms/listing-form';
import { ButtonLink } from '@/components/ui/button';
import { Card, ErrorState, Skeleton } from '@/components/ui/feedback';
import { adminListingsApi } from '@/lib/api/endpoints';
import { ApiError, errorMessage } from '@/lib/api/errors';

export function EditListingView({ id }: { id: string }) {
  const qc = useQueryClient();
  const key = ['admin', 'listings', id] as const;
  const { data, error, isLoading, refetch } = useQuery({
    queryKey: key,
    queryFn: () => adminListingsApi.get(id),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['admin', 'listings'] });

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
    <>
      <PageHeader
        title={data.title}
        description={`${data.intent === 'RENT' ? 'For rent' : 'For sale'} · ${data.locality.name}, ${data.city.name} · ${data.property.internalTitle}`}
        breadcrumbs={[{ label: 'Listings', href: '/admin/listings' }, { label: 'Edit' }]}
        actions={
          <ButtonLink href={`/admin/properties/${data.propertyId}`} variant="outline" size="sm">
            View property
          </ButtonLink>
        }
      />
      <div className="space-y-6">
        <PublishPanel listing={data} onChanged={refresh} />

        <Card className="p-5">
          <h2 className="mb-4 text-base font-semibold">Photos</h2>
          {closed ? (
            <p className="text-sm text-ink-muted">Photos cannot be changed on a closed listing.</p>
          ) : (
            <MediaManager listingId={data.id} media={data.media} status={data.status} onChanged={refresh} />
          )}
        </Card>

        {closed ? (
          <Card className="p-5 text-sm text-ink-muted">Closed listings are read-only.</Card>
        ) : (
          <ListingForm key={data.updatedAt} listing={data} />
        )}
      </div>
    </>
  );
}
