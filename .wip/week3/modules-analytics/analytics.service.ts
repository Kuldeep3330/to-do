import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export type AnalyticsRecord = {
  name: string;
  listingId?: string | null;
  userId?: string | null;
  properties?: Record<string, unknown>;
  requestId?: string | null;
};

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(private readonly prisma: PrismaService) {}

  track(entry: AnalyticsRecord): void {
    void this.prisma.analyticsEvent
      .create({
        data: {
          name: entry.name,
          listingId: entry.listingId ?? null,
          userId: entry.userId ?? null,
          properties: (entry.properties ?? {}) as Prisma.InputJsonValue,
          requestId: entry.requestId ?? null,
        },
      })
      .catch((err: Error) => this.logger.warn(`analytics write failed: ${err.message}`));
  }
}
