import { humanize } from '@/lib/format';

export type AuditTone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger';

/** "UPDATE_LEAD" -> "Update lead". */
export function actionLabel(action: string): string {
  const words = humanize(action).toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/** Colour by what the action does: making things is green, removing is red, the rest is blue. */
export function actionTone(action: string): AuditTone {
  const verb = action.split('_')[0] ?? '';
  if (['CREATE', 'PUBLISH', 'VERIFY', 'CONFIRM'].includes(verb)) return 'success';
  if (['DELETE', 'ARCHIVE', 'CLOSE', 'DISABLE'].includes(verb)) return 'danger';
  if (['PAUSE'].includes(verb)) return 'warning';
  if (['UPDATE', 'REORDER'].includes(verb)) return 'brand';
  return 'neutral';
}

const ENTITY_ROUTES: Record<string, (id: string) => string> = {
  lead: (id) => `/admin/leads/${id}`,
  listing: (id) => `/admin/listings/${id}`,
  property: (id) => `/admin/properties/${id}`,
};

/** Where to look at the thing an entry is about, when the admin area has a page for it. */
export function entityHref(entityType: string, entityId: string | null): string | null {
  if (!entityId) return null;
  return ENTITY_ROUTES[entityType]?.(entityId) ?? null;
}

/** "fee_rule" -> "Fee rule". */
export function entityLabel(entityType: string): string {
  const words = entityType.replaceAll('_', ' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}
