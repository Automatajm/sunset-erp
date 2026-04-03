import { PrismaClient } from '@prisma/client';

export async function seedPermissions(prisma: PrismaClient) {
  console.log('🔐 Seeding permissions...');

  const permissions = [
    // ── Procurement ──────────────────────────────────────────────────────────
    { code: 'PROCUREMENT:VIEW',    name: 'View Procurement',         module: 'procurement' },
    { code: 'PROCUREMENT:CREATE',  name: 'Create Purchase Orders',   module: 'procurement' },
    { code: 'PROCUREMENT:EDIT',    name: 'Edit Purchase Orders',     module: 'procurement' },
    { code: 'PROCUREMENT:DELETE',  name: 'Delete Purchase Orders',   module: 'procurement' },
    { code: 'PROCUREMENT:APPROVE', name: 'Approve Purchase Orders',  module: 'procurement' },

    // ── Inventory ─────────────────────────────────────────────────────────────
    { code: 'INVENTORY:VIEW',      name: 'View Inventory',           module: 'inventory' },
    { code: 'INVENTORY:CREATE',    name: 'Create Items / Adjustments',module: 'inventory' },
    { code: 'INVENTORY:EDIT',      name: 'Edit Items',               module: 'inventory' },
    { code: 'INVENTORY:DELETE',    name: 'Delete Items',             module: 'inventory' },
    { code: 'INVENTORY:ADJUST',    name: 'Adjust Stock',             module: 'inventory' },
    { code: 'INVENTORY:COUNT',     name: 'Perform Cycle Counts',     module: 'inventory' },
    { code: 'INVENTORY:APPROVE',   name: 'Approve Cycle Counts',     module: 'inventory' },

    // ── Manufacturing ─────────────────────────────────────────────────────────
    { code: 'MFG:VIEW',            name: 'View Manufacturing',       module: 'manufacturing' },
    { code: 'MFG:CREATE',          name: 'Create Production Orders', module: 'manufacturing' },
    { code: 'MFG:EDIT',            name: 'Edit Production Orders',   module: 'manufacturing' },
    { code: 'MFG:DELETE',          name: 'Delete Production Orders', module: 'manufacturing' },
    { code: 'MFG:APPROVE',         name: 'Approve Production Orders',module: 'manufacturing' },

    // ── Sales ─────────────────────────────────────────────────────────────────
    { code: 'SALES:VIEW',          name: 'View Sales',               module: 'sales' },
    { code: 'SALES:CREATE',        name: 'Create Sales Orders',      module: 'sales' },
    { code: 'SALES:EDIT',          name: 'Edit Sales Orders',        module: 'sales' },
    { code: 'SALES:DELETE',        name: 'Delete Sales Orders',      module: 'sales' },
    { code: 'SALES:APPROVE',       name: 'Approve Sales Orders',     module: 'sales' },

    // ── Accounts Receivable ───────────────────────────────────────────────────
    { code: 'AR:VIEW',             name: 'View AR Invoices',         module: 'ar' },
    { code: 'AR:CREATE',           name: 'Create AR Invoices',       module: 'ar' },
    { code: 'AR:EDIT',             name: 'Edit AR Invoices',         module: 'ar' },
    { code: 'AR:DELETE',           name: 'Delete AR Invoices',       module: 'ar' },
    { code: 'AR:APPROVE',          name: 'Approve AR Invoices',      module: 'ar' },
    { code: 'AR:PAYMENT',          name: 'Record AR Payments',       module: 'ar' },

    // ── Accounts Payable ──────────────────────────────────────────────────────
    { code: 'AP:VIEW',             name: 'View AP Invoices',         module: 'ap' },
    { code: 'AP:CREATE',           name: 'Create AP Invoices',       module: 'ap' },
    { code: 'AP:EDIT',             name: 'Edit AP Invoices',         module: 'ap' },
    { code: 'AP:DELETE',           name: 'Delete AP Invoices',       module: 'ap' },
    { code: 'AP:APPROVE',          name: 'Approve AP Invoices',      module: 'ap' },
    { code: 'AP:PAYMENT',          name: 'Record AP Payments',       module: 'ap' },

    // ── Accounting ────────────────────────────────────────────────────────────
    { code: 'ACCOUNTING:VIEW',     name: 'View Accounting',          module: 'accounting' },
    { code: 'ACCOUNTING:CREATE',   name: 'Create Journal Entries',   module: 'accounting' },
    { code: 'ACCOUNTING:EDIT',     name: 'Edit Journal Entries',     module: 'accounting' },
    { code: 'ACCOUNTING:DELETE',   name: 'Delete Journal Entries',   module: 'accounting' },
    { code: 'ACCOUNTING:POST',     name: 'Post Journal Entries',     module: 'accounting' },

    // ── Admin ─────────────────────────────────────────────────────────────────
    { code: 'ADMIN:USERS',         name: 'Manage Users',             module: 'admin' },
    { code: 'ADMIN:ROLES',         name: 'Manage Roles',             module: 'admin' },
    { code: 'ADMIN:SETTINGS',      name: 'Manage Settings',          module: 'admin' },
  ];

  let created = 0;
  let skipped = 0;

  for (const permission of permissions) {
    const existing = await prisma.permission.findFirst({ where: { code: permission.code } });
    if (existing) {
      skipped++;
    } else {
      await prisma.permission.create({ data: permission });
      created++;
    }
  }

  console.log(`   ✅ ${created} permissions created, ${skipped} already existed`);
}