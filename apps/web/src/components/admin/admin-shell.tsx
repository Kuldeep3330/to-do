'use client';

import * as React from 'react';
import Link from 'next/link';
import { notFound, usePathname, useRouter } from 'next/navigation';
import {
  Building2,
  CalendarCheck,
  Home,
  Inbox,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  Users,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/feedback';
import { ErrorState } from '@/components/ui/feedback';
import { cn } from '@/lib/utils';
import { isAdmin, isStaff, useMe, useSession } from '@/lib/auth/use-auth';

type NavItem = { href: string; label: string; icon: React.ComponentType<{ className?: string }>; adminOnly?: boolean };

const NAV: NavItem[] = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/admin/properties', label: 'Properties', icon: Home, adminOnly: true },
  { href: '/admin/listings', label: 'Listings', icon: ListChecks, adminOnly: true },
  { href: '/admin/leads', label: 'Leads', icon: Inbox },
  { href: '/admin/visits', label: 'Visits', icon: CalendarCheck },
  { href: '/admin/users', label: 'Staff', icon: Users, adminOnly: true },
];

export function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: user, isLoading, isError, refetch } = useMe();
  const { logout } = useSession();
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!isLoading && !isError && !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [isLoading, isError, user, router, pathname]);

  React.useEffect(() => setOpen(false), [pathname]);

  if (isError) {
    return (
      <div className="p-6">
        <ErrorState message="We could not verify your session." onRetry={() => refetch()} />
      </div>
    );
  }
  if (isLoading || !user) {
    return (
      <div className="flex min-h-screen">
        <Skeleton className="hidden h-screen w-60 rounded-none lg:block" />
        <div className="flex-1 space-y-4 p-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }
  // Do not reveal that /admin exists to non-staff.
  if (!isStaff(user)) notFound();

  const items = NAV.filter((n) => !n.adminOnly || isAdmin(user));

  const nav = (
    <nav aria-label="Admin" className="flex flex-col gap-1 p-3">
      {items.map((n) => {
        const active = n.href === '/admin' ? pathname === '/admin' : pathname.startsWith(n.href);
        return (
          <Link
            key={n.href}
            href={n.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium',
              active ? 'bg-brand-50 text-brand-700' : 'text-ink-muted hover:bg-surface-sunken hover:text-ink',
            )}
          >
            <n.icon className="h-4 w-4" />
            {n.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-surface-muted">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-border bg-surface lg:flex">
        <Link href="/admin" className="flex h-16 items-center gap-2 border-b border-border px-5 font-bold text-brand-700">
          <Building2 className="h-5 w-5" aria-hidden />
          NCR Homes Admin
        </Link>
        {nav}
        <div className="mt-auto border-t border-border p-3 text-xs text-ink-subtle">
          <Link href="/" className="hover:text-brand-700">
            ← View public site
          </Link>
        </div>
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-ink/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64 bg-surface shadow-pop">
            <div className="flex h-16 items-center justify-between border-b border-border px-4">
              <span className="font-bold text-brand-700">NCR Homes Admin</span>
              <Button variant="ghost" size="icon" aria-label="Close menu" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            {nav}
          </div>
        </div>
      )}

      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-surface px-4 sm:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="Open menu"
            onClick={() => setOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="ml-auto flex items-center gap-3">
            <div className="text-right leading-tight">
              <p className="text-sm font-medium">{user.name}</p>
              <p className="text-xs text-ink-subtle">{user.roles.join(', ').replaceAll('_', ' ').toLowerCase()}</p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await logout();
                router.replace('/login');
              }}
            >
              <LogOut className="h-4 w-4" aria-hidden />
              Sign out
            </Button>
          </div>
        </header>
        <main className="mx-auto max-w-7xl p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
