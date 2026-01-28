import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Delete,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { StatusService } from './status.service';
import {
  CreateStatusGroupDto,
  UpdateStatusGroupDto,
  CreateStatusDto,
  UpdateStatusDto,
  QueryStatusGroupsDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Status System')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('status')
export class StatusController {
  constructor(private readonly statusService: StatusService) {}

  // ============================================
  // STATUS GROUPS ENDPOINTS
  // ============================================

  @Post('groups')
  @RequirePermissions('MDM:status:create:tenant')
  @ApiOperation({ summary: 'Create new status group' })
  @ApiResponse({ status: 201, description: 'Status group created' })
  @ApiResponse({ status: 409, description: 'Status group code already exists' })
  createGroup(
    @CurrentUser() user: any,
    @Body() createGroupDto: CreateStatusGroupDto,
  ) {
    return this.statusService.createGroup(user.tenantId, user.userId, createGroupDto);
  }

  @Get('groups')
  @RequirePermissions('MDM:status:read:tenant')
  @ApiOperation({ summary: 'Get all status groups' })
  @ApiResponse({ status: 200, description: 'Status groups retrieved' })
  findAllGroups(
    @CurrentUser() user: any,
    @Query() query: QueryStatusGroupsDto,
  ) {
    return this.statusService.findAllGroups(user.tenantId, query);
  }

  @Get('groups/:code')
  @RequirePermissions('MDM:status:read:tenant')
  @ApiOperation({ summary: 'Get status group by code with statuses and transitions' })
  @ApiParam({ name: 'code', example: 'INV_RECEIPTS' })
  @ApiResponse({ status: 200, description: 'Status group found' })
  @ApiResponse({ status: 404, description: 'Status group not found' })
  findGroupByCode(@Param('code') code: string) {
    return this.statusService.findGroupByCode(code);
  }

  @Patch('groups/:code')
  @RequirePermissions('MDM:status:update:tenant')
  @ApiOperation({ summary: 'Update status group' })
  @ApiParam({ name: 'code', example: 'INV_RECEIPTS' })
  @ApiResponse({ status: 200, description: 'Status group updated' })
  @ApiResponse({ status: 404, description: 'Status group not found' })
  updateGroup(
    @Param('code') code: string,
    @Body() updateGroupDto: UpdateStatusGroupDto,
  ) {
    return this.statusService.updateGroup(code, updateGroupDto);
  }

  @Delete('groups/:code')
  @RequirePermissions('MDM:status:delete:tenant')
  @ApiOperation({ summary: 'Delete status group (soft delete)' })
  @ApiParam({ name: 'code', example: 'CUSTOM_GROUP' })
  @ApiResponse({ status: 200, description: 'Status group deleted' })
  @ApiResponse({ status: 400, description: 'Cannot delete system group or group with statuses' })
  deleteGroup(@Param('code') code: string) {
    return this.statusService.deleteGroup(code);
  }

  // ============================================
  // STATUSES ENDPOINTS
  // ============================================

  @Post('groups/:groupCode/statuses')
  @RequirePermissions('MDM:status:create:tenant')
  @ApiOperation({ summary: 'Create new status in group' })
  @ApiParam({ name: 'groupCode', example: 'INV_RECEIPTS' })
  @ApiResponse({ status: 201, description: 'Status created' })
  @ApiResponse({ status: 409, description: 'Status code already exists' })
  createStatus(
    @CurrentUser() user: any,
    @Param('groupCode') groupCode: string,
    @Body() createStatusDto: CreateStatusDto,
  ) {
    return this.statusService.createStatus(
      groupCode,
      user.tenantId,
      user.userId,
      createStatusDto,
    );
  }

  @Get('groups/:groupCode/statuses')
  @RequirePermissions('MDM:status:read:tenant')
  @ApiOperation({ summary: 'Get all statuses in group' })
  @ApiParam({ name: 'groupCode', example: 'INV_RECEIPTS' })
  @ApiResponse({ status: 200, description: 'Statuses retrieved' })
  getStatusesByGroup(@Param('groupCode') groupCode: string) {
    return this.statusService.getStatusesByGroup(groupCode);
  }

  @Patch('groups/:groupCode/statuses/:statusCode')
  @RequirePermissions('MDM:status:update:tenant')
  @ApiOperation({ summary: 'Update status' })
  @ApiParam({ name: 'groupCode', example: 'INV_RECEIPTS' })
  @ApiParam({ name: 'statusCode', example: 'DRAFT' })
  @ApiResponse({ status: 200, description: 'Status updated' })
  @ApiResponse({ status: 404, description: 'Status not found' })
  updateStatus(
    @Param('groupCode') groupCode: string,
    @Param('statusCode') statusCode: string,
    @Body() updateStatusDto: UpdateStatusDto,
  ) {
    return this.statusService.updateStatus(groupCode, statusCode, updateStatusDto);
  }

  @Delete('groups/:groupCode/statuses/:statusCode')
  @RequirePermissions('MDM:status:delete:tenant')
  @ApiOperation({ summary: 'Delete status (soft delete)' })
  @ApiParam({ name: 'groupCode', example: 'INV_RECEIPTS' })
  @ApiParam({ name: 'statusCode', example: 'CUSTOM_STATUS' })
  @ApiResponse({ status: 200, description: 'Status deleted' })
  @ApiResponse({ status: 400, description: 'Cannot delete system status' })
  deleteStatus(
    @Param('groupCode') groupCode: string,
    @Param('statusCode') statusCode: string,
  ) {
    return this.statusService.deleteStatus(groupCode, statusCode);
  }
}
