'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Button, ButtonLink } from '@/components/ui/button';
import { Checkbox, Field, Input, Select, Textarea, fieldAria } from '@/components/ui/form-controls';
import { Alert, Card } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/toast';
import { PropertyPicker } from '@/components/forms/property-picker';
import { adminListingsApi } from '@/lib/api/endpoints';
import type { AdminListing } from '@/lib/api/types';
import { applyApiError } from '@/lib/forms';
import { formatINRCompact } from '@/lib/format';
import {
  LISTING_FIELDS,
  emptyListingValues,
  listingCreateSchema,
  listingEditSchema,
  listingToEditValues,
  pricePeriodFor,
  type ListingCreateOutput,
  type ListingCreateValues,
  type ListingEditOutput,
  type ListingEditValues,
} from '@/lib/schemas/listing';

type FormValues = ListingCreateValues;
type FormOutput = ListingCreateOutput;

type Props = {
  /** Existing listing → edit mode (intent and property are fixed). */
  listing?: AdminListing;
  /** Prefill when arriving from a property page. */
  propertyId?: string;
};

/** Live "₹45 L" echo so a stray zero is obvious before saving. */
function MoneyPreview({ raw }: { raw: string }) {
  const n = Number(raw.replace(/[₹,\s]/g, ''));
  if (!raw.trim() || !Number.isFinite(n) || n <= 0) return null;
  return <span aria-hidden>{formatINRCompact(n)}</span>;
}

export function ListingForm({ listing, propertyId }: Props) {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [formError, setFormError] = React.useState<string | null>(null);
  const editing = !!listing;

  const {
    register,
    handleSubmit,
    control,
    watch,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<FormValues, unknown, FormOutput>({
    // The edit schema is a subset of the create schema; pick by mode.
    resolver: zodResolver(editing ? (listingEditSchema as unknown as typeof listingCreateSchema) : listingCreateSchema),
    defaultValues: editing
      ? ({ ...emptyListingValues(), ...listingToEditValues(listing) } as FormValues)
      : emptyListingValues(propertyId),
  });

  const intent = editing ? listing.intent : watch('intent');
  const priceRaw = watch('priceAmount');
  const maintenanceRaw = watch('maintenanceAmount');
  const depositRaw = watch('depositAmount');

  React.useEffect(() => {
    if (!isDirty || isSubmitting) return;
    const handler = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty, isSubmitting]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      if (listing) {
        const v = values as unknown as ListingEditOutput;
        await adminListingsApi.update(listing.id, {
          title: v.title,
          description: v.description,
          priceAmount: v.priceAmount,
          maintenanceAmount: v.maintenanceAmount,
          depositAmount: v.depositAmount,
          negotiable: v.negotiable,
          availableFrom: v.availableFrom,
        });
        await qc.invalidateQueries({ queryKey: ['admin', 'listings'] });
        toast.success('Listing updated');
        router.refresh();
      } else {
        const created = await adminListingsApi.create({
          propertyId: values.propertyId,
          intent: values.intent,
          pricePeriod: pricePeriodFor(values.intent),
          title: values.title,
          description: values.description,
          priceAmount: values.priceAmount,
          maintenanceAmount: values.maintenanceAmount,
          depositAmount: values.depositAmount,
          negotiable: values.negotiable,
          availableFrom: values.availableFrom,
        });
        await qc.invalidateQueries({ queryKey: ['admin', 'listings'] });
        toast.success('Draft created. Add photos, then publish.');
        router.push(`/admin/listings/${created.id}`);
      }
    } catch (err) {
      setFormError(applyApiError(err, setError, LISTING_FIELDS));
    }
  });

  const err = (name: keyof FormValues) => errors[name]?.message as string | undefined;

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      {formError && <Alert tone="error">{formError}</Alert>}

      {!editing && (
        <Card className="space-y-4 p-5">
          <h2 className="text-base font-semibold">What are you listing?</h2>
          <Field label="Property" htmlFor="propertyId" error={err('propertyId')} required>
            <Controller
              control={control}
              name="propertyId"
              render={({ field }) => (
                <PropertyPicker id="propertyId" value={field.value} onChange={field.onChange} error={err('propertyId')} />
              )}
            />
          </Field>
          <Field
            label="Listing type"
            htmlFor="intent"
            hint="Cannot be changed later. Rent is priced monthly, sale is a one-time price."
            required
          >
            <Select {...fieldAria('intent', undefined, 'x')} {...register('intent')}>
              <option value="RENT">For rent</option>
              <option value="BUY">For sale</option>
            </Select>
          </Field>
        </Card>
      )}

      <Card className="space-y-4 p-5">
        <h2 className="text-base font-semibold">Public details</h2>
        <Field label="Title" htmlFor="title" error={err('title')} hint="Shown to visitors and used in the page URL." required>
          <Input
            placeholder="Spacious 3 BHK near Metro in Sector 62"
            {...fieldAria('title', err('title'), 'x')}
            {...register('title')}
          />
        </Field>
        <Field label="Description" htmlFor="description" error={err('description')}>
          <Textarea rows={7} {...fieldAria('description', err('description'))} {...register('description')} />
        </Field>
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="text-base font-semibold">Pricing</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={intent === 'RENT' ? 'Monthly rent (₹)' : 'Sale price (₹)'}
            htmlFor="priceAmount"
            error={err('priceAmount')}
          >
            <Input inputMode="numeric" placeholder="e.g. 25000" {...fieldAria('priceAmount', err('priceAmount'))} {...register('priceAmount')} />
            <p className="text-xs font-medium text-brand-700">
              <MoneyPreview raw={priceRaw} />
            </p>
          </Field>
          <Field label="Monthly maintenance (₹)" htmlFor="maintenanceAmount" error={err('maintenanceAmount')}>
            <Input
              inputMode="numeric"
              {...fieldAria('maintenanceAmount', err('maintenanceAmount'))}
              {...register('maintenanceAmount')}
            />
            <p className="text-xs font-medium text-brand-700">
              <MoneyPreview raw={maintenanceRaw} />
            </p>
          </Field>
          {intent === 'RENT' && (
            <Field label="Security deposit (₹)" htmlFor="depositAmount" error={err('depositAmount')}>
              <Input
                inputMode="numeric"
                {...fieldAria('depositAmount', err('depositAmount'))}
                {...register('depositAmount')}
              />
              <p className="text-xs font-medium text-brand-700">
                <MoneyPreview raw={depositRaw} />
              </p>
            </Field>
          )}
          <Field label="Available from" htmlFor="availableFrom" error={err('availableFrom')}>
            <Input type="date" {...fieldAria('availableFrom', err('availableFrom'))} {...register('availableFrom')} />
          </Field>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Checkbox {...register('negotiable')} />
          Price is negotiable
        </label>
      </Card>

      <div className="flex justify-end gap-2">
        <ButtonLink href="/admin/listings" variant="outline">
          Cancel
        </ButtonLink>
        <Button type="submit" loading={isSubmitting}>
          {editing ? 'Save changes' : 'Create draft'}
        </Button>
      </div>
    </form>
  );
}
