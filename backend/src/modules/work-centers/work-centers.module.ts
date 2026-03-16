import { Module } from '@nestjs/common';
import { WorkCentersService } from './work-centers.service';
import { WorkCentersController } from './work-centers.controller';
import { PrismaModule } from '../../database/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [WorkCentersController],
  providers: [WorkCentersService],
  exports: [WorkCentersService],
})
export class WorkCentersModule {}
