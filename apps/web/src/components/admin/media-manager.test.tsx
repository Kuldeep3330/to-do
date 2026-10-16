import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MediaManager, MAX_PHOTOS, MAX_PHOTO_BYTES, validatePhoto } from './media-manager';
import type { AdminListingMedia } from '@/lib/api/types';

vi.mock('@/components/ui/toast', () => ({ useToast: () => ({ success: vi.fn(), error: vi.fn() }) }));

const upload = vi.fn();
const update = vi.fn();
const remove = vi.fn();
vi.mock('@/lib/api/endpoints', () => ({
  adminMediaApi: {
    upload: (...a: unknown[]) => upload(...a),
    update: (...a: unknown[]) => update(...a),
    remove: (...a: unknown[]) => remove(...a),
  },
}));

beforeEach(() => vi.clearAllMocks());

const item = (n: number, sortOrder = n): AdminListingMedia => ({
  id: `m${n}`,
  url: `http://x/${n}.png`,
  thumbnailUrl: `http://x/${n}_card.webp`,
  contentType: 'image/png',
  byteSize: 1000,
  width: 10,
  height: 10,
  sortOrder,
});

describe('validatePhoto', () => {
  it('accepts jpeg/png/webp within the size limit', () => {
    expect(validatePhoto({ type: 'image/png', size: 1000, name: 'a.png' })).toBeNull();
    expect(validatePhoto({ type: 'image/webp', size: MAX_PHOTO_BYTES, name: 'a.webp' })).toBeNull();
  });
  it('rejects other types, oversize and empty files', () => {
    expect(validatePhoto({ type: 'image/gif', size: 1000, name: 'a.gif' })).toMatch(/only JPG, PNG or WebP/);
    expect(validatePhoto({ type: 'image/png', size: MAX_PHOTO_BYTES + 1, name: 'big.png' })).toMatch(/8 MB/);
    expect(validatePhoto({ type: 'image/png', size: 0, name: 'e.png' })).toMatch(/empty/);
  });
});

describe('MediaManager', () => {
  it('uploads valid files and reports rejected ones', async () => {
    upload.mockResolvedValue({});
    const onChanged = vi.fn();
    render(<MediaManager listingId="L1" media={[]} status="DRAFT" onChanged={onChanged} />);

    const input = document.getElementById('photo-input') as HTMLInputElement;
    const ok = new File([new Uint8Array(10)], 'ok.png', { type: 'image/png' });
    const bad = new File([new Uint8Array(10)], 'bad.gif', { type: 'image/gif' });
    await userEvent.upload(input, [ok, bad], { applyAccept: false });

    await waitFor(() => expect(upload).toHaveBeenCalledTimes(1));
    expect(upload).toHaveBeenCalledWith('L1', ok);
    expect(await screen.findByText(/bad\.gif: only JPG, PNG or WebP/)).toBeInTheDocument();
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });

  it('shows the API error for a failed upload and lets you dismiss it', async () => {
    upload.mockRejectedValue(new Error('x'));
    render(<MediaManager listingId="L1" media={[]} status="DRAFT" onChanged={vi.fn()} />);
    const input = document.getElementById('photo-input') as HTMLInputElement;
    await userEvent.upload(input, new File([new Uint8Array(10)], 'a.png', { type: 'image/png' }));
    expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(/something went wrong/i)).not.toBeInTheDocument();
  });

  it('enforces the per-listing photo limit', async () => {
    upload.mockResolvedValue({});
    const full = Array.from({ length: MAX_PHOTOS }, (_, i) => item(i));
    render(<MediaManager listingId="L1" media={full} status="DRAFT" onChanged={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Choose files' })).toBeDisabled();
  });

  it('writes explicit positions when moving a photo', async () => {
    update.mockResolvedValue({});
    const onChanged = vi.fn();
    // Two photos tied at sortOrder 0 — moving must still produce distinct positions.
    render(<MediaManager listingId="L1" media={[item(1, 0), item(2, 0)]} status="DRAFT" onChanged={onChanged} />);
    await userEvent.click(screen.getByRole('button', { name: 'Move photo 1 later' }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    // New order is [m2, m1]: m2 → 0 (unchanged, skipped), m1 → 1.
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith('m1', { sortOrder: 1 });
  });

  it('confirms before deleting and warns about the last photo of a live listing', async () => {
    remove.mockResolvedValue(undefined);
    render(<MediaManager listingId="L1" media={[item(1)]} status="PUBLISHED" onChanged={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Delete photo 1' }));
    expect(await screen.findByText(/only photo on a published listing/i)).toBeInTheDocument();
    expect(remove).not.toHaveBeenCalled();
  });
});
