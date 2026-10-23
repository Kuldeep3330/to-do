import { describe, expect, it } from 'vitest';
import { addDays, matchPreset, monthLabel, percent, presetRange, todayIst } from './reports';

describe('dates', () => {
  it('uses the calendar day in India', () => {
    expect(todayIst(new Date('2026-10-10T18:29:00Z'))).toBe('2026-10-10');
    expect(todayIst(new Date('2026-10-10T18:31:00Z'))).toBe('2026-10-11');
  });
  it('adds days across month ends', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('presets', () => {
  it('builds windows that include today', () => {
    expect(presetRange(7, '2026-10-10')).toEqual({ from: '2026-10-04', to: '2026-10-10' });
    expect(presetRange(1, '2026-10-10')).toEqual({ from: '2026-10-10', to: '2026-10-10' });
  });
  it('recognises a preset and nothing else', () => {
    expect(matchPreset('2026-09-11', '2026-10-10', '2026-10-10')).toBe(30);
    expect(matchPreset('2026-09-12', '2026-10-10', '2026-10-10')).toBeNull();
  });
});

describe('percent and monthLabel', () => {
  it('rounds and refuses to divide by zero', () => {
    expect(percent(1, 3)).toBe(33);
    expect(percent(2, 3)).toBe(67);
    expect(percent(0, 0)).toBeNull();
  });
  it('writes months in words', () => {
    expect(monthLabel('2026-10')).toBe('Oct 2026');
    expect(monthLabel('2026-01')).toBe('Jan 2026');
  });
});
