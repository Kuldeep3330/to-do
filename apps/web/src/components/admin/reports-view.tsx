'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, Inbox, MessageCircle, Timer, Trophy } from 'lucide-react';
import { PageHeader } from '@/components/admin/page-header';
import { KpiCard } from '@/components/admin/kpi-card';
import { Button } from '@/components/ui/button';
import { Alert, Card, EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { Input } from '@/components/ui/form-controls';
import { adminReportsApi } from '@/lib/api/endpoints';
import { errorMessage } from '@/lib/api/errors';
import type { ReportsResponse } from '@/lib/api/types';
import { downloadCsv, toCsv } from '@/lib/csv';
import { formatINR, humanize } from '@/lib/format';
import { formatDuration } from '@/lib/leads';
import { PRESETS, matchPreset, monthLabel, percent, presetRange, todayIst } from '@/lib/reports';
import { useUrlParams } from '@/lib/use-url-params';
import { cn } from '@/lib/utils';

function Section({ title, description, actions, children }: { title: string; description?: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-8" aria-label={title}>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-ink">{title}</h2>
          {description && <p className="text-sm text-ink-muted">{description}</p>}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}

function CsvButton({ filename, headers, rows }: { filename: string; headers: string[]; rows: unknown[][] }) {
  return (
    <Button variant="outline" size="sm" disabled={rows.length === 0} onClick={() => downloadCsv(filename, toCsv(headers, rows))}>
      <Download className="h-4 w-4" aria-hidden />
      Export CSV
    </Button>
  );
}

/** Bars per day. The summary in aria-label carries the same story for screen readers; each bar also has a tooltip. */
function DailyChart({ daily }: { daily: ReportsResponse['report']['daily'] }) {
  const max = Math.max(1, ...daily.map((d) => d.leads));
  const total = daily.reduce((n, d) => n + d.leads, 0);
  const busiest = daily.reduce((a, b) => (b.leads > a.leads ? b : a), daily[0]!);
  const W = 720;
  const H = 160;
  const slot = W / daily.length;
  const bar = Math.max(2, slot * 0.7);
  return (
    <Card className="p-4">
      <svg
        viewBox={`0 0 ${W} ${H + 20}`}
        role="img"
        aria-label={`Enquiries per day. ${total} in ${daily.length} days${total > 0 ? `; the busiest day was ${busiest.date} with ${busiest.leads}` : ''}.`}
        className="h-48 w-full"
      >
        {daily.map((d, i) => {
          const x = i * slot + (slot - bar) / 2;
          const h = (d.leads / max) * H;
          const wonH = (d.won / max) * H;
          return (
            <g key={d.date}>
              <title>{`${d.date}: ${d.leads} enquiries, ${d.won} won`}</title>
              <rect x={x} y={H - h} width={bar} height={h} rx={2} className="fill-brand-200" />
              {d.won > 0 && <rect x={x} y={H - wonH} width={bar} height={wonH} rx={2} className="fill-success-600" />}
            </g>
          );
        })}
        <line x1={0} x2={W} y1={H} y2={H} className="stroke-border-strong" />
        <text x={0} y={H + 14} className="fill-ink-subtle text-[10px]">
          {daily[0]!.date}
        </text>
        <text x={W} y={H + 14} textAnchor="end" className="fill-ink-subtle text-[10px]">
          {daily[daily.length - 1]!.date}
        </text>
      </svg>
      <p className="mt-2 flex gap-4 text-xs text-ink-subtle">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-brand-200" aria-hidden /> Enquiries
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-success-600" aria-hidden /> Of those, won
        </span>
      </p>
    </Card>
  );
}

export function ReportsView() {
  const { get, set } = useUrlParams();
  const today = todayIst();
  const def = presetRange(30, today);
  const from = get('from') || def.from;
  const to = get('to') || def.to;
  const preset = matchPreset(from, to, today);
  const bad = from > to;

  const q = useQuery({
    queryKey: ['admin', 'reports', { from, to }],
    queryFn: () => adminReportsApi.get({ from, to }),
    enabled: !bad,
    placeholderData: (prev) => prev,
  });
  const d = q.data;
  const r = d?.report;
  const received = r?.funnel[0]?.count ?? 0;

  return (
    <>
      <PageHeader title="Reports" description="How enquiries turn into deals, and how each person is doing. Based on enquiries that arrived in the window." />

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-3">
        <div role="group" aria-label="Quick ranges" className="flex gap-1">
          {PRESETS.map((p) => (
            <Button
              key={p.days}
              size="sm"
              variant={preset === p.days ? 'primary' : 'outline'}
              aria-pressed={preset === p.days}
              onClick={() => set({ from: null, to: null, ...(p.days === 30 ? {} : presetRange(p.days, today)) })}
            >
              {p.label}
            </Button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          From
          <Input type="date" aria-label="From date" className="w-40" value={from} max={to} onChange={(e) => e.target.value && set({ from: e.target.value })} />
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          To
          <Input type="date" aria-label="To date" className="w-40" value={to} min={from} max={today} onChange={(e) => e.target.value && set({ to: e.target.value })} />
        </label>
        {d && <p className="ml-auto text-sm text-ink-muted">{d.days} {d.days === 1 ? 'day' : 'days'}</p>}
      </div>

      {bad ? (
        <div className="mt-6">
          <EmptyState title="The end date is before the start date" description="Change one of the dates to see the report." />
        </div>
      ) : q.isError ? (
        <div className="mt-6">
          <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
        </div>
      ) : q.isLoading || !d || !r ? (
        <div className="mt-6 space-y-4" aria-busy="true" aria-label="Loading report">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      ) : received === 0 ? (
        <div className="mt-6">
          <EmptyState icon={Inbox} title="No enquiries in this window" description="Try a longer range." />
        </div>
      ) : (
        <>
          <ul className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Headline numbers">
            <li>
              <KpiCard label="Enquiries" value={received.toLocaleString('en-IN')} icon={Inbox} tone="brand" hint={`${r.spam} spam, ${r.lost} lost`} />
            </li>
            <li>
              <KpiCard
                label="Answered"
                value={`${percent(r.funnel[1]!.count, received)}%`}
                icon={MessageCircle}
                tone="brand"
                hint={`${r.funnel[1]!.count.toLocaleString('en-IN')} of ${received.toLocaleString('en-IN')}`}
              />
            </li>
            <li>
              <KpiCard
                label="Median first response"
                value={r.medianResponseMinutes === null ? '—' : formatDuration(r.medianResponseMinutes)}
                icon={Timer}
                tone="brand"
              />
            </li>
            <li>
              <KpiCard
                label="Deals won"
                value={r.funnel[3]!.count.toLocaleString('en-IN')}
                icon={Trophy}
                tone="success"
                hint={`${percent(r.funnel[3]!.count, received)}% of enquiries`}
              />
            </li>
          </ul>

          <Section title="From enquiry to deal" description="Each step counts the same enquiries, so the bars can only shrink.">
            <Card className="p-5">
              <ol className="space-y-4">
                {r.funnel.map((s, i) => {
                  const share = percent(s.count, received) ?? 0;
                  const prev = i === 0 ? null : r.funnel[i - 1]!.count;
                  return (
                    <li key={s.key}>
                      <div className="mb-1 flex items-baseline justify-between text-sm">
                        <span className="font-medium text-ink">{s.label}</span>
                        <span className="tabular-nums text-ink-muted">
                          {s.count.toLocaleString('en-IN')} <span className="text-ink-subtle">({share}%)</span>
                          {prev !== null && prev > s.count && <span className="ml-2 text-xs text-ink-subtle">{(prev - s.count).toLocaleString('en-IN')} dropped off</span>}
                        </span>
                      </div>
                      <div className="h-3 overflow-hidden rounded-full bg-surface-sunken" aria-hidden>
                        <div className={cn('h-full rounded-full', s.key === 'won' ? 'bg-success-600' : 'bg-brand-600')} style={{ width: `${share}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ol>
            </Card>
          </Section>

          <Section title="Enquiries per day">
            <DailyChart daily={r.daily} />
          </Section>

          <Section
            title="By person"
            description="Enquiries that arrived in the window, grouped by who holds them now."
            actions={
              <CsvButton
                filename={`agents-${d.from}-to-${d.to}.csv`}
                headers={['Person', 'Received', 'Answered', 'Still waiting', 'Median first response (min)', 'Won', 'Win rate %']}
                rows={r.agents.map((a) => [a.name, a.received, a.responded, a.waiting, a.medianResponseMinutes, a.won, a.winRatePercent])}
              />
            }
          >
            <div className="overflow-x-auto rounded-xl border border-border bg-surface">
              <table className="w-full min-w-[640px] text-left text-sm">
                <caption className="sr-only">Results by person</caption>
                <thead className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-ink-subtle">
                  <tr>
                    {['Person', 'Received', 'Answered', 'Waiting', 'Median response', 'Won', 'Win rate'].map((h, i) => (
                      <th key={h} scope="col" className={cn('px-4 py-3 font-semibold', i > 0 && 'text-right')}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {r.agents.map((a) => (
                    <tr key={a.userId ?? 'none'} className="hover:bg-surface-muted">
                      <th scope="row" className={cn('px-4 py-3 font-medium', a.userId ? 'text-ink' : 'text-ink-subtle')}>
                        {a.name}
                      </th>
                      <td className="px-4 py-3 text-right tabular-nums">{a.received}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{a.responded}</td>
                      <td className={cn('px-4 py-3 text-right tabular-nums', a.waiting > 0 && 'font-semibold text-danger-700')}>{a.waiting}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{a.medianResponseMinutes === null ? '—' : formatDuration(a.medianResponseMinutes)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{a.won}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{a.winRatePercent === null ? '—' : `${a.winRatePercent}%`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Where enquiries come from">
            <Card className="p-5">
              <ul className="space-y-2 text-sm">
                {r.sources.map((s) => (
                  <li key={s.source} className="flex items-center justify-between">
                    <span className="text-ink">{humanize(s.source)}</span>
                    <span className="tabular-nums text-ink-muted">
                      {s.count.toLocaleString('en-IN')} ({percent(s.count, received)}%)
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          </Section>
        </>
      )}

      {!bad && d?.fees && (
        <Section
          title="Fees by month"
          description="Deals grouped by the month they closed, which can differ from when the enquiry arrived."
          actions={
            <CsvButton
              filename={`fees-${d.from}-to-${d.to}.csv`}
              headers={['Month', 'Deals', 'Rent won (per month)', 'Sales won', 'Fees earned', 'Deals without a fee']}
              rows={d.fees.months.map((m) => [m.month, m.deals, m.rentMonthly, m.saleValue, m.fees, m.dealsWithoutFee])}
            />
          }
        >
          {d.fees.months.length === 0 ? (
            <EmptyState title="No deals closed in this window" />
          ) : (
            <>
              {d.fees.totals.dealsWithoutFee > 0 && (
                <Alert tone="warning" className="mb-3">
                  {d.fees.totals.dealsWithoutFee} won {d.fees.totals.dealsWithoutFee === 1 ? 'deal has' : 'deals have'} no fee because no fee rule applied. Set one under Fees.
                </Alert>
              )}
              <div className="overflow-x-auto rounded-xl border border-border bg-surface">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <caption className="sr-only">Fees by month</caption>
                  <thead className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-ink-subtle">
                    <tr>
                      {['Month', 'Deals', 'Rent won (per month)', 'Sales won', 'Fees earned'].map((h, i) => (
                        <th key={h} scope="col" className={cn('px-4 py-3 font-semibold', i > 0 && 'text-right')}>
                          {h}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {d.fees.months.map((m) => (
                      <tr key={m.month} className="hover:bg-surface-muted">
                        <th scope="row" className="px-4 py-3 font-medium text-ink">{monthLabel(m.month)}</th>
                        <td className="px-4 py-3 text-right tabular-nums">{m.deals}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatINR(m.rentMonthly)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatINR(m.saleValue)}</td>
                        <td className="px-4 py-3 text-right font-medium tabular-nums">{formatINR(m.fees)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t border-border-strong bg-surface-muted font-semibold">
                    <tr>
                      <th scope="row" className="px-4 py-3">Total</th>
                      <td className="px-4 py-3 text-right tabular-nums">{d.fees.totals.deals}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatINR(d.fees.totals.rentMonthly)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatINR(d.fees.totals.saleValue)}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{formatINR(d.fees.totals.fees)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </>
          )}
        </Section>
      )}
    </>
  );
}
