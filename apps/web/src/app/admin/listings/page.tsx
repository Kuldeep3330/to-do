import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ListingsList } from '@/components/admin/listings-list';

export const metadata: Metadata = { title: 'Listings' };

export default function ListingsPage() {
  return (
    <Suspense>
      <ListingsList />
    </Suspense>
  );
}
