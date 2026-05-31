import { Module } from '@nestjs/common';
import { AutomationService } from './automation.service';
import { AutomationController } from './automation.controller';
import { PrismaService } from '../../database/prisma.service';

@Module({
  controllers: [AutomationController],
  providers: [AutomationService, PrismaService],
  exports: [AutomationService],
})
export class AutomationModule {}
