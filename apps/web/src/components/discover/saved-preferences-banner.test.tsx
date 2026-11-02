import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { DiscoverProfile } from '@/lib/discover/types';
import { SavedPreferencesBanner } from './saved-preferences-banner';

let signedIn = true;
vi.mock('@/lib/auth/use-auth', () => ({
  useMe: () => ({ data: signedIn ? { id: 'u1' } : null, isLoading: false }),
}));

const profile = vi.fn();
vi.mock('@/lib/api/endpoints', () => ({ discoverApi: { profile: (...a: unknown[]) => profile(...a) } }));

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
    bedrooms: '2',
    timeline: '1_month',
    priorities: [],
    transit: null,
    neighbourhood: [],
    trust: [],
  },
};

const renderBanner = (filtersActive: boolean) =>
  render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <SavedPreferencesBanner filtersActive={filtersActive} />
    </QueryClientProvider>,
  );

beforeEach(() => {
  vi.clearAllMocks();
  signedIn = true;
  profile.mockResolvedValue(saved);
});

describe('SavedPreferencesBanner', () => {
  it('offers a visible filtered search from the saved profile', async () => {
    renderBanner(false);
    const link = await screen.findByRole('link', { name: /see homes for rent/i });
    expect(link.getAttribute('href')).toContain('city=delhi');
    expect(link.getAttribute('href')).toContain('locality=dwarka');
  });

  it('stays out of the way once the visitor has chosen filters, without fetching', () => {
    renderBanner(true);
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(profile).not.toHaveBeenCalled();
  });

  it('shows nothing to signed-out visitors and never asks for a profile', () => {
    signedIn = false;
    renderBanner(false);
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
    expect(profile).not.toHaveBeenCalled();
  });

  it('shows nothing when no profile was saved', async () => {
    profile.mockResolvedValue(null);
    renderBanner(false);
    await vi.waitFor(() => expect(profile).toHaveBeenCalled());
    expect(screen.queryByRole('complementary')).not.toBeInTheDocument();
  });
});
