'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { formatDistanceToNowStrict, parseISO } from 'date-fns';
import { CheckCircle2, RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/admin/page-header';
import { Button } from '@/components/ui/button';
import { Badge, Card, EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { adminSystemApi } from '@/lib/api/endpoints';
import { errorMessage } from '@/lib/api/errors';
import type { QualityIssue } from '@/lib/api/types';
import { formatDateTime } from '@/lib/format';
import { qualityItemHref } from '@/lib/system';

const severity = {
  high: { label: 'Fix today', tone: 'danger' },
  medium: { label: 'This week', tone: 'warning' },
  low: { label: 'When you can', tone: 'neutral' },
} as const;

function IssueCard({ issue }: { issue: QualityIssue }) {
  const s = severity[issue.severity];
  const more = issue.count - issue.items.length;
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="font-semibold text-ink">
            {issue.title} <span className="tabular-nums text-ink-muted">({issue.count})</span>
          </h2>
          <p className="mt-1 text-sm text-ink-muted">{issue.advice}</p>
        </div>
        <Badge tone={s.tone}>{s.label}</Badge>
      </div>
      <ul className="mt-3 divide-y divide-border border-t border-border">
        {issue.items.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
            <div className="min-w-0">
              <Link href={qualityItemHref(issue.entity, item.id)} className="block truncate font-medium text-ink hover:text-brand-700">
                {item.label}
              </Link>
              {item.detail && <p className="truncate text-xs text-ink-subtle">{item.detail}</p>}
            </div>
            {item.at && issue.atLabel && (
              <span className="shrink-0 text-xs text-ink-subtle" title={formatDateTime(item.at)}>
                {issue.atLabel} {formatDistanceToNowStrict(parseISO(item.at))} ago
              </span>
            )}
          </li>
        ))}
      </ul>
      {more > 0 && <p className="mt-2 text-xs text-ink-subtle">and {more.toLocaleString('en-IN')} more. These are the oldest.</p>}
    </Card>
  );
}

export function DataQualityView() {
  const q = useQuery({ queryKey: ['admin', 'system', 'data-quality'], queryFn: adminSystemApi.dataQuality, refetchInterval: 60_000 });
  const d = q.data;

  return (
    <>
      <PageHeader
        title="Data quality"
        description="Things that quietly hurt trust or lose enquiries, found by checking the data. Most urgent first."
        actions={
          <Button variant="outline" size="sm" onClick={() => q.refetch()} loading={q.isFetching}>
            <RefreshCw className="h-4 w-4" aria-hidden />
            Check again
          </Button>
        }
      />

      {q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : q.isLoading || !d ? (
        <div className="space-y-4" aria-busy="true" aria-label="Checking the data">
          <Skeleton className="h-40 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
      ) : d.issues.length === 0 ? (
        <EmptyState icon={CheckCircle2} title="Nothing to fix" description="No unowned leads, stale listings or unverified homes right now." />
      ) : (
        <>
          <p role="status" className="mb-4 text-sm text-ink-muted">
            {d.totalIssues.toLocaleString('en-IN')} {d.totalIssues === 1 ? 'thing needs' : 'things need'} attention across {d.issues.length}{' '}
            {d.issues.length === 1 ? 'check' : 'checks'}. Checked {formatDateTime(d.checkedAt)}.
          </p>
          <ul className="space-y-4" aria-label="Issues">
            {d.issues.map((i) => (
              <li key={i.key}>
                <IssueCard issue={i} />
              </li>
            ))}
          </ul>
        </>
      )}
    </>
  );
}
