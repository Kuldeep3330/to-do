'use client';

import { useQuery } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import { ButtonLink } from '@/components/ui/button';
import { discoverApi } from '@/lib/api/endpoints';
import { useMe } from '@/lib/auth/use-auth';
import { searchLinks } from '@/lib/discover/engine';

/**
 * Offered on an unfiltered search to signed-in people who saved a Discover profile. It only links to a filtered
 * search the visitor can see and change; nothing is applied silently.
 */
export function SavedPreferencesBanner({ filtersActive }: { filtersActive: boolean }) {
  const { data: me } = useMe();
  const profile = useQuery({
    queryKey: ['discover', 'profile'],
    queryFn: discoverApi.profile,
    enabled: Boolean(me) && !filtersActive,
    staleTime: 5 * 60 * 1000,
  });

  if (filtersActive || !me || !profile.data) return null;
  const links = searchLinks(profile.data.preferences, profile.data.localities);
  if (links.length === 0) return null;

  return (
    <aside
      aria-label="Your saved preferences"
      className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-brand-600/20 bg-brand-50 p-4"
    >
      <p className="flex items-center gap-2 text-sm text-ink">
        <Sparkles className="h-4 w-4 text-brand-600" aria-hidden />
        You saved your home preferences. Search with them?
      </p>
      <div className="flex flex-wrap gap-2">
        {links.map((l) => (
          <ButtonLink key={l.intent} href={l.href} size="sm" variant={links.length > 1 && l.intent === 'BUY' ? 'outline' : 'primary'}>
            {l.label}
          </ButtonLink>
        ))}
      </div>
    </aside>
  );
}
