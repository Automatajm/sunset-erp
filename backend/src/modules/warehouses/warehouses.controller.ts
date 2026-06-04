import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiResponse } from '@nestjs/swagger';
import { WarehousesService } from './warehouses.service';
import { CreateWarehouseDto } from './dto/create-warehouse.dto';
import { UpdateWarehouseDto } from './dto/update-warehouse.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('Warehouses')
@Controller('warehouses')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('JWT-auth')
export class WarehousesController {
  constructor(private readonly warehousesService: WarehousesService) {}

  @Post()
  @RequirePermissions('INVENTORY:CREATE')
  @ApiOperation({ summary: 'Create a new warehouse' })
  @ApiResponse({ status: 201, description: 'Warehouse created successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  async create(@Request() req, @Body() dto: CreateWarehouseDto) {
    return this.warehousesService.create(req.user.tenantId, req.user.id, dto);
  }

  @Get()
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get all warehouses with stock and zone counts' })
  @ApiResponse({ status: 200, description: 'Enriched list of warehouses (capacity + occupancy)' })
  async findAll(@Request() req) {
    return this.warehousesService.findAll(req.user.tenantId);
  }

  @Get(':id')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get warehouse by ID' })
  @ApiParam({ name: 'id', description: 'Warehouse UUID' })
  @ApiResponse({ status: 200, description: 'Warehouse details with stock and zone counts' })
  @ApiResponse({ status: 404, description: 'Warehouse not found' })
  async findOne(@Request() req, @Param('id') id: string) {
    return this.warehousesService.findOne(req.user.tenantId, id);
  }

  @Get(':id/location-tree')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get full Zone->Aisle->Rack->Level->Bin hierarchy' })
  @ApiParam({ name: 'id', description: 'Warehouse UUID' })
  @ApiResponse({ status: 200, description: 'Nested Zone/Aisle/Rack/Level/Bin location tree' })
  @ApiResponse({ status: 404, description: 'Warehouse not found' })
  async getLocationTree(@Request() req, @Param('id') id: string) {
    return this.warehousesService.getLocationTree(req.user.tenantId, id);
  }

  @Get(':id/stats')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get warehouse capacity and stock stats' })
  @ApiParam({ name: 'id', description: 'Warehouse UUID' })
  @ApiResponse({ status: 200, description: 'Capacity, stock, and location counts' })
  @ApiResponse({ status: 404, description: 'Warehouse not found' })
  async getStats(@Request() req, @Param('id') id: string) {
    return this.warehousesService.getStats(req.user.tenantId, id);
  }

  @Patch(':id')
  @RequirePermissions('INVENTORY:EDIT')
  @ApiOperation({ summary: 'Update warehouse' })
  @ApiParam({ name: 'id', description: 'Warehouse UUID' })
  @ApiResponse({ status: 200, description: 'Warehouse updated successfully' })
  @ApiResponse({ status: 404, description: 'Warehouse not found' })
  async update(@Request() req, @Param('id') id: string, @Body() dto: UpdateWarehouseDto) {
    return this.warehousesService.update(req.user.tenantId, req.user.id, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('INVENTORY:DELETE')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete warehouse (soft delete)' })
  @ApiParam({ name: 'id', description: 'Warehouse UUID' })
  @ApiResponse({ status: 200, description: 'Warehouse deleted successfully' })
  @ApiResponse({ status: 404, description: 'Warehouse not found' })
  async remove(@Request() req, @Param('id') id: string) {
    return this.warehousesService.remove(req.user.tenantId, req.user.id, id);
  }
}
