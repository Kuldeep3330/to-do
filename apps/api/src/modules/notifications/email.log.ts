import { Logger } from '@nestjs/common';
import { EmailMessage, EmailPort } from './email.port';

export class LogEmailAdapter implements EmailPort {
  private readonly logger = new Logger(LogEmailAdapter.name);

  async send(input: EmailMessage): Promise<{ id: string }> {
    this.logger.log(`email subject=${input.subject}`);
    return { id: `log-${Date.now()}` };
  }
}
