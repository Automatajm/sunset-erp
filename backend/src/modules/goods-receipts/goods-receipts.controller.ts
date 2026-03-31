// ============================================================================
// FILE: backend/src/modules/goods-receipts/goods-receipts.controller.ts
// ============================================================================
import {
  Controller, Get, Post, Patch, Body, Param,
  UseGuards, Request, HttpCode, HttpStatus,
} from '@nestjs/common';
import {
  ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiParam,
} from '@nestjs/swagger';
import { GoodsReceiptsService } from './goods-receipts.service';
import { CreateGoodsReceiptDto } from './dto/create-goods-receipt.dto';
import { UpdateGoodsReceiptDto } from './dto/update-goods-receipt.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('Goods Receipts (GRN)')
@Controller('goods-receipts')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('JWT-auth')
export class GoodsReceiptsController {
  constructor(private readonly service: GoodsReceiptsService) {}

  // ── POST /goods-receipts ──────────────────────────────────────────────────
  @Post()
  @RequirePermissions('INVENTORY:CREATE')
  @ApiOperation({ summary: 'Create a Goods Receipt (GRN) — posts stock and creates movement' })
  @ApiResponse({ status: 201, description: 'GRN created and stock posted' })
  @ApiResponse({ status: 400, description: 'Validation error or cancelled PO' })
  @ApiResponse({ status: 404, description: 'Warehouse, PO, or item not found' })
  async create(@Request() req, @Body() dto: CreateGoodsReceiptDto) {
    return this.service.create(req.user.tenantId, req.user.id, dto);
  }

  // ── GET /goods-receipts ───────────────────────────────────────────────────
  @Get()
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'List all GRNs with supplier, PO, warehouse and value' })
  @ApiResponse({ status: 200, description: 'GRN list' })
  async findAll(@Request() req) {
    return this.service.findAll(req.user.tenantId);
  }

  // ── GET /goods-receipts/stats ─────────────────────────────────────────────
  @Get('stats')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'GRN summary stats — total, posted, cancelled, today, totalValue' })
  @ApiResponse({ status: 200, description: 'Stats object' })
  async getStats(@Request() req) {
    return this.service.getStats(req.user.tenantId);
  }

  // ── GET /goods-receipts/:id ───────────────────────────────────────────────
  @Get(':id')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get GRN detail with lines and stock movement refs' })
  @ApiParam({ name: 'id', description: 'GRN UUID' })
  @ApiResponse({ status: 200, description: 'GRN detail' })
  @ApiResponse({ status: 404, description: 'GRN not found' })
  async findOne(@Request() req, @Param('id') id: string) {
    return this.service.findOne(req.user.tenantId, id);
  }

  // ── GET /goods-receipts/by-po/:poId ──────────────────────────────────────
  @Get('by-po/:poId')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get all GRNs linked to a specific PO' })
  @ApiParam({ name: 'poId', description: 'Purchase Order UUID' })
  @ApiResponse({ status: 200, description: 'GRNs for PO' })
  async findByPo(@Request() req, @Param('poId') poId: string) {
    return this.service.findByPo(req.user.tenantId, poId);
  }

  // ── PATCH /goods-receipts/:id ─────────────────────────────────────────────
  @Patch(':id')
  @RequirePermissions('INVENTORY:EDIT')
  @ApiOperation({ summary: 'Update GRN notes or condition (cannot change lines after posting)' })
  @ApiParam({ name: 'id', description: 'GRN UUID' })
  @ApiResponse({ status: 200, description: 'GRN updated' })
  @ApiResponse({ status: 400, description: 'GRN is cancelled' })
  async update(@Request() req, @Param('id') id: string, @Body() dto: UpdateGoodsReceiptDto) {
    return this.service.update(req.user.tenantId, req.user.id, id, dto);
  }

  // ── POST /goods-receipts/:id/cancel ──────────────────────────────────────
  @Post(':id/cancel')
  @RequirePermissions('INVENTORY:DELETE')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel GRN — reverses stock movements and PO received quantities' })
  @ApiParam({ name: 'id', description: 'GRN UUID' })
  @ApiResponse({ status: 200, description: 'GRN cancelled and stock reversed' })
  @ApiResponse({ status: 409, description: 'GRN already cancelled' })
  async cancel(@Request() req, @Param('id') id: string) {
    return this.service.cancel(req.user.tenantId, req.user.id, id);
  }
}