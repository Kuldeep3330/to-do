import * as React from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Card } from '@/components/ui/feedback';

export type KpiTone = 'brand' | 'success' | 'warning' | 'danger' | 'neutral';

const iconTones: Record<KpiTone, string> = {
  brand: 'bg-brand-50 text-brand-700',
  success: 'bg-success-50 text-success-600',
  warning: 'bg-warning-50 text-warning-600',
  danger: 'bg-danger-50 text-danger-700',
  neutral: 'bg-surface-sunken text-ink-muted',
};

export function KpiCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'brand',
  href,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: KpiTone;
  href?: string;
}) {
  const body = (
    <Card className={cn('h-full p-5', href && 'transition-shadow hover:shadow-pop')}>
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm font-medium text-ink-muted">{label}</span>
        <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', iconTones[tone])}>
          <Icon className="h-[18px] w-[18px]" />
        </span>
      </div>
      <p className="mt-3 text-3xl font-bold tabular-nums tracking-tight text-ink">{value}</p>
      {hint && <p className="mt-1 text-xs text-ink-subtle">{hint}</p>}
    </Card>
  );
  if (!href) return body;
  return (
    <Link href={href} className="block h-full rounded-[var(--radius-card)] focus-visible:outline-offset-2">
      {body}
    </Link>
  );
}
