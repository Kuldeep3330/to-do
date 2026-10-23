'use client';

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { ChevronDown, ChevronRight, ScrollText } from 'lucide-react';
import { PageHeader } from '@/components/admin/page-header';
import { Avatar } from '@/components/admin/avatar';
import { ExportButton } from '@/components/admin/export-button';
import { FilterBar } from '@/components/admin/filter-bar';
import { Badge, EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { Input, Select } from '@/components/ui/form-controls';
import { Pagination } from '@/components/ui/pagination';
import { adminAuditApi } from '@/lib/api/endpoints';
import { errorMessage } from '@/lib/api/errors';
import type { AuditEntry } from '@/lib/api/types';
import { actionLabel, actionTone, entityHref, entityLabel } from '@/lib/audit';
import { formatDateTime } from '@/lib/format';
import { useUrlParams } from '@/lib/use-url-params';

const PAGE_SIZE = 24;

function Detail({ entry }: { entry: AuditEntry }) {
  const href = entityHref(entry.entityType, entry.entityId);
  const requestId = typeof entry.metadata.requestId === 'string' ? entry.metadata.requestId : null;
  const { requestId: _omit, ...rest } = entry.metadata;
  void _omit;
  const hasExtra = Object.keys(rest).length > 0;
  return (
    <dl className="grid gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
      <div>
        <dt className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">When</dt>
        <dd>{formatDateTime(entry.createdAt)}</dd>
      </div>
      <div>
        <dt className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Who</dt>
        <dd>{entry.actor ? `${entry.actor.name} (${entry.actor.email})` : 'System or a removed account'}</dd>
      </div>
      <div>
        <dt className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">About</dt>
        <dd className="break-all">
          {entityLabel(entry.entityType)}
          {entry.entityId && (
            <>
              {' '}
              <span className="font-mono text-xs text-ink-subtle">{entry.entityId}</span>
            </>
          )}
          {href && (
            <>
              {' · '}
              <Link href={href} className="font-medium text-brand-700 hover:underline">
                Open
              </Link>
            </>
          )}
        </dd>
      </div>
      {requestId && (
        <div>
          <dt className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Request ID</dt>
          <dd className="break-all font-mono text-xs">{requestId}</dd>
        </div>
      )}
      {hasExtra && (
        <div className="sm:col-span-2">
          <dt className="text-xs font-semibold uppercase tracking-wide text-ink-subtle">Details</dt>
          <dd>
            <pre className="mt-1 max-h-72 overflow-auto rounded-lg bg-surface-sunken p-3 text-xs">
              {JSON.stringify(rest, null, 2)}
            </pre>
          </dd>
        </div>
      )}
    </dl>
  );
}

export function AuditLogView() {
  const { get, set, page } = useUrlParams();
  const action = get('action');
  const entityType = get('entityType');
  const actorId = get('actorId');
  const from = get('from');
  const to = get('to');
  const [open, setOpen] = React.useState<string | null>(null);

  const filters = useQuery({ queryKey: ['admin', 'audit', 'filters'], queryFn: adminAuditApi.filters, staleTime: 60_000 });

  const fetchPage = (p: number) =>
    adminAuditApi.list({
      action: action || undefined,
      entityType: entityType || undefined,
      actorId: actorId || undefined,
      from: from || undefined,
      to: to || undefined,
      page: p,
      pageSize: PAGE_SIZE,
    });

  const query = useQuery({
    queryKey: ['admin', 'audit', { action, entityType, actorId, from, to, page }],
    queryFn: () => fetchPage(page),
    placeholderData: (prev) => prev,
  });

  const meta = query.data?.meta;
  const rows = query.data?.data;
  const filtered = !!(action || entityType || actorId || from || to);
  const badRange = !!(from && to && from > to);

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Who changed what, newest first. Entries cannot be edited or deleted."
      />

      <FilterBar
        summary={meta ? `${meta.total.toLocaleString('en-IN')} ${meta.total === 1 ? 'entry' : 'entries'}` : undefined}
        onClear={filtered ? () => set({ action: null, entityType: null, actorId: null, from: null, to: null }) : undefined}
        actions={
          <ExportButton
            filename={`audit-log-${new Date().toISOString().slice(0, 10)}.csv`}
            headers={['Time', 'Action', 'Thing', 'Thing ID', 'Person', 'Email', 'Details']}
            toRow={(e: AuditEntry) => [
              e.createdAt,
              actionLabel(e.action),
              entityLabel(e.entityType),
              e.entityId,
              e.actor?.name,
              e.actor?.email,
              JSON.stringify(e.metadata),
            ]}
            fetchPage={fetchPage}
            disabled={!meta || meta.total === 0 || badRange}
          />
        }
      >
        <div className="w-48">
          <Select aria-label="Filter by action" value={action} onChange={(e) => set({ action: e.target.value })}>
            <option value="">All actions</option>
            {filters.data?.actions.map((a) => (
              <option key={a} value={a}>
                {actionLabel(a)}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-40">
          <Select aria-label="Filter by thing" value={entityType} onChange={(e) => set({ entityType: e.target.value })}>
            <option value="">Everything</option>
            {filters.data?.entityTypes.map((t) => (
              <option key={t} value={t}>
                {entityLabel(t)}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-48">
          <Select aria-label="Filter by person" value={actorId} onChange={(e) => set({ actorId: e.target.value })}>
            <option value="">Anyone</option>
            {filters.data?.actors.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </Select>
        </div>
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          From
          <Input type="date" aria-label="From date" className="w-40" value={from} max={to || undefined} onChange={(e) => set({ from: e.target.value })} />
        </label>
        <label className="flex items-center gap-2 text-sm text-ink-muted">
          To
          <Input type="date" aria-label="To date" className="w-40" value={to} min={from || undefined} onChange={(e) => set({ to: e.target.value })} />
        </label>
      </FilterBar>

      {badRange ? (
        <EmptyState title="The end date is before the start date" description="Change one of the dates to see entries." />
      ) : query.isError ? (
        <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />
      ) : query.isLoading ? (
        <div className="space-y-2" aria-busy="true" aria-label="Loading audit log">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : !rows || rows.length === 0 ? (
        <EmptyState
          icon={ScrollText}
          title={filtered ? 'No entries match these filters' : 'Nothing has been logged yet'}
          description={filtered ? 'Try clearing a filter.' : 'Changes to listings, leads, staff and fees will appear here.'}
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-surface">
          <table className="w-full min-w-[640px] text-left text-sm">
            <caption className="sr-only">Audit log</caption>
            <thead className="border-b border-border bg-surface-muted text-xs uppercase tracking-wide text-ink-subtle">
              <tr>
                <th scope="col" className="w-10 px-4 py-3">
                  <span className="sr-only">Details</span>
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">When</th>
                <th scope="col" className="px-4 py-3 font-semibold">Action</th>
                <th scope="col" className="px-4 py-3 font-semibold">About</th>
                <th scope="col" className="px-4 py-3 font-semibold">Who</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((e) => {
                const expanded = open === e.id;
                return (
                  <React.Fragment key={e.id}>
                    <tr className="hover:bg-surface-muted">
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          aria-expanded={expanded}
                          aria-controls={`audit-${e.id}`}
                          aria-label={`${expanded ? 'Hide' : 'Show'} details of ${actionLabel(e.action)}`}
                          className="rounded p-1 text-ink-subtle hover:bg-surface-sunken hover:text-ink"
                          onClick={() => setOpen(expanded ? null : e.id)}
                        >
                          {expanded ? <ChevronDown className="h-4 w-4" aria-hidden /> : <ChevronRight className="h-4 w-4" aria-hidden />}
                        </button>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-ink-muted">{formatDateTime(e.createdAt)}</td>
                      <td className="px-4 py-3">
                        <Badge tone={actionTone(e.action)}>{actionLabel(e.action)}</Badge>
                      </td>
                      <td className="px-4 py-3">{entityLabel(e.entityType)}</td>
                      <td className="px-4 py-3">
                        {e.actor ? (
                          <div className="flex items-center gap-2">
                            <Avatar name={e.actor.name} size="sm" />
                            <span className="truncate">{e.actor.name}</span>
                          </div>
                        ) : (
                          <span className="text-ink-subtle">System</span>
                        )}
                      </td>
                    </tr>
                    {expanded && (
                      <tr id={`audit-${e.id}`} className="bg-surface-muted">
                        <td />
                        <td colSpan={4} className="px-4 py-4">
                          <Detail entry={e} />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {meta && !badRange && (
        <Pagination page={meta.page} pageSize={meta.pageSize} total={meta.total} onPageChange={(p) => set({ page: p }, { keepPage: true })} />
      )}
    </>
  );
}
