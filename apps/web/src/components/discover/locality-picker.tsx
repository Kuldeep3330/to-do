'use client';

import * as React from 'react';
import { X } from 'lucide-react';
import { Select } from '@/components/ui/form-controls';
import { Skeleton } from '@/components/ui/feedback';
import { useCities, useLocalities } from '@/lib/queries';
import { cn } from '@/lib/utils';

const SPECIALS: Record<string, string> = { flexible: 'Flexible about location', other: 'Other' };

type Props = {
  /** Selected locality ids, plus the pseudo-choices "flexible" and "other" when allowed. */
  value: string[];
  onChange: (next: string[]) => void;
  max: number;
  allowSpecial?: boolean;
  /** Picking a locality replaces the previous one (owner: "where is your property"). */
  single?: boolean;
  labelledBy: string;
};

/** Pick localities from the live city and locality lists. Nothing is hardcoded, so new localities appear here. */
export function LocalityPicker({ value, onChange, max, allowSpecial, single, labelledBy }: Props) {
  const cities = useCities();
  const [citySlug, setCitySlug] = React.useState<string>('');
  const activeCity = citySlug || cities.data?.[0]?.slug;
  const localities = useLocalities(activeCity);

  // Remember names of everything seen so chips survive switching city.
  const names = React.useRef(new Map<string, string>());
  for (const l of localities.data ?? []) names.current.set(l.id, l.name);

  const real = value.filter((v) => !(v in SPECIALS));
  const atMax = !single && real.length >= max;

  const toggle = (id: string) => {
    if (value.includes(id)) return onChange(value.filter((v) => v !== id));
    if (single) return onChange([id]);
    if (atMax) return;
    onChange([...value.filter((v) => v !== 'flexible'), id]);
  };

  const toggleSpecial = (key: string) => {
    if (value.includes(key)) return onChange(value.filter((v) => v !== key));
    // "Flexible" replaces specific picks; "Other" can sit beside them.
    onChange(key === 'flexible' ? [key] : [...value, key]);
  };

  return (
    <div className="space-y-4">
      {value.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label="Selected locations">
          {value.map((v) => (
            <li key={v}>
              <button
                type="button"
                onClick={() => (v in SPECIALS ? toggleSpecial(v) : toggle(v))}
                className="inline-flex cursor-pointer items-center gap-1 rounded-full bg-brand-50 px-3 py-1 text-sm font-medium text-brand-700 hover:bg-brand-100"
                aria-label={`Remove ${SPECIALS[v] ?? names.current.get(v) ?? 'location'}`}
              >
                {SPECIALS[v] ?? names.current.get(v) ?? 'Selected locality'}
                <X className="h-3.5 w-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      {cities.isLoading ? (
        <Skeleton className="h-10 w-full" />
      ) : cities.isError ? (
        <p role="alert" className="text-sm text-danger-700">
          We could not load locations. Please refresh and try again.
        </p>
      ) : (
        <>
          <Select
            aria-label="City"
            value={activeCity ?? ''}
            onChange={(e) => setCitySlug(e.target.value)}
          >
            {(cities.data ?? []).map((c) => (
              <option key={c.id} value={c.slug}>
                {c.name}
              </option>
            ))}
          </Select>

          <div role="group" aria-labelledby={labelledBy} className="flex flex-wrap gap-2">
            {localities.isLoading && <Skeleton className="h-9 w-full" />}
            {(localities.data ?? []).map((l) => {
              const on = value.includes(l.id);
              return (
                <button
                  key={l.id}
                  type="button"
                  aria-pressed={on}
                  disabled={!on && atMax}
                  onClick={() => toggle(l.id)}
                  className={cn(
                    'cursor-pointer rounded-full border px-3 py-1.5 text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                    on
                      ? 'border-brand-600 bg-brand-600 text-white'
                      : 'border-border-strong bg-surface text-ink hover:bg-surface-muted',
                  )}
                >
                  {l.name}
                </button>
              );
            })}
          </div>
        </>
      )}

      {allowSpecial && (
        <div className="flex flex-wrap gap-2">
          {Object.entries(SPECIALS).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={value.includes(key)}
              onClick={() => toggleSpecial(key)}
              className={cn(
                'cursor-pointer rounded-full border px-3 py-1.5 text-sm transition-colors',
                value.includes(key)
                  ? 'border-brand-600 bg-brand-600 text-white'
                  : 'border-dashed border-border-strong bg-surface text-ink-muted hover:bg-surface-muted',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {!single && (
        <p className="text-xs text-ink-subtle">
          {real.length} of {max} selected
        </p>
      )}
    </div>
  );
}
