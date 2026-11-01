import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ListPropertyView } from '@/components/forms/list-property-view';
import { Skeleton } from '@/components/ui/feedback';

export const metadata: Metadata = {
  title: 'List your property',
  description:
    'List your home in Delhi-NCR yourself, or ask our team to visit. We check every listing within 2 days.',
  alternates: { canonical: '/list-property' },
};

export default function ListPropertyPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-6xl px-4 py-12" aria-busy="true">
          <Skeleton className="h-10 w-80" />
          <Skeleton className="mt-6 h-96 w-full" />
        </div>
      }
    >
      <ListPropertyView />
    </Suspense>
  );
}
