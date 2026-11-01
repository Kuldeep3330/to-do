'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Compass } from 'lucide-react';
import { Button, ButtonLink } from '@/components/ui/button';
import { Alert, Card, EmptyState, ErrorState, Skeleton } from '@/components/ui/feedback';
import { discoverApi } from '@/lib/api/endpoints';
import { errorMessage } from '@/lib/api/errors';
import { describePreferences, searchLinks } from '@/lib/discover/engine';

export function DiscoverProfileView() {
  const qc = useQueryClient();
  const profile = useQuery({ queryKey: ['discover', 'profile'], queryFn: discoverApi.profile });
  const definition = useQuery({
    queryKey: ['discover', 'definition', 'customer'],
    queryFn: () => discoverApi.definition('customer'),
    staleTime: 60 * 60 * 1000,
  });
  const remove = useMutation({
    mutationFn: () => discoverApi.deleteMine(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['discover'] }),
  });

  if (profile.isLoading || definition.isLoading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (profile.isError || definition.isError || !definition.data) {
    return (
      <ErrorState
        message={errorMessage(profile.error ?? definition.error)}
        onRetry={() => {
          void profile.refetch();
          void definition.refetch();
        }}
      />
    );
  }
  if (!profile.data) {
    return (
      <EmptyState
        icon={Compass}
        title="No saved home preferences"
        description="Answer a few questions and save the result to your account. You can then search with your preferences in one click."
        action={<ButtonLink href="/discover/customer?save=1">Find your home preferences</ButtonLink>}
      />
    );
  }

  const { preferences, localities, updatedAt } = profile.data;
  const lines = describePreferences(definition.data, preferences, localities);
  const links = searchLinks(preferences, localities);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold">Your home preferences</h2>
        <p className="mt-1 text-sm text-ink-muted">
          What you told us, last updated {new Date(updatedAt).toLocaleDateString('en-IN', { dateStyle: 'medium' })}. Only
          you can see this.
        </p>
      </div>

      <Card className="p-6">
        <dl className="divide-y divide-border">
          {lines.map((l) => (
            <div key={l.label} className="grid gap-1 py-3 sm:grid-cols-[2fr_3fr] sm:gap-4">
              <dt className="text-sm text-ink-muted">{l.label}</dt>
              <dd className="text-sm font-medium text-ink">{l.value}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-5 flex flex-wrap gap-3">
          {links.map((l, i) => (
            <ButtonLink key={l.intent} href={l.href} variant={i === 0 ? 'primary' : 'outline'}>
              {l.label}
            </ButtonLink>
          ))}
          <ButtonLink href="/discover/customer?save=1" variant="outline">
            Update my preferences
          </ButtonLink>
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="font-semibold">Delete my Discover data</h3>
        <p className="mt-1 text-sm text-ink-muted">
          Removes this profile and every Discover result you saved to your account. Results you did not save are not
          linked to you.
        </p>
        {remove.isError && (
          <Alert tone="error" className="mt-3">
            {errorMessage(remove.error)}
          </Alert>
        )}
        <Button
          type="button"
          variant="danger"
          size="sm"
          className="mt-4"
          loading={remove.isPending}
          onClick={() => {
            if (window.confirm('Delete your saved home preferences and Discover results? This cannot be undone.')) {
              remove.mutate();
            }
          }}
        >
          Delete my Discover data
        </Button>
      </Card>
    </div>
  );
}
