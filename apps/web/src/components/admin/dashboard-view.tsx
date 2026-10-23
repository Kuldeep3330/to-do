'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import {
  AlarmClock,
  ArrowRight,
  CheckCircle2,
  FilePen,
  IndianRupee,
  Inbox,
  Megaphone,
  Sun,
  Timer,
  TriangleAlert,
  Trophy,
  Users,
  Wallet,
} from 'lucide-react';
import { PageHeader } from '@/components/admin/page-header';
import { KpiCard, type KpiTone } from '@/components/admin/kpi-card';
import { Alert, Card, ErrorState, Skeleton } from '@/components/ui/feedback';
import { dashboardApi } from '@/lib/api/endpoints';
import { errorMessage } from '@/lib/api/errors';
import { isAdmin, useMe } from '@/lib/auth/use-auth';
import { formatINRCompact } from '@/lib/format';
import { formatDuration } from '@/lib/leads';
import { cn } from '@/lib/utils';

type Tile = {
  label: string;
  value: number | string | null;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: KpiTone;
  hint?: string;
};
type Section = { title: string; tiles: Tile[] };

function greeting(now = new Date()): string {
  const h = now.getHours();
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

const attentionTones = {
  danger: 'border-danger-600/30 bg-danger-50 text-danger-700',
  warning: 'border-warning-600/30 bg-warning-50 text-warning-600',
} as const;

/** What needs a person today, ahead of the numbers. Hidden items are simply absent, not zero. */
function Attention({ items }: { items: { key: string; tone: keyof typeof attentionTones; icon: Tile['icon']; text: string; href: string; cta: string }[] }) {
  if (items.length === 0) {
    return (
      <Card className="mb-6 flex items-center gap-3 p-4">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-success-50 text-success-600">
          <CheckCircle2 className="h-[18px] w-[18px]" aria-hidden />
        </span>
        <div>
          <p className="text-sm font-semibold text-ink">All caught up</p>
          <p className="text-xs text-ink-subtle">No overdue leads and no deals missing a fee.</p>
        </div>
      </Card>
    );
  }
  return (
    <section aria-label="Needs attention" className="mb-6 space-y-2">
      {items.map((a) => (
        <Link
          key={a.key}
          href={a.href}
          className={cn(
            'flex items-center gap-3 rounded-[var(--radius-card)] border p-3.5 text-sm transition-shadow hover:shadow-card',
            attentionTones[a.tone],
          )}
        >
          <a.icon className="h-[18px] w-[18px] shrink-0" aria-hidden />
          <span className="flex-1 font-medium">{a.text}</span>
          <span className="inline-flex items-center gap-1 text-xs font-semibold">
            {a.cta}
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </span>
        </Link>
      ))}
    </section>
  );
}

export function DashboardView() {
  const { data: me } = useMe();
  const q = useQuery({ queryKey: ['admin', 'dashboard'], queryFn: dashboardApi.get, refetchInterval: 60_000 });

  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;

  const d = q.data;
  const target = d ? formatDuration(d.responseTargetMinutes) : '';

  const attention: React.ComponentProps<typeof Attention>['items'] = [];
  if (d && d.leadsOverdue > 0) {
    attention.push({
      key: 'overdue',
      tone: 'danger',
      icon: AlarmClock,
      text: `${d.leadsOverdue} ${d.leadsOverdue === 1 ? 'lead is' : 'leads are'} still waiting after ${target}`,
      href: '/admin/leads?overdue=true',
      cta: 'Respond now',
    });
  }
  if (d && d.dealsWithoutFee !== null && d.dealsWithoutFee > 0) {
    attention.push({
      key: 'nofee',
      tone: 'warning',
      icon: TriangleAlert,
      text: `${d.dealsWithoutFee} won ${d.dealsWithoutFee === 1 ? 'deal has' : 'deals have'} no fee because no fee rule applied`,
      href: '/admin/settings/fees',
      cta: 'Set a fee rule',
    });
  }

  const sections: Section[] = d
    ? [
        {
          title: 'Enquiries',
          tiles: [
            { label: 'New leads', value: d.leadsNew, href: '/admin/leads?status=NEW', icon: Inbox, tone: 'brand', hint: 'Waiting for a first call' },
            {
              label: 'Overdue leads',
              value: d.leadsOverdue,
              href: '/admin/leads?overdue=true',
              icon: AlarmClock,
              tone: d.leadsOverdue > 0 ? 'danger' : 'neutral',
              hint: `Still waiting after ${target}`,
            },
            {
              label: 'Median first response',
              value: d.medianResponseMinutes === null ? '—' : formatDuration(d.medianResponseMinutes),
              href: '/admin/leads',
              icon: Timer,
              tone: 'brand',
              hint: `Last 30 days. Target: ${target}`,
            },
            { label: 'Leads today', value: d.leadsToday, href: '/admin/leads', icon: Sun, tone: 'neutral' },
            { label: 'All leads', value: d.leadsTotal, href: '/admin/leads', icon: Users, tone: 'neutral' },
          ],
        },
        {
          title: 'Deals, last 30 days',
          tiles: [
            {
              label: 'Deals won',
              value: d.dealsWon,
              href: '/admin/leads?status=WON',
              icon: Trophy,
              tone: 'success',
              hint: d.winRatePercent === null ? undefined : `About ${d.winRatePercent}% of new enquiries`,
            },
            {
              label: 'Rent won (per month)',
              value: formatINRCompact(d.wonRentMonthly),
              href: '/admin/leads?status=WON',
              icon: IndianRupee,
              tone: 'success',
              hint: 'Sum of agreed monthly rents',
            },
            {
              label: 'Sales won',
              value: formatINRCompact(d.wonSaleValue),
              href: '/admin/leads?status=WON',
              icon: IndianRupee,
              tone: 'success',
              hint: 'Sum of agreed sale prices',
            },
            // Money is admin-only: these tiles are absent for sales agents (the API sends null).
            ...(d.feesEarned !== null
              ? [{ label: 'Fees earned', value: formatINRCompact(d.feesEarned), href: '/admin/settings/fees', icon: Wallet, tone: 'brand' as const, hint: 'On deals closed in the last 30 days' }]
              : []),
            ...(d.dealsWithoutFee !== null && d.dealsWithoutFee > 0
              ? [{ label: 'Deals without a fee', value: d.dealsWithoutFee, href: '/admin/settings/fees', icon: TriangleAlert, tone: 'warning' as const, hint: 'No fee rule applied. Set one under Fees.' }]
              : []),
          ],
        },
        ...(d.publishedListings !== null || d.draftListings !== null
          ? [
              {
                title: 'Inventory',
                tiles: [
                  ...(d.publishedListings !== null
                    ? [{ label: 'Published listings', value: d.publishedListings, href: '/admin/listings?status=PUBLISHED', icon: Megaphone, tone: 'success' as const }]
                    : []),
                  ...(d.draftListings !== null
                    ? [{ label: 'Draft listings', value: d.draftListings, href: '/admin/listings?status=DRAFT', icon: FilePen, tone: 'neutral' as const, hint: 'Not visible to the public' }]
                    : []),
                ],
              },
            ]
          : []),
      ]
    : [];

  const today = new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <>
      <PageHeader
        title={me ? `Welcome back, ${me.name.split(' ')[0]}` : 'Dashboard'}
        description={`${greeting()}. ${today}.`}
      />
      {d?.scopedToAssigned && (
        <Alert tone="info" className="mb-4">
          These numbers only include leads assigned to you.
        </Alert>
      )}

      {d && <Attention items={attention} />}

      <ul className="space-y-6" aria-label="Key numbers">
        {q.isLoading ? (
          <li>
            <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => (
                <li key={i}>
                  <Skeleton className="h-32 w-full" />
                </li>
              ))}
            </ul>
          </li>
        ) : (
          sections.map((s) => (
            <li key={s.title}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-subtle">{s.title}</h2>
              <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {s.tiles.map((t) => (
                  <li key={t.label}>
                    <KpiCard
                      label={t.label}
                      value={typeof t.value === 'number' ? t.value.toLocaleString('en-IN') : t.value}
                      hint={t.hint}
                      icon={t.icon}
                      tone={t.tone}
                      href={t.href}
                    />
                  </li>
                ))}
              </ul>
            </li>
          ))
        )}
      </ul>

      {isAdmin(me) && (
        <section className="mt-8" aria-labelledby="quick-heading">
          <h2 id="quick-heading" className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-subtle">
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
                className="inline-flex items-center gap-2 rounded-lg border border-border-strong bg-surface px-4 py-2 text-sm font-medium hover:bg-surface-sunken"
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
