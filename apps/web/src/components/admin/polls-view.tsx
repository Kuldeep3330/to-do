'use client';

import * as React from 'react';
import { notFound } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { PageHeader } from '@/components/admin/page-header';
import { Button } from '@/components/ui/button';
import { Alert, Badge, Card, EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { Field, Input, Textarea, fieldAria } from '@/components/ui/form-controls';
import { useToast } from '@/components/ui/toast';
import { adminPollsApi, type PollInput } from '@/lib/api/endpoints';
import { errorDetailMessages, errorMessage } from '@/lib/api/errors';
import { isAdmin, useMe } from '@/lib/auth/use-auth';
import type { AdminPoll } from '@/lib/discover/types';
import { formatDateTime } from '@/lib/format';
import {
  PHASE_LABEL,
  blankPollForm,
  formFromPoll,
  localToIso,
  parseOptions,
  pollFormProblems,
  type PollForm,
} from '@/lib/polls';

const TONE: Record<AdminPoll['phase'], 'neutral' | 'brand' | 'success' | 'warning'> = {
  DRAFT: 'warning',
  SCHEDULED: 'brand',
  OPEN: 'success',
  CLOSED: 'neutral',
  ARCHIVED: 'neutral',
};

const KEY = ['admin', 'community-polls'] as const;

export function PollsView() {
  const { data: me } = useMe();
  // The API already refuses non-admins (403); this also keeps the page itself from appearing to them.
  if (me && !isAdmin(me)) notFound();
  const qc = useQueryClient();
  const toast = useToast();
  const polls = useQuery({ queryKey: KEY, queryFn: adminPollsApi.list, enabled: !!me });
  const [editing, setEditing] = React.useState<AdminPoll | 'new' | null>(null);

  const act = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'publish' | 'close' | 'archive' }) => adminPollsApi[action](id),
    onSuccess: async (_d, v) => {
      toast.success(v.action === 'publish' ? 'Poll published' : v.action === 'close' ? 'Poll closed' : 'Poll archived');
      await qc.invalidateQueries({ queryKey: KEY });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const run = (poll: AdminPoll, action: 'publish' | 'close' | 'archive') => {
    const sure =
      action === 'publish'
        ? null
        : action === 'close'
          ? 'Close this poll now? People will no longer be able to vote. Results stay public.'
          : 'Archive this poll? It disappears from the public page. Votes are kept.';
    if (sure && !window.confirm(sure)) return;
    act.mutate({ id: poll.id, action });
  };

  return (
    <>
      <PageHeader
        title="Community polls"
        description="Short public polls for Community Insights. Visitors vote without an account. Results are public only after enough people have voted, and you never see who voted."
        actions={
          editing === null ? (
            <Button onClick={() => setEditing('new')}>
              <Plus className="h-4 w-4" aria-hidden />
              New poll
            </Button>
          ) : undefined
        }
      />

      {editing !== null && (
        <PollEditor
          key={editing === 'new' ? 'new' : editing.id}
          poll={editing === 'new' ? null : editing}
          onDone={() => setEditing(null)}
        />
      )}

      {polls.isError ? (
        <ErrorState message={errorMessage(polls.error)} onRetry={() => polls.refetch()} />
      ) : polls.isPending ? (
        <div className="space-y-3" aria-busy="true">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-28 w-full" />
        </div>
      ) : polls.data.length === 0 ? (
        <EmptyState title="No polls yet" description="Create the first poll to start collecting community opinions." />
      ) : (
        <ul className="space-y-3">
          {polls.data.map((p) => (
            <li key={p.id}>
              <Card className="p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="text-base font-semibold">{p.question}</h2>
                    <p className="mt-1 text-xs text-ink-subtle">
                      Opens: {p.opensAt ? formatDateTime(p.opensAt) : 'when published'} · Closes:{' '}
                      {p.closesAt ? formatDateTime(p.closesAt) : 'not set'} · {p.total} {p.total === 1 ? 'vote' : 'votes'}
                    </p>
                  </div>
                  <Badge tone={TONE[p.phase]}>{PHASE_LABEL[p.phase]}</Badge>
                </div>
                <ul className="mt-3 grid gap-1 text-sm text-ink-muted sm:grid-cols-2">
                  {p.options.map((o) => (
                    <li key={o.id} className="flex justify-between gap-3">
                      <span>{o.label}</span>
                      <span className="text-ink">{o.count}</span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 flex flex-wrap gap-2">
                  {p.phase !== 'ARCHIVED' && (
                    <Button size="sm" variant="outline" onClick={() => setEditing(p)}>
                      Edit
                    </Button>
                  )}
                  {p.status === 'DRAFT' && (
                    <Button size="sm" loading={act.isPending && act.variables?.id === p.id} onClick={() => run(p, 'publish')}>
                      Publish
                    </Button>
                  )}
                  {p.phase === 'OPEN' && (
                    <Button size="sm" variant="outline" onClick={() => run(p, 'close')}>
                      Close now
                    </Button>
                  )}
                  {p.status !== 'ARCHIVED' && (
                    <Button size="sm" variant="ghost" onClick={() => run(p, 'archive')}>
                      Archive
                    </Button>
                  )}
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function PollEditor({ poll, onDone }: { poll: AdminPoll | null; onDone: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [form, setForm] = React.useState<PollForm>(() => (poll ? formFromPoll(poll) : blankPollForm()));
  const [problems, setProblems] = React.useState<ReturnType<typeof pollFormProblems>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  // Once anyone has voted, the question and options are fixed so earlier votes keep their meaning.
  const locked = (poll?.total ?? 0) > 0;

  const save = useMutation({
    mutationFn: (body: Partial<PollInput>) =>
      poll ? adminPollsApi.update(poll.id, body) : adminPollsApi.create(body as PollInput),
    onSuccess: async () => {
      toast.success(poll ? 'Poll updated' : 'Poll created as a draft');
      await qc.invalidateQueries({ queryKey: KEY });
      onDone();
    },
    onError: (e) => {
      const details = errorDetailMessages(e);
      setFormError(details.length > 0 ? details.join(' ') : errorMessage(e));
    },
  });

  const set = (patch: Partial<PollForm>) => {
    setForm((f) => ({ ...f, ...patch }));
    setProblems({});
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const found = pollFormProblems(form);
    // Locked polls only change dates, so the content checks do not apply.
    if (locked) {
      delete found.question;
      delete found.options;
    }
    if (Object.keys(found).length > 0) return setProblems(found);
    const dates = { opensAt: localToIso(form.opensAt), closesAt: localToIso(form.closesAt) };
    save.mutate(
      locked ? dates : { question: form.question.trim(), options: parseOptions(form.optionsText), ...dates },
    );
  };

  return (
    <Card className="mb-6 p-5">
      <h2 className="text-base font-semibold">{poll ? 'Edit poll' : 'New poll'}</h2>
      {locked && (
        <Alert tone="info" className="mt-3">
          This poll already has votes, so its question and options are locked. You can still change the dates.
        </Alert>
      )}
      {formError && (
        <Alert tone="error" className="mt-3">
          {formError}
        </Alert>
      )}
      <form onSubmit={submit} noValidate className="mt-4 space-y-4">
        <Field label="Question" htmlFor="poll-question" error={problems.question} required>
          <Input
            maxLength={200}
            disabled={locked}
            value={form.question}
            onChange={(e) => set({ question: e.target.value })}
            {...fieldAria('poll-question', problems.question)}
          />
        </Field>
        <Field
          label="Options"
          htmlFor="poll-options"
          error={problems.options}
          hint="One per line. Between 2 and 6."
          required
        >
          <Textarea
            rows={5}
            disabled={locked}
            value={form.optionsText}
            onChange={(e) => set({ optionsText: e.target.value })}
            {...fieldAria('poll-options', problems.options, 'x')}
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Opens (optional)" htmlFor="poll-opens" hint="Leave empty to open as soon as it is published.">
            <Input
              id="poll-opens"
              type="datetime-local"
              value={form.opensAt}
              onChange={(e) => set({ opensAt: e.target.value })}
            />
          </Field>
          <Field label="Closes (optional)" htmlFor="poll-closes" error={problems.closesAt}>
            <Input
              type="datetime-local"
              value={form.closesAt}
              onChange={(e) => set({ closesAt: e.target.value })}
              {...fieldAria('poll-closes', problems.closesAt)}
            />
          </Field>
        </div>
        <div className="flex gap-2">
          <Button type="submit" loading={save.isPending}>
            {poll ? 'Save changes' : 'Create draft'}
          </Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
