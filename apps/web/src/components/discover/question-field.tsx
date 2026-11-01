'use client';

import * as React from 'react';
import { LocalityPicker } from '@/components/discover/locality-picker';
import { Input } from '@/components/ui/form-controls';
import { availableOptions } from '@/lib/discover/engine';
import type {
  BudgetAnswer,
  DiscoverAnswers,
  DiscoverOption,
  DiscoverQuestion,
  LocationAnswer,
} from '@/lib/discover/types';
import { cn } from '@/lib/utils';

type Props = {
  question: DiscoverQuestion;
  answers: DiscoverAnswers;
  onChange: (value: unknown) => void;
  error?: string | null;
};

/** One question, rendered as an accessible fieldset. The value shape matches what the API validates. */
export function QuestionField({ question: q, answers, onChange, error }: Props) {
  const legendId = `q-${q.id}-legend`;
  const errorId = `q-${q.id}-error`;
  const value = answers[q.id];

  return (
    <fieldset aria-describedby={error ? errorId : undefined} aria-invalid={error ? true : undefined} className="min-w-0">
      <legend id={legendId} className="text-xl font-semibold text-ink">
        {q.label}
        {!q.required && <span className="ml-2 text-sm font-normal text-ink-subtle">Optional</span>}
      </legend>
      {q.hint && <p className="mt-1 text-sm text-ink-muted">{q.hint}</p>}

      <div className="mt-5">
        {q.type === 'single' && (
          <ChoiceList
            name={q.id}
            kind="radio"
            options={availableOptions(q, answers)}
            selected={typeof value === 'string' ? [value] : []}
            onToggle={(v) => onChange(v)}
          />
        )}

        {q.type === 'multi' && (
          <MultiChoice q={q} answers={answers} value={Array.isArray(value) ? (value as string[]) : []} onChange={onChange} />
        )}

        {q.type === 'budget' && <BudgetField q={q} value={value as BudgetAnswer | undefined} onChange={onChange} />}

        {q.type === 'locality' && (
          <LocalityPicker
            labelledBy={legendId}
            value={Array.isArray(value) ? (value as string[]) : []}
            onChange={(next) => onChange(next.length > 0 ? next : undefined)}
            max={q.maxChoices ?? 10}
            allowSpecial={q.allowSpecial}
          />
        )}

        {q.type === 'location' && (
          <LocationField q={q} labelledBy={legendId} value={value as LocationAnswer | undefined} onChange={onChange} />
        )}
      </div>

      {error && (
        <p id={errorId} role="alert" className="mt-3 text-sm font-medium text-danger-700">
          {error}
        </p>
      )}
    </fieldset>
  );
}

function ChoiceList({
  name,
  kind,
  options,
  selected,
  onToggle,
  disabledUnselected,
}: {
  name: string;
  kind: 'radio' | 'checkbox';
  options: DiscoverOption[];
  selected: string[];
  onToggle: (value: string) => void;
  disabledUnselected?: boolean;
}) {
  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {options.map((o) => {
        const on = selected.includes(o.value);
        const disabled = Boolean(disabledUnselected) && !on;
        return (
          <label
            key={o.value}
            className={cn(
              'flex cursor-pointer items-center gap-3 rounded-xl border bg-surface p-3 text-sm transition-colors focus-within:ring-2 focus-within:ring-brand-600/40',
              on ? 'border-brand-600 bg-brand-50 text-ink' : 'border-border hover:bg-surface-muted',
              disabled && 'cursor-not-allowed opacity-50',
            )}
          >
            <input
              type={kind}
              name={name}
              value={o.value}
              checked={on}
              disabled={disabled}
              onChange={() => onToggle(o.value)}
              className="h-4 w-4 shrink-0 accent-brand-600"
            />
            <span>{o.label}</span>
          </label>
        );
      })}
    </div>
  );
}

function MultiChoice({
  q,
  answers,
  value,
  onChange,
}: {
  q: DiscoverQuestion;
  answers: DiscoverAnswers;
  value: string[];
  onChange: (v: unknown) => void;
}) {
  const options = availableOptions(q, answers);
  const max = q.maxChoices ?? options.length;
  const toggle = (v: string) => {
    if (value.includes(v)) return onChange(value.filter((x) => x !== v));
    const picked = options.find((o) => o.value === v);
    // An exclusive option ("No preference") replaces everything; choosing anything else removes it.
    if (picked?.exclusive) return onChange([v]);
    const rest = value.filter((x) => !options.find((o) => o.value === x)?.exclusive);
    onChange([...rest, v]);
  };
  return (
    <>
      <ChoiceList
        name={q.id}
        kind="checkbox"
        options={options}
        selected={value}
        onToggle={toggle}
        disabledUnselected={value.length >= max && !value.some((x) => options.find((o) => o.value === x)?.exclusive)}
      />
      <p className="mt-2 text-xs text-ink-subtle">
        {value.length} of {max} selected
      </p>
    </>
  );
}

function BudgetField({
  q,
  value,
  onChange,
}: {
  q: DiscoverQuestion;
  value: BudgetAnswer | undefined;
  onChange: (v: unknown) => void;
}) {
  const custom = value && 'customMax' in value;
  const [text, setText] = React.useState(custom ? String(value.customMax) : '');
  const [customOpen, setCustomOpen] = React.useState(Boolean(custom));
  const inputId = `q-${q.id}-custom`;

  const pickBand = (band: string) => {
    setCustomOpen(false);
    onChange({ band });
  };

  const onText = (raw: string) => {
    const digits = raw.replace(/[^\d]/g, '');
    setText(digits);
    onChange(digits ? { customMax: Number(digits) } : undefined);
  };

  return (
    <div className="space-y-3">
      <ChoiceList
        name={q.id}
        kind="radio"
        options={[...(q.options ?? []), { value: '__custom', label: 'Enter a custom budget' }]}
        selected={customOpen ? ['__custom'] : value && 'band' in value ? [value.band] : []}
        onToggle={(v) => {
          if (v !== '__custom') return pickBand(v);
          setCustomOpen(true);
          onChange(text ? { customMax: Number(text) } : undefined);
        }}
      />
      {customOpen && (
        <div className="max-w-xs">
          <label htmlFor={inputId} className="mb-1 block text-sm font-medium text-ink">
            Your maximum budget (₹)
          </label>
          <Input
            id={inputId}
            inputMode="numeric"
            autoComplete="off"
            placeholder={q.id === 'budgetRent' ? 'e.g. 35000 per month' : 'e.g. 8500000'}
            value={text}
            onChange={(e) => onText(e.target.value)}
          />
          {text && <p className="mt-1 text-xs text-ink-subtle">₹{Number(text).toLocaleString('en-IN')}</p>}
        </div>
      )}
    </div>
  );
}

function LocationField({
  q,
  labelledBy,
  value,
  onChange,
}: {
  q: DiscoverQuestion;
  labelledBy: string;
  value: LocationAnswer | undefined;
  onChange: (v: unknown) => void;
}) {
  const id = `q-${q.id}-address`;
  return (
    <div className="space-y-4">
      <LocalityPicker
        labelledBy={labelledBy}
        single
        max={1}
        value={value?.localityId ? [value.localityId] : []}
        onChange={(next) =>
          onChange(next[0] ? { ...(value?.address ? { address: value.address } : {}), localityId: next[0] } : undefined)
        }
      />
      {value?.localityId && (
        <div>
          <label htmlFor={id} className="mb-1 block text-sm font-medium text-ink">
            Society or street address <span className="font-normal text-ink-subtle">(optional)</span>
          </label>
          <Input
            id={id}
            maxLength={200}
            autoComplete="off"
            placeholder="Tower, society or street"
            value={value.address ?? ''}
            onChange={(e) =>
              onChange({ localityId: value.localityId, ...(e.target.value ? { address: e.target.value } : {}) })
            }
          />
          <p className="mt-1 text-xs text-ink-subtle">Used only to prepare your listing review.</p>
        </div>
      )}
    </div>
  );
}
