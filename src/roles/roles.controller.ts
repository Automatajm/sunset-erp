import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { RolesService } from './roles.service';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRoleDto } from './dto/update-role.dto';
import { AssignPermissionsDto } from './dto/assign-permissions.dto';
import { PaginationDto } from '../common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';

@ApiTags('roles')
@ApiBearerAuth('JWT-auth')
@Controller('roles')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class RolesController {
  constructor(private readonly rolesService: RolesService) {}

  @Post()
  @RequirePermissions('ADM:roles:manage:tenant')
  @ApiOperation({ summary: 'Create role', description: 'Create a new role with optional hierarchy' })
  @ApiResponse({ status: 201, description: 'Role successfully created' })
  @ApiResponse({ status: 409, description: 'Role code already exists' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  create(@Body() dto: CreateRoleDto, @CurrentUser() user: any) {
    return this.rolesService.create(dto, user.tenantId, user.userId);
  }

  @Get()
  @RequirePermissions('ADM:roles:read:tenant')
  @ApiOperation({ summary: 'List roles', description: 'Get paginated list of roles' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'search', required: false, example: 'admin' })
  @ApiResponse({ status: 200, description: 'Roles retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  findAll(@Query() pagination: PaginationDto, @CurrentUser() user: any) {
    return this.rolesService.findAll(user.tenantId, pagination);
  }

  @Get(':id')
  @RequirePermissions('ADM:roles:read:tenant')
  @ApiOperation({ summary: 'Get role', description: 'Get role details with permissions' })
  @ApiResponse({ status: 200, description: 'Role retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Role not found' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.rolesService.findOne(id, user.tenantId);
  }

  @Patch(':id')
  @RequirePermissions('ADM:roles:manage:tenant')
  @ApiOperation({ summary: 'Update role', description: 'Update role information' })
  @ApiResponse({ status: 200, description: 'Role updated successfully' })
  @ApiResponse({ status: 404, description: 'Role not found' })
  @ApiResponse({ status: 409, description: 'Cannot modify system roles' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
    @CurrentUser() user: any,
  ) {
    return this.rolesService.update(id, user.tenantId, dto);
  }

  @Delete(':id')
  @RequirePermissions('ADM:roles:manage:tenant')
  @ApiOperation({ summary: 'Delete role', description: 'Soft delete a role' })
  @ApiResponse({ status: 200, description: 'Role deleted successfully' })
  @ApiResponse({ status: 404, description: 'Role not found' })
  @ApiResponse({ status: 409, description: 'Cannot delete role with assigned users' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.rolesService.remove(id, user.tenantId);
  }

  @Post(':id/assign-permissions')
  @RequirePermissions('ADM:permissions:manage:tenant')
  @ApiOperation({ summary: 'Assign permissions', description: 'Assign permissions to a role' })
  @ApiResponse({ status: 200, description: 'Permissions assigned successfully' })
  @ApiResponse({ status: 404, description: 'Role not found' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  assignPermissions(
    @Param('id') id: string,
    @Body() dto: AssignPermissionsDto,
    @CurrentUser() user: any,
  ) {
    return this.rolesService.assignPermissions(id, user.tenantId, dto);
  }
}