'use client';

import { notFound } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { PageHeader } from '@/components/admin/page-header';
import { PropertyForm } from '@/components/forms/property-form';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { PropertyStatusBadge } from '@/components/ui/status-badge';
import { ButtonLink } from '@/components/ui/button';
import { adminPropertiesApi } from '@/lib/api/endpoints';
import { ApiError, errorMessage } from '@/lib/api/errors';

export function EditPropertyView({ id }: { id: string }) {
  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ['admin', 'properties', id],
    queryFn: () => adminPropertiesApi.get(id),
  });

  if (error instanceof ApiError && error.status === 404) notFound();
  if (error) return <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />;
  if (isLoading || !data) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <>
      <PageHeader
        title={data.internalTitle}
        breadcrumbs={[{ label: 'Properties', href: '/admin/properties' }, { label: 'Edit' }]}
        actions={
          <>
            <PropertyStatusBadge status={data.status} />
            <ButtonLink href={`/admin/listings/new?propertyId=${data.id}`} variant="outline" size="sm">
              Create listing
            </ButtonLink>
          </>
        }
      />
      {/* key resets form state if the record is refetched with a newer version */}
      <PropertyForm key={data.updatedAt} property={data} />
    </>
  );
}
