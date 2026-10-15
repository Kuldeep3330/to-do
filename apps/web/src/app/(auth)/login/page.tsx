import type { Metadata } from 'next';
import { Suspense } from 'react';
import { LoginForm } from '@/components/forms/auth-forms';

export const metadata: Metadata = { title: 'Sign in', robots: { index: false } };

export default function Page() {
  return (
    <>
      <h1 className="text-2xl font-bold">Sign in</h1>
      <p className="mb-6 mt-1 text-sm text-ink-muted">Welcome back. Sign in to manage your enquiries and saved homes.</p>
      <Suspense>
        <LoginForm />
      </Suspense>
    </>
  );
}
