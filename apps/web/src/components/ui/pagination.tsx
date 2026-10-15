import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './button';

type Props = {
  page: number;
  pageSize: number;
  total: number;
} & (
  | { hrefFor: (page: number) => string; onPageChange?: never }
  | { onPageChange: (page: number) => void; hrefFor?: never }
);

/** Link-based (public, SEO-friendly) or callback-based (admin tables) pager. */
export function Pagination({ page, pageSize, total, hrefFor, onPageChange }: Props) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  const prev = page > 1 ? page - 1 : null;
  const next = page < pages ? page + 1 : null;

  const item = (target: number | null, label: string, icon: React.ReactNode) => {
    const cls = cn(
      'inline-flex h-9 items-center gap-1 rounded-lg border border-border-strong px-3 text-sm font-medium',
      target ? 'bg-surface text-ink hover:bg-surface-muted' : 'pointer-events-none opacity-40',
    );
    if (hrefFor) {
      return target ? (
        <Link href={hrefFor(target)} className={cls} aria-label={label} rel={target < page ? 'prev' : 'next'}>
          {icon}
        </Link>
      ) : (
        <span className={cls} aria-hidden>
          {icon}
        </span>
      );
    }
    return (
      <Button
        variant="outline"
        size="icon"
        aria-label={label}
        disabled={!target}
        onClick={() => target && onPageChange?.(target)}
      >
        {icon}
      </Button>
    );
  };

  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-4 pt-4">
      <p className="text-sm text-ink-muted">
        {from}–{to} of {total.toLocaleString('en-IN')}
      </p>
      <div className="flex items-center gap-2">
        {item(prev, 'Previous page', <ChevronLeft className="h-4 w-4" />)}
        <span className="px-2 text-sm text-ink-muted">
          Page {page} of {pages}
        </span>
        {item(next, 'Next page', <ChevronRight className="h-4 w-4" />)}
      </div>
    </nav>
  );
}
