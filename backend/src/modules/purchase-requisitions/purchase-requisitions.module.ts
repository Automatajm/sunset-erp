import { Module } from '@nestjs/common';
import { PurchaseRequisitionsService } from './purchase-requisitions.service';
import { PurchaseRequisitionsController } from './purchase-requisitions.controller';
import { PrismaModule } from '../../database/prisma.module';
import { RfqsModule } from '../rfqs/rfqs.module';

@Module({
  imports: [PrismaModule, RfqsModule],
  controllers: [PurchaseRequisitionsController],
  providers: [PurchaseRequisitionsService],
  exports: [PurchaseRequisitionsService],
})
export class PurchaseRequisitionsModule {}
