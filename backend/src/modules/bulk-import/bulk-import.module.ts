import { Module } from '@nestjs/common';
import { BulkImportService } from './bulk-import.service';
import { BulkImportController } from './bulk-import.controller';
import { PrismaModule } from '../../database/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [BulkImportController],
  providers: [BulkImportService],
  exports: [BulkImportService],
})
export class BulkImportModule {}
