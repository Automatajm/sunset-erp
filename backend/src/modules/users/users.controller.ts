// ============================================================================
// FILE: backend/src/modules/users/users.controller.ts
// ============================================================================
import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiResponse } from '@nestjs/swagger';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { AssignRolesDto } from './dto/assign-roles.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('JWT-auth')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  @RequirePermissions('ADMIN:USERS')
  @ApiOperation({ summary: 'List all users in tenant with their roles' })
  @ApiResponse({ status: 200, description: '{ users: [...], count: n }' })
  async findAll(@Request() req) {
    return this.usersService.findAll(req.user.tenantId);
  }

  @Get(':id')
  @RequirePermissions('ADMIN:USERS')
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiOperation({ summary: 'Get single user detail' })
  @ApiResponse({ status: 200, description: 'User detail with roles' })
  @ApiResponse({ status: 404, description: 'User not found in this tenant' })
  async findOne(@Request() req, @Param('id') id: string) {
    return this.usersService.findOne(req.user.tenantId, id);
  }

  @Post()
  @RequirePermissions('ADMIN:USERS')
  @ApiOperation({ summary: 'Create user and add to tenant. If email exists, adds to tenant.' })
  @ApiResponse({ status: 201, description: 'User created / added to tenant' })
  @ApiResponse({ status: 409, description: 'User already exists in this tenant' })
  @ApiResponse({ status: 400, description: 'Validation error or roles not in tenant' })
  async create(@Request() req, @Body() dto: CreateUserDto) {
    return this.usersService.create(req.user.tenantId, req.user.id, dto);
  }

  @Patch(':id')
  @RequirePermissions('ADMIN:USERS')
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiOperation({ summary: 'Update user name / phone / status' })
  @ApiResponse({ status: 200, description: 'User updated' })
  @ApiResponse({ status: 404, description: 'User not found in this tenant' })
  async update(@Request() req, @Param('id') id: string, @Body() dto: UpdateUserDto) {
    return this.usersService.update(req.user.tenantId, id, dto);
  }

  @Patch(':id/activate')
  @RequirePermissions('ADMIN:USERS')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiOperation({ summary: 'Activate user in this tenant' })
  @ApiResponse({ status: 200, description: 'User activated' })
  @ApiResponse({ status: 404, description: 'User not found in this tenant' })
  async activate(@Request() req, @Param('id') id: string) {
    return this.usersService.setActive(req.user.tenantId, id, true, req.user.id);
  }

  @Patch(':id/deactivate')
  @RequirePermissions('ADMIN:USERS')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiOperation({ summary: 'Deactivate user in this tenant' })
  @ApiResponse({ status: 200, description: 'User deactivated' })
  @ApiResponse({ status: 400, description: 'Self-deactivation or last-admin lock-out' })
  @ApiResponse({ status: 404, description: 'User not found in this tenant' })
  async deactivate(@Request() req, @Param('id') id: string) {
    return this.usersService.setActive(req.user.tenantId, id, false, req.user.id);
  }

  @Patch(':id/roles')
  @RequirePermissions('ADMIN:USERS')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiOperation({ summary: 'Replace all roles for user in this tenant' })
  @ApiResponse({ status: 200, description: 'Roles replaced, permission cache cleared' })
  @ApiResponse({ status: 400, description: 'One or more roles not in this tenant' })
  async assignRoles(@Request() req, @Param('id') id: string, @Body() dto: AssignRolesDto) {
    return this.usersService.assignRoles(req.user.tenantId, id, dto.roleIds);
  }

  @Patch(':id/reset-password')
  @RequirePermissions('ADMIN:USERS')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', description: 'User UUID' })
  @ApiOperation({ summary: 'Admin reset password for a user' })
  @ApiResponse({ status: 200, description: 'Password reset' })
  @ApiResponse({ status: 404, description: 'User not found in this tenant' })
  async resetPassword(@Request() req, @Param('id') id: string, @Body() dto: ResetPasswordDto) {
    return this.usersService.resetPassword(req.user.tenantId, id, dto.newPassword);
  }
}
