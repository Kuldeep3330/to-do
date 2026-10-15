import { publicUrl } from './media.urls';
import { AdminMedia } from './media.dto';

export type MediaEntity = {
  id: string;
  listingId: string;
  storageKey: string;
  contentType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  sortOrder: number;
  variant: 'ORIGINAL' | 'CARD' | 'DETAIL';
  createdAt: Date;
};

export function toAdminMedia(row: MediaEntity): AdminMedia {
  return {
    id: row.id,
    listingId: row.listingId,
    url: publicUrl(row.storageKey),
    contentType: row.contentType,
    byteSize: row.byteSize,
    width: row.width,
    height: row.height,
    sortOrder: row.sortOrder,
    variant: row.variant,
    createdAt: row.createdAt.toISOString(),
  };
}
