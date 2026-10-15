import type { Metadata } from 'next';
import { Suspense } from 'react';
import { UsersList } from '@/components/admin/users-list';

export const metadata: Metadata = { title: 'Staff' };

export default function UsersPage() {
  return (
    <Suspense>
      <UsersList />
    </Suspense>
  );
}
