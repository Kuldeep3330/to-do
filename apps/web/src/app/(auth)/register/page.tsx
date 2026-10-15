import type { Metadata } from 'next';
import { Suspense } from 'react';
import { RegisterForm } from '@/components/forms/auth-forms';

export const metadata: Metadata = { title: 'Create your account', robots: { index: false } };

export default function Page() {
  return (
    <>
      <h1 className="text-2xl font-bold">Create your account</h1>
      <p className="mb-6 mt-1 text-sm text-ink-muted">Save homes and track your enquiries.</p>
      <Suspense>
        <RegisterForm />
      </Suspense>
    </>
  );
}
