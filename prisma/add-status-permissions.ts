import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function addStatusPermissions() {
  console.log('\n🔐 Adding Status Management Permissions...\n');

  const permissions = [
    {
      code: 'MDM:status:create:tenant',
      name: 'Create Status',
      description: 'Create status groups and statuses',
      module: 'MASTER_DATA',
      resource: 'status',
      action: 'create',
    },
    {
      code: 'MDM:status:read:tenant',
      name: 'Read Status',
      description: 'View status groups and statuses',
      module: 'MASTER_DATA',
      resource: 'status',
      action: 'read',
    },
    {
      code: 'MDM:status:update:tenant',
      name: 'Update Status',
      description: 'Update status groups and statuses',
      module: 'MASTER_DATA',
      resource: 'status',
      action: 'update',
    },
    {
      code: 'MDM:status:delete:tenant',
      name: 'Delete Status',
      description: 'Delete status groups and statuses',
      module: 'MASTER_DATA',
      resource: 'status',
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

  const adminRole = await prisma.role.findFirst({ where: { code: 'ADMIN' } });

  if (adminRole) {
    for (const perm of permissions) {
      const permission = await prisma.permission.findUnique({ where: { code: perm.code } });
      if (permission) {
        await prisma.rolePermission.upsert({
          where: { roleId_permissionId: { roleId: adminRole.id, permissionId: permission.id } },
          update: {},
          create: { roleId: adminRole.id, permissionId: permission.id, effect: 'ALLOW' },
        });
      }
    }
    console.log('✅ Permissions assigned to ADMIN\n');
  }
}

addStatusPermissions()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
