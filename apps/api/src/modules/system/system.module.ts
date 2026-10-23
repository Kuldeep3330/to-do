import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module';
import { SystemController } from './system.controller';
import { SystemService } from './system.service';

@Module({
  imports: [MediaModule],
  controllers: [SystemController],
  providers: [SystemService],
})
export class SystemModule {}
