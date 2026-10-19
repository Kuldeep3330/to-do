'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Alert } from '@/components/ui/feedback';
import { Field, Input, fieldAria } from '@/components/ui/form-controls';
import type { FeeRule } from '@/lib/api/types';
import { computeFee, describeRule } from '@/lib/fees';
import { applyApiError } from '@/lib/forms';
import { formatINR, parseMoneyInput } from '@/lib/format';
import { createDealSchema, istToday, type DealOutput, type DealValues } from '@/lib/schemas/deal';

export type DealSubmit = DealOutput & {
  /** Set only when staff typed a fee by hand; otherwise the server works it out from the fee rule. */
  feeAmount?: number;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Rental deals record the monthly rent; sales record the price. */
  intent: 'RENT' | 'BUY' | null;
  /** Day the enquiry arrived (YYYY-MM-DD): the earliest allowed closing day. */
  enquiredOn: string;
  initial?: { amount: number | null; closedOn: string | null; fee?: number | null };
  /** Editing an existing deal rather than marking a lead won. */
  editing?: boolean;
  /**
   * Present only for people who may see money (admins). Sales agents get no fee field at all.
   * `rule` is the fee rule for this lead's listing, or undefined when none is set.
   */
  finance?: { rule: FeeRule | undefined };
  onSubmit: (values: DealSubmit) => Promise<void>;
};

export function DealDialog({
  open,
  onOpenChange,
  intent,
  enquiredOn,
  initial,
  editing = false,
  finance,
  onSubmit,
}: Props) {
  const [formError, setFormError] = React.useState<string | null>(null);
  // null means "use the calculated fee"; a string means staff typed their own.
  const [feeText, setFeeText] = React.useState<string | null>(null);
  const [feeError, setFeeError] = React.useState<string | null>(null);
  const schema = React.useMemo(() => createDealSchema(enquiredOn), [enquiredOn]);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<DealValues, unknown, DealOutput>({
    resolver: zodResolver(schema),
    defaultValues: { amount: '', closedOn: istToday() },
  });

  // Re-seed whenever the dialog opens so a cancelled attempt never leaks into the next one.
  React.useEffect(() => {
    if (open) {
      setFormError(null);
      setFeeText(null);
      setFeeError(null);
      reset({
        amount: initial?.amount ? String(initial.amount) : '',
        closedOn: initial?.closedOn ?? istToday(),
      });
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const amountLabel = intent === 'RENT' ? 'Monthly rent agreed (₹)' : intent === 'BUY' ? 'Sale price agreed (₹)' : 'Deal value agreed (₹)';
  const err = (n: keyof DealValues) => errors[n]?.message as string | undefined;

  const typedAmount = parseMoneyInput(watch('amount') ?? '');
  // The fee shown by default: the saved one while the amount is unchanged, otherwise a fresh calculation.
  const calculated =
    typedAmount === null
      ? null
      : editing && initial?.fee != null && typedAmount === initial.amount
        ? initial.fee
        : computeFee(finance?.rule, typedAmount);
  const shownFee = feeText ?? (calculated === null ? '' : String(calculated));

  const submit = handleSubmit(async (values) => {
    setFormError(null);
    setFeeError(null);
    let feeAmount: number | undefined;
    if (finance && feeText !== null && feeText.trim() !== '') {
      const parsed = parseMoneyInput(feeText);
      if (parsed === null) {
        setFeeError('Enter an amount in rupees');
        return;
      }
      feeAmount = parsed;
    }
    try {
      await onSubmit({ ...values, ...(feeAmount !== undefined ? { feeAmount } : {}) });
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

          {finance && (
            <Field
              label="Our fee (₹)"
              htmlFor="deal-fee"
              error={feeError ?? undefined}
              hint={
                finance.rule && intent
                  ? `From the fee rule: ${describeRule(intent, finance.rule)}. Change it to give a discount.`
                  : 'No fee rule is set for this kind of deal, so enter the fee by hand or set a rule under Fees.'
              }
            >
              <Input
                inputMode="numeric"
                autoComplete="off"
                {...fieldAria('deal-fee', feeError ?? undefined, 'x')}
                value={shownFee}
                onChange={(e) => setFeeText(e.target.value)}
              />
            </Field>
          )}

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
