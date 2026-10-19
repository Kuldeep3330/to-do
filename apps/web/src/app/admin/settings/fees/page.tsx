import type { Metadata } from 'next';
import { FeeRulesView } from '@/components/admin/fee-rules-view';

export const metadata: Metadata = { title: 'Fees' };

export default function FeesPage() {
  return <FeeRulesView />;
}
