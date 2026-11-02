import type { Metadata } from 'next';
import { PollsView } from '@/components/admin/polls-view';

export const metadata: Metadata = { title: 'Community polls' };

export default function PollsPage() {
  return <PollsView />;
}
