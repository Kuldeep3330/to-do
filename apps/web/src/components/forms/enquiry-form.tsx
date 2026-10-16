'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, Textarea, fieldAria } from '@/components/ui/form-controls';
import { Alert } from '@/components/ui/feedback';
import { publicApi } from '@/lib/api/endpoints';
import { applyApiError } from '@/lib/forms';
import { useMe } from '@/lib/auth/use-auth';
import { formatPhone } from '@/lib/format';
import {
  ENQUIRY_FIELDS,
  MESSAGE_MAX,
  enquirySchema,
  type EnquiryOutput,
  type EnquiryValues,
} from '@/lib/schemas/lead';

type Props = {
  listingSlug: string;
  listingTitle: string;
  /** Unique per mounted instance (desktop card vs. mobile sheet) so ids never collide. */
  idPrefix?: string;
  onSent?: () => void;
};

export function EnquiryForm({ listingSlug, listingTitle, idPrefix = 'enq', onSent }: Props) {
  const { data: me } = useMe();
  const [sent, setSent] = React.useState<{ name: string; phone: string } | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    setError,
    setValue,
    getValues,
    watch,
    formState: { errors, isSubmitting, dirtyFields },
  } = useForm<EnquiryValues, unknown, EnquiryOutput>({
    resolver: zodResolver(enquirySchema),
    defaultValues: {
      name: '',
      phone: '',
      email: '',
      message: `Hi, I'm interested in "${listingTitle}". Please get in touch.`,
    },
  });

  // Prefill from the signed-in account, but never overwrite what the visitor already typed.
  React.useEffect(() => {
    if (!me) return;
    if (!dirtyFields.name && !getValues('name')) setValue('name', me.name);
    if (!dirtyFields.phone && !getValues('phone')) setValue('phone', me.phone.replace(/^\+91/, ''));
    if (!dirtyFields.email && !getValues('email')) setValue('email', me.email);
  }, [me]); // eslint-disable-line react-hooks/exhaustive-deps

  const messageLength = (watch('message') ?? '').length;
  const id = (name: string) => `${idPrefix}-${name}`;
  const err = (name: keyof EnquiryValues) => errors[name]?.message as string | undefined;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await publicApi.createLead({ listingSlug, ...values });
      setSent({ name: values.name, phone: values.phone });
      onSent?.();
    } catch (e) {
      setFormError(applyApiError(e, setError, ENQUIRY_FIELDS));
    }
  });

  if (sent) {
    return (
      <div role="status" className="space-y-3 text-center">
        <CheckCircle2 className="mx-auto h-10 w-10 text-success-600" aria-hidden />
        <h3 className="text-lg font-semibold">Thanks, {sent.name.split(' ')[0]}!</h3>
        <p className="text-sm text-ink-muted">
          We have your enquiry for <strong>{listingTitle}</strong>. Our team will call you on{' '}
          <strong>{formatPhone(sent.phone)}</strong>, usually within a few hours.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} method="post" noValidate className="space-y-3">
      {formError && <Alert tone="error">{formError}</Alert>}
      <Field label="Your name" htmlFor={id('name')} error={err('name')} required>
        <Input autoComplete="name" {...fieldAria(id('name'), err('name'))} {...register('name')} />
      </Field>
      <Field label="Mobile number" htmlFor={id('phone')} error={err('phone')} hint="We will call you on this number." required>
        <Input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="98765 43210"
          {...fieldAria(id('phone'), err('phone'), 'x')}
          {...register('phone')}
        />
      </Field>
      <Field label="Email (optional)" htmlFor={id('email')} error={err('email')}>
        <Input type="email" autoComplete="email" {...fieldAria(id('email'), err('email'))} {...register('email')} />
      </Field>
      <Field label="Message (optional)" htmlFor={id('message')} error={err('message')}>
        <Textarea rows={3} {...fieldAria(id('message'), err('message'))} {...register('message')} />
        <p className={`text-right text-xs ${messageLength > MESSAGE_MAX ? 'text-danger-600' : 'text-ink-subtle'}`}>
          {messageLength}/{MESSAGE_MAX}
        </p>
      </Field>
      <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>
        Request a call back
      </Button>
      <p className="text-center text-xs text-ink-subtle">
        By sending this you agree to be contacted about this property.
      </p>
    </form>
  );
}
