import { Module } from '@nestjs/common';
import { ProductionPlansService } from './production-plans.service';
import { ProductionPlansController } from './production-plans.controller';
import { PrismaModule } from '../../database/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ProductionPlansController],
  providers: [ProductionPlansService],
  exports: [ProductionPlansService],
})
export class ProductionPlansModule {}
