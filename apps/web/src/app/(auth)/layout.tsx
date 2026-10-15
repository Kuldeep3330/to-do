import Link from 'next/link';
import { Building2 } from 'lucide-react';
import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-surface-muted px-4 py-10">
      <Link href="/" className="mb-6 flex items-center gap-2 text-xl font-bold text-brand-700">
        <Building2 className="h-7 w-7" aria-hidden />
        NCR Homes
      </Link>
      <main className="w-full max-w-md rounded-[var(--radius-card)] border border-border bg-surface p-6 shadow-card sm:p-8">
        {children}
      </main>
    </div>
  );
}
