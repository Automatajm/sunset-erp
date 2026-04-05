import { Module } from '@nestjs/common';
import { GeneralNeedsService } from './general-needs.service';
import { GeneralNeedsController } from './general-needs.controller';
import { MrpService } from './mrp.service';
import { PrismaModule } from '../../database/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [GeneralNeedsController],
  providers: [GeneralNeedsService, MrpService],
  exports: [GeneralNeedsService, MrpService],
})
export class GeneralNeedsModule {}
