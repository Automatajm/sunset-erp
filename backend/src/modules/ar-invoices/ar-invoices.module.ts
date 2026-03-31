// ============================================================================
// FILE: backend/src/modules/ar-invoices/ar-invoices.module.ts
// ============================================================================
import { Module } from '@nestjs/common';
import { ArInvoicesService } from './ar-invoices.service';
import { ArInvoicesController } from './ar-invoices.controller';
import { PrismaModule } from '../../database/prisma.module';
import { StockTransactionsModule } from '../stock-transactions/stock-transactions.module';
import { AutomationModule } from '../automation/automation.module';

@Module({
  imports:     [PrismaModule, StockTransactionsModule, AutomationModule],
  controllers: [ArInvoicesController],
  providers:   [ArInvoicesService],
  exports:     [ArInvoicesService],
})
export class ArInvoicesModule {}