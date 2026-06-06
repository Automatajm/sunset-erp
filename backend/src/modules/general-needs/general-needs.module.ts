import { Module } from '@nestjs/common';
import { GeneralNeedsService } from './general-needs.service';
import { GeneralNeedsController } from './general-needs.controller';
import { MrpService } from './mrp.service';
import { PrismaModule } from '../../database/prisma.module';
import { PurchaseRequisitionsModule } from '../purchase-requisitions/purchase-requisitions.module';

@Module({
  imports: [PrismaModule, PurchaseRequisitionsModule],
  controllers: [GeneralNeedsController],
  providers: [GeneralNeedsService, MrpService],
  exports: [GeneralNeedsService, MrpService],
})
export class GeneralNeedsModule {}
