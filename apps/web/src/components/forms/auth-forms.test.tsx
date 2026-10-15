import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { LoginForm, RegisterForm } from './auth-forms';
import { ApiError } from '@/lib/api/errors';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace, refresh: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams('next=/admin/leads'),
}));

const login = vi.fn();
const register = vi.fn();
vi.mock('@/lib/api/endpoints', () => ({
  authApi: {
    login: (...a: unknown[]) => login(...a),
    register: (...a: unknown[]) => register(...a),
  },
}));

function wrap(ui: React.ReactElement) {
  return render(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);
}

beforeEach(() => vi.clearAllMocks());

const aUser = (roles: string[]) => ({
  id: '1',
  email: 'a@b.co',
  name: 'A',
  phone: '+919876543210',
  roles,
});

describe('LoginForm', () => {
  it('shows field errors and does not submit empty', async () => {
    wrap(<LoginForm />);
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByText('Enter your email')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('signs in and follows a safe ?next', async () => {
    login.mockResolvedValue({ user: aUser(['ADMIN']) });
    wrap(<LoginForm />);
    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.co');
    await userEvent.type(screen.getByLabelText(/password/i), 'secret123');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    await waitFor(() => expect(replace).toHaveBeenCalledWith('/admin/leads'));
  });

  it('shows the API error for bad credentials', async () => {
    login.mockRejectedValue(new ApiError('INVALID_CREDENTIALS', 401, 'Invalid email or password'));
    wrap(<LoginForm />);
    await userEvent.type(screen.getByLabelText(/email/i), 'a@b.co');
    await userEvent.type(screen.getByLabelText(/password/i), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /sign in/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/incorrect email or password/i);
  });
});

describe('RegisterForm', () => {
  it('normalizes the phone number before sending', async () => {
    register.mockResolvedValue({ user: aUser(['CUSTOMER']) });
    wrap(<RegisterForm />);
    await userEvent.type(screen.getByLabelText(/full name/i), 'New User');
    await userEvent.type(screen.getByLabelText(/^email/i), 'n@x.co');
    await userEvent.type(screen.getByLabelText(/mobile number/i), '98765 43210');
    await userEvent.type(screen.getByLabelText(/^password/i), 'longenough1');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'longenough1');
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));
    await waitFor(() =>
      expect(register).toHaveBeenCalledWith({
        name: 'New User',
        email: 'n@x.co',
        phone: '+919876543210',
        password: 'longenough1',
      }),
    );
  });

  it('flags mismatched passwords', async () => {
    wrap(<RegisterForm />);
    await userEvent.type(screen.getByLabelText(/full name/i), 'New User');
    await userEvent.type(screen.getByLabelText(/^email/i), 'n@x.co');
    await userEvent.type(screen.getByLabelText(/mobile number/i), '9876543210');
    await userEvent.type(screen.getByLabelText(/^password/i), 'longenough1');
    await userEvent.type(screen.getByLabelText(/confirm password/i), 'different123');
    await userEvent.click(screen.getByRole('button', { name: /create account/i }));
    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument();
  });
});
