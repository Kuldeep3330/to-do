import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { Public } from '../../common/decorators/public.decorator';
import { PrismaService } from '../../prisma/prisma.service';

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @Get('health')
  health(): { status: string } {
    return { status: 'ok' };
  }

  @Public()
  @Get('ready')
  async ready(@Res({ passthrough: true }) res: Response): Promise<{ status: string }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok' };
    } catch {
      res.status(503);
      return { status: 'not_ready' };
    }
  }
}
