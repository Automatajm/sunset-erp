import { PrismaClient, MeasurementSystem, ItemType, UnitPurpose } from '@prisma/client';

const prisma = new PrismaClient();

async function seedItemsData() {
  console.log('\n🌱 Starting Items seed...\n');
  console.log('════════════════════════════════════════════════════════════\n');

  const tenant = await prisma.tenant.findUnique({
    where: { code: 'SUNSET' },
  });

  if (!tenant) {
    throw new Error('Tenant SUNSET not found. Run main seed first.');
  }

  // ============================================
  // 1. CATEGORÍAS DE UNIDADES
  // ============================================
  console.log('📏 Creating Unit Categories...');

  const unitCategories = await prisma.unitCategory.createMany({
    data: [
      { code: 'WEIGHT', name: 'Peso / Weight', system: 'BOTH' as MeasurementSystem },
      { code: 'VOLUME', name: 'Volumen / Volume', system: 'BOTH' as MeasurementSystem },
      { code: 'LENGTH', name: 'Longitud / Length', system: 'BOTH' as MeasurementSystem },
      { code: 'AREA', name: 'Área / Area', system: 'BOTH' as MeasurementSystem },
      { code: 'TEMPERATURE', name: 'Temperatura / Temperature', system: 'BOTH' as MeasurementSystem },
      { code: 'TIME', name: 'Tiempo / Time', system: 'METRIC' as MeasurementSystem },
      { code: 'QUANTITY', name: 'Cantidad / Quantity', system: 'METRIC' as MeasurementSystem },
    ],
    skipDuplicates: true,
  });

  console.log(`✅ Created ${unitCategories.count} unit categories\n`);

  // ============================================
  // 2. UNIDADES DE MEDIDA
  // ============================================
  console.log('📐 Creating Units of Measure...');

  const weightCat = await prisma.unitCategory.findUnique({ where: { code: 'WEIGHT' } });
  const volumeCat = await prisma.unitCategory.findUnique({ where: { code: 'VOLUME' } });
  const lengthCat = await prisma.unitCategory.findUnique({ where: { code: 'LENGTH' } });
  const areaCat = await prisma.unitCategory.findUnique({ where: { code: 'AREA' } });
  const timeCat = await prisma.unitCategory.findUnique({ where: { code: 'TIME' } });
  const qtyCat = await prisma.unitCategory.findUnique({ where: { code: 'QUANTITY' } });

  const units = [
    // PESO
    { code: 'KG', name: 'Kilogramo', symbol: 'kg', categoryId: weightCat!.id, system: 'METRIC' as MeasurementSystem, isBaseUnit: true, conversionFactor: 1.0 },
    { code: 'G', name: 'Gramo', symbol: 'g', categoryId: weightCat!.id, system: 'METRIC' as MeasurementSystem, isBaseUnit: false, conversionFactor: 0.001 },
    { code: 'LB', name: 'Libra', symbol: 'lb', categoryId: weightCat!.id, system: 'IMPERIAL' as MeasurementSystem, isBaseUnit: false, conversionFactor: 0.453592 },
    { code: 'OZ', name: 'Onza', symbol: 'oz', categoryId: weightCat!.id, system: 'IMPERIAL' as MeasurementSystem, isBaseUnit: false, conversionFactor: 0.0283495 },
    
    // VOLUMEN
    { code: 'L', name: 'Litro', symbol: 'L', categoryId: volumeCat!.id, system: 'METRIC' as MeasurementSystem, isBaseUnit: true, conversionFactor: 1.0 },
    { code: 'ML', name: 'Mililitro', symbol: 'ml', categoryId: volumeCat!.id, system: 'METRIC' as MeasurementSystem, isBaseUnit: false, conversionFactor: 0.001 },
    { code: 'GAL', name: 'Galón', symbol: 'gal', categoryId: volumeCat!.id, system: 'IMPERIAL' as MeasurementSystem, isBaseUnit: false, conversionFactor: 3.78541 },
    
    // LONGITUD
    { code: 'M', name: 'Metro', symbol: 'm', categoryId: lengthCat!.id, system: 'METRIC' as MeasurementSystem, isBaseUnit: true, conversionFactor: 1.0 },
    { code: 'CM', name: 'Centímetro', symbol: 'cm', categoryId: lengthCat!.id, system: 'METRIC' as MeasurementSystem, isBaseUnit: false, conversionFactor: 0.01 },
    { code: 'FT', name: 'Pie', symbol: 'ft', categoryId: lengthCat!.id, system: 'IMPERIAL' as MeasurementSystem, isBaseUnit: false, conversionFactor: 0.3048 },
    { code: 'IN', name: 'Pulgada', symbol: 'in', categoryId: lengthCat!.id, system: 'IMPERIAL' as MeasurementSystem, isBaseUnit: false, conversionFactor: 0.0254 },
    
    // ÁREA
    { code: 'M2', name: 'Metro Cuadrado', symbol: 'm²', categoryId: areaCat!.id, system: 'METRIC' as MeasurementSystem, isBaseUnit: true, conversionFactor: 1.0 },
    { code: 'FT2', name: 'Pie Cuadrado', symbol: 'ft²', categoryId: areaCat!.id, system: 'IMPERIAL' as MeasurementSystem, isBaseUnit: false, conversionFactor: 0.092903 },
    
    // TIEMPO
    { code: 'HOUR', name: 'Hora', symbol: 'h', categoryId: timeCat!.id, system: 'METRIC' as MeasurementSystem, isBaseUnit: true, conversionFactor: 1.0 },
    { code: 'DAY', name: 'Día', symbol: 'd', categoryId: timeCat!.id, system: 'METRIC' as MeasurementSystem, isBaseUnit: false, conversionFactor: 24.0 },
    
    // CANTIDAD
    { code: 'UNIT', name: 'Unidad', symbol: 'und', categoryId: qtyCat!.id, system: 'METRIC' as MeasurementSystem, isBaseUnit: true, conversionFactor: 1.0 },
    { code: 'DOZEN', name: 'Docena', symbol: 'dz', categoryId: qtyCat!.id, system: 'METRIC' as MeasurementSystem, isBaseUnit: false, conversionFactor: 12.0 },
    { code: 'BOX', name: 'Caja', symbol: 'caja', categoryId: qtyCat!.id, system: 'METRIC' as MeasurementSystem, isBaseUnit: false, conversionFactor: 1.0 },
    { code: 'BAG', name: 'Saco', symbol: 'saco', categoryId: qtyCat!.id, system: 'METRIC' as MeasurementSystem, isBaseUnit: false, conversionFactor: 1.0 },
    { code: 'PALLET', name: 'Pallet', symbol: 'pallet', categoryId: qtyCat!.id, system: 'METRIC' as MeasurementSystem, isBaseUnit: false, conversionFactor: 1.0 },
  ];

  for (const unit of units) {
    await prisma.unitOfMeasure.upsert({
      where: { code: unit.code },
      update: {},
      create: {
        code: unit.code,
        name: unit.name,
        symbol: unit.symbol,
        system: unit.system,
        isBaseUnit: unit.isBaseUnit,
        conversionFactor: unit.conversionFactor,
        category: { connect: { id: unit.categoryId } },
      },
    });
  }

  console.log(`✅ Created ${units.length} units of measure\n`);

  // ============================================
  // 3. MONEDAS
  // ============================================
  console.log('💰 Creating Currencies...');

  const currencies = [
    { code: 'USD', name: 'US Dollar', symbol: '$', decimalPlaces: 2, isBaseCurrency: true },
    { code: 'EUR', name: 'Euro', symbol: '€', decimalPlaces: 2, isBaseCurrency: false },
    { code: 'DOP', name: 'Peso Dominicano', symbol: 'RD$', decimalPlaces: 2, isBaseCurrency: false },
  ];

  for (const currency of currencies) {
    await prisma.currency.upsert({
      where: { code: currency.code },
      update: {},
      create: currency,
    });
  }

  console.log(`✅ Created ${currencies.length} currencies\n`);

  // ============================================
  // 4. TASAS DE CAMBIO
  // ============================================
  console.log('💱 Creating Exchange Rates...');

  const usd = await prisma.currency.findUnique({ where: { code: 'USD' } });
  const dop = await prisma.currency.findUnique({ where: { code: 'DOP' } });

  const today = new Date();
  const exchangeRates = [
    { fromCurrencyId: usd!.id, toCurrencyId: dop!.id, rate: 58.50, effectiveDate: today, source: 'MANUAL' },
    { fromCurrencyId: dop!.id, toCurrencyId: usd!.id, rate: 0.017094, effectiveDate: today, source: 'MANUAL' },
  ];

  for (const rate of exchangeRates) {
    await prisma.exchangeRate.upsert({
      where: {
        fromCurrencyId_toCurrencyId_effectiveDate: {
          fromCurrencyId: rate.fromCurrencyId,
          toCurrencyId: rate.toCurrencyId,
          effectiveDate: rate.effectiveDate,
        },
      },
      update: {},
      create: rate,
    });
  }

  console.log(`✅ Created ${exchangeRates.length} exchange rates\n`);

  // Actualizar tenant
  await prisma.tenant.update({
    where: { id: tenant.id },
    data: { baseCurrencyId: usd!.id },
  });

  console.log('✅ Set USD as base currency\n');

  // ============================================
  // 5. CONFIGURACIÓN DE CALENDARIO
  // ============================================
  console.log('📅 Creating Calendar Config...');

  await prisma.calendarConfig.upsert({
    where: { tenantId: tenant.id },
    update: {},
    create: {
      tenantId: tenant.id,
      calendarType: 'ISO_8601',
      firstDayOfWeek: 1,
      fiscalYearStartMonth: 1,
      fiscalYearStartDay: 1,
    },
  });

  console.log('✅ Calendar config created\n');

  // ============================================
  // 6. CATEGORÍAS DE ITEMS
  // ============================================
  console.log('📂 Creating Item Categories...');

  const adminUser = await prisma.user.findFirst({
    where: { tenantId: tenant.id, email: 'admin@sunset-rider.com' },
  });

  const categories = [
    { code: 'PROD', name: 'Productos', itemType: 'PRODUCT' as ItemType },
    { code: 'SERV', name: 'Servicios', itemType: 'SERVICE' as ItemType },
    { code: 'ASSET', name: 'Activos Fijos', itemType: 'FIXED_ASSET' as ItemType },
    { code: 'TOOL', name: 'Herramientas', itemType: 'TOOL' as ItemType },
    { code: 'MAT', name: 'Materiales', itemType: 'MATERIAL' as ItemType },
  ];

  const createdCategories = new Map();

  for (const cat of categories) {
    const category = await prisma.category.upsert({
      where: { code: cat.code },
      update: {},
      create: {
        tenantId: tenant.id,
        code: cat.code,
        name: cat.name,
        itemType: cat.itemType,
        level: 1,
        createdBy: adminUser?.id,
      },
    });
    createdCategories.set(cat.code, category);
  }

  console.log(`✅ Created ${categories.length} item categories\n`);

  // ============================================
  // 7. ITEMS DE EJEMPLO
  // ============================================
  console.log('📦 Creating Example Items...');

  const unitUnit = await prisma.unitOfMeasure.findUnique({ where: { code: 'UNIT' } });
  const unitHour = await prisma.unitOfMeasure.findUnique({ where: { code: 'HOUR' } });

  const prodCat = createdCategories.get('PROD');
  const servCat = createdCategories.get('SERV');
  const assetCat = createdCategories.get('ASSET');

  const items = [
    {
      code: 'PROD-001',
      name: 'Laptop Dell XPS 15',
      description: 'Laptop profesional',
      itemType: 'PRODUCT' as ItemType,
      categoryId: prodCat!.id,
      baseUnitId: unitUnit!.id,
      isSellable: true,
      isPurchasable: true,
      isInventoriable: true,
      costPrice: 1200.00,
      salePrice: 1500.00,
      currentStock: 10,
      minStock: 5,
      createdBy: adminUser!.id,
    },
    {
      code: 'SERV-001',
      name: 'Consultoría Financiera',
      description: 'Servicio de consultoría',
      itemType: 'SERVICE' as ItemType,
      categoryId: servCat!.id,
      baseUnitId: unitHour!.id,
      isSellable: true,
      isPurchasable: false,
      isInventoriable: false,
      salePrice: 150.00,
      createdBy: adminUser!.id,
    },
    {
      code: 'ASSET-001',
      name: 'Camión Ford F-150',
      description: 'Camión de reparto',
      itemType: 'FIXED_ASSET' as ItemType,
      categoryId: assetCat!.id,
      baseUnitId: unitUnit!.id,
      isSellable: false,
      isPurchasable: false,
      isInventoriable: false,
      costPrice: 35000.00,
      createdBy: adminUser!.id,
    },
  ];

  for (const item of items) {
    await prisma.item.upsert({
      where: { tenantId_code: { tenantId: tenant.id, code: item.code } },
      update: {},
      create: { ...item, tenantId: tenant.id },
    });
  }

  console.log(`✅ Created ${items.length} example items\n`);

  console.log('════════════════════════════════════════════════════════════');
  console.log('🎉 ITEMS SEED COMPLETED!\n');
  console.log(`✅ Units: ${units.length}, Currencies: ${currencies.length}, Categories: ${categories.length}, Items: ${items.length}\n`);
}

seedItemsData()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });