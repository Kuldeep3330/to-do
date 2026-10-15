import { Injectable } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error';
import { PrismaService } from '../../prisma/prisma.service';
import { PUBLIC_INCLUDE } from '../listings/listings.service';
import { toPublicListingCard } from '../listings/listings.mapper';

const LIVE_LISTING = {
  status: 'PUBLISHED' as const,
  deletedAt: null,
  property: { deletedAt: null },
};

@Injectable()
export class SavedService {
  constructor(private readonly prisma: PrismaService) {}

  /** Only listings that are still published are returned; a taken-down listing silently drops out. */
  async list(userId: string) {
    const rows = await this.prisma.savedListing.findMany({
      where: { userId, listing: LIVE_LISTING },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { listing: { include: PUBLIC_INCLUDE } },
    });
    return rows.map((r) => toPublicListingCard(r.listing));
  }

  /** Just the ids, so cards on any page can show a filled heart without fetching full listings. */
  async ids(userId: string): Promise<string[]> {
    const rows = await this.prisma.savedListing.findMany({
      where: { userId, listing: LIVE_LISTING },
      select: { listingId: true },
    });
    return rows.map((r) => r.listingId);
  }

  async save(userId: string, listingId: string): Promise<void> {
    const listing = await this.prisma.listing.findFirst({
      where: { id: listingId, ...LIVE_LISTING },
      select: { id: true },
    });
    if (!listing) {
      throw AppError.notFound('Listing not found');
    }
    // Idempotent: saving twice is not an error.
    await this.prisma.savedListing.upsert({
      where: { userId_listingId: { userId, listingId } },
      create: { userId, listingId },
      update: {},
    });
  }

  async unsave(userId: string, listingId: string): Promise<void> {
    await this.prisma.savedListing.deleteMany({ where: { userId, listingId } });
  }
}
