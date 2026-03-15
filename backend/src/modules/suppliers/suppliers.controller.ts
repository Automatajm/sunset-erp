import { Controller, Get, Post, Body, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('Suppliers')
@Controller('suppliers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('JWT-auth')
export class SuppliersController {
  @Get()
  @RequirePermissions('PROCUREMENT:VIEW')
  @ApiOperation({ summary: 'Get all suppliers (requires PROCUREMENT:VIEW)' })
  @ApiResponse({ status: 200, description: 'List of suppliers' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  findAll(@Request() req) {
    return {
      message: 'Suppliers list',
      tenantId: req.user.tenantId,
      permissions: ['PROCUREMENT:VIEW'],
      data: [
        { id: '1', code: 'SUP001', name: 'Example Supplier 1' },
        { id: '2', code: 'SUP002', name: 'Example Supplier 2' },
      ],
    };
  }

  @Post()
  @RequirePermissions('PROCUREMENT:CREATE')
  @ApiOperation({ summary: 'Create supplier (requires PROCUREMENT:CREATE)' })
  @ApiResponse({ status: 201, description: 'Supplier created' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  create(@Request() req, @Body() createSupplierDto: any) {
    return {
      message: 'Supplier created',
      tenantId: req.user.tenantId,
      permissions: ['PROCUREMENT:CREATE'],
      data: createSupplierDto,
    };
  }

  @Get('admin-only')
  @RequirePermissions('ADMIN:SETTINGS')
  @ApiOperation({ summary: 'Admin-only endpoint (requires ADMIN:SETTINGS)' })
  @ApiResponse({ status: 200, description: 'Admin data' })
  @ApiResponse({ status: 403, description: 'Forbidden - admin only' })
  adminOnly(@Request() req) {
    return {
      message: 'Admin-only data',
      tenantId: req.user.tenantId,
      permissions: ['ADMIN:SETTINGS'],
    };
  }
}
