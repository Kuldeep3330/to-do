export type DiscoverKind = 'CUSTOMER' | 'OWNER' | 'AGENT';

/** Show a question or option only when the answer to `id` intersects `anyOf`, or avoids `noneOf`. */
export type Condition = { id: string; anyOf?: string[]; noneOf?: string[] };

export type QuestionOption = {
  value: string;
  label: string;
  showIf?: Condition;
  /** Choosing this option must be the only choice (e.g. "No preference"). */
  exclusive?: boolean;
  /** Budget bands: INR bounds. `max` is omitted for open-ended bands. */
  min?: number;
  max?: number;
};

export type QuestionType = 'single' | 'multi' | 'locality' | 'budget' | 'location';

export type Question = {
  id: string;
  type: QuestionType;
  label: string;
  hint?: string;
  required: boolean;
  options?: QuestionOption[];
  /** multi / locality: maximum number of choices. */
  maxChoices?: number;
  /** locality: allow the "flexible" and "other" pseudo-choices. */
  allowSpecial?: boolean;
  /** budget: allowed range for a custom maximum, in INR. */
  customRange?: [number, number];
  showIf?: Condition;
};

export type AssessmentDefinition = {
  kind: DiscoverKind;
  /** URL segment: /discover/{slug}. */
  slug: 'customer' | 'owner' | 'agent';
  version: number;
  title: string;
  description: string;
  minutes: number;
  /** Shown on every result: what the answers can and cannot be used for. */
  disclaimer: string;
  questions: Question[];
};

export type Answers = Record<string, unknown>;

export type BudgetAnswer = { band: string } | { customMax: number };
export type LocationAnswer = { localityId: string; address?: string };

export type SummaryLine = { question: string; answer: string };
