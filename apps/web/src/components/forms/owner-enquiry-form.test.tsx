import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OwnerEnquiryForm } from './owner-enquiry-form';

const createOwnerEnquiry = vi.fn();
vi.mock('@/lib/api/endpoints', () => ({
  publicApi: {
    createOwnerEnquiry: (...a: unknown[]) => createOwnerEnquiry(...a),
  },
}));

beforeEach(() => vi.clearAllMocks());

describe('OwnerEnquiryForm', () => {
  it('shows field errors and does not submit empty', async () => {
    render(<OwnerEnquiryForm />);
    await userEvent.click(screen.getByRole('button', { name: /request a visit from our team/i }));
    expect(await screen.findByText('Enter the city')).toBeInTheDocument();
    expect(screen.getByText('Enter your name')).toBeInTheDocument();
    expect(createOwnerEnquiry).not.toHaveBeenCalled();
  });

  it('submits a rent enquiry and shows thanks', async () => {
    createOwnerEnquiry.mockResolvedValue({ data: { ok: true } });
    render(<OwnerEnquiryForm />);
    await userEvent.type(screen.getByLabelText(/^City/), 'Noida');
    await userEvent.type(screen.getByLabelText(/^Your name/), 'Asha Sharma');
    await userEvent.type(screen.getByLabelText(/^Mobile number/), '9876543210');
    await userEvent.click(screen.getByRole('button', { name: /request a visit from our team/i }));
    await waitFor(() => expect(createOwnerEnquiry).toHaveBeenCalledTimes(1));
    expect(createOwnerEnquiry).toHaveBeenCalledWith(
      expect.objectContaining({
        intent: 'RENT',
        city: 'Noida',
        name: 'Asha Sharma',
        phone: '+919876543210',
      }),
    );
    expect(await screen.findByText(/Thanks, Asha/)).toBeInTheDocument();
  });
});
