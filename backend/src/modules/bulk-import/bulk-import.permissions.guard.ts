import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { BulkImportEntity, BULK_IMPORT_ENTITIES } from './dto/bulk-import.dto';

// ── Per-entity create permission (spec-035) ─────────────────────────────────
// A single `ACCOUNTING:CREATE` for every entity let an accounting user import
// users/roles. Each entity now maps to its owning domain's CREATE permission.
// Entities that are not standalone modules inherit their family's permission:
//   warehouse-locations → INVENTORY (warehouse family)
//   budget-lines        → ACCOUNTING (finance family)
//   bom-routings        → MFG        (BOM family)
export const ENTITY_PERMISSIONS: Record<BulkImportEntity, string> = {
  items: 'INVENTORY:CREATE',
  warehouses: 'INVENTORY:CREATE',
  'warehouse-locations': 'INVENTORY:CREATE',
  customers: 'SALES:CREATE',
  suppliers: 'PROCUREMENT:CREATE',
  'work-centers': 'MFG:CREATE',
  accounts: 'ACCOUNTING:CREATE',
  'sales-orders': 'SALES:CREATE',
  'purchase-orders': 'PROCUREMENT:CREATE',
  'budget-lines': 'ACCOUNTING:CREATE',
  'fiscal-periods': 'ACCOUNTING:CREATE',
  boms: 'MFG:CREATE',
  'bom-routings': 'MFG:CREATE',
  users: 'ADMIN:SETTINGS',
  roles: 'ADMIN:SETTINGS',
};

// Resolves the required permission from the `:entity` route param and checks it
// against the permissions JwtStrategy already attached to req.user. Runs after
// JwtAuthGuard. Unknown entity → 400 (before any permission check).
@Injectable()
export class BulkImportPermissionsGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();
    const entity = req.params?.entity as string;

    if (!BULK_IMPORT_ENTITIES.includes(entity as BulkImportEntity)) {
      throw new BadRequestException(
        `Unsupported entity: ${entity}. Valid: ${BULK_IMPORT_ENTITIES.join(', ')}`,
      );
    }

    const user = req.user;
    if (!user || !user.id) throw new ForbiddenException('User not authenticated');
    if (!user.tenantId) throw new ForbiddenException('No tenant selected');

    const required = ENTITY_PERMISSIONS[entity as BulkImportEntity];
    const held: string[] = user.permissions ?? [];
    if (!held.includes(required)) {
      throw new ForbiddenException(`Missing required permission for ${entity}: ${required}`);
    }
    return true;
  }
}
