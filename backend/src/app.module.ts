import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './database/prisma.module';
import { RedisModule } from './database/redis.module';
import { CommonModule } from './common/common.module';
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
import { BudgetsModule } from './modules/budgets/budgets.module';
import { CashFlowModule } from './modules/cash-flow/cash-flow.module';
import { ArInvoicesModule } from './modules/ar-invoices/ar-invoices.module';
import { AutomationModule } from './modules/automation/automation.module';
import { BulkImportModule } from './modules/bulk-import/bulk-import.module';
import { ApInvoicesModule } from './modules/ap-invoices/ap-invoices.module';
import { UomModule } from './modules/uom/uom.module';
import { CurrencyModule } from './modules/currency/currency.module';
import { TenantSettingsModule } from './modules/tenant-settings/tenant-settings.module';
import { MacroCategoriesModule } from './modules/macro-categories/macro-categories.module';
import { CategoriesModule } from './modules/categories/categories.module';
import { ConsumptionGroupsModule } from './modules/consumption-groups/consumption-groups.module';
import { SupplierItemsModule } from './modules/supplier-items/supplier-items.module';
import { WarehouseLocationsModule } from './modules/warehouse-locations/warehouse-locations.module';
import { GoodsReceiptsModule } from './modules/goods-receipts/goods-receipts.module';
import { StockReconciliationModule } from './modules/stock-reconciliation/stock-reconciliation.module';
import { UsersModule } from './modules/users/users.module';
import { RolesModule } from './modules/roles/roles.module';
import { TenantsModule } from './modules/tenants/tenants.module';
import { ProductionPlansModule } from './modules/production-plans/production-plans.module';
import { PurchaseRequisitionsModule } from './modules/purchase-requisitions/purchase-requisitions.module';
import { GeneralNeedsModule } from './modules/general-needs/general-needs.module';
import { RfqsModule } from './modules/rfqs/rfqs.module';
import { NotificationsModule } from './modules/notifications/notifications.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
    PrismaModule,
    RedisModule,
    CommonModule,
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
    BudgetsModule,
    CashFlowModule,
    ArInvoicesModule,
    AutomationModule,
    BulkImportModule,
    ApInvoicesModule,
    UomModule,
    CurrencyModule,
    TenantSettingsModule,
    MacroCategoriesModule,
    CategoriesModule,
    ConsumptionGroupsModule,
    SupplierItemsModule,
    WarehouseLocationsModule,
    GoodsReceiptsModule,
    StockReconciliationModule,
    UsersModule,
    RolesModule,
    TenantsModule,
    ProductionPlansModule,
    PurchaseRequisitionsModule,
    GeneralNeedsModule,
    RfqsModule,
    NotificationsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
