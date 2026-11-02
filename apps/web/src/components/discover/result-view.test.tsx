import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@/lib/api/errors';
import type { DiscoverStoredResult } from '@/lib/discover/types';
import { ResultView } from './result-view';

let signedIn = false;
vi.mock('@/lib/auth/use-auth', () => ({
  useMe: () => ({ data: signedIn ? { id: 'u1' } : null, isLoading: false }),
}));

const result = vi.fn();
const claim = vi.fn();
const deleteMine = vi.fn();
vi.mock('@/lib/api/endpoints', () => ({
  discoverApi: {
    result: (...a: unknown[]) => result(...a),
    claim: (...a: unknown[]) => claim(...a),
    deleteMine: (...a: unknown[]) => deleteMine(...a),
  },
}));

const base = {
  version: 1,
  selfReported: true as const,
  saved: false,
  createdAt: '2026-11-01T00:00:00Z',
  localities: [{ id: 'l1', name: 'Indirapuram', slug: 'indirapuram', cityName: 'Ghaziabad', citySlug: 'ghaziabad' }],
};

const customer: DiscoverStoredResult = {
  ...base,
  kind: 'CUSTOMER',
  slug: 'customer',
  title: 'Find Your Home Preferences',
  disclaimer: 'This summarises what you told us.',
  summary: [{ question: 'What are you looking for?', answer: 'Home for rent' }],
  preferences: {
    intents: ['RENT'],
    localityIds: ['l1'],
    flexibleLocation: false,
    otherLocation: false,
    budgets: { RENT: { min: 15000, max: 20000 } },
    propertyType: 'apartment',
    bedrooms: '2',
    timeline: '1_month',
    priorities: ['price'],
    transit: null,
    neighbourhood: [],
    trust: [],
  },
};

const owner: DiscoverStoredResult = {
  ...base,
  kind: 'OWNER',
  slug: 'owner',
  title: 'Is Your Property Ready to List?',
  disclaimer: 'This is a preparation score, not a property verification score.',
  summary: [{ question: 'Do you have recent property photographs?', answer: 'No' }],
  readiness: {
    score: 66,
    band: 'ALMOST_READY',
    bandLabel: 'Almost ready',
    factors: [
      { key: 'photos', label: 'Photographs', points: 0, max: 15 },
      { key: 'availability', label: 'Availability information', points: 20, max: 20 },
    ],
    nextSteps: ['Add recent photographs of each room and the building entrance.'],
  },
};

const agent: DiscoverStoredResult = {
  ...base,
  kind: 'AGENT',
  slug: 'agent',
  title: 'NCR Homes Agent Service Profile',
  disclaimer: 'These are self-reported capabilities. They are not verified.',
  summary: [{ question: 'What is your typical response time?', answer: 'Within 1 hour' }],
};

function renderResult() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <ResultView token="tok" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  signedIn = false;
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('ResultView', () => {
  it('shows a customer profile with a search link built from the preferences', async () => {
    result.mockResolvedValue(customer);
    renderResult();
    expect(await screen.findByRole('heading', { name: 'Find Your Home Preferences' })).toBeInTheDocument();
    expect(screen.getByText('Home for rent')).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /see homes for rent/i });
    expect(link).toHaveAttribute('href', expect.stringContaining('/search?'));
    expect(link.getAttribute('href')).toContain('locality=indirapuram');
    expect(link.getAttribute('href')).toContain('maxPrice=20000');
    expect(screen.queryByText(/%|match score/i)).not.toBeInTheDocument();
  });

  it('labels the owner score as preparation, not verification, and lists next steps', async () => {
    result.mockResolvedValue(owner);
    renderResult();
    expect(await screen.findByRole('img', { name: /preparation score 66 out of 100/i })).toBeInTheDocument();
    expect(screen.getByText('Almost ready')).toBeInTheDocument();
    expect(screen.getByText(/does not verify the property/i)).toBeInTheDocument();
    expect(screen.getByText(/not a property verification score/i)).toBeInTheDocument();
    expect(screen.getByText(/add recent photographs/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /list it yourself/i })).toHaveAttribute('href', '/list-property?mode=self');
  });

  it('presents an agent profile as self-reported, with no score or ranking', async () => {
    result.mockResolvedValue(agent);
    renderResult();
    expect(await screen.findByText(/self-reported by you\. not verified\./i)).toBeInTheDocument();
    expect(screen.getByText(/not used to rank anyone/i)).toBeInTheDocument();
    expect(screen.queryByRole('img', { name: /score/i })).not.toBeInTheDocument();
  });

  it('explains a missing or deleted result instead of failing silently', async () => {
    result.mockRejectedValue(new ApiError('NOT_FOUND', 404, 'Result not found'));
    renderResult();
    expect(await screen.findByText(/could not find this result/i)).toBeInTheDocument();
    expect(result).toHaveBeenCalledTimes(1);
  });

  it('sends signed-out visitors to sign in and back to this result', async () => {
    result.mockResolvedValue(customer);
    renderResult();
    const link = await screen.findByRole('link', { name: /sign in to save/i });
    expect(link).toHaveAttribute('href', `/login?next=${encodeURIComponent('/discover/result/tok')}`);
  });

  it('lets a signed-in visitor save an anonymous result', async () => {
    signedIn = true;
    result.mockResolvedValueOnce(customer).mockResolvedValue({ ...customer, saved: true });
    claim.mockResolvedValue({ saved: true });
    renderResult();
    await userEvent.click(await screen.findByRole('button', { name: /save to my account/i }));
    expect(claim).toHaveBeenCalledWith('tok');
    expect(await screen.findByText(/saved to your account/i)).toBeInTheDocument();
  });

  it('lets a signed-in owner of a saved result delete their Discover data after confirming', async () => {
    signedIn = true;
    result.mockResolvedValue({ ...customer, saved: true });
    deleteMine.mockResolvedValue({});
    renderResult();
    await userEvent.click(await screen.findByRole('button', { name: /delete my saved discover data/i }));
    await waitFor(() => expect(deleteMine).toHaveBeenCalledTimes(1));
    expect(window.confirm).toHaveBeenCalled();
  });

  it('does not delete anything when the confirmation is declined', async () => {
    signedIn = true;
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    result.mockResolvedValue({ ...customer, saved: true });
    renderResult();
    await userEvent.click(await screen.findByRole('button', { name: /delete my saved discover data/i }));
    expect(deleteMine).not.toHaveBeenCalled();
  });
});
