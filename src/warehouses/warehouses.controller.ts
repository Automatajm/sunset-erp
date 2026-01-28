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
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { WarehousesService } from './warehouses.service';
import {
  CreateWarehouseDto,
  UpdateWarehouseDto,
  CreateWarehouseLocationDto,
  UpdateWarehouseLocationDto,
  QueryWarehousesDto,
} from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { RequirePermissions } from '../auth/decorators/permissions.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('Warehouses')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('warehouses')
export class WarehousesController {
  constructor(private readonly warehousesService: WarehousesService) {}

  // ============================================
  // WAREHOUSES ENDPOINTS
  // ============================================

  @Post()
  @RequirePermissions('INV:warehouses:create:tenant')
  @ApiOperation({ summary: 'Create new warehouse' })
  @ApiResponse({ status: 201, description: 'Warehouse created successfully' })
  @ApiResponse({ status: 409, description: 'Warehouse code already exists' })
  create(
    @CurrentUser() user: any,
    @Body() createWarehouseDto: CreateWarehouseDto,
  ) {
    return this.warehousesService.create(
      user.tenantId,
      user.userId,
      createWarehouseDto,
    );
  }

  @Get()
  @RequirePermissions('INV:warehouses:read:tenant')
  @ApiOperation({ summary: 'Get all warehouses with filters' })
  @ApiResponse({ status: 200, description: 'Warehouses retrieved successfully' })
  findAll(
    @CurrentUser() user: any,
    @Query() query: QueryWarehousesDto,
  ) {
    return this.warehousesService.findAll(user.tenantId, query);
  }

  @Get(':id')
  @RequirePermissions('INV:warehouses:read:tenant')
  @ApiOperation({ summary: 'Get warehouse by ID' })
  @ApiParam({ name: 'id', description: 'Warehouse ID' })
  @ApiResponse({ status: 200, description: 'Warehouse found' })
  @ApiResponse({ status: 404, description: 'Warehouse not found' })
  findOne(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.warehousesService.findOne(user.tenantId, id);
  }

  @Patch(':id')
  @RequirePermissions('INV:warehouses:update:tenant')
  @ApiOperation({ summary: 'Update warehouse' })
  @ApiParam({ name: 'id', description: 'Warehouse ID' })
  @ApiResponse({ status: 200, description: 'Warehouse updated successfully' })
  @ApiResponse({ status: 404, description: 'Warehouse not found' })
  update(
    @CurrentUser() user: any,
    @Param('id') id: string,
    @Body() updateWarehouseDto: UpdateWarehouseDto,
  ) {
    return this.warehousesService.update(
      user.tenantId,
      user.userId,
      id,
      updateWarehouseDto,
    );
  }

  @Delete(':id')
  @RequirePermissions('INV:warehouses:delete:tenant')
  @ApiOperation({ summary: 'Delete warehouse (soft delete)' })
  @ApiParam({ name: 'id', description: 'Warehouse ID' })
  @ApiResponse({ status: 200, description: 'Warehouse deleted successfully' })
  @ApiResponse({ status: 400, description: 'Cannot delete warehouse with stock' })
  @ApiResponse({ status: 404, description: 'Warehouse not found' })
  remove(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.warehousesService.remove(user.tenantId, user.userId, id);
  }

  @Get(':id/stats')
  @RequirePermissions('INV:warehouses:read:tenant')
  @ApiOperation({ summary: 'Get warehouse statistics' })
  @ApiParam({ name: 'id', description: 'Warehouse ID' })
  @ApiResponse({ status: 200, description: 'Statistics retrieved successfully' })
  getStats(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.warehousesService.getWarehouseStats(user.tenantId, id);
  }

  // ============================================
  // WAREHOUSE LOCATIONS ENDPOINTS
  // ============================================

  @Post(':warehouseId/locations')
  @RequirePermissions('INV:warehouses:update:tenant')
  @ApiOperation({ summary: 'Create warehouse location' })
  @ApiParam({ name: 'warehouseId', description: 'Warehouse ID' })
  @ApiResponse({ status: 201, description: 'Location created successfully' })
  @ApiResponse({ status: 409, description: 'Location code already exists' })
  createLocation(
    @CurrentUser() user: any,
    @Param('warehouseId') warehouseId: string,
    @Body() createLocationDto: CreateWarehouseLocationDto,
  ) {
    return this.warehousesService.createLocation(
      user.tenantId,
      warehouseId,
      createLocationDto,
    );
  }

  @Get(':warehouseId/locations')
  @RequirePermissions('INV:warehouses:read:tenant')
  @ApiOperation({ summary: 'Get all locations in warehouse' })
  @ApiParam({ name: 'warehouseId', description: 'Warehouse ID' })
  @ApiResponse({ status: 200, description: 'Locations retrieved successfully' })
  findAllLocations(
    @CurrentUser() user: any,
    @Param('warehouseId') warehouseId: string,
  ) {
    return this.warehousesService.findAllLocations(user.tenantId, warehouseId);
  }

  @Get(':warehouseId/locations/:locationId')
  @RequirePermissions('INV:warehouses:read:tenant')
  @ApiOperation({ summary: 'Get location by ID' })
  @ApiParam({ name: 'warehouseId', description: 'Warehouse ID' })
  @ApiParam({ name: 'locationId', description: 'Location ID' })
  @ApiResponse({ status: 200, description: 'Location found' })
  @ApiResponse({ status: 404, description: 'Location not found' })
  findOneLocation(
    @CurrentUser() user: any,
    @Param('warehouseId') warehouseId: string,
    @Param('locationId') locationId: string,
  ) {
    return this.warehousesService.findOneLocation(
      user.tenantId,
      warehouseId,
      locationId,
    );
  }

  @Patch(':warehouseId/locations/:locationId')
  @RequirePermissions('INV:warehouses:update:tenant')
  @ApiOperation({ summary: 'Update warehouse location' })
  @ApiParam({ name: 'warehouseId', description: 'Warehouse ID' })
  @ApiParam({ name: 'locationId', description: 'Location ID' })
  @ApiResponse({ status: 200, description: 'Location updated successfully' })
  @ApiResponse({ status: 404, description: 'Location not found' })
  updateLocation(
    @CurrentUser() user: any,
    @Param('warehouseId') warehouseId: string,
    @Param('locationId') locationId: string,
    @Body() updateLocationDto: UpdateWarehouseLocationDto,
  ) {
    return this.warehousesService.updateLocation(
      user.tenantId,
      warehouseId,
      locationId,
      updateLocationDto,
    );
  }

  @Delete(':warehouseId/locations/:locationId')
  @RequirePermissions('INV:warehouses:delete:tenant')
  @ApiOperation({ summary: 'Delete warehouse location' })
  @ApiParam({ name: 'warehouseId', description: 'Warehouse ID' })
  @ApiParam({ name: 'locationId', description: 'Location ID' })
  @ApiResponse({ status: 200, description: 'Location deleted successfully' })
  @ApiResponse({ status: 400, description: 'Cannot delete location with stock' })
  removeLocation(
    @CurrentUser() user: any,
    @Param('warehouseId') warehouseId: string,
    @Param('locationId') locationId: string,
  ) {
    return this.warehousesService.removeLocation(
      user.tenantId,
      warehouseId,
      locationId,
    );
  }
}