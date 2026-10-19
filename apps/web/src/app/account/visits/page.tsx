import type { Metadata } from 'next';
import { VisitsView } from '@/components/account/account-views';

export const metadata: Metadata = { title: 'My visits' };

export default function VisitsPage() {
  return <VisitsView />;
}
