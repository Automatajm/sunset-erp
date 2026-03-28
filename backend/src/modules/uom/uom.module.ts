// --- uom/uom.module.ts ---
import { Module } from '@nestjs/common';
import { UomService } from './uom.service';
import { UomController } from './uom.controller';
import { PrismaModule } from '../../database/prisma.module';
 
@Module({
  imports: [PrismaModule],
  controllers: [UomController],
  providers: [UomService],
  exports: [UomService],
})
export class UomModule {}