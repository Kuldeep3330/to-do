import { Body, Controller, Delete, Get, Header, HttpCode, Param, Post } from '@nestjs/common';
import { z } from 'zod';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AppError } from '../../common/errors/app-error';
import { createZodDto } from '../../common/dto/zod-dto';
import { SavedService } from './saved.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class SaveListingDto extends createZodDto(z.object({ listingId: z.string().uuid() })) {}

@Controller('api/v1/me/saved-listings')
export class SavedController {
  constructor(private readonly saved: SavedService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  async list(@CurrentUser() user: { id: string }) {
    return { data: await this.saved.list(user.id) };
  }

  @Get('ids')
  @Header('Cache-Control', 'private, no-store')
  async ids(@CurrentUser() user: { id: string }) {
    return { data: await this.saved.ids(user.id) };
  }

  @Post()
  @HttpCode(200)
  async save(@CurrentUser() user: { id: string }, @Body() body: SaveListingDto) {
    await this.saved.save(user.id, body.listingId);
    return { data: { listingId: body.listingId, saved: true } };
  }

  @Delete(':listingId')
  @HttpCode(204)
  async unsave(@CurrentUser() user: { id: string }, @Param('listingId') listingId: string): Promise<void> {
    if (!UUID.test(listingId)) {
      throw AppError.notFound('Listing not found');
    }
    await this.saved.unsave(user.id, listingId);
  }
}
