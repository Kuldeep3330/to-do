import type { Metadata } from 'next';
import { StaffDetail } from '@/components/admin/staff-detail';

export const metadata: Metadata = { title: 'Staff member' };

export default async function StaffMemberPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <StaffDetail id={id} />;
}
