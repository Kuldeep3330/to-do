'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle2, Info, RefreshCw, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/admin/page-header';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Card, ErrorState, Skeleton } from '@/components/ui/feedback';
import { adminSystemApi } from '@/lib/api/endpoints';
import { errorMessage } from '@/lib/api/errors';
import type { HealthCheck } from '@/lib/api/types';
import { formatDateTime } from '@/lib/format';
import { formatDuration } from '@/lib/leads';
import { formatUptime } from '@/lib/system';

const icons = {
  up: { Icon: CheckCircle2, cls: 'bg-success-50 text-success-600', label: 'Working', tone: 'success' },
  down: { Icon: XCircle, cls: 'bg-danger-50 text-danger-700', label: 'Failing', tone: 'danger' },
  info: { Icon: Info, cls: 'bg-warning-50 text-warning-600', label: 'Check setup', tone: 'warning' },
} as const;

function CheckCard({ check }: { check: HealthCheck }) {
  const { Icon, cls, label, tone } = icons[check.status];
  return (
    <Card className="p-5">
      <div className="flex items-start gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${cls}`}>
          <Icon className="h-[18px] w-[18px]" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-ink">{check.label}</h2>
            <Badge tone={tone}>{label}</Badge>
          </div>
          <p className="mt-1 text-sm text-ink-muted">{check.message}</p>
          {check.latencyMs !== null && <p className="mt-1 text-xs text-ink-subtle">Answered in {check.latencyMs} ms</p>}
        </div>
      </div>
    </Card>
  );
}

export function SystemHealthView() {
  const q = useQuery({ queryKey: ['admin', 'system', 'health'], queryFn: adminSystemApi.health, refetchInterval: 30_000 });
  const d = q.data;

  return (
    <>
      <PageHeader
        title="System health"
        description="Is everything the site depends on working right now. Refreshes every 30 seconds."
        actions={
          <Button variant="outline" size="sm" onClick={() => q.refetch()} loading={q.isFetching}>
            <RefreshCw className="h-4 w-4" aria-hidden />
            Check now
          </Button>
        }
      />

      {q.isError ? (
        // If this page cannot reach the API, that is itself the answer.
        <ErrorState title="The API did not answer" message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : q.isLoading || !d ? (
        <div className="space-y-4" aria-busy="true" aria-label="Checking">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : (
        <>
          <Alert tone={d.status === 'ok' ? 'success' : 'error'} className="mb-6">
            {d.status === 'ok' ? 'Everything is working.' : 'Something is failing. See below.'} Checked {formatDateTime(d.checkedAt)}.
          </Alert>

          <ul className="grid gap-4 sm:grid-cols-2" aria-label="Checks">
            {d.checks.map((c) => (
              <li key={c.key}>
                <CheckCard check={c} />
              </li>
            ))}
          </ul>

          <h2 className="mb-3 mt-8 text-xs font-semibold uppercase tracking-wider text-ink-subtle">Running</h2>
          <Card className="p-5">
            <dl className="grid gap-x-8 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
              <div>
                <dt className="text-ink-muted">Environment</dt>
                <dd className="font-medium capitalize text-ink">{d.environment}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">API running for</dt>
                <dd className="font-medium text-ink">{formatUptime(d.uptimeSeconds)}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Node version</dt>
                <dd className="font-medium text-ink">{d.nodeVersion}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Listings pause after</dt>
                <dd className="font-medium text-ink">
                  {d.settings.listingStaleDays === 0 ? 'Never (switched off)' : `${d.settings.listingStaleDays} days without a confirmation`}
                </dd>
              </div>
              <div>
                <dt className="text-ink-muted">Lead response target</dt>
                <dd className="font-medium text-ink">{formatDuration(d.settings.leadResponseMinutes)}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Rate limiting</dt>
                <dd className="font-medium text-ink">{d.settings.rateLimitEnabled ? 'On' : 'Off'}</dd>
              </div>
            </dl>
          </Card>
        </>
      )}
    </>
  );
}
