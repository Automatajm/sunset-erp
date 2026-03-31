// ============================================================================
// FILE: backend/src/modules/ap-invoices/ap-invoices.module.ts
// ============================================================================
import { Module } from '@nestjs/common';
import { ApInvoicesService } from './ap-invoices.service';
import { ApInvoicesController } from './ap-invoices.controller';
import { PrismaModule } from '../../database/prisma.module';
import { StockTransactionsModule } from '../stock-transactions/stock-transactions.module';
import { AutomationModule } from '../automation/automation.module';

@Module({
  imports:     [PrismaModule, StockTransactionsModule, AutomationModule],
  controllers: [ApInvoicesController],
  providers:   [ApInvoicesService],
  exports:     [ApInvoicesService],
})
export class ApInvoicesModule {}