import type { Metadata } from 'next';
import { EnquiriesView } from '@/components/account/account-views';

export const metadata: Metadata = { title: 'My enquiries' };

export default function EnquiriesPage() {
  return <EnquiriesView />;
}
