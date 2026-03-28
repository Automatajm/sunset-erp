// --- consumption-groups/consumption-groups.controller.ts ---
import { Controller, Get, Post, Patch, Delete, Body, Param, UseGuards, Request, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiResponse } from '@nestjs/swagger';
import { ConsumptionGroupsService } from './consumption-groups.service';
import { CreateConsumptionGroupDto } from './dto/create-consumption-group.dto';
import { UpdateConsumptionGroupDto } from './dto/update-consumption-group.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
 
@ApiTags('Consumption Groups')
@Controller('consumption-groups')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('JWT-auth')
export class ConsumptionGroupsController {
  constructor(private readonly consumptionGroupsService: ConsumptionGroupsService) {}
 
  @Post()
  @RequirePermissions('INVENTORY:CREATE')
  @ApiOperation({ summary: 'Create consumption group' })
  @ApiResponse({ status: 201, description: 'Consumption group created successfully' })
  @ApiResponse({ status: 409, description: 'Code already exists' })
  async create(@Request() req, @Body() dto: CreateConsumptionGroupDto) {
    return this.consumptionGroupsService.create(req.user.tenantId, req.user.id, dto);
  }
 
  @Get()
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get all consumption groups' })
  @ApiResponse({ status: 200, description: 'List of consumption groups with UOM and item counts' })
  async findAll(@Request() req) {
    return this.consumptionGroupsService.findAll(req.user.tenantId);
  }
 
  @Get(':id')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get consumption group with items and total ATP in consumption UOM' })
  @ApiParam({ name: 'id', description: 'ConsumptionGroup UUID' })
  @ApiResponse({ status: 200, description: 'Consumption group with aggregated stock qty' })
  @ApiResponse({ status: 404, description: 'Consumption group not found' })
  async findOne(@Request() req, @Param('id') id: string) {
    return this.consumptionGroupsService.findOne(req.user.tenantId, id);
  }
 
  @Patch(':id')
  @RequirePermissions('INVENTORY:EDIT')
  @ApiOperation({ summary: 'Update consumption group' })
  @ApiParam({ name: 'id', description: 'ConsumptionGroup UUID' })
  @ApiResponse({ status: 200, description: 'Consumption group updated successfully' })
  @ApiResponse({ status: 404, description: 'Consumption group not found' })
  async update(@Request() req, @Param('id') id: string, @Body() dto: UpdateConsumptionGroupDto) {
    return this.consumptionGroupsService.update(req.user.tenantId, req.user.id, id, dto);
  }
 
  @Delete(':id')
  @RequirePermissions('INVENTORY:DELETE')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete consumption group (soft delete)' })
  @ApiParam({ name: 'id', description: 'ConsumptionGroup UUID' })
  @ApiResponse({ status: 200, description: 'Consumption group deleted successfully' })
  @ApiResponse({ status: 404, description: 'Consumption group not found' })
  async remove(@Request() req, @Param('id') id: string) {
    return this.consumptionGroupsService.remove(req.user.tenantId, req.user.id, id);
  }
}