import { median } from '../leads/leads.sla';

const IST_OFFSET_MS = 5.5 * 3_600_000;
const MINUTE_MS = 60_000;

/** Calendar day in India as YYYY-MM-DD. */
export function istDay(d: Date): string {
  return new Date(d.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
}

/** Every day from `from` to `to` inclusive, as YYYY-MM-DD. */
export function eachDay(from: string, to: string): string[] {
  const days: string[] = [];
  for (let t = Date.parse(`${from}T00:00:00Z`); t <= Date.parse(`${to}T00:00:00Z`); t += 86_400_000) {
    days.push(new Date(t).toISOString().slice(0, 10));
  }
  return days;
}

export type ReportLead = {
  createdAt: Date;
  status: string;
  source: string;
  firstResponseAt: Date | null;
  assigneeId: string | null;
  assigneeName: string | null;
  hasVisit: boolean;
};

export type ReportDeal = {
  closedOn: string; // YYYY-MM-DD
  intent: 'RENT' | 'BUY' | null;
  closedAmount: number;
  feeAmount: number | null;
};

export type FunnelStage = { key: 'received' | 'responded' | 'visit' | 'won'; label: string; count: number };

export type AgentRow = {
  userId: string | null;
  name: string;
  received: number;
  responded: number;
  /** Still waiting for a first response right now, whenever they arrived. Counted only among this cohort. */
  waiting: number;
  medianResponseMinutes: number | null;
  won: number;
  /** Won as a share of received, whole percent; null when nothing was received. */
  winRatePercent: number | null;
};

export type Report = {
  funnel: FunnelStage[];
  lost: number;
  spam: number;
  daily: { date: string; leads: number; won: number }[];
  sources: { source: string; count: number }[];
  agents: AgentRow[];
  medianResponseMinutes: number | null;
};

export type FeeReport = {
  months: { month: string; deals: number; rentMonthly: number; saleValue: number; fees: number; dealsWithoutFee: number }[];
  totals: { deals: number; rentMonthly: number; saleValue: number; fees: number; dealsWithoutFee: number };
};

const pct = (part: number, whole: number) => (whole === 0 ? null : Math.round((part / whole) * 100));

/** Everything here is about the cohort of leads that arrived in the window, so each number can be traced to the same set of enquiries. */
export function buildReport(leads: ReportLead[], from: string, to: string): Report {
  const responded = leads.filter((l) => l.firstResponseAt);
  const minutesOf = (l: ReportLead) =>
    Math.max(0, Math.round(((l.firstResponseAt as Date).getTime() - l.createdAt.getTime()) / MINUTE_MS));

  const byDay = new Map(eachDay(from, to).map((d) => [d, { date: d, leads: 0, won: 0 }]));
  for (const l of leads) {
    const row = byDay.get(istDay(l.createdAt));
    if (!row) continue;
    row.leads += 1;
    if (l.status === 'WON') row.won += 1;
  }

  const sources = new Map<string, number>();
  for (const l of leads) sources.set(l.source, (sources.get(l.source) ?? 0) + 1);

  const groups = new Map<string, ReportLead[]>();
  for (const l of leads) {
    const key = l.assigneeId ?? 'none';
    groups.set(key, [...(groups.get(key) ?? []), l]);
  }
  const agents: AgentRow[] = [...groups.entries()].map(([key, ls]) => {
    const answered = ls.filter((l) => l.firstResponseAt);
    const won = ls.filter((l) => l.status === 'WON').length;
    return {
      userId: key === 'none' ? null : key,
      name: key === 'none' ? 'Unassigned' : (ls[0]!.assigneeName ?? 'Unknown'),
      received: ls.length,
      responded: answered.length,
      waiting: ls.filter((l) => l.status === 'NEW' && !l.firstResponseAt).length,
      medianResponseMinutes: median(answered.map(minutesOf)),
      won,
      winRatePercent: pct(won, ls.length),
    };
  });
  agents.sort((a, b) => b.received - a.received || a.name.localeCompare(b.name));

  return {
    funnel: [
      { key: 'received', label: 'Enquiries received', count: leads.length },
      { key: 'responded', label: 'Answered', count: responded.length },
      { key: 'visit', label: 'Asked to visit', count: leads.filter((l) => l.hasVisit).length },
      { key: 'won', label: 'Deals won', count: leads.filter((l) => l.status === 'WON').length },
    ],
    lost: leads.filter((l) => l.status === 'LOST').length,
    spam: leads.filter((l) => l.status === 'SPAM').length,
    daily: [...byDay.values()],
    sources: [...sources.entries()].map(([source, count]) => ({ source, count })).sort((a, b) => b.count - a.count),
    agents,
    medianResponseMinutes: median(responded.map(minutesOf)),
  };
}

/** Deals are grouped by the month they closed, which can differ from when the enquiry arrived. */
export function buildFeeReport(deals: ReportDeal[]): FeeReport {
  const months = new Map<string, FeeReport['months'][number]>();
  for (const d of deals) {
    const key = d.closedOn.slice(0, 7);
    const row = months.get(key) ?? { month: key, deals: 0, rentMonthly: 0, saleValue: 0, fees: 0, dealsWithoutFee: 0 };
    row.deals += 1;
    if (d.intent === 'RENT') row.rentMonthly += d.closedAmount;
    else row.saleValue += d.closedAmount;
    if (d.feeAmount === null) row.dealsWithoutFee += 1;
    else row.fees += d.feeAmount;
    months.set(key, row);
  }
  const rows = [...months.values()].sort((a, b) => a.month.localeCompare(b.month));
  return {
    months: rows,
    totals: rows.reduce(
      (t, r) => ({
        deals: t.deals + r.deals,
        rentMonthly: t.rentMonthly + r.rentMonthly,
        saleValue: t.saleValue + r.saleValue,
        fees: t.fees + r.fees,
        dealsWithoutFee: t.dealsWithoutFee + r.dealsWithoutFee,
      }),
      { deals: 0, rentMonthly: 0, saleValue: 0, fees: 0, dealsWithoutFee: 0 },
    ),
  };
}
