'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Info } from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui/button';
import { Alert, Badge, Card, ErrorState, Skeleton } from '@/components/ui/feedback';
import { discoverApi } from '@/lib/api/endpoints';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { useMe } from '@/lib/auth/use-auth';
import { searchLinks } from '@/lib/discover/engine';
import type { DiscoverStoredResult, OwnerReadiness, ReadinessBand } from '@/lib/discover/types';

const BAND_TONE: Record<ReadinessBand, 'danger' | 'warning' | 'brand' | 'success'> = {
  NEEDS_PREPARATION: 'danger',
  ALMOST_READY: 'warning',
  READY_FOR_REVIEW: 'brand',
  COMPLETE_FOR_REVIEW: 'success',
};

export function ResultView({ token }: { token: string }) {
  const result = useQuery({
    queryKey: ['discover', 'result', token],
    queryFn: () => discoverApi.result(token),
    retry: (count, err) => !(err instanceof ApiError && err.status === 404) && count < 2,
  });

  if (result.isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-72" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (result.error instanceof ApiError && result.error.status === 404) {
    return (
      <ErrorState
        title="We could not find this result"
        message="The link may be incomplete, or the result was deleted. You can take the assessment again."
      />
    );
  }
  if (result.isError || !result.data) {
    return <ErrorState message={errorMessage(result.error)} onRetry={() => result.refetch()} />;
  }

  const r = result.data;
  return (
    <div className="space-y-8">
      <header>
        <p className="text-sm font-semibold text-brand-600">Your result</p>
        <h1 className="mt-1 text-3xl font-bold tracking-tight">{r.title}</h1>
      </header>

      {r.readiness && <Readiness readiness={r.readiness} />}

      <Card className="p-6">
        <h2 className="text-lg font-semibold">
          {r.slug === 'customer' ? 'Your Home Preference Profile' : r.slug === 'agent' ? 'Your service profile' : 'What you told us'}
        </h2>
        <p className="mt-1 text-sm text-ink-muted">
          {r.slug === 'agent' ? 'Self-reported by you. Not verified.' : 'Based on your answers.'}
        </p>
        <dl className="mt-4 divide-y divide-border">
          {r.summary.map((line) => (
            <div key={line.question} className="grid gap-1 py-3 sm:grid-cols-[2fr_3fr] sm:gap-4">
              <dt className="text-sm text-ink-muted">{line.question}</dt>
              <dd className="text-sm font-medium text-ink">{line.answer}</dd>
            </div>
          ))}
        </dl>
      </Card>

      {r.slug === 'customer' && r.preferences && <CustomerNextSteps result={r} />}
      {r.slug === 'owner' && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold">Ready to go ahead?</h2>
          <p className="mt-1 text-sm text-ink-muted">
            Submit the property for review. Our team checks every listing before it is published.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <ButtonLink href="/list-property?mode=self">List it yourself</ButtonLink>
            <ButtonLink href="/list-property" variant="outline">
              Ask our team to help
            </ButtonLink>
          </div>
        </Card>
      )}
      {r.slug === 'agent' && (
        <Card className="p-6">
          <h2 className="text-lg font-semibold">What happens next</h2>
          <p className="mt-1 text-sm text-ink-muted">
            This profile is not linked to an agent account and is not used to rank anyone. Actual performance is measured
            separately from real platform activity.
          </p>
        </Card>
      )}

      <p className="flex items-start gap-2 rounded-lg bg-surface-muted p-3 text-sm text-ink-muted">
        <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>{r.disclaimer}</span>
      </p>

      <SaveAndPrivacy token={token} result={r} />
    </div>
  );
}

function Readiness({ readiness }: { readiness: OwnerReadiness }) {
  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-center gap-4">
        <div
          className="flex h-24 w-24 flex-col items-center justify-center rounded-full border-4 border-brand-600"
          role="img"
          aria-label={`Preparation score ${readiness.score} out of 100`}
        >
          <span className="text-3xl font-bold text-ink">{readiness.score}</span>
          <span className="text-xs text-ink-muted">of 100</span>
        </div>
        <div>
          <Badge tone={BAND_TONE[readiness.band]}>{readiness.bandLabel}</Badge>
          <h2 className="mt-2 text-lg font-semibold">Listing preparation score</h2>
          <p className="text-sm text-ink-muted">How ready your details are to submit. It does not verify the property.</p>
        </div>
      </div>

      <ul className="mt-6 space-y-3" aria-label="Score breakdown">
        {readiness.factors.map((f) => (
          <li key={f.key}>
            <div className="flex justify-between text-sm">
              <span className="text-ink">{f.label}</span>
              <span className="text-ink-muted">
                {f.points} / {f.max}
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-sunken" aria-hidden>
              <div className="h-full rounded-full bg-brand-600" style={{ width: `${(f.points / f.max) * 100}%` }} />
            </div>
          </li>
        ))}
      </ul>

      {readiness.nextSteps.length > 0 ? (
        <div className="mt-6">
          <h3 className="font-semibold">What to do next</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-ink-muted">
            {readiness.nextSteps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="mt-6 flex items-center gap-2 text-sm text-success-600">
          <CheckCircle2 className="h-4 w-4" aria-hidden /> Everything we ask for is ready.
        </p>
      )}
    </Card>
  );
}

function CustomerNextSteps({ result }: { result: DiscoverStoredResult }) {
  const links = result.preferences ? searchLinks(result.preferences, result.localities) : [];
  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold">Find homes that fit</h2>
      <p className="mt-1 text-sm text-ink-muted">
        We apply your location, budget, property type and bedrooms to our listings. Other preferences, such as metro
        access, are not filters yet, so check them on each listing.
      </p>
      <div className="mt-4 flex flex-wrap gap-3">
        {links.map((l, i) => (
          <ButtonLink key={l.intent} href={l.href} variant={i === 0 ? 'primary' : 'outline'}>
            {l.label}
          </ButtonLink>
        ))}
      </div>
    </Card>
  );
}

function SaveAndPrivacy({ token, result }: { token: string; result: DiscoverStoredResult }) {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const claim = useMutation({
    mutationFn: () => discoverApi.claim(token),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['discover', 'result', token] }),
  });
  const remove = useMutation({
    mutationFn: () => discoverApi.deleteMine(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['discover'] }),
  });
  const next = encodeURIComponent(`/discover/result/${token}`);

  return (
    <Card className="p-6">
      <h2 className="text-lg font-semibold">Keep this result</h2>
      {result.saved ? (
        <p role="status" className="mt-1 flex items-center gap-2 text-sm text-success-600">
          <CheckCircle2 className="h-4 w-4" aria-hidden /> Saved to your account.{' '}
          {result.slug === 'customer' && 'Your preferences are available when you search.'}
        </p>
      ) : (
        <>
          <p className="mt-1 text-sm text-ink-muted">
            This result is private to anyone who has this link. Bookmark it, or save it to an account. Saving is
            optional.
          </p>
          {claim.isError && (
            <Alert tone="error" className="mt-3">
              {errorMessage(claim.error)}
            </Alert>
          )}
          <div className="mt-4">
            {me ? (
              <Button type="button" loading={claim.isPending} onClick={() => claim.mutate()}>
                Save to my account
              </Button>
            ) : (
              <ButtonLink href={`/login?next=${next}`} variant="outline">
                Sign in to save
              </ButtonLink>
            )}
          </div>
        </>
      )}
      {result.saved && me && (
        <div className="mt-4">
          {remove.isError && (
            <Alert tone="error" className="mb-3">
              {errorMessage(remove.error)}
            </Alert>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            loading={remove.isPending}
            onClick={() => {
              if (window.confirm('Delete everything you saved from Discover? This cannot be undone.')) remove.mutate();
            }}
          >
            Delete my saved Discover data
          </Button>
        </div>
      )}
      <p className="mt-4 text-xs text-ink-subtle">
        <Link href="/discover" className="underline">Take another assessment</Link>.
      </p>
    </Card>
  );
}
