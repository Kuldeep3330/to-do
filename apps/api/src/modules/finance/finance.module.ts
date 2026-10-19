import { Module } from '@nestjs/common';
import { FeeRulesController } from './fee-rules.controller';
import { FeeRulesService } from './fee-rules.service';

@Module({
  controllers: [FeeRulesController],
  providers: [FeeRulesService],
  exports: [FeeRulesService],
})
export class FinanceModule {}
