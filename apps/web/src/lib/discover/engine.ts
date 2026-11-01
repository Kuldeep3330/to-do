import { searchHref, type SearchFilters } from '@/lib/search-params';
import type {
  BudgetAnswer,
  CustomerPreferences,
  DiscoverAnswers,
  DiscoverCondition,
  DiscoverDefinition,
  DiscoverLocality,
  DiscoverQuestion,
  LocationAnswer,
} from './types';

/**
 * Mirrors the server's visibility rules so the wizard shows the same questions the server will accept.
 * The server still validates everything; this only keeps the UI honest.
 */
const asValues = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : typeof v === 'string' ? [v] : [];

export function conditionHolds(cond: DiscoverCondition | undefined, answers: DiscoverAnswers): boolean {
  if (!cond) return true;
  const values = asValues(answers[cond.id]);
  if (cond.anyOf && !values.some((v) => cond.anyOf?.includes(v))) return false;
  if (cond.noneOf && values.some((v) => cond.noneOf?.includes(v))) return false;
  return true;
}

export function visibleQuestions(def: DiscoverDefinition, answers: DiscoverAnswers): DiscoverQuestion[] {
  const effective: DiscoverAnswers = {};
  const out: DiscoverQuestion[] = [];
  for (const q of def.questions) {
    if (!conditionHolds(q.showIf, effective)) continue;
    out.push(q);
    if (answers[q.id] !== undefined) effective[q.id] = answers[q.id];
  }
  return out;
}

export function availableOptions(q: DiscoverQuestion, answers: DiscoverAnswers) {
  return (q.options ?? []).filter((o) => conditionHolds(o.showIf, answers));
}

export function isAnswered(q: DiscoverQuestion, value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (Array.isArray(value)) return value.length > 0;
  if (q.type === 'location') return typeof (value as LocationAnswer).localityId === 'string';
  if (q.type === 'budget') {
    const b = value as Partial<{ band: string; customMax: number }>;
    return typeof b.band === 'string' || typeof b.customMax === 'number';
  }
  return value !== '';
}

/**
 * Drop answers that no longer apply after an earlier answer changed (a hidden question, or an option such as
 * "Plot" that is not available for renters). Keeps state submittable without the participant re-checking it.
 */
export function pruneAnswers(def: DiscoverDefinition, answers: DiscoverAnswers): DiscoverAnswers {
  const out: DiscoverAnswers = {};
  for (const q of visibleQuestions(def, answers)) {
    const value = answers[q.id];
    if (!isAnswered(q, value)) continue;
    if (q.type === 'single') {
      if (!availableOptions(q, out).some((o) => o.value === value)) continue;
      out[q.id] = value;
    } else if (q.type === 'multi') {
      const allowed = new Set(availableOptions(q, out).map((o) => o.value));
      const kept = asValues(value).filter((v) => allowed.has(v));
      if (kept.length > 0) out[q.id] = kept;
    } else {
      out[q.id] = value;
    }
  }
  return out;
}

export function missingRequired(def: DiscoverDefinition, answers: DiscoverAnswers): DiscoverQuestion[] {
  return visibleQuestions(def, answers).filter((q) => q.required && !isAnswered(q, answers[q.id]));
}

/** Client-side range check for a custom budget; returns a message or null. */
export function budgetProblem(q: DiscoverQuestion, value: BudgetAnswer | undefined): string | null {
  if (!value || !('customMax' in value)) return null;
  const [lo, hi] = q.customRange ?? [0, 0];
  const n = value.customMax;
  if (!Number.isInteger(n) || n < lo || n > hi) {
    return `Enter a whole number between ₹${lo.toLocaleString('en-IN')} and ₹${hi.toLocaleString('en-IN')}.`;
  }
  return null;
}

/* ───────────── hand-off to the existing search ───────────── */

const TYPE_FILTER: Record<string, SearchFilters['type']> = {
  apartment: 'RESIDENTIAL',
  builder_floor: 'RESIDENTIAL',
  independent_house: 'RESIDENTIAL',
  villa: 'RESIDENTIAL',
  studio: 'RESIDENTIAL',
  plot: 'PLOT',
};

const FURNISHING_FILTER: Record<string, SearchFilters['furnishing']> = {
  unfurnished: 'UNFURNISHED',
  semi: 'SEMI',
  furnished: 'FURNISHED',
};

export type SearchLink = { intent: 'RENT' | 'BUY'; label: string; href: string };

/**
 * Turn a saved preference profile into links into the existing search. Only filters the search already supports
 * are applied; nothing is scored or ranked here.
 */
export function searchLinks(prefs: CustomerPreferences, localities: DiscoverLocality[]): SearchLink[] {
  const chosen = localities.filter((l) => prefs.localityIds.includes(l.id));
  const cities = new Set(chosen.map((l) => l.citySlug));
  const city = cities.size === 1 ? chosen[0].citySlug : undefined;
  const locality = city && chosen.length === 1 ? chosen[0].slug : undefined;

  return prefs.intents.map((intent) => {
    const filters: Partial<SearchFilters> = { intent, city, locality };
    const type = TYPE_FILTER[prefs.propertyType];
    if (type) filters.type = type;
    if (prefs.propertyType !== 'plot') {
      if (prefs.bedrooms === '4plus') filters.bedroomsMin = 4;
      else if (prefs.bedrooms && /^[1-3]$/.test(prefs.bedrooms)) filters.bedrooms = Number(prefs.bedrooms);
    }
    const max = prefs.budgets[intent]?.max;
    if (typeof max === 'number' && max > 0) filters.maxPrice = max;
    const furnishing = intent === 'RENT' ? FURNISHING_FILTER[prefs.rent?.furnishing ?? ''] : undefined;
    if (furnishing) filters.furnishing = furnishing;
    return {
      intent,
      label: intent === 'RENT' ? 'See homes for rent' : 'See homes to buy',
      href: searchHref(filters),
    };
  });
}

/* ───────────── readable saved profile ───────────── */

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

function budgetText(intent: 'RENT' | 'BUY', range: { min: number; max: number | null }): string {
  const unit = intent === 'RENT' ? '/month' : '';
  if (range.max === null) return `Above ${inr(range.min)}${unit}`;
  return range.min > 0 ? `${inr(range.min)}–${inr(range.max)}${unit}` : `Up to ${inr(range.max)}${unit}`;
}

/**
 * Plain-language lines for a saved profile, using the labels from the live customer definition.
 * Anything unknown is left out rather than guessed.
 */
export function describePreferences(
  def: DiscoverDefinition,
  prefs: CustomerPreferences,
  localities: DiscoverLocality[],
): Array<{ label: string; value: string }> {
  const label = (qid: string, value: string | null | undefined) =>
    value ? (def.questions.find((q) => q.id === qid)?.options?.find((o) => o.value === value)?.label ?? null) : null;
  const labels = (qid: string, values: string[]) => values.map((v) => label(qid, v)).filter(Boolean).join(', ');

  const places = localities.filter((l) => prefs.localityIds.includes(l.id)).map((l) => `${l.name}, ${l.cityName}`);
  if (prefs.flexibleLocation) places.push('Flexible about location');
  if (prefs.otherLocation) places.push('Other');

  const lines: Array<[string, string | null]> = [
    ['Looking for', prefs.intents.map((i) => (i === 'RENT' ? 'Home for rent' : 'Home to buy')).join(' and ')],
    ['Locations', places.join('; ') || null],
    ...prefs.intents.map((i): [string, string | null] => [
      i === 'RENT' ? 'Rent budget' : 'Buying budget',
      prefs.budgets[i] ? budgetText(i, prefs.budgets[i]) : null,
    ]),
    ['Property type', label('propertyType', prefs.propertyType)],
    ['Bedrooms', label('bedrooms', prefs.bedrooms)],
    ['Planning to move', label('timeline', prefs.timeline)],
    ['Top priorities', labels('priorities', prefs.priorities) || null],
    ['Metro and public transport', label('transit', prefs.transit)],
    ['Neighbourhood', labels('neighbourhood', prefs.neighbourhood) || null],
    ['What builds trust', labels('trust', prefs.trust) || null],
    ['Furnishing', label('furnishing', prefs.rent?.furnishing)],
    ['Rental arrangement', label('tenantType', prefs.rent?.tenantType)],
    ['Deposit', label('deposit', prefs.rent?.deposit)],
    ['Property stage', label('buyStage', prefs.buy?.stage)],
    ['Purchase purpose', label('purpose', prefs.buy?.purpose)],
    ['Matters most before buying', label('buyMatters', prefs.buy?.matters)],
  ];
  return lines.filter((l): l is [string, string] => Boolean(l[1])).map(([l, v]) => ({ label: l, value: v }));
}
