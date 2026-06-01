import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

interface TenantSeedConfig {
  code: string;
  name: string;
  legalName: string;
  adminEmail: string;
  adminFirstName: string;
  adminLastName: string;
  isDefaultTenant: boolean;
}

// ── Idempotent single-tenant seeder ──────────────────────────────────────────
async function seedTenant(prisma: PrismaClient, cfg: TenantSeedConfig) {
  console.log(`🏢 Seeding tenant ${cfg.code}...`);

  // Tenant (unique on code)
  const tenant = await prisma.tenant.upsert({
    where: { code: cfg.code },
    update: {},
    create: {
      code: cfg.code,
      name: cfg.name,
      legalName: cfg.legalName,
      country: 'DO',
      industry: 'Manufacturing',
      subscriptionPlan: 'enterprise',
      subscriptionStatus: 'active',
      defaultCurrency: 'USD',
      defaultLanguage: 'en-US',
      fiscalYearStart: 1,
      status: 'active',
    },
  });

  console.log(`   ✅ Tenant: ${tenant.name} (${tenant.code})`);

  // Admin user (unique on email)
  const hashedPassword = await bcrypt.hash('Admin123!', 12);

  const adminUser = await prisma.user.upsert({
    where: { email: cfg.adminEmail },
    update: { passwordHash: hashedPassword },
    create: {
      email: cfg.adminEmail,
      passwordHash: hashedPassword,
      firstName: cfg.adminFirstName,
      lastName: cfg.adminLastName,
      status: 'active',
      locale: 'en-US',
      timezone: 'UTC',
    },
  });

  console.log(`   ✅ Admin user: ${adminUser.email}`);

  // Link user to tenant (unique on [userId, tenantId])
  await prisma.userTenant.upsert({
    where: { userId_tenantId: { userId: adminUser.id, tenantId: tenant.id } },
    update: { isDefault: cfg.isDefaultTenant, isActive: true },
    create: {
      userId: adminUser.id,
      tenantId: tenant.id,
      isDefault: cfg.isDefaultTenant,
      isActive: true,
    },
  });

  console.log('   ✅ User linked to tenant');

  // Admin role (unique on [tenantId, code])
  const adminRole = await prisma.role.upsert({
    where: { tenantId_code: { tenantId: tenant.id, code: 'ADMIN' } },
    update: { updatedBy: adminUser.id },
    create: {
      tenantId: tenant.id,
      code: 'ADMIN',
      name: 'Administrator',
      description: 'Full system access',
      isSystem: true,
      createdBy: adminUser.id,
      updatedBy: adminUser.id,
    },
  });

  console.log('   ✅ Admin role ready');

  // Assign all permissions to admin role (unique on [roleId, permissionId])
  const permissions = await prisma.permission.findMany();

  for (const permission of permissions) {
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
      },
    });
  }

  console.log(`   ✅ ${permissions.length} permissions assigned to admin role`);

  // Assign admin role to user (unique on [userId, roleId, tenantId])
  await prisma.userRole.upsert({
    where: {
      userId_roleId_tenantId: {
        userId: adminUser.id,
        roleId: adminRole.id,
        tenantId: tenant.id,
      },
    },
    update: {},
    create: {
      userId: adminUser.id,
      roleId: adminRole.id,
      tenantId: tenant.id,
    },
  });

  console.log('   ✅ Admin role assigned to user');
}

export async function seedDemoTenant(prisma: PrismaClient) {
  await seedTenant(prisma, {
    code: 'DEMO',
    name: 'Demo Company',
    legalName: 'Demo Company LLC',
    adminEmail: 'admin@demo.com',
    adminFirstName: 'Admin',
    adminLastName: 'User',
    isDefaultTenant: true,
  });

  // Second tenant — exists purely for cross-tenant isolation testing.
  await seedTenant(prisma, {
    code: 'TENANT2',
    name: 'Tenant Two Company',
    legalName: 'Tenant Two Company LLC',
    adminEmail: 'tenant2admin@demo.com',
    adminFirstName: 'Tenant2',
    adminLastName: 'Admin',
    isDefaultTenant: true,
  });

  console.log('\n🎉 Demo tenant setup complete!');
  console.log('   📧 admin@demo.com / Admin123!  → tenant DEMO');
  console.log('   📧 tenant2admin@demo.com / Admin123!  → tenant TENANT2');
}
