import { cn } from '@/lib/utils';

const TONES = [
  'bg-brand-50 text-brand-700',
  'bg-success-50 text-success-600',
  'bg-warning-50 text-warning-600',
  'bg-danger-50 text-danger-700',
  'bg-surface-sunken text-ink-muted',
];

export function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0]![0]!;
  const last = parts.length > 1 ? parts[parts.length - 1]![0]! : '';
  return (first + last).toUpperCase();
}

/** Stable colour per person, so the same name always looks the same across pages. */
function toneFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length]!;
}

export function Avatar({ name, size = 'md', className }: { name: string; size?: 'sm' | 'md'; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full font-semibold',
        size === 'sm' ? 'h-7 w-7 text-[11px]' : 'h-9 w-9 text-xs',
        toneFor(name),
        className,
      )}
    >
      {initialsFor(name)}
    </span>
  );
}
