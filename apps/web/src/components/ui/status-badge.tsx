import { Badge } from './feedback';
import { humanize } from '@/lib/format';
import type { LeadStatus, ListingStatus } from '@/lib/api/types';

const listingTone: Record<ListingStatus, 'neutral' | 'success' | 'warning' | 'danger'> = {
  DRAFT: 'neutral',
  PUBLISHED: 'success',
  PAUSED: 'warning',
  CLOSED: 'danger',
};

const leadTone: Record<LeadStatus, 'neutral' | 'brand' | 'success' | 'warning' | 'danger'> = {
  NEW: 'brand',
  CONTACTED: 'neutral',
  QUALIFIED: 'success',
  UNQUALIFIED: 'warning',
  VISIT_SCHEDULED: 'brand',
  WON: 'success',
  LOST: 'danger',
  SPAM: 'danger',
};

export function ListingStatusBadge({ status }: { status: ListingStatus }) {
  return <Badge tone={listingTone[status]}>{humanize(status)}</Badge>;
}

export function LeadStatusBadge({ status }: { status: LeadStatus }) {
  return <Badge tone={leadTone[status]}>{humanize(status)}</Badge>;
}

export function PropertyStatusBadge({ status }: { status: string }) {
  return <Badge tone={status === 'ACTIVE' ? 'success' : 'neutral'}>{humanize(status)}</Badge>;
}
