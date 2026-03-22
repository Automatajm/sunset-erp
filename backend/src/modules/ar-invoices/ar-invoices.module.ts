import { Module } from '@nestjs/common';
import { ArInvoicesService } from './ar-invoices.service';
import { ArInvoicesController } from './ar-invoices.controller';
import { PrismaService } from '../../database/prisma.service';
import { AutomationService } from '../automation/automation.service';

@Module({
  controllers: [ArInvoicesController],
  providers: [ArInvoicesService, PrismaService, AutomationService],
  exports: [ArInvoicesService],
})
export class ArInvoicesModule {}