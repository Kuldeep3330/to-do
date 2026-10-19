import { describe, expect, it } from 'vitest';
import { formatDuration, responseState } from './leads';

const now = new Date('2026-10-19T12:00:00.000Z');
const base = {
  status: 'NEW' as const,
  overdue: false,
  respondBy: '2026-10-19T12:45:00.000Z',
  firstResponseAt: null,
  responseMinutes: null,
};

describe('formatDuration', () => {
  it('uses the largest sensible units', () => {
    expect(formatDuration(0)).toBe('0 min');
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(120)).toBe('2 h');
    expect(formatDuration(125)).toBe('2 h 5 min');
    expect(formatDuration(24 * 60)).toBe('1 d');
    expect(formatDuration(27 * 60)).toBe('1 d 3 h');
    expect(formatDuration(-5)).toBe('0 min');
  });
});

describe('responseState', () => {
  it('shows time left for a waiting lead', () => {
    expect(responseState(base, now)).toEqual({ kind: 'waiting', label: 'Respond within 45 min' });
  });

  it('shows how late an overdue lead is', () => {
    const late = { ...base, overdue: true, respondBy: '2026-10-19T09:00:00.000Z' };
    expect(responseState(late, now)).toEqual({ kind: 'overdue', label: 'Overdue by 3 h' });
  });

  it('shows the time taken once answered', () => {
    const done = { ...base, status: 'CONTACTED' as const, firstResponseAt: '2026-10-19T11:00:00.000Z', responseMinutes: 35 };
    expect(responseState(done, now)).toEqual({ kind: 'answered', label: 'Answered in 35 min' });
  });

  it('shows nothing for leads triaged without a recorded response', () => {
    expect(responseState({ ...base, status: 'SPAM' }, now)).toEqual({ kind: 'none', label: '—' });
  });
});
