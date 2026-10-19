'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { DataTable } from '@/components/admin/data-table';
import { PageHeader } from '@/components/admin/page-header';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/form-controls';
import { Pagination } from '@/components/ui/pagination';
import { VisitStatusBadge } from '@/components/ui/status-badge';
import { useToast } from '@/components/ui/toast';
import { adminVisitsApi, type VisitCommand } from '@/lib/api/endpoints';
import { errorMessage } from '@/lib/api/errors';
import type { AdminVisit, VisitStatus } from '@/lib/api/types';
import { isAdmin, useMe } from '@/lib/auth/use-auth';
import { formatDate, formatDateTime, formatPhone, humanize } from '@/lib/format';
import { VISIT_SLOTS } from '@/lib/schemas/visit';
import { useUrlParams } from '@/lib/use-url-params';

const PAGE_SIZE = 20;
const STATUSES: VisitStatus[] = ['REQUESTED', 'CONFIRMED', 'COMPLETED', 'NO_SHOW', 'CANCELLED'];

/** Which staff actions make sense from each status. Mirrors the API state machine. */
const ACTIONS: Record<VisitStatus, { command: VisitCommand; label: string; variant: 'primary' | 'outline' | 'ghost' }[]> = {
  REQUESTED: [
    { command: 'confirm', label: 'Confirm', variant: 'primary' },
    { command: 'cancel', label: 'Cancel', variant: 'ghost' },
  ],
  CONFIRMED: [
    { command: 'complete', label: 'Completed', variant: 'primary' },
    { command: 'no-show', label: 'No-show', variant: 'outline' },
    { command: 'cancel', label: 'Cancel', variant: 'ghost' },
  ],
  COMPLETED: [],
  NO_SHOW: [],
  CANCELLED: [],
};

const DONE: Record<VisitCommand, string> = {
  confirm: 'Visit confirmed',
  complete: 'Marked as completed',
  'no-show': 'Marked as no-show',
  cancel: 'Visit cancelled',
};

export function VisitsList() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const { get, set, page } = useUrlParams();
  const status = get('status');

  const query = useQuery({
    queryKey: ['admin', 'visits', { status, page }],
    queryFn: () => adminVisitsApi.list({ status: status || undefined, page, pageSize: PAGE_SIZE }),
    placeholderData: (prev) => prev,
  });

  const act = useMutation({
    mutationFn: ({ id, command }: { id: string; command: VisitCommand }) => adminVisitsApi.act(id, command),
    onSuccess: async (_d, { command }) => {
      toast.success(DONE[command]);
      await qc.invalidateQueries({ queryKey: ['admin', 'visits'] });
      await qc.invalidateQueries({ queryKey: ['admin', 'leads'] });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const columns = React.useMemo<ColumnDef<AdminVisit>[]>(
    () => [
      {
        header: 'When',
        cell: ({ row: { original: v } }) => (
          <div className="whitespace-nowrap">
            <p className="font-medium">{v.preferredDate ? formatDate(v.preferredDate) : 'Any day'}</p>
            <p className="text-xs text-ink-subtle">
              {VISIT_SLOTS.find((s) => s.value === v.preferredSlot)?.label ?? humanize(v.preferredSlot)}
            </p>
          </div>
        ),
      },
      {
        header: 'Customer',
        cell: ({ row: { original: v } }) =>
          v.lead ? (
            <div>
              <Link href={`/admin/leads/${v.lead.id}`} className="font-medium text-ink hover:text-brand-700">
                {v.lead.name}
              </Link>
              <p className="text-xs text-ink-subtle">{formatPhone(v.lead.phone)}</p>
            </div>
          ) : (
            <span className="text-ink-subtle">—</span>
          ),
      },
      {
        header: 'Home',
        cell: ({ row: { original: v } }) => <span className="line-clamp-2 max-w-xs">{v.listing.title}</span>,
      },
      {
        header: 'Assigned to',
        cell: ({ row: { original: v } }) => v.lead?.assignee?.name ?? <span className="text-ink-subtle">Unassigned</span>,
      },
      { header: 'Status', cell: ({ row }) => <VisitStatusBadge status={row.original.status} /> },
      {
        header: 'Requested',
        cell: ({ row }) => <span className="whitespace-nowrap text-xs">{formatDateTime(row.original.createdAt)}</span>,
      },
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row: { original: v } }) => (
          <div className="flex justify-end gap-1">
            {ACTIONS[v.status].map((a) => (
              <Button
                key={a.command}
                size="sm"
                variant={a.variant}
                disabled={act.isPending}
                onClick={() => act.mutate({ id: v.id, command: a.command })}
              >
                {a.label}
              </Button>
            ))}
          </div>
        ),
      },
    ],
    [act],
  );

  const meta = query.data?.meta;

  return (
    <>
      <PageHeader
        title="Visits"
        description={isAdmin(me) ? 'Visit requests from customers, soonest first.' : 'Visit requests on your assigned leads.'}
      />

      <div className="mb-4 w-52">
        <Select aria-label="Filter by status" value={status} onChange={(e) => set({ status: e.target.value })}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </Select>
      </div>

      <DataTable
        caption="Visits"
        columns={columns}
        data={query.data?.data}
        loading={query.isLoading}
        error={query.isError ? errorMessage(query.error) : null}
        onRetry={() => query.refetch()}
        getRowId={(v) => v.id}
        emptyTitle={status ? 'No visits match this filter' : 'No visit requests yet'}
        emptyDescription={
          status ? 'Try clearing the filter.' : 'When a customer asks to see a home, the request will appear here.'
        }
      />
      {meta && (
        <Pagination
          page={meta.page}
          pageSize={meta.pageSize}
          total={meta.total}
          onPageChange={(p) => set({ page: p }, { keepPage: true })}
        />
      )}
    </>
  );
}
