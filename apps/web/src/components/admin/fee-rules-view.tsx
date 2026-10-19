'use client';

import * as React from 'react';
import { notFound } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PageHeader } from '@/components/admin/page-header';
import { Button } from '@/components/ui/button';
import { Alert, Card, ErrorState, Skeleton } from '@/components/ui/feedback';
import { Field, Input, Select, fieldAria } from '@/components/ui/form-controls';
import { useToast } from '@/components/ui/toast';
import { adminFeeRulesApi } from '@/lib/api/endpoints';
import { errorMessage } from '@/lib/api/errors';
import { isAdmin, useMe } from '@/lib/auth/use-auth';
import type { FeeRule, Intent } from '@/lib/api/types';
import { formatDateTime, formatINR } from '@/lib/format';
import {
  computeFee,
  describeRule,
  parseFeeRuleForm,
  ruleToForm,
  type FeeRuleFormErrors,
  type FeeRuleFormValues,
} from '@/lib/fees';

const COPY: Record<Intent, { title: string; basis: string; example: number; exampleLabel: string }> = {
  RENT: { title: 'Rentals', basis: 'the monthly rent', example: 30_000, exampleLabel: 'a rental at ₹30,000 a month' },
  BUY: { title: 'Sales', basis: 'the sale price', example: 8_000_000, exampleLabel: 'a sale at ₹80,00,000' },
};

function RuleCard({ intent, rule }: { intent: Intent; rule: FeeRule | undefined }) {
  const qc = useQueryClient();
  const toast = useToast();
  const copy = COPY[intent];
  const [values, setValues] = React.useState<FeeRuleFormValues>(() => ruleToForm(rule));
  const [errors, setErrors] = React.useState<FeeRuleFormErrors>({});
  const [formError, setFormError] = React.useState<string | null>(null);

  // Pick up the saved rule when it first loads or changes elsewhere, without clobbering unsaved typing mid-edit.
  const savedKey = rule ? `${rule.method}|${rule.value}|${rule.minFee}|${rule.maxFee}|${rule.updatedAt}` : 'none';
  React.useEffect(() => {
    setValues(ruleToForm(rule));
    setErrors({});
  }, [savedKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: (body: Parameters<typeof adminFeeRulesApi.set>[1]) => adminFeeRulesApi.set(intent, body),
    onSuccess: async () => {
      setFormError(null);
      toast.success(`${copy.title} fee saved`);
      await qc.invalidateQueries({ queryKey: ['admin', 'fee-rules'] });
    },
    onError: (e) => setFormError(errorMessage(e)),
  });

  const parsed = parseFeeRuleForm(values);
  const example = parsed.ok ? computeFee(parsed.data, copy.example) : null;
  const set = <K extends keyof FeeRuleFormValues>(key: K, v: FeeRuleFormValues[K]) => {
    setValues((prev) => ({ ...prev, [key]: v }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  };
  const id = (n: string) => `fee-${intent.toLowerCase()}-${n}`;

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const result = parseFeeRuleForm(values);
    if (!result.ok) {
      setErrors(result.errors);
      return;
    }
    setFormError(null);
    save.mutate(result.data);
  };

  return (
    <Card className="p-5" role="region" aria-labelledby={id('heading')}>
      <h2 id={id('heading')} className="text-base font-semibold">
        {copy.title}
      </h2>
      <p className="mt-1 text-sm text-ink-muted">
        {rule ? (
          <>
            Current rule: <strong>{describeRule(intent, rule)}</strong>. Saved {formatDateTime(rule.updatedAt)}.
          </>
        ) : (
          'No rule yet. Won deals will show no fee until you set one.'
        )}
      </p>

      <form onSubmit={onSubmit} noValidate className="mt-4 space-y-4">
        {formError && <Alert tone="error">{formError}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="How the fee is worked out" htmlFor={id('method')}>
            <Select
              id={id('method')}
              value={values.method}
              onChange={(e) => set('method', e.target.value as FeeRuleFormValues['method'])}
            >
              <option value="PERCENT">A percentage of {copy.basis}</option>
              <option value="FIXED">A fixed amount per deal</option>
            </Select>
          </Field>
          <Field
            label={values.method === 'PERCENT' ? 'Percentage' : 'Amount (₹)'}
            htmlFor={id('value')}
            error={errors.value}
            hint={values.method === 'PERCENT' && intent === 'RENT' ? '50 means half a month of rent.' : undefined}
            required
          >
            <Input
              inputMode="decimal"
              autoComplete="off"
              {...fieldAria(id('value'), errors.value, 'x')}
              value={values.value}
              onChange={(e) => set('value', e.target.value)}
            />
          </Field>
          <Field label="Minimum fee (₹, optional)" htmlFor={id('min')} error={errors.minFee}>
            <Input
              inputMode="numeric"
              autoComplete="off"
              {...fieldAria(id('min'), errors.minFee)}
              value={values.minFee}
              onChange={(e) => set('minFee', e.target.value)}
            />
          </Field>
          <Field label="Maximum fee (₹, optional)" htmlFor={id('max')} error={errors.maxFee}>
            <Input
              inputMode="numeric"
              autoComplete="off"
              {...fieldAria(id('max'), errors.maxFee)}
              value={values.maxFee}
              onChange={(e) => set('maxFee', e.target.value)}
            />
          </Field>
        </div>

        <p className="text-sm text-ink-muted" aria-live="polite">
          {example !== null ? (
            <>
              Example: {copy.exampleLabel} earns <strong>{formatINR(example)}</strong>.
            </>
          ) : (
            'Fill in the fee to see an example.'
          )}
        </p>

        <Button type="submit" loading={save.isPending}>
          Save {copy.title.toLowerCase()} fee
        </Button>
      </form>
    </Card>
  );
}

export function FeeRulesView() {
  const { data: me } = useMe();
  // The API already refuses non-admins (403); this also keeps the page itself from appearing to them.
  if (me && !isAdmin(me)) notFound();
  const q = useQuery({ queryKey: ['admin', 'fee-rules'], queryFn: adminFeeRulesApi.list, enabled: !!me });

  return (
    <>
      <PageHeader
        title="Fees"
        description="What NCR Homes earns from the owner when a deal closes. Changes apply to deals recorded from now on; past deals keep the fee they were given."
      />
      {q.isError ? (
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      ) : q.isPending ? (
        <div className="space-y-4" aria-busy="true">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <RuleCard intent="RENT" rule={q.data?.find((r) => r.intent === 'RENT')} />
          <RuleCard intent="BUY" rule={q.data?.find((r) => r.intent === 'BUY')} />
        </div>
      )}
    </>
  );
}
