// ============================================================================
// FILE: backend/src/modules/ar-invoices/ar-invoices.module.ts
// ============================================================================
import { Module } from '@nestjs/common';
import { ArInvoicesService } from './ar-invoices.service';
import { ArInvoicesController } from './ar-invoices.controller';
import { ArInvoicesOverdueWorker } from './ar-invoices.overdue.worker';
import { PrismaModule } from '../../database/prisma.module';
import { StockTransactionsModule } from '../stock-transactions/stock-transactions.module';
import { AutomationModule } from '../automation/automation.module';
import { CurrencyModule } from '../currency/currency.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    PrismaModule,
    StockTransactionsModule,
    AutomationModule,
    CurrencyModule,
    NotificationsModule,
  ],
  controllers: [ArInvoicesController],
  providers: [ArInvoicesService, ArInvoicesOverdueWorker],
  exports: [ArInvoicesService],
})
export class ArInvoicesModule {}
