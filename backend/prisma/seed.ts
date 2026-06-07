import { PrismaClient } from '@prisma/client';
import { seedCurrencies } from './seeds/01-currencies.seed';
import { seedLanguages } from './seeds/02-languages.seed';
import { seedPermissions } from './seeds/03-permissions.seed';
import { seedDemoTenant } from './seeds/04-demo-tenant.seed';
import { seedDemoBurgerBorinquen } from './seeds/05-demo-burger-borinquen.seed';
import { seedDemoExchangeRates } from './seeds/06-demo-exchange-rates.seed';

// ─────────────────────────────────────────────────────────────────────────────
// spec-028 — SEED CONTRACT: this seed is ADDITIVE and IDEMPOTENT.
// It never deletes anything: every sub-seed upserts (01-04, 06) or
// check-and-creates (05), so re-running it on a populated database is a safe
// no-op top-up. API-created data always survives a `pnpm seed`.
// Wiping the database lives EXCLUSIVELY in `pnpm seed:reset`
// (prisma migrate reset --force: schema drop + migrations + this seed on
// empty tables). Do not reintroduce TRUNCATE/deleteMany here — Prisma also
// auto-invokes this file after `migrate reset` and in some `migrate dev`
// flows, so any wipe here fires implicitly.
// (Removed 2026-06-07: resetDatabase() — 32 × TRUNCATE CASCADE — after it
// destroyed all tenants' data when `pnpm seed` was run as a "safe" restore.)
// ─────────────────────────────────────────────────────────────────────────────

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seed (additive — nothing is deleted)...\n');

  // Step 1: Seed master data (order matters!)
  console.log('📊 Seeding master data...');
  await seedCurrencies(prisma);
  await seedLanguages(prisma);
  await seedPermissions(prisma);

  // Step 2: Seed demo tenant with admin user
  console.log('\n🏢 Seeding demo tenant...');
  await seedDemoTenant(prisma);

  // Step 3: Themed demo tenant (Burger Borinquen). Requires the UOM catalog
  // (npx ts-node prisma/seed-uom.ts); skipped with a warning when missing so
  // the base seed never breaks.
  console.log('\n🍔 Seeding Burger Borinquen demo data...');
  try {
    await seedDemoBurgerBorinquen(prisma);
  } catch (e: any) {
    if (String(e?.message).includes('UOM catalog missing')) {
      console.warn('   ⚠️  Skipped: ' + e.message);
    } else {
      throw e;
    }
  }

  // Step 4: Demo exchange rates (spec-021) — idempotent, skips if BURGER missing
  console.log('\n💱 Seeding demo exchange rates...');
  await seedDemoExchangeRates(prisma);

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
