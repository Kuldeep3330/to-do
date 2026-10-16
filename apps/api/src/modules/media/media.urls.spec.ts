import '../../load-env';
import { coverMedia, galleryUrls, storageGroupPrefix, type MediaRow } from './media.urls';

const rows: MediaRow[] = [
  {
    id: 'd1',
    storageKey: 'listings/l/u_detail.webp',
    contentType: 'image/webp',
    width: 1600,
    height: 900,
    sortOrder: 0,
    variant: 'DETAIL',
  },
  {
    id: 'o1',
    storageKey: 'listings/l/u.jpg',
    contentType: 'image/jpeg',
    width: 2000,
    height: 1200,
    sortOrder: 0,
    variant: 'ORIGINAL',
  },
  {
    id: 'c1',
    storageKey: 'listings/l/u_card.webp',
    contentType: 'image/webp',
    width: 600,
    height: 360,
    sortOrder: 0,
    variant: 'CARD',
  },
  {
    id: 'o2',
    storageKey: 'listings/l/v.jpg',
    contentType: 'image/jpeg',
    width: 800,
    height: 600,
    sortOrder: 2,
    variant: 'ORIGINAL',
  },
];

describe('media.urls', () => {
  it('groups CARD/DETAIL with ORIGINAL by storage key prefix', () => {
    expect(storageGroupPrefix('listings/l/u.jpg')).toBe('listings/l/u');
    expect(storageGroupPrefix('listings/l/u_card.webp')).toBe('listings/l/u');
    expect(storageGroupPrefix('listings/l/u_detail.webp')).toBe('listings/l/u');
    expect(storageGroupPrefix('listings/l/v.jpg')).toBe('listings/l/v');
  });

  it('prefers CARD at the cover ORIGINAL sortOrder', () => {
    expect(coverMedia(rows)?.id).toBe('c1');
  });

  it('falls back to ORIGINAL when CARD is missing', () => {
    const withoutCard = rows.filter((m) => m.variant !== 'CARD');
    expect(coverMedia(withoutCard)?.id).toBe('o1');
  });

  it('gallery is one entry per original in sortOrder, preferring the DETAIL rendition', () => {
    const urls = galleryUrls(rows);
    expect(urls).toEqual([
      expect.stringContaining('listings/l/u_detail.webp'), // has a DETAIL variant
      expect.stringContaining('listings/l/v.jpg'), // no variant yet: falls back to the original
    ]);
    expect(urls.some((u) => u.includes('_card'))).toBe(false);
  });
});
