'use client';

import * as React from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BarChart3, Lock, Vote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Card, EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { Select } from '@/components/ui/form-controls';
import { communityApi } from '@/lib/api/endpoints';
import { errorMessage } from '@/lib/api/errors';
import { useMe } from '@/lib/auth/use-auth';
import type { PollResults, PublicPoll } from '@/lib/discover/types';
import { formatDate } from '@/lib/format';
import { useCities, useLocalities } from '@/lib/queries';

const POLLS_KEY = ['community', 'polls'] as const;

export function CommunityPolls() {
  const polls = useQuery({ queryKey: POLLS_KEY, queryFn: communityApi.list });

  if (polls.isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }
  if (polls.isError) return <ErrorState message={errorMessage(polls.error)} onRetry={() => polls.refetch()} />;
  if (!polls.data || polls.data.length === 0) {
    return (
      <EmptyState
        icon={Vote}
        title="No polls are open right now"
        description="We publish short polls on what matters when finding a home in Delhi-NCR. Please check back soon."
      />
    );
  }
  return (
    <ul className="space-y-5">
      {polls.data.map((p) => (
        <li key={p.id}>
          <PollCard poll={p} />
        </li>
      ))}
    </ul>
  );
}

function PollCard({ poll }: { poll: PublicPoll }) {
  const qc = useQueryClient();
  const { data: me } = useMe();
  const [choice, setChoice] = React.useState<string>('');
  const [city, setCity] = React.useState('');
  const [area, setArea] = React.useState('');
  const [showInsights, setShowInsights] = React.useState(false);
  const cities = useCities();
  const localities = useLocalities(city || undefined);

  const vote = useMutation({
    mutationFn: () => communityApi.vote(poll.id, { optionId: choice, ...(area ? { localityId: area } : {}) }),
    onSuccess: (updated) => {
      qc.setQueryData<PublicPoll[]>(POLLS_KEY, (old) => old?.map((p) => (p.id === updated.id ? updated : p)));
      void qc.invalidateQueries({ queryKey: ['community', 'insights', poll.id] });
    },
  });

  const canVote = poll.phase === 'OPEN' && poll.votedOptionId === null;
  const legend = `poll-${poll.id}`;

  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h2 id={legend} className="max-w-2xl text-lg font-semibold">
          {poll.question}
        </h2>
        <Badge tone={poll.phase === 'OPEN' ? 'success' : 'neutral'}>{poll.phase === 'OPEN' ? 'Open' : 'Closed'}</Badge>
      </div>
      <p className="mt-1 text-xs text-ink-subtle">
        {poll.opensAt ? `Opened ${formatDate(poll.opensAt)}` : 'Open now'}
        {poll.closesAt ? ` · ${poll.phase === 'OPEN' ? 'Closes' : 'Closed'} ${formatDate(poll.closesAt)}` : ''}
      </p>

      {canVote ? (
        <form
          className="mt-5"
          onSubmit={(e) => {
            e.preventDefault();
            if (choice) vote.mutate();
          }}
        >
          <fieldset>
            <legend className="sr-only">{poll.question}</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {poll.options.map((o) => (
                <label
                  key={o.id}
                  className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm focus-within:ring-2 focus-within:ring-brand-600/40 ${
                    choice === o.id ? 'border-brand-600 bg-brand-50' : 'border-border bg-surface hover:bg-surface-muted'
                  }`}
                >
                  <input
                    type="radio"
                    name={`vote-${poll.id}`}
                    value={o.id}
                    checked={choice === o.id}
                    onChange={() => setChoice(o.id)}
                    className="h-4 w-4 accent-brand-600"
                  />
                  {o.label}
                </label>
              ))}
            </div>
          </fieldset>

          <details className="mt-4 text-sm">
            <summary className="cursor-pointer text-ink-muted">Add your area (optional)</summary>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Select
                aria-label="City"
                value={city}
                onChange={(e) => {
                  setCity(e.target.value);
                  setArea('');
                }}
              >
                <option value="">City</option>
                {(cities.data ?? []).map((c) => (
                  <option key={c.id} value={c.slug}>
                    {c.name}
                  </option>
                ))}
              </Select>
              <Select aria-label="Locality" value={area} disabled={!city} onChange={(e) => setArea(e.target.value)}>
                <option value="">{city ? 'Locality' : 'Choose a city first'}</option>
                {(localities.data ?? []).map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </div>
            <p className="mt-2 text-xs text-ink-subtle">
              Used only for combined area results, shown when enough people in an area have voted.
            </p>
          </details>

          {vote.isError && (
            <Alert tone="error" className="mt-4">
              {errorMessage(vote.error)}
            </Alert>
          )}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={!choice} loading={vote.isPending}>
              Vote
            </Button>
            <p className="text-xs text-ink-subtle">No account needed. One vote per browser; your vote is not shown.</p>
          </div>
        </form>
      ) : (
        <>
          {poll.votedOptionId && (
            <p role="status" className="mt-4 text-sm font-medium text-success-600">
              Thanks, your vote is counted.
            </p>
          )}
          <Results results={poll.results} mine={poll.votedOptionId} />
        </>
      )}

      {canVote && poll.results.visible && (
        <details className="mt-5 text-sm">
          <summary className="cursor-pointer text-ink-muted">See results so far</summary>
          <Results results={poll.results} mine={null} />
        </details>
      )}

      {poll.results.visible && (
        <div className="mt-5 border-t border-border pt-4">
          {me ? (
            <Button type="button" variant="outline" size="sm" onClick={() => setShowInsights((v) => !v)} aria-expanded={showInsights}>
              <BarChart3 className="h-4 w-4" aria-hidden />
              {showInsights ? 'Hide area breakdown' : 'See breakdown by area'}
            </Button>
          ) : (
            <p className="flex items-center gap-2 text-sm text-ink-muted">
              <Lock className="h-4 w-4" aria-hidden />
              <span>
                <Link href={`/login?next=${encodeURIComponent('/discover/community')}`} className="font-medium text-brand-700 underline">
                  Sign in
                </Link>{' '}
                to see how areas compare.
              </span>
            </p>
          )}
          {me && showInsights && <Insights pollId={poll.id} />}
        </div>
      )}
    </Card>
  );
}

function Results({ results, mine }: { results: PollResults; mine: string | null }) {
  if (!results.visible) {
    return (
      <p className="mt-4 rounded-lg bg-surface-muted p-3 text-sm text-ink-muted">
        Results are shown once {results.needed} people have voted, so no one&apos;s answer can be picked out. {results.total}{' '}
        {results.total === 1 ? 'vote' : 'votes'} so far.
      </p>
    );
  }
  return (
    <div className="mt-4">
      <ul className="space-y-3" aria-label="Results">
        {results.options.map((o) => (
          <li key={o.optionId}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className={o.optionId === mine ? 'font-semibold text-ink' : 'text-ink'}>
                {o.label}
                {o.optionId === mine && <span className="ml-2 text-xs font-medium text-brand-700">Your vote</span>}
              </span>
              <span className="shrink-0 text-ink-muted">
                {o.percent}% · {o.count} {o.count === 1 ? 'vote' : 'votes'}
              </span>
            </div>
            <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-sunken" aria-hidden>
              <div className="h-full rounded-full bg-brand-600" style={{ width: `${o.percent}%` }} />
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-3 text-xs text-ink-subtle">
        {results.total} {results.total === 1 ? 'vote' : 'votes'}. Opinions from people who chose to take part, not
        verified market statistics.
      </p>
    </div>
  );
}

function Insights({ pollId }: { pollId: string }) {
  const insights = useQuery({
    queryKey: ['community', 'insights', pollId],
    queryFn: () => communityApi.insights(pollId),
  });
  if (insights.isLoading) return <Skeleton className="mt-4 h-24 w-full" />;
  if (insights.isError) return <Alert tone="error" className="mt-4">{errorMessage(insights.error)}</Alert>;
  const data = insights.data;
  if (!data) return null;
  return (
    <div className="mt-4 space-y-5">
      {data.byArea.length === 0 ? (
        <p className="text-sm text-ink-muted">
          No area has enough votes to show yet. Areas appear once 20 people in them have voted.
        </p>
      ) : (
        data.byArea.map((a) => (
          <div key={a.localityId}>
            <h3 className="text-sm font-semibold">{a.name}</h3>
            <Results results={a.results} mine={null} />
          </div>
        ))
      )}
      {data.areasHeldBack > 0 && (
        <p className="text-xs text-ink-subtle">
          {data.areasHeldBack} {data.areasHeldBack === 1 ? 'area is' : 'areas are'} not shown because too few people there
          have voted.
        </p>
      )}
    </div>
  );
}
