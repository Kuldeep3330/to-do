'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ListingForm } from '@/components/forms/listing-form';
import { PropertyForm } from '@/components/forms/property-form';
import { MediaManager } from '@/components/admin/media-manager';
import { PublishPanel } from '@/components/admin/publish-panel';
import { Button, ButtonLink } from '@/components/ui/button';
import { Alert, Card, ErrorState, Skeleton } from '@/components/ui/feedback';
import { meListingsApi } from '@/lib/api/endpoints';
import { errorMessage } from '@/lib/api/errors';
import { useMe } from '@/lib/auth/use-auth';
import { cn } from '@/lib/utils';

const STEPS = [
  { key: 'property', label: 'Home details' },
  { key: 'listing', label: 'Price and description' },
  { key: 'publish', label: 'Photos and publish' },
] as const;

type Step = 0 | 1 | 2;

export function SelfListWizard() {
  const { data: me, isLoading } = useMe();
  const [step, setStep] = React.useState<Step>(0);
  const [propertyId, setPropertyId] = React.useState<string | null>(null);
  const [listingId, setListingId] = React.useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (!me) {
    return (
      <Card className="p-6">
        <h2 className="text-lg font-semibold">Sign in to list it yourself</h2>
        <p className="mt-2 text-sm text-ink-muted">
          Create an account or sign in, then add the home, photos and price. Our team visits within 2 days and pauses
          anything that is not genuine.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <ButtonLink href={`/login?next=${encodeURIComponent('/list-property?mode=self')}`}>Sign in</ButtonLink>
          <ButtonLink href="/register" variant="outline">
            Create an account
          </ButtonLink>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <ol className="flex flex-wrap gap-2" aria-label="Listing steps">
        {STEPS.map((s, i) => (
          <li key={s.key}>
            <span
              className={cn(
                'inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-medium',
                i === step
                  ? 'border-brand-600 bg-brand-50 text-brand-700'
                  : i < step
                    ? 'border-success-600 bg-surface text-ink'
                    : 'border-border text-ink-muted',
              )}
            >
              <span className="tabular-nums">{i + 1}</span>
              {s.label}
            </span>
          </li>
        ))}
      </ol>
      <p className="text-sm text-ink-muted">
        It goes live as soon as you publish. A person from our team visits within 2 days. Listings that are not genuine
        are paused.
      </p>
      {step === 0 && (
        <PropertyForm
          scope="me"
          amenitiesSource="public"
          cancelHref="/list-property?mode=self"
          onCreated={(id) => {
            setPropertyId(id);
            setStep(1);
          }}
        />
      )}
      {step === 1 && propertyId && (
        <ListingForm
          scope="me"
          propertyId={propertyId}
          cancelHref="/list-property?mode=self"
          onCreated={(id) => {
            setListingId(id);
            setStep(2);
          }}
        />
      )}
      {step === 2 && listingId && <OwnerPublishStep listingId={listingId} />}
    </div>
  );
}

function OwnerPublishStep({ listingId }: { listingId: string }) {
  const router = useRouter();
  const qc = useQueryClient();
  const key = ['me', 'listings', listingId] as const;
  const { data, error, isLoading, refetch } = useQuery({
    queryKey: key,
    queryFn: () => meListingsApi.get(listingId),
  });

  const refresh = () => qc.invalidateQueries({ queryKey: ['me', 'listings'] });

  if (error) return <ErrorState message={errorMessage(error)} onRetry={() => refetch()} />;
  if (isLoading || !data) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Alert tone="info">
        Add at least one photo, then publish. You can finish later from{' '}
        <Link href="/account/listings" className="font-medium underline">
          My listings
        </Link>
        .
      </Alert>
      <Card className="p-5">
        <h2 className="mb-4 text-base font-semibold">Photos</h2>
        <MediaManager listingId={data.id} media={data.media} status={data.status} onChanged={refresh} scope="me" />
      </Card>
      <PublishPanel listing={data} onChanged={refresh} scope="me" />
      <div className="flex justify-end">
        <Button type="button" variant="outline" onClick={() => router.push('/account/listings')}>
          Go to my listings
        </Button>
      </div>
    </div>
  );
}
