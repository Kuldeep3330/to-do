'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQueryClient } from '@tanstack/react-query';
import { Button, ButtonLink } from '@/components/ui/button';
import { Checkbox, Field, Input, Select, fieldAria } from '@/components/ui/form-controls';
import { Alert, Card, Skeleton } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/toast';
import { adminPropertiesApi, type PropertyInput } from '@/lib/api/endpoints';
import type { AdminProperty } from '@/lib/api/types';
import { applyApiError } from '@/lib/forms';
import { useAmenities, useCities, useLocalities } from '@/lib/queries';
import {
  PROPERTY_FIELDS,
  emptyPropertyValues,
  propertyFormSchema,
  propertyToFormValues,
  type PropertyFormOutput,
  type PropertyFormValues,
} from '@/lib/schemas/property';

type Props = { property?: AdminProperty };

export function PropertyForm({ property }: Props) {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [formError, setFormError] = React.useState<string | null>(null);

  const cities = useCities();
  const amenities = useAmenities();

  const {
    register,
    handleSubmit,
    control,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<PropertyFormValues, unknown, PropertyFormOutput>({
    resolver: zodResolver(propertyFormSchema),
    defaultValues: property ? propertyToFormValues(property) : emptyPropertyValues(),
  });

  const cityId = watch('cityId');
  const citySlug = cities.data?.find((c) => c.id === cityId)?.slug;
  const localities = useLocalities(citySlug);

  // Warn before leaving with unsaved edits (browser-level navigation only).
  React.useEffect(() => {
    if (!isDirty || isSubmitting) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isDirty, isSubmitting]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    const payload: PropertyInput = { ...values };
    try {
      const saved = property
        ? await adminPropertiesApi.update(property.id, payload)
        : await adminPropertiesApi.create(payload);
      await qc.invalidateQueries({ queryKey: ['admin', 'properties'] });
      toast.success(property ? 'Property updated' : 'Property created');
      router.push(property ? '/admin/properties' : `/admin/properties/${saved.id}`);
      router.refresh();
    } catch (err) {
      setFormError(applyApiError(err, setError, PROPERTY_FIELDS));
    }
  });

  const err = (name: keyof PropertyFormValues) => errors[name]?.message as string | undefined;
  const num = (name: keyof PropertyFormValues, label: string, opts?: { step?: string; hint?: string }) => (
    <Field label={label} htmlFor={name} error={err(name)} hint={opts?.hint}>
      <Input
        inputMode="decimal"
        step={opts?.step}
        {...fieldAria(name, err(name), opts?.hint)}
        {...register(name as 'bedrooms')}
      />
    </Field>
  );

  return (
    <form onSubmit={onSubmit} noValidate className="space-y-6">
      {formError && <Alert tone="error">{formError}</Alert>}

      <Card className="space-y-4 p-5">
        <h2 className="text-base font-semibold">Basics</h2>
        <Field
          label="Internal title"
          htmlFor="internalTitle"
          error={err('internalTitle')}
          hint="Only staff see this. Example: “Tower B 1204, Sector 62”."
          required
        >
          <Input {...fieldAria('internalTitle', err('internalTitle'), 'x')} {...register('internalTitle')} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Type" htmlFor="type" error={err('type')} required>
            <Select {...fieldAria('type', err('type'))} {...register('type')}>
              <option value="RESIDENTIAL">Residential</option>
              <option value="COMMERCIAL">Commercial</option>
              <option value="PLOT">Plot</option>
            </Select>
          </Field>
          <Field label="City" htmlFor="cityId" error={err('cityId')} required>
            <Select
              disabled={cities.isLoading}
              {...fieldAria('cityId', err('cityId'))}
              {...register('cityId', {
                onChange: () => setValue('localityId', '', { shouldDirty: true }),
              })}
            >
              <option value="">Select city</option>
              {cities.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Locality" htmlFor="localityId" error={err('localityId')} required>
            <Select
              disabled={!cityId || localities.isLoading}
              {...fieldAria('localityId', err('localityId'))}
              {...register('localityId')}
            >
              <option value="">{cityId ? 'Select locality' : 'Select a city first'}</option>
              {localities.data?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Society / project name" htmlFor="societyName" error={err('societyName')}>
            <Input {...fieldAria('societyName', err('societyName'))} {...register('societyName')} />
          </Field>
          <Field label="Facing" htmlFor="facing" error={err('facing')}>
            <Input placeholder="e.g. East" {...fieldAria('facing', err('facing'))} {...register('facing')} />
          </Field>
        </div>
        <Field label="Address" htmlFor="addressText" error={err('addressText')} hint="Not shown publicly.">
          <Input {...fieldAria('addressText', err('addressText'), 'x')} {...register('addressText')} />
        </Field>
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="text-base font-semibold">Specifications</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          {num('areaValue', 'Area (sq ft)')}
          {num('bedrooms', 'Bedrooms', { hint: '0 means studio' })}
          {num('bathrooms', 'Bathrooms')}
          {num('balconies', 'Balconies')}
          {num('floor', 'Floor')}
          {num('totalFloors', 'Total floors')}
          {num('ageYears', 'Age (years)')}
          {num('parkingCount', 'Parking spots')}
          <Field label="Furnishing" htmlFor="furnishing" error={err('furnishing')}>
            <Select {...fieldAria('furnishing', err('furnishing'))} {...register('furnishing')}>
              <option value="">Not specified</option>
              <option value="UNFURNISHED">Unfurnished</option>
              <option value="SEMI">Semi-furnished</option>
              <option value="FURNISHED">Furnished</option>
            </Select>
          </Field>
        </div>
      </Card>

      <Card className="space-y-4 p-5">
        <h2 className="text-base font-semibold">Map position</h2>
        <p className="-mt-2 text-sm text-ink-muted">Optional. Enter both values or leave both empty.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          {num('lat', 'Latitude')}
          {num('lng', 'Longitude')}
        </div>
      </Card>

      <Card className="p-5">
        <fieldset>
          <legend className="text-base font-semibold">Amenities</legend>
          {amenities.isLoading ? (
            <div className="mt-3 grid gap-2 sm:grid-cols-3">
              {Array.from({ length: 6 }, (_, i) => (
                <Skeleton key={i} className="h-6" />
              ))}
            </div>
          ) : (
            <Controller
              control={control}
              name="amenityIds"
              render={({ field }) => (
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {amenities.data?.map((a) => {
                    const checked = field.value.includes(a.id);
                    return (
                      <label key={a.id} className="flex cursor-pointer items-center gap-2 text-sm">
                        <Checkbox
                          checked={checked}
                          onChange={() =>
                            field.onChange(checked ? field.value.filter((id) => id !== a.id) : [...field.value, a.id])
                          }
                        />
                        {a.name}
                      </label>
                    );
                  })}
                </div>
              )}
            />
          )}
          {err('amenityIds') && (
            <p role="alert" className="mt-2 text-xs font-medium text-danger-600">
              {err('amenityIds')}
            </p>
          )}
        </fieldset>
      </Card>

      <div className="flex justify-end gap-2">
        <ButtonLink href="/admin/properties" variant="outline">
          Cancel
        </ButtonLink>
        <Button type="submit" loading={isSubmitting}>
          {property ? 'Save changes' : 'Create property'}
        </Button>
      </div>
    </form>
  );
}
