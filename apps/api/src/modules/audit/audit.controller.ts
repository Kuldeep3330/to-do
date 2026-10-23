import { Controller, Get, Header, Query } from '@nestjs/common';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AuditListQueryDto } from './audit.dto';
import { AuditService } from './audit.service';

/** Read-only view of who did what. Entries are written by the audit interceptor and services, never from here. */
@Controller('api/v1/admin/audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @RequirePermissions('audit.read')
  @Get()
  @Header('Cache-Control', 'private, no-store')
  async list(@Query() query: AuditListQueryDto) {
    return this.audit.list(query);
  }

  @RequirePermissions('audit.read')
  @Get('filters')
  @Header('Cache-Control', 'private, no-store')
  async filters() {
    return { data: await this.audit.filters() };
  }
}
