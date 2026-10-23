import { Body, Controller, Get, Header, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AppError } from '../../common/errors/app-error';
import { AdminUsersService } from './admin-users.service';
import { AdminUserListQueryDto, CreateStaffDto, PatchUserDto } from './admin-users.dto';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller('api/v1/admin')
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}

  /** Lead assignment dropdown. Needs only lead.assign, not full user management. */
  @RequirePermissions('lead.assign')
  @Get('staff')
  async staff() {
    return { data: await this.users.listAssignableStaff() };
  }

  @RequirePermissions('user.manage')
  @Get('users')
  async list(@Query() query: AdminUserListQueryDto) {
    return this.users.list(query);
  }

  @RequirePermissions('user.manage')
  @Get('users/:id')
  @Header('Cache-Control', 'private, no-store')
  async detail(@Param('id') id: string) {
    if (!UUID.test(id)) {
      throw AppError.notFound('User not found');
    }
    return { data: await this.users.detail(id) };
  }

  @RequirePermissions('user.manage')
  @Post('users')
  @HttpCode(201)
  @Audit('CREATE_STAFF', 'user')
  async create(@CurrentUser() user: { id: string }, @Body() body: CreateStaffDto) {
    return { data: await this.users.createStaff(user.id, body) };
  }

  @RequirePermissions('user.manage')
  @Patch('users/:id')
  @Audit('UPDATE_USER_STATUS', 'user')
  async patch(@CurrentUser() user: { id: string }, @Param('id') id: string, @Body() body: PatchUserDto) {
    if (!UUID.test(id)) {
      throw AppError.notFound('User not found');
    }
    return { data: await this.users.setStatus(user.id, id, body) };
  }
}
