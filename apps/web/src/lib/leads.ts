import type { AdminLead, LeadStatus } from '@/lib/api/types';

export const LEAD_STATUSES: LeadStatus[] = [
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'VISIT_SCHEDULED',
  'WON',
  'LOST',
  'UNQUALIFIED',
  'SPAM',
];

/** "45 min", "2 h 5 min", "1 d 3 h": short and exact enough for an inbox. */
export function formatDuration(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
  const d = Math.floor(h / 24);
  return h % 24 ? `${d} d ${h % 24} h` : `${d} d`;
}

export type ResponseState =
  | { kind: 'overdue'; label: string }
  | { kind: 'waiting'; label: string }
  | { kind: 'answered'; label: string }
  | { kind: 'none'; label: string };

type Timed = Pick<AdminLead, 'status' | 'overdue' | 'respondBy' | 'firstResponseAt' | 'responseMinutes'>;

/** What to show in the inbox for a lead's response time. */
export function responseState(lead: Timed, now = new Date()): ResponseState {
  if (lead.firstResponseAt) {
    return { kind: 'answered', label: `Answered in ${formatDuration(lead.responseMinutes ?? 0)}` };
  }
  if (lead.status !== 'NEW') return { kind: 'none', label: '—' };
  const minutesToDeadline = (new Date(lead.respondBy).getTime() - now.getTime()) / 60_000;
  if (lead.overdue) return { kind: 'overdue', label: `Overdue by ${formatDuration(-minutesToDeadline)}` };
  return { kind: 'waiting', label: `Respond within ${formatDuration(minutesToDeadline)}` };
}
