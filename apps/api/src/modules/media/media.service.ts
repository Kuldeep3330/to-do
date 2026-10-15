import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../prisma/prisma.service';
import {
  assertAllowedUpload,
  encodeVariant,
  originalExtension,
  readDimensions,
  CARD_WIDTH,
  DETAIL_WIDTH,
} from './media.image';
import { toAdminMedia } from './media.mapper';
import { AdminMedia } from './media.dto';
import { storageGroupPrefix } from './media.urls';
import { STORAGE_PORT, StoragePort } from './storage.port';

const MAX_ORIGINAL = 20;

export type UploadFile = {
  buffer: Buffer;
  mimetype: string;
  originalname: string;
  size: number;
};

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(STORAGE_PORT) private readonly storage: StoragePort,
  ) {}

  async upload(listingId: string, file: UploadFile | undefined): Promise<{
    data: AdminMedia & { variants: AdminMedia[] };
  }> {
    if (!file) {
      throw AppError.validation('File is required', [{ path: 'file', message: 'File is required' }]);
    }
    const mime = assertAllowedUpload(file);
    const dimensions = await readDimensions(file.buffer);

    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, deletedAt: null },
      select: { id: true },
    });
    if (!listing) {
      throw AppError.notFound('Listing not found');
    }

    const earlyCount = await this.prisma.media.count({
      where: { listingId, variant: 'ORIGINAL' },
    });
    if (earlyCount >= MAX_ORIGINAL) {
      throw AppError.conflict('Maximum of 20 ORIGINAL images per listing');
    }

    const uuid = randomUUID();
    const ext = originalExtension(mime);
    const originalKey = `listings/${listingId}/${uuid}.${ext}`;
    const cardKey = `listings/${listingId}/${uuid}_card.webp`;
    const detailKey = `listings/${listingId}/${uuid}_detail.webp`;
    const uploadedKeys: string[] = [];

    try {
      await this.storage.put(originalKey, file.buffer, mime);
      uploadedKeys.push(originalKey);

      const card = await encodeVariant(file.buffer, CARD_WIDTH);
      await this.storage.put(cardKey, card.buffer, 'image/webp');
      uploadedKeys.push(cardKey);

      const detail = await encodeVariant(file.buffer, DETAIL_WIDTH);
      await this.storage.put(detailKey, detail.buffer, 'image/webp');
      uploadedKeys.push(detailKey);

      const rows = await this.prisma.$transaction(
        async (tx) => {
          const locked = await tx.$queryRaw<{ id: string; deleted_at: Date | null }[]>`
            SELECT id, deleted_at FROM listings WHERE id = ${listingId}::uuid FOR UPDATE`;
          if (locked.length === 0 || locked[0].deleted_at) {
            throw AppError.notFound('Listing not found');
          }

          const originalCount = await tx.media.count({
            where: { listingId, variant: 'ORIGINAL' },
          });
          if (originalCount >= MAX_ORIGINAL) {
            throw AppError.conflict('Maximum of 20 ORIGINAL images per listing');
          }

          const maxSort = await tx.media.aggregate({
            where: { listingId, variant: 'ORIGINAL' },
            _max: { sortOrder: true },
          });
          const sortOrder = (maxSort._max.sortOrder ?? -1) + 1;

          const original = await tx.media.create({
            data: {
              listingId,
              storageKey: originalKey,
              contentType: mime,
              byteSize: file.buffer.length,
              width: dimensions.width,
              height: dimensions.height,
              sortOrder,
              variant: 'ORIGINAL',
            },
          });
          const cardRow = await tx.media.create({
            data: {
              listingId,
              storageKey: cardKey,
              contentType: 'image/webp',
              byteSize: card.buffer.length,
              width: card.width,
              height: card.height,
              sortOrder,
              variant: 'CARD',
            },
          });
          const detailRow = await tx.media.create({
            data: {
              listingId,
              storageKey: detailKey,
              contentType: 'image/webp',
              byteSize: detail.buffer.length,
              width: detail.width,
              height: detail.height,
              sortOrder,
              variant: 'DETAIL',
            },
          });
          return [original, cardRow, detailRow];
        },
        { timeout: 5000 },
      );

      const [original, ...variants] = rows;
      return { data: { ...toAdminMedia(original), variants: variants.map(toAdminMedia) } };
    } catch (e) {
      await this.bestEffortDelete(uploadedKeys);
      throw e;
    }
  }

  async patchSortOrder(id: string, sortOrder: number) {
    const row = await this.prisma.media.findFirst({ where: { id } });
    if (!row) {
      throw AppError.notFound('Media not found');
    }
    const group = await this.prisma.media.findMany({
      where: {
        listingId: row.listingId,
        storageKey: { startsWith: storageGroupPrefix(row.storageKey) },
      },
    });
    await this.prisma.media.updateMany({
      where: { id: { in: group.map((g) => g.id) } },
      data: { sortOrder },
    });
    const updated = await this.prisma.media.findFirst({ where: { id } });
    if (!updated) {
      throw AppError.notFound('Media not found');
    }
    return toAdminMedia(updated);
  }

  async remove(id: string) {
    const row = await this.prisma.media.findFirst({ where: { id } });
    if (!row) {
      throw AppError.notFound('Media not found');
    }

    const prefix = storageGroupPrefix(row.storageKey);
    const keys = await this.prisma.$transaction(
      async (tx) => {
        const locked = await tx.$queryRaw<{ id: string; status: string; deleted_at: Date | null }[]>`
          SELECT id, status, deleted_at FROM listings WHERE id = ${row.listingId}::uuid FOR UPDATE`;
        if (locked.length === 0 || locked[0].deleted_at) {
          throw AppError.notFound('Listing not found');
        }
        const group = await tx.media.findMany({
          where: {
            listingId: row.listingId,
            storageKey: { startsWith: prefix },
          },
        });
        if (group.length === 0) {
          throw AppError.notFound('Media not found');
        }
        const deletingOriginal = group.some((g) => g.variant === 'ORIGINAL');
        if (deletingOriginal && locked[0].status === 'PUBLISHED') {
          const originalCount = await tx.media.count({
            where: { listingId: row.listingId, variant: 'ORIGINAL' },
          });
          if (originalCount <= 1) {
            throw AppError.conflict('Cannot delete the last ORIGINAL image of a published listing');
          }
        }
        await tx.media.deleteMany({
          where: { id: { in: group.map((g) => g.id) } },
        });
        return group.map((g) => g.storageKey);
      },
      { timeout: 5000 },
    );
    await this.bestEffortDelete(keys);
    return { data: { id: row.id } };
  }

  private async bestEffortDelete(keys: string[]): Promise<void> {
    for (const key of keys) {
      try {
        await this.storage.delete(key);
      } catch (err) {
        this.logger.warn(`orphan object ${key}: ${(err as Error).message}`);
      }
    }
  }
}
