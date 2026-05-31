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
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { GeneralNeedsService } from './general-needs.service';
import { MrpService } from './mrp.service';
import { CreateGeneralNeedDto } from './dto/create-general-need.dto';
import { UpdateGeneralNeedDto } from './dto/update-general-need.dto';
import { UpdateGeneralNeedLineDto } from './dto/update-general-need-line.dto';
import { RunMrpDto } from './dto/run-mrp.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('General Needs')
@Controller('general-needs')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('JWT-auth')
export class GeneralNeedsController {
  constructor(
    private readonly generalNeedsService: GeneralNeedsService,
    private readonly mrpService: MrpService,
  ) {}

  @Post()
  @RequirePermissions('PROCUREMENT:CREATE')
  @ApiOperation({ summary: 'Create a new General Need with lines' })
  @ApiResponse({ status: 201, description: 'General Need created' })
  async create(@Request() req, @Body() dto: CreateGeneralNeedDto) {
    return this.generalNeedsService.create(req.user.tenantId, req.user.id, dto);
  }

  @Get()
  @RequirePermissions('PROCUREMENT:VIEW')
  @ApiOperation({ summary: 'Get all General Needs' })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'draft | in_progress | completed | cancelled',
  })
  async findAll(@Request() req, @Query('status') status?: string) {
    return this.generalNeedsService.findAll(req.user.tenantId, status);
  }

  @Get(':id')
  @RequirePermissions('PROCUREMENT:VIEW')
  @ApiOperation({ summary: 'Get General Need by ID with lines' })
  @ApiParam({ name: 'id', description: 'GN UUID' })
  async findOne(@Request() req, @Param('id') id: string) {
    return this.generalNeedsService.findOne(req.user.tenantId, id);
  }

  @Patch(':id')
  @RequirePermissions('PROCUREMENT:EDIT')
  @ApiOperation({ summary: 'Update General Need header (draft or in_progress only)' })
  @ApiParam({ name: 'id', description: 'GN UUID' })
  async update(@Request() req, @Param('id') id: string, @Body() dto: UpdateGeneralNeedDto) {
    return this.generalNeedsService.update(req.user.tenantId, req.user.id, id, dto);
  }

  @Patch(':id/status/:status')
  @RequirePermissions('PROCUREMENT:APPROVE')
  @ApiOperation({ summary: 'Transition General Need status' })
  @ApiParam({ name: 'id', description: 'GN UUID' })
  @ApiParam({ name: 'status', description: 'in_progress | completed | cancelled' })
  async updateStatus(@Request() req, @Param('id') id: string, @Param('status') status: string) {
    return this.generalNeedsService.updateStatus(req.user.tenantId, req.user.id, id, status);
  }

  @Patch(':id/lines/:lineId')
  @RequirePermissions('PROCUREMENT:EDIT')
  @ApiOperation({ summary: 'Update a single GN line' })
  @ApiParam({ name: 'id', description: 'GN UUID' })
  @ApiParam({ name: 'lineId', description: 'GN Line UUID' })
  async updateLine(
    @Request() req,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body() dto: UpdateGeneralNeedLineDto,
  ) {
    return this.generalNeedsService.updateLine(req.user.tenantId, req.user.id, id, lineId, dto);
  }

  @Post(':id/convert-to-pr')
  @RequirePermissions('PROCUREMENT:CREATE')
  @ApiOperation({ summary: 'Convert selected GN lines into a Purchase Requisition' })
  @ApiParam({ name: 'id', description: 'GN UUID' })
  @ApiResponse({ status: 201, description: 'PR created from GN lines' })
  async convertToPr(
    @Request() req,
    @Param('id') id: string,
    @Body() body: { lineIds: string[]; prTitle: string; priority?: string },
  ) {
    return this.generalNeedsService.convertToPr(
      req.user.tenantId,
      req.user.id,
      id,
      body.lineIds,
      body.prTitle,
      body.priority,
    );
  }

  @Post(':id/explode-mos')
  @RequirePermissions('PROCUREMENT:CREATE')
  @ApiOperation({ summary: 'Explode BOM from selected MOs into GN lines (legacy)' })
  @ApiParam({ name: 'id', description: 'GN UUID' })
  async explodeFromMos(@Request() req, @Param('id') id: string, @Body() body: { moIds: string[] }) {
    return this.generalNeedsService.explodeFromMos(req.user.tenantId, req.user.id, id, body.moIds);
  }

  // ── MRP Engine ─────────────────────────────────────────────────────────────

  @Post(':id/run-mrp')
  @RequirePermissions('PROCUREMENT:CREATE')
  @ApiOperation({
    summary: 'Run MRP explosion — explode Production Orders into General Need lines',
    description: `
Explodes selected Production Orders via their BOMs into aggregated GeneralNeedLines.

Flow:
  1. For each MO → load BOM components (consumptionGroupId, quantityPer, uom)
  2. Convert formulador UOM → system consumptionUom via UomConversion catalog
  3. Multiply by MO.quantityToProduce
  4. Aggregate by ConsumptionGroup (sum quantities in consumptionUom)
  5. Create one GeneralNeedLine per group with preferred supplier suggestion

Requirements:
  - BOM components must have ConsumptionGroups configured
  - ConsumptionGroups must have a system UOM (consumptionUomId)
  - UomConversion must exist for formulador → consumptionUom (same dimension)
    `,
  })
  @ApiParam({ name: 'id', description: 'GeneralNeed UUID' })
  @ApiResponse({ status: 201, description: 'MRP explosion complete — GN lines created' })
  async runMrp(@Request() req, @Param('id') id: string, @Body() dto: RunMrpDto) {
    return this.mrpService.runMrp(req.user.tenantId, req.user.id, id, dto.moIds);
  }

  @Delete(':id')
  @RequirePermissions('PROCUREMENT:DELETE')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete General Need (draft only, soft delete)' })
  @ApiParam({ name: 'id', description: 'GN UUID' })
  async remove(@Request() req, @Param('id') id: string) {
    return this.generalNeedsService.remove(req.user.tenantId, req.user.id, id);
  }
}
