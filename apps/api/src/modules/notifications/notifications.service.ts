import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { env } from '../../config/env';
import { EMAIL_PORT, EmailPort } from './email.port';

export type LeadCreatedNotice = {
  name: string;
  phone: string;
  email: string | null;
  listingTitle: string;
  listingSlug: string;
};

export type VisitRequestedNotice = {
  name: string;
  phone: string;
  listingTitle: string;
  listingSlug: string;
  preferredDate: string | null;
  preferredSlot: string;
};

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EMAIL_PORT) private readonly email: EmailPort,
  ) {}

  async notifyPasswordReset(input: { to: string; name: string; resetUrl: string }): Promise<void> {
    await this.sendTemplate({
      template: 'password_reset',
      to: input.to,
      subject: 'Reset your password',
      text: `Hi ${input.name}, reset your password: ${input.resetUrl}`,
      html: `<p>Hi ${escapeHtml(input.name)}, <a href="${escapeHtml(input.resetUrl)}">reset your password</a>.</p>`,
    });
  }

  async notifyLeadCreated(notice: LeadCreatedNotice): Promise<void> {
    await this.sendTemplate({
      template: 'lead_received_ops',
      to: env().OPS_INBOX_EMAIL,
      subject: `New lead: ${notice.listingTitle}`,
      text: `${notice.name} ${maskPhone(notice.phone)} enquired on ${notice.listingSlug}`,
      html: `<p>${escapeHtml(notice.name)} enquired on ${escapeHtml(notice.listingSlug)}</p>`,
    });
    if (notice.email) {
      await this.sendTemplate({
        template: 'lead_received_customer',
        to: notice.email,
        subject: `We received your enquiry: ${notice.listingTitle}`,
        text: `Hi ${notice.name}, we received your enquiry for ${notice.listingTitle}.`,
        html: `<p>Hi ${escapeHtml(notice.name)}, we received your enquiry for ${escapeHtml(notice.listingTitle)}.</p>`,
      });
    }
  }

  async notifyVisitRequested(notice: VisitRequestedNotice): Promise<void> {
    const when = `${notice.preferredDate ?? 'any day'} (${notice.preferredSlot.toLowerCase()})`;
    await this.sendTemplate({
      template: 'visit_requested_ops',
      to: env().OPS_INBOX_EMAIL,
      subject: `Visit requested: ${notice.listingTitle}`,
      text: `${notice.name} ${maskPhone(notice.phone)} wants to visit ${notice.listingSlug} on ${when}`,
      html: `<p>${escapeHtml(notice.name)} wants to visit ${escapeHtml(notice.listingSlug)} on ${escapeHtml(when)}</p>`,
    });
  }

  private async sendTemplate(input: {
    template: string;
    to: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<void> {
    let logId: string | null = null;
    try {
      const log = await this.prisma.notificationLog.create({
        data: {
          template: input.template,
          channel: 'EMAIL',
          toMasked: maskEmail(input.to),
          status: 'PENDING',
        },
      });
      logId = log.id;
      const sent = await this.email.send({
        to: input.to,
        subject: input.subject,
        text: input.text,
        html: input.html,
      });
      await this.prisma.notificationLog.update({
        where: { id: log.id },
        data: { status: 'SENT', providerMessageId: sent.id.slice(0, 160) },
      });
    } catch (err) {
      const message = (err as Error).message.slice(0, 500);
      if (logId) {
        try {
          await this.prisma.notificationLog.update({
            where: { id: logId },
            data: { status: 'FAILED', error: message },
          });
        } catch (updateErr) {
          this.logger.warn(`notification log update failed: ${(updateErr as Error).message}`);
        }
      }
      this.logger.warn(`email ${input.template} failed: ${message}`);
    }
  }
}

export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) {
    return '***';
  }
  return `${email[0]}***${email.slice(at)}`;
}

export function maskPhone(phone: string): string {
  if (phone.length < 4) {
    return '****';
  }
  return `${phone.slice(0, 3)}******${phone.slice(-4)}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
