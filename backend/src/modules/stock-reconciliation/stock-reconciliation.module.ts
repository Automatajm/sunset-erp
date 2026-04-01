// ============================================================================
// FILE: backend/src/modules/stock-reconciliation/stock-reconciliation.module.ts
// ============================================================================
import { Module }                            from '@nestjs/common';
import { PrismaModule }                      from '../../database/prisma.module';
import { UomModule }                         from '../uom/uom.module';
import { StockReconciliationService }        from './stock-reconciliation.service';
import { StockReconciliationController }     from './stock-reconciliation.controller';
import { StockCountAssignmentService }       from './stock-count-assignment.service';
import { StockCountAssignmentController }    from './stock-count-assignment.controller';

@Module({
  imports: [PrismaModule, UomModule],
  controllers: [
    StockReconciliationController,
    StockCountAssignmentController,
  ],
  providers: [
    StockReconciliationService,
    StockCountAssignmentService,
  ],
  exports: [StockReconciliationService, StockCountAssignmentService],
})
export class StockReconciliationModule {}