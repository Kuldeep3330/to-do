import { Body, Controller, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { Audit } from '../../../common/decorators/audit.decorator';
import { RequirePermissions } from '../../../common/decorators/require-permissions.decorator';
import { CreatePollDto, PatchPollDto } from './polls-admin.dto';
import { PollsAdminService } from './polls-admin.service';

@Controller('api/v1/admin/community/polls')
export class PollsAdminController {
  constructor(private readonly polls: PollsAdminService) {}

  @RequirePermissions('poll.manage')
  @Get()
  async list() {
    return { data: await this.polls.list() };
  }

  @RequirePermissions('poll.manage')
  @Post()
  @Audit('CREATE_POLL', 'community_poll')
  async create(@Body() body: CreatePollDto) {
    return { data: await this.polls.create(body) };
  }

  @RequirePermissions('poll.manage')
  @Patch(':id')
  @Audit('UPDATE_POLL', 'community_poll')
  async update(@Param('id') id: string, @Body() body: PatchPollDto) {
    return { data: await this.polls.update(id, body) };
  }

  @RequirePermissions('poll.manage')
  @Post(':id/publish')
  @HttpCode(200)
  @Audit('PUBLISH_POLL', 'community_poll')
  async publish(@Param('id') id: string) {
    return { data: await this.polls.publish(id) };
  }

  @RequirePermissions('poll.manage')
  @Post(':id/close')
  @HttpCode(200)
  @Audit('CLOSE_POLL', 'community_poll')
  async close(@Param('id') id: string) {
    return { data: await this.polls.close(id) };
  }

  @RequirePermissions('poll.manage')
  @Post(':id/archive')
  @HttpCode(200)
  @Audit('ARCHIVE_POLL', 'community_poll')
  async archive(@Param('id') id: string) {
    return { data: await this.polls.archive(id) };
  }
}
