'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { CalendarCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/feedback';
import { Field, Input, Select, Textarea, fieldAria } from '@/components/ui/form-controls';
import { meApi } from '@/lib/api/endpoints';
import { applyApiError } from '@/lib/forms';
import { formatDate } from '@/lib/format';
import {
  MAX_DAYS_AHEAD,
  NOTES_MAX,
  VISIT_SLOTS,
  createVisitSchema,
  istDate,
  type VisitOutput,
  type VisitValues,
} from '@/lib/schemas/visit';

const FIELDS = ['preferredDate', 'preferredSlot', 'notes'] as const;

type Props = {
  listingId: string;
  listingTitle: string;
  /** Unique per mounted instance so ids never collide. */
  idPrefix?: string;
};

export function VisitForm({ listingId, listingTitle, idPrefix = 'visit' }: Props) {
  const qc = useQueryClient();
  const [booked, setBooked] = React.useState<VisitOutput | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);
  const schema = React.useMemo(() => createVisitSchema(), []);

  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<VisitValues, unknown, VisitOutput>({
    resolver: zodResolver(schema),
    defaultValues: { preferredDate: '', preferredSlot: 'ANY', notes: '' },
  });

  const id = (name: string) => `${idPrefix}-${name}`;
  const err = (name: keyof VisitValues) => errors[name]?.message as string | undefined;
  const notesLength = (watch('notes') ?? '').length;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await meApi.requestVisit({ listingId, ...values });
      await qc.invalidateQueries({ queryKey: ['me', 'visits'] });
      setBooked(values);
    } catch (e) {
      setFormError(applyApiError(e, setError, FIELDS));
    }
  });

  if (booked) {
    return (
      <div role="status" className="space-y-3 text-center">
        <CalendarCheck className="mx-auto h-10 w-10 text-success-600" aria-hidden />
        <h3 className="text-lg font-semibold">Visit requested</h3>
        <p className="text-sm text-ink-muted">
          We have your request to see <strong>{listingTitle}</strong>
          {booked.preferredDate ? (
            <>
              {' '}
              on <strong>{formatDate(booked.preferredDate)}</strong>
            </>
          ) : null}
          . Our team will call to confirm a time. You can follow it under My visits in your account.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} method="post" noValidate className="space-y-3">
      {formError && <Alert tone="error">{formError}</Alert>}
      <Field
        label="Preferred date (optional)"
        htmlFor={id('date')}
        error={err('preferredDate')}
        hint={`Within the next ${MAX_DAYS_AHEAD} days. Leave empty if you are flexible.`}
      >
        <Input
          type="date"
          min={istDate(0)}
          max={istDate(MAX_DAYS_AHEAD)}
          {...fieldAria(id('date'), err('preferredDate'), 'x')}
          {...register('preferredDate')}
        />
      </Field>
      <Field label="Preferred time" htmlFor={id('slot')} error={err('preferredSlot')}>
        <Select {...fieldAria(id('slot'), err('preferredSlot'))} {...register('preferredSlot')}>
          {VISIT_SLOTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Anything we should know? (optional)" htmlFor={id('notes')} error={err('notes')}>
        <Textarea rows={3} {...fieldAria(id('notes'), err('notes'))} {...register('notes')} />
        <p className={`text-right text-xs ${notesLength > NOTES_MAX ? 'text-danger-600' : 'text-ink-subtle'}`}>
          {notesLength}/{NOTES_MAX}
        </p>
      </Field>
      <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>
        Request a visit
      </Button>
      <p className="text-center text-xs text-ink-subtle">
        This is a request, not a booking. We will confirm the time with you by phone.
      </p>
    </form>
  );
}
