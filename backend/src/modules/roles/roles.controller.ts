// ============================================================================
// FILE: backend/src/modules/roles/roles.controller.ts
// ============================================================================
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiResponse } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('Roles')
@Controller('roles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('JWT-auth')
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Get()
  @RequirePermissions('ADMIN:ROLES')
  @ApiOperation({ summary: 'List all roles in tenant with permissions and user count' })
  @ApiResponse({ status: 200, description: '{ roles: [...], count: n }' })
  async findAll(@Request() req) {
    return this.rolesService.findAll(req.user.tenantId);
  }

  @Get('permissions')
  @RequirePermissions('ADMIN:ROLES')
  @ApiOperation({ summary: 'List all available permissions grouped by module' })
  @ApiResponse({ status: 200, description: '{ permissions, grouped, count }' })
  async findAllPermissions() {
    return this.rolesService.findAllPermissions();
  }

  @Get(':id')
  @RequirePermissions('ADMIN:ROLES')
  @ApiParam({ name: 'id', description: 'Role UUID' })
  @ApiOperation({ summary: 'Get single role with full permission list' })
  @ApiResponse({ status: 200, description: 'Role detail with permissions' })
  @ApiResponse({ status: 404, description: 'Role not found' })
  async findOne(@Request() req, @Param('id') id: string) {
    return this.rolesService.findOne(req.user.tenantId, id);
  }

  @Post()
  @RequirePermissions('ADMIN:ROLES')
  @ApiOperation({ summary: 'Create a new role with optional permissions' })
  @ApiResponse({ status: 201, description: 'Role created' })
  @ApiResponse({ status: 409, description: 'Role code already exists' })
  async create(@Request() req, @Body() dto: CreateRoleDto) {
    return this.rolesService.create(req.user.tenantId, req.user.id, dto);
  }

  @Patch(':id')
  @RequirePermissions('ADMIN:ROLES')
  @ApiParam({ name: 'id', description: 'Role UUID' })
  @ApiOperation({ summary: 'Update role name and description' })
  @ApiResponse({ status: 200, description: 'Role updated' })
  @ApiResponse({ status: 400, description: 'Cannot edit a system role' })
  @ApiResponse({ status: 404, description: 'Role not found' })
  async update(@Request() req, @Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.rolesService.update(req.user.tenantId, req.user.id, id, dto);
  }

  @Patch(':id/permissions')
  @RequirePermissions('ADMIN:ROLES')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', description: 'Role UUID' })
  @ApiOperation({ summary: 'Replace all permissions for a role' })
  @ApiResponse({ status: 200, description: 'Permissions replaced, holders’ cache cleared' })
  @ApiResponse({ status: 400, description: 'Cannot edit a system role / permission not found' })
  async updatePermissions(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdateRolePermissionsDto,
  ) {
    return this.rolesService.updatePermissions(
      req.user.tenantId,
      req.user.id,
      id,
      dto.permissionIds,
    );
  }

  @Delete(':id')
  @RequirePermissions('ADMIN:ROLES')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', description: 'Role UUID' })
  @ApiOperation({ summary: 'Soft delete role — fails if users are assigned to it' })
  @ApiResponse({ status: 200, description: 'Role soft-deleted' })
  @ApiResponse({ status: 400, description: 'System role or role in use' })
  @ApiResponse({ status: 404, description: 'Role not found' })
  async remove(@Request() req, @Param('id') id: string) {
    return this.rolesService.remove(req.user.tenantId, req.user.id, id);
  }
}
