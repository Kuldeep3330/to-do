import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import { Public } from '../../common/decorators/public.decorator';
import { LeadRateLimitGuard } from '../leads/lead-rate-limit.guard';
import { CreateOwnerEnquiryDto } from './owner-enquiries.dto';
import { OwnerEnquiriesService } from './owner-enquiries.service';

@Controller('api/v1/owner-enquiries')
export class OwnerEnquiriesController {
  constructor(private readonly ownerEnquiries: OwnerEnquiriesService) {}

  @Public()
  @Post()
  @HttpCode(200)
  @UseGuards(LeadRateLimitGuard)
  async create(@Body() body: CreateOwnerEnquiryDto) {
    return { data: await this.ownerEnquiries.create(body) };
  }
}
