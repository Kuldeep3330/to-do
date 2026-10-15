import '../../load-env';
import { MediaService } from './media.service';
import { InMemoryStorage } from './storage.memory';
import sharp from 'sharp';

const listingId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const mediaId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

async function jpegBytes(width = 32, height = 24): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 40, g: 80, b: 120 } },
  })
    .jpeg()
    .toBuffer();
}

describe('MediaService', () => {
  let prisma: {
    listing: { findFirst: jest.Mock };
    media: {
      count: jest.Mock;
      findFirst: jest.Mock;
      findMany: jest.Mock;
      create: jest.Mock;
      aggregate: jest.Mock;
      updateMany: jest.Mock;
      delete: jest.Mock;
      deleteMany: jest.Mock;
    };
    $transaction: jest.Mock;
    $queryRaw: jest.Mock;
  };
  let storage: InMemoryStorage;
  let service: MediaService;
  let jpeg: Buffer;

  beforeAll(async () => {
    jpeg = await jpegBytes();
  });

  beforeEach(() => {
    prisma = {
      listing: { findFirst: jest.fn() },
      media: {
        count: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        aggregate: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
        deleteMany: jest.fn(),
      },
      $transaction: jest.fn(),
      $queryRaw: jest.fn(),
    };
    storage = new InMemoryStorage();
    service = new MediaService(prisma as never, storage);
  });

  it('rejects upload when listing is missing', async () => {
    prisma.listing.findFirst.mockResolvedValue(null);
    await expect(
      service.upload(listingId, {
        buffer: jpeg,
        mimetype: 'image/jpeg',
        originalname: 'a.jpg',
        size: jpeg.length,
      }),
    ).rejects.toMatchObject({ code: 'NOT_FOUND', status: 404 });
    expect(storage.objects.size).toBe(0);
  });

  it('rejects the 21st ORIGINAL before storage writes', async () => {
    prisma.listing.findFirst.mockResolvedValue({ id: listingId });
    prisma.media.count.mockResolvedValue(20);
    await expect(
      service.upload(listingId, {
        buffer: jpeg,
        mimetype: 'image/jpeg',
        originalname: 'a.jpg',
        size: jpeg.length,
      }),
    ).rejects.toMatchObject({ code: 'CONFLICT', status: 409 });
    expect(storage.objects.size).toBe(0);
  });

  it('puts objects then inserts ORIGINAL CARD DETAIL', async () => {
    prisma.listing.findFirst.mockResolvedValue({ id: listingId });
    prisma.media.count.mockResolvedValue(0);
    const created: Record<string, unknown>[] = [];
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([{ id: listingId, deleted_at: null }]),
        media: {
          count: jest.fn().mockResolvedValue(0),
          aggregate: jest.fn().mockResolvedValue({ _max: { sortOrder: null } }),
          create: jest.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
            const row = {
              id: `${created.length}-${mediaId}`,
              createdAt: new Date('2026-10-08T00:00:00.000Z'),
              ...data,
            };
            created.push(row);
            return row;
          }),
        },
      };
      return fn(tx as never);
    });

    const result = await service.upload(listingId, {
      buffer: jpeg,
      mimetype: 'image/jpeg',
      originalname: 'cover.jpg',
      size: jpeg.length,
    });
    expect(result.data.variant).toBe('ORIGINAL');
    expect(result.data.variants).toHaveLength(2);
    expect(result.data.variants.map((v) => v.variant).sort()).toEqual(['CARD', 'DETAIL']);
    expect(result.data.url).toContain('listings/');
    expect(result.data).not.toHaveProperty('storageKey');
    expect(storage.objects.size).toBe(3);
  });

  it('deletes uploaded objects when DB insert fails', async () => {
    prisma.listing.findFirst.mockResolvedValue({ id: listingId });
    prisma.media.count.mockResolvedValue(0);
    prisma.$transaction.mockRejectedValue(new Error('db insert failed'));
    await expect(
      service.upload(listingId, {
        buffer: jpeg,
        mimetype: 'image/jpeg',
        originalname: 'cover.jpg',
        size: jpeg.length,
      }),
    ).rejects.toThrow('db insert failed');
    expect(storage.objects.size).toBe(0);
  });

  it('rejects deleting the last ORIGINAL of a PUBLISHED listing', async () => {
    prisma.media.findFirst.mockResolvedValue({
      id: mediaId,
      listingId,
      variant: 'ORIGINAL',
      sortOrder: 0,
      storageKey: 'listings/x/a.jpg',
    });
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([{ id: listingId, status: 'PUBLISHED', deleted_at: null }]),
        media: {
          count: jest.fn().mockResolvedValue(1),
          findMany: jest.fn().mockResolvedValue([
            { id: mediaId, variant: 'ORIGINAL', storageKey: 'listings/x/a.jpg' },
          ]),
          deleteMany: jest.fn(),
        },
      };
      return fn(tx as never);
    });
    await expect(service.remove(mediaId)).rejects.toMatchObject({ code: 'CONFLICT', status: 409 });
  });

  it('deletes ORIGINAL plus same-prefix variants only', async () => {
    prisma.media.findFirst.mockResolvedValue({
      id: mediaId,
      listingId,
      variant: 'ORIGINAL',
      sortOrder: 0,
      storageKey: 'listings/x/a.jpg',
    });
    await storage.put('listings/x/a.jpg', Buffer.from('a'), 'image/jpeg');
    await storage.put('listings/x/a_card.webp', Buffer.from('c'), 'image/webp');
    prisma.$transaction.mockImplementation(async (fn: (tx: typeof prisma) => Promise<unknown>) => {
      const tx = {
        $queryRaw: jest.fn().mockResolvedValue([{ id: listingId, status: 'DRAFT', deleted_at: null }]),
        media: {
          count: jest.fn().mockResolvedValue(2),
          findMany: jest.fn().mockResolvedValue([
            { id: mediaId, storageKey: 'listings/x/a.jpg' },
            { id: 'card', storageKey: 'listings/x/a_card.webp' },
          ]),
          deleteMany: jest.fn().mockResolvedValue({ count: 2 }),
        },
      };
      return fn(tx as never);
    });
    await service.remove(mediaId);
    expect(storage.objects.size).toBe(0);
  });
});
