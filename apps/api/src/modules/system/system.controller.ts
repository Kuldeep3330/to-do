import { Controller, Get, Header } from '@nestjs/common';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { SystemService } from './system.service';

/** Operations oversight for admins: is the platform healthy, and what needs cleaning up. Read-only. */
@Controller('api/v1/admin/system')
export class SystemController {
  constructor(private readonly system: SystemService) {}

  @RequirePermissions('audit.read')
  @Get('health')
  @Header('Cache-Control', 'private, no-store')
  async health() {
    return { data: await this.system.health() };
  }

  @RequirePermissions('audit.read')
  @Get('data-quality')
  @Header('Cache-Control', 'private, no-store')
  async dataQuality() {
    return { data: await this.system.dataQuality() };
  }
}
