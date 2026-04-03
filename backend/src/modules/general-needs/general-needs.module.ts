import { Module } from '@nestjs/common';
import { GeneralNeedsService } from './general-needs.service';
import { GeneralNeedsController } from './general-needs.controller';
import { PrismaModule } from '../../database/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [GeneralNeedsController],
  providers: [GeneralNeedsService],
  exports: [GeneralNeedsService],
})
export class GeneralNeedsModule {}