import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LeadsList } from '@/components/admin/leads-list';

export const metadata: Metadata = { title: 'Leads' };

export default function LeadsPage() {
  return (
    <Suspense>
      <LeadsList />
    </Suspense>
  );
}
