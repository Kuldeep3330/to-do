import {
  LOCALITY_MIN_RESPONSES,
  PUBLIC_MIN_RESPONSES,
  buildLocalityBreakdown,
  buildResults,
  isOpen,
  isPubliclyListed,
  percentages,
  pollPhase,
} from './polls.logic';

const NOW = new Date('2026-11-02T10:00:00Z');
const before = new Date('2026-11-01T10:00:00Z');
const after = new Date('2026-11-03T10:00:00Z');

describe('pollPhase', () => {
  it('keeps drafts and archived polls out of the public lifecycle', () => {
    expect(pollPhase({ status: 'DRAFT', opensAt: null, closesAt: null }, NOW)).toBe('DRAFT');
    expect(pollPhase({ status: 'ARCHIVED', opensAt: before, closesAt: null }, NOW)).toBe('ARCHIVED');
  });

  it('is open when published with no window, or inside the window', () => {
    expect(pollPhase({ status: 'PUBLISHED', opensAt: null, closesAt: null }, NOW)).toBe('OPEN');
    expect(pollPhase({ status: 'PUBLISHED', opensAt: before, closesAt: after }, NOW)).toBe('OPEN');
  });

  it('is scheduled before it opens and closed from the moment it closes', () => {
    expect(pollPhase({ status: 'PUBLISHED', opensAt: after, closesAt: null }, NOW)).toBe('SCHEDULED');
    expect(pollPhase({ status: 'PUBLISHED', opensAt: before, closesAt: before }, NOW)).toBe('CLOSED');
    expect(pollPhase({ status: 'PUBLISHED', opensAt: null, closesAt: NOW }, NOW)).toBe('CLOSED');
  });

  it('accepts votes only while open, and lists only open or closed polls publicly', () => {
    const open = { status: 'PUBLISHED' as const, opensAt: before, closesAt: after };
    const closed = { status: 'PUBLISHED' as const, opensAt: null, closesAt: before };
    const scheduled = { status: 'PUBLISHED' as const, opensAt: after, closesAt: null };
    expect([open, closed, scheduled].map((p) => isOpen(p, NOW))).toEqual([true, false, false]);
    expect([open, closed, scheduled].map((p) => isPubliclyListed(p, NOW))).toEqual([true, true, false]);
    expect(isPubliclyListed({ status: 'DRAFT', opensAt: null, closesAt: null }, NOW)).toBe(false);
  });
});

describe('percentages', () => {
  it('always adds up to 100', () => {
    for (const counts of [[1, 1, 1], [1, 2, 4], [33, 33, 34], [7, 0, 3, 11], [1, 1, 1, 1, 1, 1, 1]]) {
      expect(percentages(counts).reduce((a, b) => a + b, 0)).toBe(100);
    }
  });

  it('gives a thirds split of 34/33/33 rather than 33/33/33', () => {
    expect(percentages([1, 1, 1])).toEqual([34, 33, 33]);
  });

  it('is all zeros when nobody has voted', () => {
    expect(percentages([0, 0, 0])).toEqual([0, 0, 0]);
  });

  it('keeps a lone voter at 100 and ranks the larger share higher', () => {
    expect(percentages([5, 0])).toEqual([100, 0]);
    const [a, b] = percentages([7, 3]);
    expect([a, b]).toEqual([70, 30]);
  });
});

describe('buildResults', () => {
  const tallies = (counts: number[]) => counts.map((count, i) => ({ optionId: `o${i}`, label: `Option ${i}`, count }));

  it('hides results below the threshold and reveals only how many have voted', () => {
    const r = buildResults(tallies([3, 2, 4]));
    expect(r).toEqual({ visible: false, total: 9, needed: PUBLIC_MIN_RESPONSES });
    expect(JSON.stringify(r)).not.toMatch(/percent|Option/);
  });

  it('shows counts and percentages at exactly the threshold', () => {
    const r = buildResults(tallies([5, 3, 2]));
    expect(r.visible).toBe(true);
    if (r.visible) {
      expect(r.total).toBe(10);
      expect(r.options.map((o) => o.percent)).toEqual([50, 30, 20]);
      expect(r.options.map((o) => o.count)).toEqual([5, 3, 2]);
    }
  });

  it('honours a custom threshold', () => {
    expect(buildResults(tallies([1, 1]), 2).visible).toBe(true);
    expect(buildResults(tallies([1, 0]), 2).visible).toBe(false);
  });
});

describe('buildLocalityBreakdown', () => {
  const options = [
    { id: 'a', label: 'A' },
    { id: 'b', label: 'B' },
  ];

  it('shows only localities that meet the minimum and reports how many were held back', () => {
    const { shown, hiddenLocalities } = buildLocalityBreakdown(options, [
      { localityId: 'l1', name: 'Dwarka', counts: { a: 15, b: 10 } },
      { localityId: 'l2', name: 'Saket', counts: { a: 2, b: 1 } },
      { localityId: 'l3', name: 'Rohini', counts: { a: 10, b: 10 } },
    ]);
    expect(shown.map((s) => s.name)).toEqual(['Dwarka', 'Rohini']);
    expect(hiddenLocalities).toBe(1);
    expect(JSON.stringify(shown)).not.toContain('Saket');
  });

  it('applies the locality threshold, not the overall one', () => {
    const justUnder = LOCALITY_MIN_RESPONSES - 1;
    const { shown, hiddenLocalities } = buildLocalityBreakdown(options, [
      { localityId: 'l1', name: 'X', counts: { a: justUnder - 1, b: 1 } },
    ]);
    expect(shown).toEqual([]);
    expect(hiddenLocalities).toBe(1);
  });
});
