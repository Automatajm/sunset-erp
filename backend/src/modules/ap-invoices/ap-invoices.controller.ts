import {
  Controller, Get, Post, Body, Patch, Param,
  Delete, UseGuards, Request, HttpCode, HttpStatus, Query,
} from '@nestjs/common';
import {
  ApiTags, ApiOperation, ApiBearerAuth,
  ApiResponse, ApiParam, ApiQuery,
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

  @Post()
  @RequirePermissions('AP:CREATE')
  @ApiOperation({ summary: 'Create AP invoice manually (draft)' })
  @ApiResponse({ status: 201, description: 'AP Invoice created in draft' })
  @ApiResponse({ status: 404, description: 'Supplier or item not found' })
  async create(@Request() req, @Body() dto: CreateApInvoiceDto) {
    return this.apInvoicesService.create(req.user.tenantId, req.user.id, dto);
  }

  @Post('from-po/:poId')
  @RequirePermissions('AP:CREATE')
  @ApiOperation({ summary: 'Auto-create AP invoice from Purchase Order (draft, hybrid lines)' })
  @ApiParam({ name: 'poId', description: 'Purchase Order UUID' })
  @ApiResponse({ status: 201, description: 'AP Invoice created from PO — lines editable before posting' })
  @ApiResponse({ status: 400, description: 'PO not in valid status or AP invoice already exists' })
  @ApiResponse({ status: 404, description: 'Purchase Order not found' })
  async createFromPo(@Request() req, @Param('poId') poId: string) {
    return this.apInvoicesService.createFromPo(req.user.tenantId, req.user.id, poId);
  }

  @Get()
  @RequirePermissions('AP:VIEW')
  @ApiOperation({ summary: 'List AP invoices with filters' })
  @ApiQuery({ name: 'status',     required: false, description: 'draft | posted | partial | paid | void' })
  @ApiQuery({ name: 'supplierId', required: false, description: 'Filter by supplier UUID' })
  @ApiQuery({ name: 'from',       required: false, description: 'Invoice date from YYYY-MM-DD' })
  @ApiQuery({ name: 'to',         required: false, description: 'Invoice date to YYYY-MM-DD' })
  async findAll(
    @Request() req,
    @Query('status')     status?: string,
    @Query('supplierId') supplierId?: string,
    @Query('from')       from?: string,
    @Query('to')         to?: string,
  ) {
    return this.apInvoicesService.findAll(req.user.tenantId, { status, supplierId, from, to });
  }

  @Get('aging')
  @RequirePermissions('AP:VIEW')
  @ApiOperation({ summary: 'AP Aging Report — Current / 1-30 / 31-60 / 90+ days past due' })
  async getAging(@Request() req) {
    return this.apInvoicesService.getAging(req.user.tenantId);
  }

  @Get('kpis')
  @RequirePermissions('AP:VIEW')
  @ApiOperation({ summary: 'AP KPIs — Total Invoiced / Paid / Pending / Overdue / Payment Rate' })
  async getKpis(@Request() req) {
    return this.apInvoicesService.getKpis(req.user.tenantId);
  }

  @Get(':id')
  @RequirePermissions('AP:VIEW')
  @ApiOperation({ summary: 'Get AP invoice by ID with lines and payments' })
  @ApiParam({ name: 'id', description: 'AP Invoice UUID' })
  async findOne(@Request() req, @Param('id') id: string) {
    return this.apInvoicesService.findOne(req.user.tenantId, id);
  }

  @Patch(':id')
  @RequirePermissions('AP:EDIT')
  @ApiOperation({ summary: 'Update AP invoice — draft only (dueDate, supplierRef, notes)' })
  @ApiParam({ name: 'id', description: 'AP Invoice UUID' })
  @ApiResponse({ status: 400, description: 'Not in draft status' })
  async update(@Request() req, @Param('id') id: string, @Body() dto: UpdateApInvoiceDto) {
    return this.apInvoicesService.update(req.user.tenantId, req.user.id, id, dto);
  }

  @Patch(':id/post')
  @RequirePermissions('AP:APPROVE')
  @ApiOperation({ summary: 'Post AP invoice → JE: Raw Material Inventory DR / AP CR' })
  @ApiParam({ name: 'id', description: 'AP Invoice UUID' })
  @ApiResponse({ status: 200, description: 'Posted, JE generated' })
  @ApiResponse({ status: 400, description: 'Not in draft or fiscal period closed' })
  async post(@Request() req, @Param('id') id: string) {
    return this.apInvoicesService.post(req.user.tenantId, req.user.id, id);
  }

  @Patch(':id/void')
  @RequirePermissions('AP:APPROVE')
  @ApiOperation({ summary: 'Void AP invoice → reversal JE if already posted' })
  @ApiParam({ name: 'id', description: 'AP Invoice UUID' })
  async void(@Request() req, @Param('id') id: string) {
    return this.apInvoicesService.void(req.user.tenantId, req.user.id, id);
  }

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

  @Delete(':id')
  @RequirePermissions('AP:DELETE')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete AP invoice — draft only (soft delete)' })
  @ApiParam({ name: 'id', description: 'AP Invoice UUID' })
  async remove(@Request() req, @Param('id') id: string) {
    return this.apInvoicesService.remove(req.user.tenantId, req.user.id, id);
  }
}