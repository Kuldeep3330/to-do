import { Body, Controller, Get, Header, Param, Put } from '@nestjs/common';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AppError } from '../../common/errors/app-error';
import { FeeRuleDto } from './fee-rules.dto';
import { FeeRulesService } from './fee-rules.service';

@Controller('api/v1/admin/fee-rules')
export class FeeRulesController {
  constructor(private readonly rules: FeeRulesService) {}

  @RequirePermissions('finance.read')
  @Get()
  @Header('Cache-Control', 'private, no-store')
  async list() {
    return { data: await this.rules.list() };
  }

  @RequirePermissions('finance.manage')
  @Put(':intent')
  async set(@Param('intent') intent: string, @Body() body: FeeRuleDto, @CurrentUser() user: { id: string }) {
    if (intent !== 'RENT' && intent !== 'BUY') {
      throw AppError.notFound('Fee rule not found');
    }
    return { data: await this.rules.set(intent, body, user.id) };
  }
}
