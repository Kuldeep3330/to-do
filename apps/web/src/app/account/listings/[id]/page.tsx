import type { Metadata } from 'next';
import { MyListingDetailView } from '@/components/account/my-listings';

export const metadata: Metadata = { title: 'Edit listing' };

export default async function MyListingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MyListingDetailView id={id} />;
}
