'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Search } from 'lucide-react';
import { PageHeader } from '@/components/admin/page-header';
import { DataTable } from '@/components/admin/data-table';
import { ButtonLink } from '@/components/ui/button';
import { Input, Select } from '@/components/ui/form-controls';
import { Pagination } from '@/components/ui/pagination';
import { ListingStatusBadge } from '@/components/ui/status-badge';
import { adminListingsApi } from '@/lib/api/endpoints';
import { errorMessage } from '@/lib/api/errors';
import type { AdminListing } from '@/lib/api/types';
import { formatDate, formatPrice, humanize } from '@/lib/format';
import { useUrlParams } from '@/lib/use-url-params';

const PAGE_SIZE = 20;

export function ListingsList() {
  const router = useRouter();
  const { get, set, page } = useUrlParams();
  const status = get('status');
  const intent = get('intent');
  const propertyId = get('propertyId');
  const q = get('q');

  const [text, setText] = React.useState(q);
  React.useEffect(() => setText(q), [q]);
  React.useEffect(() => {
    if (text === q) return;
    const t = window.setTimeout(() => set({ q: text.trim().length >= 2 ? text.trim() : null }), 350);
    return () => window.clearTimeout(t);
  }, [text, q, set]);

  const query = useQuery({
    queryKey: ['admin', 'listings', { status, intent, propertyId, q, page }],
    queryFn: () =>
      adminListingsApi.list({
        status,
        intent,
        propertyId,
        q: q || undefined,
        page,
        pageSize: PAGE_SIZE,
      }),
    placeholderData: (prev) => prev,
  });

  const columns = React.useMemo<ColumnDef<AdminListing>[]>(
    () => [
      {
        header: 'Listing',
        cell: ({ row: { original: l } }) => (
          <div>
            <Link href={`/admin/listings/${l.id}`} className="font-medium text-ink hover:text-brand-700">
              {l.title}
            </Link>
            <p className="text-xs text-ink-subtle">{l.property.internalTitle}</p>
          </div>
        ),
      },
      { header: 'For', cell: ({ row }) => (row.original.intent === 'RENT' ? 'Rent' : 'Sale') },
      { header: 'Location', cell: ({ row: { original: l } }) => `${l.locality.name}, ${l.city.name}` },
      { header: 'Price', cell: ({ row: { original: l } }) => formatPrice(l.priceAmount, l.pricePeriod) },
      { header: 'Photos', cell: ({ row }) => row.original.originalCount },
      { header: 'Status', cell: ({ row }) => <ListingStatusBadge status={row.original.status} /> },
      { header: 'Updated', cell: ({ row }) => formatDate(row.original.updatedAt) },
    ],
    [],
  );

  const filtered = !!(status || intent || q || propertyId);
  const meta = query.data?.meta;

  return (
    <>
      <PageHeader
        title="Listings"
        description="What visitors see. Draft first, add photos, then publish."
        actions={
          <ButtonLink href="/admin/listings/new">
            <Plus className="h-4 w-4" aria-hidden />
            New listing
          </ButtonLink>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
          <Input
            aria-label="Search listings"
            placeholder="Search title"
            className="pl-9"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <Select aria-label="Filter by status" value={status} onChange={(e) => set({ status: e.target.value })}>
          <option value="">All statuses</option>
          {['DRAFT', 'PUBLISHED', 'PAUSED', 'CLOSED'].map((s) => (
            <option key={s} value={s}>
              {humanize(s)}
            </option>
          ))}
        </Select>
        <Select aria-label="Filter by type" value={intent} onChange={(e) => set({ intent: e.target.value })}>
          <option value="">Rent and sale</option>
          <option value="RENT">Rent</option>
          <option value="BUY">Sale</option>
        </Select>
      </div>

      <DataTable
        caption="Listings"
        columns={columns}
        data={query.data?.data}
        loading={query.isLoading}
        error={query.isError ? errorMessage(query.error) : null}
        onRetry={() => query.refetch()}
        getRowId={(l) => l.id}
        onRowClick={(l) => router.push(`/admin/listings/${l.id}`)}
        emptyTitle={filtered ? 'No listings match these filters' : 'No listings yet'}
        emptyDescription={filtered ? 'Try clearing a filter.' : 'Create a property first, then add a listing for it.'}
        emptyAction={
          !filtered && (
            <ButtonLink href="/admin/listings/new">
              <Plus className="h-4 w-4" aria-hidden />
              New listing
            </ButtonLink>
          )
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
