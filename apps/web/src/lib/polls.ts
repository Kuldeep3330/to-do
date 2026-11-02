import type { AdminPoll } from '@/lib/discover/types';

export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 6;

/** One option per line. Blank lines are ignored and repeats (ignoring case) are dropped. */
export function parseOptions(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const label = line.trim();
    if (!label || seen.has(label.toLowerCase())) continue;
    seen.add(label.toLowerCase());
    out.push(label);
  }
  return out;
}

/** `datetime-local` value (local time, no zone) to an ISO instant, or null when empty or invalid. */
export function localToIso(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** ISO instant to a `datetime-local` value in the viewer's local time. */
export function isoToLocal(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export type PollForm = { question: string; optionsText: string; opensAt: string; closesAt: string };

export type PollFormProblems = Partial<Record<'question' | 'options' | 'closesAt', string>>;

export function pollFormProblems(form: PollForm): PollFormProblems {
  const problems: PollFormProblems = {};
  if (form.question.trim().length < 8) problems.question = 'Write the full question (at least 8 characters).';
  if (form.question.trim().length > 200) problems.question = 'Keep the question under 200 characters.';
  const options = parseOptions(form.optionsText);
  if (options.length < MIN_OPTIONS) problems.options = `Add at least ${MIN_OPTIONS} different options, one per line.`;
  else if (options.length > MAX_OPTIONS) problems.options = `Use at most ${MAX_OPTIONS} options.`;
  else if (options.some((o) => o.length > 120)) problems.options = 'Keep each option under 120 characters.';
  const opens = localToIso(form.opensAt);
  const closes = localToIso(form.closesAt);
  if (opens && closes && closes <= opens) problems.closesAt = 'Closing time must be after the opening time.';
  return problems;
}

export const blankPollForm = (): PollForm => ({ question: '', optionsText: '', opensAt: '', closesAt: '' });

export const formFromPoll = (p: AdminPoll): PollForm => ({
  question: p.question,
  optionsText: p.options.map((o) => o.label).join('\n'),
  opensAt: isoToLocal(p.opensAt),
  closesAt: isoToLocal(p.closesAt),
});

export const PHASE_LABEL: Record<AdminPoll['phase'], string> = {
  DRAFT: 'Draft',
  SCHEDULED: 'Scheduled',
  OPEN: 'Open',
  CLOSED: 'Closed',
  ARCHIVED: 'Archived',
};
