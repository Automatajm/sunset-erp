import { Module } from '@nestjs/common';
import { ProductionOrdersService } from './production-orders.service';
import { ProductionOrdersController } from './production-orders.controller';
import { AutomationModule } from '../automation/automation.module';

// PrismaService comes from the global PrismaModule (spec-001); AutomationService
// from AutomationModule — never re-provide foreign services (duplicate instances).
@Module({
  imports: [AutomationModule],
  controllers: [ProductionOrdersController],
  providers: [ProductionOrdersService],
  exports: [ProductionOrdersService],
})
export class ProductionOrdersModule {}
