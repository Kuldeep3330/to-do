import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AccountNav } from '@/components/account/account-views';
import { AccountGuard } from '@/components/layout/account-guard';
import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';

export const metadata: Metadata = {
  title: { default: 'My account', template: '%s | My account' },
  robots: { index: false, follow: false },
};

export default function AccountLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 sm:px-6">
        <AccountGuard>
          <AccountNav />
          {children}
        </AccountGuard>
      </main>
      <SiteFooter />
    </div>
  );
}
