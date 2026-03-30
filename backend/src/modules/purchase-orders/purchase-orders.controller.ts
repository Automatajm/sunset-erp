import {
  Controller, Get, Post, Body, Patch, Param,
  Delete, UseGuards, Request, HttpCode, HttpStatus, Query,
} from '@nestjs/common';
import {
  ApiTags, ApiOperation, ApiBearerAuth,
  ApiResponse, ApiParam, ApiQuery,
} from '@nestjs/swagger';
import { PurchaseOrdersService } from './purchase-orders.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';
import { ReceivePurchaseOrderDto } from './dto/receive-purchase-order.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('Purchase Orders')
@Controller('purchase-orders')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('JWT-auth')
export class PurchaseOrdersController {
  constructor(private readonly purchaseOrdersService: PurchaseOrdersService) {}

  @Post()
  @RequirePermissions('PROCUREMENT:CREATE')
  @ApiOperation({ summary: 'Create a new purchase order' })
  @ApiResponse({ status: 201, description: 'PO created successfully' })
  @ApiResponse({ status: 404, description: 'Supplier or item not found' })
  async create(@Request() req, @Body() dto: CreatePurchaseOrderDto) {
    return this.purchaseOrdersService.create(req.user.tenantId, req.user.id, dto);
  }

  @Get()
  @RequirePermissions('PROCUREMENT:VIEW')
  @ApiOperation({ summary: 'Get all purchase orders' })
  @ApiQuery({ name: 'status', required: false })
  async findAll(@Request() req, @Query('status') status?: string) {
    return this.purchaseOrdersService.findAll(req.user.tenantId, status);
  }

  @Get(':id')
  @RequirePermissions('PROCUREMENT:VIEW')
  @ApiOperation({ summary: 'Get purchase order by ID' })
  @ApiParam({ name: 'id', description: 'PO UUID' })
  async findOne(@Request() req, @Param('id') id: string) {
    return this.purchaseOrdersService.findOne(req.user.tenantId, id);
  }

  @Patch(':id')
  @RequirePermissions('PROCUREMENT:EDIT')
  @ApiOperation({ summary: 'Update purchase order (draft only)' })
  @ApiParam({ name: 'id', description: 'PO UUID' })
  async update(@Request() req, @Param('id') id: string, @Body() dto: UpdatePurchaseOrderDto) {
    return this.purchaseOrdersService.update(req.user.tenantId, req.user.id, id, dto);
  }

  @Patch(':id/status/:status')
  @RequirePermissions('PROCUREMENT:APPROVE')
  @ApiOperation({ summary: 'Transition purchase order status' })
  @ApiParam({ name: 'id', description: 'PO UUID' })
  @ApiParam({ name: 'status', description: 'confirmed | cancelled | closed' })
  async updateStatus(
    @Request() req,
    @Param('id') id: string,
    @Param('status') status: string,
  ) {
    return this.purchaseOrdersService.updateStatus(req.user.tenantId, req.user.id, id, status);
  }

  @Post(':id/receive')
  @RequirePermissions('PROCUREMENT:EDIT')
  @ApiOperation({ summary: 'Receive goods against a purchase order — updates stock' })
  @ApiParam({ name: 'id', description: 'PO UUID' })
  @ApiResponse({ status: 200, description: 'Goods received, stock updated' })
  @ApiResponse({ status: 400, description: 'PO not in receivable status or quantity exceeded' })
  @ApiResponse({ status: 404, description: 'PO, line, or warehouse not found' })
  async receive(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: ReceivePurchaseOrderDto,
  ) {
    return this.purchaseOrdersService.receive(req.user.tenantId, req.user.id, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('PROCUREMENT:DELETE')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete purchase order (draft only, soft delete)' })
  @ApiParam({ name: 'id', description: 'PO UUID' })
  async remove(@Request() req, @Param('id') id: string) {
    return this.purchaseOrdersService.remove(req.user.tenantId, req.user.id, id);
  }
}