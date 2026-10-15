import { Controller, Get, Header } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { DashboardService } from './dashboard.service';

@Controller('api/v1/admin/dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @RequirePermissions('dashboard.read')
  @Get()
  @Header('Cache-Control', 'private, no-store')
  async get(@CurrentUser() user: { id: string }) {
    return { data: await this.dashboard.counts(user.id) };
  }
}
