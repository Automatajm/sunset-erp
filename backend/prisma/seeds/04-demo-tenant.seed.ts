import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

export async function seedDemoTenant(prisma: PrismaClient) {
  console.log('🏢 Creating demo tenant...');

  // Create tenant
  const tenant = await prisma.tenant.create({
    data: {
      code: 'DEMO',
      name: 'Demo Company',
      legalName: 'Demo Company LLC',
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

  console.log(`   ✅ Tenant created: ${tenant.name} (${tenant.code})`);

  // Create admin user
  const hashedPassword = await bcrypt.hash('Admin123!', 12);
  
  const adminUser = await prisma.user.create({
    data: {
      email: 'admin@demo.com',
      passwordHash: hashedPassword,
      firstName: 'Admin',
      lastName: 'User',
      status: 'active',
      locale: 'en-US',
      timezone: 'UTC',
    },
  });

  console.log(`   ✅ Admin user created: ${adminUser.email}`);

  // Link user to tenant
  await prisma.userTenant.create({
    data: {
      userId: adminUser.id,
      tenantId: tenant.id,
      isDefault: true,
      isActive: true,
    },
  });

  console.log('   ✅ User linked to tenant');

  // Create Admin role
  const adminRole = await prisma.role.create({
    data: {
      tenantId: tenant.id,
      code: 'ADMIN',
      name: 'Administrator',
      description: 'Full system access',
      isSystem: true,
      createdBy: adminUser.id,
      updatedBy: adminUser.id,
    },
  });

  console.log('   ✅ Admin role created');

  // Get all permissions
  const permissions = await prisma.permission.findMany();

  // Assign all permissions to admin role
  for (const permission of permissions) {
    await prisma.rolePermission.create({
      data: {
        roleId: adminRole.id,
        permissionId: permission.id,
      },
    });
  }

  console.log(`   ✅ ${permissions.length} permissions assigned to admin role`);

  // Assign admin role to user
  await prisma.userRole.create({
    data: {
      userId: adminUser.id,
      roleId: adminRole.id,
      tenantId: tenant.id,
    },
  });

  console.log('   ✅ Admin role assigned to user');

  console.log('\n🎉 Demo tenant setup complete!');
  console.log('   📧 Email: admin@demo.com');
  console.log('   🔑 Password: Admin123!');
  console.log('   🏢 Tenant: DEMO');
}
