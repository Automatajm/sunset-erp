// --- tenant-settings/tenant-settings.controller.ts ---
import { Controller, Get, Patch, Body, UseGuards, Request } from '@nestjs/common';
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
  constructor(private readonly tenantSettingsService: TenantSettingsService) {}
 
  @Get()
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get tenant UOM and configuration settings' })
  @ApiResponse({ status: 200, description: 'Tenant settings with UOM references' })
  async get(@Request() req) {
    return this.tenantSettingsService.getOrCreate(req.user.tenantId);
  }
 
  @Patch()
  @RequirePermissions('INVENTORY:EDIT')
  @ApiOperation({ summary: 'Update tenant UOM and configuration settings' })
  @ApiResponse({ status: 200, description: 'Settings updated' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  async update(@Request() req, @Body() dto: UpdateTenantSettingsDto) {
    return this.tenantSettingsService.update(req.user.tenantId, req.user.id, dto);
  }
}