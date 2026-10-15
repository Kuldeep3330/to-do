'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { PageHeader } from '@/components/admin/page-header';
import { DataTable } from '@/components/admin/data-table';
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
  const mine = get('assigned') === 'me';

  const query = useQuery({
    queryKey: ['admin', 'leads', { status, mine, page, me: me?.id }],
    queryFn: () =>
      adminLeadsApi.list({ status, assignedTo: mine ? me?.id : undefined, page, pageSize: PAGE_SIZE }),
    enabled: !mine || !!me,
    placeholderData: (prev) => prev,
  });

  const columns = React.useMemo<ColumnDef<AdminLead>[]>(
    () => [
      { header: 'Received', cell: ({ row }) => <span className="whitespace-nowrap">{formatDateTime(row.original.createdAt)}</span> },
      {
        header: 'Contact',
        cell: ({ row: { original: l } }) => (
          <div>
            <Link href={`/admin/leads/${l.id}`} className="font-medium text-ink hover:text-brand-700">
              {l.name}
            </Link>
            <p className="text-xs text-ink-subtle">{formatPhone(l.phone)}</p>
          </div>
        ),
      },
      {
        header: 'Listing',
        cell: ({ row: { original: l } }) =>
          l.listing ? <span className="line-clamp-1 max-w-xs">{l.listing.title}</span> : <span className="text-ink-subtle">—</span>,
      },
      { header: 'Status', cell: ({ row }) => <LeadStatusBadge status={row.original.status} /> },
      {
        header: 'Assigned to',
        cell: ({ row: { original: l } }) => l.assignee?.name ?? <span className="text-ink-subtle">Unassigned</span>,
      },
    ],
    [],
  );

  const meta = query.data?.meta;
  const filtered = !!(status || mine);

  return (
    <>
      <PageHeader
        title="Leads"
        description={isAdmin(me) ? 'Every enquiry from the public site.' : 'Enquiries assigned to you.'}
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="w-52">
          <Select aria-label="Filter by status" value={status} onChange={(e) => set({ status: e.target.value })}>
            <option value="">All statuses</option>
            {LEAD_STATUSES.map((s) => (
              <option key={s} value={s}>
                {humanize(s)}
              </option>
            ))}
          </Select>
        </div>
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
      </div>

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
