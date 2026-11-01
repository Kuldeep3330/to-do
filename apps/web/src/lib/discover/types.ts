/** Shapes served by /api/v1/discover. The server is the source of truth for questions, validation and scoring. */

export type DiscoverSlug = 'customer' | 'owner' | 'agent';

export type DiscoverCondition = { id: string; anyOf?: string[]; noneOf?: string[] };

export type DiscoverOption = {
  value: string;
  label: string;
  showIf?: DiscoverCondition;
  exclusive?: boolean;
  min?: number;
  max?: number;
};

export type DiscoverQuestion = {
  id: string;
  type: 'single' | 'multi' | 'locality' | 'budget' | 'location';
  label: string;
  hint?: string;
  required: boolean;
  options?: DiscoverOption[];
  maxChoices?: number;
  allowSpecial?: boolean;
  customRange?: [number, number];
  showIf?: DiscoverCondition;
};

export type DiscoverDefinition = {
  kind: 'CUSTOMER' | 'OWNER' | 'AGENT';
  slug: DiscoverSlug;
  version: number;
  title: string;
  description: string;
  minutes: number;
  disclaimer: string;
  questions: DiscoverQuestion[];
};

export type DiscoverAnswers = Record<string, unknown>;
export type BudgetAnswer = { band: string } | { customMax: number };
export type LocationAnswer = { localityId: string; address?: string };

export type DiscoverLocality = { id: string; name: string; slug: string; cityName: string; citySlug: string };

export type CustomerPreferences = {
  intents: Array<'RENT' | 'BUY'>;
  localityIds: string[];
  flexibleLocation: boolean;
  otherLocation: boolean;
  budgets: { RENT?: { min: number; max: number | null }; BUY?: { min: number; max: number | null } };
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

export type ReadinessBand = 'NEEDS_PREPARATION' | 'ALMOST_READY' | 'READY_FOR_REVIEW' | 'COMPLETE_FOR_REVIEW';

export type OwnerReadiness = {
  score: number;
  band: ReadinessBand;
  bandLabel: string;
  factors: Array<{ key: string; label: string; points: number; max: number }>;
  nextSteps: string[];
};

export type DiscoverResult = {
  kind: 'CUSTOMER' | 'OWNER' | 'AGENT';
  slug: DiscoverSlug;
  version: number;
  title: string;
  disclaimer: string;
  selfReported: true;
  summary: Array<{ question: string; answer: string }>;
  localities: DiscoverLocality[];
  preferences?: CustomerPreferences;
  readiness?: OwnerReadiness;
};

export type DiscoverSubmitResponse = { resultToken: string; saved: boolean; result: DiscoverResult };
export type DiscoverProfile = {
  version: number;
  updatedAt: string;
  preferences: CustomerPreferences;
  localities: DiscoverLocality[];
};

export type DiscoverStoredResult = DiscoverResult & { saved: boolean; createdAt: string };
