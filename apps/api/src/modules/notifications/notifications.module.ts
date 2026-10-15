import { Global, Module } from '@nestjs/common';
import { env } from '../../config/env';
import { EMAIL_PORT } from './email.port';
import { InMemoryEmail } from './email.memory';
import { LogEmailAdapter } from './email.log';
import { SmtpEmailAdapter } from './email.smtp';
import { NotificationsService } from './notifications.service';

@Module({
  providers: [
    NotificationsService,
    {
      provide: EMAIL_PORT,
      useFactory: () => {
        if (env().NODE_ENV === 'test') {
          return new InMemoryEmail();
        }
        if (env().SMTP_HOST) {
          return new SmtpEmailAdapter();
        }
        return new LogEmailAdapter();
      },
    },
  ],
  exports: [NotificationsService, EMAIL_PORT],
})
@Global()
export class NotificationsModule {}
