import nodemailer from 'nodemailer';
import { env } from '../../config/env';
import { EmailMessage, EmailPort } from './email.port';

export class SmtpEmailAdapter implements EmailPort {
  private readonly transporter = nodemailer.createTransport({
    host: env().SMTP_HOST,
    port: env().SMTP_PORT,
    secure: env().SMTP_SECURE,
    auth:
      env().SMTP_USER.length > 0
        ? { user: env().SMTP_USER, pass: env().SMTP_PASS }
        : undefined,
  });

  async send(input: EmailMessage): Promise<{ id: string }> {
    const info = await this.transporter.sendMail({
      from: env().MAIL_FROM,
      to: input.to,
      subject: input.subject,
      text: input.text,
      html: input.html,
    });
    return { id: String(info.messageId ?? `smtp-${Date.now()}`).slice(0, 160) };
  }
}
