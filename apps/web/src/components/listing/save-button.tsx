'use client';

import * as React from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Heart } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { savedApi } from '@/lib/api/endpoints';
import { errorMessage } from '@/lib/api/errors';
import { useMe } from '@/lib/auth/use-auth';
import { cn } from '@/lib/utils';

const IDS_KEY = ['saved', 'ids'] as const;

/** Heart toggle. Signed-out visitors are sent to sign in and come back to this page. */
export function SaveButton({
  listingId,
  title,
  className,
  variant = 'overlay',
}: {
  listingId: string;
  title: string;
  className?: string;
  variant?: 'overlay' | 'inline';
}) {
  const router = useRouter();
  const pathname = usePathname();
  const qc = useQueryClient();
  const toast = useToast();
  const { data: me } = useMe();

  const ids = useQuery({ queryKey: IDS_KEY, queryFn: savedApi.ids, enabled: !!me, staleTime: 30_000 });
  const saved = ids.data?.includes(listingId) ?? false;

  const toggle = useMutation<void, Error, boolean, { prev: string[] }>({
    mutationFn: async (next) => {
      if (next) await savedApi.save(listingId);
      else await savedApi.unsave(listingId);
    },
    // Optimistic: flip the heart immediately, roll back if the API says no.
    onMutate: async (next) => {
      await qc.cancelQueries({ queryKey: IDS_KEY });
      const prev = qc.getQueryData<string[]>(IDS_KEY) ?? [];
      qc.setQueryData<string[]>(IDS_KEY, next ? [...new Set([...prev, listingId])] : prev.filter((i) => i !== listingId));
      return { prev };
    },
    onError: (e, _next, ctx) => {
      if (ctx) qc.setQueryData(IDS_KEY, ctx.prev);
      toast.error(errorMessage(e));
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: IDS_KEY });
      void qc.invalidateQueries({ queryKey: ['saved', 'list'] });
    },
  });

  const onClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!me) {
      router.push(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    toggle.mutate(!saved);
  };

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={saved}
      aria-label={saved ? `Remove ${title} from saved homes` : `Save ${title}`}
      className={cn(
        'inline-flex cursor-pointer items-center justify-center gap-2 transition-colors',
        variant === 'overlay'
          ? 'h-9 w-9 rounded-full bg-surface/95 shadow-card hover:bg-surface'
          : 'rounded-lg border border-border-strong px-3 py-2 text-sm font-medium hover:bg-surface-muted',
        className,
      )}
    >
      <Heart
        className={cn('h-5 w-5', saved ? 'fill-danger-600 text-danger-600' : 'text-ink-muted')}
        aria-hidden
      />
      {variant === 'inline' && <span>{saved ? 'Saved' : 'Save'}</span>}
    </button>
  );
}
