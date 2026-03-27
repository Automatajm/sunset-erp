// ============================================================================
// FILE: backend/src/modules/ap-invoices/ap-invoices.module.ts
// ============================================================================
import { Module } from '@nestjs/common';
import { ApInvoicesService } from './ap-invoices.service';
import { ApInvoicesController } from './ap-invoices.controller';
import { PrismaService } from '../../database/prisma.service';
import { AutomationService } from '../automation/automation.service';
 
@Module({
  controllers: [ApInvoicesController],
  providers:   [ApInvoicesService, PrismaService, AutomationService],
  exports:     [ApInvoicesService],
})
export class ApInvoicesModule {}

