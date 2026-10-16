'use client';

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError } from '@/lib/api/errors';
import { authApi, meApi } from '@/lib/api/endpoints';
import type { PublicUser } from '@/lib/api/types';

export const ME_KEY = ['me'] as const;

export const STAFF_ROLES = ['SALES_AGENT', 'ADMIN', 'SUPER_ADMIN'] as const;
export const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN'] as const;

export function isStaff(user: PublicUser | null | undefined): boolean {
  return !!user?.roles.some((r) => (STAFF_ROLES as readonly string[]).includes(r));
}

export function isAdmin(user: PublicUser | null | undefined): boolean {
  return !!user?.roles.some((r) => (ADMIN_ROLES as readonly string[]).includes(r));
}

/** Current session. `data` is null when signed out (never throws for 401). */
export function useMe() {
  return useQuery<PublicUser | null>({
    queryKey: ME_KEY,
    queryFn: async () => {
      try {
        return await meApi.get();
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    staleTime: 60_000,
    retry: false,
  });
}

export function useSession() {
  const qc = useQueryClient();
  return {
    setUser: (user: PublicUser | null) => qc.setQueryData(ME_KEY, user),
    async logout() {
      try {
        await authApi.logout();
      } finally {
        qc.clear();
        qc.setQueryData(ME_KEY, null);
      }
    },
  };
}

/** Only allow same-site relative redirects (prevents open-redirect via ?next=). */
export function safeNext(next: string | null | undefined, fallback = '/'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return fallback;
  return next;
}

export function homeFor(user: PublicUser): string {
  return isStaff(user) ? '/admin' : '/account';
}
