const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function addItemsPermissions() {
  console.log('\n🔑 Adding Items permissions...\n');

  const tenant = await prisma.tenant.findUnique({
    where: { code: 'SUNSET' },
  });

  if (!tenant) {
    throw new Error('Tenant not found');
  }

  const itemsPermissions = [
    {
      code: 'MDM:items:create:tenant',
      name: 'Create Items',
      description: 'Create new items in catalog',
      module: 'MDM',
      resource: 'items',
      action: 'create',
      scope: 'TENANT',
    },
    {
      code: 'MDM:items:read:tenant',
      name: 'Read Items',
      description: 'View items in catalog',
      module: 'MDM',
      resource: 'items',
      action: 'read',
      scope: 'TENANT',
    },
    {
      code: 'MDM:items:update:tenant',
      name: 'Update Items',
      description: 'Update items in catalog',
      module: 'MDM',
      resource: 'items',
      action: 'update',
      scope: 'TENANT',
    },
    {
      code: 'MDM:items:delete:tenant',
      name: 'Delete Items',
      description: 'Delete items from catalog',
      module: 'MDM',
      resource: 'items',
      action: 'delete',
      scope: 'TENANT',
    },
    {
      code: 'MDM:items:manage:tenant',
      name: 'Manage Items',
      description: 'Full items management including conversions',
      module: 'MDM',
      resource: 'items',
      action: 'manage',
      scope: 'TENANT',
    },
  ];

  const adminUser = await prisma.user.findFirst({
    where: { email: 'admin@sunset-rider.com' },
  });

  for (const perm of itemsPermissions) {
    await prisma.permission.upsert({
      where: { code: perm.code },
      update: {},
      create: {
        ...perm,
        tenantId: tenant.id,
        isSystemPermission: false,
        createdBy: adminUser?.id,
      },
    });
  }

  console.log(`✅ Added ${itemsPermissions.length} items permissions\n`);

  // Asignar permisos a roles
  const superAdminRole = await prisma.role.findFirst({
    where: { tenantId: tenant.id, code: 'SUPER_ADMIN' },
  });

  const adminRole = await prisma.role.findFirst({
    where: { tenantId: tenant.id, code: 'ADMIN' },
  });

  const managerRole = await prisma.role.findFirst({
    where: { tenantId: tenant.id, code: 'MANAGER' },
  });

  const userRole = await prisma.role.findFirst({
    where: { tenantId: tenant.id, code: 'USER' },
  });

  const viewerRole = await prisma.role.findFirst({
    where: { tenantId: tenant.id, code: 'VIEWER' },
  });

  // SUPER_ADMIN: todos los permisos (wildcard ya lo cubre)
  // ADMIN: todos los permisos de items
  const adminPermissions = await prisma.permission.findMany({
    where: {
      tenantId: tenant.id,
      code: { startsWith: 'MDM:items:' },
    },
  });

  for (const perm of adminPermissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: adminRole.id,
          permissionId: perm.id,
        },
      },
      update: {},
      create: {
        roleId: adminRole.id,
        permissionId: perm.id,
        effect: 'ALLOW',
      },
    });
  }

  // MANAGER: create, read, update
  const managerPermCodes = ['MDM:items:create:tenant', 'MDM:items:read:tenant', 'MDM:items:update:tenant'];
  for (const code of managerPermCodes) {
    const perm = await prisma.permission.findUnique({ where: { code } });
    if (perm) {
      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: managerRole.id,
            permissionId: perm.id,
          },
        },
        update: {},
        create: {
          roleId: managerRole.id,
          permissionId: perm.id,
          effect: 'ALLOW',
        },
      });
    }
  }

  // USER: read
  const readPerm = await prisma.permission.findUnique({
    where: { code: 'MDM:items:read:tenant' },
  });

  if (readPerm) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: userRole.id,
          permissionId: readPerm.id,
        },
      },
      update: {},
      create: {
        roleId: userRole.id,
        permissionId: readPerm.id,
        effect: 'ALLOW',
      },
    });

    // VIEWER: read
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: viewerRole.id,
          permissionId: readPerm.id,
        },
      },
      update: {},
      create: {
        roleId: viewerRole.id,
        permissionId: readPerm.id,
        effect: 'ALLOW',
      },
    });
  }

  console.log('✅ Permissions assigned to roles\n');
  console.log('🎉 Items permissions setup completed!\n');
}

addItemsPermissions()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });