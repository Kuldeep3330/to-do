'use client';

import * as React from 'react';
import { ArrowLeft, ArrowRight, ImagePlus, Loader2, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/dialog';
import { Alert } from '@/components/ui/feedback';
import { useToast } from '@/components/ui/toast';
import { adminMediaApi } from '@/lib/api/endpoints';
import { errorMessage } from '@/lib/api/errors';
import type { AdminListingMedia, ListingStatus } from '@/lib/api/types';
import { cn } from '@/lib/utils';

export const MAX_PHOTOS = 20;
export const MAX_PHOTO_BYTES = 8 * 1024 * 1024;
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

/** Client-side precheck. The API re-validates (magic bytes, dimensions) and is the authority. */
export function validatePhoto(file: { type: string; size: number; name: string }): string | null {
  if (!ALLOWED.includes(file.type)) return `${file.name}: only JPG, PNG or WebP images are allowed.`;
  if (file.size > MAX_PHOTO_BYTES) return `${file.name}: larger than 8 MB.`;
  if (file.size === 0) return `${file.name}: the file is empty.`;
  return null;
}

type Pending = { key: string; name: string; state: 'uploading' | 'error'; message?: string };

type Props = {
  listingId: string;
  media: AdminListingMedia[];
  status: ListingStatus;
  onChanged: () => Promise<unknown> | void;
};

export function MediaManager({ listingId, media, status, onChanged }: Props) {
  const toast = useToast();
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [pending, setPending] = React.useState<Pending[]>([]);
  const [rejected, setRejected] = React.useState<string[]>([]);
  const [dragging, setDragging] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [deleting, setDeleting] = React.useState<AdminListingMedia | null>(null);
  const [deleteBusy, setDeleteBusy] = React.useState(false);

  const uploading = pending.filter((p) => p.state === 'uploading').length;
  const slotsLeft = MAX_PHOTOS - media.length - uploading;
  const isLastOfLive = status === 'PUBLISHED' && media.length <= 1;

  async function addFiles(list: FileList | File[]) {
    const files = Array.from(list);
    const problems: string[] = [];
    const accepted: File[] = [];
    for (const f of files) {
      const problem = validatePhoto(f);
      if (problem) problems.push(problem);
      else if (accepted.length >= slotsLeft) problems.push(`${f.name}: the limit is ${MAX_PHOTOS} photos per listing.`);
      else accepted.push(f);
    }
    setRejected(problems);
    if (accepted.length === 0) return;

    const entries = accepted.map((f, i) => ({ file: f, key: `${Date.now()}-${i}-${f.name}` }));
    setPending((p) => [...p, ...entries.map((e) => ({ key: e.key, name: e.file.name, state: 'uploading' as const }))]);

    // Sequential: the API assigns sort order under a row lock, and keeps order = upload order.
    for (const { file, key } of entries) {
      try {
        await adminMediaApi.upload(listingId, file);
        setPending((p) => p.filter((x) => x.key !== key));
        await onChanged();
      } catch (e) {
        setPending((p) => p.map((x) => (x.key === key ? { ...x, state: 'error', message: errorMessage(e) } : x)));
      }
    }
  }

  async function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= media.length) return;
    const order = [...media];
    [order[index], order[target]] = [order[target], order[index]];
    setBusy(true);
    try {
      // Write explicit positions for every row whose stored order differs (handles ties).
      await Promise.all(
        order.map((m, i) => (m.sortOrder === i ? null : adminMediaApi.update(m.id, { sortOrder: i }))),
      );
      await onChanged();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await adminMediaApi.remove(deleting.id);
      toast.success('Photo deleted');
      setDeleting(null);
      await onChanged();
    } catch (e) {
      toast.error(errorMessage(e));
      setDeleting(null);
    } finally {
      setDeleteBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files);
        }}
        className={cn(
          'flex flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors',
          dragging ? 'border-brand-600 bg-brand-50' : 'border-border-strong bg-surface-muted',
        )}
      >
        <ImagePlus className="mb-2 h-7 w-7 text-ink-subtle" aria-hidden />
        <p className="text-sm font-medium">Drag photos here, or</p>
        <input
          ref={inputRef}
          id="photo-input"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="sr-only"
          onChange={(e) => {
            if (e.target.files?.length) void addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="mt-2"
          disabled={slotsLeft <= 0}
          onClick={() => inputRef.current?.click()}
        >
          Choose files
        </Button>
        <p className="mt-2 text-xs text-ink-subtle">
          JPG, PNG or WebP · up to 8 MB each · {media.length}/{MAX_PHOTOS} used. The first photo is the cover.
        </p>
      </div>

      {rejected.length > 0 && (
        <Alert tone="warning" title="Some files were skipped">
          <ul className="list-disc pl-5">
            {rejected.map((r) => (
              <li key={r}>{r}</li>
            ))}
          </ul>
        </Alert>
      )}

      {pending.length > 0 && (
        <ul className="space-y-1" aria-label="Uploads">
          {pending.map((p) => (
            <li key={p.key} className="flex items-center gap-2 text-sm">
              {p.state === 'uploading' ? (
                <Loader2 className="h-4 w-4 animate-spin text-brand-600" aria-hidden />
              ) : (
                <span className="text-danger-600" aria-hidden>
                  ✕
                </span>
              )}
              <span className="truncate">{p.name}</span>
              <span className={p.state === 'error' ? 'text-danger-600' : 'text-ink-subtle'}>
                {p.state === 'uploading' ? 'Uploading…' : p.message}
              </span>
              {p.state === 'error' && (
                <button
                  type="button"
                  className="cursor-pointer text-xs text-ink-subtle underline"
                  onClick={() => setPending((all) => all.filter((x) => x.key !== p.key))}
                >
                  Dismiss
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {media.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4" aria-label="Photos">
          {media.map((m, i) => (
            <li key={m.id} className="overflow-hidden rounded-lg border border-border bg-surface">
              <div className="relative aspect-[4/3] bg-surface-sunken">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={m.thumbnailUrl} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" loading="lazy" />
                {i === 0 && (
                  <span className="absolute left-2 top-2 rounded bg-brand-600 px-2 py-0.5 text-xs font-medium text-white">
                    Cover
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-1 p-2">
                <span className="text-xs text-ink-subtle">#{i + 1}</span>
                <div className="flex">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Move photo ${i + 1} earlier`}
                    disabled={i === 0 || busy}
                    onClick={() => move(i, -1)}
                  >
                    <ArrowLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Move photo ${i + 1} later`}
                    disabled={i === media.length - 1 || busy}
                    onClick={() => move(i, 1)}
                  >
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Delete photo ${i + 1}`}
                    disabled={busy}
                    onClick={() => setDeleting(m)}
                  >
                    <Trash2 className="h-4 w-4 text-danger-600" />
                  </Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Delete this photo?"
        description={
          isLastOfLive
            ? 'This is the only photo on a published listing, so it cannot be deleted. Pause the listing first or add another photo.'
            : 'This removes the photo and its resized versions permanently.'
        }
        confirmLabel="Delete"
        tone="danger"
        loading={deleteBusy}
        onConfirm={confirmDelete}
      />
    </div>
  );
}
