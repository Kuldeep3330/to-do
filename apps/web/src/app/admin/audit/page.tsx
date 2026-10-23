import type { Metadata } from 'next';
import { Suspense } from 'react';
import { AuditLogView } from '@/components/admin/audit-log-view';

export const metadata: Metadata = { title: 'Audit log' };

export default function AuditPage() {
  return (
    <Suspense>
      <AuditLogView />
    </Suspense>
  );
}
