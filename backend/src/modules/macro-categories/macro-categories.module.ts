// --- macro-categories/macro-categories.module.ts ---
import { Module } from '@nestjs/common';
import { MacroCategoriesService } from './macro-categories.service';
import { MacroCategoriesController } from './macro-categories.controller';
import { PrismaModule } from '../../database/prisma.module';
import { CategoriesModule } from '../categories/categories.module';

@Module({
  imports: [PrismaModule, CategoriesModule],
  controllers: [MacroCategoriesController],
  providers: [MacroCategoriesService],
  exports: [MacroCategoriesService],
})
export class MacroCategoriesModule {}
