import { Module } from '@nestjs/common';
import { CashFlowService } from './cash-flow.service';
import { CashFlowController } from './cash-flow.controller';
import { PrismaModule } from '../../database/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CashFlowController],
  providers: [CashFlowService],
  exports: [CashFlowService],
})
export class CashFlowModule {}
