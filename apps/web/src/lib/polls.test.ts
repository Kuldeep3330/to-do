import { describe, expect, it } from 'vitest';
import { blankPollForm, isoToLocal, localToIso, parseOptions, pollFormProblems } from './polls';

describe('parseOptions', () => {
  it('reads one option per line, trimming and skipping blanks', () => {
    expect(parseOptions('  Metro \n\nPrice\r\n   \nParks')).toEqual(['Metro', 'Price', 'Parks']);
  });

  it('drops repeats regardless of case, keeping the first spelling', () => {
    expect(parseOptions('Metro\nmetro\nMETRO\nPrice')).toEqual(['Metro', 'Price']);
  });

  it('is empty for blank input', () => {
    expect(parseOptions('  \n \n')).toEqual([]);
  });
});

describe('date conversion', () => {
  it('round-trips a local date-time through ISO', () => {
    const local = '2026-11-05T09:30';
    const iso = localToIso(local);
    expect(iso).not.toBeNull();
    expect(isoToLocal(iso)).toBe(local);
  });

  it('treats empty and invalid values as no date', () => {
    expect(localToIso('')).toBeNull();
    expect(localToIso('not a date')).toBeNull();
    expect(isoToLocal(null)).toBe('');
    expect(isoToLocal('garbage')).toBe('');
  });
});

describe('pollFormProblems', () => {
  const ok = {
    question: 'What matters most when choosing a locality?',
    optionsText: 'Metro\nPrice\nParks',
    opensAt: '',
    closesAt: '',
  };

  it('accepts a complete form', () => {
    expect(pollFormProblems(ok)).toEqual({});
  });

  it('asks for a real question and at least two different options', () => {
    expect(pollFormProblems({ ...blankPollForm() })).toMatchObject({ question: expect.any(String), options: expect.any(String) });
    expect(pollFormProblems({ ...ok, optionsText: 'Metro\nmetro' }).options).toMatch(/at least 2/);
  });

  it('allows at most six options', () => {
    expect(pollFormProblems({ ...ok, optionsText: 'a\nb\nc\nd\ne\nf\ng' }).options).toMatch(/at most 6/);
    expect(pollFormProblems({ ...ok, optionsText: 'a\nb\nc\nd\ne\nf' }).options).toBeUndefined();
  });

  it('requires the closing time to be after the opening time', () => {
    expect(pollFormProblems({ ...ok, opensAt: '2026-11-05T10:00', closesAt: '2026-11-05T09:00' }).closesAt).toMatch(/after/);
    expect(pollFormProblems({ ...ok, opensAt: '2026-11-05T10:00', closesAt: '2026-11-05T10:00' }).closesAt).toMatch(/after/);
    expect(pollFormProblems({ ...ok, opensAt: '2026-11-05T10:00', closesAt: '2026-11-06T10:00' }).closesAt).toBeUndefined();
    expect(pollFormProblems({ ...ok, closesAt: '2026-11-06T10:00' }).closesAt).toBeUndefined();
  });
});
