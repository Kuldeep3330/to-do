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

export function coverMedia<T extends MediaRow>(media: T[]): T | null {
  const originals = media.filter((m) => m.variant === 'ORIGINAL');
  if (originals.length === 0) {
    return null;
  }
  const cover = originals.reduce((a, b) => (a.sortOrder <= b.sortOrder ? a : b));
  return media.find((m) => m.variant === 'CARD' && m.sortOrder === cover.sortOrder) ?? cover;
}

export function coverUrl(media: MediaRow[]): string | null {
  const cover = coverMedia(media);
  return cover ? publicUrl(cover.storageKey) : null;
}

export function galleryUrls(media: MediaRow[]): string[] {
  const originals = media
    .filter((m) => m.variant === 'ORIGINAL')
    .sort((a, b) => a.sortOrder - b.sortOrder);
  return originals.map((m) => publicUrl(m.storageKey));
}
