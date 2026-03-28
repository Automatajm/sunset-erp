import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding UOM catalog...');

  // ── UOM Units ──────────────────────────────────────────────────────────────
  const units = [
    // Universal (no conversion)
    { code: 'PCS',    name: 'Piece',          type: 'count',  system: 'universal', isBase: true,  symbol: 'pcs' },
    { code: 'UNIT',   name: 'Unit',           type: 'count',  system: 'universal', isBase: false, symbol: 'unit' },
    { code: 'BOX',    name: 'Box',            type: 'count',  system: 'universal', isBase: false, symbol: 'box' },
    { code: 'CAJA',   name: 'Caja',           type: 'count',  system: 'universal', isBase: false, symbol: 'cja' },
    { code: 'KIT',    name: 'Kit',            type: 'count',  system: 'universal', isBase: false, symbol: 'kit' },
    { code: 'PALLET', name: 'Pallet',         type: 'count',  system: 'universal', isBase: false, symbol: 'plt' },
    { code: 'DOZEN',  name: 'Dozen',          type: 'count',  system: 'universal', isBase: false, symbol: 'dz' },
    // Volume — Metric
    { code: 'LTR',    name: 'Liter',          type: 'volume', system: 'metric',    isBase: true,  symbol: 'L' },
    { code: 'ML',     name: 'Milliliter',     type: 'volume', system: 'metric',    isBase: false, symbol: 'mL' },
    { code: 'M3',     name: 'Cubic Meter',    type: 'volume', system: 'metric',    isBase: false, symbol: 'm³' },
    // Volume — Imperial
    { code: 'GAL',    name: 'Gallon',         type: 'volume', system: 'imperial',  isBase: true,  symbol: 'gal' },
    { code: 'QT',     name: 'Quart',          type: 'volume', system: 'imperial',  isBase: false, symbol: 'qt' },
    { code: 'PT',     name: 'Pint',           type: 'volume', system: 'imperial',  isBase: false, symbol: 'pt' },
    { code: 'FLOZ',   name: 'Fluid Ounce',    type: 'volume', system: 'imperial',  isBase: false, symbol: 'fl oz' },
    { code: 'BRL',    name: 'Barrel (200L)',  type: 'volume', system: 'imperial',  isBase: false, symbol: 'brl' },
    // Mass — Metric
    { code: 'KG',     name: 'Kilogram',       type: 'mass',   system: 'metric',    isBase: true,  symbol: 'kg' },
    { code: 'G',      name: 'Gram',           type: 'mass',   system: 'metric',    isBase: false, symbol: 'g' },
    { code: 'TON',    name: 'Metric Ton',     type: 'mass',   system: 'metric',    isBase: false, symbol: 't' },
    // Mass — Imperial
    { code: 'LB',     name: 'Pound',          type: 'mass',   system: 'imperial',  isBase: true,  symbol: 'lb' },
    { code: 'OZ',     name: 'Ounce (weight)', type: 'mass',   system: 'imperial',  isBase: false, symbol: 'oz' },
    // Length — Metric
    { code: 'M',      name: 'Meter',          type: 'length', system: 'metric',    isBase: true,  symbol: 'm' },
    { code: 'CM',     name: 'Centimeter',     type: 'length', system: 'metric',    isBase: false, symbol: 'cm' },
    { code: 'MM',     name: 'Millimeter',     type: 'length', system: 'metric',    isBase: false, symbol: 'mm' },
    // Length — Imperial
    { code: 'FT',     name: 'Foot',           type: 'length', system: 'imperial',  isBase: true,  symbol: 'ft' },
    { code: 'IN',     name: 'Inch',           type: 'length', system: 'imperial',  isBase: false, symbol: 'in' },
    { code: 'YD',     name: 'Yard',           type: 'length', system: 'imperial',  isBase: false, symbol: 'yd' },
  ];

  for (const u of units) {
    await prisma.uomUnit.upsert({
      where: { code: u.code },
      update: {},
      create: u,
    });
  }
  console.log(`  ✓ ${units.length} UOM units seeded`);

  // ── Get IDs for conversions ────────────────────────────────────────────────
  const get = async (code: string) => {
    const u = await prisma.uomUnit.findUnique({ where: { code } });
    if (!u) throw new Error(`UOM not found: ${code}`);
    return u.id;
  };

  // ── UOM Conversions ────────────────────────────────────────────────────────
  const conversionDefs = [
    // Volume: Metric ↔ Imperial
    ['GAL',  'LTR',  3.78541],
    ['LTR',  'GAL',  0.26417],
    ['BRL',  'LTR',  200.000],
    ['LTR',  'BRL',  0.00500],
    ['QT',   'LTR',  0.94635],
    ['LTR',  'QT',   1.05669],
    ['PT',   'LTR',  0.47318],
    ['LTR',  'PT',   2.11338],
    ['FLOZ', 'ML',   29.5735],
    ['ML',   'FLOZ', 0.03381],
    // Volume: Metric internal
    ['LTR',  'ML',   1000.0],
    ['ML',   'LTR',  0.001],
    ['M3',   'LTR',  1000.0],
    ['LTR',  'M3',   0.001],
    // Mass: Metric ↔ Imperial
    ['KG',   'LB',   2.20462],
    ['LB',   'KG',   0.45359],
    ['KG',   'G',    1000.0],
    ['G',    'KG',   0.001],
    ['TON',  'KG',   1000.0],
    ['KG',   'TON',  0.001],
    ['LB',   'OZ',   16.0],
    ['OZ',   'LB',   0.0625],
    // Length: Metric ↔ Imperial
    ['M',    'FT',   3.28084],
    ['FT',   'M',    0.30480],
    ['M',    'CM',   100.0],
    ['CM',   'M',    0.01],
    ['M',    'MM',   1000.0],
    ['MM',   'M',    0.001],
    ['FT',   'IN',   12.0],
    ['IN',   'FT',   0.08333],
    ['YD',   'FT',   3.0],
    ['FT',   'YD',   0.33333],
    ['IN',   'CM',   2.54],
    ['CM',   'IN',   0.39370],
    // Count: universal cross-conversions
    ['DOZEN','PCS',  12.0],
    ['PCS',  'DOZEN',0.08333],
  ];

  let convCount = 0;
  for (const [from, to, factor] of conversionDefs) {
    const fromId = await get(from as string);
    const toId   = await get(to as string);
    await prisma.uomConversion.upsert({
      where:  { fromUomId_toUomId: { fromUomId: fromId, toUomId: toId } },
      update: { factor },
      create: { fromUomId: fromId, toUomId: toId, factor },
    });
    convCount++;
  }
  console.log(`  ✓ ${convCount} UOM conversions seeded`);

  // ── Tenant Settings for demo tenant ───────────────────────────────────────
  const DEMO_TENANT = '2f627a44-df80-4b0f-ba11-6fd44e62f243';
  const ltrId = await get('LTR');
  const kgId  = await get('KG');
  const mId   = await get('M');

  await prisma.tenantSettings.upsert({
    where:  { tenantId: DEMO_TENANT },
    update: {},
    create: {
      tenantId:        DEMO_TENANT,
      defaultUomSystem: 'metric',
      volumeBaseUomId:  ltrId,
      massBaseUomId:    kgId,
      lengthBaseUomId:  mId,
    },
  });
  console.log('  ✓ Demo tenant settings seeded (metric system, LTR/KG/M)');

  console.log('\nSeed complete.');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());