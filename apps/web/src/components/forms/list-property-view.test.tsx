import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ListPropertyView } from './list-property-view';

const replace = vi.fn();
const search = new URLSearchParams();
vi.mock('next/navigation', () => ({
  useSearchParams: () => search,
  useRouter: () => ({ push: vi.fn(), replace, refresh: vi.fn() }),
}));

vi.mock('@/lib/auth/use-auth', () => ({
  useMe: () => ({ data: null, isLoading: false }),
}));

vi.mock('@/lib/api/endpoints', () => ({
  publicApi: { createOwnerEnquiry: vi.fn() },
}));

function wrap(ui: React.ReactElement) {
  return render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
}

beforeEach(() => vi.clearAllMocks());

describe('ListPropertyView', () => {
  it('starts on help-me-list and keeps the owner enquiry form', async () => {
    wrap(<ListPropertyView />);
    expect(screen.getByRole('tab', { name: /help me list/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: /request a visit from our team/i })).toBeInTheDocument();
  });

  it('switches to self-list and asks signed-out visitors to sign in', async () => {
    wrap(<ListPropertyView />);
    await userEvent.click(screen.getByRole('tab', { name: /i will list it/i }));
    expect(screen.getByRole('tab', { name: /i will list it/i })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute(
      'href',
      `/login?next=${encodeURIComponent('/list-property?mode=self')}`,
    );
    expect(screen.getByText(/sign in to list it yourself/i)).toBeInTheDocument();
  });
});
