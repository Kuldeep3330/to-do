import { isWaiting, median, overdueCutoff, responseInfo } from './leads.sla';

const created = new Date('2026-10-19T10:00:00.000Z');
const at = (minutes: number) => new Date(created.getTime() + minutes * 60_000);

describe('lead response SLA', () => {
  it('is not overdue before the target and overdue after it', () => {
    const lead = { status: 'NEW', createdAt: created, firstResponseAt: null };
    expect(responseInfo(lead, at(119), 120).overdue).toBe(false);
    expect(responseInfo(lead, at(120), 120).overdue).toBe(false);
    expect(responseInfo(lead, at(121), 120).overdue).toBe(true);
  });

  it('reports the deadline as createdAt plus the target', () => {
    const info = responseInfo({ status: 'NEW', createdAt: created }, at(0), 90);
    expect(info.respondBy).toBe(at(90).toISOString());
    expect(info.responseMinutes).toBeNull();
  });

  it('is never overdue once a response is recorded, and reports the time taken', () => {
    const lead = { status: 'CONTACTED', createdAt: created, firstResponseAt: at(45) };
    const info = responseInfo(lead, at(600), 120);
    expect(info.overdue).toBe(false);
    expect(info.responseMinutes).toBe(45);
    expect(info.firstResponseAt).toBe(at(45).toISOString());
  });

  it('does not count leads that were triaged out of NEW as waiting', () => {
    expect(isWaiting({ status: 'NEW', firstResponseAt: null })).toBe(true);
    expect(isWaiting({ status: 'SPAM', firstResponseAt: null })).toBe(false);
    expect(isWaiting({ status: 'NEW', firstResponseAt: at(5) })).toBe(false);
  });

  it('never reports a negative response time', () => {
    const lead = { status: 'CONTACTED', createdAt: created, firstResponseAt: at(-5) };
    expect(responseInfo(lead, at(10), 120).responseMinutes).toBe(0);
  });

  it('computes the overdue cut-off and medians', () => {
    expect(overdueCutoff(at(180), 120).toISOString()).toBe(at(60).toISOString());
    expect(median([])).toBeNull();
    expect(median([30])).toBe(30);
    expect(median([10, 90, 30])).toBe(30);
    expect(median([10, 20, 30, 50])).toBe(25);
  });
});
