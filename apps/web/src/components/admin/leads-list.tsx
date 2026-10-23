'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { PageHeader } from '@/components/admin/page-header';
import { DataTable } from '@/components/admin/data-table';
import { ExportButton } from '@/components/admin/export-button';
import { FilterBar, SearchBox } from '@/components/admin/filter-bar';
import { PersonCell } from '@/components/admin/person-cell';
import { ResponseBadge } from '@/components/admin/response-badge';
import { Select } from '@/components/ui/form-controls';
import { Pagination } from '@/components/ui/pagination';
import { LeadStatusBadge } from '@/components/ui/status-badge';
import { adminLeadsApi } from '@/lib/api/endpoints';
import { errorMessage } from '@/lib/api/errors';
import type { AdminLead } from '@/lib/api/types';
import { isAdmin, useMe } from '@/lib/auth/use-auth';
import { formatDateTime, formatPhone, humanize } from '@/lib/format';
import { LEAD_STATUSES } from '@/lib/leads';
import { useUrlParams } from '@/lib/use-url-params';

const PAGE_SIZE = 20;

export function LeadsList() {
  const router = useRouter();
  const { data: me } = useMe();
  const { get, set, page } = useUrlParams();
  const status = get('status');
  const assignee = get('assigned');
  const mine = assignee === 'me';
  const overdue = get('overdue') === 'true';
  const q = get('q');

  const fetchLeads = (p: number) =>
    adminLeadsApi.list({
      status,
      q: q || undefined,
      assignedTo: mine ? me?.id : assignee || undefined,
      overdue: overdue ? 'true' : undefined,
      page: p,
      pageSize: PAGE_SIZE,
    });

  const query = useQuery({
    queryKey: ['admin', 'leads', { status, assignee, overdue, q, page, me: me?.id }],
    queryFn: () => fetchLeads(page),
    enabled: !mine || !!me,
    placeholderData: (prev) => prev,
  });

  const columns = React.useMemo<ColumnDef<AdminLead>[]>(
    () => [
      { header: 'Received', cell: ({ row }) => <span className="whitespace-nowrap">{formatDateTime(row.original.createdAt)}</span> },
      {
        header: 'Contact',
        cell: ({ row: { original: l } }) => (
          <PersonCell name={l.name} sub={formatPhone(l.phone)} href={`/admin/leads/${l.id}`} />
        ),
      },
      {
        header: 'Listing',
        cell: ({ row: { original: l } }) =>
          l.listing ? <span className="line-clamp-1 max-w-xs">{l.listing.title}</span> : <span className="text-ink-subtle">—</span>,
      },
      { header: 'Status', cell: ({ row }) => <LeadStatusBadge status={row.original.status} /> },
      { header: 'Response', cell: ({ row }) => <ResponseBadge lead={row.original} /> },
      {
        header: 'Assigned to',
        cell: ({ row: { original: l } }) => l.assignee?.name ?? <span className="text-ink-subtle">Unassigned</span>,
      },
    ],
    [],
  );

  const meta = query.data?.meta;
  const filtered = !!(status || assignee || overdue || q);

  return (
    <>
      <PageHeader
        title="Leads"
        description={isAdmin(me) ? 'Every enquiry from the public site.' : 'Enquiries assigned to you.'}
      />

      <FilterBar
        summary={meta ? `${meta.total.toLocaleString('en-IN')} ${meta.total === 1 ? 'lead' : 'leads'}` : undefined}
        onClear={filtered ? () => set({ status: null, q: null, overdue: null, assigned: null }) : undefined}
        actions={
          <ExportButton
            filename={`leads-${new Date().toISOString().slice(0, 10)}.csv`}
            headers={['Received', 'Name', 'Phone', 'Email', 'Status', 'Source', 'Listing', 'Assigned to', 'First response (min)']}
            toRow={(l: AdminLead) => [
              l.createdAt,
              l.name,
              l.phone,
              l.email,
              humanize(l.status),
              humanize(l.source),
              l.listing?.title,
              l.assignee?.name,
              l.responseMinutes,
            ]}
            fetchPage={fetchLeads}
            disabled={!meta || meta.total === 0}
          />
        }
      >
        <SearchBox label="Search leads" placeholder="Name, phone or email" value={q} onCommit={(v) => set({ q: v })} />
        <div className="w-44">
          <Select aria-label="Filter by status" value={status} onChange={(e) => set({ status: e.target.value })}>
            <option value="">All statuses</option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </Select>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-brand-600"
            checked={overdue}
            onChange={(e) => set({ overdue: e.target.checked ? 'true' : null })}
          />
          Overdue only
        </label>
        {isAdmin(me) && (
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="h-4 w-4 accent-brand-600"
              checked={mine}
              onChange={(e) => set({ assigned: e.target.checked ? 'me' : null })}
            />
            Assigned to me
          </label>
        )}
      </FilterBar>

      <DataTable
        caption="Leads"
        columns={columns}
        data={query.data?.data}
        loading={query.isLoading}
        error={query.isError ? errorMessage(query.error) : null}
        onRetry={() => query.refetch()}
        getRowId={(l) => l.id}
        onRowClick={(l) => router.push(`/admin/leads/${l.id}`)}
        emptyTitle={filtered ? 'No leads match these filters' : 'No leads yet'}
        emptyDescription={
          filtered ? 'Try clearing a filter.' : 'Enquiries from the public site will appear here as soon as they arrive.'
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
