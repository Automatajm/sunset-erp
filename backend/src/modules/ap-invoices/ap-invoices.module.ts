// ============================================================================
// FILE: backend/src/modules/ap-invoices/ap-invoices.module.ts
// ============================================================================
import { Module } from '@nestjs/common';
import { ApInvoicesService } from './ap-invoices.service';
import { ApInvoicesController } from './ap-invoices.controller';
import { PrismaService } from '../../database/prisma.service';
import { AutomationService } from '../automation/automation.service';
import { StockTransactionsService } from '../stock-transactions/stock-transactions.service';
 
@Module({
  controllers: [ApInvoicesController],
  providers:   [ApInvoicesService, PrismaService, AutomationService, StockTransactionsService],
  exports:     [ApInvoicesService],
})
export class ApInvoicesModule {}

