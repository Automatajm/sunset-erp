// --- consumption-groups/consumption-groups.module.ts ---
import { Module } from '@nestjs/common';
import { ConsumptionGroupsService } from './consumption-groups.service';
import { ConsumptionGroupsController } from './consumption-groups.controller';
import { PrismaModule } from '../../database/prisma.module';
 
@Module({
  imports: [PrismaModule],
  controllers: [ConsumptionGroupsController],
  providers: [ConsumptionGroupsService],
  exports: [ConsumptionGroupsService],
})
export class ConsumptionGroupsModule {}