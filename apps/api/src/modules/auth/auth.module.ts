import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthRateLimitGuard } from './auth-rate-limit.guard';
import { AuthService } from './auth.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService, AuthRateLimitGuard],
  exports: [AuthService],
})
export class AuthModule {}
