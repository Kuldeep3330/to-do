'use client';

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Input, Select, fieldAria } from '@/components/ui/form-controls';
import { adminPropertiesApi } from '@/lib/api/endpoints';
import { formatArea, formatBedrooms } from '@/lib/format';

type Props = {
  id: string;
  value: string;
  onChange: (id: string) => void;
  error?: string;
  disabled?: boolean;
};

/** Search-as-you-type picker over ACTIVE properties (the API caps pages at 24). */
export function PropertyPicker({ id, value, onChange, error, disabled }: Props) {
  const [text, setText] = React.useState('');
  const [q, setQ] = React.useState('');
  React.useEffect(() => {
    const t = window.setTimeout(() => setQ(text.trim().length >= 2 ? text.trim() : ''), 300);
    return () => window.clearTimeout(t);
  }, [text]);

  const list = useQuery({
    queryKey: ['admin', 'properties', 'picker', q],
    queryFn: () => adminPropertiesApi.list({ status: 'ACTIVE', q: q || undefined, pageSize: 24 }),
  });
  const selected = useQuery({
    queryKey: ['admin', 'properties', value],
    queryFn: () => adminPropertiesApi.get(value),
    enabled: !!value && !list.data?.data.some((p) => p.id === value),
  });

  const options = React.useMemo(() => {
    const rows = list.data?.data ?? [];
    return selected.data && !rows.some((p) => p.id === selected.data!.id) ? [selected.data, ...rows] : rows;
  }, [list.data, selected.data]);

  return (
    <div className="space-y-2">
      <Input
        aria-label="Search properties"
        placeholder="Search by title or society…"
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={disabled}
      />
      <Select
        {...fieldAria(id, error)}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        <option value="">{list.isLoading ? 'Loading…' : 'Select a property'}</option>
        {options.map((p) => (
          <option key={p.id} value={p.id}>
            {[p.internalTitle, p.societyName, formatBedrooms(p.bedrooms), formatArea(p.areaValue, p.areaUnit)]
              .filter(Boolean)
              .join(' · ')}
          </option>
        ))}
      </Select>
      {list.data && list.data.meta.total > options.length && !q && (
        <p className="text-xs text-ink-subtle">Showing the newest {options.length}. Search to narrow down.</p>
      )}
    </div>
  );
}
