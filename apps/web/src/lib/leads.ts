import type { LeadStatus } from '@/lib/api/types';

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
