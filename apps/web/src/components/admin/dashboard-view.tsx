'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, FilePen, Inbox, Megaphone, Sun, Users } from 'lucide-react';
import { PageHeader } from '@/components/admin/page-header';
import { Alert, Card, ErrorState, Skeleton } from '@/components/ui/feedback';
import { dashboardApi } from '@/lib/api/endpoints';
import { errorMessage } from '@/lib/api/errors';
import { isAdmin, useMe } from '@/lib/auth/use-auth';

type Tile = { label: string; value: number | null; href: string; icon: React.ComponentType<{ className?: string }>; hint?: string };

export function DashboardView() {
  const { data: me } = useMe();
  const q = useQuery({ queryKey: ['admin', 'dashboard'], queryFn: dashboardApi.get, refetchInterval: 60_000 });

  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;

  const d = q.data;
  const tiles: Tile[] = d
    ? [
        { label: 'New leads', value: d.leadsNew, href: '/admin/leads?status=NEW', icon: Inbox, hint: 'Waiting for a first call' },
        { label: 'Leads today', value: d.leadsToday, href: '/admin/leads', icon: Sun },
        { label: 'All leads', value: d.leadsTotal, href: '/admin/leads', icon: Users },
        ...(d.publishedListings !== null
          ? [{ label: 'Published listings', value: d.publishedListings, href: '/admin/listings?status=PUBLISHED', icon: Megaphone }]
          : []),
        ...(d.draftListings !== null
          ? [{ label: 'Draft listings', value: d.draftListings, href: '/admin/listings?status=DRAFT', icon: FilePen, hint: 'Not visible to the public' }]
          : []),
      ]
    : [];

  return (
    <>
      <PageHeader
        title={me ? `Welcome back, ${me.name.split(' ')[0]}` : 'Dashboard'}
        description="Overview of listings and enquiries."
      />
      {d?.scopedToAssigned && (
        <Alert tone="info" className="mb-4">
          These numbers only include leads assigned to you.
        </Alert>
      )}
      <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" aria-label="Key numbers">
        {q.isLoading
          ? Array.from({ length: 5 }, (_, i) => (
              <li key={i}>
                <Skeleton className="h-28 w-full" />
              </li>
            ))
          : tiles.map((t) => (
              <li key={t.label}>
                <Link href={t.href} className="block rounded-[var(--radius-card)] focus-visible:outline-offset-2">
                  <Card className="p-5 transition-shadow hover:shadow-pop">
                    <div className="flex items-center justify-between text-ink-muted">
                      <span className="text-sm font-medium">{t.label}</span>
                      <t.icon className="h-5 w-5" />
                    </div>
                    <p className="mt-2 text-3xl font-bold tabular-nums text-ink">{t.value?.toLocaleString('en-IN')}</p>
                    {t.hint && <p className="mt-1 text-xs text-ink-subtle">{t.hint}</p>}
                  </Card>
                </Link>
              </li>
            ))}
      </ul>

      {isAdmin(me) && (
        <section className="mt-8" aria-labelledby="quick-heading">
          <h2 id="quick-heading" className="mb-3 text-base font-semibold">
            Quick actions
          </h2>
          <div className="flex flex-wrap gap-3">
            {[
              { href: '/admin/properties/new', label: 'Add a property' },
              { href: '/admin/listings/new', label: 'Create a listing' },
              { href: '/admin/leads?status=NEW', label: 'Work new leads' },
            ].map((a) => (
              <Link
                key={a.href}
                href={a.href}
                className="inline-flex items-center gap-2 rounded-lg border border-border-strong bg-surface px-4 py-2 text-sm font-medium hover:bg-surface-muted"
              >
                {a.label}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            ))}
          </div>
        </section>
      )}
    </>
  );
}
