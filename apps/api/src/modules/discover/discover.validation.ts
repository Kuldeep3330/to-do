import type {
  AssessmentDefinition,
  Answers,
  BudgetAnswer,
  Condition,
  LocationAnswer,
  Question,
} from './discover.types';

export type AnswerIssue = { question: string; message: string };

export type ValidationResult =
  | { ok: true; answers: Answers }
  | { ok: false; issues: AnswerIssue[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SPECIAL_LOCATIONS = ['flexible', 'other'] as const;
const MAX_ADDRESS = 200;

const asValues = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : typeof v === 'string' ? [v] : [];

/** Evaluate a visibility condition against answers to earlier (visible) questions. */
export function conditionHolds(cond: Condition | undefined, answers: Answers): boolean {
  if (!cond) return true;
  const values = asValues(answers[cond.id]);
  if (cond.anyOf && !values.some((v) => cond.anyOf?.includes(v))) return false;
  if (cond.noneOf && values.some((v) => cond.noneOf?.includes(v))) return false;
  return true;
}

/** Questions that apply given the answers so far. A hidden question never counts as answered. */
export function visibleQuestions(def: AssessmentDefinition, answers: Answers): Question[] {
  const effective: Answers = {};
  const out: Question[] = [];
  for (const q of def.questions) {
    if (!conditionHolds(q.showIf, effective)) continue;
    out.push(q);
    if (answers[q.id] !== undefined) effective[q.id] = answers[q.id];
  }
  return out;
}

const isEmpty = (v: unknown) => v === undefined || v === null || (Array.isArray(v) && v.length === 0);

type Check = { value: unknown } | { error: string };

function checkSingle(q: Question, v: unknown, answers: Answers): Check {
  if (typeof v !== 'string') return { error: 'Choose one option.' };
  const option = q.options?.find((o) => o.value === v);
  if (!option || !conditionHolds(option.showIf, answers)) return { error: 'That option is not available.' };
  return { value: v };
}

function checkMulti(q: Question, v: unknown, answers: Answers): Check {
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) return { error: 'Choose one or more options.' };
  const values = v as string[];
  if (new Set(values).size !== values.length) return { error: 'Each option can only be chosen once.' };
  const max = q.maxChoices ?? q.options?.length ?? 1;
  if (values.length > max) return { error: `Choose at most ${max}.` };
  for (const value of values) {
    const option = q.options?.find((o) => o.value === value);
    if (!option || !conditionHolds(option.showIf, answers)) return { error: 'That option is not available.' };
    if (option.exclusive && values.length > 1) return { error: `"${option.label}" cannot be combined with other choices.` };
  }
  return { value: values };
}

function checkLocalities(q: Question, v: unknown): Check {
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) return { error: 'Choose one or more locations.' };
  const values = v as string[];
  if (new Set(values).size !== values.length) return { error: 'Each location can only be chosen once.' };
  const max = q.maxChoices ?? 10;
  if (values.length > max) return { error: `Choose at most ${max} locations.` };
  for (const value of values) {
    const special = (SPECIAL_LOCATIONS as readonly string[]).includes(value);
    if (special ? !q.allowSpecial : !UUID.test(value)) return { error: 'That location is not valid.' };
  }
  return { value: values };
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function checkBudget(q: Question, v: unknown): Check {
  if (!isPlainObject(v)) return { error: 'Choose a budget.' };
  const keys = Object.keys(v);
  if (keys.length !== 1) return { error: 'Choose a budget band or enter a custom budget.' };
  if (keys[0] === 'band') {
    return typeof v.band === 'string' && q.options?.some((o) => o.value === v.band)
      ? { value: { band: v.band } satisfies BudgetAnswer }
      : { error: 'That budget band is not available.' };
  }
  if (keys[0] === 'customMax') {
    const [lo, hi] = q.customRange ?? [0, 0];
    const n = v.customMax;
    return typeof n === 'number' && Number.isInteger(n) && n >= lo && n <= hi
      ? { value: { customMax: n } satisfies BudgetAnswer }
      : { error: 'Enter a whole-number budget within the allowed range.' };
  }
  return { error: 'Choose a budget band or enter a custom budget.' };
}

function checkLocation(v: unknown): Check {
  if (!isPlainObject(v) || Object.keys(v).some((k) => k !== 'localityId' && k !== 'address')) {
    return { error: 'Choose a locality.' };
  }
  if (typeof v.localityId !== 'string' || !UUID.test(v.localityId)) return { error: 'Choose a locality.' };
  const out: LocationAnswer = { localityId: v.localityId };
  if (v.address !== undefined && v.address !== null) {
    if (typeof v.address !== 'string') return { error: 'The address must be text.' };
    const address = v.address.trim();
    if (address.length > MAX_ADDRESS) return { error: `Keep the address under ${MAX_ADDRESS} characters.` };
    if (address) out.address = address;
  }
  return { value: out };
}

/**
 * Validate answers against a definition, on the server only. Unknown or hidden questions are rejected so the
 * stored answers always describe a path a participant could actually have taken.
 */
export function validateAnswers(def: AssessmentDefinition, raw: unknown): ValidationResult {
  if (!isPlainObject(raw)) return { ok: false, issues: [{ question: '', message: 'Answers are required.' }] };

  const issues: AnswerIssue[] = [];
  const known = new Set(def.questions.map((q) => q.id));
  for (const key of Object.keys(raw)) {
    if (!known.has(key)) issues.push({ question: key, message: 'Unknown question.' });
  }

  const visible = visibleQuestions(def, raw);
  const visibleIds = new Set(visible.map((q) => q.id));
  for (const q of def.questions) {
    if (!visibleIds.has(q.id) && !isEmpty(raw[q.id])) {
      issues.push({ question: q.id, message: 'This question does not apply to your earlier answers.' });
    }
  }

  const clean: Answers = {};
  for (const q of visible) {
    const v = raw[q.id];
    if (isEmpty(v)) {
      if (q.required) issues.push({ question: q.id, message: 'This question is required.' });
      continue;
    }
    const check: Check =
      q.type === 'single'
        ? checkSingle(q, v, clean)
        : q.type === 'multi'
          ? checkMulti(q, v, clean)
          : q.type === 'locality'
            ? checkLocalities(q, v)
            : q.type === 'budget'
              ? checkBudget(q, v)
              : checkLocation(v);
    if ('error' in check) issues.push({ question: q.id, message: check.error });
    else clean[q.id] = check.value;
  }

  return issues.length > 0 ? { ok: false, issues } : { ok: true, answers: clean };
}

/** Real locality ids referenced by answers, for the existence check the service performs against the database. */
export function localityIdsIn(def: AssessmentDefinition, answers: Answers): string[] {
  const ids: string[] = [];
  for (const q of def.questions) {
    const v = answers[q.id];
    if (q.type === 'locality' && Array.isArray(v)) {
      ids.push(...(v as string[]).filter((x) => UUID.test(x)));
    } else if (q.type === 'location' && isPlainObject(v) && typeof v.localityId === 'string') {
      ids.push(v.localityId);
    }
  }
  return [...new Set(ids)];
}
