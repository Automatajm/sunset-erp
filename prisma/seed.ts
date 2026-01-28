import { PrismaClient, SystemRole, PermissionScope, PermissionEffect } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

// ============================================
// CONFIGURATION - Change per client
// ============================================
const TENANT_CONFIG = {
  code: 'SUNSET',
  name: 'Sunset Rider',
  domain: 'sunset-rider.com',
  maxUsers: 100,
  settings: {
    timezone: 'America/Santo_Domingo',
    currency: 'USD',
    language: 'es',
    dateFormat: 'DD/MM/YYYY',
    timeFormat: '24h',
  },
  passwordPolicy: {
    minLength: 12,
    requireUppercase: true,
    requireLowercase: true,
    requireNumbers: true,
    requireSpecialChars: true,
    expirationDays: 90,
    preventReuse: 5,
  },
};

const ADMIN_USER = {
  email: 'admin@sunset-rider.com',
  username: 'admin',
  firstName: 'Juan',
  lastName: 'Marte',
  password: 'Sunset@2026!',
};

const BCRYPT_ROUNDS = 12;

// ============================================
// HELPER FUNCTIONS
// ============================================

async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

function log(message: string, data?: any) {
  console.log(`\n📝 ${message}`);
  if (data) {
    console.log(JSON.stringify(data, null, 2));
  }
}

// ============================================
// MAIN SEED FUNCTION
// ============================================

async function main() {
  console.log('\n🌱 Starting database seed...\n');
  console.log('═'.repeat(60));

  // ============================================
  // 1. CREATE TENANT
  // ============================================
  log('Creating Tenant: ' + TENANT_CONFIG.name);

  const tenant = await prisma.tenant.create({
    data: {
      code: TENANT_CONFIG.code,
      name: TENANT_CONFIG.name,
      domain: TENANT_CONFIG.domain,
      isActive: true,
      maxUsers: TENANT_CONFIG.maxUsers,
      settings: TENANT_CONFIG.settings,
      passwordPolicy: TENANT_CONFIG.passwordPolicy,
      mfaRequired: false,
      sessionTimeout: 480, // 8 hours
    },
  });

  log('✅ Tenant created', { id: tenant.id, code: tenant.code });

  // ============================================
  // 2. CREATE SYSTEM ROLES
  // ============================================
  log('Creating System Roles...');

  const rolesData = [
    {
      code: 'SUPER_ADMIN',
      name: 'Super Administrator',
      description: 'Full system access across all tenants',
      systemRole: SystemRole.SUPER_ADMIN,
      level: 1,
      priority: 100,
      isSystemRole: true,
    },
    {
      code: 'ADMIN',
      name: 'Administrator',
      description: 'Full access within tenant',
      systemRole: SystemRole.ADMIN,
      level: 2,
      priority: 90,
      isSystemRole: true,
    },
    {
      code: 'MANAGER',
      name: 'Manager',
      description: 'Department/area manager with approval permissions',
      systemRole: SystemRole.MANAGER,
      level: 3,
      priority: 70,
      isSystemRole: true,
    },
    {
      code: 'USER',
      name: 'User',
      description: 'Standard operational user',
      systemRole: SystemRole.USER,
      level: 4,
      priority: 50,
      isSystemRole: true,
    },
    {
      code: 'VIEWER',
      name: 'Viewer',
      description: 'Read-only access',
      systemRole: SystemRole.VIEWER,
      level: 5,
      priority: 30,
      isSystemRole: true,
    },
    {
      code: 'GUEST',
      name: 'Guest',
      description: 'Limited temporary access',
      systemRole: SystemRole.GUEST,
      level: 6,
      priority: 10,
      isSystemRole: true,
    },
  ];

  const roles = await Promise.all(
    rolesData.map((roleData) =>
      prisma.role.create({
        data: {
          ...roleData,
          tenantId: tenant.id,
        },
      }),
    ),
  );

  log('✅ Created roles', { count: roles.length });

  // ============================================
  // 3. CREATE SYSTEM PERMISSIONS
  // ============================================
  log('Creating System Permissions...');

  const permissionsData = [
    // ===== ADMIN MODULE =====
    {
      code: 'ADM:*:*:*',
      name: 'Admin - Full Access',
      description: 'Full access to admin module',
      module: 'ADM',
      resource: '*',
      action: '*',
      scope: PermissionScope.GLOBAL,
      isSystemPermission: true,
    },
    {
      code: 'ADM:users:create:tenant',
      name: 'Admin - Create Users',
      module: 'ADM',
      resource: 'users',
      action: 'create',
      scope: PermissionScope.TENANT,
      isSystemPermission: true,
    },
    {
      code: 'ADM:users:read:tenant',
      name: 'Admin - Read Users',
      module: 'ADM',
      resource: 'users',
      action: 'read',
      scope: PermissionScope.TENANT,
      isSystemPermission: true,
    },
    {
      code: 'ADM:users:update:tenant',
      name: 'Admin - Update Users',
      module: 'ADM',
      resource: 'users',
      action: 'update',
      scope: PermissionScope.TENANT,
      isSystemPermission: true,
    },
    {
      code: 'ADM:users:delete:tenant',
      name: 'Admin - Delete Users',
      module: 'ADM',
      resource: 'users',
      action: 'delete',
      scope: PermissionScope.TENANT,
      isSystemPermission: true,
    },
    {
      code: 'ADM:roles:manage:tenant',
      name: 'Admin - Manage Roles',
      module: 'ADM',
      resource: 'roles',
      action: 'manage',
      scope: PermissionScope.TENANT,
      isSystemPermission: true,
    },
    {
      code: 'ADM:permissions:manage:tenant',
      name: 'Admin - Manage Permissions',
      module: 'ADM',
      resource: 'permissions',
      action: 'manage',
      scope: PermissionScope.TENANT,
      isSystemPermission: true,
    },
    {
      code: 'ADM:settings:update:tenant',
      name: 'Admin - Update Settings',
      module: 'ADM',
      resource: 'settings',
      action: 'update',
      scope: PermissionScope.TENANT,
      isSystemPermission: true,
    },
    {
      code: 'ADM:audit:read:tenant',
      name: 'Admin - Read Audit Logs',
      module: 'ADM',
      resource: 'audit',
      action: 'read',
      scope: PermissionScope.TENANT,
      isSystemPermission: true,
    },

    // ===== FINANCIAL MODULE =====
    {
      code: 'FIN:*:read:tenant',
      name: 'Finance - Read All',
      module: 'FIN',
      resource: '*',
      action: 'read',
      scope: PermissionScope.TENANT,
      isSystemPermission: true,
    },
    {
      code: 'FIN:invoices:create:own',
      name: 'Finance - Create Own Invoices',
      module: 'FIN',
      resource: 'invoices',
      action: 'create',
      scope: PermissionScope.OWN,
      isSystemPermission: true,
    },
    {
      code: 'FIN:invoices:read:own',
      name: 'Finance - Read Own Invoices',
      module: 'FIN',
      resource: 'invoices',
      action: 'read',
      scope: PermissionScope.OWN,
      isSystemPermission: true,
    },
    {
      code: 'FIN:invoices:read:department',
      name: 'Finance - Read Department Invoices',
      module: 'FIN',
      resource: 'invoices',
      action: 'read',
      scope: PermissionScope.DEPARTMENT,
      isSystemPermission: true,
    },
    {
      code: 'FIN:invoices:read:tenant',
      name: 'Finance - Read All Invoices',
      module: 'FIN',
      resource: 'invoices',
      action: 'read',
      scope: PermissionScope.TENANT,
      isSystemPermission: true,
    },
    {
      code: 'FIN:invoices:update:own',
      name: 'Finance - Update Own Invoices',
      module: 'FIN',
      resource: 'invoices',
      action: 'update',
      scope: PermissionScope.OWN,
      isSystemPermission: true,
    },
    {
      code: 'FIN:invoices:approve:department',
      name: 'Finance - Approve Department Invoices',
      module: 'FIN',
      resource: 'invoices',
      action: 'approve',
      scope: PermissionScope.DEPARTMENT,
      isSystemPermission: true,
    },
    {
      code: 'FIN:invoices:approve:tenant',
      name: 'Finance - Approve All Invoices',
      module: 'FIN',
      resource: 'invoices',
      action: 'approve',
      scope: PermissionScope.TENANT,
      isSystemPermission: true,
    },
    {
      code: 'FIN:payments:create:own',
      name: 'Finance - Create Payments',
      module: 'FIN',
      resource: 'payments',
      action: 'create',
      scope: PermissionScope.OWN,
      isSystemPermission: true,
    },
    {
      code: 'FIN:payments:approve:department',
      name: 'Finance - Approve Payments',
      module: 'FIN',
      resource: 'payments',
      action: 'approve',
      scope: PermissionScope.DEPARTMENT,
      isSystemPermission: true,
    },
    {
      code: 'FIN:reports:read:department',
      name: 'Finance - Read Department Reports',
      module: 'FIN',
      resource: 'reports',
      action: 'read',
      scope: PermissionScope.DEPARTMENT,
      isSystemPermission: true,
    },
    {
      code: 'FIN:reports:read:tenant',
      name: 'Finance - Read All Reports',
      module: 'FIN',
      resource: 'reports',
      action: 'read',
      scope: PermissionScope.TENANT,
      isSystemPermission: true,
    },

    // ===== INVENTORY MODULE =====
    {
      code: 'INV:*:read:tenant',
      name: 'Inventory - Read All',
      module: 'INV',
      resource: '*',
      action: 'read',
      scope: PermissionScope.TENANT,
      isSystemPermission: true,
    },
    {
      code: 'INV:products:read:tenant',
      name: 'Inventory - Read Products',
      module: 'INV',
      resource: 'products',
      action: 'read',
      scope: PermissionScope.TENANT,
      isSystemPermission: true,
    },
    {
      code: 'INV:products:create:department',
      name: 'Inventory - Create Products',
      module: 'INV',
      resource: 'products',
      action: 'create',
      scope: PermissionScope.DEPARTMENT,
      isSystemPermission: true,
    },
    {
      code: 'INV:stock:read:tenant',
      name: 'Inventory - Read Stock',
      module: 'INV',
      resource: 'stock',
      action: 'read',
      scope: PermissionScope.TENANT,
      isSystemPermission: true,
    },
    {
      code: 'INV:stock:update:own',
      name: 'Inventory - Update Stock',
      module: 'INV',
      resource: 'stock',
      action: 'update',
      scope: PermissionScope.OWN,
      isSystemPermission: true,
    },
    {
      code: 'INV:movements:create:own',
      name: 'Inventory - Create Movements',
      module: 'INV',
      resource: 'movements',
      action: 'create',
      scope: PermissionScope.OWN,
      isSystemPermission: true,
    },
    {
      code: 'INV:transfers:approve:department',
      name: 'Inventory - Approve Transfers',
      module: 'INV',
      resource: 'transfers',
      action: 'approve',
      scope: PermissionScope.DEPARTMENT,
      isSystemPermission: true,
    },

    // ===== PURCHASING MODULE =====
    {
      code: 'PUR:requisitions:create:own',
      name: 'Purchasing - Create Requisitions',
      module: 'PUR',
      resource: 'requisitions',
      action: 'create',
      scope: PermissionScope.OWN,
      isSystemPermission: true,
    },
    {
      code: 'PUR:requisitions:approve:department',
      name: 'Purchasing - Approve Requisitions',
      module: 'PUR',
      resource: 'requisitions',
      action: 'approve',
      scope: PermissionScope.DEPARTMENT,
      isSystemPermission: true,
    },
    {
      code: 'PUR:orders:create:department',
      name: 'Purchasing - Create Orders',
      module: 'PUR',
      resource: 'orders',
      action: 'create',
      scope: PermissionScope.DEPARTMENT,
      isSystemPermission: true,
    },
    {
      code: 'PUR:orders:approve:department',
      name: 'Purchasing - Approve Orders',
      module: 'PUR',
      resource: 'orders',
      action: 'approve',
      scope: PermissionScope.DEPARTMENT,
      isSystemPermission: true,
    },

    // ===== HR MODULE =====
    {
      code: 'HRM:employees:read:department',
      name: 'HR - Read Department Employees',
      module: 'HRM',
      resource: 'employees',
      action: 'read',
      scope: PermissionScope.DEPARTMENT,
      isSystemPermission: true,
    },
    {
      code: 'HRM:employees:read:tenant',
      name: 'HR - Read All Employees',
      module: 'HRM',
      resource: 'employees',
      action: 'read',
      scope: PermissionScope.TENANT,
      isSystemPermission: true,
    },
    {
      code: 'HRM:leaves:create:own',
      name: 'HR - Request Leave',
      module: 'HRM',
      resource: 'leaves',
      action: 'create',
      scope: PermissionScope.OWN,
      isSystemPermission: true,
    },
    {
      code: 'HRM:leaves:approve:department',
      name: 'HR - Approve Leaves',
      module: 'HRM',
      resource: 'leaves',
      action: 'approve',
      scope: PermissionScope.DEPARTMENT,
      isSystemPermission: true,
    },

    // ===== MASTER DATA MODULE =====
    {
      code: 'MDM:*:read:tenant',
      name: 'Master Data - Read All',
      module: 'MDM',
      resource: '*',
      action: 'read',
      scope: PermissionScope.TENANT,
      isSystemPermission: true,
    },
    {
      code: 'MDM:customers:create:department',
      name: 'Master Data - Create Customers',
      module: 'MDM',
      resource: 'customers',
      action: 'create',
      scope: PermissionScope.DEPARTMENT,
      isSystemPermission: true,
    },
    {
      code: 'MDM:suppliers:create:department',
      name: 'Master Data - Create Suppliers',
      module: 'MDM',
      resource: 'suppliers',
      action: 'create',
      scope: PermissionScope.DEPARTMENT,
      isSystemPermission: true,
    },

    // ===== GENERAL PERMISSIONS =====
    {
      code: '*:*:read:own',
      name: 'Read Own Data',
      description: 'Read own records across all modules',
      module: '*',
      resource: '*',
      action: 'read',
      scope: PermissionScope.OWN,
      isSystemPermission: true,
    },
    {
      code: '*:*:export:tenant',
      name: 'Export Data',
      description: 'Export data from any module',
      module: '*',
      resource: '*',
      action: 'export',
      scope: PermissionScope.TENANT,
      isSystemPermission: true,
    },
  ];

  const permissions = await Promise.all(
    permissionsData.map((permData) =>
      prisma.permission.create({
        data: {
          ...permData,
          tenantId: null, // System permissions have no tenant
        },
      }),
    ),
  );

  log('✅ Created permissions', { count: permissions.length });

  // ============================================
  // 4. ASSIGN PERMISSIONS TO ROLES
  // ============================================
  log('Assigning permissions to roles...');

  // Find roles
  const superAdminRole = roles.find((r) => r.code === 'SUPER_ADMIN');
  const adminRole = roles.find((r) => r.code === 'ADMIN');
  const managerRole = roles.find((r) => r.code === 'MANAGER');
  const userRole = roles.find((r) => r.code === 'USER');
  const viewerRole = roles.find((r) => r.code === 'VIEWER');
  const guestRole = roles.find((r) => r.code === 'GUEST');

  // SUPER_ADMIN: All permissions
  const superAdminPermissions = permissions.filter(
    (p) => p.scope === PermissionScope.GLOBAL || p.code === 'ADM:*:*:*',
  );
  await Promise.all(
    superAdminPermissions.map((perm) =>
      prisma.rolePermission.create({
        data: {
          roleId: superAdminRole!.id,
          permissionId: perm.id,
          effect: PermissionEffect.ALLOW,
        },
      }),
    ),
  );
  log(`✅ Assigned ${superAdminPermissions.length} permissions to SUPER_ADMIN`);

  // ADMIN: All tenant-level permissions
  const adminPermissions = permissions.filter(
    (p) => p.scope === PermissionScope.TENANT || p.module === 'ADM',
  );
  await Promise.all(
    adminPermissions.map((perm) =>
      prisma.rolePermission.create({
        data: {
          roleId: adminRole!.id,
          permissionId: perm.id,
          effect: PermissionEffect.ALLOW,
        },
      }),
    ),
  );
  log(`✅ Assigned ${adminPermissions.length} permissions to ADMIN`);

  // MANAGER: Department-level + approve permissions
  const managerPermissions = permissions.filter(
    (p) =>
      p.scope === PermissionScope.DEPARTMENT ||
      p.action === 'approve' ||
      (p.action === 'read' && p.scope === PermissionScope.TENANT),
  );
  await Promise.all(
    managerPermissions.map((perm) =>
      prisma.rolePermission.create({
        data: {
          roleId: managerRole!.id,
          permissionId: perm.id,
          effect: PermissionEffect.ALLOW,
        },
      }),
    ),
  );
  log(`✅ Assigned ${managerPermissions.length} permissions to MANAGER`);

  // USER: Own-level + read tenant
  const userPermissions = permissions.filter(
    (p) => p.scope === PermissionScope.OWN || (p.action === 'read' && p.resource !== 'audit'),
  );
  await Promise.all(
    userPermissions.map((perm) =>
      prisma.rolePermission.create({
        data: {
          roleId: userRole!.id,
          permissionId: perm.id,
          effect: PermissionEffect.ALLOW,
        },
      }),
    ),
  );
  log(`✅ Assigned ${userPermissions.length} permissions to USER`);

  // VIEWER: Only read permissions
  const viewerPermissions = permissions.filter((p) => p.action === 'read' || p.action === 'export');
  await Promise.all(
    viewerPermissions.map((perm) =>
      prisma.rolePermission.create({
        data: {
          roleId: viewerRole!.id,
          permissionId: perm.id,
          effect: PermissionEffect.ALLOW,
        },
      }),
    ),
  );
  log(`✅ Assigned ${viewerPermissions.length} permissions to VIEWER`);

  // GUEST: Very limited read own
  const guestPermissions = permissions.filter(
    (p) => p.code === '*:*:read:own' || p.code === 'FIN:invoices:read:own',
  );
  await Promise.all(
    guestPermissions.map((perm) =>
      prisma.rolePermission.create({
        data: {
          roleId: guestRole!.id,
          permissionId: perm.id,
          effect: PermissionEffect.ALLOW,
        },
      }),
    ),
  );
  log(`✅ Assigned ${guestPermissions.length} permissions to GUEST`);

  // ============================================
  // 5. CREATE ADMIN USER
  // ============================================
  log('Creating Admin User...');

  const hashedPassword = await hashPassword(ADMIN_USER.password);

  const adminUser = await prisma.user.create({
    data: {
      tenantId: tenant.id,
      email: ADMIN_USER.email,
      username: ADMIN_USER.username,
      passwordHash: hashedPassword,
      firstName: ADMIN_USER.firstName,
      lastName: ADMIN_USER.lastName,
      fullName: `${ADMIN_USER.firstName} ${ADMIN_USER.lastName}`,
      isActive: true,
      isEmailVerified: true,
      isLocked: false,
    },
  });

  log('✅ Admin user created', {
    id: adminUser.id,
    email: adminUser.email,
    username: adminUser.username,
  });

  // Assign SUPER_ADMIN role to admin user
  await prisma.userRole.create({
    data: {
      userId: adminUser.id,
      roleId: superAdminRole!.id,
      assignedAt: new Date(),
    },
  });

  log('✅ Assigned SUPER_ADMIN role to admin user');

  // ============================================
  // 6. CREATE TEST USERS
  // ============================================
  log('Creating test users...');

  const testUsers = [
    {
      email: 'manager@sunset-rider.com',
      username: 'manager',
      firstName: 'Carlos',
      lastName: 'Ramirez',
      password: 'Manager@2026!',
      roleCode: 'MANAGER',
    },
    {
      email: 'accountant@sunset-rider.com',
      username: 'accountant',
      firstName: 'Maria',
      lastName: 'Gonzalez',
      password: 'User@2026!',
      roleCode: 'USER',
    },
    {
      email: 'warehouse@sunset-rider.com',
      username: 'warehouse',
      firstName: 'Pedro',
      lastName: 'Santos',
      password: 'User@2026!',
      roleCode: 'USER',
    },
    {
      email: 'viewer@sunset-rider.com',
      username: 'viewer',
      firstName: 'Ana',
      lastName: 'Lopez',
      password: 'Viewer@2026!',
      roleCode: 'VIEWER',
    },
    {
      email: 'guest@sunset-rider.com',
      username: 'guest',
      firstName: 'Luis',
      lastName: 'Martinez',
      password: 'Guest@2026!',
      roleCode: 'GUEST',
    },
  ];

  for (const userData of testUsers) {
    const hashedPass = await hashPassword(userData.password);
    const role = roles.find((r) => r.code === userData.roleCode);

    const user = await prisma.user.create({
      data: {
        tenantId: tenant.id,
        email: userData.email,
        username: userData.username,
        passwordHash: hashedPass,
        firstName: userData.firstName,
        lastName: userData.lastName,
        fullName: `${userData.firstName} ${userData.lastName}`,
        isActive: true,
        isEmailVerified: true,
      },
    });

    await prisma.userRole.create({
      data: {
        userId: user.id,
        roleId: role!.id,
        assignedAt: new Date(),
      },
    });

    log(`✅ Created user: ${user.email} (${userData.roleCode})`);
  }

  // ============================================
  // 7. CREATE MODULES
  // ============================================
  log('Creating modules...');

  const modulesData = [
    {
      code: 'FIN',
      name: 'Financial Management',
      description: 'Accounting, invoicing, payments',
      level: 1,
      modulePath: 'FIN',
      icon: 'DollarSign',
      route: '/finance',
      sortOrder: 1,
    },
    {
      code: 'ACC',
      name: 'Accounting',
      description: 'General ledger, journal entries',
      level: 1,
      modulePath: 'ACC',
      icon: 'Calculator',
      route: '/accounting',
      sortOrder: 2,
    },
    {
      code: 'INV',
      name: 'Inventory Management',
      description: 'Stock, warehouses, movements',
      level: 1,
      modulePath: 'INV',
      icon: 'Package',
      route: '/inventory',
      sortOrder: 3,
    },
    {
      code: 'PUR',
      name: 'Purchasing',
      description: 'Purchase orders, requisitions',
      level: 1,
      modulePath: 'PUR',
      icon: 'ShoppingCart',
      route: '/purchasing',
      sortOrder: 4,
    },
    {
      code: 'MDM',
      name: 'Master Data Management',
      description: 'Customers, suppliers, products',
      level: 1,
      modulePath: 'MDM',
      icon: 'Database',
      route: '/master-data',
      sortOrder: 5,
    },
    {
      code: 'HRM',
      name: 'Human Resources',
      description: 'Employees, payroll, attendance',
      level: 1,
      modulePath: 'HRM',
      icon: 'Users',
      route: '/hr',
      sortOrder: 6,
    },
    {
      code: 'MFG',
      name: 'Manufacturing',
      description: 'Production, BOM, work orders',
      level: 1,
      modulePath: 'MFG',
      icon: 'Factory',
      route: '/manufacturing',
      sortOrder: 7,
    },
    {
      code: 'ADM',
      name: 'System Administration',
      description: 'Users, roles, settings',
      level: 1,
      modulePath: 'ADM',
      icon: 'Settings',
      route: '/admin',
      sortOrder: 8,
    },
  ];

  await Promise.all(
    modulesData.map((modData) =>
      prisma.module.create({
        data: {
          ...modData,
          tenantId: tenant.id,
        },
      }),
    ),
  );

  log('✅ Created modules', { count: modulesData.length });

  // ============================================
  // SUMMARY
  // ============================================
  console.log('\n');
  console.log('═'.repeat(60));
  console.log('🎉 DATABASE SEED COMPLETED SUCCESSFULLY!\n');
  console.log('📊 Summary:');
  console.log('─'.repeat(60));
  console.log(`✅ Tenant:        ${tenant.name} (${tenant.code})`);
  console.log(`✅ Roles:         ${roles.length}`);
  console.log(`✅ Permissions:   ${permissions.length}`);
  console.log(`✅ Users:         ${testUsers.length + 1} (1 admin + ${testUsers.length} test users)`);
  console.log(`✅ Modules:       ${modulesData.length}`);
  console.log('─'.repeat(60));
  console.log('\n📋 Database Tables Created with Prefixes:');
  console.log('   System (sys_):  tenants, users, roles, permissions, sessions');
  console.log('   Admin (adm_):   audit_logs, modules');
  console.log('─'.repeat(60));
  console.log('\n🔐 Login Credentials:\n');
  console.log(`Admin User:`);
  console.log(`  Email:    ${ADMIN_USER.email}`);
  console.log(`  Username: ${ADMIN_USER.username}`);
  console.log(`  Password: ${ADMIN_USER.password}`);
  console.log(`  Role:     SUPER_ADMIN\n`);
  console.log(`Test Users:`);
  testUsers.forEach((u) => {
    console.log(`  ${u.email} / ${u.password} (${u.roleCode})`);
  });
  console.log('\n' + '═'.repeat(60));
  console.log('\n✨ Database ready! Professional schema with:');
  console.log('   ✓ Module-based table prefixes (sys_, adm_, fin_, etc.)');
  console.log('   ✓ UUID primary keys for distributed systems');
  console.log('   ✓ Audit fields (createdBy, updatedBy, deletedAt)');
  console.log('   ✓ Soft delete support');
  console.log('   ✓ Optimistic locking (version field)');
  console.log('   ✓ Optimized indexes for pagination');
  console.log('\n🚀 Next: npx prisma studio (to view data)\n');
}

// ============================================
// EXECUTION
// ============================================

main()
  .catch((e) => {
    console.error('\n❌ Error during seed:');
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });