import type { Metadata } from 'next';
import { MyListingsView } from '@/components/account/my-listings';

export const metadata: Metadata = { title: 'My listings' };

export default function MyListingsPage() {
  return <MyListingsView />;
}
