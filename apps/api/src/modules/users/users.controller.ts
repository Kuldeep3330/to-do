import { Body, Controller, Get, Patch } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { createZodDto } from '../../common/dto/zod-dto';
import { UsersService } from './users.service';

const patchMeSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  phone: z.string().regex(/^\+91[6-9]\d{9}$/).optional(),
});

class PatchMeDto extends createZodDto(patchMeSchema) {}

@Controller('api/v1')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('me')
  async me(@CurrentUser() user: { id: string }) {
    const data = await this.users.getMe(user.id);
    return { data };
  }

  @Patch('me')
  async patchMe(@CurrentUser() user: { id: string }, @Body() body: PatchMeDto) {
    const data = await this.users.patchMe(user.id, body);
    return { data };
  }
}
