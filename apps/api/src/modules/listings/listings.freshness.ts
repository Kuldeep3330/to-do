import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { env } from '../../config/env';
import { ListingsService } from './listings.service';

const RUN_EVERY_MS = 60 * 60 * 1000;

/**
 * Hourly job that pauses published listings nobody has confirmed recently.
 * Idempotent, so running it on several API instances is harmless.
 */
@Injectable()
export class ListingFreshnessJob implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(ListingFreshnessJob.name);
  private timer?: NodeJS.Timeout;

  constructor(private readonly listings: ListingsService) {}

  onModuleInit(): void {
    const { NODE_ENV, LISTING_STALE_DAYS } = env();
    if (NODE_ENV === 'test' || LISTING_STALE_DAYS === 0) {
      return;
    }
    void this.run(LISTING_STALE_DAYS);
    this.timer = setInterval(() => void this.run(LISTING_STALE_DAYS), RUN_EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
    }
  }

  private async run(days: number): Promise<void> {
    try {
      const paused = await this.listings.pauseStale(days);
      if (paused > 0) {
        this.log.log(`Paused ${paused} listing(s) not confirmed in ${days} days`);
      }
    } catch (e) {
      this.log.error(`Freshness check failed: ${(e as Error).message}`);
    }
  }
}
