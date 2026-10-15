'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Building2, LogOut, Menu, User as UserIcon, X } from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/feedback';
import { isStaff, useMe, useSession } from '@/lib/auth/use-auth';

const NAV = [
  { href: '/search?intent=BUY', label: 'Buy' },
  { href: '/search?intent=RENT', label: 'Rent' },
  { href: '/contact', label: 'Contact' },
];

export function SiteHeader() {
  const [open, setOpen] = React.useState(false);
  const { data: user, isLoading } = useMe();
  const { logout } = useSession();
  const router = useRouter();

  const onLogout = async () => {
    await logout();
    setOpen(false);
    router.push('/');
    router.refresh();
  };

  const auth = isLoading ? (
    <Skeleton className="h-9 w-24" />
  ) : user ? (
    <>
      <ButtonLink href={isStaff(user) ? '/admin' : '/account'} variant="ghost" size="sm">
        <UserIcon className="h-4 w-4" aria-hidden />
        {isStaff(user) ? 'Dashboard' : 'My account'}
      </ButtonLink>
      <Button variant="outline" size="sm" onClick={onLogout}>
        <LogOut className="h-4 w-4" aria-hidden />
        Sign out
      </Button>
    </>
  ) : (
    <>
      <ButtonLink href="/login" variant="ghost" size="sm">
        Sign in
      </ButtonLink>
      <ButtonLink href="/register" size="sm">
        Create account
      </ButtonLink>
    </>
  );

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold text-brand-700">
          <Building2 className="h-6 w-6" aria-hidden />
          NCR Homes
        </Link>

        <nav aria-label="Main" className="hidden items-center gap-1 md:flex">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className="rounded-lg px-3 py-2 text-sm font-medium text-ink-muted hover:bg-surface-sunken hover:text-ink"
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">{auth}</div>

        <button
          type="button"
          className="cursor-pointer rounded-lg p-2 text-ink-muted hover:bg-surface-sunken md:hidden"
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="mobile-nav"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {open && (
        <div id="mobile-nav" className="border-t border-border px-4 pb-4 md:hidden">
          <nav aria-label="Mobile" className="flex flex-col py-2">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                className="rounded-lg px-3 py-3 text-sm font-medium text-ink hover:bg-surface-sunken"
              >
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex flex-wrap items-center gap-2 pt-2">{auth}</div>
        </div>
      )}
    </header>
  );
}
