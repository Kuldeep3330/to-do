import './load-env';
import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard';
import { PermissionsGuard } from './common/guards/permissions.guard';
import { AuditInterceptor } from './common/interceptors/audit.interceptor';
import { BigIntInterceptor } from './common/interceptors/bigint.interceptor';
import { RequestIdInterceptor } from './common/interceptors/request-id.interceptor';
import { ZodValidationPipe } from './common/pipes/zod-validation.pipe';
import { env } from './config/env';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { AmenitiesModule } from './modules/amenities/amenities.module';
import { DashboardModule } from './modules/dashboard/dashboard.module';
import { FinanceModule } from './modules/finance/finance.module';
import { LeadsModule } from './modules/leads/leads.module';
import { LocationsModule } from './modules/locations/locations.module';
import { ListingsModule } from './modules/listings/listings.module';
import { MediaModule } from './modules/media/media.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { PropertiesModule } from './modules/properties/properties.module';
import { RbacModule } from './modules/rbac/rbac.module';
import { SavedModule } from './modules/saved/saved.module';
import { UsersModule } from './modules/users/users.module';
import { PrismaModule } from './prisma/prisma.module';

@Module({
  imports: [
    JwtModule.registerAsync({
      global: true,
      useFactory: () => ({
        secret: env().JWT_ACCESS_SECRET,
        signOptions: { expiresIn: '15m' },
      }),
    }),
    PrismaModule,
    RbacModule,
    AuditModule,
    NotificationsModule,
    HealthModule,
    AuthModule,
    UsersModule,
    LocationsModule,
    AmenitiesModule,
    PropertiesModule,
    ListingsModule,
    MediaModule,
    FinanceModule,
    LeadsModule,
    SavedModule,
    DashboardModule,
  ],
  providers: [
    { provide: APP_FILTER, useClass: HttpExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: RequestIdInterceptor },
    { provide: APP_INTERCEPTOR, useClass: BigIntInterceptor },
    { provide: APP_INTERCEPTOR, useClass: AuditInterceptor },
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}
