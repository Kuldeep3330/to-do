import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@/lib/api/errors';
import type { DiscoverDefinition } from '@/lib/discover/types';
import { DiscoverWizard } from './discover-wizard';

const push = vi.fn();
let search = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => search,
}));

let signedIn = false;
vi.mock('@/lib/auth/use-auth', () => ({
  useMe: () => ({ data: signedIn ? { id: 'u1' } : null, isLoading: false }),
}));

// The locality picker has its own data hooks; the wizard flow is what is under test here.
vi.mock('@/components/discover/locality-picker', () => ({
  LocalityPicker: () => <div>locality picker</div>,
}));

const definition = vi.fn();
const start = vi.fn();
const submit = vi.fn();
vi.mock('@/lib/api/endpoints', () => ({
  discoverApi: {
    definition: (...a: unknown[]) => definition(...a),
    start: (...a: unknown[]) => start(...a),
    submit: (...a: unknown[]) => submit(...a),
  },
}));

const def: DiscoverDefinition = {
  kind: 'CUSTOMER',
  slug: 'customer',
  version: 1,
  title: 'Find Your Home Preferences',
  description: '',
  minutes: 4,
  disclaimer: '',
  questions: [
    {
      id: 'intent',
      type: 'single',
      label: 'What are you looking for?',
      required: true,
      options: [
        { value: 'RENT', label: 'Home for rent' },
        { value: 'BUY', label: 'Home to buy' },
      ],
    },
    {
      id: 'budgetRent',
      type: 'budget',
      label: 'What is your monthly rent budget?',
      required: true,
      options: [
        { value: 'r1', label: 'Below ₹10,000/month', min: 0, max: 10000 },
        { value: 'r2', label: '₹10,000–₹15,000/month', min: 10000, max: 15000 },
      ],
      customRange: [1000, 100000],
      showIf: { id: 'intent', anyOf: ['RENT'] },
    },
    {
      id: 'budgetBuy',
      type: 'budget',
      label: 'What is your budget to buy?',
      required: true,
      options: [{ value: 'b1', label: 'Below ₹25 lakh', min: 0, max: 2500000 }],
      customRange: [100000, 1e9],
      showIf: { id: 'intent', anyOf: ['BUY'] },
    },
    {
      id: 'priorities',
      type: 'multi',
      label: 'Top priorities?',
      hint: 'Choose up to two.',
      required: true,
      maxChoices: 2,
      options: [
        { value: 'price', label: 'Affordable price' },
        { value: 'space', label: 'Bigger space' },
        { value: 'parking', label: 'Parking' },
      ],
    },
    {
      id: 'transit',
      type: 'single',
      label: 'How important is the metro?',
      required: false,
      options: [
        { value: 'very', label: 'Very important' },
        { value: 'flexible', label: 'Flexible' },
      ],
    },
  ],
};

function renderWizard() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <DiscoverWizard slug="customer" />
    </QueryClientProvider>,
  );
}

const choose = async (label: string) => userEvent.click(await screen.findByLabelText(label));
const next = async () => userEvent.click(await screen.findByRole('button', { name: /^next$/i }));

beforeEach(() => {
  vi.clearAllMocks();
  signedIn = false;
  search = new URLSearchParams();
  definition.mockResolvedValue(def);
  start.mockResolvedValue({});
  submit.mockResolvedValue({ resultToken: 'tok123', saved: false, result: {} });
});

async function answerRentCore() {
  await choose('Home for rent');
  await next();
  await choose('₹10,000–₹15,000/month');
  await next();
  await choose('Affordable price');
  await next();
}

describe('DiscoverWizard', () => {
  it('shows one question at a time with progress, and pings "started" once', async () => {
    renderWizard();
    expect(await screen.findByText('What are you looking for?')).toBeInTheDocument();
    expect(screen.getByText('Question 1 of 2')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: /progress/i })).toHaveAttribute('aria-valuenow', '0');
    expect(screen.queryByText('Top priorities?')).not.toBeInTheDocument();
    expect(start).toHaveBeenCalledTimes(1);
    expect(start).toHaveBeenCalledWith('customer');
  });

  it('will not move on from a required question until it is answered', async () => {
    renderWizard();
    await screen.findByText('What are you looking for?');
    await next();
    expect(screen.getByRole('alert')).toHaveTextContent(/please choose an answer/i);
    expect(screen.getByText('Question 1 of 2')).toBeInTheDocument();
  });

  it('asks only the rent budget for renters and goes back with the answer kept', async () => {
    renderWizard();
    await choose('Home for rent');
    await next();
    expect(screen.getByText('What is your monthly rent budget?')).toBeInTheDocument();
    expect(screen.queryByText('What is your budget to buy?')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /back/i }));
    expect(screen.getByLabelText('Home for rent')).toBeChecked();
  });

  it('limits multi-select choices to the maximum', async () => {
    renderWizard();
    await choose('Home for rent');
    await next();
    await choose('Below ₹10,000/month');
    await next();
    await choose('Affordable price');
    await choose('Bigger space');
    expect(screen.getByLabelText('Parking')).toBeDisabled();
    expect(screen.getByText('2 of 2 selected')).toBeInTheDocument();
  });

  it('accepts a custom budget and flags one that is out of range', async () => {
    renderWizard();
    await choose('Home for rent');
    await next();
    await choose('Enter a custom budget');
    await userEvent.type(screen.getByLabelText(/maximum budget/i), '50');
    await next();
    expect(screen.getByRole('alert')).toHaveTextContent(/between ₹1,000 and ₹1,00,000/);
    await userEvent.clear(screen.getByLabelText(/maximum budget/i));
    await userEvent.type(screen.getByLabelText(/maximum budget/i), '35000');
    await next();
    expect(screen.getByText('Top priorities?')).toBeInTheDocument();
  });

  it('reviews answers, then submits only the answers that apply and opens the result', async () => {
    renderWizard();
    await choose('Home to buy'); // buy first, then change to rent below
    await next();
    await choose('Below ₹25 lakh');
    await userEvent.click(screen.getByRole('button', { name: /back/i }));
    await choose('Home for rent'); // buy budget must be dropped
    await next();
    await choose('Below ₹10,000/month');
    await next();
    await choose('Affordable price');
    await next();

    expect(screen.getByText('Check your answers')).toBeInTheDocument();
    expect(screen.getByText('Below ₹10,000/month')).toBeInTheDocument();
    expect(screen.queryByText('Below ₹25 lakh')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /get my result/i }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/discover/result/tok123'));
    expect(submit).toHaveBeenCalledWith('customer', {
      answers: { intent: 'RENT', budgetRent: { band: 'r1' }, priorities: ['price'] },
    });
  });

  it('keeps optional questions out of the way until asked for, and lets them be skipped', async () => {
    renderWizard();
    await answerRentCore();
    await userEvent.click(screen.getByRole('button', { name: /add optional details/i }));
    expect(screen.getByText('How important is the metro?')).toBeInTheDocument();
    expect(screen.getByText('Optional')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /^skip$/i }));
    expect(screen.getByText('Check your answers')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /add optional details/i })).toBeInTheDocument();
  });

  it('offers to save only to signed-in visitors, and sends the choice', async () => {
    signedIn = true;
    renderWizard();
    await answerRentCore();
    await userEvent.click(screen.getByLabelText(/save this to my account/i));
    await userEvent.click(screen.getByRole('button', { name: /get my result/i }));
    await waitFor(() => expect(submit).toHaveBeenCalled());
    expect(submit.mock.calls[0][1]).toMatchObject({ saveToAccount: true });
  });

  it('pre-ticks saving when updating saved preferences, and still lets the person untick it', async () => {
    signedIn = true;
    search = new URLSearchParams('save=1');
    renderWizard();
    await answerRentCore();
    const box = await screen.findByLabelText(/save this to my account/i);
    expect(box).toBeChecked();
    await userEvent.click(box);
    await userEvent.click(screen.getByRole('button', { name: /get my result/i }));
    await waitFor(() => expect(submit).toHaveBeenCalled());
    expect(submit.mock.calls[0][1]).not.toHaveProperty('saveToAccount');
  });

  it('never offers to save to signed-out visitors, and submits anonymously', async () => {
    renderWizard();
    await answerRentCore();
    expect(screen.queryByLabelText(/save this to my account/i)).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /get my result/i }));
    await waitFor(() => expect(submit).toHaveBeenCalled());
    expect(submit.mock.calls[0][1]).not.toHaveProperty('saveToAccount');
  });

  it('returns to the question the server rejected and shows its message', async () => {
    submit.mockRejectedValueOnce(
      new ApiError('VALIDATION_ERROR', 400, 'Some answers are not valid', [
        { field: 'budgetRent', message: 'That budget band is not available.' },
      ]),
    );
    renderWizard();
    await answerRentCore();
    await userEvent.click(screen.getByRole('button', { name: /get my result/i }));
    expect(await screen.findByText('What is your monthly rent budget?')).toBeInTheDocument();
    expect(screen.getByText('That budget band is not available.')).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it('shows a retryable error when the assessment cannot be loaded', async () => {
    definition.mockRejectedValueOnce(new ApiError('NETWORK_ERROR', 0, 'offline'));
    renderWizard();
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach the server/i);
    await userEvent.click(screen.getByRole('button', { name: /try again|retry/i }));
    expect(await screen.findByText('What are you looking for?')).toBeInTheDocument();
  });
});

