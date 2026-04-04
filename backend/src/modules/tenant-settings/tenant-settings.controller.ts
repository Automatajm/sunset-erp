// --- tenant-settings/tenant-settings.controller.ts ---
import { Controller, Get, Patch, Body, Request, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { TenantSettingsService } from './tenant-settings.service';
import { UpdateTenantSettingsDto } from './dto/update-tenant-settings.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';

@ApiTags('Tenant Settings')
@Controller('tenant-settings')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class TenantSettingsController {
  constructor(private readonly service: TenantSettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Get tenant settings' })
  async get(@Request() req) {
    return this.service.getOrCreate(req.user.tenantId);
  }

  @Patch()
  @ApiOperation({ summary: 'Update tenant settings' })
  async update(@Request() req, @Body() dto: UpdateTenantSettingsDto) {
    return this.service.update(req.user.tenantId, req.user.id, dto);
  }

  @Get('system-uoms')
  @ApiOperation({
    summary: 'Get configured system UOMs',
    description: 'Returns the flat list of system UOMs configured for this tenant. Used by ConsumptionGroup and Item modals to restrict UOM selection to system units only.',
  })
  async getSystemUoms(@Request() req) {
    return this.service.getSystemUoms(req.user.tenantId);
  }
}
