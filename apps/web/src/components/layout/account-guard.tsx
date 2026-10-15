'use client';

import * as React from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { Skeleton, ErrorState } from '@/components/ui/feedback';
import { useMe } from '@/lib/auth/use-auth';

/** Client-side session gate for signed-in customer pages. */
export function AccountGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { data: user, isLoading, isError, refetch } = useMe();

  React.useEffect(() => {
    if (!isLoading && !isError && !user) router.replace(`/login?next=${encodeURIComponent(pathname)}`);
  }, [isLoading, isError, user, router, pathname]);

  if (isError) return <ErrorState message="We could not verify your session." onRetry={() => refetch()} />;
  if (isLoading || !user) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  return <>{children}</>;
}
