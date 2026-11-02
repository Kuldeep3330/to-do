import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { AdminPoll } from '@/lib/discover/types';
import { PollsView } from './polls-view';

const notFound = vi.fn(() => {
  throw new Error('NEXT_NOT_FOUND');
});
vi.mock('next/navigation', () => ({ notFound: () => notFound() }));

let roles = ['ADMIN'];
vi.mock('@/lib/auth/use-auth', () => ({
  useMe: () => ({ data: { id: 'u1', roles }, isLoading: false }),
  isAdmin: (u: { roles: string[] } | null) => !!u?.roles.some((r) => r === 'ADMIN' || r === 'SUPER_ADMIN'),
}));

const toast = { success: vi.fn(), error: vi.fn() };
vi.mock('@/components/ui/toast', () => ({ useToast: () => toast }));

const list = vi.fn();
const create = vi.fn();
const update = vi.fn();
const publish = vi.fn();
const close = vi.fn();
const archive = vi.fn();
vi.mock('@/lib/api/endpoints', () => ({
  adminPollsApi: {
    list: (...a: unknown[]) => list(...a),
    create: (...a: unknown[]) => create(...a),
    update: (...a: unknown[]) => update(...a),
    publish: (...a: unknown[]) => publish(...a),
    close: (...a: unknown[]) => close(...a),
    archive: (...a: unknown[]) => archive(...a),
  },
}));

const poll = (over: Partial<AdminPoll> = {}): AdminPoll => ({
  id: 'p1',
  question: 'Which property type do you prefer?',
  status: 'DRAFT',
  phase: 'DRAFT',
  opensAt: null,
  closesAt: null,
  options: [
    { id: 'o1', label: 'Apartment', count: 0 },
    { id: 'o2', label: 'Villa', count: 0 },
  ],
  total: 0,
  createdAt: '2026-11-01T00:00:00Z',
  ...over,
});

function renderView() {
  return render(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      <PollsView />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  roles = ['ADMIN'];
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

describe('PollsView', () => {
  it('hides the page from staff who are not admins', () => {
    roles = ['SALES_AGENT'];
    list.mockResolvedValue([]);
    expect(() => renderView()).toThrow('NEXT_NOT_FOUND');
  });

  it('lists polls with their state and per-option counts, never anything about voters', async () => {
    list.mockResolvedValue([
      poll(),
      poll({ id: 'p2', question: 'What do you expect most from an agent?', status: 'PUBLISHED', phase: 'OPEN', total: 12,
        options: [{ id: 'a', label: 'Fast response', count: 9 }, { id: 'b', label: 'Honest information', count: 3 }] }),
    ]);
    renderView();
    expect(await screen.findByText('Which property type do you prefer?')).toBeInTheDocument();
    expect(screen.getByText('Draft')).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
    expect(screen.getByText(/12 votes/)).toBeInTheDocument();
    const open = screen.getByText('What do you expect most from an agent?').closest('li') as HTMLElement;
    expect(within(open).getByText('9')).toBeInTheDocument();
  });

  it('offers only the actions that make sense for each state', async () => {
    list.mockResolvedValue([
      poll(),
      poll({ id: 'p2', question: 'An open poll about something?', status: 'PUBLISHED', phase: 'OPEN' }),
      poll({ id: 'p3', question: 'An archived poll about nothing?', status: 'ARCHIVED', phase: 'ARCHIVED' }),
    ]);
    renderView();
    const row = async (text: string) => (await screen.findByText(text)).closest('li') as HTMLElement;
    const draft = await row('Which property type do you prefer?');
    expect(within(draft).getByRole('button', { name: 'Publish' })).toBeInTheDocument();
    expect(within(draft).queryByRole('button', { name: 'Close now' })).not.toBeInTheDocument();
    const open = await row('An open poll about something?');
    expect(within(open).getByRole('button', { name: 'Close now' })).toBeInTheDocument();
    expect(within(open).queryByRole('button', { name: 'Publish' })).not.toBeInTheDocument();
    const archived = await row('An archived poll about nothing?');
    expect(within(archived).queryAllByRole('button')).toHaveLength(0);
  });

  it('publishes a draft without asking, but asks before closing or archiving', async () => {
    list.mockResolvedValue([poll(), poll({ id: 'p2', question: 'An open poll about something?', status: 'PUBLISHED', phase: 'OPEN' })]);
    publish.mockResolvedValue({ id: 'p1' });
    close.mockResolvedValue({ id: 'p2' });
    renderView();
    const draft = (await screen.findByText('Which property type do you prefer?')).closest('li') as HTMLElement;
    await userEvent.click(within(draft).getByRole('button', { name: 'Publish' }));
    expect(publish).toHaveBeenCalledWith('p1');
    expect(window.confirm).not.toHaveBeenCalled();

    const open = (await screen.findByText('An open poll about something?')).closest('li') as HTMLElement;
    await userEvent.click(within(open).getByRole('button', { name: 'Close now' }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringMatching(/no longer be able to vote/i));
    expect(close).toHaveBeenCalledWith('p2');
  });

  it('does nothing when a close is not confirmed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    list.mockResolvedValue([poll({ status: 'PUBLISHED', phase: 'OPEN' })]);
    renderView();
    await userEvent.click(await screen.findByRole('button', { name: 'Close now' }));
    expect(close).not.toHaveBeenCalled();
  });

  it('creates a draft from one option per line and sends dates as instants', async () => {
    list.mockResolvedValue([]);
    create.mockResolvedValue({ id: 'new' });
    renderView();
    await userEvent.click(await screen.findByRole('button', { name: /new poll/i }));
    await userEvent.type(screen.getByLabelText(/^Question/), 'What matters most when selecting a locality?');
    await userEvent.type(screen.getByLabelText(/^Options/), 'Metro{Enter}Price{Enter}{Enter}Parks');
    await userEvent.click(screen.getByRole('button', { name: 'Create draft' }));
    expect(create).toHaveBeenCalledWith({
      question: 'What matters most when selecting a locality?',
      options: ['Metro', 'Price', 'Parks'],
      opensAt: null,
      closesAt: null,
    });
    expect(toast.success).toHaveBeenCalledWith('Poll created as a draft');
  });

  it('explains what is wrong instead of sending an incomplete poll', async () => {
    list.mockResolvedValue([]);
    renderView();
    await userEvent.click(await screen.findByRole('button', { name: /new poll/i }));
    await userEvent.type(screen.getByLabelText(/^Question/), 'Short');
    await userEvent.type(screen.getByLabelText(/^Options/), 'Only one');
    await userEvent.click(screen.getByRole('button', { name: 'Create draft' }));
    expect(screen.getByText(/write the full question/i)).toBeInTheDocument();
    expect(screen.getByText(/add at least 2 different options/i)).toBeInTheDocument();
    expect(create).not.toHaveBeenCalled();
  });

  it('locks the question and options once a poll has votes, and still saves new dates', async () => {
    list.mockResolvedValue([poll({ status: 'PUBLISHED', phase: 'OPEN', total: 4 })]);
    update.mockResolvedValue({ id: 'p1' });
    renderView();
    await userEvent.click(await screen.findByRole('button', { name: 'Edit' }));
    expect(screen.getByText(/already has votes, so its question and options are locked/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^Question/)).toBeDisabled();
    expect(screen.getByLabelText(/^Options/)).toBeDisabled();
    await userEvent.type(screen.getByLabelText(/^Closes/), '2030-01-01T10:00');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    const [id, body] = update.mock.calls[0];
    expect(id).toBe('p1');
    expect(Object.keys(body).sort()).toEqual(['closesAt', 'opensAt']);
    expect(body.closesAt).toMatch(/^2030-01-01T/);
  });

  it('shows the server reason when saving is refused', async () => {
    list.mockResolvedValue([]);
    const { ApiError } = await import('@/lib/api/errors');
    create.mockRejectedValue(new ApiError('VALIDATION_ERROR', 400, 'Invalid dates', [{ field: 'closesAt', message: 'Closing time must be after the opening time.' }]));
    renderView();
    await userEvent.click(await screen.findByRole('button', { name: /new poll/i }));
    await userEvent.type(screen.getByLabelText(/^Question/), 'What matters most when selecting a locality?');
    await userEvent.type(screen.getByLabelText(/^Options/), 'Metro{Enter}Price');
    await userEvent.click(screen.getByRole('button', { name: 'Create draft' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Closing time must be after the opening time.');
  });
});
