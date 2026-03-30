// ============================================================================
// FILE 6 — backend/src/modules/warehouse-locations/warehouse-locations.module.ts
// ============================================================================
 
import { Module } from '@nestjs/common';
import { WarehouseLocationsService } from './warehouse-locations.service';
import { WarehouseLocationsController } from './warehouse-locations.controller';
import { PrismaModule } from '../../database/prisma.module';
 
@Module({
  imports:     [PrismaModule],
  controllers: [WarehouseLocationsController],
  providers:   [WarehouseLocationsService],
  exports:     [WarehouseLocationsService],
})
export class WarehouseLocationsModule {}