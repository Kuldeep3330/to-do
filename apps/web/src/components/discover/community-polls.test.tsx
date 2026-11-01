import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ApiError } from '@/lib/api/errors';
import type { PollInsights, PublicPoll } from '@/lib/discover/types';
import { CommunityPolls } from './community-polls';

let signedIn = false;
vi.mock('@/lib/auth/use-auth', () => ({
  useMe: () => ({ data: signedIn ? { id: 'u1' } : null, isLoading: false }),
}));

vi.mock('@/lib/queries', () => ({
  useCities: () => ({ data: [{ id: 'c1', name: 'Delhi', slug: 'delhi' }] }),
  useLocalities: (slug?: string) => ({ data: slug ? [{ id: 'l1', name: 'Dwarka', slug: 'dwarka' }] : [] }),
}));

const list = vi.fn();
const vote = vi.fn();
const insights = vi.fn();
vi.mock('@/lib/api/endpoints', () => ({
  communityApi: {
    list: (...a: unknown[]) => list(...a),
    vote: (...a: unknown[]) => vote(...a),
    insights: (...a: unknown[]) => insights(...a),
  },
}));

const options = [
  { id: 'o1', label: 'Metro connectivity' },
  { id: 'o2', label: 'Affordable price' },
];

const hidden = { visible: false as const, total: 4, needed: 10 };
const shown = {
  visible: true as const,
  total: 10,
  options: [
    { optionId: 'o1', label: 'Metro connectivity', count: 7, percent: 70 },
    { optionId: 'o2', label: 'Affordable price', count: 3, percent: 30 },
  ],
};

const poll = (over: Partial<PublicPoll> = {}): PublicPoll => ({
  id: 'p1',
  question: 'What matters most when selecting a locality?',
  phase: 'OPEN',
  opensAt: null,
  closesAt: null,
  options,
  results: hidden,
  votedOptionId: null,
  ...over,
});

function renderPolls() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <CommunityPolls />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  signedIn = false;
});

describe('CommunityPolls', () => {
  it('explains when there are no polls', async () => {
    list.mockResolvedValue([]);
    renderPolls();
    expect(await screen.findByText(/no polls are open right now/i)).toBeInTheDocument();
  });

  it('shows an error with a retry when polls cannot be loaded', async () => {
    list.mockRejectedValueOnce(new ApiError('NETWORK_ERROR', 0, 'offline'));
    renderPolls();
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not reach the server/i);
  });

  it('lets anyone vote without an account once an option is chosen, then shows their vote', async () => {
    list.mockResolvedValue([poll({ results: shown })]);
    vote.mockResolvedValue(poll({ results: shown, votedOptionId: 'o1' }));
    renderPolls();

    const submit = await screen.findByRole('button', { name: 'Vote' });
    expect(submit).toBeDisabled();
    await userEvent.click(screen.getByLabelText('Metro connectivity'));
    await userEvent.click(submit);

    expect(vote).toHaveBeenCalledWith('p1', { optionId: 'o1' });
    expect(await screen.findByText(/your vote is counted/i)).toBeInTheDocument();
    expect(screen.getByText('Your vote')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Vote' })).not.toBeInTheDocument();
  });

  it('sends the optional area only when one is chosen', async () => {
    list.mockResolvedValue([poll()]);
    vote.mockResolvedValue(poll({ votedOptionId: 'o2' }));
    renderPolls();
    await userEvent.click(await screen.findByText(/add your area/i));
    await userEvent.selectOptions(screen.getByLabelText('City'), 'delhi');
    await userEvent.selectOptions(screen.getByLabelText('Locality'), 'l1');
    await userEvent.click(screen.getByLabelText('Affordable price'));
    await userEvent.click(screen.getByRole('button', { name: 'Vote' }));
    expect(vote).toHaveBeenCalledWith('p1', { optionId: 'o2', localityId: 'l1' });
  });

  it('keeps results hidden below the threshold and says why', async () => {
    list.mockResolvedValue([poll({ votedOptionId: 'o1' })]);
    renderPolls();
    expect(await screen.findByText(/results are shown once 10 people have voted/i)).toBeInTheDocument();
    expect(screen.getByText(/4 votes so far/i)).toBeInTheDocument();
    expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  });

  it('shows counts and percentages with an honest label once enough people voted', async () => {
    list.mockResolvedValue([poll({ results: shown, votedOptionId: 'o2' })]);
    renderPolls();
    const results = await screen.findByRole('list', { name: 'Results' });
    expect(within(results).getByText('70% · 7 votes')).toBeInTheDocument();
    expect(within(results).getByText('30% · 3 votes')).toBeInTheDocument();
    expect(screen.getByText(/not verified market statistics/i)).toBeInTheDocument();
  });

  it('shows a closed poll as results only, with no way to vote', async () => {
    list.mockResolvedValue([poll({ phase: 'CLOSED', closesAt: '2026-10-30T00:00:00Z', results: shown })]);
    renderPolls();
    expect(await screen.findByText('Closed', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText(/closed 30 oct 2026/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Vote' })).not.toBeInTheDocument();
    expect(screen.getByRole('list', { name: 'Results' })).toBeInTheDocument();
  });

  it('shows the server message when a vote is refused', async () => {
    list.mockResolvedValue([poll()]);
    vote.mockRejectedValue(new ApiError('CONFLICT', 409, 'You have already voted in this poll.'));
    renderPolls();
    await userEvent.click(await screen.findByLabelText('Metro connectivity'));
    await userEvent.click(screen.getByRole('button', { name: 'Vote' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/already voted/i);
  });

  it('asks signed-out visitors to sign in for the area breakdown', async () => {
    list.mockResolvedValue([poll({ results: shown, votedOptionId: 'o1' })]);
    renderPolls();
    const link = await screen.findByRole('link', { name: 'Sign in' });
    expect(link).toHaveAttribute('href', `/login?next=${encodeURIComponent('/discover/community')}`);
    expect(insights).not.toHaveBeenCalled();
  });

  it('shows signed-in users the area breakdown and notes any areas held back', async () => {
    signedIn = true;
    list.mockResolvedValue([poll({ results: shown, votedOptionId: 'o1' })]);
    const data: PollInsights = {
      id: 'p1',
      question: 'q',
      phase: 'OPEN',
      results: shown,
      areasHeldBack: 2,
      byArea: [{ localityId: 'l1', name: 'Dwarka, Delhi', results: { ...shown, total: 25 } }],
    };
    insights.mockResolvedValue(data);
    renderPolls();
    await userEvent.click(await screen.findByRole('button', { name: /see breakdown by area/i }));
    expect(await screen.findByRole('heading', { name: 'Dwarka, Delhi' })).toBeInTheDocument();
    expect(screen.getByText(/2 areas are not shown because too few people/i)).toBeInTheDocument();
  });
});
