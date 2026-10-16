import { env } from '../../config/env';

export type MediaRow = {
  id: string;
  storageKey: string;
  contentType: string;
  width: number | null;
  height: number | null;
  sortOrder: number;
  variant: 'ORIGINAL' | 'CARD' | 'DETAIL';
};

export function publicUrl(storageKey: string): string {
  const base = env().S3_PUBLIC_BASE_URL.replace(/\/+$/g, '');
  return `${base}/${storageKey.replace(/^\/+/g, '')}`;
}

export function storageGroupPrefix(storageKey: string): string {
  return storageKey
    .replace(/_card\.webp$/i, '')
    .replace(/_detail\.webp$/i, '')
    .replace(/\.[^.]+$/, '');
}

export function coverMedia<T extends MediaRow>(media: T[]): T | null {
  const originals = media.filter((m) => m.variant === 'ORIGINAL');
  if (originals.length === 0) {
    return null;
  }
  const cover = originals.reduce((a, b) => (a.sortOrder < b.sortOrder || (a.sortOrder === b.sortOrder && a.id < b.id) ? a : b));
  const prefix = storageGroupPrefix(cover.storageKey);
  return media.find((m) => m.variant === 'CARD' && storageGroupPrefix(m.storageKey) === prefix) ?? cover;
}

export function coverUrl(media: MediaRow[]): string | null {
  const cover = coverMedia(media);
  return cover ? publicUrl(cover.storageKey) : null;
}

export function galleryUrls(media: MediaRow[]): string[] {
  const originals = media
    .filter((m) => m.variant === 'ORIGINAL')
    .sort((a, b) => a.sortOrder - b.sortOrder);
  // Serve the 1600px DETAIL rendition when it exists; originals can be several MB.
  const details = new Map(
    media.filter((m) => m.variant === 'DETAIL').map((m) => [storageGroupPrefix(m.storageKey), m]),
  );
  return originals.map((m) => publicUrl((details.get(storageGroupPrefix(m.storageKey)) ?? m).storageKey));
}
