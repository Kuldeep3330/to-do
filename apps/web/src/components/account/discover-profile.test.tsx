import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { DiscoverDefinition, DiscoverProfile } from '@/lib/discover/types';
import { DiscoverProfileView } from './discover-profile';

const profile = vi.fn();
const definition = vi.fn();
const deleteMine = vi.fn();
vi.mock('@/lib/api/endpoints', () => ({
  discoverApi: {
    profile: (...a: unknown[]) => profile(...a),
    definition: (...a: unknown[]) => definition(...a),
    deleteMine: (...a: unknown[]) => deleteMine(...a),
  },
}));

const def = {
  kind: 'CUSTOMER',
  slug: 'customer',
  version: 1,
  title: 'x',
  description: '',
  minutes: 4,
  disclaimer: '',
  questions: [
    { id: 'propertyType', type: 'single', label: 'Type', required: true, options: [{ value: 'apartment', label: 'Apartment / Flat' }] },
    { id: 'timeline', type: 'single', label: 'When', required: true, options: [{ value: '1_month', label: 'Within 1 month' }] },
  ],
} as DiscoverDefinition;

const saved: DiscoverProfile = {
  version: 1,
  updatedAt: '2026-11-01T00:00:00Z',
  localities: [{ id: 'l1', name: 'Dwarka', slug: 'dwarka', cityName: 'Delhi', citySlug: 'delhi' }],
  preferences: {
    intents: ['RENT'],
    localityIds: ['l1'],
    flexibleLocation: false,
    otherLocation: false,
    budgets: { RENT: { min: 15000, max: 20000 } },
    propertyType: 'apartment',
    bedrooms: null,
    timeline: '1_month',
    priorities: [],
    transit: null,
    neighbourhood: [],
    trust: [],
  },
};

const renderView = () =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <DiscoverProfileView />
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  definition.mockResolvedValue(def);
  profile.mockResolvedValue(saved);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('DiscoverProfileView', () => {
  it('shows the saved profile in plain language with ways to search and update it', async () => {
    renderView();
    expect(await screen.findByText('Dwarka, Delhi')).toBeInTheDocument();
    expect(screen.getByText('₹15,000–₹20,000/month')).toBeInTheDocument();
    expect(screen.getByText('Apartment / Flat')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /see homes for rent/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /update my preferences/i })).toHaveAttribute('href', '/discover/customer?save=1');
  });

  it('invites people without a profile to create one', async () => {
    profile.mockResolvedValue(null);
    renderView();
    expect(await screen.findByText(/no saved home preferences/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /find your home preferences/i })).toHaveAttribute('href', '/discover/customer?save=1');
  });

  it('deletes only after confirmation', async () => {
    deleteMine.mockResolvedValue({});
    renderView();
    await userEvent.click(await screen.findByRole('button', { name: /delete my discover data/i }));
    await waitFor(() => expect(deleteMine).toHaveBeenCalledTimes(1));
  });

  it('does nothing when the confirmation is declined', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderView();
    await userEvent.click(await screen.findByRole('button', { name: /delete my discover data/i }));
    expect(deleteMine).not.toHaveBeenCalled();
  });

  it('shows an error when the profile cannot be loaded', async () => {
    profile.mockRejectedValueOnce(new Error('boom'));
    renderView();
    expect(await screen.findByRole('alert')).toBeInTheDocument();
  });
});
