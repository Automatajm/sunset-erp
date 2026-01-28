import { PrismaClient, StatusType } from '@prisma/client';

const prisma = new PrismaClient();

async function seedInventory() {
  console.log('\n🏭 Starting Inventory seed...\n');
  console.log('════════════════════════════════════════════════════════════\n');

  const tenant = await prisma.tenant.findUnique({
    where: { code: 'SUNSET' },
  });

  if (!tenant) {
    throw new Error('Tenant SUNSET not found. Run main seed first.');
  }

  const adminUser = await prisma.user.findFirst({
    where: { email: 'admin@sunset-rider.com' },
  });

  // ============================================
  // 1. WAREHOUSES
  // ============================================
  console.log('🏢 Creating Warehouses...');

  const mainWarehouse = await prisma.warehouse.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'WH-MAIN' } },
    update: {},
    create: {
      tenantId: tenant.id,
      code: 'WH-MAIN',
      name: 'Almacén Principal',
      description: 'Almacén central de operaciones',
      warehouseType: 'MAIN',
      address: 'Calle Principal 123',
      city: 'Santo Domingo',
      state: 'Nacional',
      country: 'República Dominicana',
      postalCode: '10100',
      phone: '809-555-0100',
      email: 'warehouse@sunset-rider.com',
      isActive: true,
      createdBy: adminUser!.id,
    },
  });

  const branchWarehouse = await prisma.warehouse.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'WH-BRANCH-01' } },
    update: {},
    create: {
      tenantId: tenant.id,
      code: 'WH-BRANCH-01',
      name: 'Sucursal Santiago',
      description: 'Almacén sucursal Santiago',
      warehouseType: 'BRANCH',
      address: 'Av. 27 de Febrero',
      city: 'Santiago',
      state: 'Santiago',
      country: 'República Dominicana',
      postalCode: '51000',
      isActive: true,
      createdBy: adminUser!.id,
    },
  });

  const quarantineWarehouse = await prisma.warehouse.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'WH-QUARANTINE' } },
    update: {},
    create: {
      tenantId: tenant.id,
      code: 'WH-QUARANTINE',
      name: 'Cuarentena',
      description: 'Material en cuarentena o rechazado',
      warehouseType: 'QUARANTINE',
      address: 'Calle Principal 123',
      city: 'Santo Domingo',
      isActive: true,
      createdBy: adminUser!.id,
    },
  });

  console.log(`✅ Created 3 warehouses\n`);

  // ============================================
  // 2. WAREHOUSE LOCATIONS
  // ============================================
  console.log('📍 Creating Warehouse Locations...');

  const locations = [
    // Main Warehouse
    { warehouseId: mainWarehouse.id, code: 'A-01-01', name: 'Pasillo A - Rack 1 - Nivel 1', aisle: 'A', rack: '01', shelf: '01', bin: '01' },
    { warehouseId: mainWarehouse.id, code: 'A-01-02', name: 'Pasillo A - Rack 1 - Nivel 2', aisle: 'A', rack: '01', shelf: '02', bin: '01' },
    { warehouseId: mainWarehouse.id, code: 'A-02-01', name: 'Pasillo A - Rack 2 - Nivel 1', aisle: 'A', rack: '02', shelf: '01', bin: '01' },
    { warehouseId: mainWarehouse.id, code: 'B-01-01', name: 'Pasillo B - Rack 1 - Nivel 1', aisle: 'B', rack: '01', shelf: '01', bin: '01' },
    { warehouseId: mainWarehouse.id, code: 'B-02-01', name: 'Pasillo B - Rack 2 - Nivel 1', aisle: 'B', rack: '02', shelf: '01', bin: '01' },
    { warehouseId: mainWarehouse.id, code: 'RECV-01', name: 'Área de Recepción', aisle: 'RECV', rack: '00', shelf: '00', bin: '01' },
    { warehouseId: mainWarehouse.id, code: 'SHIP-01', name: 'Área de Despacho', aisle: 'SHIP', rack: '00', shelf: '00', bin: '01' },
    
    // Branch Warehouse
    { warehouseId: branchWarehouse.id, code: 'A-01-01', name: 'Rack A1-1', aisle: 'A', rack: '01', shelf: '01', bin: '01' },
    { warehouseId: branchWarehouse.id, code: 'B-01-01', name: 'Rack B1-1', aisle: 'B', rack: '01', shelf: '01', bin: '01' },
    
    // Quarantine
    { warehouseId: quarantineWarehouse.id, code: 'QUAR-01', name: 'Cuarentena - Zona 1', aisle: 'Q', rack: '01', shelf: '01', bin: '01' },
  ];

  for (const loc of locations) {
    await prisma.warehouseLocation.upsert({
      where: { warehouseId_code: { warehouseId: loc.warehouseId, code: loc.code } },
      update: {},
      create: {
        tenantId: tenant.id,
        warehouseId: loc.warehouseId,
        code: loc.code,
        name: loc.name,
        aisle: loc.aisle,
        rack: loc.rack,
        shelf: loc.shelf,
        bin: loc.bin,
        locationPath: `${loc.aisle}-${loc.rack}-${loc.shelf}-${loc.bin}`,
        isActive: true,
      },
    });
  }

  console.log(`✅ Created ${locations.length} warehouse locations\n`);

  // ============================================
  // 3. STATUS GROUPS FOR INVENTORY
  // ============================================
  console.log('📊 Creating Status Groups for Inventory...');

  const statusGroups = [
    { code: 'INV_RECEIPTS', name: 'Recepciones de Inventario', description: 'Estados para el proceso de recepción de material', module: 'INVENTORY', entityType: 'RECEIPT' },
    { code: 'INV_ISSUES', name: 'Salidas de Inventario', description: 'Estados para despachos de material', module: 'INVENTORY', entityType: 'ISSUE' },
    { code: 'INV_REQUISITIONS', name: 'Requisiciones', description: 'Estados para solicitudes de material', module: 'INVENTORY', entityType: 'REQUISITION' },
    { code: 'INV_TRANSFERS', name: 'Transferencias', description: 'Estados para transferencias entre almacenes', module: 'INVENTORY', entityType: 'TRANSFER' },
    { code: 'INV_SCRAPS', name: 'Desechos y Bajas', description: 'Estados para material a desechar', module: 'INVENTORY', entityType: 'SCRAP' },
    { code: 'INV_SUPPLIER_RETURNS', name: 'Devoluciones a Proveedores', description: 'Estados para devoluciones de material', module: 'INVENTORY', entityType: 'SUPPLIER_RETURN' },
  ];

  for (const group of statusGroups) {
    await prisma.statusGroup.upsert({
      where: { code: group.code },
      update: {},
      create: {
        tenantId: tenant.id,
        code: group.code,
        name: group.name,
        description: group.description,
        module: group.module,
        entityType: group.entityType,
        allowCustomStatuses: false,
        requireWorkflow: true,
        isActive: true,
        isSystemGroup: true,
        createdBy: adminUser?.id,
      },
    });
  }

  console.log(`✅ Created ${statusGroups.length} status groups\n`);

  // ============================================
  // 4. STATUSES FOR RECEIPTS
  // ============================================
  console.log('✅ Creating Statuses for Receipts...');

  const receiptsGroup = await prisma.statusGroup.findUnique({
    where: { code: 'INV_RECEIPTS' },
  });

  const receiptStatuses = [
    { code: 'DRAFT', name: 'Borrador', description: 'Recepción en borrador', statusType: 'INITIAL' as StatusType, color: '#6c757d', icon: 'file-text', displayOrder: 1, isDefault: true, isEditable: true, isDeletable: true },
    { code: 'RECEIVING', name: 'Recibiendo', description: 'Material en proceso', statusType: 'INTERMEDIATE' as StatusType, color: '#007bff', icon: 'truck', displayOrder: 2, isDefault: false, isEditable: true, isDeletable: false },
    { code: 'COMPLETED', name: 'Completado', description: 'Recepción completada', statusType: 'FINAL' as StatusType, color: '#28a745', icon: 'check-circle', displayOrder: 3, isDefault: false, isEditable: false, isDeletable: false },
    { code: 'CANCELLED', name: 'Cancelado', description: 'Recepción cancelada', statusType: 'CANCELLED' as StatusType, color: '#dc3545', icon: 'x-circle', displayOrder: 4, isDefault: false, isEditable: false, isDeletable: false },
  ];

  for (const status of receiptStatuses) {
    await prisma.status.upsert({
      where: { statusGroupId_code: { statusGroupId: receiptsGroup!.id, code: status.code } },
      update: {},
      create: {
        statusGroupId: receiptsGroup!.id,
        tenantId: tenant.id,
        code: status.code,
        name: status.name,
        description: status.description,
        statusType: status.statusType,
        displayOrder: status.displayOrder,
        color: status.color,
        icon: status.icon,
        isDefault: status.isDefault,
        isEditable: status.isEditable,
        isDeletable: status.isDeletable,
        isActive: true,
        isSystemStatus: true,
        createdBy: adminUser?.id,
      },
    });
  }

  console.log(`✅ Created ${receiptStatuses.length} receipt statuses\n`);

  console.log('════════════════════════════════════════════════════════════');
  console.log('🎉 INVENTORY SEED COMPLETED!\n');
  console.log('📊 Summary:');
  console.log('────────────────────────────────────────────────────────────');
  console.log(`✅ Warehouses:     3`);
  console.log(`✅ Locations:      ${locations.length}`);
  console.log(`✅ Status Groups:  ${statusGroups.length}`);
  console.log(`✅ Statuses:       ${receiptStatuses.length}`);
  console.log('────────────────────────────────────────────────────────────\n');
}

seedInventory()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });