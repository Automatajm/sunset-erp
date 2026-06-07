// FILE: backend/src/modules/tenants/tenants.controller.ts
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiResponse } from '@nestjs/swagger';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { AddTenantUserDto } from './dto/add-tenant-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('Tenants')
@Controller('tenants')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('JWT-auth')
export class TenantsController {
  constructor(private readonly svc: TenantsService) {}

  @Get()
  @RequirePermissions('ADMIN:SETTINGS')
  @ApiOperation({ summary: 'List all tenants with user count' })
  @ApiResponse({ status: 200, description: '{ tenants: [...], count: n }' })
  findAll() {
    return this.svc.findAll();
  }

  @Post()
  @RequirePermissions('ADMIN:SETTINGS')
  @ApiOperation({ summary: 'Create a new tenant' })
  @ApiResponse({ status: 201, description: 'Tenant created (code auto-generated if omitted)' })
  @ApiResponse({ status: 409, description: 'Tenant code already exists' })
  @ApiResponse({ status: 400, description: 'Validation error' })
  create(@Body() dto: CreateTenantDto) {
    return this.svc.create(dto);
  }

  @Get(':id')
  @RequirePermissions('ADMIN:SETTINGS')
  @ApiParam({ name: 'id', description: 'Tenant UUID' })
  @ApiOperation({ summary: 'Get tenant detail with users and roles' })
  @ApiResponse({ status: 200, description: 'Tenant detail with users' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  findOne(@Param('id') id: string) {
    return this.svc.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('ADMIN:SETTINGS')
  @ApiParam({ name: 'id', description: 'Tenant UUID' })
  @ApiOperation({ summary: 'Update tenant info' })
  @ApiResponse({ status: 200, description: 'Tenant updated' })
  @ApiResponse({ status: 404, description: 'Tenant not found' })
  update(@Param('id') id: string, @Body() dto: UpdateTenantDto) {
    return this.svc.update(id, dto);
  }

  @Post(':id/users')
  @RequirePermissions('ADMIN:SETTINGS')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', description: 'Tenant UUID' })
  @ApiOperation({ summary: 'Add existing user to tenant' })
  @ApiResponse({ status: 200, description: 'User added to tenant' })
  @ApiResponse({ status: 404, description: 'Tenant or user not found' })
  addUser(@Param('id') id: string, @Body() dto: AddTenantUserDto) {
    return this.svc.addUser(id, dto.userId, dto.isDefault ?? false);
  }

  @Delete(':id/users/:userId')
  @RequirePermissions('ADMIN:SETTINGS')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', description: 'Tenant UUID' })
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiOperation({ summary: 'Remove user from tenant (deactivates, removes roles)' })
  @ApiResponse({ status: 200, description: 'User removed from tenant' })
  @ApiResponse({ status: 404, description: 'User not in this tenant' })
  removeUser(@Param('id') id: string, @Param('userId') userId: string) {
    return this.svc.removeUser(id, userId);
  }

  @Patch(':id/users/:userId/set-default')
  @RequirePermissions('ADMIN:SETTINGS')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', description: 'Tenant UUID' })
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiOperation({ summary: 'Set or unset this tenant as default for the user' })
  @ApiResponse({ status: 200, description: 'Default tenant updated' })
  @ApiResponse({ status: 404, description: 'User not in this tenant' })
  setDefault(
    @Param('id') id: string,
    @Param('userId') userId: string,
    @Body() body: { unset?: boolean },
  ) {
    return this.svc.setDefaultTenant(id, userId, body?.unset === true);
  }
}
