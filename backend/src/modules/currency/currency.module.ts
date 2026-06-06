// ============================================================================
// FILE: backend/src/modules/currency/currency.module.ts
// ============================================================================
import { Module } from '@nestjs/common';
import { CurrencyService } from './currency.service';
import { CurrencyController } from './currency.controller';
import { PrismaModule } from '../../database/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [CurrencyController],
  providers: [CurrencyService],
  exports: [CurrencyService], // monetary modules (SO/PO/AR/AP) inject it to freeze rates
})
export class CurrencyModule {}
