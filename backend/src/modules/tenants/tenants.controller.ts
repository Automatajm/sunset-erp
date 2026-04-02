// FILE: backend/src/modules/tenants/tenants.controller.ts
import {
  Controller, Get, Post, Patch, Delete,
  Param, Body, UseGuards, Request, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { TenantsService }    from './tenants.service';
import { CreateTenantDto }   from './dto/create-tenant.dto';
import { UpdateTenantDto }   from './dto/update-tenant.dto';
import { AddTenantUserDto }  from './dto/add-tenant-user.dto';
import { JwtAuthGuard }      from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard }  from '../../common/guards/permissions.guard';
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
  findAll() { return this.svc.findAll(); }

  @Post()
  @RequirePermissions('ADMIN:SETTINGS')
  @ApiOperation({ summary: 'Create a new tenant' })
  create(@Body() dto: CreateTenantDto) { return this.svc.create(dto); }

  @Get(':id')
  @RequirePermissions('ADMIN:SETTINGS')
  @ApiParam({ name: 'id', description: 'Tenant UUID' })
  @ApiOperation({ summary: 'Get tenant detail with users and roles' })
  findOne(@Param('id') id: string) { return this.svc.findOne(id); }

  @Patch(':id')
  @RequirePermissions('ADMIN:SETTINGS')
  @ApiParam({ name: 'id', description: 'Tenant UUID' })
  @ApiOperation({ summary: 'Update tenant info' })
  update(@Param('id') id: string, @Body() dto: UpdateTenantDto) {
    return this.svc.update(id, dto);
  }

  @Post(':id/users')
  @RequirePermissions('ADMIN:SETTINGS')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', description: 'Tenant UUID' })
  @ApiOperation({ summary: 'Add existing user to tenant' })
  addUser(@Param('id') id: string, @Body() dto: AddTenantUserDto) {
    return this.svc.addUser(id, dto.userId, dto.isDefault ?? false);
  }

  @Delete(':id/users/:userId')
  @RequirePermissions('ADMIN:SETTINGS')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id',     description: 'Tenant UUID' })
  @ApiParam({ name: 'userId', description: 'User UUID' })
  @ApiOperation({ summary: 'Remove user from tenant (deactivates, removes roles)' })
  removeUser(@Param('id') id: string, @Param('userId') userId: string) {
    return this.svc.removeUser(id, userId);
  }

  @Patch(':id/users/:userId/set-default')
  @RequirePermissions('ADMIN:SETTINGS')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set this tenant as default for the user' })
  setDefault(@Param('id') id: string, @Param('userId') userId: string) {
    return this.svc.setDefaultTenant(id, userId);
  }
}