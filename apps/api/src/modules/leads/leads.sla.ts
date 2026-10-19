import { env } from '../../config/env';

const MINUTE_MS = 60_000;

export function slaMinutes(): number {
  return env().LEAD_RESPONSE_SLA_MINUTES;
}

export type ResponseInfo = {
  /** When the first response was recorded, or null while the lead is still waiting. */
  firstResponseAt: string | null;
  /** createdAt plus the response target. */
  respondBy: string;
  /** Still NEW, never responded to, and past `respondBy`. */
  overdue: boolean;
  /** Whole minutes from enquiry to first response, once responded. */
  responseMinutes: number | null;
};

type Timed = { status: string; createdAt: Date; firstResponseAt?: Date | null };

/** A lead is "waiting" until someone moves it out of NEW (or confirms a visit). */
export function isWaiting(lead: Pick<Timed, 'status' | 'firstResponseAt'>): boolean {
  return lead.status === 'NEW' && !lead.firstResponseAt;
}

export function responseInfo(lead: Timed, now = new Date(), sla = slaMinutes()): ResponseInfo {
  const respondBy = new Date(lead.createdAt.getTime() + sla * MINUTE_MS);
  const first = lead.firstResponseAt ?? null;
  return {
    firstResponseAt: first ? first.toISOString() : null,
    respondBy: respondBy.toISOString(),
    overdue: isWaiting(lead) && now.getTime() > respondBy.getTime(),
    responseMinutes: first ? Math.max(0, Math.round((first.getTime() - lead.createdAt.getTime()) / MINUTE_MS)) : null,
  };
}

/** Cut-off for "overdue" in a database filter: waiting leads created before this are late. */
export function overdueCutoff(now = new Date(), sla = slaMinutes()): Date {
  return new Date(now.getTime() - sla * MINUTE_MS);
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}
