import { PrismaClient } from '@prisma/client';

export async function seedPermissions(prisma: PrismaClient) {
  console.log('🔐 Seeding permissions...');

  const permissions = [
    // Procurement
    { code: 'PROCUREMENT:VIEW', name: 'View Procurement', module: 'procurement' },
    { code: 'PROCUREMENT:CREATE', name: 'Create Purchase Orders', module: 'procurement' },
    { code: 'PROCUREMENT:EDIT', name: 'Edit Purchase Orders', module: 'procurement' },
    { code: 'PROCUREMENT:DELETE', name: 'Delete Purchase Orders', module: 'procurement' },
    { code: 'PROCUREMENT:APPROVE', name: 'Approve Purchase Orders', module: 'procurement' },
    
    // Inventory
    { code: 'INVENTORY:VIEW', name: 'View Inventory', module: 'inventory' },
    { code: 'INVENTORY:CREATE', name: 'Create Items', module: 'inventory' },
    { code: 'INVENTORY:EDIT', name: 'Edit Items', module: 'inventory' },
    { code: 'INVENTORY:DELETE', name: 'Delete Items', module: 'inventory' },
    { code: 'INVENTORY:ADJUST', name: 'Adjust Stock', module: 'inventory' },
    
    // Sales
    { code: 'SALES:VIEW', name: 'View Sales', module: 'sales' },
    { code: 'SALES:CREATE', name: 'Create Sales Orders', module: 'sales' },
    { code: 'SALES:EDIT', name: 'Edit Sales Orders', module: 'sales' },
    { code: 'SALES:DELETE', name: 'Delete Sales Orders', module: 'sales' },
    { code: 'SALES:APPROVE', name: 'Approve Sales Orders', module: 'sales' },
    
    // Accounting
    { code: 'ACCOUNTING:VIEW', name: 'View Accounting', module: 'accounting' },
    { code: 'ACCOUNTING:CREATE', name: 'Create Journal Entries', module: 'accounting' },
    { code: 'ACCOUNTING:EDIT', name: 'Edit Journal Entries', module: 'accounting' },
    { code: 'ACCOUNTING:DELETE', name: 'Delete Journal Entries', module: 'accounting' },
    { code: 'ACCOUNTING:POST', name: 'Post Journal Entries', module: 'accounting' },
    
    // Admin
    { code: 'ADMIN:USERS', name: 'Manage Users', module: 'admin' },
    { code: 'ADMIN:ROLES', name: 'Manage Roles', module: 'admin' },
    { code: 'ADMIN:SETTINGS', name: 'Manage Settings', module: 'admin' },
  ];

  for (const permission of permissions) {
    await prisma.permission.create({ data: permission });
  }

  console.log(`   ✅ ${permissions.length} permissions created`);
}
