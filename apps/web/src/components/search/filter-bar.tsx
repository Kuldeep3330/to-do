'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Search, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Input, Select } from '@/components/ui/form-controls';
import { formatINRCompact } from '@/lib/format';
import { useCities, useLocalities } from '@/lib/queries';
import { PRICE_PRESETS, hasActiveFilters, searchHref, type SearchFilters } from '@/lib/search-params';
import { cn } from '@/lib/utils';

const AREA_PRESETS = [500, 750, 1000, 1500, 2000, 3000, 5000];

type FieldsProps = {
  /** Unique per mounted instance (desktop panel vs. mobile sheet) so label/control ids never collide. */
  idPrefix: string;
  value: SearchFilters;
  onChange: (next: SearchFilters) => void;
  className?: string;
};

/** "" | 1 | 2 | 3 | 4+  â‡„  bedrooms / bedroomsMin */
const bhkValue = (f: SearchFilters) =>
  f.bedrooms !== undefined ? String(f.bedrooms) : f.bedroomsMin !== undefined ? `${f.bedroomsMin}+` : '';

function FilterFields({ value, onChange, className, idPrefix: p }: FieldsProps) {
  const cities = useCities();
  const localities = useLocalities(value.city);
  const set = (patch: Partial<SearchFilters>) => onChange({ ...value, ...patch });
  const presets = value.intent ? PRICE_PRESETS[value.intent] : null;
  const label = 'mb-1 block text-xs font-medium text-ink-muted';

  return (
    <div className={cn('grid gap-3', className)}>
      <div>
        <label htmlFor={`${p}-intent`} className={label}>
          Looking to
        </label>
        <Select
          id={`${p}-intent`}
          value={value.intent ?? ''}
          onChange={(e) =>
            // Price presets differ between rent and sale, so changing intent clears the price range.
            set({ intent: (e.target.value || undefined) as SearchFilters['intent'], minPrice: undefined, maxPrice: undefined })
          }
        >
          <option value="">Buy or rent</option>
          <option value="BUY">Buy</option>
          <option value="RENT">Rent</option>
        </Select>
      </div>
      <div>
        <label htmlFor={`${p}-city`} className={label}>
          City
        </label>
        <Select
          id={`${p}-city`}
          value={value.city ?? ''}
          onChange={(e) => set({ city: e.target.value || undefined, locality: undefined })}
        >
          <option value="">All of Delhi-NCR</option>
          {cities.data?.map((c) => (
            <option key={c.id} value={c.slug}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <label htmlFor={`${p}-locality`} className={label}>
          Locality
        </label>
        <Select
          id={`${p}-locality`}
          value={value.locality ?? ''}
          disabled={!value.city}
          onChange={(e) => set({ locality: e.target.value || undefined })}
        >
          <option value="">{value.city ? 'Any locality' : 'Select a city first'}</option>
          {localities.data?.map((l) => (
            <option key={l.id} value={l.slug}>
              {l.name}
            </option>
          ))}
        </Select>
      </div>
      <div>
        <label htmlFor={`${p}-type`} className={label}>
          Property type
        </label>
        <Select
          id={`${p}-type`}
          value={value.type ?? ''}
          onChange={(e) => set({ type: (e.target.value || undefined) as SearchFilters['type'] })}
        >
          <option value="">Any type</option>
          <option value="RESIDENTIAL">Residential</option>
          <option value="COMMERCIAL">Commercial</option>
          <option value="PLOT">Plot</option>
        </Select>
      </div>
      <div>
        <label htmlFor={`${p}-bhk`} className={label}>
          Bedrooms
        </label>
        <Select
          id={`${p}-bhk`}
          value={bhkValue(value)}
          onChange={(e) => {
            const v = e.target.value;
            if (!v) set({ bedrooms: undefined, bedroomsMin: undefined });
            else if (v.endsWith('+')) set({ bedrooms: undefined, bedroomsMin: Number(v.slice(0, -1)) });
            else set({ bedrooms: Number(v), bedroomsMin: undefined });
          }}
        >
          <option value="">Any</option>
          <option value="1">1 BHK</option>
          <option value="2">2 BHK</option>
          <option value="3">3 BHK</option>
          <option value="4+">4+ BHK</option>
        </Select>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor={`${p}-minprice`} className={label}>
            Min price
          </label>
          <Select
            id={`${p}-minprice`}
            value={value.minPrice ?? ''}
            disabled={!presets}
            onChange={(e) => set({ minPrice: e.target.value ? Number(e.target.value) : undefined })}
          >
            <option value="">{presets ? 'No min' : 'â€”'}</option>
            {presets?.map((p) => (
              <option key={p} value={p}>
                {formatINRCompact(p)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor={`${p}-maxprice`} className={label}>
            Max price
          </label>
          <Select
            id={`${p}-maxprice`}
            value={value.maxPrice ?? ''}
            disabled={!presets}
            onChange={(e) => set({ maxPrice: e.target.value ? Number(e.target.value) : undefined })}
          >
            <option value="">{presets ? 'No max' : 'â€”'}</option>
            {presets?.map((p) => (
              <option key={p} value={p}>
                {formatINRCompact(p)}
              </option>
            ))}
          </Select>
        </div>
        {!presets && <p className="col-span-2 -mt-1 text-xs text-ink-subtle">Choose Buy or Rent to filter by price.</p>}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor={`${p}-minarea`} className={label}>
            Min area
          </label>
          <Select
            id={`${p}-minarea`}
            value={value.minArea ?? ''}
            onChange={(e) => set({ minArea: e.target.value ? Number(e.target.value) : undefined })}
          >
            <option value="">No min</option>
            {AREA_PRESETS.map((a) => (
              <option key={a} value={a}>
                {a} sq ft
              </option>
            ))}
          </Select>
        </div>
        <div>
          <label htmlFor={`${p}-maxarea`} className={label}>
            Max area
          </label>
          <Select
            id={`${p}-maxarea`}
            value={value.maxArea ?? ''}
            onChange={(e) => set({ maxArea: e.target.value ? Number(e.target.value) : undefined })}
          >
            <option value="">No max</option>
            {AREA_PRESETS.map((a) => (
              <option key={a} value={a}>
                {a} sq ft
              </option>
            ))}
          </Select>
        </div>
      </div>
      <div>
        <label htmlFor={`${p}-furnishing`} className={label}>
          Furnishing
        </label>
        <Select
          id={`${p}-furnishing`}
          value={value.furnishing ?? ''}
          onChange={(e) => set({ furnishing: (e.target.value || undefined) as SearchFilters['furnishing'] })}
        >
          <option value="">Any</option>
          <option value="UNFURNISHED">Unfurnished</option>
          <option value="SEMI">Semi-furnished</option>
          <option value="FURNISHED">Furnished</option>
        </Select>
      </div>
    </div>
  );
}

export function FilterBar({ filters }: { filters: SearchFilters }) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [text, setText] = React.useState(filters.q ?? '');
  const [open, setOpen] = React.useState(false);
  const [draft, setDraft] = React.useState(filters);
  // Optimistic copy of the filters: the URL (props) updates asynchronously, so two quick changes
  // must build on the latest local value, not on the stale server-rendered one.
  const [local, setLocal] = React.useState(filters);
  const urlKey = searchHref(filters);

  // URLs this component pushed that have not landed yet. A URL change that is NOT one of these came
  // from elsewhere (back/forward, a chip, a link), so the optimistic copy must resync to it.
  const pushed = React.useRef(new Set<string>());
  const lastPushed = React.useRef<string | null>(null);

  React.useEffect(() => setText(filters.q ?? ''), [filters.q]);
  React.useEffect(() => {
    if (urlKey === lastPushed.current) {
      pushed.current.clear(); // our latest navigation landed; local already matches
    } else if (pushed.current.has(urlKey)) {
      pushed.current.delete(urlKey); // an older intermediate navigation landed; keep newer local edits
    } else {
      pushed.current.clear();
      lastPushed.current = null;
      setLocal(filters);
    }
  }, [urlKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const go = (next: Partial<SearchFilters>) => {
    const href = searchHref({ ...next, page: 1 });
    pushed.current.add(href);
    lastPushed.current = href;
    startTransition(() => router.push(href, { scroll: false }));
  };

  const submitText = (e: React.FormEvent) => {
    e.preventDefault();
    const q = text.trim();
    const next = { ...local, q: q.length >= 2 ? q : undefined };
    setLocal(next);
    go(next);
  };

  const activeCount = [
    filters.intent, filters.city, filters.locality, filters.type, filters.bedrooms ?? filters.bedroomsMin,
    filters.minPrice, filters.maxPrice, filters.minArea, filters.maxArea, filters.furnishing,
  ].filter((v) => v !== undefined).length;

  return (
    <div className="space-y-4" aria-busy={pending}>
      <form onSubmit={submitText} role="search" className="flex gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-subtle" aria-hidden />
          <Input
            type="search"
            aria-label="Search by keyword"
            placeholder="Search by project, locality or keyword"
            className="h-11 pl-9"
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
        </div>
        <Button type="submit" size="lg" className="h-11">
          Search
        </Button>

        <Dialog
          open={open}
          onOpenChange={(o) => {
            if (o) setDraft(local);
            setOpen(o);
          }}
        >
          <DialogTrigger asChild>
            <Button type="button" variant="outline" className="h-11 lg:hidden" aria-label="Open filters">
              <SlidersHorizontal className="h-4 w-4" aria-hidden />
              Filters{activeCount > 0 ? ` (${activeCount})` : ''}
            </Button>
          </DialogTrigger>
          <DialogContent title="Filters" side="bottom">
            <FilterFields idPrefix="m" value={draft} onChange={setDraft} />
            <div className="sticky bottom-0 -mx-6 mt-4 flex gap-2 border-t border-border bg-surface px-6 pb-1 pt-4">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={() => {
                  setOpen(false);
                  const cleared = { sort: local.sort, page: 1, q: local.q };
                  setLocal(cleared);
                  go(cleared);
                }}
              >
                Clear all
              </Button>
              <Button
                type="button"
                className="flex-1"
                onClick={() => {
                  setOpen(false);
                  const applied = { ...draft, q: local.q };
                  setLocal(applied);
                  go(applied);
                }}
              >
                Show results
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </form>

      {/* Desktop: filters apply as you change them. */}
      <div className="hidden rounded-xl border border-border bg-surface-muted p-4 lg:block">
        <FilterFields
          idPrefix="d"
          value={local}
          onChange={(next) => {
            setLocal(next);
            go(next);
          }}
          className="grid-cols-4 xl:grid-cols-5"
        />
        {hasActiveFilters(local) && (
          <div className="mt-3 text-right">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                const cleared = { sort: local.sort, page: 1 };
                setLocal(cleared);
                go(cleared);
              }}
            >
              Clear all filters
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
