'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Heart, Inbox } from 'lucide-react';
import { z } from 'zod';
import { ListingGrid } from '@/components/listing/listing-card';
import { Button, ButtonLink } from '@/components/ui/button';
import { Alert, Card, EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { Field, Input, fieldAria } from '@/components/ui/form-controls';
import { LeadStatusBadge } from '@/components/ui/status-badge';
import { Pagination } from '@/components/ui/pagination';
import { useToast } from '@/components/ui/toast';
import { meApi, savedApi } from '@/lib/api/endpoints';
import { errorMessage } from '@/lib/api/errors';
import { ME_KEY, useMe } from '@/lib/auth/use-auth';
import { applyApiError } from '@/lib/forms';
import { formatDateTime, formatPhone } from '@/lib/format';
import { listingPath } from '@/lib/routes';
import { phoneField } from '@/lib/schemas/auth';
import { cn } from '@/lib/utils';

const TABS = [
  { href: '/account', label: 'Profile' },
  { href: '/account/enquiries', label: 'My enquiries' },
  { href: '/account/saved', label: 'Saved homes' },
];

export function AccountNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Account" className="mb-8 flex gap-1 overflow-x-auto border-b border-border">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href}
            aria-current={active ? 'page' : undefined}
            className={cn(
              '-mb-px whitespace-nowrap border-b-2 px-4 py-3 text-sm font-medium',
              active ? 'border-brand-600 text-brand-700' : 'border-transparent text-ink-muted hover:text-ink',
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

const profileSchema = z.object({
  name: z.string().trim().min(1, 'Enter your name').max(80),
  phone: phoneField,
});
type ProfileValues = z.input<typeof profileSchema>;
type ProfileOutput = z.output<typeof profileSchema>;

export function ProfileView() {
  const { data: me } = useMe();
  const qc = useQueryClient();
  const toast = useToast();
  const [formError, setFormError] = React.useState<string | null>(null);
  const {
    register,
    handleSubmit,
    setError,
    reset,
    formState: { errors, isSubmitting, isDirty },
  } = useForm<ProfileValues, unknown, ProfileOutput>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: me?.name ?? '', phone: me ? me.phone.replace(/^\+91/, '') : '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const user = await meApi.update(values);
      qc.setQueryData(ME_KEY, user);
      reset({ name: user.name, phone: user.phone.replace(/^\+91/, '') });
      toast.success('Profile updated');
    } catch (e) {
      setFormError(applyApiError(e, setError, ['name', 'phone']));
    }
  });

  if (!me) return null;
  return (
    <div className="max-w-lg space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Hello, {me.name.split(' ')[0]}</h1>
        <p className="mt-1 text-sm text-ink-muted">Keep your details up to date so we can reach you.</p>
      </div>
      <Card className="p-5">
        <form onSubmit={onSubmit} method="post" noValidate className="space-y-4">
          {formError && <Alert tone="error">{formError}</Alert>}
          <Field label="Email" htmlFor="profile-email" hint="Your sign-in email cannot be changed here.">
            <Input id="profile-email" value={me.email} readOnly disabled aria-describedby="profile-email-hint" />
          </Field>
          <Field label="Full name" htmlFor="profile-name" error={errors.name?.message} required>
            <Input autoComplete="name" {...fieldAria('profile-name', errors.name?.message)} {...register('name')} />
          </Field>
          <Field
            label="Mobile number"
            htmlFor="profile-phone"
            error={errors.phone?.message}
            hint={`Currently ${formatPhone(me.phone)}`}
            required
          >
            <Input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              {...fieldAria('profile-phone', errors.phone?.message, 'x')}
              {...register('phone')}
            />
          </Field>
          <Button type="submit" loading={isSubmitting} disabled={!isDirty}>
            Save changes
          </Button>
        </form>
      </Card>
    </div>
  );
}

export function EnquiriesView() {
  const [page, setPage] = React.useState(1);
  const q = useQuery({
    queryKey: ['me', 'leads', page],
    queryFn: () => meApi.leads({ page, pageSize: 10 }),
    placeholderData: (prev) => prev,
  });

  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  if (q.isLoading)
    return (
      <div className="space-y-3" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  const rows = q.data?.data ?? [];

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">My enquiries</h1>
      {rows.length === 0 ? (
        <EmptyState
          icon={Inbox}
          title="No enquiries yet"
          description="When you ask about a home while signed in, it shows up here so you can follow its progress."
          action={<ButtonLink href="/search">Browse homes</ButtonLink>}
        />
      ) : (
        <ul className="space-y-3" aria-label="Enquiries">
          {rows.map((l) => (
            <li key={l.id}>
              <Card className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    {l.listing ? (
                      <Link
                        href={listingPath({
                          intent: l.listing.intent,
                          slug: l.listing.slug,
                          // The customer endpoint does not return city/locality; the canonical redirect fixes the rest.
                          city: { slug: '_' },
                          locality: { slug: '_' },
                        })}
                        className="font-medium text-brand-700 hover:underline"
                      >
                        {l.listing.title}
                      </Link>
                    ) : (
                      <span className="font-medium">Listing no longer available</span>
                    )}
                    <p className="text-xs text-ink-subtle">Sent {formatDateTime(l.createdAt)}</p>
                  </div>
                  <LeadStatusBadge status={l.status} />
                </div>
                {l.message && <p className="mt-2 whitespace-pre-line text-sm text-ink-muted">{l.message}</p>}
              </Card>
            </li>
          ))}
        </ul>
      )}
      {q.data && <Pagination page={q.data.meta.page} pageSize={q.data.meta.pageSize} total={q.data.meta.total} onPageChange={setPage} />}
    </div>
  );
}

export function SavedView() {
  const q = useQuery({ queryKey: ['saved', 'list'], queryFn: savedApi.list });
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;
  if (q.isLoading)
    return (
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-64" />
        ))}
      </div>
    );
  const rows = q.data ?? [];
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold tracking-tight">Saved homes</h1>
      {rows.length === 0 ? (
        <EmptyState
          icon={Heart}
          title="Nothing saved yet"
          description="Tap the heart on any home to keep it here. Homes that are taken down disappear from this list."
          action={<ButtonLink href="/search">Browse homes</ButtonLink>}
        />
      ) : (
        <ListingGrid listings={rows} />
      )}
    </div>
  );
}
