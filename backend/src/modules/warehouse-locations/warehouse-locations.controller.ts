import {
  Controller, Get, Post, Body, Patch, Param,
  Delete, UseGuards, Request, HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import {
  WarehouseLocationsService,
  CreateZoneDto, CreateAisleDto, CreateRackDto, CreateLevelDto, CreateBinDto,
} from './warehouse-locations.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('Warehouse Locations')
@Controller('warehouse-locations')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('JWT-auth')
export class WarehouseLocationsController {
  constructor(private readonly svc: WarehouseLocationsService) {}

  // ZONES
  @Post('zones')
  @RequirePermissions('INVENTORY:CREATE')
  @ApiOperation({ summary: 'Create zone in a warehouse' })
  createZone(@Request() req, @Body() dto: CreateZoneDto) {
    return this.svc.createZone(req.user.tenantId, req.user.id, dto);
  }

  @Get('zones/by-warehouse/:warehouseId')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get all zones for a warehouse' })
  @ApiParam({ name: 'warehouseId', description: 'Warehouse UUID' })
  findZones(@Request() req, @Param('warehouseId') warehouseId: string) {
    return this.svc.findZones(req.user.tenantId, warehouseId);
  }

  @Patch('zones/:id')
  @RequirePermissions('INVENTORY:EDIT')
  @ApiOperation({ summary: 'Update zone' })
  updateZone(@Request() req, @Param('id') id: string, @Body() dto: Partial<CreateZoneDto>) {
    return this.svc.updateZone(req.user.tenantId, req.user.id, id, dto);
  }

  @Delete('zones/:id')
  @RequirePermissions('INVENTORY:DELETE')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete zone (soft delete)' })
  removeZone(@Request() req, @Param('id') id: string) {
    return this.svc.removeZone(req.user.tenantId, req.user.id, id);
  }

  // AISLES
  @Post('aisles')
  @RequirePermissions('INVENTORY:CREATE')
  @ApiOperation({ summary: 'Create aisle in a zone. fullCode auto-generated: ZONE-AISLE' })
  createAisle(@Request() req, @Body() dto: CreateAisleDto) {
    return this.svc.createAisle(req.user.tenantId, req.user.id, dto);
  }

  @Get('aisles/by-zone/:zoneId')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get all aisles for a zone' })
  findAisles(@Request() req, @Param('zoneId') zoneId: string) {
    return this.svc.findAisles(req.user.tenantId, zoneId);
  }

  @Patch('aisles/:id')
  @RequirePermissions('INVENTORY:EDIT')
  @ApiOperation({ summary: 'Update aisle' })
  updateAisle(@Request() req, @Param('id') id: string, @Body() dto: Partial<CreateAisleDto>) {
    return this.svc.updateAisle(req.user.tenantId, req.user.id, id, dto);
  }

  @Delete('aisles/:id')
  @RequirePermissions('INVENTORY:DELETE')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete aisle (soft delete)' })
  removeAisle(@Request() req, @Param('id') id: string) {
    return this.svc.removeAisle(req.user.tenantId, req.user.id, id);
  }

  // RACKS
  @Post('racks')
  @RequirePermissions('INVENTORY:CREATE')
  @ApiOperation({ summary: 'Create rack in an aisle. fullCode auto-generated: ZONE-AISLE-RACK' })
  createRack(@Request() req, @Body() dto: CreateRackDto) {
    return this.svc.createRack(req.user.tenantId, req.user.id, dto);
  }

  @Get('racks/by-aisle/:aisleId')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get all racks for an aisle' })
  findRacks(@Request() req, @Param('aisleId') aisleId: string) {
    return this.svc.findRacks(req.user.tenantId, aisleId);
  }

  @Patch('racks/:id')
  @RequirePermissions('INVENTORY:EDIT')
  @ApiOperation({ summary: 'Update rack' })
  updateRack(@Request() req, @Param('id') id: string, @Body() dto: Partial<CreateRackDto>) {
    return this.svc.updateRack(req.user.tenantId, req.user.id, id, dto);
  }

  @Delete('racks/:id')
  @RequirePermissions('INVENTORY:DELETE')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete rack (soft delete)' })
  removeRack(@Request() req, @Param('id') id: string) {
    return this.svc.removeRack(req.user.tenantId, req.user.id, id);
  }

  // LEVELS
  @Post('levels')
  @RequirePermissions('INVENTORY:CREATE')
  @ApiOperation({ summary: 'Create level in a rack. fullCode auto-generated: ZONE-AISLE-RACK-LEVEL' })
  createLevel(@Request() req, @Body() dto: CreateLevelDto) {
    return this.svc.createLevel(req.user.tenantId, req.user.id, dto);
  }

  @Get('levels/by-rack/:rackId')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get all levels for a rack' })
  findLevels(@Request() req, @Param('rackId') rackId: string) {
    return this.svc.findLevels(req.user.tenantId, rackId);
  }

  @Patch('levels/:id')
  @RequirePermissions('INVENTORY:EDIT')
  @ApiOperation({ summary: 'Update level' })
  updateLevel(@Request() req, @Param('id') id: string, @Body() dto: Partial<CreateLevelDto>) {
    return this.svc.updateLevel(req.user.tenantId, req.user.id, id, dto);
  }

  @Delete('levels/:id')
  @RequirePermissions('INVENTORY:DELETE')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete level (soft delete). Fails if active bins exist.' })
  removeLevel(@Request() req, @Param('id') id: string) {
    return this.svc.removeLevel(req.user.tenantId, req.user.id, id);
  }

  // BINS
  @Post('bins')
  @RequirePermissions('INVENTORY:CREATE')
  @ApiOperation({ summary: 'Create bin in a level. fullCode auto-generated: ZONE-AISLE-RACK-LEVEL-BIN' })
  createBin(@Request() req, @Body() dto: CreateBinDto) {
    return this.svc.createBin(req.user.tenantId, req.user.id, dto);
  }

  @Get('bins/by-level/:levelId')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get all bins for a level' })
  findBins(@Request() req, @Param('levelId') levelId: string) {
    return this.svc.findBins(req.user.tenantId, levelId);
  }

  @Patch('bins/:id')
  @RequirePermissions('INVENTORY:EDIT')
  @ApiOperation({ summary: 'Update bin' })
  updateBin(@Request() req, @Param('id') id: string, @Body() dto: Partial<CreateBinDto>) {
    return this.svc.updateBin(req.user.tenantId, req.user.id, id, dto);
  }

  @Delete('bins/:id')
  @RequirePermissions('INVENTORY:DELETE')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete bin (soft delete). Fails if stock on hand > 0.' })
  removeBin(@Request() req, @Param('id') id: string) {
    return this.svc.removeBin(req.user.tenantId, req.user.id, id);
  }
}