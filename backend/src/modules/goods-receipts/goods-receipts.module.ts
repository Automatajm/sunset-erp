// ============================================================================
// FILE: backend/src/modules/goods-receipts/goods-receipts.module.ts
// ============================================================================
import { Module } from '@nestjs/common';
import { GoodsReceiptsService } from './goods-receipts.service';
import { GoodsReceiptsController } from './goods-receipts.controller';
import { PrismaModule } from '../../database/prisma.module';
import { UomModule } from '../uom/uom.module';

@Module({
  imports: [PrismaModule, UomModule],
  controllers: [GoodsReceiptsController],
  providers: [GoodsReceiptsService],
  exports: [GoodsReceiptsService],
})
export class GoodsReceiptsModule {}
