import {
  Controller, Get, Post, Body, Patch, Param,
  Delete, UseGuards, Request, HttpCode, HttpStatus, Query,
} from '@nestjs/common';
import {
  ApiTags, ApiOperation, ApiBearerAuth,
  ApiResponse, ApiParam, ApiQuery,
} from '@nestjs/swagger';
import { BomService } from './bom.service';
import { CreateBomDto } from './dto/create-bom.dto';
import { UpdateBomDto } from './dto/update-bom.dto';
import { CreateBomRoutingDto, UpdateBomRoutingDto } from './dto/bom-routing.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('Bill of Materials (BOM)')
@Controller('bom')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('JWT-auth')
export class BomController {
  constructor(private readonly bomService: BomService) {}

  // ── BOM CRUD ──────────────────────────────────

  @Post()
  @RequirePermissions('INVENTORY:CREATE')
  @ApiOperation({ summary: 'Create a new BOM with components' })
  @ApiResponse({ status: 201, description: 'BOM created' })
  @ApiResponse({ status: 409, description: 'BOM code already exists' })
  async create(@Request() req, @Body() dto: CreateBomDto) {
    return this.bomService.create(req.user.tenantId, req.user.id, dto);
  }

  @Get()
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'List all BOMs' })
  @ApiQuery({ name: 'itemId', required: false, description: 'Filter by parent item UUID' })
  async findAll(@Request() req, @Query('itemId') itemId?: string) {
    return this.bomService.findAll(req.user.tenantId, itemId);
  }

  @Get(':id')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get BOM by ID — includes components and routing steps' })
  @ApiParam({ name: 'id', description: 'BOM UUID' })
  async findOne(@Request() req, @Param('id') id: string) {
    return this.bomService.findOne(req.user.tenantId, id);
  }

  @Get(':id/calculate/:quantity')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Calculate material requirements for a production quantity' })
  @ApiParam({ name: 'id', description: 'BOM UUID' })
  @ApiParam({ name: 'quantity', description: 'Production quantity' })
  async calculateRequirements(
    @Request() req,
    @Param('id') id: string,
    @Param('quantity') quantity: string,
  ) {
    return this.bomService.calculateMaterialRequirements(req.user.tenantId, id, parseFloat(quantity));
  }

  @Patch(':id')
  @RequirePermissions('INVENTORY:EDIT')
  @ApiOperation({ summary: 'Update BOM header' })
  @ApiParam({ name: 'id', description: 'BOM UUID' })
  async update(@Request() req, @Param('id') id: string, @Body() dto: UpdateBomDto) {
    return this.bomService.update(req.user.tenantId, req.user.id, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('INVENTORY:DELETE')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete BOM (soft delete)' })
  @ApiParam({ name: 'id', description: 'BOM UUID' })
  async remove(@Request() req, @Param('id') id: string) {
    return this.bomService.remove(req.user.tenantId, req.user.id, id);
  }

  // ── ROUTING STEPS ─────────────────────────────

  @Post(':id/routing')
  @RequirePermissions('INVENTORY:EDIT')
  @ApiOperation({
    summary: 'Add routing step to BOM',
    description: 'Defines a production step with work center, setup time, and run time per unit.',
  })
  @ApiParam({ name: 'id', description: 'BOM UUID' })
  @ApiResponse({ status: 201, description: 'Routing step added' })
  @ApiResponse({ status: 409, description: 'Step number already exists' })
  @HttpCode(HttpStatus.CREATED)
  async addRoutingStep(@Request() req, @Param('id') id: string, @Body() dto: CreateBomRoutingDto) {
    return this.bomService.addRoutingStep(req.user.tenantId, req.user.id, id, dto);
  }

  @Get(':id/routing')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get all routing steps for a BOM ordered by step number' })
  @ApiParam({ name: 'id', description: 'BOM UUID' })
  async getRoutingSteps(@Request() req, @Param('id') id: string) {
    return this.bomService.getRoutingSteps(req.user.tenantId, id);
  }

  @Patch(':id/routing/:stepId')
  @RequirePermissions('INVENTORY:EDIT')
  @ApiOperation({ summary: 'Update a routing step' })
  @ApiParam({ name: 'id', description: 'BOM UUID' })
  @ApiParam({ name: 'stepId', description: 'Routing step UUID' })
  async updateRoutingStep(
    @Request() req,
    @Param('id') id: string,
    @Param('stepId') stepId: string,
    @Body() dto: UpdateBomRoutingDto,
  ) {
    return this.bomService.updateRoutingStep(req.user.tenantId, req.user.id, id, stepId, dto);
  }

  @Delete(':id/routing/:stepId')
  @RequirePermissions('INVENTORY:EDIT')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete a routing step (soft delete)' })
  @ApiParam({ name: 'id', description: 'BOM UUID' })
  @ApiParam({ name: 'stepId', description: 'Routing step UUID' })
  async removeRoutingStep(
    @Request() req,
    @Param('id') id: string,
    @Param('stepId') stepId: string,
  ) {
    return this.bomService.removeRoutingStep(req.user.tenantId, req.user.id, id, stepId);
  }

  // ── LABOR ESTIMATE ────────────────────────────

  @Get(':id/routing/labor-estimate/:quantity')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({
    summary: 'Calculate labor estimate for a production quantity',
    description: 'Uses routing steps + work center cost rates to estimate total hours and cost. Used by Budget Auto-generation (Sprint 8) and MO labor suggestions.',
  })
  @ApiParam({ name: 'id', description: 'BOM UUID' })
  @ApiParam({ name: 'quantity', description: 'Production quantity' })
  @ApiResponse({ status: 200, description: 'Labor estimate with step breakdown' })
  async getLaborEstimate(
    @Request() req,
    @Param('id') id: string,
    @Param('quantity') quantity: string,
  ) {
    return this.bomService.getLaborEstimate(req.user.tenantId, id, parseFloat(quantity));
  }

  // ── MATERIAL SUGGESTIONS ──────────────────────

  @Get(':id/material-suggestions/:quantity')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({
    summary: 'Get material suggestions for a production quantity',
    description: 'Returns BOM components × quantity with scrap included. Used to pre-fill MO material actuals.',
  })
  @ApiParam({ name: 'id', description: 'BOM UUID' })
  @ApiParam({ name: 'quantity', description: 'Production quantity' })
  @ApiResponse({ status: 200, description: 'Material suggestions with quantities including scrap' })
  async getMaterialSuggestions(
    @Request() req,
    @Param('id') id: string,
    @Param('quantity') quantity: string,
  ) {
    return this.bomService.getMaterialSuggestions(req.user.tenantId, id, parseFloat(quantity));
  }
}