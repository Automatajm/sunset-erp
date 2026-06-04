import { Module } from '@nestjs/common';
import { BomService } from './bom.service';
import { BomController } from './bom.controller';
import { PrismaModule } from '../../database/prisma.module';
import { ItemsModule } from '../items/items.module';
import { ConsumptionGroupsModule } from '../consumption-groups/consumption-groups.module';
import { WorkCentersModule } from '../work-centers/work-centers.module';

@Module({
  imports: [PrismaModule, ItemsModule, ConsumptionGroupsModule, WorkCentersModule],
  controllers: [BomController],
  providers: [BomService],
  exports: [BomService],
})
export class BomModule {}
