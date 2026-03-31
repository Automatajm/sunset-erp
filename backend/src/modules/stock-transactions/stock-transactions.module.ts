// ============================================================================
// FILE: backend/src/modules/stock-transactions/stock-transactions.module.ts
// ============================================================================
import { Module } from '@nestjs/common';
import { StockTransactionsService } from './stock-transactions.service';
import { StockTransactionsController } from './stock-transactions.controller';
import { PrismaModule } from '../../database/prisma.module';
import { UomModule } from '../uom/uom.module';

@Module({
  imports:     [PrismaModule, UomModule],
  controllers: [StockTransactionsController],
  providers:   [StockTransactionsService],
  exports:     [StockTransactionsService],
})
export class StockTransactionsModule {}