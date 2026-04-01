// ============================================================================
// FILE: backend/src/modules/stock-reconciliation/stock-reconciliation.module.ts
// ============================================================================
import { Module }                        from '@nestjs/common';
import { StockReconciliationController } from './stock-reconciliation.controller';
import { StockReconciliationService }    from './stock-reconciliation.service';
import { PrismaModule }                  from '../../database/prisma.module';
import { UomModule }                     from '../uom/uom.module';

@Module({
  imports:     [PrismaModule, UomModule],
  controllers: [StockReconciliationController],
  providers:   [StockReconciliationService],
  exports:     [StockReconciliationService],
})
export class StockReconciliationModule {}