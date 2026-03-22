import {
  Controller, Get, Post, Body, Patch, Param,
  Delete, UseGuards, Request, HttpCode, HttpStatus, Query,
} from '@nestjs/common';
import {
  ApiTags, ApiOperation, ApiBearerAuth,
  ApiResponse, ApiParam, ApiQuery,
} from '@nestjs/swagger';
import { ProductionOrdersService } from './production-orders.service';
import { CreateProductionOrderDto } from './dto/create-production-order.dto';
import { UpdateProductionOrderDto } from './dto/update-production-order.dto';
import {
  CreateLaborActualDto,
  CreateMaterialActualDto,
  DeliverFgDto,
  PostVarianceJeDto,
} from './dto/production-actuals.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('Production Orders')
@Controller('production-orders')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('JWT-auth')
export class ProductionOrdersController {
  constructor(private readonly productionOrdersService: ProductionOrdersService) {}

  // ── CRUD ──────────────────────────────────────

  @Post()
  @RequirePermissions('INVENTORY:CREATE')
  @ApiOperation({ summary: 'Create production order from BOM' })
  @ApiResponse({ status: 201, description: 'Production order created' })
  async create(@Request() req, @Body() dto: CreateProductionOrderDto) {
    return this.productionOrdersService.create(req.user.tenantId, req.user.id, dto);
  }

  @Get()
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'List production orders' })
  @ApiQuery({ name: 'status', required: false, description: 'draft | released | in_progress | completed | cancelled' })
  async findAll(@Request() req, @Query('status') status?: string) {
    return this.productionOrdersService.findAll(req.user.tenantId, status);
  }

  @Get('variances')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'List all production variances across all MOs' })
  @ApiQuery({ name: 'status',       required: false, description: 'open | je_posted | closed' })
  @ApiQuery({ name: 'varianceType', required: false, description: 'merma | surplus | labor | material' })
  @ApiResponse({ status: 200, description: 'Variance list' })
  async getAllVariances(
    @Request() req,
    @Query('status') status?: string,
    @Query('varianceType') varianceType?: string,
  ) {
    return this.productionOrdersService.getAllVariances(req.user.tenantId, { status, varianceType });
  }

  @Patch('variances/:varianceId/post-je')
  @RequirePermissions('ACCOUNTING:POST')
  @ApiOperation({
    summary: 'Post variance adjustment JE',
    description: 'Merma: DR Production Losses / CR FG Inventory. Surplus: DR FG Inventory / CR Production Gains.',
  })
  @ApiParam({ name: 'varianceId', description: 'Variance UUID' })
  @ApiResponse({ status: 200, description: 'JE posted, variance status → je_posted' })
  @ApiResponse({ status: 400, description: 'Already posted or no cost to post' })
  async postVarianceJe(
    @Request() req,
    @Param('varianceId') varianceId: string,
    @Body() dto: PostVarianceJeDto,
  ) {
    return this.productionOrdersService.postVarianceJe(req.user.tenantId, req.user.id, varianceId, dto);
  }

  @Get(':id')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get production order by ID with BOM' })
  @ApiParam({ name: 'id', description: 'MO UUID' })
  async findOne(@Request() req, @Param('id') id: string) {
    return this.productionOrdersService.findOne(req.user.tenantId, id);
  }

  @Patch(':id')
  @RequirePermissions('INVENTORY:EDIT')
  @ApiOperation({ summary: 'Update production order (draft only)' })
  @ApiParam({ name: 'id', description: 'MO UUID' })
  async update(@Request() req, @Param('id') id: string, @Body() dto: UpdateProductionOrderDto) {
    return this.productionOrdersService.update(req.user.tenantId, req.user.id, id, dto);
  }

  @Patch(':id/status/:status')
  @RequirePermissions('INVENTORY:EDIT')
  @ApiOperation({ summary: 'Update MO status: released | in_progress | completed | cancelled' })
  @ApiParam({ name: 'id', description: 'MO UUID' })
  @ApiParam({ name: 'status', description: 'New status' })
  async updateStatus(@Request() req, @Param('id') id: string, @Param('status') status: string) {
    return this.productionOrdersService.updateStatus(req.user.tenantId, req.user.id, id, status);
  }

  // ── SPRINT 6 — LABOR ACTUALS ──────────────────

  @Post(':id/labor-actuals')
  @RequirePermissions('INVENTORY:EDIT')
  @ApiOperation({
    summary: 'Record labor actuals for a production order',
    description: 'Posts actual hours worked vs planned. Calculates labor cost if rate is provided.',
  })
  @ApiParam({ name: 'id', description: 'MO UUID' })
  @ApiResponse({ status: 201, description: 'Labor actual recorded' })
  @ApiResponse({ status: 400, description: 'MO in invalid status' })
  @HttpCode(HttpStatus.CREATED)
  async addLaborActual(@Request() req, @Param('id') id: string, @Body() dto: CreateLaborActualDto) {
    return this.productionOrdersService.addLaborActual(req.user.tenantId, req.user.id, id, dto);
  }

  @Get(':id/labor-actuals')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get labor actuals for a production order with efficiency summary' })
  @ApiParam({ name: 'id', description: 'MO UUID' })
  async getLaborActuals(@Request() req, @Param('id') id: string) {
    return this.productionOrdersService.getLaborActuals(req.user.tenantId, id);
  }

  // ── SPRINT 6 — MATERIAL ACTUALS ───────────────

  @Post(':id/material-actuals')
  @RequirePermissions('INVENTORY:EDIT')
  @ApiOperation({
    summary: 'Record material consumption actuals',
    description: 'Posts actual material quantities used vs BOM planned quantities. Calculates variance cost.',
  })
  @ApiParam({ name: 'id', description: 'MO UUID' })
  @ApiResponse({ status: 201, description: 'Material actual recorded' })
  @ApiResponse({ status: 400, description: 'MO in invalid status' })
  @HttpCode(HttpStatus.CREATED)
  async addMaterialActual(@Request() req, @Param('id') id: string, @Body() dto: CreateMaterialActualDto) {
    return this.productionOrdersService.addMaterialActual(req.user.tenantId, req.user.id, id, dto);
  }

  @Get(':id/material-actuals')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get material actuals for a production order with variance summary' })
  @ApiParam({ name: 'id', description: 'MO UUID' })
  async getMaterialActuals(@Request() req, @Param('id') id: string) {
    return this.productionOrdersService.getMaterialActuals(req.user.tenantId, id);
  }

  // ── SPRINT 6 — FG DELIVERY ────────────────────

  @Post(':id/deliver')
  @RequirePermissions('INVENTORY:EDIT')
  @ApiOperation({
    summary: 'Confirm finished goods delivery',
    description: `Confirms FG delivery quantity, updates quantityProduced, posts auto-JE (DR FG Inventory / CR WIP if unitCost provided), and auto-creates variance records (merma/surplus) if quantity differs from planned.`,
  })
  @ApiParam({ name: 'id', description: 'MO UUID' })
  @ApiResponse({ status: 201, description: 'FG delivered, JE posted, variances created if applicable' })
  @ApiResponse({ status: 400, description: 'MO in invalid status' })
  @HttpCode(HttpStatus.CREATED)
  async deliverFg(@Request() req, @Param('id') id: string, @Body() dto: DeliverFgDto) {
    return this.productionOrdersService.deliverFinishedGoods(req.user.tenantId, req.user.id, id, dto);
  }

  // ── SPRINT 6 — VARIANCES ──────────────────────

  @Get(':id/variances')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get variances for a specific production order' })
  @ApiParam({ name: 'id', description: 'MO UUID' })
  @ApiResponse({ status: 200, description: 'Variances with summary' })
  async getVariances(@Request() req, @Param('id') id: string) {
    return this.productionOrdersService.getVariances(req.user.tenantId, id);
  }

  @Delete(':id')
  @RequirePermissions('INVENTORY:DELETE')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete production order (draft only)' })
  @ApiParam({ name: 'id', description: 'MO UUID' })
  async remove(@Request() req, @Param('id') id: string) {
    return this.productionOrdersService.remove(req.user.tenantId, req.user.id, id);
  }
}