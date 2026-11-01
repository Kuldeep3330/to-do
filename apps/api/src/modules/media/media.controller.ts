import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Audit } from '../../common/decorators/audit.decorator';
import { CurrentUser, AuthUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { AppError } from '../../common/errors/app-error';
import { PatchMediaDto } from './media.dto';
import { MAX_ORIGINAL_BYTES } from './media.image';
import { MediaService } from './media.service';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

@Controller('api/v1/admin/listings')
export class ListingMediaController {
  constructor(private readonly media: MediaService) {}

  @RequirePermissions('media.manage')
  @Post(':id/media')
  @HttpCode(201)
  @Audit('CREATE_MEDIA', 'media')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_ORIGINAL_BYTES },
    }),
  )
  async upload(@Param('id') id: string, @UploadedFile() file: Express.Multer.File | undefined) {
    return this.media.upload(
      requireUuid(id, 'Listing not found'),
      file
        ? {
            buffer: file.buffer,
            mimetype: file.mimetype,
            originalname: file.originalname,
            size: file.size,
          }
        : undefined,
    );
  }
}

@Controller('api/v1/me/listings')
export class MeListingMediaController {
  constructor(private readonly media: MediaService) {}

  @RequirePermissions('listing.own')
  @Post(':id/media')
  @HttpCode(201)
  @Audit('CREATE_MEDIA', 'media')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_ORIGINAL_BYTES },
    }),
  )
  async upload(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.media.uploadOwned(
      requireUuid(id, 'Listing not found'),
      user.id,
      file
        ? {
            buffer: file.buffer,
            mimetype: file.mimetype,
            originalname: file.originalname,
            size: file.size,
          }
        : undefined,
    );
  }
}

@Controller('api/v1/me/media')
export class MeMediaController {
  constructor(private readonly media: MediaService) {}

  @RequirePermissions('listing.own')
  @Patch(':id')
  @Audit('REORDER_MEDIA', 'media')
  async patch(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() body: PatchMediaDto) {
    return { data: await this.media.patchSortOrderOwned(requireUuid(id, 'Media not found'), user.id, body.sortOrder) };
  }

  @RequirePermissions('listing.own')
  @Delete(':id')
  @HttpCode(200)
  @Audit('DELETE_MEDIA', 'media')
  async remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.media.removeOwned(requireUuid(id, 'Media not found'), user.id);
  }
}

@Controller('api/v1/admin/media')
export class MediaController {
  constructor(private readonly media: MediaService) {}

  @RequirePermissions('media.manage')
  @Patch(':id')
  @Audit('REORDER_MEDIA', 'media')
  async patch(@Param('id') id: string, @Body() body: PatchMediaDto) {
    return { data: await this.media.patchSortOrder(requireUuid(id, 'Media not found'), body.sortOrder) };
  }

  @RequirePermissions('media.manage')
  @Delete(':id')
  @HttpCode(200)
  @Audit('DELETE_MEDIA', 'media')
  async remove(@Param('id') id: string) {
    return this.media.remove(requireUuid(id, 'Media not found'));
  }
}

function requireUuid(id: string, message: string): string {
  if (!UUID.test(id)) {
    throw AppError.notFound(message);
  }
  return id;
}
