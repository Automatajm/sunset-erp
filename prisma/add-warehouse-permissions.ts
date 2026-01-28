import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function addWarehousePermissions() {
  console.log('\n🔐 Adding Warehouse Permissions...\n');

  const permissions = [
    {
      code: 'INV:warehouses:create:tenant',
      name: 'Create Warehouses',
      description: 'Create new warehouses',
      module: 'INVENTORY',
      resource: 'warehouses',
      action: 'create',
    },
    {
      code: 'INV:warehouses:read:tenant',
      name: 'Read Warehouses',
      description: 'View warehouses',
      module: 'INVENTORY',
      resource: 'warehouses',
      action: 'read',
    },
    {
      code: 'INV:warehouses:update:tenant',
      name: 'Update Warehouses',
      description: 'Update warehouses',
      module: 'INVENTORY',
      resource: 'warehouses',
      action: 'update',
    },
    {
      code: 'INV:warehouses:delete:tenant',
      name: 'Delete Warehouses',
      description: 'Delete warehouses',
      module: 'INVENTORY',
      resource: 'warehouses',
      action: 'delete',
    },
  ];

  for (const perm of permissions) {
    await prisma.permission.upsert({
      where: { code: perm.code },
      update: {},
      create: {
        ...perm,
        scope: 'TENANT',
        isSystemPermission: true,
        isActive: true,
      },
    });
  }

  console.log(`✅ Created ${permissions.length} permissions\n`);

  // Asignar a roles
  const adminRole = await prisma.role.findFirst({
    where: { code: 'ADMIN' },
  });

  if (adminRole) {
    for (const perm of permissions) {
      const permission = await prisma.permission.findUnique({
        where: { code: perm.code },
      });

      if (permission) {
        await prisma.rolePermission.upsert({
          where: {
            roleId_permissionId: {
              roleId: adminRole.id,
              permissionId: permission.id,
            },
          },
          update: {},
          create: {
            roleId: adminRole.id,
            permissionId: permission.id,
            effect: 'ALLOW',
          },
        });
      }
    }
    console.log('✅ Permissions assigned to ADMIN role\n');
  }

  console.log('🎉 Warehouse permissions setup completed!\n');
}

addWarehousePermissions()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
