const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const missing = [
    { code: 'INVENTORY:APPROVE', name: 'Approve Inventory Adjustments', module: 'inventory' },
    { code: 'INVENTORY:COUNT',   name: 'Cycle Count - Mobile Access',   module: 'inventory' },
    { code: 'AR:VIEW',    name: 'View AR Invoices',    module: 'ar' },
    { code: 'AR:CREATE',  name: 'Create AR Invoices',  module: 'ar' },
    { code: 'AR:EDIT',    name: 'Edit AR Invoices',    module: 'ar' },
    { code: 'AR:DELETE',  name: 'Delete AR Invoices',  module: 'ar' },
    { code: 'AR:APPROVE', name: 'Approve AR Invoices', module: 'ar' },
    { code: 'AR:PAYMENT', name: 'Register AR Payments',module: 'ar' },
    { code: 'AP:VIEW',    name: 'View AP Invoices',    module: 'ap' },
    { code: 'AP:CREATE',  name: 'Create AP Invoices',  module: 'ap' },
    { code: 'AP:EDIT',    name: 'Edit AP Invoices',    module: 'ap' },
    { code: 'AP:DELETE',  name: 'Delete AP Invoices',  module: 'ap' },
    { code: 'AP:APPROVE', name: 'Approve AP Invoices', module: 'ap' },
    { code: 'AP:PAYMENT', name: 'Register AP Payments',module: 'ap' },
  ];
  const adminRole = await prisma.role.findFirst({ where: { code: 'ADMIN' } });
  if (!adminRole) { console.log('ERROR: Admin role not found'); process.exit(1); }
  console.log('Admin role found:', adminRole.id);
  for (const p of missing) {
    const perm = await prisma.permission.upsert({
      where: { code: p.code }, update: {}, create: p,
    });
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: adminRole.id, permissionId: perm.id } },
      update: {}, create: { roleId: adminRole.id, permissionId: perm.id },
    });
    console.log('OK:', p.code);
  }
  await prisma.$disconnect();
  console.log('Done.');
}
main().catch(e => { console.error(e); process.exit(1); });