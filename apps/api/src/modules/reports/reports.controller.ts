import { Controller, Get, Header, Query } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { createZodDto } from '../../common/dto/zod-dto';
import { ReportsService } from './reports.service';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use the format YYYY-MM-DD');
export class ReportsQueryDto extends createZodDto(z.object({ from: day.optional(), to: day.optional() })) {}

/** Read-only business reports. Lead numbers need lead.read_all; the money section needs finance.read on top. */
@Controller('api/v1/admin/reports')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @RequirePermissions('lead.read_all')
  @Get()
  @Header('Cache-Control', 'private, no-store')
  async get(@CurrentUser() user: { id: string }, @Query() query: ReportsQueryDto) {
    return { data: await this.reports.get(user.id, query.from, query.to) };
  }
}
