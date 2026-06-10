// ============================================================================
// Unit tests for BulkImportPermissionsGuard (spec-035 per-entity RBAC).
// The guard is pure (reads req.params.entity + req.user.permissions), so the
// 403 path — which an all-permissions admin can't exercise in e2e — is proven here.
// ============================================================================
import { ForbiddenException, BadRequestException, ExecutionContext } from '@nestjs/common';
import { BulkImportPermissionsGuard, ENTITY_PERMISSIONS } from './bulk-import.permissions.guard';
import { BULK_IMPORT_ENTITIES } from './dto/bulk-import.dto';

const ctx = (entity: string, user: any): ExecutionContext =>
  ({ switchToHttp: () => ({ getRequest: () => ({ params: { entity }, user }) }) }) as any;

const user = (permissions: string[]) => ({ id: 'u1', tenantId: 't1', permissions });

describe('BulkImportPermissionsGuard', () => {
  const guard = new BulkImportPermissionsGuard();

  it('maps every supported entity to a non-empty permission', () => {
    for (const e of BULK_IMPORT_ENTITIES) expect(ENTITY_PERMISSIONS[e]).toBeTruthy();
  });

  it('rejects an unknown entity with 400 before any permission check', () => {
    expect(() => guard.canActivate(ctx('widgets', user([])))).toThrow(BadRequestException);
  });

  it('403 when unauthenticated or no tenant', () => {
    expect(() => guard.canActivate(ctx('items', null))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(ctx('items', { id: 'u1', permissions: [] }))).toThrow(
      ForbiddenException,
    );
  });

  // The whole point of the map: a permission for one domain must NOT authorize another.
  it('enforces each entity → its mapped domain permission (allow with it, 403 without)', () => {
    const cases: [string, string][] = [
      ['items', 'INVENTORY:CREATE'],
      ['warehouses', 'INVENTORY:CREATE'],
      ['warehouse-locations', 'INVENTORY:CREATE'],
      ['suppliers', 'PROCUREMENT:CREATE'],
      ['purchase-orders', 'PROCUREMENT:CREATE'],
      ['customers', 'SALES:CREATE'],
      ['sales-orders', 'SALES:CREATE'],
      ['accounts', 'ACCOUNTING:CREATE'],
      ['fiscal-periods', 'ACCOUNTING:CREATE'],
      ['budget-lines', 'ACCOUNTING:CREATE'],
      ['boms', 'MFG:CREATE'],
      ['bom-routings', 'MFG:CREATE'],
      ['work-centers', 'MFG:CREATE'],
      ['users', 'ADMIN:SETTINGS'],
      ['roles', 'ADMIN:SETTINGS'],
    ];
    for (const [entity, perm] of cases) {
      expect(guard.canActivate(ctx(entity, user([perm])))).toBe(true);
      expect(() => guard.canActivate(ctx(entity, user(['ACCOUNTING:VIEW'])))).toThrow(
        ForbiddenException,
      );
    }
  });

  it('an ACCOUNTING:CREATE user can no longer import users/roles (the bug this fixes)', () => {
    expect(() => guard.canActivate(ctx('users', user(['ACCOUNTING:CREATE'])))).toThrow(
      ForbiddenException,
    );
    expect(() => guard.canActivate(ctx('roles', user(['ACCOUNTING:CREATE'])))).toThrow(
      ForbiddenException,
    );
    expect(guard.canActivate(ctx('users', user(['ADMIN:SETTINGS'])))).toBe(true);
  });
});
