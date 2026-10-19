'use client';

import * as React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Mail, Phone } from 'lucide-react';
import { PageHeader } from '@/components/admin/page-header';
import { DealDialog } from '@/components/admin/deal-dialog';
import { ResponseBadge } from '@/components/admin/response-badge';
import { Button, ButtonLink } from '@/components/ui/button';
import { Card, ErrorState, Skeleton } from '@/components/ui/feedback';
import { Field, Select } from '@/components/ui/form-controls';
import { LeadStatusBadge } from '@/components/ui/status-badge';
import { useToast } from '@/components/ui/toast';
import { adminFeeRulesApi, adminLeadsApi, adminStaffApi } from '@/lib/api/endpoints';
import { ApiError, errorMessage } from '@/lib/api/errors';
import type { AdminLead, LeadStatus } from '@/lib/api/types';
import { isAdmin, useMe } from '@/lib/auth/use-auth';
import { formatDate, formatDateTime, formatINR, formatPhone, humanize } from '@/lib/format';
import { LEAD_STATUSES } from '@/lib/leads';

export function LeadDetail({ id }: { id: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: me } = useMe();
  const canAssign = isAdmin(me);
  const [dealMode, setDealMode] = React.useState<'win' | 'edit' | null>(null);

  const lead = useQuery({ queryKey: ['admin', 'leads', id], queryFn: () => adminLeadsApi.get(id) });
  // Money is admin-only: agents never load fee rules or see a fee field.
  const feeRules = useQuery({
    queryKey: ['admin', 'fee-rules'],
    queryFn: adminFeeRulesApi.list,
    enabled: canAssign,
    staleTime: 60_000,
  });
  const staff = useQuery({
    queryKey: ['admin', 'staff'],
    queryFn: adminStaffApi.assignable,
    enabled: canAssign,
    staleTime: 60_000,
  });

  const update = useMutation({
    mutationFn: (patch: Parameters<typeof adminLeadsApi.update>[1]) => adminLeadsApi.update(id, patch),
    onSuccess: async (data: AdminLead, patch) => {
      qc.setQueryData(['admin', 'leads', id], data);
      await qc.invalidateQueries({ queryKey: ['admin', 'leads'], exact: false });
      toast.success(
        patch.status
          ? `Marked ${humanize(patch.status).toLowerCase()}`
          : patch.closedAmount !== undefined
            ? 'Deal saved'
            : 'Assignment updated',
      );
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (lead.error instanceof ApiError && lead.error.status === 404) notFound();
  if (lead.error) return <ErrorState message={errorMessage(lead.error)} onRetry={() => lead.refetch()} />;
  if (lead.isLoading || !lead.data) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  const l = lead.data;

  return (
    <>
      <PageHeader
        title={l.name}
        description={`Enquiry received ${formatDateTime(l.createdAt)}`}
        breadcrumbs={[{ label: 'Leads', href: '/admin/leads' }, { label: l.name }]}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ResponseBadge lead={l} />
            <LeadStatusBadge status={l.status} />
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <Card className="space-y-4 p-5">
            <h2 className="text-base font-semibold">Contact</h2>
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-ink-subtle">Mobile</dt>
                <dd className="font-medium">{formatPhone(l.phone)}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-subtle">Email</dt>
                <dd className="font-medium">{l.email ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-subtle">Source</dt>
                <dd className="font-medium">{humanize(l.source)}</dd>
              </div>
              <div>
                <dt className="text-xs text-ink-subtle">Last updated</dt>
                <dd className="font-medium">{formatDateTime(l.updatedAt)}</dd>
              </div>
            </dl>
            <div className="flex flex-wrap gap-2">
              <ButtonLink href={`tel:${l.phone}`}>
                <Phone className="h-4 w-4" aria-hidden />
                Call
              </ButtonLink>
              {l.email && (
                <ButtonLink href={`mailto:${l.email}`} variant="outline">
                  <Mail className="h-4 w-4" aria-hidden />
                  Email
                </ButtonLink>
              )}
            </div>
          </Card>

          <Card className="p-5">
            <h2 className="text-base font-semibold">Message</h2>
            {/* Visitor-supplied text: rendered as text only. */}
            <p className="mt-2 whitespace-pre-line text-ink-muted">{l.message || 'No message left.'}</p>
          </Card>

          {l.listing && (
            <Card className="p-5">
              <h2 className="text-base font-semibold">About listing</h2>
              <p className="mt-2 font-medium">{l.listing.title}</p>
              <p className="text-sm text-ink-muted">
                {l.listing.intent === 'RENT' ? 'For rent' : 'For sale'} · {humanize(l.listing.status)}
              </p>
              {isAdmin(me) && (
                <Link href={`/admin/listings/${l.listing.id}`} className="mt-2 inline-block text-sm font-medium text-brand-600 hover:underline">
                  Open listing
                </Link>
              )}
            </Card>
          )}
        </div>

        <Card className="h-fit space-y-4 p-5">
          <h2 className="text-base font-semibold">Follow-up</h2>
          <Field label="Status" htmlFor="lead-status">
            <Select
              id="lead-status"
              value={l.status}
              disabled={update.isPending}
              onChange={(e) => {
                const next = e.target.value as LeadStatus;
                // Winning needs the closing value, so ask for it first instead of sending a request that would fail.
                if (next === 'WON' && l.status !== 'WON') setDealMode('win');
                else update.mutate({ status: next });
              }}
            >
              {LEAD_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {humanize(s)}
                </option>
              ))}
            </Select>
          </Field>
          {canAssign ? (
            <Field label="Assigned to" htmlFor="lead-assignee" hint={staff.isError ? 'Could not load staff.' : undefined}>
              <Select
                id="lead-assignee"
                value={l.assignedToUserId ?? ''}
                disabled={update.isPending || staff.isLoading}
                onChange={(e) => update.mutate({ assignedToUserId: e.target.value || null })}
              >
                <option value="">Unassigned</option>
                {staff.data?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : (
            <div>
              <p className="text-sm font-medium">Assigned to</p>
              <p className="text-sm text-ink-muted">{l.assignee?.name ?? 'Unassigned'}</p>
            </div>
          )}
        </Card>

        {l.status === 'WON' && (
          <Card className="h-fit space-y-3 p-5 lg:col-start-2" aria-labelledby="deal-heading">
            <h2 id="deal-heading" className="text-base font-semibold">
              Deal
            </h2>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-ink-muted">{l.listing?.intent === 'RENT' ? 'Monthly rent agreed' : 'Price agreed'}</dt>
                <dd className="text-lg font-semibold">{l.closedAmount ? formatINR(l.closedAmount) : 'Not recorded'}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Closed on</dt>
                <dd className="font-medium">{l.closedOn ? formatDate(l.closedOn) : 'Not recorded'}</dd>
              </div>
              {l.feeAmount !== undefined && (
                <div>
                  <dt className="text-ink-muted">Our fee</dt>
                  <dd className="font-medium">
                    {l.feeAmount === null ? 'Not calculated (no fee rule applied)' : formatINR(l.feeAmount)}
                  </dd>
                </div>
              )}
            </dl>
            <Button variant="outline" size="sm" onClick={() => setDealMode('edit')}>
              {l.closedAmount ? 'Edit deal' : 'Add deal details'}
            </Button>
          </Card>
        )}
      </div>

      <DealDialog
        open={dealMode !== null}
        onOpenChange={(o) => !o && setDealMode(null)}
        intent={l.listing ? (l.listing.intent === 'RENT' ? 'RENT' : 'BUY') : null}
        enquiredOn={l.createdAt.slice(0, 10)}
        initial={{ amount: l.closedAmount, closedOn: l.closedOn, fee: l.feeAmount }}
        editing={dealMode === 'edit'}
        finance={
          canAssign
            ? { rule: feeRules.data?.find((r) => r.intent === (l.listing?.intent === 'RENT' ? 'RENT' : 'BUY')) }
            : undefined
        }
        onSubmit={async (v) => {
          await update.mutateAsync({
            ...(dealMode === 'win' ? { status: 'WON' as const } : {}),
            closedAmount: v.amount,
            closedOn: v.closedOn,
            ...(v.feeAmount !== undefined ? { feeAmount: v.feeAmount } : {}),
          });
          setDealMode(null);
        }}
      />
    </>
  );
}
