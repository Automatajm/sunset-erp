// ============================================================================
// FILE: backend/src/modules/ap-invoices/ap-invoices.controller.ts
// ============================================================================
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
  ApiBody,
} from '@nestjs/swagger';
import { ApInvoicesService } from './ap-invoices.service';
import { CreateApInvoiceDto } from './dto/create-ap-invoice.dto';
import { UpdateApInvoiceDto, ApplyApPaymentDto } from './dto/update-ap-invoice.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('AP Invoices')
@Controller('ap-invoices')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('JWT-auth')
export class ApInvoicesController {
  constructor(private readonly apInvoicesService: ApInvoicesService) {}

  // ── POST /ap-invoices ─────────────────────────────────────────────────────
  @Post()
  @RequirePermissions('AP:CREATE')
  @ApiOperation({ summary: 'Create AP invoice manually (draft)' })
  @ApiResponse({ status: 201, description: 'AP Invoice created in draft' })
  @ApiResponse({ status: 404, description: 'Supplier or item not found' })
  async create(@Request() req, @Body() dto: CreateApInvoiceDto) {
    return this.apInvoicesService.create(req.user.tenantId, req.user.id, dto);
  }

  // ── POST /ap-invoices/from-po/:poId ───────────────────────────────────────
  @Post('from-po/:poId')
  @RequirePermissions('AP:CREATE')
  @ApiOperation({ summary: 'Auto-create AP invoice from Purchase Order (draft, hybrid lines)' })
  @ApiParam({ name: 'poId', description: 'Purchase Order UUID' })
  @ApiResponse({ status: 201, description: 'AP Invoice created from PO' })
  @ApiResponse({ status: 400, description: 'PO not in valid status or AP invoice already exists' })
  @ApiResponse({ status: 404, description: 'Purchase Order not found' })
  async createFromPo(@Request() req, @Param('poId') poId: string) {
    return this.apInvoicesService.createFromPo(req.user.tenantId, req.user.id, poId);
  }

  // ── GET /ap-invoices ──────────────────────────────────────────────────────
  @Get()
  @RequirePermissions('AP:VIEW')
  @ApiOperation({ summary: 'List AP invoices with filters' })
  @ApiQuery({
    name: 'status',
    required: false,
    description: 'draft | posted | partial | paid | void',
  })
  @ApiQuery({ name: 'supplierId', required: false, description: 'Filter by supplier UUID' })
  @ApiQuery({ name: 'from', required: false, description: 'Invoice date from YYYY-MM-DD' })
  @ApiQuery({ name: 'to', required: false, description: 'Invoice date to YYYY-MM-DD' })
  async findAll(
    @Request() req,
    @Query('status') status?: string,
    @Query('supplierId') supplierId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.apInvoicesService.findAll(req.user.tenantId, { status, supplierId, from, to });
  }

  // ── GET /ap-invoices/aging ────────────────────────────────────────────────
  @Get('aging')
  @RequirePermissions('AP:VIEW')
  @ApiOperation({ summary: 'AP Aging Report — Current / 1-30 / 31-60 / 90+ days past due' })
  async getAging(@Request() req) {
    return this.apInvoicesService.getAging(req.user.tenantId);
  }

  // ── GET /ap-invoices/kpis ─────────────────────────────────────────────────
  @Get('kpis')
  @RequirePermissions('AP:VIEW')
  @ApiOperation({ summary: 'AP KPIs — Total Invoiced / Paid / Pending / Overdue / Payment Rate' })
  async getKpis(@Request() req) {
    return this.apInvoicesService.getKpis(req.user.tenantId);
  }

  // ── GET /ap-invoices/:id ──────────────────────────────────────────────────
  @Get(':id')
  @RequirePermissions('AP:VIEW')
  @ApiOperation({ summary: 'Get AP invoice by ID with lines and payments' })
  @ApiParam({ name: 'id', description: 'AP Invoice UUID' })
  async findOne(@Request() req, @Param('id') id: string) {
    return this.apInvoicesService.findOne(req.user.tenantId, id);
  }

  // ── GET /ap-invoices/:id/match-status ─────────────────────────────────────
  @Get(':id/match-status')
  @RequirePermissions('AP:VIEW')
  @ApiOperation({ summary: '3-Way Match status: PO ↔ GRN ↔ AP Invoice analysis per line' })
  @ApiParam({ name: 'id', description: 'AP Invoice UUID' })
  @ApiResponse({ status: 200, description: 'Match analysis with line-level checks' })
  async getMatchStatus(@Request() req, @Param('id') id: string) {
    return this.apInvoicesService.getMatchStatus(req.user.tenantId, id);
  }

  // ── PATCH /ap-invoices/:id ────────────────────────────────────────────────
  @Patch(':id')
  @RequirePermissions('AP:EDIT')
  @ApiOperation({ summary: 'Update AP invoice — draft only (dueDate, supplierRef, notes)' })
  @ApiParam({ name: 'id', description: 'AP Invoice UUID' })
  @ApiResponse({ status: 400, description: 'Not in draft status' })
  async update(@Request() req, @Param('id') id: string, @Body() dto: UpdateApInvoiceDto) {
    return this.apInvoicesService.update(req.user.tenantId, req.user.id, id, dto);
  }

  // ── PATCH /ap-invoices/:id/post ───────────────────────────────────────────
  @Patch(':id/post')
  @RequirePermissions('AP:APPROVE')
  @ApiOperation({
    summary: 'Post AP invoice → JE: Inventory DR / AP CR. Validates 3-way match if GRN linked.',
  })
  @ApiParam({ name: 'id', description: 'AP Invoice UUID' })
  @ApiResponse({ status: 200, description: 'Posted, JE generated' })
  @ApiResponse({
    status: 400,
    description: 'Not in draft, 3-way match failed, or fiscal period closed',
  })
  async post(@Request() req, @Param('id') id: string) {
    return this.apInvoicesService.post(req.user.tenantId, req.user.id, id);
  }

  // ── PATCH /ap-invoices/:id/void ───────────────────────────────────────────
  @Patch(':id/void')
  @RequirePermissions('AP:APPROVE')
  @ApiOperation({ summary: 'Void AP invoice → reversal JE if already posted' })
  @ApiParam({ name: 'id', description: 'AP Invoice UUID' })
  async void(@Request() req, @Param('id') id: string) {
    return this.apInvoicesService.void(req.user.tenantId, req.user.id, id);
  }

  // ── POST /ap-invoices/:id/payments ────────────────────────────────────────
  @Post(':id/payments')
  @RequirePermissions('AP:PAYMENT')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Apply payment → JE: AP DR / Cash CR' })
  @ApiParam({ name: 'id', description: 'AP Invoice UUID' })
  @ApiResponse({ status: 201, description: 'Payment applied, JE posted' })
  @ApiResponse({ status: 400, description: 'Exceeds balance or invoice not posted yet' })
  async applyPayment(@Request() req, @Param('id') id: string, @Body() dto: ApplyApPaymentDto) {
    return this.apInvoicesService.applyPayment(req.user.tenantId, req.user.id, id, dto);
  }

  // ── POST /ap-invoices/:id/link-grn ────────────────────────────────────────
  @Post(':id/link-grn')
  @RequirePermissions('AP:EDIT')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Link a GRN to this AP Invoice — auto-matches lines by poLineId' })
  @ApiParam({ name: 'id', description: 'AP Invoice UUID' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: { grnId: { type: 'string', format: 'uuid' } },
      required: ['grnId'],
    },
  })
  @ApiResponse({ status: 200, description: 'GRN linked, matched line count returned' })
  async linkGrn(@Request() req, @Param('id') id: string, @Body('grnId') grnId: string) {
    return this.apInvoicesService.linkGrn(req.user.tenantId, req.user.id, id, grnId);
  }

  // ── POST /ap-invoices/:id/unlink-grn ──────────────────────────────────────
  @Post(':id/unlink-grn')
  @RequirePermissions('AP:EDIT')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove GRN link from AP Invoice' })
  @ApiParam({ name: 'id', description: 'AP Invoice UUID' })
  @ApiResponse({ status: 200, description: 'GRN unlinked' })
  async unlinkGrn(@Request() req, @Param('id') id: string) {
    return this.apInvoicesService.unlinkGrn(req.user.tenantId, req.user.id, id);
  }

  // ── DELETE /ap-invoices/:id ───────────────────────────────────────────────
  @Delete(':id')
  @RequirePermissions('AP:DELETE')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete AP invoice — draft only (soft delete)' })
  @ApiParam({ name: 'id', description: 'AP Invoice UUID' })
  async remove(@Request() req, @Param('id') id: string) {
    return this.apInvoicesService.remove(req.user.tenantId, req.user.id, id);
  }
}
