import type { AssessmentDefinition, QuestionOption } from './discover.types';

const opts = (...pairs: Array<[string, string]>): QuestionOption[] =>
  pairs.map(([value, label]) => ({ value, label }));

const LAKH = 100_000;
const CRORE = 10_000_000;

const band = (value: string, label: string, min: number, max?: number): QuestionOption => ({
  value,
  label,
  min,
  ...(max === undefined ? {} : { max }),
});

/** Initial configurable answer bands. They describe a user's budget, not market prices. */
const RENT_BANDS = [
  band('r_lt10k', 'Below ₹10,000/month', 0, 10_000),
  band('r_10_15k', '₹10,000–₹15,000/month', 10_000, 15_000),
  band('r_15_20k', '₹15,000–₹20,000/month', 15_000, 20_000),
  band('r_20_30k', '₹20,000–₹30,000/month', 20_000, 30_000),
  band('r_30_50k', '₹30,000–₹50,000/month', 30_000, 50_000),
  band('r_gt50k', 'Above ₹50,000/month', 50_000),
];

const BUY_BANDS = [
  band('b_lt25l', 'Below ₹25 lakh', 0, 25 * LAKH),
  band('b_25_50l', '₹25–50 lakh', 25 * LAKH, 50 * LAKH),
  band('b_50_75l', '₹50–75 lakh', 50 * LAKH, 75 * LAKH),
  band('b_75l_1cr', '₹75 lakh–₹1 crore', 75 * LAKH, CRORE),
  band('b_1_15cr', '₹1–1.5 crore', CRORE, 1.5 * CRORE),
  band('b_15_2cr', '₹1.5–2 crore', 1.5 * CRORE, 2 * CRORE),
  band('b_gt2cr', 'Above ₹2 crore', 2 * CRORE),
];

export const CUSTOMER_ASSESSMENT: AssessmentDefinition = {
  kind: 'CUSTOMER',
  slug: 'customer',
  version: 1,
  title: 'Find Your Home Preferences',
  description: 'Tell us what you are looking for and get a clear summary you can use to search.',
  minutes: 4,
  disclaimer:
    'This summarises what you told us. It is a self-reported preference profile, not advice, and it says nothing about you personally.',
  questions: [
    {
      id: 'intent',
      type: 'single',
      label: 'What are you looking for?',
      required: true,
      options: opts(['RENT', 'Home for rent'], ['BUY', 'Home to buy'], ['BOTH', 'Still exploring both']),
    },
    {
      id: 'locations',
      type: 'locality',
      label: 'Which locations do you prefer?',
      hint: 'Choose up to 10.',
      required: true,
      maxChoices: 10,
      allowSpecial: true,
    },
    {
      id: 'budgetRent',
      type: 'budget',
      label: 'What is your monthly rent budget?',
      required: true,
      options: RENT_BANDS,
      customRange: [1_000, 5_000_000],
      showIf: { id: 'intent', anyOf: ['RENT', 'BOTH'] },
    },
    {
      id: 'budgetBuy',
      type: 'budget',
      label: 'What is your budget to buy?',
      required: true,
      options: BUY_BANDS,
      customRange: [100_000, 10_000_000_000],
      showIf: { id: 'intent', anyOf: ['BUY', 'BOTH'] },
    },
    {
      id: 'propertyType',
      type: 'single',
      label: 'What type of property are you interested in?',
      required: true,
      options: [
        { value: 'apartment', label: 'Apartment / Flat' },
        { value: 'builder_floor', label: 'Builder Floor' },
        { value: 'independent_house', label: 'Independent House' },
        { value: 'villa', label: 'Villa' },
        { value: 'studio', label: 'Studio' },
        { value: 'plot', label: 'Plot / Land', showIf: { id: 'intent', anyOf: ['BUY', 'BOTH'] } },
        { value: 'any', label: 'No preference' },
      ],
    },
    {
      id: 'bedrooms',
      type: 'single',
      label: 'How many bedrooms do you need?',
      required: true,
      options: opts(['1', '1 BHK'], ['2', '2 BHK'], ['3', '3 BHK'], ['4plus', '4+ BHK'], ['any', 'No preference']),
      showIf: { id: 'propertyType', noneOf: ['plot'] },
    },
    {
      id: 'timeline',
      type: 'single',
      label: 'When are you planning to move or purchase?',
      required: true,
      options: opts(
        ['immediately', 'Immediately'],
        ['15_days', 'Within 15 days'],
        ['1_month', 'Within 1 month'],
        ['3_months', 'Within 3 months'],
        ['6_months', 'Within 6 months'],
        ['exploring', 'Just exploring'],
      ),
    },
    {
      id: 'priorities',
      type: 'multi',
      label: 'What are your top three property priorities?',
      hint: 'Choose up to three.',
      required: true,
      maxChoices: 3,
      options: opts(
        ['price', 'Affordable price'],
        ['connectivity', 'Location and connectivity'],
        ['space', 'Bigger space'],
        ['security', 'Gated society and security'],
        ['facilities', 'Nearby schools, hospitals, and facilities'],
        ['parking', 'Parking'],
        ['light', 'Balcony and natural light'],
        ['amenities', 'Modern amenities'],
        ['peaceful', 'Peaceful surroundings'],
        ['condition', 'Property condition and maintenance'],
      ),
    },
    {
      id: 'transit',
      type: 'single',
      label: 'How important is public transport or metro connectivity?',
      required: false,
      options: opts(
        ['very', 'Very important'],
        ['important', 'Important'],
        ['own_vehicle', 'Not very important; I have my own vehicle'],
        ['flexible', 'Not important; I am flexible'],
      ),
    },
    {
      id: 'neighbourhood',
      type: 'multi',
      label: 'What kind of neighbourhood do you prefer?',
      hint: 'Choose up to two.',
      required: false,
      maxChoices: 2,
      options: [
        { value: 'peaceful', label: 'Peaceful residential area' },
        { value: 'transit', label: 'Near metro or public transport' },
        { value: 'offices', label: 'Near offices and business hubs' },
        { value: 'institutions', label: 'Near schools, colleges, and hospitals' },
        { value: 'markets', label: 'Near markets, restaurants, and shopping' },
        { value: 'established', label: 'Established residential society' },
        { value: 'developing', label: 'Newer developing locality' },
        { value: 'none', label: 'No preference', exclusive: true },
      ],
    },
    {
      id: 'trust',
      type: 'multi',
      label: 'What makes you trust a property listing?',
      hint: 'Choose up to three.',
      required: false,
      maxChoices: 3,
      options: opts(
        ['confirmed', 'Recently confirmed availability'],
        ['photos', 'Real property photographs'],
        ['pricing', 'Clear pricing and additional charges'],
        ['agent_id', 'Agent identity checked'],
        ['visited', 'Property physically visited by the platform'],
        ['details', 'Complete property details'],
        ['brokerage', 'Transparent brokerage'],
        ['response', 'Quick response'],
        ['feedback', 'Genuine customer feedback'],
      ),
    },
    {
      id: 'furnishing',
      type: 'single',
      label: 'What furnishing arrangement do you prefer?',
      required: false,
      options: opts(
        ['unfurnished', 'Unfurnished'],
        ['semi', 'Semi-furnished'],
        ['furnished', 'Fully furnished'],
        ['flexible', 'Flexible'],
      ),
      showIf: { id: 'intent', anyOf: ['RENT', 'BOTH'] },
    },
    {
      id: 'tenantType',
      type: 'single',
      label: 'Which rental arrangement do you prefer?',
      required: false,
      options: opts(
        ['family', 'Family'],
        ['professional', 'Working professional'],
        ['student', 'Student'],
        ['bachelor', 'Bachelor'],
        ['flexible', 'Flexible'],
      ),
      showIf: { id: 'intent', anyOf: ['RENT', 'BOTH'] },
    },
    {
      id: 'deposit',
      type: 'single',
      label: 'What is your deposit preference?',
      required: false,
      options: opts(
        ['lower', 'Prefer lower deposit'],
        ['standard', 'Standard deposit is acceptable'],
        ['flexible', 'Flexible; open to discussion'],
      ),
      showIf: { id: 'intent', anyOf: ['RENT', 'BOTH'] },
    },
    {
      id: 'buyStage',
      type: 'single',
      label: 'What kind of property are you considering?',
      required: false,
      options: opts(
        ['ready', 'Ready to move'],
        ['under_construction', 'Under construction'],
        ['resale', 'Resale property'],
        ['new_project', 'New project'],
        ['flexible', 'Flexible'],
      ),
      showIf: { id: 'intent', anyOf: ['BUY', 'BOTH'] },
    },
    {
      id: 'purpose',
      type: 'single',
      label: 'What is your purchase purpose?',
      required: false,
      options: opts(
        ['self_use', 'Self-use'],
        ['family', 'Family'],
        ['investment', 'Investment'],
        ['undecided', 'Not decided'],
      ),
      showIf: { id: 'intent', anyOf: ['BUY', 'BOTH'] },
    },
    {
      id: 'buyMatters',
      type: 'single',
      label: 'What matters most before purchasing?',
      required: false,
      options: opts(
        ['condition', 'Property condition'],
        ['location', 'Location'],
        ['builder', 'Builder reputation'],
        ['documents', 'Documentation and approvals'],
        ['price', 'Price'],
        ['equal', 'All are equally important'],
      ),
      showIf: { id: 'intent', anyOf: ['BUY', 'BOTH'] },
    },
  ],
};

export const OWNER_ASSESSMENT: AssessmentDefinition = {
  kind: 'OWNER',
  slug: 'owner',
  version: 1,
  title: 'Is Your Property Ready to List?',
  description: 'Check what to prepare before you submit your property for review.',
  minutes: 2,
  disclaimer:
    'This is a preparation score, not a property verification score. It does not establish ownership, title, legal status, or condition. Every listing is reviewed by our team before it is published.',
  questions: [
    {
      id: 'goal',
      type: 'single',
      label: 'What would you like to do with your property?',
      required: true,
      options: opts(['rent', 'Rent'], ['sell', 'Sell'], ['both', 'Both'], ['undecided', 'Not decided']),
    },
    { id: 'location', type: 'location', label: 'Where is your property?', required: true },
    {
      id: 'availability',
      type: 'single',
      label: 'Is the property currently available?',
      required: true,
      options: opts(
        ['now', 'Available now'],
        ['later', 'Available later'],
        ['occupied', 'Currently occupied'],
        ['unsure', 'Not sure'],
      ),
    },
    {
      id: 'photos',
      type: 'single',
      label: 'Do you have recent property photographs?',
      required: true,
      options: opts(['yes', 'Yes'], ['no', 'No'], ['help', 'Need help taking photographs']),
    },
    {
      id: 'details',
      type: 'single',
      label: 'Are the property details ready?',
      required: true,
      options: opts(['complete', 'Complete'], ['partial', 'Partially complete'], ['help', 'Need help preparing details']),
    },
    {
      id: 'price',
      type: 'single',
      label: 'Have you decided the expected price?',
      required: true,
      options: opts(['yes', 'Yes'], ['guidance', 'Need price guidance'], ['deciding', 'Still deciding']),
    },
    {
      id: 'visits',
      type: 'single',
      label: 'Can you arrange property visits?',
      required: true,
      options: opts(
        ['flexible', 'Flexible'],
        ['weekends', 'Weekends'],
        ['slots', 'Specific time slots'],
        ['notice', 'Advance notice required'],
      ),
    },
    {
      id: 'authorization',
      type: 'single',
      label: 'Are you authorized to publish this property?',
      hint: 'This is your own statement. It is checked when you submit the property.',
      required: true,
      options: opts(
        ['owner', 'I am the owner'],
        ['representative', 'I am an authorized representative'],
        ['agent', 'I am an agent'],
        ['confirm', 'Need to confirm authorization'],
      ),
    },
  ],
};

export const AGENT_ASSESSMENT: AssessmentDefinition = {
  kind: 'AGENT',
  slug: 'agent',
  version: 1,
  title: 'NCR Homes Agent Service Profile',
  description: 'Describe the areas you serve and how you work.',
  minutes: 2,
  disclaimer:
    'These are self-reported capabilities. They are not verified and are not a measure of performance. Actual performance is measured separately from platform activity.',
  questions: [
    {
      id: 'localities',
      type: 'locality',
      label: 'Which localities do you serve?',
      hint: 'Choose up to 15.',
      required: true,
      maxChoices: 15,
    },
    {
      id: 'categories',
      type: 'multi',
      label: 'Which property categories do you handle?',
      required: true,
      options: opts(
        ['rental', 'Rental properties'],
        ['resale', 'Resale properties'],
        ['new_projects', 'New projects'],
        ['plots', 'Plots'],
        ['commercial', 'Commercial properties'],
      ),
    },
    {
      id: 'inventory',
      type: 'single',
      label: 'How many active listings do you generally manage?',
      required: true,
      options: opts(['1_5', '1–5'], ['6_15', '6–15'], ['16_30', '16–30'], ['30plus', 'More than 30']),
    },
    {
      id: 'confirmation',
      type: 'single',
      label: 'How do you confirm property availability?',
      required: true,
      options: opts(
        ['owner', 'Direct owner confirmation'],
        ['calls', 'Regular calls'],
        ['whatsapp', 'WhatsApp confirmation'],
        ['other', 'Other method'],
      ),
    },
    {
      id: 'response',
      type: 'single',
      label: 'What is your typical response time during business hours?',
      required: true,
      options: opts(
        ['15_min', 'Within 15 minutes'],
        ['1_hour', 'Within 1 hour'],
        ['4_hours', 'Within 4 hours'],
        ['24_hours', 'Within 24 hours'],
      ),
    },
    {
      id: 'visits',
      type: 'single',
      label: 'Can you arrange property visits?',
      required: true,
      options: opts(['regularly', 'Regularly'], ['notice', 'With advance notice'], ['limited', 'Limited availability']),
    },
    {
      id: 'permission',
      type: 'single',
      label: 'Do you have permission to publish the properties you submit?',
      required: true,
      options: opts(['all', 'Yes, for all'], ['some', 'Only for some'], ['confirm', 'Need to confirm']),
    },
    {
      id: 'reconfirm',
      type: 'single',
      label: 'How often do you reconfirm listing availability?',
      required: true,
      options: opts(
        ['3_days', 'Every 3 days'],
        ['weekly', 'Weekly'],
        ['15_days', 'Every 15 days'],
        ['monthly', 'Monthly'],
      ),
    },
  ],
};

export const ASSESSMENTS: readonly AssessmentDefinition[] = [
  CUSTOMER_ASSESSMENT,
  OWNER_ASSESSMENT,
  AGENT_ASSESSMENT,
];

export function assessmentBySlug(slug: string): AssessmentDefinition | undefined {
  return ASSESSMENTS.find((a) => a.slug === slug);
}
