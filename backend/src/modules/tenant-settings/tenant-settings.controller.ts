// --- tenant-settings/tenant-settings.controller.ts ---
import { Controller, Get, Patch, Body, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { TenantSettingsService } from './tenant-settings.service';
import { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('Tenant Settings')
@Controller('tenant-settings')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('JWT-auth')
export class TenantSettingsController {
  constructor(private readonly service: TenantSettingsService) {}

  @Get()
  @RequirePermissions('SETTINGS:VIEW')
  @ApiOperation({ summary: 'Get tenant settings' })
  @ApiResponse({ status: 200, description: 'Tenant settings with resolved UOM relations' })
  async get(@Request() req) {
    return this.service.getOrCreate(req.user.tenantId);
  }

  @Patch()
  @RequirePermissions('SETTINGS:EDIT')
  @ApiOperation({ summary: 'Update tenant settings (base currency, UOM system)' })
  @ApiResponse({ status: 200, description: 'Settings updated' })
  @ApiResponse({ status: 404, description: 'baseCurrency not in the catalog' })
  async update(@Request() req, @Body() dto: UpdateTenantSettingsDto) {
    return this.service.update(req.user.tenantId, req.user.id, dto);
  }

  @Get('system-uoms')
  @RequirePermissions('SETTINGS:VIEW')
  @ApiOperation({
    summary: 'Get configured system UOMs',
    description:
      'Returns the flat list of system UOMs configured for this tenant. Used by ConsumptionGroup and Item modals to restrict UOM selection to system units only.',
  })
  @ApiResponse({ status: 200, description: 'Configured system UOMs (flat list + per-type)' })
  async getSystemUoms(@Request() req) {
    return this.service.getSystemUoms(req.user.tenantId);
  }
}
