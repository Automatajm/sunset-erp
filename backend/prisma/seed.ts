import { PrismaClient } from '@prisma/client';
import { seedCurrencies } from './seeds/01-currencies.seed';
import { seedLanguages } from './seeds/02-languages.seed';
import { seedPermissions } from './seeds/03-permissions.seed';
import { seedDemoTenant } from './seeds/04-demo-tenant.seed';

const prisma = new PrismaClient();

async function resetDatabase() {
  console.log('🗑️  Resetting database...');
  
  // Delete all data (respects foreign keys - delete in reverse order)
  await prisma.$executeRaw`TRUNCATE TABLE ac_journal_entry_lines CASCADE`;
  await prisma.$executeRaw`TRUNCATE TABLE ac_journal_entries CASCADE`;
  await prisma.$executeRaw`TRUNCATE TABLE ac_accounts CASCADE`;
  await prisma.$executeRaw`TRUNCATE TABLE so_sales_order_lines CASCADE`;
  await prisma.$executeRaw`TRUNCATE TABLE so_sales_orders CASCADE`;
  await prisma.$executeRaw`TRUNCATE TABLE so_customers CASCADE`;
  await prisma.$executeRaw`TRUNCATE TABLE mfg_production_orders CASCADE`;
  await prisma.$executeRaw`TRUNCATE TABLE mfg_work_centers CASCADE`;
  await prisma.$executeRaw`TRUNCATE TABLE mfg_bom_components CASCADE`;
  await prisma.$executeRaw`TRUNCATE TABLE mfg_boms CASCADE`;
  await prisma.$executeRaw`TRUNCATE TABLE in_stock_movements CASCADE`;
  await prisma.$executeRaw`TRUNCATE TABLE in_stock CASCADE`;
  await prisma.$executeRaw`TRUNCATE TABLE in_warehouses CASCADE`;
  await prisma.$executeRaw`TRUNCATE TABLE in_items CASCADE`;
  await prisma.$executeRaw`TRUNCATE TABLE po_purchase_order_lines CASCADE`;
  await prisma.$executeRaw`TRUNCATE TABLE po_purchase_orders CASCADE`;
  await prisma.$executeRaw`TRUNCATE TABLE po_suppliers CASCADE`;
  await prisma.$executeRaw`TRUNCATE TABLE auth_user_roles CASCADE`;
  await prisma.$executeRaw`TRUNCATE TABLE auth_role_permissions CASCADE`;
  await prisma.$executeRaw`TRUNCATE TABLE auth_roles CASCADE`;
  await prisma.$executeRaw`TRUNCATE TABLE auth_permissions CASCADE`;
  await prisma.$executeRaw`TRUNCATE TABLE auth_user_tenants CASCADE`;
  await prisma.$executeRaw`TRUNCATE TABLE auth_users CASCADE`;
  await prisma.$executeRaw`TRUNCATE TABLE saas_usage_records CASCADE`;
  await prisma.$executeRaw`TRUNCATE TABLE saas_invoices CASCADE`;
  await prisma.$executeRaw`TRUNCATE TABLE saas_subscriptions CASCADE`;
  await prisma.$executeRaw`TRUNCATE TABLE saas_subscription_plans CASCADE`;
  await prisma.$executeRaw`TRUNCATE TABLE saas_tenants CASCADE`;
  await prisma.$executeRaw`TRUNCATE TABLE i18n_translations CASCADE`;
  await prisma.$executeRaw`TRUNCATE TABLE i18n_languages CASCADE`;
  await prisma.$executeRaw`TRUNCATE TABLE mc_exchange_rates CASCADE`;
  await prisma.$executeRaw`TRUNCATE TABLE mc_currencies CASCADE`;

  console.log('✅ Database cleared!');
}

async function resetSequences() {
  console.log('🔄 Resetting ID sequences...');
  
  // This ensures all IDs start from 1 again
  // Note: UUID fields don't have sequences, but if you had SERIAL fields, you'd reset them here
  
  console.log('✅ Sequences reset!');
}

async function main() {
  console.log('🌱 Starting database seed...\n');

  // Step 1: Reset everything
  await resetDatabase();
  await resetSequences();

  // Step 2: Seed master data (order matters!)
  console.log('\n📊 Seeding master data...');
  await seedCurrencies(prisma);
  await seedLanguages(prisma);
  await seedPermissions(prisma);

  // Step 3: Seed demo tenant with admin user
  console.log('\n🏢 Seeding demo tenant...');
  await seedDemoTenant(prisma);

  console.log('\n✅ Database seeded successfully!');
  console.log('\n📋 Default credentials:');
  console.log('   Email: admin@demo.com');
  console.log('   Password: Admin123!');
  console.log('   Tenant: DEMO');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
