'use client';

import * as React from 'react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNowStrict, parseISO } from 'date-fns';
import { AlarmClock, ArrowRight, Inbox, Mail, Phone, Timer, Trophy } from 'lucide-react';
import { Avatar } from '@/components/admin/avatar';
import { KpiCard } from '@/components/admin/kpi-card';
import { PageHeader } from '@/components/admin/page-header';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Alert, Badge, Card, ErrorState, Skeleton } from '@/components/ui/feedback';
import { LeadStatusBadge } from '@/components/ui/status-badge';
import { useToast } from '@/components/ui/toast';
import { adminUsersApi } from '@/lib/api/endpoints';
import { ApiError, errorMessage } from '@/lib/api/errors';
import type { AdminUserDetail } from '@/lib/api/types';
import { useMe } from '@/lib/auth/use-auth';
import { actionLabel, actionTone, entityHref, entityLabel } from '@/lib/audit';
import { formatDate, formatDateTime, formatPhone, humanize } from '@/lib/format';
import { LEAD_STATUSES, formatDuration } from '@/lib/leads';

const statusTone = { ACTIVE: 'success', LOCKED: 'warning', DISABLED: 'danger' } as const;

function ago(iso: string): string {
  return `${formatDistanceToNowStrict(parseISO(iso))} ago`;
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 py-2.5 text-sm">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="text-right font-medium text-ink">{children}</dd>
    </div>
  );
}

export function StaffDetail({ id }: { id: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: me } = useMe();
  const [confirming, setConfirming] = React.useState(false);

  const query = useQuery({ queryKey: ['admin', 'users', id], queryFn: () => adminUsersApi.get(id) });

  const flip = useMutation({
    mutationFn: (u: AdminUserDetail) => adminUsersApi.setStatus(u.id, u.status === 'DISABLED' ? 'ACTIVE' : 'DISABLED'),
    onSuccess: async (u) => {
      toast.success(u.status === 'DISABLED' ? `${u.name} was signed out and disabled` : `${u.name} is active again`);
      setConfirming(false);
      await qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      await qc.invalidateQueries({ queryKey: ['admin', 'staff'] });
    },
    onError: (e) => {
      toast.error(errorMessage(e));
      setConfirming(false);
    },
  });

  if (query.error instanceof ApiError && query.error.status === 404) notFound();
  if (query.isError) return <ErrorState message={errorMessage(query.error)} onRetry={() => query.refetch()} />;
  if (query.isLoading || !query.data) {
    return (
      <div className="space-y-4" aria-busy="true" aria-label="Loading profile">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const u = query.data;
  const isSelf = u.id === me?.id;
  const isSuper = !!me?.roles.includes('SUPER_ADMIN');
  // Same rules the API enforces: no self-service, no super admins, and only a super admin touches an admin.
  const canToggle = !isSelf && !u.roles.includes('SUPER_ADMIN') && (!u.roles.includes('ADMIN') || isSuper);
  const disabling = u.status !== 'DISABLED';
  const isStaff = u.roles.some((r) => ['SALES_AGENT', 'ADMIN', 'SUPER_ADMIN'].includes(r));
  const breakdown = LEAD_STATUSES.filter((s) => (u.leads.byStatus[s] ?? 0) > 0);

  return (
    <>
      <PageHeader
        title={u.name}
        description={u.roles.map(humanize).join(', ')}
        breadcrumbs={[{ label: 'Staff', href: '/admin/users' }, { label: u.name }]}
        actions={
          canToggle ? (
            <Button variant={disabling ? 'outline' : 'primary'} onClick={() => setConfirming(true)}>
              {disabling ? 'Disable account' : 'Enable account'}
            </Button>
          ) : undefined
        }
      />

      {u.status === 'DISABLED' && (
        <Alert tone="error" className="mb-4">
          This account is disabled. They are signed out everywhere and cannot sign in.
        </Alert>
      )}
      {u.lockedUntil && (
        <Alert tone="warning" className="mb-4">
          Locked after too many failed sign-ins until {formatDateTime(u.lockedUntil)}. Enabling the account unlocks it now.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-1">
          <Card className="p-5">
            <div className="mb-4 flex items-center gap-3">
              <Avatar name={u.name} className="h-12 w-12 text-sm" />
              <div className="min-w-0">
                <p className="truncate font-semibold text-ink">{u.name}</p>
                <Badge tone={statusTone[u.status]}>{humanize(u.status)}</Badge>
              </div>
            </div>
            <dl className="divide-y divide-border">
              <Row label="Email">
                <span className="inline-flex items-center gap-1.5 break-all">
                  <Mail className="h-3.5 w-3.5 shrink-0 text-ink-subtle" aria-hidden />
                  {u.email}
                </span>
              </Row>
              <Row label="Mobile">
                <span className="inline-flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5 text-ink-subtle" aria-hidden />
                  {formatPhone(u.phone)}
                </span>
              </Row>
              <Row label="Email verified">{u.emailVerified ? 'Yes' : 'No'}</Row>
              <Row label="Joined">{formatDate(u.createdAt)}</Row>
              <Row label="Last active">{u.lastActiveAt ? ago(u.lastActiveAt) : 'Never'}</Row>
              <Row label="Active sessions">{u.activeSessions}</Row>
              {u.failedLoginCount > 0 && <Row label="Failed sign-ins">{u.failedLoginCount}</Row>}
            </dl>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
          {isStaff && (
            <section aria-labelledby="perf-heading">
              <h2 id="perf-heading" className="mb-3 text-xs font-semibold uppercase tracking-wider text-ink-subtle">
                Assigned leads
              </h2>
              <ul className="grid gap-4 sm:grid-cols-2" aria-label="Lead numbers">
                <li>
                  <KpiCard label="Assigned" value={u.leads.total.toLocaleString('en-IN')} icon={Inbox} href={`/admin/leads?assigned=${u.id}`} tone="brand" />
                </li>
                <li>
                  <KpiCard
                    label="Waiting too long"
                    value={u.leads.overdue.toLocaleString('en-IN')}
                    icon={AlarmClock}
                    tone={u.leads.overdue > 0 ? 'danger' : 'neutral'}
                    hint={`Still new after ${formatDuration(u.leads.responseTargetMinutes)}`}
                  />
                </li>
                <li>
                  <KpiCard label="Won" value={u.leads.won.toLocaleString('en-IN')} icon={Trophy} tone="success" />
                </li>
                <li>
                  <KpiCard
                    label="Median first response"
                    value={u.leads.medianResponseMinutes === null ? '—' : formatDuration(u.leads.medianResponseMinutes)}
                    icon={Timer}
                    tone="brand"
                    hint={`Last 30 days. Target: ${formatDuration(u.leads.responseTargetMinutes)}`}
                  />
                </li>
              </ul>
              {breakdown.length > 0 && (
                <p className="mt-3 flex flex-wrap items-center gap-2 text-sm text-ink-muted">
                  {breakdown.map((s) => (
                    <span key={s} className="inline-flex items-center gap-1.5">
                      <LeadStatusBadge status={s} />
                      <span className="tabular-nums">{u.leads.byStatus[s]}</span>
                    </span>
                  ))}
                </p>
              )}
            </section>
          )}

          <Card className="p-5">
            <h2 className="mb-3 text-sm font-semibold text-ink">Latest leads</h2>
            {u.recentLeads.length === 0 ? (
              <p className="text-sm text-ink-subtle">No leads are assigned to this person.</p>
            ) : (
              <ul className="divide-y divide-border">
                {u.recentLeads.map((l) => (
                  <li key={l.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                    <div className="min-w-0">
                      <Link href={`/admin/leads/${l.id}`} className="block truncate font-medium text-ink hover:text-brand-700">
                        {l.name}
                      </Link>
                      <p className="truncate text-xs text-ink-subtle">
                        {l.listingTitle ?? 'No listing'} · {ago(l.createdAt)}
                      </p>
                    </div>
                    <LeadStatusBadge status={l.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">Recent activity</h2>
              <Link href={`/admin/audit?actorId=${u.id}`} className="inline-flex items-center gap-1 text-sm font-medium text-brand-700 hover:underline">
                Full history
                <ArrowRight className="h-3.5 w-3.5" aria-hidden />
              </Link>
            </div>
            {u.recentActivity.length === 0 ? (
              <p className="text-sm text-ink-subtle">Nothing recorded yet.</p>
            ) : (
              <ul className="divide-y divide-border">
                {u.recentActivity.map((a) => {
                  const href = entityHref(a.entityType, a.entityId);
                  return (
                    <li key={a.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                      <div className="flex min-w-0 items-center gap-2">
                        <Badge tone={actionTone(a.action)}>{actionLabel(a.action)}</Badge>
                        {href ? (
                          <Link href={href} className="truncate text-ink-muted hover:text-brand-700">
                            {entityLabel(a.entityType)}
                          </Link>
                        ) : (
                          <span className="truncate text-ink-muted">{entityLabel(a.entityType)}</span>
                        )}
                      </div>
                      <span className="shrink-0 text-xs text-ink-subtle">{ago(a.createdAt)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title={disabling ? `Disable ${u.name}?` : `Enable ${u.name}?`}
        description={
          disabling
            ? 'They are signed out everywhere immediately and cannot sign in until re-enabled.'
            : 'They will be able to sign in again.'
        }
        confirmLabel={disabling ? 'Disable' : 'Enable'}
        tone={disabling ? 'danger' : 'primary'}
        loading={flip.isPending}
        onConfirm={() => flip.mutate(u)}
      />
    </>
  );
}
