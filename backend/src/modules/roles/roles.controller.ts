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
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
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
  async findAll(@Request() req) {
    const roles = await this.rolesService.findAll(req.user.tenantId);
    return { roles, count: roles.length };
  }

  @Get('permissions')
  @RequirePermissions('ADMIN:ROLES')
  @ApiOperation({ summary: 'List all available permissions grouped by module' })
  async findAllPermissions() {
    return this.rolesService.findAllPermissions();
  }

  @Get(':id')
  @RequirePermissions('ADMIN:ROLES')
  @ApiParam({ name: 'id', description: 'Role UUID' })
  @ApiOperation({ summary: 'Get single role with full permission list' })
  async findOne(@Request() req, @Param('id') id: string) {
    return this.rolesService.findOne(req.user.tenantId, id);
  }

  @Post()
  @RequirePermissions('ADMIN:ROLES')
  @ApiOperation({ summary: 'Create a new role with optional permissions' })
  async create(@Request() req, @Body() dto: CreateRoleDto) {
    return this.rolesService.create(req.user.tenantId, req.user.id, dto);
  }

  @Patch(':id')
  @RequirePermissions('ADMIN:ROLES')
  @ApiParam({ name: 'id', description: 'Role UUID' })
  @ApiOperation({ summary: 'Update role name and description' })
  async update(@Request() req, @Param('id') id: string, @Body() dto: UpdateRoleDto) {
    return this.rolesService.update(req.user.tenantId, req.user.id, id, dto);
  }

  @Patch(':id/permissions')
  @RequirePermissions('ADMIN:ROLES')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', description: 'Role UUID' })
  @ApiOperation({ summary: 'Replace all permissions for a role' })
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
  async remove(@Request() req, @Param('id') id: string) {
    return this.rolesService.remove(req.user.tenantId, req.user.id, id);
  }
}
