import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function addMissingPermissions() {
  console.log('🔧 Agregando permisos faltantes...');

  const tenant = await prisma.tenant.findUnique({
    where: { code: 'SUNSET' },
  });

  if (!tenant) {
    console.log('❌ Tenant SUNSET no encontrado');
    return;
  }

  const missingPermissions = [
    {
      code: 'ADM:users:create:tenant',
      name: 'Create Users',
      module: 'ADM',
      resource: 'users',
      action: 'create',
      scope: 'TENANT',
      description: 'Create new users in the tenant',
    },
    {
      code: 'ADM:users:read:tenant',
      name: 'Read Users',
      module: 'ADM',
      resource: 'users',
      action: 'read',
      scope: 'TENANT',
      description: 'View users in the tenant',
    },
    {
      code: 'ADM:users:update:tenant',
      name: 'Update Users',
      module: 'ADM',
      resource: 'users',
      action: 'update',
      scope: 'TENANT',
      description: 'Update user information',
    },
    {
      code: 'ADM:users:delete:tenant',
      name: 'Delete Users',
      module: 'ADM',
      resource: 'users',
      action: 'delete',
      scope: 'TENANT',
      description: 'Delete users from the tenant',
    },
  ];

  for (const perm of missingPermissions) {
    const existing = await prisma.permission.findUnique({
      where: { code: perm.code },
    });

    if (!existing) {
      await prisma.permission.create({
        data: {
          ...perm,
          tenantId: null, // System permission
          isSystemPermission: true,
          isActive: true,
        },
      });
      console.log(`✅ Creado: `);
    } else {
      console.log(`⏭️  Ya existe: `);
    }
  }

  // Asignar todos los permisos ADM al rol SUPER_ADMIN
  const superAdminRole = await prisma.role.findUnique({
    where: { tenantId_code: { tenantId: tenant.id, code: 'SUPER_ADMIN' } },
  });

  if (superAdminRole) {
    const admPermissions = await prisma.permission.findMany({
      where: { module: 'ADM' },
    });

    for (const perm of admPermissions) {
      const existing = await prisma.rolePermission.findUnique({
        where: {
          roleId_permissionId: {
            roleId: superAdminRole.id,
            permissionId: perm.id,
          },
        },
      });

      if (!existing) {
        await prisma.rolePermission.create({
          data: {
            roleId: superAdminRole.id,
            permissionId: perm.id,
          },
        });
      }
    }

    console.log('✅ Permisos asignados a SUPER_ADMIN');
  }

  console.log('🎉 Permisos actualizados!');
}

addMissingPermissions()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.\();
  });