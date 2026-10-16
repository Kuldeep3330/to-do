import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ForgotPasswordForm } from '@/components/forms/auth-forms';

export const metadata: Metadata = { title: 'Forgot password', robots: { index: false } };

export default function Page() {
  return (
    <>
      <h1 className="text-2xl font-bold">Forgot password</h1>
      <p className="mb-6 mt-1 text-sm text-ink-muted">Enter your email and we will send you a reset link.</p>
      <Suspense>
        <ForgotPasswordForm />
      </Suspense>
    </>
  );
}
