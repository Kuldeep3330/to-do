import type { Metadata } from 'next';
import { EditPropertyView } from '@/components/admin/edit-property-view';

export const metadata: Metadata = { title: 'Edit property' };

export default async function EditPropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <EditPropertyView id={id} />;
}
