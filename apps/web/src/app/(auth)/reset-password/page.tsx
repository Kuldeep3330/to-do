import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ResetPasswordForm } from '@/components/forms/auth-forms';

export const metadata: Metadata = { title: 'Choose a new password', robots: { index: false } };

export default function Page() {
  return (
    <>
      <h1 className="text-2xl font-bold">Choose a new password</h1>
      <p className="mb-6 mt-1 text-sm text-ink-muted">Pick a strong password you have not used before.</p>
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </>
  );
}
