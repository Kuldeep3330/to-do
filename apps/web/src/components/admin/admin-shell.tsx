'use client';

import * as React from 'react';
import Link from 'next/link';
import { notFound, usePathname, useRouter } from 'next/navigation';
import { Building2, ChevronRight, ExternalLink, LogOut, Menu, Moon, Sun, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorState, Skeleton } from '@/components/ui/feedback';
import { cn } from '@/lib/utils';
import { isAdmin, isStaff, useMe, useSession } from '@/lib/auth/use-auth';
import type { PublicUser } from '@/lib/api/types';
import { ADMIN_NAV_GROUPS, adminCrumbs, isNavActive } from './admin-nav';
import { useAdminTheme } from './admin-theme';
import { Avatar } from './avatar';

function roleLabel(user: PublicUser): string {
  return user.roles.join(', ').replaceAll('_', ' ').toLowerCase();
}

function Brand({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link
      href="/admin"
      onClick={onNavigate}
      className="flex h-16 shrink-0 items-center gap-2.5 border-b border-border px-5 font-bold text-ink"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
        <Building2 className="h-4 w-4" aria-hidden />
      </span>
      <span className="leading-tight">
        NCR Homes
        <span className="block text-[10px] font-semibold uppercase tracking-widest text-ink-subtle">Admin</span>
      </span>
    </Link>
  );
}

function SidebarNav({ user, pathname, onNavigate }: { user: PublicUser; pathname: string; onNavigate?: () => void }) {
  const admin = isAdmin(user);
  const groups = ADMIN_NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((i) => !i.adminOnly || admin) })).filter(
    (g) => g.items.length > 0,
  );
  return (
    <nav aria-label="Admin" className="flex-1 overflow-y-auto px-3 py-4">
      {groups.map((g) => (
        <div key={g.label} className="mb-5">
          <p className="mb-1.5 px-3 text-[11px] font-semibold uppercase tracking-wider text-ink-subtle">{g.label}</p>
          <ul className="space-y-0.5">
            {g.items.map((item) => {
              const active = isNavActive(item, pathname);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex items-center gap-3 rounded-lg border-l-2 px-3 py-2 text-sm font-medium transition-colors',
                      active
                        ? 'border-brand-600 bg-brand-50 text-brand-700'
                        : 'border-transparent text-ink-muted hover:bg-surface-sunken hover:text-ink',
                    )}
                  >
                    <item.icon className="h-4 w-4" aria-hidden />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function SidebarFooter({ user, onSignOut }: { user: PublicUser; onSignOut: () => void }) {
  return (
    <div className="shrink-0 border-t border-border p-3">
      <div className="flex items-center gap-3 rounded-lg p-2">
        <Avatar name={user.name} />
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-medium text-ink">{user.name}</p>
          <p className="truncate text-xs capitalize text-ink-subtle">{roleLabel(user)}</p>
        </div>
        <Button variant="ghost" size="icon" aria-label="Sign out" title="Sign out" onClick={onSignOut}>
          <LogOut className="h-4 w-4" aria-hidden />
        </Button>
      </div>
    </div>
  );
}

function Breadcrumbs({ pathname }: { pathname: string }) {
  const crumbs = adminCrumbs(pathname);
  return (
    <nav aria-label="Location" className="flex min-w-0 items-center gap-1.5 text-sm">
      {crumbs.map((c, i) => (
        <React.Fragment key={`${c}-${i}`}>
          {i > 0 && <ChevronRight className="hidden h-3.5 w-3.5 shrink-0 text-ink-subtle sm:block" aria-hidden />}
          <span
            className={cn('truncate', i === crumbs.length - 1 ? 'font-semibold text-ink' : 'hidden text-ink-subtle sm:inline')}
            aria-current={i === crumbs.length - 1 ? 'page' : undefined}
          >
            {c}
          </span>
        </React.Fragment>
      ))}
    </nav>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: user, isLoading, isError, refetch } = useMe();
  const { logout } = useSession();
  const { theme, toggle } = useAdminTheme();
  const [open, setOpen] = React.useState(false);

  React.useEffect(() => {
    if (!isLoading && !isError && !user) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [isLoading, isError, user, router, pathname]);

  React.useEffect(() => setOpen(false), [pathname]);

  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

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
        <Skeleton className="hidden h-screen w-64 rounded-none lg:block" />
        <div className="flex-1 space-y-4 p-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }
  // Do not reveal that /admin exists to non-staff.
  if (!isStaff(user)) notFound();

  const signOut = async () => {
    await logout();
    router.replace('/login');
  };

  return (
    <div className="min-h-screen bg-surface-muted text-ink">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-surface focus:px-4 focus:py-2 focus:shadow-pop"
      >
        Skip to content
      </a>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-surface lg:flex">
        <Brand />
        <SidebarNav user={user} pathname={pathname} />
        <SidebarFooter user={user} onSignOut={signOut} />
      </aside>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-surface shadow-pop">
            <div className="flex items-center justify-between border-b border-border pr-3">
              <Brand onNavigate={() => setOpen(false)} />
              <Button variant="ghost" size="icon" aria-label="Close menu" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <SidebarNav user={user} pathname={pathname} onNavigate={() => setOpen(false)} />
            <SidebarFooter user={user} onSignOut={signOut} />
          </div>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-surface/90 px-4 backdrop-blur sm:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open menu" onClick={() => setOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <Breadcrumbs pathname={pathname} />
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
              title={theme === 'dark' ? 'Light theme' : 'Dark theme'}
              onClick={toggle}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4" aria-hidden /> : <Moon className="h-4 w-4" aria-hidden />}
            </Button>
            <Link
              href="/"
              target="_blank"
              rel="noopener"
              className="hidden items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-ink-muted hover:bg-surface-sunken hover:text-ink sm:inline-flex"
            >
              View site
              <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </Link>
          </div>
        </header>
        <main id="main-content" tabIndex={-1} className="mx-auto max-w-7xl p-4 outline-none sm:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
