import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import { NotificationsService } from '../notifications/notifications.service';
import { createOwnerEnquirySchema } from './owner-enquiries.dto';

type CreateOwnerEnquiryInput = z.infer<typeof createOwnerEnquirySchema>;

@Injectable()
export class OwnerEnquiriesService {
  private readonly logger = new Logger(OwnerEnquiriesService.name);

  constructor(private readonly notifications: NotificationsService) {}

  async create(input: CreateOwnerEnquiryInput): Promise<{ ok: true }> {
    try {
      await this.notifications.notifyOwnerEnquiry({
        name: input.name,
        phone: input.phone,
        email: input.email ?? null,
        intent: input.intent,
        city: input.city,
        locality: input.locality ?? null,
        message: input.message ?? null,
      });
    } catch (err) {
      this.logger.warn(`owner enquiry email failed: ${(err as Error).message}`);
    }
    return { ok: true };
  }
}
