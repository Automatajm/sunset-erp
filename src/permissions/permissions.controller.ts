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
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger';
import { PermissionsService } from './permissions.service';
import { CreatePermissionDto } from './dto/create-permission.dto';
import { UpdatePermissionDto } from './dto/update-permission.dto';
import { PaginationDto } from '../common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';

@ApiTags('permissions')
@ApiBearerAuth('JWT-auth')
@Controller('permissions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class PermissionsController {
  constructor(private readonly permissionsService: PermissionsService) {}

  @Post()
  @RequirePermissions('ADM:permissions:manage:tenant')
  @ApiOperation({ summary: 'Create permission', description: 'Create a new permission in the system' })
  @ApiResponse({ status: 201, description: 'Permission successfully created' })
  @ApiResponse({ status: 409, description: 'Permission code already exists' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  create(@Body() dto: CreatePermissionDto, @CurrentUser() user: any) {
    return this.permissionsService.create(dto, user.tenantId, user.userId);
  }

  @Get()
  @RequirePermissions('ADM:permissions:read:tenant')
  @ApiOperation({ summary: 'List permissions', description: 'Get paginated list of permissions' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'search', required: false, example: 'users' })
  @ApiResponse({ status: 200, description: 'Permissions retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  findAll(@Query() pagination: PaginationDto, @CurrentUser() user: any) {
    return this.permissionsService.findAll(user.tenantId, pagination);
  }

  @Get('by-module/:module')
  @RequirePermissions('ADM:permissions:read:tenant')
  @ApiOperation({ summary: 'Get permissions by module', description: 'Get all permissions for a specific module' })
  @ApiParam({ name: 'module', example: 'ADM', description: 'Module code' })
  @ApiResponse({ status: 200, description: 'Permissions retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  findByModule(@Param('module') module: string, @CurrentUser() user: any) {
    return this.permissionsService.findByModule(module, user.tenantId);
  }

  @Get(':id')
  @RequirePermissions('ADM:permissions:read:tenant')
  @ApiOperation({ summary: 'Get permission', description: 'Get permission details by ID' })
  @ApiResponse({ status: 200, description: 'Permission retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Permission not found' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  findOne(@Param('id') id: string) {
    return this.permissionsService.findOne(id);
  }

  @Patch(':id')
  @RequirePermissions('ADM:permissions:manage:tenant')
  @ApiOperation({ summary: 'Update permission', description: 'Update permission information' })
  @ApiResponse({ status: 200, description: 'Permission updated successfully' })
  @ApiResponse({ status: 404, description: 'Permission not found' })
  @ApiResponse({ status: 409, description: 'Cannot modify system permissions' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  update(@Param('id') id: string, @Body() dto: UpdatePermissionDto) {
    return this.permissionsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermissions('ADM:permissions:manage:tenant')
  @ApiOperation({ summary: 'Delete permission', description: 'Soft delete a permission' })
  @ApiResponse({ status: 200, description: 'Permission deleted successfully' })
  @ApiResponse({ status: 404, description: 'Permission not found' })
  @ApiResponse({ status: 409, description: 'Cannot delete system permissions' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  remove(@Param('id') id: string) {
    return this.permissionsService.remove(id);
  }
}