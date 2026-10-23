'use client';

import * as React from 'react';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/form-controls';
import { cn } from '@/lib/utils';

/**
 * The toolbar above every admin list: filters on the left, a result count and
 * actions (export, clear) on the right. Filters themselves are passed as children.
 */
export function FilterBar({
  children,
  summary,
  actions,
  onClear,
  className,
}: {
  children: React.ReactNode;
  /** e.g. "128 leads". Announced politely when it changes. */
  summary?: React.ReactNode;
  actions?: React.ReactNode;
  /** When given, a "Clear filters" button appears. Pass undefined while nothing is filtered. */
  onClear?: () => void;
  className?: string;
}) {
  return (
    <div className={cn('mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-surface p-3', className)}>
      {children}
      <div className="ml-auto flex flex-wrap items-center gap-3">
        {summary !== undefined && (
          <p role="status" className="text-sm text-ink-muted">
            {summary}
          </p>
        )}
        {onClear && (
          <Button variant="ghost" size="sm" onClick={onClear}>
            <X className="h-3.5 w-3.5" aria-hidden />
            Clear filters
          </Button>
        )}
        {actions}
      </div>
    </div>
  );
}

/**
 * Search box that waits for a pause in typing before committing, and ignores a single character.
 * `value` is the committed (URL) value; the box keeps its own text so typing stays instant.
 */
export function SearchBox({
  value,
  onCommit,
  label,
  placeholder,
  className,
}: {
  value: string;
  onCommit: (next: string | null) => void;
  label: string;
  placeholder?: string;
  className?: string;
}) {
  const [text, setText] = React.useState(value);
  React.useEffect(() => setText(value), [value]);
  React.useEffect(() => {
    const trimmed = text.trim();
    const next = trimmed.length >= 2 ? trimmed : '';
    if (next === value) return;
    const t = window.setTimeout(() => onCommit(next || null), 350);
    return () => window.clearTimeout(t);
  }, [text, value, onCommit]);

  return (
    <div className={cn('relative w-full sm:w-64', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
      <Input
        type="search"
        aria-label={label}
        placeholder={placeholder}
        className="pl-9"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
    </div>
  );
}
