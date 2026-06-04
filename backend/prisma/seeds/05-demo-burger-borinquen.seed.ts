// ============================================================================
// Demo seed — BURGER BORINQUEN S.R.L. (hamburger factory, Santo Domingo, DR)
// ============================================================================
// One coherent business story: 3 burger SKUs sold wholesale to Santo Domingo
// restaurants/colmados. Every purchase traces to a BOM, every BOM to a sale,
// and the totals reconcile to the peso (asserted before any write).
//
//   Year 1 (2026): 175 units/day × 26 working days = 4,550/month = 54,600/year
//   SKU mix 50/30/20 — Clásica RD$105 | BBQ Bacon RD$135 | Doble Queso RD$165
//   Ingredient cost ≈ 65% of revenue → gross margin ≈ 35% (asserted ±2pp)
//   Growth +20% Y2, +20% Y3 (expressed in the 2026/2027/2028 budgets)
//
// PRICE RESEARCH (2026-06-04), currency DOP (RD$), FX ≈ 58.2 DOP/USD:
//   - Ground beef RD$129/lb retail ("carne molida selecta") → ~RD$284/kg;
//     wholesale modeled at RD$235/kg (−17%).
//     https://eldinero.com.do/69397/cuanto-cuesta-comer-saludable-en-republica-dominicana/
//   - Produce retail (preciosmundi, EUR→DOP ~64): lettuce ~RD$60/kg, tomato
//     ~RD$65/kg, onion ~RD$74/kg → wholesale RD$48/52/55.
//     https://preciosmundi.com/republica-dominicana/precios-supermercado
//   - Burger buns: Lumijor jumbo bun 70.8 g/unit (PriceSmart DR) → 85 g
//     bakery bun modeled at RD$13/unit wholesale.
//     https://www.pricesmart.com/en-do/product/lumijor-jumbo-burger-bun-12-units-70-8-g-2-49-oz-485529/485529
//   - Imported cheddar (Sirena "Yokesso" per-lb anchor) → RD$480/kg wholesale.
//     https://sirena.do/products/index/queso-cheddar-yokesso-importado-lb-
//   - FX: BCRD via https://revistamercado.do/money-invest/republica-dominicana/precio-del-dolar-hoy-en-republica-dominicana-este-jueves-4-de-junio-de-2026/
//   - ESTIMATED (no public wholesale quote found; flagged): bacon RD$520/kg,
//     pickles RD$160/kg, mayo-ketchup RD$120/kg, BBQ sauce RD$180/kg,
//     wrapper RD$3.50/unit.
//   - Recipe grams: 150 g patty / 20 g cheese slice corroborated by
//     https://bradleysfinediner.com/fresh-meat/beef/how-many-grams-of-beef-in-a-burger/
//   - Suppliers modeled after the real DR landscape (Grupo SID/MercaSID,
//     Induveca, DILEVSA, Mercadom, Lumijor) with fictional names.
//     https://gruposid.com.do/en/companies/
//
// PREREQUISITE: the global UOM catalog (cfg_uom_units) must be seeded first:
//   npx ts-node prisma/seed-uom.ts
//
// IDEMPOTENT: master data upserts on real unique constraints; documents
// (SO/PO/JE) are created only if their deterministic number does not exist.
// Re-running produces identical row counts. Never touches DEMO/TENANT2.
//
// Standalone run: npx ts-node prisma/seeds/05-demo-burger-borinquen.seed.ts
// ============================================================================
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

// ── SCENARIO — single source of truth for every number ──────────────────────

const SCENARIO = {
  tenant: {
    code: 'BURGER',
    name: 'Burger Borinquen',
    legalName: 'Burger Borinquen S.R.L.',
    adminEmail: 'admin@burger.do',
    currency: 'DOP',
    year: 2026,
  },
  volume: {
    unitsPerDay: 175,
    workingDaysPerMonth: 26,
    months: 12,
    growthY2: 1.2,
    growthY3: 1.2,
  },
  // Wholesale prices per consumption gram (RD$/g) or per unit (RD$/unit).
  // pricePerPurchaseUom is what the supplier invoices (KG or UNIT).
  ingredients: [
    { code: 'RM-BEEF-8020', name: 'Carne de Res Molida 80/20',   cg: 'Carne de Res 80/20',  cat: 'PROT-RES',    uom: 'G',    pricePerKgOrUnit: 235,  scrap: 2, moq: 25,  leadDays: 2, supplier: 'CARNICOS' },
    { code: 'RM-BACON',     name: 'Tocineta Ahumada',            cg: 'Tocineta',            cat: 'PROT-RES',    uom: 'G',    pricePerKgOrUnit: 520,  scrap: 1, moq: 10,  leadDays: 2, supplier: 'CARNICOS', estimated: true },
    { code: 'RM-BUN-85',    name: 'Pan de Hamburguesa 85g',      cg: 'Pan de Hamburguesa',  cat: 'BAK-PAN',     uom: 'UNIT', pricePerKgOrUnit: 13,   scrap: 1, moq: 100, leadDays: 1, supplier: 'PANIFICADORA' },
    { code: 'RM-CHEDDAR',   name: 'Queso Cheddar en Lonjas',     cg: 'Queso Cheddar',       cat: 'DAIRY-QUESO', uom: 'G',    pricePerKgOrUnit: 480,  scrap: 1, moq: 10,  leadDays: 3, supplier: 'ANTILLANA' },
    { code: 'RM-LETTUCE',   name: 'Lechuga Repollada',           cg: 'Lechuga',             cat: 'PROD-VEG',    uom: 'G',    pricePerKgOrUnit: 48,   scrap: 5, moq: 20,  leadDays: 1, supplier: 'AGROMERCADO' },
    { code: 'RM-TOMATO',    name: 'Tomate Barceló',              cg: 'Tomate',              cat: 'PROD-VEG',    uom: 'G',    pricePerKgOrUnit: 52,   scrap: 5, moq: 20,  leadDays: 1, supplier: 'AGROMERCADO' },
    { code: 'RM-ONION',     name: 'Cebolla Roja',                cg: 'Cebolla',             cat: 'PROD-VEG',    uom: 'G',    pricePerKgOrUnit: 55,   scrap: 5, moq: 20,  leadDays: 1, supplier: 'AGROMERCADO' },
    { code: 'RM-PICKLES',   name: 'Pepinillos en Vinagre',       cg: 'Pepinillos',          cat: 'GROC-SALSAS', uom: 'G',    pricePerKgOrUnit: 160,  scrap: 0, moq: 10,  leadDays: 5, supplier: 'ANTILLANA', estimated: true },
    { code: 'RM-MAYOKET',   name: 'Salsa Mayo-Ketchup Granel',   cg: 'Salsa Mayo-Ketchup',  cat: 'GROC-SALSAS', uom: 'G',    pricePerKgOrUnit: 120,  scrap: 0, moq: 10,  leadDays: 5, supplier: 'ANTILLANA', estimated: true },
    { code: 'RM-BBQ',       name: 'Salsa BBQ Granel',            cg: 'Salsa BBQ',           cat: 'GROC-SALSAS', uom: 'G',    pricePerKgOrUnit: 180,  scrap: 0, moq: 10,  leadDays: 5, supplier: 'ANTILLANA', estimated: true },
    { code: 'PK-WRAPPER',   name: 'Envoltorio Parafinado',       cg: 'Envoltorio',          cat: 'PACK-ENV',    uom: 'UNIT', pricePerKgOrUnit: 3.5,  scrap: 0, moq: 500, leadDays: 7, supplier: 'EMPAQUES', estimated: true },
  ],
  // Recipes: grams per unit (UNIT items: units per unit). Source: classic
  // burger composition (see header).
  skus: [
    {
      code: 'FG-CLASSIC', name: 'Hamburguesa Clásica', price: 105, mix: 0.5,
      bom: 'BOM-2026-0001',
      recipe: { 'RM-BUN-85': 1, 'RM-BEEF-8020': 150, 'RM-CHEDDAR': 20, 'RM-LETTUCE': 15, 'RM-TOMATO': 25, 'RM-ONION': 10, 'RM-PICKLES': 8, 'RM-MAYOKET': 12, 'PK-WRAPPER': 1 },
    },
    {
      code: 'FG-BBQ', name: 'BBQ Bacon Burger', price: 135, mix: 0.3,
      bom: 'BOM-2026-0002',
      recipe: { 'RM-BUN-85': 1, 'RM-BEEF-8020': 150, 'RM-CHEDDAR': 20, 'RM-BACON': 30, 'RM-BBQ': 15, 'RM-ONION': 10, 'RM-PICKLES': 8, 'PK-WRAPPER': 1 },
    },
    {
      code: 'FG-DOBLE', name: 'Doble Queso', price: 165, mix: 0.2,
      bom: 'BOM-2026-0003',
      recipe: { 'RM-BUN-85': 1, 'RM-BEEF-8020': 300, 'RM-CHEDDAR': 40, 'RM-LETTUCE': 15, 'RM-TOMATO': 25, 'RM-MAYOKET': 12, 'PK-WRAPPER': 1 },
    },
  ],
  suppliers: [
    { key: 'CARNICOS',     code: 'SUP-2026-0001', name: 'Cárnicos del Cibao S.R.L.',          taxId: '1-31-58291-4', city: 'Santiago',      address: 'Carretera Duarte Km 6, Santiago',          phone: '+1-809-581-4420', terms: 'NET15' },
    { key: 'PANIFICADORA', code: 'SUP-2026-0002', name: 'Panificadora Lumar S.R.L.',          taxId: '1-31-47712-8', city: 'Santo Domingo', address: 'Av. Máximo Gómez 184, Santo Domingo',      phone: '+1-809-565-3318', terms: 'NET15' },
    { key: 'AGROMERCADO',  code: 'SUP-2026-0003', name: 'Agromercado Duarte S.R.L.',          taxId: '1-31-50934-2', city: 'Santo Domingo', address: 'Mercado Nuevo, Av. Duarte, Santo Domingo', phone: '+1-809-687-9215', terms: 'COD' },
    { key: 'ANTILLANA',    code: 'SUP-2026-0004', name: 'Distribuidora Antillana S.R.L.',     taxId: '1-31-61108-7', city: 'Santo Domingo', address: 'Zona Industrial de Herrera, Santo Domingo', phone: '+1-809-530-7741', terms: 'NET30' },
    { key: 'EMPAQUES',     code: 'SUP-2026-0005', name: 'Empaques del Caribe S.R.L.',         taxId: '1-31-55470-9', city: 'Santo Domingo', address: 'Parque Industrial DISDO, Santo Domingo',   phone: '+1-809-372-1184', terms: 'NET30' },
  ],
  customers: [
    { code: 'CL-0001', name: 'Restaurante El Conuco',        terms: 'NET15', creditLimit: 150000 },
    { code: 'CL-0002', name: 'Cafetería La 27',              terms: 'NET15', creditLimit: 80000 },
    { code: 'CL-0003', name: 'Colmadón El Primo',            terms: 'COD',   creditLimit: 40000 },
    { code: 'CL-0004', name: 'Hotel Malecón Plaza',          terms: 'NET30', creditLimit: 250000 },
    { code: 'CL-0005', name: 'Food Truck Burger Mania',      terms: 'COD',   creditLimit: 30000 },
    { code: 'CL-0006', name: 'Distribuidora Gourmet del Este', terms: 'NET30', creditLimit: 300000 },
    { code: 'CL-0007', name: 'Cafetería Universitaria UASD', terms: 'NET15', creditLimit: 90000 },
    { code: 'CL-0008', name: 'Mini Market Villa Juana',      terms: 'COD',   creditLimit: 35000 },
  ],
  workCenters: [
    { code: 'WC-PREP-01',  name: 'Estación de Preparación', type: 'labor',    capacityPerHour: 250, costPerHour: 180 },
    { code: 'WC-GRILL-01', name: 'Plancha Industrial 1',    type: 'machine',  capacityPerHour: 200, costPerHour: 350 },
    { code: 'WC-PACK-01',  name: 'Línea de Empaque',        type: 'assembly', capacityPerHour: 400, costPerHour: 150 },
  ],
  accounts: [
    { number: '1.1.01', name: 'Caja y Bancos',           type: 'asset' },
    { number: '1.2.01', name: 'Cuentas por Cobrar',      type: 'asset' },
    { number: '1.3.01', name: 'Inventario Materia Prima', type: 'asset' },
    { number: '2.1.01', name: 'Cuentas por Pagar',       type: 'liability' },
    { number: '3.1.01', name: 'Capital Social',          type: 'equity' },
    { number: '4.1.01', name: 'Ventas de Producto',      type: 'revenue' },
    { number: '5.1.01', name: 'Costo de Ventas',         type: 'expense' },
  ],
  // Per-month per-SO unit allocation (4 SOs/month, integer chunks per SKU,
  // each chunk sums to the SKU's monthly volume — see assertions).
  soChunks: {
    'FG-CLASSIC': [700, 650, 525, 400],
    'FG-BBQ': [420, 390, 315, 240],
    'FG-DOBLE': [280, 260, 210, 160],
  } as Record<string, number[]>,
  targetMarginPct: 35,
  marginTolerancePp: 2,
};

// ── Derived figures (computed, never transcribed) ────────────────────────────

const round2 = (n: number) => Math.round(n * 100) / 100;
const round3 = (n: number) => Math.round(n * 1000) / 1000;

function deriveScenario() {
  const s = SCENARIO;
  const monthlyUnits = s.volume.unitsPerDay * s.volume.workingDaysPerMonth; // 4,550
  const yearUnits = [
    monthlyUnits * s.volume.months,
    Math.round(monthlyUnits * s.volume.months * s.volume.growthY2),
    Math.round(monthlyUnits * s.volume.months * s.volume.growthY2 * s.volume.growthY3),
  ];

  const ing = new Map(s.ingredients.map((i) => [i.code, i]));
  // Cost per consumption unit (RD$/g for G items, RD$/unit for UNIT items).
  const unitCost = (code: string) => {
    const i = ing.get(code)!;
    return i.uom === 'G' ? i.pricePerKgOrUnit / 1000 : i.pricePerKgOrUnit;
  };

  // SKU cost = Σ component qty × unit cost × (1 + scrap%) — the BOM contract.
  const skuCost: Record<string, number> = {};
  for (const sku of s.skus) {
    skuCost[sku.code] = Object.entries(sku.recipe).reduce((sum, [code, qty]) => {
      const i = ing.get(code)!;
      return sum + qty * unitCost(code) * (1 + i.scrap / 100);
    }, 0);
  }

  const avgPrice = s.skus.reduce((a, k) => a + k.price * k.mix, 0);
  const avgCost = s.skus.reduce((a, k) => a + skuCost[k.code] * k.mix, 0);
  const marginPct = (1 - avgCost / avgPrice) * 100;

  const skuMonthlyUnits: Record<string, number> = {};
  for (const sku of s.skus) skuMonthlyUnits[sku.code] = monthlyUnits * sku.mix;

  // Monthly ingredient need in consumption units (g or units), scrap included.
  const monthlyNeed: Record<string, number> = {};
  for (const sku of s.skus) {
    for (const [code, qty] of Object.entries(sku.recipe)) {
      const i = ing.get(code)!;
      monthlyNeed[code] =
        (monthlyNeed[code] ?? 0) + qty * (1 + i.scrap / 100) * skuMonthlyUnits[sku.code];
    }
  }
  // Monthly purchase qty in purchase UOM (kg or units), rounded UP to MOQ multiples.
  const monthlyBuy: Record<string, number> = {};
  for (const [code, need] of Object.entries(monthlyNeed)) {
    const i = ing.get(code)!;
    const inPurchaseUom = i.uom === 'G' ? need / 1000 : need;
    monthlyBuy[code] = Math.ceil(inPurchaseUom / i.moq) * i.moq;
  }

  const monthlyRevenue = s.skus.reduce((a, k) => a + k.price * skuMonthlyUnits[k.code], 0);
  const monthlyCogs = s.skus.reduce((a, k) => a + skuCost[k.code] * skuMonthlyUnits[k.code], 0);
  const monthlyPurchases = Object.entries(monthlyBuy).reduce(
    (a, [code, qty]) => a + qty * ing.get(code)!.pricePerKgOrUnit,
    0,
  );

  return {
    monthlyUnits,
    yearUnits,
    skuCost,
    avgPrice,
    avgCost,
    marginPct,
    skuMonthlyUnits,
    monthlyNeed,
    monthlyBuy,
    monthlyRevenue,
    monthlyCogs,
    monthlyPurchases,
    unitCost,
  };
}

// ── Consistency contract — throws BEFORE any DB write ───────────────────────

function assertScenario(d: ReturnType<typeof deriveScenario>) {
  const s = SCENARIO;
  const fail = (msg: string) => {
    throw new Error(`SCENARIO INCONSISTENT — ${msg}`);
  };

  // Gross margin within target ± tolerance.
  if (Math.abs(d.marginPct - s.targetMarginPct) > s.marginTolerancePp)
    fail(
      `gross margin ${d.marginPct.toFixed(1)}% outside ${s.targetMarginPct}±${s.marginTolerancePp}pp`,
    );

  // SKU mix sums to 1 and produces integer monthly units.
  const mixSum = s.skus.reduce((a, k) => a + k.mix, 0);
  if (Math.abs(mixSum - 1) > 1e-9) fail(`SKU mix sums to ${mixSum}, not 1`);
  for (const sku of s.skus)
    if (!Number.isInteger(d.skuMonthlyUnits[sku.code]))
      fail(`${sku.code} monthly units ${d.skuMonthlyUnits[sku.code]} not integer`);

  // SO chunk allocations sum exactly to each SKU's monthly volume.
  for (const sku of s.skus) {
    const chunkSum = s.soChunks[sku.code].reduce((a, b) => a + b, 0);
    if (chunkSum !== d.skuMonthlyUnits[sku.code])
      fail(`${sku.code} SO chunks sum ${chunkSum} ≠ monthly ${d.skuMonthlyUnits[sku.code]}`);
  }

  // Year growth is exactly +20% / +20%.
  if (d.yearUnits[1] !== Math.round(d.yearUnits[0] * 1.2)) fail('Y2 ≠ Y1 × 1.20');
  if (d.yearUnits[2] !== Math.round(d.yearUnits[1] * 1.2)) fail('Y3 ≠ Y2 × 1.20');

  // Purchases cover the BOM-derived need for every ingredient (MOQ buffer ≥ 0).
  for (const [code, need] of Object.entries(d.monthlyNeed)) {
    const i = SCENARIO.ingredients.find((x) => x.code === code)!;
    const needPurchaseUom = i.uom === 'G' ? need / 1000 : need;
    if (d.monthlyBuy[code] + 1e-9 < needPurchaseUom)
      fail(`${code} monthly buy ${d.monthlyBuy[code]} < need ${needPurchaseUom}`);
  }

  // Every recipe component exists as an ingredient.
  for (const sku of s.skus)
    for (const code of Object.keys(sku.recipe))
      if (!s.ingredients.some((i) => i.code === code)) fail(`${sku.code} references unknown ${code}`);
}

// ── Seeder ───────────────────────────────────────────────────────────────────

export async function seedDemoBurgerBorinquen(prisma: PrismaClient) {
  const s = SCENARIO;
  const d = deriveScenario();
  assertScenario(d);
  const Y = s.tenant.year;

  console.log('🍔 Seeding Burger Borinquen demo tenant...');
  console.log(
    `   📐 Margin check: avg price RD$${d.avgPrice.toFixed(2)}, avg cost RD$${d.avgCost.toFixed(2)} → ${d.marginPct.toFixed(1)}% gross margin ✔`,
  );

  // — UOM catalog prerequisite —
  const uomG = await prisma.uomUnit.findUnique({ where: { code: 'G' } });
  const uomKG = await prisma.uomUnit.findUnique({ where: { code: 'KG' } });
  const uomUNIT = await prisma.uomUnit.findUnique({ where: { code: 'UNIT' } });
  if (!uomG || !uomKG || !uomUNIT)
    throw new Error(
      'UOM catalog missing (cfg_uom_units). Run first: npx ts-node prisma/seed-uom.ts',
    );
  const uomFor = (code: 'G' | 'UNIT') => (code === 'G' ? uomG : uomUNIT);
  const purchaseUomFor = (code: 'G' | 'UNIT') => (code === 'G' ? uomKG : uomUNIT);

  // — Tenant + admin (house pattern from 04-demo-tenant.seed.ts) —
  const tenant = await prisma.tenant.upsert({
    where: { code: s.tenant.code },
    update: {},
    create: {
      code: s.tenant.code,
      name: s.tenant.name,
      legalName: s.tenant.legalName,
      country: 'DO',
      industry: 'Food Manufacturing',
      subscriptionPlan: 'enterprise',
      subscriptionStatus: 'active',
      defaultCurrency: s.tenant.currency,
      defaultLanguage: 'es-DO',
      fiscalYearStart: 1,
      status: 'active',
    },
  });
  const passwordHash = await bcrypt.hash('Admin123!', 12);
  const admin = await prisma.user.upsert({
    where: { email: s.tenant.adminEmail },
    update: { passwordHash },
    create: {
      email: s.tenant.adminEmail,
      passwordHash,
      firstName: 'Borinquen',
      lastName: 'Admin',
      status: 'active',
      locale: 'es-DO',
      timezone: 'America/Santo_Domingo',
    },
  });
  await prisma.userTenant.upsert({
    where: { userId_tenantId: { userId: admin.id, tenantId: tenant.id } },
    update: { isDefault: true, isActive: true },
    create: { userId: admin.id, tenantId: tenant.id, isDefault: true, isActive: true },
  });
  const adminRole = await prisma.role.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'ADMIN' } },
    update: {},
    create: {
      tenantId: tenant.id,
      code: 'ADMIN',
      name: 'Administrator',
      description: 'Full system access',
      isSystem: true,
      createdBy: admin.id,
      updatedBy: admin.id,
    },
  });
  const permissions = await prisma.permission.findMany();
  for (const p of permissions) {
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRole.id, permissionId: p.id } },
      update: {},
      create: { roleId: adminRole.id, permissionId: p.id },
    });
  }
  await prisma.userRole.upsert({
    where: {
      userId_roleId_tenantId: { userId: admin.id, roleId: adminRole.id, tenantId: tenant.id },
    },
    update: {},
    create: { userId: admin.id, roleId: adminRole.id, tenantId: tenant.id },
  });
  const T = tenant.id;
  const U = admin.id;
  const audit = { createdBy: U, updatedBy: U };
  console.log(`   ✅ Tenant ${s.tenant.code} + ${s.tenant.adminEmail}`);

  // — Chart of accounts —
  const accountId: Record<string, string> = {};
  for (const a of s.accounts) {
    const row = await prisma.account.upsert({
      where: { tenantId_accountNumber: { tenantId: T, accountNumber: a.number } },
      update: {},
      create: {
        tenantId: T,
        accountNumber: a.number,
        name: a.name,
        accountType: a.type,
        currency: s.tenant.currency,
        isSystem: false,
        allowManualPosting: true,
        requireReconciliation: false,
        isActive: true,
        ...audit,
      },
    });
    accountId[a.number] = row.id;
  }
  console.log(`   ✅ ${s.accounts.length} GL accounts`);

  // — Classification: macro categories + categories —
  const MACROS = [
    { code: 'PROTEIN', name: 'Proteínas' },
    { code: 'BAKERY', name: 'Panadería' },
    { code: 'PRODUCE', name: 'Vegetales Frescos' },
    { code: 'DAIRY', name: 'Lácteos' },
    { code: 'GROCERY', name: 'Abarrotes y Salsas' },
    { code: 'PACKAGING', name: 'Empaques' },
    { code: 'FG', name: 'Producto Terminado' },
  ];
  const CATS: Record<string, { name: string; macro: string }> = {
    'PROT-RES': { name: 'Res y Embutidos', macro: 'PROTEIN' },
    'BAK-PAN': { name: 'Panes', macro: 'BAKERY' },
    'PROD-VEG': { name: 'Vegetales', macro: 'PRODUCE' },
    'DAIRY-QUESO': { name: 'Quesos', macro: 'DAIRY' },
    'GROC-SALSAS': { name: 'Salsas y Encurtidos', macro: 'GROCERY' },
    'PACK-ENV': { name: 'Envoltorios', macro: 'PACKAGING' },
    'FG-BURGERS': { name: 'Hamburguesas', macro: 'FG' },
  };
  const macroId: Record<string, string> = {};
  for (const m of MACROS) {
    const row = await prisma.macroCategory.upsert({
      where: { tenantId_code: { tenantId: T, code: m.code } },
      update: {},
      create: { tenantId: T, code: m.code, name: m.name, isActive: true, ...audit },
    });
    macroId[m.code] = row.id;
  }
  const catId: Record<string, string> = {};
  for (const [code, c] of Object.entries(CATS)) {
    const row = await prisma.category.upsert({
      where: { tenantId_code: { tenantId: T, code } },
      update: {},
      create: {
        tenantId: T,
        code,
        name: c.name,
        macroCategoryId: macroId[c.macro],
        inventoryAccountId: accountId['1.3.01'],
        cogsAccountId: accountId['5.1.01'],
        isActive: true,
        ...audit,
      },
    });
    catId[code] = row.id;
  }
  console.log(`   ✅ ${MACROS.length} macro categories, ${Object.keys(CATS).length} categories`);

  // — Consumption groups (CG-YYYY-NNNN, deterministic; sequence stays valid) —
  const cgId: Record<string, string> = {};
  for (let i = 0; i < s.ingredients.length; i++) {
    const ing = s.ingredients[i];
    const code = `CG-${Y}-${String(i + 1).padStart(4, '0')}`;
    const row = await prisma.consumptionGroup.upsert({
      where: { tenantId_code: { tenantId: T, code } },
      update: {},
      create: {
        tenantId: T,
        code,
        name: ing.cg,
        description: `Necesidad genérica: ${ing.name}`,
        consumptionUomId: uomFor(ing.uom as 'G' | 'UNIT').id,
        isActive: true,
        ...audit,
      },
    });
    cgId[ing.code] = row.id;
  }
  console.log(`   ✅ ${s.ingredients.length} consumption groups`);

  // — Items: ingredients (raw materials) + finished SKUs —
  const itemId: Record<string, string> = {};
  for (const ing of s.ingredients) {
    const isUnit = ing.uom === 'UNIT';
    const row = await prisma.item.upsert({
      where: { tenantId_code: { tenantId: T, code: ing.code } },
      update: {},
      create: {
        tenantId: T,
        code: ing.code,
        name: ing.name,
        description: ing.estimated ? 'Precio mayorista estimado (sin cotización pública)' : null,
        itemType: 'raw_material',
        categoryId: catId[ing.cat],
        consumptionGroupId: cgId[ing.code],
        baseUom: ing.uom,
        purchaseUomId: purchaseUomFor(ing.uom as 'G' | 'UNIT').id,
        purchaseToConsumptionFactor: isUnit ? 1 : 1000, // KG → G
        storageUomId: purchaseUomFor(ing.uom as 'G' | 'UNIT').id,
        storageToConsumptionFactor: isUnit ? 1 : 1000,
        consumptionUomId: uomFor(ing.uom as 'G' | 'UNIT').id,
        isStockable: true,
        isPurchasable: true,
        isSaleable: false,
        isManufacturable: false,
        valuationMethod: 'average',
        standardCost: round3(d.unitCost(ing.code)), // per consumption unit
        leadTimeDays: ing.leadDays,
        isActive: true,
        ...audit,
      },
    });
    itemId[ing.code] = row.id;
  }
  for (const sku of s.skus) {
    const row = await prisma.item.upsert({
      where: { tenantId_code: { tenantId: T, code: sku.code } },
      update: {},
      create: {
        tenantId: T,
        code: sku.code,
        name: sku.name,
        description: `Precio mayorista RD$${sku.price} — mix ${sku.mix * 100}%`,
        itemType: 'finished_good',
        categoryId: catId['FG-BURGERS'],
        baseUom: 'UNIT',
        consumptionUomId: uomUNIT.id,
        isStockable: true,
        isPurchasable: false,
        isSaleable: true,
        isManufacturable: true,
        valuationMethod: 'average',
        standardCost: round2(d.skuCost[sku.code]), // computed BOM cost
        isActive: true,
        ...audit,
      },
    });
    itemId[sku.code] = row.id;
  }
  console.log(`   ✅ ${s.ingredients.length} ingredients + ${s.skus.length} finished SKUs`);

  // — Suppliers + price lists —
  const supplierId: Record<string, string> = {};
  for (const sup of s.suppliers) {
    const row = await prisma.supplier.upsert({
      where: { tenantId_code: { tenantId: T, code: sup.code } },
      update: {},
      create: {
        tenantId: T,
        code: sup.code,
        name: sup.name,
        legalName: sup.name,
        taxId: sup.taxId,
        phone: sup.phone,
        paymentTerms: sup.terms,
        currency: s.tenant.currency,
        address: sup.address,
        city: sup.city,
        country: 'DO',
        ...audit,
      },
    });
    supplierId[sup.key] = row.id;
  }
  let priceRows = 0;
  for (const ing of s.ingredients) {
    await prisma.supplierItem.upsert({
      where: {
        tenantId_supplierId_itemId: {
          tenantId: T,
          supplierId: supplierId[ing.supplier],
          itemId: itemId[ing.code],
        },
      },
      update: { lastPrice: ing.pricePerKgOrUnit },
      create: {
        tenantId: T,
        supplierId: supplierId[ing.supplier],
        itemId: itemId[ing.code],
        supplierItemName: ing.name,
        purchaseUomId: purchaseUomFor(ing.uom as 'G' | 'UNIT').id,
        packSize: 1,
        conversionFactor: ing.uom === 'G' ? 1000 : 1, // purchase → consumption
        lastPrice: ing.pricePerKgOrUnit,
        leadTimeDays: ing.leadDays,
        moq: ing.moq,
        isPreferred: true,
        isActive: true,
        ...audit,
      },
    });
    priceRows++;
  }
  console.log(`   ✅ ${s.suppliers.length} suppliers, ${priceRows} supplier-item prices`);

  // — Work centers + BOMs (recipe + routing) —
  const wcId: Record<string, string> = {};
  for (const wc of s.workCenters) {
    const row = await prisma.workCenter.upsert({
      where: { tenantId_code: { tenantId: T, code: wc.code } },
      update: {},
      create: {
        tenantId: T,
        code: wc.code,
        name: wc.name,
        workCenterType: wc.type,
        capacityPerHour: wc.capacityPerHour,
        efficiencyPercent: 95,
        costPerHour: wc.costPerHour,
        isActive: true,
        ...audit,
      },
    });
    wcId[wc.code] = row.id;
  }
  for (const sku of s.skus) {
    const existing = await prisma.bom.findFirst({
      where: { tenantId: T, bomNumber: sku.bom, version: 1 },
    });
    if (!existing) {
      await prisma.bom.create({
        data: {
          tenantId: T,
          parentItemId: itemId[sku.code],
          bomNumber: sku.bom,
          version: 1,
          isActive: true,
          ...audit,
          components: {
            create: Object.entries(sku.recipe).map(([code, qty], idx) => {
              const ing = s.ingredients.find((x) => x.code === code)!;
              return {
                tenantId: T,
                consumptionGroupId: cgId[code],
                lineNumber: idx + 1,
                quantityPer: qty,
                uom: ing.uom,
                consumptionUomId: uomFor(ing.uom as 'G' | 'UNIT').id,
                scrapPercent: ing.scrap,
                ...audit,
              };
            }),
          },
          routings: {
            create: [
              { tenantId: T, stepNumber: 10, workCenterId: wcId['WC-PREP-01'], description: 'Porcionado y preparación de ingredientes', setupTime: 0.25, runTimePerUnit: 0.002, ...audit },
              { tenantId: T, stepNumber: 20, workCenterId: wcId['WC-GRILL-01'], description: 'Cocción de carne y armado', setupTime: 0.5, runTimePerUnit: 0.004, ...audit },
              { tenantId: T, stepNumber: 30, workCenterId: wcId['WC-PACK-01'], description: 'Envoltura y empaque', setupTime: 0.1, runTimePerUnit: 0.0015, ...audit },
            ],
          },
        },
      });
    }
  }
  console.log(
    `   ✅ ${s.workCenters.length} work centers, ${s.skus.length} BOMs (with routing) — ` +
      s.skus.map((k) => `${k.code} RD$${d.skuCost[k.code].toFixed(2)}/u`).join(' | '),
  );

  // — Customers —
  for (const c of s.customers) {
    await prisma.customer.upsert({
      where: { tenantId_code: { tenantId: T, code: c.code } },
      update: {},
      create: {
        tenantId: T,
        code: c.code,
        name: c.name,
        creditLimit: c.creditLimit,
        creditStatus: 'good',
        paymentTerms: c.terms,
        currency: s.tenant.currency,
        isActive: true,
        ...audit,
      },
    });
  }
  const customers = await prisma.customer.findMany({
    where: { tenantId: T, deletedAt: null },
    orderBy: { code: 'asc' },
  });
  console.log(`   ✅ ${customers.length} customers`);

  // — Warehouse (so the inventory pages have a home) —
  await prisma.warehouse.upsert({
    where: { tenantId_code: { tenantId: T, code: 'WH-REG-001' } },
    update: {},
    create: {
      tenantId: T,
      code: 'WH-REG-001',
      name: 'Almacén Principal Herrera',
      warehouseType: 'regular',
      address: 'Zona Industrial de Herrera, Santo Domingo',
      isActive: true,
      ...audit,
    },
  });

  // — Sales orders: Year 1, 4 SOs/month, deterministic numbers + dates —
  let soCreated = 0;
  for (let m = 1; m <= s.volume.months; m++) {
    for (let k = 0; k < 4; k++) {
      const soNumber = `SO-${Y}-${String((m - 1) * 4 + k + 1).padStart(4, '0')}`;
      const exists = await prisma.salesOrder.findUnique({
        where: { tenantId_soNumber: { tenantId: T, soNumber } },
      });
      if (exists) continue;
      const customer = customers[(m * 4 + k) % customers.length];
      const orderDate = new Date(Date.UTC(Y, m - 1, 5));
      const lines = s.skus.map((sku, idx) => {
        const qty = s.soChunks[sku.code][k];
        return {
          tenantId: T,
          lineNumber: idx + 1,
          itemId: itemId[sku.code],
          orderedQuantity: qty,
          uom: 'UNIT',
          unitPrice: sku.price,
          lineTotal: round2(qty * sku.price),
          status: 'open',
          ...audit,
        };
      });
      const subtotal = round2(lines.reduce((a, l) => a + l.lineTotal, 0));
      await prisma.salesOrder.create({
        data: {
          tenantId: T,
          soNumber,
          customerId: customer.id,
          orderDate,
          promisedDate: new Date(Date.UTC(Y, m - 1, 12)),
          paymentTerms: customer.paymentTerms,
          currency: s.tenant.currency,
          subtotal,
          total: subtotal, // ITBIS deliberately out of scope (0 tax)
          status: 'confirmed',
          ...audit,
          lines: { create: lines },
        },
      });
      soCreated++;
    }
  }
  console.log(`   ✅ Sales orders Y1: ${soCreated} created (48 expected on first run)`);

  // — Purchase orders: DERIVED monthly per supplier from the BOMs —
  const ingBySupplier = new Map<string, typeof s.ingredients>();
  for (const ing of s.ingredients) {
    if (!ingBySupplier.has(ing.supplier)) ingBySupplier.set(ing.supplier, [] as any);
    (ingBySupplier.get(ing.supplier) as any).push(ing);
  }
  const supplierKeys = s.suppliers.map((x) => x.key);
  let poCreated = 0;
  let poSeq = 0;
  for (let m = 1; m <= s.volume.months; m++) {
    for (const key of supplierKeys) {
      poSeq++;
      const poNumber = `PO-${Y}-${String(poSeq).padStart(4, '0')}`;
      const exists = await prisma.purchaseOrder.findFirst({
        where: { tenantId: T, poNumber, deletedAt: null },
      });
      if (exists) continue;
      const sup = s.suppliers.find((x) => x.key === key)!;
      const lines = (ingBySupplier.get(key) ?? []).map((ing, idx) => {
        const qty = d.monthlyBuy[ing.code];
        return {
          tenantId: T,
          lineNumber: idx + 1,
          itemId: itemId[ing.code],
          orderedQuantity: qty,
          uom: ing.uom === 'G' ? 'KG' : 'UNIT',
          purchaseUomId: purchaseUomFor(ing.uom as 'G' | 'UNIT').id,
          unitPrice: ing.pricePerKgOrUnit,
          lineTotal: round2(qty * ing.pricePerKgOrUnit),
          status: 'open',
          ...audit,
        };
      });
      const subtotal = round2(lines.reduce((a, l) => a + l.lineTotal, 0));
      await prisma.purchaseOrder.create({
        data: {
          tenantId: T,
          poNumber,
          supplierId: supplierId[key],
          poDate: new Date(Date.UTC(Y, m - 1, 1)),
          expectedDate: new Date(Date.UTC(Y, m - 1, 4)),
          paymentTerms: sup.terms,
          currency: s.tenant.currency,
          subtotal,
          total: subtotal,
          status: 'approved',
          ...audit,
          lines: { create: lines },
        },
      });
      poCreated++;
    }
  }
  console.log(`   ✅ Purchase orders Y1: ${poCreated} created (60 expected on first run)`);

  // — Journal entries: 3 per month (sales / COGS / purchases), all balanced —
  const monthlyRevenue = round2(d.monthlyRevenue);
  const monthlyCogs = round2(d.monthlyCogs);
  const monthlyPurchases = round2(d.monthlyPurchases);
  let jeCreated = 0;
  let jeSeq = 0;
  for (let m = 1; m <= s.volume.months; m++) {
    const period = `${Y}-${String(m).padStart(2, '0')}`;
    const lastDay = new Date(Date.UTC(Y, m, 0));
    const entries: Array<{
      desc: string;
      type: string;
      lines: Array<{ acc: string; debit: number; credit: number; desc: string }>;
    }> = [
      {
        desc: `Ventas ${period} — ${d.monthlyUnits} unidades`,
        type: 'sales',
        lines: [
          { acc: '1.2.01', debit: monthlyRevenue, credit: 0, desc: 'CxC clientes' },
          { acc: '4.1.01', debit: 0, credit: monthlyRevenue, desc: 'Ingresos por ventas' },
        ],
      },
      {
        desc: `Costo de ventas ${period} (costo BOM)`,
        type: 'cogs',
        lines: [
          { acc: '5.1.01', debit: monthlyCogs, credit: 0, desc: 'COGS al costo BOM' },
          { acc: '1.3.01', debit: 0, credit: monthlyCogs, desc: 'Salida de inventario' },
        ],
      },
      {
        desc: `Compras ${period} (POs del mes)`,
        type: 'purchases',
        lines: [
          { acc: '1.3.01', debit: monthlyPurchases, credit: 0, desc: 'Entrada de inventario' },
          { acc: '2.1.01', debit: 0, credit: monthlyPurchases, desc: 'CxP proveedores' },
        ],
      },
    ];
    for (const e of entries) {
      jeSeq++;
      const entryNumber = `JE-${Y}-${String(jeSeq).padStart(4, '0')}`;
      const totalDebit = round2(e.lines.reduce((a, l) => a + l.debit, 0));
      const totalCredit = round2(e.lines.reduce((a, l) => a + l.credit, 0));
      if (totalDebit !== totalCredit)
        throw new Error(`JE ${entryNumber} unbalanced: ${totalDebit} ≠ ${totalCredit}`);
      const exists = await prisma.journalEntry.findUnique({
        where: { tenantId_entryNumber: { tenantId: T, entryNumber } },
      });
      if (exists) continue;
      await prisma.journalEntry.create({
        data: {
          tenantId: T,
          entryNumber,
          entryDate: lastDay,
          postingDate: lastDay,
          fiscalPeriod: period,
          journalType: e.type,
          description: e.desc,
          status: 'posted',
          ...audit,
          lines: {
            create: e.lines.map((l, idx) => ({
              tenantId: T,
              lineNumber: idx + 1,
              accountId: accountId[l.acc],
              description: l.desc,
              debitAmount: l.debit,
              creditAmount: l.credit,
              currency: s.tenant.currency,
              ...audit,
            })),
          },
        },
      });
      jeCreated++;
    }
  }
  console.log(`   ✅ Journal entries Y1: ${jeCreated} created (36 expected, all balanced)`);

  // — Budgets: 3 fiscal years, revenue + COGS per month, +20%/+20% growth —
  const growth = [1, s.volume.growthY2, s.volume.growthY2 * s.volume.growthY3];
  for (let y = 0; y < 3; y++) {
    const fiscalYear = String(Y + y);
    const budget = await prisma.budget.upsert({
      where: { tenantId_budgetCode: { tenantId: T, budgetCode: `BUDGET-${fiscalYear}` } },
      update: {},
      create: {
        tenantId: T,
        budgetCode: `BUDGET-${fiscalYear}`,
        budgetName: `Presupuesto Operativo ${fiscalYear}`,
        fiscalYear,
        description: `Plan ${fiscalYear}: ${Math.round(d.yearUnits[y]).toLocaleString()} unidades (${y === 0 ? 'base' : `+20% × ${y}`})`,
        status: 'approved',
        ...audit,
      },
    });
    for (let m = 1; m <= 12; m++) {
      const period = `${fiscalYear}-${String(m).padStart(2, '0')}`;
      const rows = [
        { acc: '4.1.01', amount: round2(d.monthlyRevenue * growth[y]) },
        { acc: '5.1.01', amount: round2(d.monthlyCogs * growth[y]) },
      ];
      for (const r of rows) {
        await prisma.budgetLine.upsert({
          where: {
            budgetId_accountId_fiscalPeriod: {
              budgetId: budget.id,
              accountId: accountId[r.acc],
              fiscalPeriod: period,
            },
          },
          update: { budgetAmount: r.amount },
          create: {
            tenantId: T,
            budgetId: budget.id,
            accountId: accountId[r.acc],
            fiscalPeriod: period,
            budgetAmount: r.amount,
            ...audit,
          },
        });
      }
    }
  }
  console.log('   ✅ Budgets 2026/2027/2028 (revenue + COGS × 12 months each)');

  // ── Verification — re-query the DB and print the reconciliation ────────────
  const [nItems, nSups, nPrices, nBoms, nCustomers, nSOs, nPOs, nJEs, nBudgetLines] =
    await Promise.all([
      prisma.item.count({ where: { tenantId: T, deletedAt: null } }),
      prisma.supplier.count({ where: { tenantId: T, deletedAt: null } }),
      prisma.supplierItem.count({ where: { tenantId: T, deletedAt: null } }),
      prisma.bom.count({ where: { tenantId: T, deletedAt: null } }),
      prisma.customer.count({ where: { tenantId: T, deletedAt: null } }),
      prisma.salesOrder.count({ where: { tenantId: T, deletedAt: null } }),
      prisma.purchaseOrder.count({ where: { tenantId: T, deletedAt: null } }),
      prisma.journalEntry.count({ where: { tenantId: T, deletedAt: null } }),
      prisma.budgetLine.count({ where: { tenantId: T, deletedAt: null } }),
    ]);
  const jeBalance = await prisma.journalEntryLine.aggregate({
    where: { tenantId: T, deletedAt: null },
    _sum: { debitAmount: true, creditAmount: true },
  });
  const soTotal = await prisma.salesOrder.aggregate({
    where: { tenantId: T, deletedAt: null },
    _sum: { total: true },
  });

  console.log('\n   ── Verification ──────────────────────────────────────────');
  console.log(
    `   ✔ ${s.skus.length} SKUs, ${s.ingredients.length} ingredients (${nItems} items), ${nSups} suppliers, ${nPrices} prices`,
  );
  console.log(
    `   ✔ ${s.volume.unitsPerDay} u/day × ${s.volume.workingDaysPerMonth} days = ${d.monthlyUnits.toLocaleString()} u/month Y1`,
  );
  console.log(
    `   ✔ Avg ticket RD$${d.avgPrice.toFixed(2)} → monthly revenue RD$${monthlyRevenue.toLocaleString()}`,
  );
  console.log(
    `   ✔ BOM cost/unit: ${s.skus.map((k) => `${k.name.split(' ').pop()} RD$${d.skuCost[k.code].toFixed(2)}`).join(' | ')}`,
  );
  console.log(
    `   ✔ Ingredient cost = ${(100 - d.marginPct).toFixed(1)}% of revenue → gross margin ${d.marginPct.toFixed(1)}% (target ${s.targetMarginPct}±${s.marginTolerancePp}pp)`,
  );
  console.log(
    `   ✔ ${nBoms} BOMs, ${nCustomers} customers, ${nSOs} SOs (Σ RD$${Number(soTotal._sum.total ?? 0).toLocaleString()}), ${nPOs} POs, ${nJEs} JEs, ${nBudgetLines} budget lines`,
  );
  console.log(
    `   ✔ JE totals: ΣDR RD$${Number(jeBalance._sum.debitAmount ?? 0).toLocaleString()} = ΣCR RD$${Number(jeBalance._sum.creditAmount ?? 0).toLocaleString()} ${Number(jeBalance._sum.debitAmount ?? 0) === Number(jeBalance._sum.creditAmount ?? 0) ? '(balanced)' : '(UNBALANCED!)'}`,
  );
  console.log(
    `   ✔ Year volumes: ${d.yearUnits.map((u) => u.toLocaleString()).join(' / ')} units (+20%/+20%)`,
  );
  console.log(
    `   ✔ Monthly MOQ buffer (buy − need): ` +
      Object.entries(d.monthlyBuy)
        .filter(([code, qty]) => {
          const i = s.ingredients.find((x) => x.code === code)!;
          const need = i.uom === 'G' ? d.monthlyNeed[code] / 1000 : d.monthlyNeed[code];
          return qty - need > 0.005;
        })
        .slice(0, 4)
        .map(([code, qty]) => {
          const i = s.ingredients.find((x) => x.code === code)!;
          const need = i.uom === 'G' ? d.monthlyNeed[code] / 1000 : d.monthlyNeed[code];
          return `${code} +${(qty - need).toFixed(1)}`;
        })
        .join(', ') +
      ' (rounded up to supplier MOQs)',
  );
  console.log('\n🎉 Burger Borinquen ready! 📧 admin@burger.do / Admin123! → tenant BURGER');
}

// ── Standalone entry point ───────────────────────────────────────────────────
if (require.main === module) {
  const prisma = new PrismaClient();
  seedDemoBurgerBorinquen(prisma)
    .catch((e) => {
      console.error('❌ Burger Borinquen seed failed:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
