// --- categories/categories.module.ts ---
import { Module } from '@nestjs/common';
import { CategoriesService } from './categories.service';
import { CategoriesController } from './categories.controller';
import { PrismaModule } from '../../database/prisma.module';
import { ChartOfAccountsModule } from '../chart-of-accounts/chart-of-accounts.module';

@Module({
  imports: [PrismaModule, ChartOfAccountsModule],
  controllers: [CategoriesController],
  providers: [CategoriesService],
  exports: [CategoriesService],
})
export class CategoriesModule {}
