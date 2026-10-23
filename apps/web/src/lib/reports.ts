/** Today's calendar date in India, as YYYY-MM-DD. */
export function todayIst(now = new Date()): string {
  return new Date(now.getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

export function addDays(day: string, delta: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + delta * 86_400_000).toISOString().slice(0, 10);
}

export const PRESETS = [
  { days: 7, label: 'Last 7 days' },
  { days: 30, label: 'Last 30 days' },
  { days: 90, label: 'Last 90 days' },
] as const;

/** The window ending today that is `days` long, both ends included. */
export function presetRange(days: number, today = todayIst()): { from: string; to: string } {
  return { from: addDays(today, -(days - 1)), to: today };
}

/** Which preset (if any) a from/to pair is, so its button can look selected. */
export function matchPreset(from: string, to: string, today = todayIst()): number | null {
  const hit = PRESETS.find((p) => {
    const r = presetRange(p.days, today);
    return r.from === from && r.to === to;
  });
  return hit ? hit.days : null;
}

/** Share of `whole` as a whole percent, or null when there is nothing to divide. */
export function percent(part: number, whole: number): number | null {
  return whole === 0 ? null : Math.round((part / whole) * 100);
}

/** "2026-10" -> "Oct 2026". */
export function monthLabel(month: string): string {
  const [y, m] = month.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, 1)).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' });
}
