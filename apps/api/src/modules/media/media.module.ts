import { Module } from '@nestjs/common';
import { env } from '../../config/env';
import { ListingMediaController, MediaController } from './media.controller';
import { MediaService } from './media.service';
import { InMemoryStorage } from './storage.memory';
import { STORAGE_PORT } from './storage.port';
import { S3StorageAdapter } from './storage.s3';

@Module({
  controllers: [ListingMediaController, MediaController],
  providers: [
    MediaService,
    {
      provide: STORAGE_PORT,
      useFactory: () => (env().NODE_ENV === 'test' ? new InMemoryStorage() : new S3StorageAdapter()),
    },
  ],
  exports: [MediaService, STORAGE_PORT],
})
export class MediaModule {}
