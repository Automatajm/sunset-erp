import { Module } from '@nestjs/common';
import { ArInvoicesService } from './ar-invoices.service';
import { ArInvoicesController } from './ar-invoices.controller';
import { PrismaService } from '../../database/prisma.service';
import { AutomationService } from '../automation/automation.service';
import { StockTransactionsService } from '../stock-transactions/stock-transactions.service';

@Module({
  controllers: [ArInvoicesController],
  providers: [ArInvoicesService, PrismaService, AutomationService, StockTransactionsService],
  exports: [ArInvoicesService],
})
export class ArInvoicesModule {}