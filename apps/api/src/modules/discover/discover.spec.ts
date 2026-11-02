import {
  AGENT_ASSESSMENT,
  ASSESSMENTS,
  CUSTOMER_ASSESSMENT,
  OWNER_ASSESSMENT,
  assessmentBySlug,
} from './discover.definitions';
import {
  READINESS_WEIGHTS,
  buildCustomerPreferences,
  readinessBand,
  scoreOwnerReadiness,
  summarize,
} from './discover.scoring';
import { localityIdsIn, validateAnswers, visibleQuestions } from './discover.validation';

const LOC_A = '11111111-1111-4111-8111-111111111111';
const LOC_B = '22222222-2222-4222-8222-222222222222';

const rentAnswers = {
  intent: 'RENT',
  locations: [LOC_A],
  budgetRent: { band: 'r_15_20k' },
  propertyType: 'apartment',
  bedrooms: '2',
  timeline: '1_month',
  priorities: ['price', 'security'],
};

const issuesOf = (r: ReturnType<typeof validateAnswers>) => (r.ok ? [] : r.issues.map((i) => i.question));

describe('definitions', () => {
  it('have unique question ids, valid conditions, and unique option values', () => {
    for (const def of ASSESSMENTS) {
      const ids = def.questions.map((q) => q.id);
      expect(new Set(ids).size).toBe(ids.length);
      def.questions.forEach((q, i) => {
        if (q.showIf) expect(ids.slice(0, i)).toContain(q.showIf.id);
        const values = (q.options ?? []).map((o) => o.value);
        expect(new Set(values).size).toBe(values.length);
        if (q.type === 'single' || q.type === 'multi' || q.type === 'budget') expect(values.length).toBeGreaterThan(1);
      });
    }
  });

  it('looks up assessments by slug', () => {
    expect(assessmentBySlug('owner')).toBe(OWNER_ASSESSMENT);
    expect(assessmentBySlug('nope')).toBeUndefined();
  });

  it('has a customer flow of 10 core questions plus conditionals', () => {
    const core = ['intent', 'locations', 'budget', 'propertyType', 'bedrooms', 'timeline', 'priorities', 'transit', 'neighbourhood', 'trust'];
    expect(CUSTOMER_ASSESSMENT.questions.filter((q) => core.some((c) => q.id.startsWith(c))).length).toBeGreaterThanOrEqual(10);
  });
});

describe('conditional questions', () => {
  const ids = (a: Record<string, unknown>) => visibleQuestions(CUSTOMER_ASSESSMENT, a).map((q) => q.id);

  it('shows only rent questions for renters', () => {
    const v = ids({ intent: 'RENT', propertyType: 'apartment' });
    expect(v).toEqual(expect.arrayContaining(['budgetRent', 'furnishing', 'tenantType', 'deposit']));
    expect(v).not.toEqual(expect.arrayContaining(['budgetBuy']));
    expect(v).not.toContain('buyStage');
  });

  it('shows only buy questions for buyers', () => {
    const v = ids({ intent: 'BUY', propertyType: 'apartment' });
    expect(v).toEqual(expect.arrayContaining(['budgetBuy', 'buyStage', 'purpose', 'buyMatters']));
    expect(v).not.toContain('budgetRent');
    expect(v).not.toContain('furnishing');
  });

  it('shows both sets when exploring both', () => {
    const v = ids({ intent: 'BOTH', propertyType: 'apartment' });
    expect(v).toEqual(expect.arrayContaining(['budgetRent', 'budgetBuy', 'furnishing', 'buyStage']));
  });

  it('skips bedrooms for a plot', () => {
    expect(ids({ intent: 'BUY', propertyType: 'plot' })).not.toContain('bedrooms');
    expect(ids({ intent: 'BUY', propertyType: 'villa' })).toContain('bedrooms');
  });
});

describe('validateAnswers (customer)', () => {
  it('accepts a minimal rent path', () => {
    const r = validateAnswers(CUSTOMER_ASSESSMENT, rentAnswers);
    expect(r.ok).toBe(true);
  });

  it('requires the core questions and reports each missing one', () => {
    const r = validateAnswers(CUSTOMER_ASSESSMENT, { intent: 'BUY' });
    expect(issuesOf(r)).toEqual(expect.arrayContaining(['locations', 'budgetBuy', 'propertyType', 'timeline', 'priorities']));
  });

  it('does not require optional questions', () => {
    const r = validateAnswers(CUSTOMER_ASSESSMENT, { ...rentAnswers, transit: null, trust: [] });
    expect(r.ok).toBe(true);
  });

  it('rejects answers to questions that do not apply', () => {
    const r = validateAnswers(CUSTOMER_ASSESSMENT, { ...rentAnswers, budgetBuy: { band: 'b_lt25l' } });
    expect(issuesOf(r)).toEqual(['budgetBuy']);
  });

  it('rejects bedrooms for a plot and does not require them', () => {
    const plot = {
      intent: 'BUY',
      locations: ['flexible'],
      budgetBuy: { customMax: 3_000_000 },
      propertyType: 'plot',
      timeline: 'exploring',
      priorities: ['price'],
    };
    expect(validateAnswers(CUSTOMER_ASSESSMENT, plot).ok).toBe(true);
    expect(issuesOf(validateAnswers(CUSTOMER_ASSESSMENT, { ...plot, bedrooms: '2' }))).toEqual(['bedrooms']);
  });

  it('rejects a plot for renters', () => {
    // Bedrooms is also flagged: a plot would hide that question.
    expect(issuesOf(validateAnswers(CUSTOMER_ASSESSMENT, { ...rentAnswers, propertyType: 'plot' })).sort()).toEqual([
      'bedrooms',
      'propertyType',
    ]);
  });

  it('rejects unknown questions and unknown options', () => {
    expect(issuesOf(validateAnswers(CUSTOMER_ASSESSMENT, { ...rentAnswers, extra: 'x' }))).toEqual(['extra']);
    expect(issuesOf(validateAnswers(CUSTOMER_ASSESSMENT, { ...rentAnswers, timeline: 'yesterday' }))).toEqual(['timeline']);
  });

  it('enforces the maximum number of choices and duplicates', () => {
    expect(issuesOf(validateAnswers(CUSTOMER_ASSESSMENT, { ...rentAnswers, priorities: ['price', 'space', 'parking', 'light'] }))).toEqual(['priorities']);
    expect(issuesOf(validateAnswers(CUSTOMER_ASSESSMENT, { ...rentAnswers, priorities: ['price', 'price'] }))).toEqual(['priorities']);
  });

  it('keeps "No preference" exclusive', () => {
    expect(issuesOf(validateAnswers(CUSTOMER_ASSESSMENT, { ...rentAnswers, neighbourhood: ['none', 'peaceful'] }))).toEqual(['neighbourhood']);
    expect(validateAnswers(CUSTOMER_ASSESSMENT, { ...rentAnswers, neighbourhood: ['none'] }).ok).toBe(true);
  });

  it('validates locations: uuids and the special choices only', () => {
    expect(validateAnswers(CUSTOMER_ASSESSMENT, { ...rentAnswers, locations: [LOC_A, LOC_B, 'other'] }).ok).toBe(true);
    expect(issuesOf(validateAnswers(CUSTOMER_ASSESSMENT, { ...rentAnswers, locations: ['Indirapuram'] }))).toEqual(['locations']);
    expect(issuesOf(validateAnswers(CUSTOMER_ASSESSMENT, { ...rentAnswers, locations: Array(11).fill(0).map((_, i) => `${LOC_A.slice(0, -2)}${String(i).padStart(2, '0')}`) }))).toEqual(['locations']);
  });

  it('validates budgets: a band or a custom amount, never both or out of range', () => {
    expect(validateAnswers(CUSTOMER_ASSESSMENT, { ...rentAnswers, budgetRent: { customMax: 35_000 } }).ok).toBe(true);
    expect(issuesOf(validateAnswers(CUSTOMER_ASSESSMENT, { ...rentAnswers, budgetRent: { band: 'b_lt25l' } }))).toEqual(['budgetRent']);
    expect(issuesOf(validateAnswers(CUSTOMER_ASSESSMENT, { ...rentAnswers, budgetRent: { band: 'r_lt10k', customMax: 5 } }))).toEqual(['budgetRent']);
    expect(issuesOf(validateAnswers(CUSTOMER_ASSESSMENT, { ...rentAnswers, budgetRent: { customMax: 12.5 } }))).toEqual(['budgetRent']);
    expect(issuesOf(validateAnswers(CUSTOMER_ASSESSMENT, { ...rentAnswers, budgetRent: { customMax: -1 } }))).toEqual(['budgetRent']);
  });

  it('rejects non-object payloads', () => {
    expect(validateAnswers(CUSTOMER_ASSESSMENT, null).ok).toBe(false);
    expect(validateAnswers(CUSTOMER_ASSESSMENT, []).ok).toBe(false);
  });

  it('drops nothing but returns only validated answers', () => {
    const r = validateAnswers(CUSTOMER_ASSESSMENT, { ...rentAnswers, trust: [] });
    expect(r.ok && 'trust' in r.answers).toBe(false);
  });
});

describe('validateAnswers (owner and agent)', () => {
  const owner = {
    goal: 'rent',
    location: { localityId: LOC_A, address: '  Tower 3, Sector 62 ' },
    availability: 'now',
    photos: 'yes',
    details: 'complete',
    price: 'yes',
    visits: 'flexible',
    authorization: 'owner',
  };

  it('accepts a full owner submission and trims the address', () => {
    const r = validateAnswers(OWNER_ASSESSMENT, owner);
    expect(r.ok && (r.answers.location as { address: string }).address).toBe('Tower 3, Sector 62');
  });

  it('rejects a bad locality, extra location keys, and an over-long address', () => {
    expect(issuesOf(validateAnswers(OWNER_ASSESSMENT, { ...owner, location: { localityId: 'x' } }))).toEqual(['location']);
    expect(issuesOf(validateAnswers(OWNER_ASSESSMENT, { ...owner, location: { localityId: LOC_A, city: 'x' } }))).toEqual(['location']);
    expect(issuesOf(validateAnswers(OWNER_ASSESSMENT, { ...owner, location: { localityId: LOC_A, address: 'a'.repeat(201) } }))).toEqual(['location']);
  });

  it('requires every owner question', () => {
    expect(issuesOf(validateAnswers(OWNER_ASSESSMENT, {})).sort()).toEqual(OWNER_ASSESSMENT.questions.map((q) => q.id).sort());
  });

  const agent = {
    localities: [LOC_A],
    categories: ['rental', 'resale'],
    inventory: '6_15',
    confirmation: 'owner',
    response: '1_hour',
    visits: 'regularly',
    permission: 'all',
    reconfirm: 'weekly',
  };

  it('accepts an agent submission but not the "flexible" pseudo-location', () => {
    expect(validateAnswers(AGENT_ASSESSMENT, agent).ok).toBe(true);
    expect(issuesOf(validateAnswers(AGENT_ASSESSMENT, { ...agent, localities: ['flexible'] }))).toEqual(['localities']);
  });

  it('collects the locality ids that need a database check', () => {
    expect(localityIdsIn(AGENT_ASSESSMENT, { ...agent, localities: [LOC_A, LOC_B] })).toEqual([LOC_A, LOC_B]);
    expect(localityIdsIn(OWNER_ASSESSMENT, owner)).toEqual([LOC_A]);
    expect(localityIdsIn(CUSTOMER_ASSESSMENT, { locations: ['flexible', LOC_B, 'other'] })).toEqual([LOC_B]);
  });
});

describe('owner readiness score', () => {
  const best = {
    location: { localityId: LOC_A, address: 'Tower 3' },
    availability: 'now',
    photos: 'yes',
    details: 'complete',
    price: 'yes',
    visits: 'flexible',
    authorization: 'owner',
  };

  it('has weights that sum to 100', () => {
    expect(Object.values(READINESS_WEIGHTS).reduce((a, b) => a + b, 0)).toBe(100);
  });

  it('gives 100 and no next steps when everything is ready', () => {
    const r = scoreOwnerReadiness(best);
    expect(r.score).toBe(100);
    expect(r.band).toBe('COMPLETE_FOR_REVIEW');
    expect(r.nextSteps).toEqual([]);
  });

  it('scores a barely-prepared owner low and lists practical next steps', () => {
    const r = scoreOwnerReadiness({
      location: { localityId: LOC_A },
      availability: 'unsure',
      photos: 'no',
      details: 'help',
      price: 'deciding',
      visits: 'notice',
      authorization: 'confirm',
    });
    expect(r.band).toBe('NEEDS_PREPARATION');
    expect(r.score).toBeLessThan(40);
    expect(r.nextSteps.length).toBeGreaterThanOrEqual(6);
    expect(r.nextSteps.join(' ')).toMatch(/photographs/);
  });

  it('rewards a street address with the rest of the location points', () => {
    const withAddr = scoreOwnerReadiness(best).factors.find((f) => f.key === 'location');
    const without = scoreOwnerReadiness({ ...best, location: { localityId: LOC_A } }).factors.find((f) => f.key === 'location');
    expect([withAddr?.points, without?.points]).toEqual([10, 7]);
  });

  it('uses the specified band thresholds', () => {
    expect([0, 39].map((s) => readinessBand(s).band)).toEqual(['NEEDS_PREPARATION', 'NEEDS_PREPARATION']);
    expect([40, 69].map((s) => readinessBand(s).band)).toEqual(['ALMOST_READY', 'ALMOST_READY']);
    expect([70, 89].map((s) => readinessBand(s).band)).toEqual(['READY_FOR_REVIEW', 'READY_FOR_REVIEW']);
    expect([90, 100].map((s) => readinessBand(s).band)).toEqual(['COMPLETE_FOR_REVIEW', 'COMPLETE_FOR_REVIEW']);
  });

  it('does not treat a self-declared authorization as full credit when it is not the owner', () => {
    const agent = scoreOwnerReadiness({ ...best, authorization: 'agent' });
    expect(agent.factors.find((f) => f.key === 'authorization')?.points).toBe(8);
  });
});

describe('customer preferences and summary', () => {
  it('builds structured preferences without scores', () => {
    const prefs = buildCustomerPreferences(CUSTOMER_ASSESSMENT, {
      ...rentAnswers,
      locations: [LOC_A, 'flexible'],
      furnishing: 'semi',
    });
    expect(prefs.intents).toEqual(['RENT']);
    expect(prefs.localityIds).toEqual([LOC_A]);
    expect(prefs.flexibleLocation).toBe(true);
    expect(prefs.budgets).toEqual({ RENT: { min: 15_000, max: 20_000 } });
    expect(prefs.rent?.furnishing).toBe('semi');
    expect(prefs.buy).toBeUndefined();
    expect(JSON.stringify(prefs)).not.toMatch(/score|percent/i);
  });

  it('keeps open-ended and custom budgets honest', () => {
    const open = buildCustomerPreferences(CUSTOMER_ASSESSMENT, { ...rentAnswers, budgetRent: { band: 'r_gt50k' } });
    expect(open.budgets.RENT).toEqual({ min: 50_000, max: null });
    const custom = buildCustomerPreferences(CUSTOMER_ASSESSMENT, { ...rentAnswers, budgetRent: { customMax: 35_000 } });
    expect(custom.budgets.RENT).toEqual({ min: 0, max: 35_000 });
  });

  it('records both transaction types when exploring both', () => {
    const prefs = buildCustomerPreferences(CUSTOMER_ASSESSMENT, {
      ...rentAnswers,
      intent: 'BOTH',
      budgetBuy: { band: 'b_50_75l' },
    });
    expect(prefs.intents).toEqual(['RENT', 'BUY']);
    expect(prefs.budgets.BUY).toEqual({ min: 5_000_000, max: 7_500_000 });
    expect(prefs.buy).toBeDefined();
  });

  it('summarises with the labels the participant saw and resolved locality names', () => {
    const lines = summarize(CUSTOMER_ASSESSMENT, { ...rentAnswers, locations: [LOC_A, 'other'], budgetRent: { customMax: 35000 } }, new Map([[LOC_A, 'Indirapuram']]));
    const get = (q: string) => lines.find((l) => l.question.includes(q))?.answer;
    expect(get('locations')).toBe('Indirapuram, Other');
    expect(get('rent budget')).toBe('Up to ₹35,000');
    expect(get('looking for')).toBe('Home for rent');
    expect(get('top three')).toBe('Affordable price, Gated society and security');
    expect(lines.some((l) => l.question.includes('trust'))).toBe(false);
  });

  it('summarises an owner location with its address', () => {
    const lines = summarize(OWNER_ASSESSMENT, { location: { localityId: LOC_A, address: 'Tower 3' } }, new Map([[LOC_A, 'Sector 62']]));
    expect(lines[0].answer).toBe('Tower 3, Sector 62');
  });
});
