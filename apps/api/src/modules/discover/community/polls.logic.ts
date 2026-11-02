/**
 * Pure rules for Community Insights polls: when a poll is open, how results are shown, and when a group is too
 * small to publish. Kept free of I/O so the privacy-relevant thresholds are easy to test.
 */

/** Overall results stay hidden until this many people have voted. */
export const PUBLIC_MIN_RESPONSES = 10;
/** A locality's breakdown is shown only when it has at least this many votes. */
export const LOCALITY_MIN_RESPONSES = 20;

export type PollStatusValue = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

/** What a visitor sees. DRAFT and ARCHIVED polls are never public. */
export type PollPhase = 'DRAFT' | 'SCHEDULED' | 'OPEN' | 'CLOSED' | 'ARCHIVED';

export type PollWindow = { status: PollStatusValue; opensAt: Date | null; closesAt: Date | null };

export function pollPhase(poll: PollWindow, now: Date = new Date()): PollPhase {
  if (poll.status === 'DRAFT') return 'DRAFT';
  if (poll.status === 'ARCHIVED') return 'ARCHIVED';
  if (poll.opensAt && poll.opensAt > now) return 'SCHEDULED';
  if (poll.closesAt && poll.closesAt <= now) return 'CLOSED';
  return 'OPEN';
}

export const isOpen = (poll: PollWindow, now?: Date) => pollPhase(poll, now) === 'OPEN';

/** Public pages list polls that are open or have closed; scheduled, draft and archived polls stay hidden. */
export const isPubliclyListed = (poll: PollWindow, now?: Date) => {
  const phase = pollPhase(poll, now);
  return phase === 'OPEN' || phase === 'CLOSED';
};

/**
 * Whole-number percentages that always add up to 100 (largest-remainder method), so a bar chart never looks
 * like it has missing or extra votes.
 */
export function percentages(counts: number[]): number[] {
  const total = counts.reduce((a, b) => a + b, 0);
  if (total === 0) return counts.map(() => 0);
  const exact = counts.map((c) => (c / total) * 100);
  const floors = exact.map(Math.floor);
  let remainder = 100 - floors.reduce((a, b) => a + b, 0);
  const order = exact
    .map((x, i) => ({ i, frac: x - Math.floor(x) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (remainder <= 0) break;
    floors[i] += 1;
    remainder -= 1;
  }
  return floors;
}

export type OptionTally = { optionId: string; label: string; count: number };
export type OptionResult = OptionTally & { percent: number };

export type PollResults =
  | { visible: true; total: number; options: OptionResult[] }
  | { visible: false; total: number; needed: number };

/** Aggregate results for display. Below the threshold only the number of votes so far is revealed. */
export function buildResults(tallies: OptionTally[], minResponses: number = PUBLIC_MIN_RESPONSES): PollResults {
  const total = tallies.reduce((sum, t) => sum + t.count, 0);
  if (total < minResponses) return { visible: false, total, needed: minResponses };
  const pct = percentages(tallies.map((t) => t.count));
  return { visible: true, total, options: tallies.map((t, i) => ({ ...t, percent: pct[i] })) };
}

export type LocalityTally = { localityId: string; name: string; counts: Record<string, number> };
export type LocalityBreakdown = { localityId: string; name: string; results: Extract<PollResults, { visible: true }> };

/**
 * Per-locality breakdown for signed-in users. Localities under the threshold are left out entirely, and the
 * number left out is reported so the figures are honest without exposing a small group.
 */
export function buildLocalityBreakdown(
  options: Array<{ id: string; label: string }>,
  localities: LocalityTally[],
  minResponses: number = LOCALITY_MIN_RESPONSES,
): { shown: LocalityBreakdown[]; hiddenLocalities: number } {
  const shown: LocalityBreakdown[] = [];
  let hidden = 0;
  for (const loc of localities) {
    const tallies = options.map((o) => ({ optionId: o.id, label: o.label, count: loc.counts[o.id] ?? 0 }));
    const results = buildResults(tallies, minResponses);
    if (results.visible) shown.push({ localityId: loc.localityId, name: loc.name, results });
    else hidden += 1;
  }
  shown.sort((a, b) => b.results.total - a.results.total || a.name.localeCompare(b.name));
  return { shown, hiddenLocalities: hidden };
}
