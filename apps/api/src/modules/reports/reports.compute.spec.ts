import { buildFeeReport, buildReport, eachDay, istDay, type ReportLead } from './reports.compute';

const at = (iso: string) => new Date(iso);
const lead = (over: Partial<ReportLead>): ReportLead => ({
  createdAt: at('2026-10-10T06:00:00Z'),
  status: 'NEW',
  source: 'WEB_FORM',
  firstResponseAt: null,
  assigneeId: null,
  assigneeName: null,
  hasVisit: false,
  ...over,
});

describe('istDay and eachDay', () => {
  it('uses the calendar day in India', () => {
    expect(istDay(at('2026-10-10T18:29:00Z'))).toBe('2026-10-10');
    expect(istDay(at('2026-10-10T18:31:00Z'))).toBe('2026-10-11'); // already past midnight in India
  });
  it('lists every day inclusive, across month ends', () => {
    expect(eachDay('2026-10-30', '2026-11-02')).toEqual(['2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02']);
    expect(eachDay('2026-10-10', '2026-10-10')).toEqual(['2026-10-10']);
    expect(eachDay('2026-10-11', '2026-10-10')).toEqual([]);
  });
});

describe('buildReport', () => {
  const leads = [
    lead({ assigneeId: 'a', assigneeName: 'Asha', firstResponseAt: at('2026-10-10T06:30:00Z'), status: 'WON', hasVisit: true }),
    lead({ assigneeId: 'a', assigneeName: 'Asha', firstResponseAt: at('2026-10-10T07:30:00Z'), status: 'QUALIFIED', hasVisit: true }),
    lead({ assigneeId: 'a', assigneeName: 'Asha', status: 'NEW' }),
    lead({ assigneeId: 'b', assigneeName: 'Ravi', firstResponseAt: at('2026-10-10T06:10:00Z'), status: 'LOST' }),
    lead({ status: 'SPAM', source: 'CONTACT_FORM', createdAt: at('2026-10-11T06:00:00Z') }),
  ];
  const r = buildReport(leads, '2026-10-09', '2026-10-12');

  it('builds the funnel from the same cohort', () => {
    expect(r.funnel.map((s) => [s.key, s.count])).toEqual([
      ['received', 5],
      ['responded', 3],
      ['visit', 2],
      ['won', 1],
    ]);
    expect(r.lost).toBe(1);
    expect(r.spam).toBe(1);
  });

  it('gives a median first response in minutes', () => {
    // answered in 30, 90 and 10 minutes
    expect(r.medianResponseMinutes).toBe(30);
  });

  it('fills every day, including quiet ones', () => {
    expect(r.daily).toEqual([
      { date: '2026-10-09', leads: 0, won: 0 },
      { date: '2026-10-10', leads: 4, won: 1 },
      { date: '2026-10-11', leads: 1, won: 0 },
      { date: '2026-10-12', leads: 0, won: 0 },
    ]);
  });

  it('counts sources', () => {
    expect(r.sources).toEqual([
      { source: 'WEB_FORM', count: 4 },
      { source: 'CONTACT_FORM', count: 1 },
    ]);
  });

  it('breaks results down per agent, busiest first, with unassigned as its own row', () => {
    expect(r.agents.map((a) => a.name)).toEqual(['Asha', 'Ravi', 'Unassigned']);
    const asha = r.agents[0]!;
    expect(asha).toMatchObject({ received: 3, responded: 2, waiting: 1, won: 1, winRatePercent: 33, medianResponseMinutes: 60 });
    expect(r.agents[2]).toMatchObject({ userId: null, received: 1, won: 0 });
  });

  it('copes with no leads at all', () => {
    const empty = buildReport([], '2026-10-10', '2026-10-11');
    expect(empty.funnel.every((s) => s.count === 0)).toBe(true);
    expect(empty.agents).toEqual([]);
    expect(empty.medianResponseMinutes).toBeNull();
    expect(empty.daily).toHaveLength(2);
  });
});

describe('buildFeeReport', () => {
  const rep = buildFeeReport([
    { closedOn: '2026-10-02', intent: 'RENT', closedAmount: 30000, feeAmount: 15000 },
    { closedOn: '2026-10-20', intent: 'BUY', closedAmount: 8_000_000, feeAmount: 80_000 },
    { closedOn: '2026-09-28', intent: 'RENT', closedAmount: 20000, feeAmount: null },
  ]);

  it('groups by closing month, oldest first', () => {
    expect(rep.months.map((m) => m.month)).toEqual(['2026-09', '2026-10']);
    expect(rep.months[1]).toMatchObject({ deals: 2, rentMonthly: 30000, saleValue: 8_000_000, fees: 95_000, dealsWithoutFee: 0 });
  });

  it('flags deals with no fee and totals everything', () => {
    expect(rep.months[0]).toMatchObject({ deals: 1, fees: 0, dealsWithoutFee: 1 });
    expect(rep.totals).toEqual({ deals: 3, rentMonthly: 50000, saleValue: 8_000_000, fees: 95_000, dealsWithoutFee: 1 });
  });

  it('is empty for no deals', () => {
    expect(buildFeeReport([]).totals.deals).toBe(0);
  });
});
