import type { Metadata } from 'next';
import { DataQualityView } from '@/components/admin/data-quality-view';

export const metadata: Metadata = { title: 'Data quality' };

export default function DataQualityPage() {
  return <DataQualityView />;
}
