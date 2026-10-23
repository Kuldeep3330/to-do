import type { Metadata } from 'next';
import { SystemHealthView } from '@/components/admin/system-health-view';

export const metadata: Metadata = { title: 'System health' };

export default function SystemPage() {
  return <SystemHealthView />;
}
