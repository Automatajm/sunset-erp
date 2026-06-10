import {
  Controller,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiParam } from '@nestjs/swagger';
import { BulkImportService } from './bulk-import.service';
import { BulkImportDto, BULK_IMPORT_ENTITIES } from './dto/bulk-import.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { BulkImportPermissionsGuard, ENTITY_PERMISSIONS } from './bulk-import.permissions.guard';

@ApiTags('Bulk Import')
@Controller('bulk-import')
@UseGuards(JwtAuthGuard, BulkImportPermissionsGuard)
@ApiBearerAuth('JWT-auth')
export class BulkImportController {
  constructor(private readonly bulkImportService: BulkImportService) {}

  @Post(':entity')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Bulk import records for a given entity',
    description: `
Supported entities: ${BULK_IMPORT_ENTITIES.join(', ')}

Per-entity permission (a domain CREATE permission, not a single blanket one):
${Object.entries(ENTITY_PERMISSIONS)
  .map(([e, p]) => `- ${e} → ${p}`)
  .join('\n')}

**Option A — Direct payload:**
\`\`\`json
{ "dryRun": true, "records": [{ "code": "ITM001", "name": "Burger Patty" }] }
\`\`\`

**Option B — External URL (migration):** \`{ "sourceUrl": "https://...", "sourceToken": "..." }\`
(host must be public — private/loopback addresses are blocked).

Set **dryRun: true** to validate without inserting. Duplicates are reported per-row, never 500.
    `,
  })
  @ApiParam({ name: 'entity', enum: BULK_IMPORT_ENTITIES, description: 'Entity type to import' })
  @ApiResponse({ status: 200, description: 'Import result with counts and per-row errors' })
  @ApiResponse({ status: 400, description: 'Invalid entity, >2000 rows, or unsafe source URL' })
  @ApiResponse({ status: 403, description: 'Missing the entity-specific create permission' })
  async bulkImport(@Request() req, @Param('entity') entity: string, @Body() dto: BulkImportDto) {
    // Entity validity + per-entity permission are enforced by BulkImportPermissionsGuard.
    return this.bulkImportService.importEntity(req.user.tenantId, req.user.id, entity as any, dto);
  }
}
