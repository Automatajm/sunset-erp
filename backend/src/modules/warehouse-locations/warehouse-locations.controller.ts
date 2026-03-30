// ─────────────────────────────────────────────────────────────────────────────
// FILE: backend/src/modules/warehouse-locations/warehouse-locations.controller.ts
// ─────────────────────────────────────────────────────────────────────────────
import {
  Controller, Get, Post, Body, Patch, Param,
  Delete, UseGuards, Request, HttpCode, HttpStatus,
} from '@nestjs/common';
import {
  ApiTags, ApiOperation, ApiBearerAuth,
  ApiResponse, ApiParam,
} from '@nestjs/swagger';
import { WarehouseLocationsService } from './warehouse-locations.service';
import { CreateZoneDto }  from './dto/create-zone.dto';
import { UpdateZoneDto }  from './dto/update-zone.dto';
import { CreateAisleDto } from './dto/create-aisle.dto';
import { UpdateAisleDto } from './dto/update-aisle.dto';
import { CreateRackDto }  from './dto/create-rack.dto';
import { UpdateRackDto }  from './dto/update-rack.dto';
import { CreateLevelDto } from './dto/create-level.dto';
import { UpdateLevelDto } from './dto/update-level.dto';
import { CreateBinDto }   from './dto/create-bin.dto';
import { UpdateBinDto }   from './dto/update-bin.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('Warehouse Locations')
@Controller('warehouse-locations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('JWT-auth')
export class WarehouseLocationsController {
  constructor(private readonly warehouseLocationsService: WarehouseLocationsService) {}

  // ── ZONES ──────────────────────────────────────────────────────────────────

  @Post('zones')
  @RequirePermissions('INVENTORY:CREATE')
  @ApiOperation({ summary: 'Create a zone in a warehouse' })
  @ApiResponse({ status: 201, description: 'Zone created successfully' })
  @ApiResponse({ status: 404, description: 'Warehouse not found' })
  @ApiResponse({ status: 409, description: 'Zone code already exists in this warehouse' })
  async createZone(@Request() req, @Body() dto: CreateZoneDto) {
    return this.warehouseLocationsService.createZone(req.user.tenantId, req.user.id, dto);
  }

  @Get('zones/by-warehouse/:warehouseId')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get all zones for a warehouse' })
  @ApiParam({ name: 'warehouseId', description: 'Warehouse UUID' })
  @ApiResponse({ status: 200, description: 'List of zones with aisle counts' })
  async findZones(@Request() req, @Param('warehouseId') warehouseId: string) {
    return this.warehouseLocationsService.findZones(req.user.tenantId, warehouseId);
  }

  @Patch('zones/:id')
  @RequirePermissions('INVENTORY:EDIT')
  @ApiOperation({ summary: 'Update a zone' })
  @ApiParam({ name: 'id', description: 'Zone UUID' })
  @ApiResponse({ status: 200, description: 'Zone updated successfully' })
  @ApiResponse({ status: 404, description: 'Zone not found' })
  async updateZone(@Request() req, @Param('id') id: string, @Body() dto: UpdateZoneDto) {
    return this.warehouseLocationsService.updateZone(req.user.tenantId, req.user.id, id, dto);
  }

  @Delete('zones/:id')
  @RequirePermissions('INVENTORY:DELETE')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a zone (soft delete)' })
  @ApiParam({ name: 'id', description: 'Zone UUID' })
  @ApiResponse({ status: 200, description: 'Zone deleted successfully' })
  @ApiResponse({ status: 404, description: 'Zone not found' })
  async removeZone(@Request() req, @Param('id') id: string) {
    return this.warehouseLocationsService.removeZone(req.user.tenantId, req.user.id, id);
  }

  // ── AISLES ─────────────────────────────────────────────────────────────────

  @Post('aisles')
  @RequirePermissions('INVENTORY:CREATE')
  @ApiOperation({ summary: 'Create an aisle in a zone. fullCode auto-generated: ZONE-AISLE' })
  @ApiResponse({ status: 201, description: 'Aisle created successfully' })
  @ApiResponse({ status: 404, description: 'Zone not found' })
  @ApiResponse({ status: 409, description: 'Aisle code already exists in this zone' })
  async createAisle(@Request() req, @Body() dto: CreateAisleDto) {
    return this.warehouseLocationsService.createAisle(req.user.tenantId, req.user.id, dto);
  }

  @Get('aisles/by-zone/:zoneId')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get all aisles for a zone' })
  @ApiParam({ name: 'zoneId', description: 'Zone UUID' })
  @ApiResponse({ status: 200, description: 'List of aisles with rack counts' })
  async findAisles(@Request() req, @Param('zoneId') zoneId: string) {
    return this.warehouseLocationsService.findAisles(req.user.tenantId, zoneId);
  }

  @Patch('aisles/:id')
  @RequirePermissions('INVENTORY:EDIT')
  @ApiOperation({ summary: 'Update an aisle' })
  @ApiParam({ name: 'id', description: 'Aisle UUID' })
  @ApiResponse({ status: 200, description: 'Aisle updated successfully' })
  @ApiResponse({ status: 404, description: 'Aisle not found' })
  async updateAisle(@Request() req, @Param('id') id: string, @Body() dto: UpdateAisleDto) {
    return this.warehouseLocationsService.updateAisle(req.user.tenantId, req.user.id, id, dto);
  }

  @Delete('aisles/:id')
  @RequirePermissions('INVENTORY:DELETE')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete an aisle (soft delete)' })
  @ApiParam({ name: 'id', description: 'Aisle UUID' })
  @ApiResponse({ status: 200, description: 'Aisle deleted successfully' })
  @ApiResponse({ status: 404, description: 'Aisle not found' })
  async removeAisle(@Request() req, @Param('id') id: string) {
    return this.warehouseLocationsService.removeAisle(req.user.tenantId, req.user.id, id);
  }

  // ── RACKS ──────────────────────────────────────────────────────────────────

  @Post('racks')
  @RequirePermissions('INVENTORY:CREATE')
  @ApiOperation({ summary: 'Create a rack in an aisle. fullCode auto-generated: ZONE-AISLE-RACK' })
  @ApiResponse({ status: 201, description: 'Rack created successfully' })
  @ApiResponse({ status: 404, description: 'Aisle not found' })
  @ApiResponse({ status: 409, description: 'Rack code already exists in this aisle' })
  async createRack(@Request() req, @Body() dto: CreateRackDto) {
    return this.warehouseLocationsService.createRack(req.user.tenantId, req.user.id, dto);
  }

  @Get('racks/by-aisle/:aisleId')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get all racks for an aisle' })
  @ApiParam({ name: 'aisleId', description: 'Aisle UUID' })
  @ApiResponse({ status: 200, description: 'List of racks with level counts' })
  async findRacks(@Request() req, @Param('aisleId') aisleId: string) {
    return this.warehouseLocationsService.findRacks(req.user.tenantId, aisleId);
  }

  @Patch('racks/:id')
  @RequirePermissions('INVENTORY:EDIT')
  @ApiOperation({ summary: 'Update a rack' })
  @ApiParam({ name: 'id', description: 'Rack UUID' })
  @ApiResponse({ status: 200, description: 'Rack updated successfully' })
  @ApiResponse({ status: 404, description: 'Rack not found' })
  async updateRack(@Request() req, @Param('id') id: string, @Body() dto: UpdateRackDto) {
    return this.warehouseLocationsService.updateRack(req.user.tenantId, req.user.id, id, dto);
  }

  @Delete('racks/:id')
  @RequirePermissions('INVENTORY:DELETE')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a rack (soft delete)' })
  @ApiParam({ name: 'id', description: 'Rack UUID' })
  @ApiResponse({ status: 200, description: 'Rack deleted successfully' })
  @ApiResponse({ status: 404, description: 'Rack not found' })
  async removeRack(@Request() req, @Param('id') id: string) {
    return this.warehouseLocationsService.removeRack(req.user.tenantId, req.user.id, id);
  }

  // ── LEVELS ─────────────────────────────────────────────────────────────────

  @Post('levels')
  @RequirePermissions('INVENTORY:CREATE')
  @ApiOperation({ summary: 'Create a level in a rack. fullCode auto-generated: ZONE-AISLE-RACK-LEVEL' })
  @ApiResponse({ status: 201, description: 'Level created successfully' })
  @ApiResponse({ status: 404, description: 'Rack not found' })
  @ApiResponse({ status: 409, description: 'Level code already exists in this rack' })
  async createLevel(@Request() req, @Body() dto: CreateLevelDto) {
    return this.warehouseLocationsService.createLevel(req.user.tenantId, req.user.id, dto);
  }

  @Get('levels/by-rack/:rackId')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get all levels for a rack' })
  @ApiParam({ name: 'rackId', description: 'Rack UUID' })
  @ApiResponse({ status: 200, description: 'List of levels with bin and stock counts' })
  async findLevels(@Request() req, @Param('rackId') rackId: string) {
    return this.warehouseLocationsService.findLevels(req.user.tenantId, rackId);
  }

  @Patch('levels/:id')
  @RequirePermissions('INVENTORY:EDIT')
  @ApiOperation({ summary: 'Update a level' })
  @ApiParam({ name: 'id', description: 'Level UUID' })
  @ApiResponse({ status: 200, description: 'Level updated successfully' })
  @ApiResponse({ status: 404, description: 'Level not found' })
  async updateLevel(@Request() req, @Param('id') id: string, @Body() dto: UpdateLevelDto) {
    return this.warehouseLocationsService.updateLevel(req.user.tenantId, req.user.id, id, dto);
  }

  @Delete('levels/:id')
  @RequirePermissions('INVENTORY:DELETE')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a level (soft delete). Fails if active bins exist.' })
  @ApiParam({ name: 'id', description: 'Level UUID' })
  @ApiResponse({ status: 200, description: 'Level deleted successfully' })
  @ApiResponse({ status: 400, description: 'Cannot delete — active bins exist' })
  @ApiResponse({ status: 404, description: 'Level not found' })
  async removeLevel(@Request() req, @Param('id') id: string) {
    return this.warehouseLocationsService.removeLevel(req.user.tenantId, req.user.id, id);
  }

  // ── BINS ───────────────────────────────────────────────────────────────────

  @Post('bins')
  @RequirePermissions('INVENTORY:CREATE')
  @ApiOperation({ summary: 'Create a bin in a level. fullCode auto-generated: ZONE-AISLE-RACK-LEVEL-BIN' })
  @ApiResponse({ status: 201, description: 'Bin created successfully' })
  @ApiResponse({ status: 404, description: 'Level not found' })
  @ApiResponse({ status: 409, description: 'Bin code already exists in this level' })
  async createBin(@Request() req, @Body() dto: CreateBinDto) {
    return this.warehouseLocationsService.createBin(req.user.tenantId, req.user.id, dto);
  }

  @Get('bins/by-level/:levelId')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get all bins for a level' })
  @ApiParam({ name: 'levelId', description: 'Level UUID' })
  @ApiResponse({ status: 200, description: 'List of bins with stock line counts' })
  async findBins(@Request() req, @Param('levelId') levelId: string) {
    return this.warehouseLocationsService.findBins(req.user.tenantId, levelId);
  }

  @Patch('bins/:id')
  @RequirePermissions('INVENTORY:EDIT')
  @ApiOperation({ summary: 'Update a bin' })
  @ApiParam({ name: 'id', description: 'Bin UUID' })
  @ApiResponse({ status: 200, description: 'Bin updated successfully' })
  @ApiResponse({ status: 404, description: 'Bin not found' })
  async updateBin(@Request() req, @Param('id') id: string, @Body() dto: UpdateBinDto) {
    return this.warehouseLocationsService.updateBin(req.user.tenantId, req.user.id, id, dto);
  }

  @Delete('bins/:id')
  @RequirePermissions('INVENTORY:DELETE')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a bin (soft delete). Fails if stock on hand > 0.' })
  @ApiParam({ name: 'id', description: 'Bin UUID' })
  @ApiResponse({ status: 200, description: 'Bin deleted successfully' })
  @ApiResponse({ status: 400, description: 'Cannot delete — stock on hand exists' })
  @ApiResponse({ status: 404, description: 'Bin not found' })
  async removeBin(@Request() req, @Param('id') id: string) {
    return this.warehouseLocationsService.removeBin(req.user.tenantId, req.user.id, id);
  }
}