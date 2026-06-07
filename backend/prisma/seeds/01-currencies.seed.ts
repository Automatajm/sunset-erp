import { PrismaClient } from '@prisma/client';

export async function seedCurrencies(prisma: PrismaClient) {
  console.log('💰 Seeding currencies...');

  const currencies = [
    { code: 'USD', name: 'US Dollar', symbol: '$', decimalPlaces: 2 },
    { code: 'EUR', name: 'Euro', symbol: '€', decimalPlaces: 2 },
    { code: 'GBP', name: 'British Pound', symbol: '£', decimalPlaces: 2 },
    { code: 'DOP', name: 'Dominican Peso', symbol: 'RD$', decimalPlaces: 2 },
    { code: 'CAD', name: 'Canadian Dollar', symbol: 'C$', decimalPlaces: 2 },
    { code: 'MXN', name: 'Mexican Peso', symbol: 'MX$', decimalPlaces: 2 },
  ];

  // spec-028 — additive seed: upsert on the natural key so re-runs are no-ops.
  for (const currency of currencies) {
    await prisma.currency.upsert({
      where: { code: currency.code },
      update: {},
      create: currency,
    });
  }

  console.log(`   ✅ ${currencies.length} currencies ensured`);
}
