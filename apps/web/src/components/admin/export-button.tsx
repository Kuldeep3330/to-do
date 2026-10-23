'use client';

import * as React from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { errorMessage } from '@/lib/api/errors';
import { downloadCsv, toCsv } from '@/lib/csv';

/** The API serves at most 24 rows a page, so cap the export instead of looping forever. */
const MAX_PAGES = 50;

/**
 * Downloads every row matching the current filters as a CSV. `fetchPage` is the same list call the table uses.
 */
export function ExportButton<T>({
  filename,
  headers,
  toRow,
  fetchPage,
  disabled,
}: {
  filename: string;
  headers: string[];
  toRow: (item: T) => unknown[];
  fetchPage: (page: number) => Promise<{ data: T[]; meta: { total: number; pageSize: number } }>;
  disabled?: boolean;
}) {
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);

  async function run() {
    setBusy(true);
    try {
      const rows: unknown[][] = [];
      let truncated = false;
      for (let page = 1; page <= MAX_PAGES; page++) {
        const res = await fetchPage(page);
        rows.push(...res.data.map(toRow));
        if (page * res.meta.pageSize >= res.meta.total) break;
        if (page === MAX_PAGES) truncated = true;
      }
      downloadCsv(filename, toCsv(headers, rows));
      toast.success(
        truncated ? `Downloaded the first ${rows.length} rows. Narrow the filters to export the rest.` : `Downloaded ${rows.length} rows`,
      );
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Button variant="outline" size="sm" onClick={run} loading={busy} disabled={disabled}>
      <Download className="h-4 w-4" aria-hidden />
      Export CSV
    </Button>
  );
}
