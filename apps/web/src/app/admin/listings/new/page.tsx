import type { Metadata } from 'next';
import { PageHeader } from '@/components/admin/page-header';
import { ListingForm } from '@/components/forms/listing-form';

export const metadata: Metadata = { title: 'New listing' };

export default async function NewListingPage({
  searchParams,
}: {
  searchParams: Promise<{ propertyId?: string }>;
}) {
  const { propertyId } = await searchParams;
  const valid = propertyId && /^[0-9a-f-]{36}$/i.test(propertyId) ? propertyId : undefined;
  return (
    <>
      <PageHeader
        title="New listing"
        description="Starts as a draft. Add photos and publish when it is ready."
        breadcrumbs={[{ label: 'Listings', href: '/admin/listings' }, { label: 'New' }]}
      />
      <ListingForm propertyId={valid} />
    </>
  );
}
