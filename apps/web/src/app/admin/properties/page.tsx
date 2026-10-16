import type { Metadata } from 'next';
import { Suspense } from 'react';
import { PropertiesList } from '@/components/admin/properties-list';

export const metadata: Metadata = { title: 'Properties' };

export default function PropertiesPage() {
  return (
    <Suspense>
      <PropertiesList />
    </Suspense>
  );
}
