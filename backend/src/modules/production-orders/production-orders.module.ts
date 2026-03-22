import { Module } from '@nestjs/common';
import { ProductionOrdersService } from './production-orders.service';
import { ProductionOrdersController } from './production-orders.controller';
import { PrismaService } from '../../database/prisma.service';
import { AutomationService } from '../automation/automation.service';

@Module({
  controllers: [ProductionOrdersController],
  providers: [ProductionOrdersService, PrismaService, AutomationService],
  exports: [ProductionOrdersService],
})
export class ProductionOrdersModule {}