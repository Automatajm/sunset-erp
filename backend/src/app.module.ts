import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './database/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { SuppliersModule } from './modules/suppliers/suppliers.module';
import { ItemsModule } from './modules/items/items.module';
import { PurchaseOrdersModule } from './modules/purchase-orders/purchase-orders.module';
import { CustomersModule } from './modules/customers/customers.module';
import { SalesOrdersModule } from './modules/sales-orders/sales-orders.module';
import { WarehousesModule } from './modules/warehouses/warehouses.module';
import { StockTransactionsModule } from './modules/stock-transactions/stock-transactions.module';
import { BomModule } from './modules/bom/bom.module';
import { WorkCentersModule } from './modules/work-centers/work-centers.module';
import { ProductionOrdersModule } from './modules/production-orders/production-orders.module';
import { ChartOfAccountsModule } from './modules/chart-of-accounts/chart-of-accounts.module';
import { JournalEntriesModule } from './modules/journal-entries/journal-entries.module';
import { FinancialReportsModule } from './modules/financial-reports/financial-reports.module';
import { FiscalPeriodsModule } from './modules/fiscal-periods/fiscal-periods.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,
    SuppliersModule,
    ItemsModule,
    PurchaseOrdersModule,
    CustomersModule,
    SalesOrdersModule,
    WarehousesModule,
    StockTransactionsModule,
    BomModule,
    WorkCentersModule,
    ProductionOrdersModule,
    ChartOfAccountsModule,
    JournalEntriesModule,
    FinancialReportsModule,
    FiscalPeriodsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
