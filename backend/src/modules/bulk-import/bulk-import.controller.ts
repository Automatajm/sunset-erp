import {
  Controller,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiParam } from '@nestjs/swagger';
import { BulkImportService } from './bulk-import.service';
import { BulkImportDto, BULK_IMPORT_ENTITIES } from './dto/bulk-import.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('Bulk Import')
@Controller('bulk-import')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('JWT-auth')
export class BulkImportController {
  constructor(private readonly bulkImportService: BulkImportService) {}

  @Post(':entity')
  @RequirePermissions('ACCOUNTING:CREATE')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Bulk import records for a given entity',
    description: `
Supported entities: ${BULK_IMPORT_ENTITIES.join(', ')}

**Option A — Direct payload:**
\`\`\`json
{ "dryRun": true, "records": [{ "code": "ITM001", "name": "Burger Patty", ... }] }
\`\`\`

**Option B — External URL (migration from another system):**
\`\`\`json
{ "dryRun": true, "sourceUrl": "https://my-old-system.com/api/items", "sourceToken": "abc123" }
\`\`\`

Set **dryRun: true** to validate without inserting. Duplicates (same code/accountNumber) are skipped.
    `,
  })
  @ApiParam({
    name: 'entity',
    enum: BULK_IMPORT_ENTITIES,
    description: 'Entity type to import',
  })
  @ApiResponse({ status: 200, description: 'Import result with counts and errors' })
  @ApiResponse({ status: 400, description: 'Invalid entity or missing required fields' })
  async bulkImport(@Request() req, @Param('entity') entity: string, @Body() dto: BulkImportDto) {
    if (!BULK_IMPORT_ENTITIES.includes(entity as any)) {
      throw new BadRequestException(
        `Invalid entity: ${entity}. Valid: ${BULK_IMPORT_ENTITIES.join(', ')}`,
      );
    }
    return this.bulkImportService.importEntity(req.user.tenantId, req.user.id, entity as any, dto);
  }
}
