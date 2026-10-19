'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation } from '@tanstack/react-query';
import { BadgeCheck, CheckCircle2, Circle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Alert, Card } from '@/components/ui/feedback';
import { ListingStatusBadge } from '@/components/ui/status-badge';
import { useToast } from '@/components/ui/toast';
import { adminListingsApi } from '@/lib/api/endpoints';
import { errorDetailMessages, errorMessage } from '@/lib/api/errors';
import { formatDate } from '@/lib/format';
import type { AdminListing } from '@/lib/api/types';
import { listingPath } from '@/lib/routes';
import { publishChecklist } from '@/lib/schemas/listing';

type Command = 'publish' | 'pause' | 'close';

const COPY: Record<Command, { title: string; body: string; confirm: string; done: string; danger?: boolean }> = {
  publish: {
    title: 'Publish this listing?',
    body: 'It becomes visible to everyone on the public site.',
    confirm: 'Publish',
    done: 'Listing published',
  },
  pause: {
    title: 'Pause this listing?',
    body: 'It will disappear from the public site until you publish it again.',
    confirm: 'Pause',
    done: 'Listing paused',
  },
  close: {
    title: 'Close this listing?',
    body: 'Closing is final: a closed listing cannot be edited or published again.',
    confirm: 'Close listing',
    done: 'Listing closed',
    danger: true,
  },
};

export function PublishPanel({ listing, onChanged }: { listing: AdminListing; onChanged: () => Promise<unknown> | void }) {
  const toast = useToast();
  const [confirming, setConfirming] = React.useState<Command | null>(null);
  const [problem, setProblem] = React.useState<{ message: string; details: string[] } | null>(null);

  const checks = publishChecklist(listing);
  const ready = checks.every((c) => c.ok);

  const run = useMutation({
    mutationFn: (cmd: Command) => adminListingsApi[cmd](listing.id),
    onSuccess: async (_d, cmd) => {
      setProblem(null);
      setConfirming(null);
      toast.success(COPY[cmd].done);
      await onChanged();
    },
    onError: (e) => {
      setConfirming(null);
      setProblem({ message: errorMessage(e), details: errorDetailMessages(e) });
    },
  });

  const trust = useMutation({
    mutationFn: (kind: 'verify' | 'confirm') => adminListingsApi[kind](listing.id),
    onSuccess: async (_d, kind) => {
      toast.success(kind === 'verify' ? 'Listing marked as verified' : 'Availability confirmed');
      await onChanged();
    },
    onError: (e) => setProblem({ message: errorMessage(e), details: errorDetailMessages(e) }),
  });

  const { status } = listing;
  const canPublish = status === 'DRAFT' || status === 'PAUSED';

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-base font-semibold">Status</h2>
          <ListingStatusBadge status={status} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {status === 'PUBLISHED' && (
            <Link
              href={listingPath(listing)}
              target="_blank"
              className="inline-flex items-center gap-1 text-sm font-medium text-brand-600 hover:underline"
            >
              View public page <ExternalLink className="h-3.5 w-3.5" aria-hidden />
            </Link>
          )}
          {canPublish && (
            <Button onClick={() => setConfirming('publish')} disabled={!ready}>
              Publish
            </Button>
          )}
          {status === 'PUBLISHED' && (
            <Button variant="outline" onClick={() => setConfirming('pause')}>
              Pause
            </Button>
          )}
          {(status === 'PUBLISHED' || status === 'PAUSED') && (
            <Button variant="ghost" onClick={() => setConfirming('close')}>
              Close
            </Button>
          )}
        </div>
      </div>

      {canPublish && (
        <ul className="mt-4 grid gap-1.5 sm:grid-cols-2" aria-label="Publish requirements">
          {checks.map((c) => (
            <li key={c.key} className="flex items-center gap-2 text-sm">
              {c.ok ? (
                <CheckCircle2 className="h-4 w-4 text-success-600" aria-label="Done" />
              ) : (
                <Circle className="h-4 w-4 text-ink-subtle" aria-label="Missing" />
              )}
              <span className={c.ok ? 'text-ink' : 'text-ink-muted'}>{c.label}</span>
            </li>
          ))}
        </ul>
      )}
      {status === 'CLOSED' && <p className="mt-3 text-sm text-ink-muted">This listing is closed and read-only.</p>}

      {status !== 'CLOSED' && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <div className="space-y-0.5 text-sm text-ink-muted">
            <p className="flex items-center gap-1.5">
              <BadgeCheck
                className={listing.verifiedAt ? 'h-4 w-4 text-success-600' : 'h-4 w-4 text-ink-subtle'}
                aria-hidden
              />
              {listing.verifiedAt
                ? `Verified on ${formatDate(listing.verifiedAt)}${listing.verifiedBy ? ` by ${listing.verifiedBy}` : ''}`
                : 'Not verified yet. Verify after a physical visit.'}
            </p>
            <p>
              Last confirmed: {listing.lastConfirmedAt ? formatDate(listing.lastConfirmedAt) : 'never'}. Published
              listings not confirmed within the freshness window are paused automatically.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => trust.mutate('verify')} disabled={trust.isPending}>
              {listing.verifiedAt ? 'Re-verify' : 'Mark verified'}
            </Button>
            {status === 'PUBLISHED' && (
              <Button variant="outline" onClick={() => trust.mutate('confirm')} disabled={trust.isPending}>
                Confirm available
              </Button>
            )}
          </div>
        </div>
      )}

      {problem && (
        <Alert tone="error" className="mt-4" title={problem.message}>
          {problem.details.length > 0 && (
            <ul className="list-disc pl-5">
              {problem.details.map((d) => (
                <li key={d}>{d}</li>
              ))}
            </ul>
          )}
        </Alert>
      )}

      {confirming && (
        <ConfirmDialog
          open
          onOpenChange={(o) => !o && setConfirming(null)}
          title={COPY[confirming].title}
          description={COPY[confirming].body}
          confirmLabel={COPY[confirming].confirm}
          tone={COPY[confirming].danger ? 'danger' : 'primary'}
          loading={run.isPending}
          onConfirm={() => run.mutate(confirming)}
        />
      )}
    </Card>
  );
}
