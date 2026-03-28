// --- supplier-items/supplier-items.module.ts ---
import { Module } from '@nestjs/common';
import { SupplierItemsService } from './supplier-items.service';
import { SupplierItemsController } from './supplier-items.controller';
import { PrismaModule } from '../../database/prisma.module';
import { UomModule } from '../uom/uom.module';
 
@Module({
  imports: [PrismaModule, UomModule],
  controllers: [SupplierItemsController],
  providers: [SupplierItemsService],
  exports: [SupplierItemsService],
})
export class SupplierItemsModule {}