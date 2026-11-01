'use client';

import * as React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea, fieldAria } from '@/components/ui/form-controls';
import { Alert } from '@/components/ui/feedback';
import { publicApi } from '@/lib/api/endpoints';
import { applyApiError } from '@/lib/forms';
import { formatPhone } from '@/lib/format';
import {
  OWNER_ENQUIRY_FIELDS,
  ownerEnquirySchema,
  type OwnerEnquiryOutput,
  type OwnerEnquiryValues,
} from '@/lib/schemas/owner-enquiry';

export function OwnerEnquiryForm() {
  const [sent, setSent] = React.useState<{ name: string; phone: string } | null>(null);
  const [formError, setFormError] = React.useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<OwnerEnquiryValues, unknown, OwnerEnquiryOutput>({
    resolver: zodResolver(ownerEnquirySchema),
    defaultValues: {
      intent: 'RENT',
      city: '',
      locality: '',
      name: '',
      phone: '',
      email: '',
      message: '',
    },
  });

  const err = (name: keyof OwnerEnquiryValues) => errors[name]?.message as string | undefined;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await publicApi.createOwnerEnquiry(values);
      setSent({ name: values.name, phone: values.phone });
    } catch (e) {
      setFormError(applyApiError(e, setError, OWNER_ENQUIRY_FIELDS));
    }
  });

  if (sent) {
    return (
      <div role="status" className="rounded-2xl border border-border bg-surface p-8 text-center shadow-card">
        <CheckCircle2 className="mx-auto h-10 w-10 text-success-600" aria-hidden />
        <h2 className="mt-3 text-lg font-semibold">Thanks, {sent.name.split(' ')[0]}!</h2>
        <p className="mt-2 text-sm text-ink-muted">
          Our team will call you on <strong>{formatPhone(sent.phone)}</strong> to visit the home and add it to the
          site. We do not publish listings until we have seen them.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} method="post" noValidate className="space-y-4">
      {formError && <Alert tone="error">{formError}</Alert>}
      <Field label="I want to" htmlFor="intent" error={err('intent')} required>
        <Select {...fieldAria('intent', err('intent'))} {...register('intent')}>
          <option value="RENT">Rent out my home</option>
          <option value="BUY">Sell my home</option>
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="City" htmlFor="city" error={err('city')} required>
          <Input placeholder="Noida, Gurugram, Delhi…" {...fieldAria('city', err('city'))} {...register('city')} />
        </Field>
        <Field label="Locality (optional)" htmlFor="locality" error={err('locality')}>
          <Input placeholder="Sector 62" {...fieldAria('locality', err('locality'))} {...register('locality')} />
        </Field>
      </div>
      <Field label="Your name" htmlFor="name" error={err('name')} required>
        <Input autoComplete="name" {...fieldAria('name', err('name'))} {...register('name')} />
      </Field>
      <Field label="Mobile number" htmlFor="phone" error={err('phone')} hint="We will call you on this number." required>
        <Input
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="98765 43210"
          {...fieldAria('phone', err('phone'), 'x')}
          {...register('phone')}
        />
      </Field>
      <Field label="Email (optional)" htmlFor="email" error={err('email')}>
        <Input type="email" autoComplete="email" {...fieldAria('email', err('email'))} {...register('email')} />
      </Field>
      <Field
        label="About the home (optional)"
        htmlFor="message"
        error={err('message')}
        hint="Size, bedrooms, expected rent or price."
      >
        <Textarea rows={4} {...fieldAria('message', err('message'), 'x')} {...register('message')} />
      </Field>
      <Button type="submit" className="w-full" size="lg" loading={isSubmitting}>
        Request a visit from our team
      </Button>
      <p className="text-center text-xs text-ink-subtle">
        By sending this you agree to be contacted about listing your home. We do not publish it until we visit.
      </p>
    </form>
  );
}
