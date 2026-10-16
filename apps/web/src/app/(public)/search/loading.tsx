import { Skeleton } from '@/components/ui/feedback';

export default function Loading() {
  return (
    <div className="mx-auto max-w-7xl space-y-4 px-4 py-8 sm:px-6" aria-busy="true">
      <Skeleton className="h-8 w-64" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <div className="grid gap-4 pt-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-64" />
        ))}
      </div>
    </div>
  );
}
