'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Search } from 'lucide-react';
import { PageHeader } from '@/components/admin/page-header';
import { DataTable } from '@/components/admin/data-table';
import { Button, ButtonLink } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Input, Select } from '@/components/ui/form-controls';
import { Pagination } from '@/components/ui/pagination';
import { PropertyStatusBadge } from '@/components/ui/status-badge';
import { useToast } from '@/components/ui/toast';
import { adminPropertiesApi } from '@/lib/api/endpoints';
import { errorMessage } from '@/lib/api/errors';
import type { AdminProperty } from '@/lib/api/types';
import { formatArea, formatBedrooms, formatDate, humanize } from '@/lib/format';
import { useCities } from '@/lib/queries';
import { useUrlParams } from '@/lib/use-url-params';

const PAGE_SIZE = 20;

export function PropertiesList() {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const { get, set, page } = useUrlParams();
  const status = get('status') || 'ACTIVE';
  const type = get('type');
  const cityId = get('cityId');
  const q = get('q');

  // Local text so typing is instant; URL (and thus the query) updates after a pause.
  const [text, setText] = React.useState(q);
  React.useEffect(() => setText(q), [q]);
  React.useEffect(() => {
    if (text === q) return;
    const t = window.setTimeout(() => set({ q: text.trim().length >= 2 ? text.trim() : null }), 350);
    return () => window.clearTimeout(t);
  }, [text, q, set]);

  const cities = useCities();
  const cityName = React.useMemo(
    () => new Map(cities.data?.map((c) => [c.id, c.name]) ?? []),
    [cities.data],
  );

  const query = useQuery({
    queryKey: ['admin', 'properties', { status, type, cityId, q, page }],
    queryFn: () =>
      adminPropertiesApi.list({ status, type, cityId, q: q || undefined, page, pageSize: PAGE_SIZE }),
    placeholderData: (prev) => prev,
  });

  const [archiving, setArchiving] = React.useState<AdminProperty | null>(null);
  const archive = useMutation({
    mutationFn: (id: string) => adminPropertiesApi.archive(id),
    onSuccess: async () => {
      toast.success('Property archived');
      setArchiving(null);
      await qc.invalidateQueries({ queryKey: ['admin', 'properties'] });
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      setArchiving(null);
    },
  });

  const columns = React.useMemo<ColumnDef<AdminProperty>[]>(
    () => [
      {
        header: 'Property',
        cell: ({ row: { original: p } }) => (
          <div>
            {p.status === 'ACTIVE' ? (
              <Link href={`/admin/properties/${p.id}`} className="font-medium text-ink hover:text-brand-700">
                {p.internalTitle}
              </Link>
            ) : (
              <span className="font-medium text-ink-muted">{p.internalTitle}</span>
            )}
            <p className="text-xs text-ink-subtle">{p.societyName ?? '—'}</p>
          </div>
        ),
      },
      { header: 'Type', cell: ({ row }) => humanize(row.original.type) },
      { header: 'City', cell: ({ row }) => cityName.get(row.original.cityId) ?? '—' },
      {
        header: 'Details',
        cell: ({ row: { original: p } }) =>
          [formatBedrooms(p.bedrooms), formatArea(p.areaValue, p.areaUnit)].filter(Boolean).join(' · ') || '—',
      },
      { header: 'Status', cell: ({ row }) => <PropertyStatusBadge status={row.original.status} /> },
      { header: 'Updated', cell: ({ row }) => formatDate(row.original.updatedAt) },
      {
        id: 'actions',
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row: { original: p } }) => (
          <div className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
            {p.status === 'ACTIVE' && (
              <>
                <ButtonLink href={`/admin/properties/${p.id}`} variant="outline" size="sm">
                  Edit
                </ButtonLink>
                <Button variant="ghost" size="sm" onClick={() => setArchiving(p)}>
                  Archive
                </Button>
              </>
            )}
          </div>
        ),
      },
    ],
    [cityName],
  );

  const meta = query.data?.meta;

  return (
    <>
      <PageHeader
        title="Properties"
        description="The physical units you list. A property can have a sale and a rent listing."
        actions={
          <ButtonLink href="/admin/properties/new">
            <Plus className="h-4 w-4" aria-hidden />
            New property
          </ButtonLink>
        }
      />

      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
          <Input
            aria-label="Search properties"
            placeholder="Search title or society"
            className="pl-9"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <Select aria-label="Filter by status" value={status} onChange={(e) => set({ status: e.target.value })}>
          <option value="ACTIVE">Active</option>
          <option value="ARCHIVED">Archived</option>
        </Select>
        <Select aria-label="Filter by type" value={type} onChange={(e) => set({ type: e.target.value })}>
          <option value="">All types</option>
          <option value="RESIDENTIAL">Residential</option>
          <option value="COMMERCIAL">Commercial</option>
          <option value="PLOT">Plot</option>
        </Select>
        <Select aria-label="Filter by city" value={cityId} onChange={(e) => set({ cityId: e.target.value })}>
          <option value="">All cities</option>
          {cities.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>

      <DataTable
        caption="Properties"
        columns={columns}
        data={query.data?.data}
        loading={query.isLoading}
        error={query.isError ? errorMessage(query.error) : null}
        onRetry={() => query.refetch()}
        getRowId={(p) => p.id}
        onRowClick={(p) => p.status === 'ACTIVE' && router.push(`/admin/properties/${p.id}`)}
        emptyTitle={q || type || cityId ? 'No properties match these filters' : 'No properties yet'}
        emptyDescription={q || type || cityId ? 'Try clearing a filter.' : 'Create your first property to start listing.'}
        emptyAction={
          !(q || type || cityId) && (
            <ButtonLink href="/admin/properties/new">
              <Plus className="h-4 w-4" aria-hidden />
              New property
            </ButtonLink>
          )
        }
      />
      {meta && <Pagination page={meta.page} pageSize={meta.pageSize} total={meta.total} onPageChange={(p) => set({ page: p }, { keepPage: true })} />}

      <ConfirmDialog
        open={!!archiving}
        onOpenChange={(o) => !o && setArchiving(null)}
        title="Archive this property?"
        description={`“${archiving?.internalTitle ?? ""}” will be archived. Properties with live listings cannot be archived; close those listings first.`}
        confirmLabel="Archive"
        tone="danger"
        loading={archive.isPending}
        onConfirm={() => archiving && archive.mutate(archiving.id)}
      />
    </>
  );
}
