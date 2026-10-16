'use client';

import { useRouter } from 'next/navigation';
import { Select } from '@/components/ui/form-controls';
import { searchHref, type SearchFilters, type Sort } from '@/lib/search-params';

export function SortSelect({ filters }: { filters: SearchFilters }) {
  const router = useRouter();
  return (
    <div className="flex items-center gap-2">
      <label htmlFor="sort" className="text-sm text-ink-muted">
        Sort by
      </label>
      <div className="w-44">
        <Select
          id="sort"
          value={filters.sort}
          onChange={(e) => router.push(searchHref({ ...filters, sort: e.target.value as Sort, page: 1 }), { scroll: false })}
        >
          <option value="newest">Newest</option>
          <option value="price_asc">Price: low to high</option>
          <option value="price_desc">Price: high to low</option>
        </Select>
      </div>
    </div>
  );
}
