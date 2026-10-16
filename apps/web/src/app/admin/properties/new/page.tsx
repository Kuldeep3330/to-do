import type { Metadata } from 'next';
import { PageHeader } from '@/components/admin/page-header';
import { PropertyForm } from '@/components/forms/property-form';

export const metadata: Metadata = { title: 'New property' };

export default function NewPropertyPage() {
  return (
    <>
      <PageHeader
        title="New property"
        breadcrumbs={[{ label: 'Properties', href: '/admin/properties' }, { label: 'New' }]}
      />
      <PropertyForm />
    </>
  );
}
