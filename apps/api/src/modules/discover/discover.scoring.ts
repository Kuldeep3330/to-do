import type {
  AssessmentDefinition,
  Answers,
  BudgetAnswer,
  LocationAnswer,
  Question,
  SummaryLine,
} from './discover.types';

/* ───────────── owner readiness ───────────── */

export type ReadinessBand = 'NEEDS_PREPARATION' | 'ALMOST_READY' | 'READY_FOR_REVIEW' | 'COMPLETE_FOR_REVIEW';

export type ReadinessFactor = { key: string; label: string; points: number; max: number };

export type OwnerReadiness = {
  score: number;
  band: ReadinessBand;
  bandLabel: string;
  factors: ReadinessFactor[];
  nextSteps: string[];
};

/** Initial product weights. They sum to 100. */
export const READINESS_WEIGHTS = {
  availability: 20,
  details: 20,
  photos: 15,
  price: 15,
  visits: 10,
  location: 10,
  authorization: 10,
} as const;

/** Fraction of the factor's weight earned by each answer. */
const FRACTION: Record<Exclude<keyof typeof READINESS_WEIGHTS, 'location'>, Record<string, number>> = {
  availability: { now: 1, later: 0.7, occupied: 0.5, unsure: 0.2 },
  details: { complete: 1, partial: 0.5, help: 0 },
  photos: { yes: 1, help: 0.33, no: 0 },
  price: { yes: 1, guidance: 0.5, deciding: 0.25 },
  visits: { flexible: 1, weekends: 0.8, slots: 0.6, notice: 0.4 },
  authorization: { owner: 1, representative: 0.8, agent: 0.8, confirm: 0 },
};

const FACTOR_LABELS: Record<keyof typeof READINESS_WEIGHTS, string> = {
  availability: 'Availability information',
  details: 'Property details',
  photos: 'Photographs',
  price: 'Price readiness',
  visits: 'Visit availability',
  location: 'Location details',
  authorization: 'Publication authorization',
};

const NEXT_STEP: Record<keyof typeof READINESS_WEIGHTS, string> = {
  availability: 'Confirm when the property will be available.',
  details: 'Complete the property details: size, bedrooms, floor, furnishing and amenities.',
  photos: 'Add recent photographs of each room and the building entrance.',
  price: 'Decide your expected rent or price. Our team can discuss it with you.',
  visits: 'Agree the days and times when visitors can see the property.',
  location: 'Add the society or street address so the team can find the property.',
  authorization: 'Confirm that you are authorized to publish this property. We check this when you submit it.',
};

export function readinessBand(score: number): { band: ReadinessBand; label: string } {
  if (score >= 90) return { band: 'COMPLETE_FOR_REVIEW', label: 'Complete for review' };
  if (score >= 70) return { band: 'READY_FOR_REVIEW', label: 'Ready for review' };
  if (score >= 40) return { band: 'ALMOST_READY', label: 'Almost ready' };
  return { band: 'NEEDS_PREPARATION', label: 'Needs preparation' };
}

export function scoreOwnerReadiness(answers: Answers): OwnerReadiness {
  const factors: ReadinessFactor[] = (Object.keys(READINESS_WEIGHTS) as Array<keyof typeof READINESS_WEIGHTS>).map(
    (key) => {
      const max = READINESS_WEIGHTS[key];
      let points: number;
      if (key === 'location') {
        const loc = answers.location as LocationAnswer | undefined;
        // The locality is mandatory; a street or society address earns the remaining points.
        points = loc?.localityId ? Math.round(max * 0.7) + (loc.address ? Math.round(max * 0.3) : 0) : 0;
      } else {
        points = Math.round(max * (FRACTION[key][String(answers[key])] ?? 0));
      }
      return { key, label: FACTOR_LABELS[key], points, max };
    },
  );

  const score = factors.reduce((sum, f) => sum + f.points, 0);
  const { band, label } = readinessBand(score);
  return {
    score,
    band,
    bandLabel: label,
    factors,
    nextSteps: factors.filter((f) => f.points < f.max).map((f) => NEXT_STEP[f.key as keyof typeof NEXT_STEP]),
  };
}

/* ───────────── customer preference profile ───────────── */

export type BudgetRange = { min: number; max: number | null };

export type CustomerPreferences = {
  intents: Array<'RENT' | 'BUY'>;
  localityIds: string[];
  flexibleLocation: boolean;
  otherLocation: boolean;
  budgets: { RENT?: BudgetRange; BUY?: BudgetRange };
  propertyType: string;
  bedrooms: string | null;
  timeline: string;
  priorities: string[];
  transit: string | null;
  neighbourhood: string[];
  trust: string[];
  rent?: { furnishing: string | null; tenantType: string | null; deposit: string | null };
  buy?: { stage: string | null; purpose: string | null; matters: string | null };
};

function budgetRange(q: Question | undefined, a: unknown): BudgetRange | undefined {
  if (!a) return undefined;
  const answer = a as BudgetAnswer;
  if ('customMax' in answer) return { min: 0, max: answer.customMax };
  const option = q?.options?.find((o) => o.value === answer.band);
  return option ? { min: option.min ?? 0, max: option.max ?? null } : undefined;
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const strs = (v: unknown): string[] => (Array.isArray(v) ? (v as string[]) : []);

/** Plain structured preferences. Descriptive only: no scores, and nothing inferred about the person. */
export function buildCustomerPreferences(def: AssessmentDefinition, answers: Answers): CustomerPreferences {
  const q = (id: string) => def.questions.find((x) => x.id === id);
  const intent = String(answers.intent);
  const intents: CustomerPreferences['intents'] = intent === 'BOTH' ? ['RENT', 'BUY'] : [intent as 'RENT' | 'BUY'];
  const locations = strs(answers.locations);

  const budgets: CustomerPreferences['budgets'] = {};
  const rent = budgetRange(q('budgetRent'), answers.budgetRent);
  const buy = budgetRange(q('budgetBuy'), answers.budgetBuy);
  if (rent) budgets.RENT = rent;
  if (buy) budgets.BUY = buy;

  const prefs: CustomerPreferences = {
    intents,
    localityIds: locations.filter((l) => l !== 'flexible' && l !== 'other'),
    flexibleLocation: locations.includes('flexible'),
    otherLocation: locations.includes('other'),
    budgets,
    propertyType: String(answers.propertyType),
    bedrooms: str(answers.bedrooms),
    timeline: String(answers.timeline),
    priorities: strs(answers.priorities),
    transit: str(answers.transit),
    neighbourhood: strs(answers.neighbourhood),
    trust: strs(answers.trust),
  };
  if (intents.includes('RENT')) {
    prefs.rent = {
      furnishing: str(answers.furnishing),
      tenantType: str(answers.tenantType),
      deposit: str(answers.deposit),
    };
  }
  if (intents.includes('BUY')) {
    prefs.buy = { stage: str(answers.buyStage), purpose: str(answers.purpose), matters: str(answers.buyMatters) };
  }
  return prefs;
}

/* ───────────── readable summary (all assessments) ───────────── */

const inr = (n: number) => `₹${n.toLocaleString('en-IN')}`;

function describe(q: Question, a: unknown, localityNames: ReadonlyMap<string, string>): string {
  const label = (value: string) => q.options?.find((o) => o.value === value)?.label ?? value;
  switch (q.type) {
    case 'single':
      return label(String(a));
    case 'multi':
      return strs(a).map(label).join(', ');
    case 'locality':
      return strs(a)
        .map((v) =>
          v === 'flexible' ? 'Flexible about location' : v === 'other' ? 'Other' : (localityNames.get(v) ?? 'Unknown locality'),
        )
        .join(', ');
    case 'budget': {
      const b = a as BudgetAnswer;
      return 'customMax' in b ? `Up to ${inr(b.customMax)}` : label(b.band);
    }
    case 'location': {
      const loc = a as LocationAnswer;
      const name = localityNames.get(loc.localityId) ?? 'Unknown locality';
      return loc.address ? `${loc.address}, ${name}` : name;
    }
  }
}

/** One readable line per answered question, using the labels the participant saw. */
export function summarize(
  def: AssessmentDefinition,
  answers: Answers,
  localityNames: ReadonlyMap<string, string>,
): SummaryLine[] {
  return def.questions
    .filter((q) => answers[q.id] !== undefined)
    .map((q) => ({ question: q.label, answer: describe(q, answers[q.id], localityNames) }));
}
