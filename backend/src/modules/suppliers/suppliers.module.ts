import { Module } from '@nestjs/common';
import { SuppliersController } from './suppliers.controller';
import { PrismaModule } from '../../database/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [SuppliersController],
})
export class SuppliersModule {}
