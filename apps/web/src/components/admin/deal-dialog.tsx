'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Alert } from '@/components/ui/feedback';
import { Field, Input, fieldAria } from '@/components/ui/form-controls';
import { applyApiError } from '@/lib/forms';
import { formatINR } from '@/lib/format';
import { createDealSchema, istToday, type DealOutput, type DealValues } from '@/lib/schemas/deal';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Rental deals record the monthly rent; sales record the price. */
  intent: 'RENT' | 'BUY' | null;
  /** Day the enquiry arrived (YYYY-MM-DD): the earliest allowed closing day. */
  enquiredOn: string;
  initial?: { amount: number | null; closedOn: string | null };
  /** Editing an existing deal rather than marking a lead won. */
  editing?: boolean;
  onSubmit: (values: DealOutput) => Promise<void>;
};

export function DealDialog({ open, onOpenChange, intent, enquiredOn, initial, editing = false, onSubmit }: Props) {
  const [formError, setFormError] = React.useState<string | null>(null);
  const schema = React.useMemo(() => createDealSchema(enquiredOn), [enquiredOn]);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<DealValues, unknown, DealOutput>({
    resolver: zodResolver(schema),
    defaultValues: { amount: '', closedOn: istToday() },
  });

  // Re-seed whenever the dialog opens so a cancelled attempt never leaks into the next one.
  React.useEffect(() => {
    if (open) {
      setFormError(null);
      reset({
        amount: initial?.amount ? String(initial.amount) : '',
        closedOn: initial?.closedOn ?? istToday(),
      });
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const amountLabel = intent === 'RENT' ? 'Monthly rent agreed (₹)' : intent === 'BUY' ? 'Sale price agreed (₹)' : 'Deal value agreed (₹)';
  const err = (n: keyof DealValues) => errors[n]?.message as string | undefined;

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await onSubmit(values);
    } catch (e) {
      setFormError(applyApiError(e, setError, ['amount', 'closedOn']));
    }
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        title={editing ? 'Edit deal' : 'Mark lead as won'}
        description="Record what was agreed so we can measure how well the pilot is working."
      >
        <form onSubmit={submit} method="post" noValidate className="space-y-4">
          {formError && <Alert tone="error">{formError}</Alert>}
          <Field label={amountLabel} htmlFor="deal-amount" error={err('amount')} required>
            <Input
              inputMode="numeric"
              autoComplete="off"
              placeholder={intent === 'RENT' ? 'e.g. 25,000' : 'e.g. 85,00,000'}
              {...fieldAria('deal-amount', err('amount'))}
              {...register('amount')}
            />
          </Field>
          <Field label="Closing date" htmlFor="deal-date" error={err('closedOn')} required>
            <Input type="date" max={istToday()} min={enquiredOn} {...fieldAria('deal-date', err('closedOn'))} {...register('closedOn')} />
          </Field>
          {initial?.amount ? <p className="text-xs text-ink-subtle">Currently {formatINR(initial.amount)}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting}>
              {editing ? 'Save deal' : 'Mark as won'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
