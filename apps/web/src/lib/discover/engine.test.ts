import { describe, expect, it } from 'vitest';
import {
  budgetProblem,
  conditionHolds,
  describePreferences,
  isAnswered,
  missingRequired,
  pruneAnswers,
  searchLinks,
  visibleQuestions,
} from './engine';
import type { CustomerPreferences, DiscoverDefinition, DiscoverLocality } from './types';

const def: DiscoverDefinition = {
  kind: 'CUSTOMER',
  slug: 'customer',
  version: 1,
  title: 'Test',
  description: '',
  minutes: 1,
  disclaimer: '',
  questions: [
    {
      id: 'intent',
      type: 'single',
      label: 'Intent',
      required: true,
      options: [
        { value: 'RENT', label: 'Rent' },
        { value: 'BUY', label: 'Buy' },
        { value: 'BOTH', label: 'Both' },
      ],
    },
    {
      id: 'budgetRent',
      type: 'budget',
      label: 'Rent budget',
      required: true,
      options: [{ value: 'r1', label: 'Low', min: 0, max: 10000 }],
      customRange: [1000, 100000],
      showIf: { id: 'intent', anyOf: ['RENT', 'BOTH'] },
    },
    {
      id: 'budgetBuy',
      type: 'budget',
      label: 'Buy budget',
      required: true,
      options: [{ value: 'b1', label: 'Low', min: 0, max: 2500000 }],
      customRange: [100000, 1e9],
      showIf: { id: 'intent', anyOf: ['BUY', 'BOTH'] },
    },
    {
      id: 'propertyType',
      type: 'single',
      label: 'Type',
      required: true,
      options: [
        { value: 'apartment', label: 'Apartment' },
        { value: 'plot', label: 'Plot', showIf: { id: 'intent', anyOf: ['BUY', 'BOTH'] } },
      ],
    },
    {
      id: 'bedrooms',
      type: 'single',
      label: 'Bedrooms',
      required: true,
      options: [
        { value: '2', label: '2 BHK' },
        { value: 'any', label: 'Any' },
      ],
      showIf: { id: 'propertyType', noneOf: ['plot'] },
    },
    {
      id: 'neighbourhood',
      type: 'multi',
      label: 'Neighbourhood',
      required: false,
      maxChoices: 2,
      options: [
        { value: 'peaceful', label: 'Peaceful' },
        { value: 'none', label: 'No preference', exclusive: true },
      ],
    },
  ],
};

const ids = (a: Record<string, unknown>) => visibleQuestions(def, a).map((q) => q.id);

describe('visibility', () => {
  it('follows anyOf and noneOf conditions', () => {
    expect(conditionHolds(undefined, {})).toBe(true);
    expect(conditionHolds({ id: 'x', anyOf: ['a'] }, { x: 'a' })).toBe(true);
    expect(conditionHolds({ id: 'x', anyOf: ['a'] }, {})).toBe(false);
    expect(conditionHolds({ id: 'x', noneOf: ['a'] }, {})).toBe(true);
    expect(conditionHolds({ id: 'x', noneOf: ['a'] }, { x: ['a', 'b'] })).toBe(false);
  });

  it('shows rent, buy or both budgets', () => {
    expect(ids({ intent: 'RENT' })).toContain('budgetRent');
    expect(ids({ intent: 'RENT' })).not.toContain('budgetBuy');
    expect(ids({ intent: 'BOTH' })).toEqual(expect.arrayContaining(['budgetRent', 'budgetBuy']));
  });

  it('skips bedrooms for a plot', () => {
    expect(ids({ intent: 'BUY', propertyType: 'plot' })).not.toContain('bedrooms');
    expect(ids({ intent: 'BUY', propertyType: 'apartment' })).toContain('bedrooms');
  });
});

describe('pruneAnswers', () => {
  it('drops answers to questions that stop applying when intent changes', () => {
    const out = pruneAnswers(def, {
      intent: 'RENT',
      budgetRent: { band: 'r1' },
      budgetBuy: { band: 'b1' },
      propertyType: 'apartment',
    });
    expect(out).toEqual({ intent: 'RENT', budgetRent: { band: 'r1' }, propertyType: 'apartment' });
  });

  it('drops a plot choice and its dependent answers when the user becomes a renter', () => {
    const out = pruneAnswers(def, { intent: 'RENT', propertyType: 'plot', bedrooms: '2' });
    expect(out).toEqual({ intent: 'RENT' });
  });

  it('drops bedrooms once a plot is chosen, and removes unavailable multi choices', () => {
    expect(pruneAnswers(def, { intent: 'BUY', propertyType: 'plot', bedrooms: '2' })).toEqual({
      intent: 'BUY',
      propertyType: 'plot',
    });
    expect(pruneAnswers(def, { intent: 'RENT', neighbourhood: ['peaceful', 'ghost'] })).toEqual({
      intent: 'RENT',
      neighbourhood: ['peaceful'],
    });
  });

  it('removes empty answers', () => {
    expect(pruneAnswers(def, { intent: 'RENT', neighbourhood: [], propertyType: undefined })).toEqual({ intent: 'RENT' });
  });
});

describe('answers', () => {
  it('knows when a question is answered', () => {
    const [intent, , , , , multi] = def.questions;
    expect(isAnswered(intent, 'RENT')).toBe(true);
    expect(isAnswered(intent, undefined)).toBe(false);
    expect(isAnswered(multi, [])).toBe(false);
    expect(isAnswered(def.questions[1], { band: 'r1' })).toBe(true);
    expect(isAnswered(def.questions[1], { customMax: 5000 })).toBe(true);
    expect(isAnswered(def.questions[1], {})).toBe(false);
  });

  it('lists the missing required questions that apply', () => {
    expect(missingRequired(def, { intent: 'RENT' }).map((q) => q.id)).toEqual(['budgetRent', 'propertyType', 'bedrooms']);
    expect(missingRequired(def, { intent: 'RENT', budgetRent: { band: 'r1' }, propertyType: 'plot' })).toEqual([]);
  });

  it('range-checks custom budgets', () => {
    const rent = def.questions[1];
    expect(budgetProblem(rent, { band: 'r1' })).toBeNull();
    expect(budgetProblem(rent, { customMax: 35000 })).toBeNull();
    expect(budgetProblem(rent, { customMax: 50 })).toMatch(/between/);
    expect(budgetProblem(rent, { customMax: 5_000_000 })).toMatch(/between/);
  });
});

describe('searchLinks', () => {
  const loc = (id: string, slug: string, citySlug: string): DiscoverLocality => ({
    id,
    slug,
    name: slug,
    citySlug,
    cityName: citySlug,
  });
  const indirapuram = loc('1', 'indirapuram', 'ghaziabad');
  const vaishali = loc('2', 'vaishali', 'ghaziabad');
  const sector62 = loc('3', 'sector-62', 'noida');

  const prefs = (over: Partial<CustomerPreferences> = {}): CustomerPreferences => ({
    intents: ['RENT'],
    localityIds: ['1'],
    flexibleLocation: false,
    otherLocation: false,
    budgets: { RENT: { min: 15000, max: 20000 } },
    propertyType: 'apartment',
    bedrooms: '2',
    timeline: '1_month',
    priorities: [],
    transit: null,
    neighbourhood: [],
    trust: [],
    rent: { furnishing: 'semi', tenantType: null, deposit: null },
    ...over,
  });

  it('filters to the single chosen locality, budget, type, bedrooms and furnishing', () => {
    const [link] = searchLinks(prefs(), [indirapuram]);
    const q = new URL(link.href, 'http://x').searchParams;
    expect(link.href.startsWith('/search?')).toBe(true);
    expect(Object.fromEntries(q)).toEqual({
      intent: 'RENT',
      city: 'ghaziabad',
      locality: 'indirapuram',
      type: 'RESIDENTIAL',
      bedrooms: '2',
      maxPrice: '20000',
      furnishing: 'SEMI',
    });
  });

  it('filters by city only when several localities share a city, and by nothing when they span cities', () => {
    const sameCity = new URL(searchLinks(prefs({ localityIds: ['1', '2'] }), [indirapuram, vaishali])[0].href, 'http://x');
    expect(sameCity.searchParams.get('city')).toBe('ghaziabad');
    expect(sameCity.searchParams.has('locality')).toBe(false);

    const mixed = new URL(searchLinks(prefs({ localityIds: ['1', '3'] }), [indirapuram, sector62])[0].href, 'http://x');
    expect(mixed.searchParams.has('city')).toBe(false);
  });

  it('applies no location filter when flexible', () => {
    const q = new URL(searchLinks(prefs({ localityIds: [], flexibleLocation: true }), [])[0].href, 'http://x');
    expect(q.searchParams.has('city')).toBe(false);
  });

  it('maps 4+ BHK to a minimum, ignores bedrooms for plots, and leaves open-ended budgets unbounded', () => {
    const four = new URL(searchLinks(prefs({ bedrooms: '4plus' }), [indirapuram])[0].href, 'http://x').searchParams;
    expect(four.get('bedroomsMin')).toBe('4');
    expect(four.has('bedrooms')).toBe(false);

    const plot = new URL(
      searchLinks(prefs({ intents: ['BUY'], propertyType: 'plot', bedrooms: null, budgets: { BUY: { min: 0, max: null } } }), [indirapuram])[0].href,
      'http://x',
    ).searchParams;
    expect(plot.get('type')).toBe('PLOT');
    expect(plot.has('bedrooms')).toBe(false);
    expect(plot.has('maxPrice')).toBe(false);
  });

  it('gives one link per transaction type when exploring both, each with its own budget', () => {
    const links = searchLinks(
      prefs({ intents: ['RENT', 'BUY'], budgets: { RENT: { min: 0, max: 30000 }, BUY: { min: 0, max: 7500000 } } }),
      [indirapuram],
    );
    expect(links.map((l) => l.intent)).toEqual(['RENT', 'BUY']);
    expect(new URL(links[0].href, 'http://x').searchParams.get('maxPrice')).toBe('30000');
    expect(new URL(links[1].href, 'http://x').searchParams.get('maxPrice')).toBe('7500000');
    expect(new URL(links[1].href, 'http://x').searchParams.has('furnishing')).toBe(false);
  });
});

describe('describePreferences', () => {
  const customerDef: DiscoverDefinition = {
    ...def,
    questions: [
      ...def.questions,
      { id: 'timeline', type: 'single', label: 'When', required: true, options: [{ value: '1_month', label: 'Within 1 month' }] },
      { id: 'furnishing', type: 'single', label: 'Furnishing', required: false, options: [{ value: 'semi', label: 'Semi-furnished' }] },
    ],
  };
  const l = (id: string, name: string): DiscoverLocality => ({ id, name, slug: name, citySlug: 'noida', cityName: 'Noida' });
  const prefs: CustomerPreferences = {
    intents: ['RENT'],
    localityIds: ['1'],
    flexibleLocation: true,
    otherLocation: false,
    budgets: { RENT: { min: 15000, max: 20000 } },
    propertyType: 'apartment',
    bedrooms: '2',
    timeline: '1_month',
    priorities: [],
    transit: null,
    neighbourhood: [],
    trust: [],
    rent: { furnishing: 'semi', tenantType: null, deposit: null },
  };

  it('describes saved preferences with labels, locality names and formatted budgets', () => {
    const lines = describePreferences(customerDef, prefs, [l('1', 'Sector 62')]);
    const get = (k: string) => lines.find((x) => x.label === k)?.value;
    expect(get('Looking for')).toBe('Home for rent');
    expect(get('Locations')).toBe('Sector 62, Noida; Flexible about location');
    expect(get('Rent budget')).toBe('₹15,000–₹20,000/month');
    expect(get('Property type')).toBe('Apartment');
    expect(get('Bedrooms')).toBe('2 BHK');
    expect(get('Furnishing')).toBe('Semi-furnished');
  });

  it('leaves out anything unanswered or unknown instead of guessing', () => {
    const labels = describePreferences(customerDef, prefs, []).map((x) => x.label);
    expect(labels).not.toContain('Top priorities');
    expect(labels).not.toContain('Deposit');
    expect(labels).not.toContain('Matters most before buying');
  });

  it('words open-ended and upper-bound budgets correctly', () => {
    const open = describePreferences(customerDef, { ...prefs, budgets: { RENT: { min: 50000, max: null } } }, []);
    expect(open.find((x) => x.label === 'Rent budget')?.value).toBe('Above ₹50,000/month');
    const custom = describePreferences(customerDef, { ...prefs, budgets: { RENT: { min: 0, max: 35000 } } }, []);
    expect(custom.find((x) => x.label === 'Rent budget')?.value).toBe('Up to ₹35,000/month');
  });
});
