// ============================================================================
// FILE: backend/prisma/seeds/06-demo-exchange-rates.seed.ts
// spec-021 — USD/DOP + EUR/DOP demo rates (plus explicit inverses) for the
// Burger Borinquen tenant. Idempotent: upserts on the compound unique
// [tenantId, fromCurrency, toCurrency, effectiveDate]. Realistic DR rates for
// the demo period (2026).
// ============================================================================
import { PrismaClient, Prisma } from '@prisma/client';

const RATES: Array<{ from: string; to: string; rate: string; date: string }> = [
  // ── 2026-01-02 (opening) ──
  { from: 'USD', to: 'DOP', rate: '59.150000', date: '2026-01-02' },
  { from: 'DOP', to: 'USD', rate: '0.016906', date: '2026-01-02' },
  { from: 'EUR', to: 'DOP', rate: '64.250000', date: '2026-01-02' },
  { from: 'DOP', to: 'EUR', rate: '0.015564', date: '2026-01-02' },
  // ── 2026-06-01 (current) ──
  { from: 'USD', to: 'DOP', rate: '59.500000', date: '2026-06-01' },
  { from: 'DOP', to: 'USD', rate: '0.016807', date: '2026-06-01' },
  { from: 'EUR', to: 'DOP', rate: '64.800000', date: '2026-06-01' },
  { from: 'DOP', to: 'EUR', rate: '0.015432', date: '2026-06-01' },
];

export async function seedDemoExchangeRates(prisma: PrismaClient) {
  console.log('💱 Seeding demo exchange rates (BURGER)...');

  const tenant = await prisma.tenant.findFirst({ where: { code: 'BURGER' } });
  if (!tenant) {
    console.warn('   ⚠️  BURGER tenant not found — skipping exchange-rate seed.');
    return;
  }
  const admin = await prisma.user.findFirst({ where: { email: 'admin@burger.do' } });

  let upserted = 0;
  for (const r of RATES) {
    await prisma.exchangeRate.upsert({
      where: {
        tenantId_fromCurrency_toCurrency_effectiveDate: {
          tenantId: tenant.id,
          fromCurrency: r.from,
          toCurrency: r.to,
          effectiveDate: new Date(r.date),
        },
      },
      create: {
        tenantId: tenant.id,
        fromCurrency: r.from,
        toCurrency: r.to,
        rate: new Prisma.Decimal(r.rate),
        effectiveDate: new Date(r.date),
        source: 'manual',
        createdBy: admin?.id ?? null,
      },
      update: { rate: new Prisma.Decimal(r.rate), source: 'manual' },
    });
    upserted++;
  }
  console.log(`   ✅ ${upserted} exchange rates upserted (USD/DOP + EUR/DOP + inverses)`);
}
