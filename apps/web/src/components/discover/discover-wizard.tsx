'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, ArrowRight, Lock } from 'lucide-react';
import { QuestionField } from '@/components/discover/question-field';
import { Button } from '@/components/ui/button';
import { Alert, ErrorState, Skeleton } from '@/components/ui/feedback';
import { Checkbox } from '@/components/ui/form-controls';
import { discoverApi } from '@/lib/api/endpoints';
import { ApiError, errorMessage } from '@/lib/api/errors';
import { useMe } from '@/lib/auth/use-auth';
import {
  budgetProblem,
  isAnswered,
  missingRequired,
  pruneAnswers,
  visibleQuestions,
} from '@/lib/discover/engine';
import type {
  BudgetAnswer,
  DiscoverAnswers,
  DiscoverDefinition,
  DiscoverQuestion,
  DiscoverSlug,
} from '@/lib/discover/types';

type Pos = { phase: 'core' | 'extra'; i: number } | { phase: 'review' };

export function DiscoverWizard({ slug }: { slug: DiscoverSlug }) {
  const def = useQuery({
    queryKey: ['discover', 'definition', slug],
    queryFn: () => discoverApi.definition(slug),
    staleTime: 60 * 60 * 1000,
  });

  if (def.isLoading) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (def.isError || !def.data) {
    return <ErrorState message={errorMessage(def.error)} onRetry={() => def.refetch()} />;
  }
  return <Wizard def={def.data} slug={slug} />;
}

function Wizard({ def, slug }: { def: DiscoverDefinition; slug: DiscoverSlug }) {
  const router = useRouter();
  const params = useSearchParams();
  const { data: me } = useMe();
  const [answers, setAnswers] = React.useState<DiscoverAnswers>({});
  const [pos, setPos] = React.useState<Pos>({ phase: 'core', i: 0 });
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  // Arriving from "Update my preferences" (?save=1) pre-ticks saving; it is still the person's choice.
  const [save, setSave] = React.useState(params.get('save') === '1');
  const stepRef = React.useRef<HTMLDivElement>(null);
  const started = React.useRef(false);
  const moved = React.useRef(false);

  // Product analytics: one anonymous "started" ping per visit. Failure never blocks the participant.
  React.useEffect(() => {
    if (started.current) return;
    started.current = true;
    discoverApi.start(slug).catch(() => undefined);
  }, [slug]);

  const visible = visibleQuestions(def, answers);
  const core = visible.filter((q) => q.required);
  const extra = visible.filter((q) => !q.required);

  // Keep the position valid when answers change which questions apply.
  const current: Pos =
    pos.phase === 'review'
      ? pos
      : { phase: pos.phase, i: Math.min(pos.i, Math.max((pos.phase === 'core' ? core : extra).length - 1, 0)) };
  const question = current.phase === 'core' ? core[current.i] : current.phase === 'extra' ? extra[current.i] : undefined;

  React.useEffect(() => {
    if (!moved.current) {
      moved.current = true;
      return;
    }
    stepRef.current?.focus();
  }, [current.phase, current.phase === 'review' ? 0 : current.i]);

  const setAnswer = (q: DiscoverQuestion, value: unknown) => {
    setAnswers((prev) => pruneAnswers(def, { ...prev, [q.id]: value }));
    setErrors((prev) => {
      if (!(q.id in prev)) return prev;
      const { [q.id]: _removed, ...rest } = prev;
      void _removed;
      return rest;
    });
  };

  const problemWith = (q: DiscoverQuestion): string | null => {
    const value = answers[q.id];
    if (!isAnswered(q, value)) return q.required ? 'Please choose an answer to continue.' : null;
    return q.type === 'budget' ? budgetProblem(q, value as BudgetAnswer) : null;
  };

  const goNext = () => {
    if (!question || current.phase === 'review') return;
    const problem = problemWith(question);
    if (problem) return setErrors((prev) => ({ ...prev, [question.id]: problem }));
    const list = current.phase === 'core' ? core : extra;
    setPos(current.i + 1 < list.length ? { phase: current.phase, i: current.i + 1 } : { phase: 'review' });
  };

  const goBack = () => {
    if (current.phase === 'review') return setPos({ phase: 'core', i: Math.max(core.length - 1, 0) });
    if (current.i > 0) return setPos({ phase: current.phase, i: current.i - 1 });
    setPos(current.phase === 'extra' ? { phase: 'review' } : current);
  };

  const jumpTo = (q: DiscoverQuestion) => {
    const ci = core.findIndex((x) => x.id === q.id);
    if (ci >= 0) return setPos({ phase: 'core', i: ci });
    setPos({ phase: 'extra', i: Math.max(extra.findIndex((x) => x.id === q.id), 0) });
  };

  const submit = async () => {
    setFormError(null);
    const missing = missingRequired(def, answers);
    if (missing.length > 0) {
      setErrors(Object.fromEntries(missing.map((q) => [q.id, 'Please choose an answer.'])));
      return jumpTo(missing[0]);
    }
    setSubmitting(true);
    try {
      const res = await discoverApi.submit(slug, { answers, ...(save && me ? { saveToAccount: true } : {}) });
      router.push(`/discover/result/${encodeURIComponent(res.resultToken)}`);
    } catch (err) {
      setSubmitting(false);
      if (err instanceof ApiError && err.details.length > 0) {
        setErrors(Object.fromEntries(err.details.map((d) => [d.field, d.message])));
        const first = visible.find((q) => err.details.some((d) => d.field === q.id));
        if (first) jumpTo(first);
      }
      setFormError(errorMessage(err));
    }
  };

  const total = core.length;
  const done = current.phase === 'core' ? current.i : total;
  const percent = Math.round((done / Math.max(total, 1)) * 100);

  return (
    <div>
      <div className="mb-6">
        <div className="flex items-center justify-between text-sm text-ink-muted">
          <span>
            {current.phase === 'core'
              ? `Question ${current.i + 1} of ${total}`
              : current.phase === 'extra'
                ? 'Optional details'
                : 'Review your answers'}
          </span>
          <span>About {def.minutes} min</span>
        </div>
        <div
          role="progressbar"
          aria-label="Progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="mt-2 h-2 overflow-hidden rounded-full bg-surface-sunken"
        >
          <div className="h-full rounded-full bg-brand-600 transition-all" style={{ width: `${percent}%` }} />
        </div>
      </div>

      <div ref={stepRef} tabIndex={-1} className="rounded-2xl border border-border bg-surface p-5 shadow-card outline-none sm:p-8">
        {formError && (
          <Alert tone="error" className="mb-5">
            {formError}
          </Alert>
        )}

        {question && (
          <QuestionField
            key={question.id}
            question={question}
            answers={answers}
            onChange={(v) => setAnswer(question, v)}
            error={errors[question.id]}
          />
        )}

        {current.phase === 'review' && (
          <ReviewStep
            def={def}
            answers={answers}
            errors={errors}
            extraCount={extra.length}
            onEdit={jumpTo}
            onMore={() => setPos({ phase: 'extra', i: 0 })}
          />
        )}

        <div className="mt-8 flex flex-wrap items-center justify-between gap-3">
          <Button
            type="button"
            variant="ghost"
            onClick={goBack}
            disabled={current.phase === 'core' && current.i === 0}
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back
          </Button>

          {current.phase === 'review' ? (
            <div className="flex flex-col items-end gap-3">
              {me && (
                <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-muted">
                  <Checkbox checked={save} onChange={(e) => setSave(e.target.checked)} />
                  Save this to my account
                </label>
              )}
              <Button type="button" size="lg" loading={submitting} onClick={submit}>
                Get my result
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {question && !question.required && isAnswered(question, answers[question.id]) && (
                <Button type="button" variant="ghost" onClick={() => setAnswer(question, undefined)}>
                  Clear answer
                </Button>
              )}
              <Button type="button" onClick={goNext}>
                {question && !question.required && !isAnswered(question, answers[question.id]) ? 'Skip' : 'Next'}
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Button>
            </div>
          )}
        </div>
      </div>

      <p className="mt-4 flex items-start gap-2 text-xs text-ink-subtle">
        <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>
          No account needed. Your answers are not shown publicly and are used only to prepare this result and to improve
          NCR Homes. See our <Link href="/privacy" className="underline">privacy policy</Link>.
        </span>
      </p>
    </div>
  );
}

function describe(q: DiscoverQuestion, value: unknown): string {
  const label = (v: string) => q.options?.find((o) => o.value === v)?.label ?? v;
  switch (q.type) {
    case 'single':
      return label(String(value));
    case 'multi':
      return (value as string[]).map(label).join(', ');
    case 'budget': {
      const b = value as BudgetAnswer;
      return 'customMax' in b ? `Up to ₹${b.customMax.toLocaleString('en-IN')}` : label(b.band);
    }
    case 'locality': {
      const v = value as string[];
      const places = v.filter((x) => x !== 'flexible' && x !== 'other').length;
      const parts = [places > 0 ? `${places} ${places === 1 ? 'locality' : 'localities'}` : null];
      if (v.includes('flexible')) parts.push('Flexible about location');
      if (v.includes('other')) parts.push('Other');
      return parts.filter(Boolean).join(', ');
    }
    case 'location':
      return (value as { address?: string }).address ?? 'Locality selected';
  }
}

function ReviewStep({
  def,
  answers,
  errors,
  extraCount,
  onEdit,
  onMore,
}: {
  def: DiscoverDefinition;
  answers: DiscoverAnswers;
  errors: Record<string, string>;
  extraCount: number;
  onEdit: (q: DiscoverQuestion) => void;
  onMore: () => void;
}) {
  const answered = visibleQuestions(def, answers).filter((q) => isAnswered(q, answers[q.id]));
  const unansweredExtra = visibleQuestions(def, answers).filter((q) => !q.required && !isAnswered(q, answers[q.id])).length;
  return (
    <div>
      <h2 className="text-xl font-semibold text-ink">Check your answers</h2>
      <p className="mt-1 text-sm text-ink-muted">You can change anything before you see your result.</p>
      <dl className="mt-5 divide-y divide-border">
        {answered.map((q) => (
          <div key={q.id} className="py-3">
            <dt className="text-sm text-ink-muted">{q.label}</dt>
            <dd className="mt-0.5 flex items-start justify-between gap-4">
              <div className="min-w-0">
                <span className="text-sm font-medium text-ink">{describe(q, answers[q.id])}</span>
                {errors[q.id] && (
                  <p role="alert" className="mt-1 text-sm text-danger-700">
                    {errors[q.id]}
                  </p>
                )}
              </div>
              <Button type="button" variant="link" size="sm" onClick={() => onEdit(q)} aria-label={`Change answer: ${q.label}`}>
                Change
              </Button>
            </dd>
          </div>
        ))}
      </dl>
      {extraCount > 0 && unansweredExtra > 0 && (
        <div className="mt-6 rounded-xl bg-surface-muted p-4">
          <p className="text-sm text-ink-muted">
            {unansweredExtra} optional {unansweredExtra === 1 ? 'question' : 'questions'} left. Answering them makes your
            summary more useful.
          </p>
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={onMore}>
            Add optional details
          </Button>
        </div>
      )}
    </div>
  );
}
