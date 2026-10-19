import { Clock } from 'lucide-react';
import { Badge } from '@/components/ui/feedback';
import type { AdminLead } from '@/lib/api/types';
import { responseState } from '@/lib/leads';

const tone = { overdue: 'danger', waiting: 'warning', answered: 'success', none: 'neutral' } as const;

/** Response-time status for a lead: overdue, time left, or how quickly it was answered. */
export function ResponseBadge({ lead }: { lead: AdminLead }) {
  const s = responseState(lead);
  if (s.kind === 'none') return <span className="text-ink-subtle">—</span>;
  return (
    <Badge tone={tone[s.kind]} className="whitespace-nowrap">
      {s.kind !== 'answered' && <Clock className="mr-1 h-3 w-3" aria-hidden />}
      {s.label}
    </Badge>
  );
}
