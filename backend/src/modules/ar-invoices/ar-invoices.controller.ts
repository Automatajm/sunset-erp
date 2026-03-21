import {
  Controller, Get, Post, Body, Patch, Param,
  Delete, UseGuards, Request, HttpCode, HttpStatus, Query,
} from '@nestjs/common';
import {
  ApiTags, ApiOperation, ApiBearerAuth,
  ApiResponse, ApiParam, ApiQuery,
} from '@nestjs/swagger';
import { ArInvoicesService } from './ar-invoices.service';
import { CreateArInvoiceDto } from './dto/create-ar-invoice.dto';
import { UpdateArInvoiceDto, ApplyPaymentDto } from './dto/update-ar-invoice.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('AR Invoices')
@Controller('ar-invoices')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('JWT-auth')
export class ArInvoicesController {
  constructor(private readonly arInvoicesService: ArInvoicesService) {}

  @Post()
  @RequirePermissions('AR:CREATE')
  @ApiOperation({ summary: 'Create invoice manually' })
  @ApiResponse({ status: 201, description: 'Invoice created in draft' })
  @ApiResponse({ status: 404, description: 'Customer or item not found' })
  async create(@Request() req, @Body() dto: CreateArInvoiceDto) {
    return this.arInvoicesService.create(req.user.tenantId, req.user.id, dto);
  }

  @Post('from-so/:soId')
  @RequirePermissions('AR:CREATE')
  @ApiOperation({ summary: 'Auto-create invoice from Sales Order' })
  @ApiParam({ name: 'soId', description: 'Sales Order UUID' })
  @ApiResponse({ status: 201, description: 'Invoice created from SO' })
  @ApiResponse({ status: 400, description: 'SO not in valid status or invoice already exists' })
  @ApiResponse({ status: 404, description: 'Sales Order not found' })
  async createFromSo(@Request() req, @Param('soId') soId: string) {
    return this.arInvoicesService.createFromSalesOrder(req.user.tenantId, req.user.id, soId);
  }

  @Get()
  @RequirePermissions('AR:VIEW')
  @ApiOperation({ summary: 'List AR invoices with filters' })
  @ApiQuery({ name: 'status',     required: false, description: 'draft | sent | partial | paid | overdue | void' })
  @ApiQuery({ name: 'customerId', required: false, description: 'Filter by customer UUID' })
  @ApiQuery({ name: 'from',       required: false, description: 'Invoice date from YYYY-MM-DD' })
  @ApiQuery({ name: 'to',         required: false, description: 'Invoice date to YYYY-MM-DD' })
  @ApiResponse({ status: 200, description: 'Invoice list' })
  async findAll(
    @Request() req,
    @Query('status') status?: string,
    @Query('customerId') customerId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.arInvoicesService.findAll(req.user.tenantId, { status, customerId, from, to });
  }

  @Get('aging')
  @RequirePermissions('AR:VIEW')
  @ApiOperation({ summary: 'AR Aging Report — Current / 1-30 / 31-60 / 90+ days' })
  @ApiResponse({ status: 200, description: 'Aging summary + per-invoice detail' })
  async getAging(@Request() req) {
    return this.arInvoicesService.getAging(req.user.tenantId);
  }

  @Get('kpis')
  @RequirePermissions('AR:VIEW')
  @ApiOperation({ summary: 'AR KPIs — Invoiced / Collected / Pending / Overdue / Collection Rate' })
  @ApiResponse({ status: 200, description: 'KPI totals' })
  async getKpis(@Request() req) {
    return this.arInvoicesService.getKpis(req.user.tenantId);
  }

  @Get(':id')
  @RequirePermissions('AR:VIEW')
  @ApiOperation({ summary: 'Get invoice by ID with lines and payments' })
  @ApiParam({ name: 'id', description: 'Invoice UUID' })
  @ApiResponse({ status: 200, description: 'Invoice detail' })
  @ApiResponse({ status: 404, description: 'Not found' })
  async findOne(@Request() req, @Param('id') id: string) {
    return this.arInvoicesService.findOne(req.user.tenantId, id);
  }

  @Patch(':id')
  @RequirePermissions('AR:EDIT')
  @ApiOperation({ summary: 'Update invoice — draft only (dueDate, notes)' })
  @ApiParam({ name: 'id', description: 'Invoice UUID' })
  @ApiResponse({ status: 200, description: 'Updated' })
  @ApiResponse({ status: 400, description: 'Not in draft status' })
  async update(@Request() req, @Param('id') id: string, @Body() dto: UpdateArInvoiceDto) {
    return this.arInvoicesService.update(req.user.tenantId, req.user.id, id, dto);
  }

  @Patch(':id/send')
  @RequirePermissions('AR:APPROVE')
  @ApiOperation({ summary: 'Send invoice → auto-posts DR AR / CR Revenue JE' })
  @ApiParam({ name: 'id', description: 'Invoice UUID' })
  @ApiResponse({ status: 200, description: 'Sent, JE posted' })
  @ApiResponse({ status: 400, description: 'Not in draft or missing GL accounts' })
  async send(@Request() req, @Param('id') id: string) {
    return this.arInvoicesService.send(req.user.tenantId, req.user.id, id);
  }

  @Patch(':id/void')
  @RequirePermissions('AR:APPROVE')
  @ApiOperation({ summary: 'Void invoice → posts reversal JE if applicable' })
  @ApiParam({ name: 'id', description: 'Invoice UUID' })
  @ApiResponse({ status: 200, description: 'Voided' })
  @ApiResponse({ status: 400, description: 'Already voided or fully paid' })
  async void(@Request() req, @Param('id') id: string) {
    return this.arInvoicesService.void(req.user.tenantId, req.user.id, id);
  }

  @Post(':id/payments')
  @RequirePermissions('AR:PAYMENT')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Apply payment (partial or full) → auto-posts DR Cash / CR AR JE' })
  @ApiParam({ name: 'id', description: 'Invoice UUID' })
  @ApiResponse({ status: 201, description: 'Payment applied, JE posted' })
  @ApiResponse({ status: 400, description: 'Exceeds balance or invalid status' })
  async applyPayment(@Request() req, @Param('id') id: string, @Body() dto: ApplyPaymentDto) {
    return this.arInvoicesService.applyPayment(req.user.tenantId, req.user.id, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('AR:DELETE')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete invoice — draft only (soft delete)' })
  @ApiParam({ name: 'id', description: 'Invoice UUID' })
  @ApiResponse({ status: 200, description: 'Deleted' })
  @ApiResponse({ status: 400, description: 'Not in draft status' })
  async remove(@Request() req, @Param('id') id: string) {
    return this.arInvoicesService.remove(req.user.tenantId, req.user.id, id);
  }
}