import type { Metadata } from 'next';
import { Suspense } from 'react';
import { VisitsList } from '@/components/admin/visits-list';

export const metadata: Metadata = { title: 'Visits' };

export default function VisitsPage() {
  return (
    <Suspense>
      <VisitsList />
    </Suspense>
  );
}
