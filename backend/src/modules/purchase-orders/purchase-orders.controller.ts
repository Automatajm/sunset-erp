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
import { PurchaseOrdersService } from './purchase-orders.service';
import { CreatePurchaseOrderDto } from './dto/create-purchase-order.dto';
import { UpdatePurchaseOrderDto } from './dto/update-purchase-order.dto';
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
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  @ApiResponse({ status: 404, description: 'Supplier or item not found' })
  async create(@Request() req, @Body() createPurchaseOrderDto: CreatePurchaseOrderDto) {
    return this.purchaseOrdersService.create(
      req.user.tenantId,
      req.user.id,
      createPurchaseOrderDto,
    );
  }

  @Get()
  @RequirePermissions('PROCUREMENT:VIEW')
  @ApiOperation({ summary: 'Get all purchase orders' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status' })
  @ApiResponse({ status: 200, description: 'List of purchase orders' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  async findAll(@Request() req, @Query('status') status?: string) {
    return this.purchaseOrdersService.findAll(req.user.tenantId, status);
  }

  @Get(':id')
  @RequirePermissions('PROCUREMENT:VIEW')
  @ApiOperation({ summary: 'Get purchase order by ID' })
  @ApiParam({ name: 'id', description: 'PO UUID' })
  @ApiResponse({ status: 200, description: 'Purchase order details' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  @ApiResponse({ status: 404, description: 'Purchase order not found' })
  async findOne(@Request() req, @Param('id') id: string) {
    return this.purchaseOrdersService.findOne(req.user.tenantId, id);
  }

  @Patch(':id')
  @RequirePermissions('PROCUREMENT:EDIT')
  @ApiOperation({ summary: 'Update purchase order' })
  @ApiParam({ name: 'id', description: 'PO UUID' })
  @ApiResponse({ status: 200, description: 'PO updated successfully' })
  @ApiResponse({ status: 400, description: 'Can only update draft POs' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  @ApiResponse({ status: 404, description: 'Purchase order not found' })
  async update(
    @Request() req,
    @Param('id') id: string,
    @Body() updatePurchaseOrderDto: UpdatePurchaseOrderDto,
  ) {
    return this.purchaseOrdersService.update(
      req.user.tenantId,
      req.user.id,
      id,
      updatePurchaseOrderDto,
    );
  }

  @Patch(':id/status/:status')
  @RequirePermissions('PROCUREMENT:APPROVE')
  @ApiOperation({ summary: 'Update purchase order status' })
  @ApiParam({ name: 'id', description: 'PO UUID' })
  @ApiParam({ name: 'status', description: 'New status: approved, rejected, closed' })
  @ApiResponse({ status: 200, description: 'Status updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  @ApiResponse({ status: 404, description: 'Purchase order not found' })
  async updateStatus(
    @Request() req,
    @Param('id') id: string,
    @Param('status') status: string,
  ) {
    return this.purchaseOrdersService.updateStatus(
      req.user.tenantId,
      req.user.id,
      id,
      status,
    );
  }

  @Delete(':id')
  @RequirePermissions('PROCUREMENT:DELETE')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete purchase order (soft delete)' })
  @ApiParam({ name: 'id', description: 'PO UUID' })
  @ApiResponse({ status: 200, description: 'PO deleted successfully' })
  @ApiResponse({ status: 400, description: 'Can only delete draft POs' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  @ApiResponse({ status: 404, description: 'Purchase order not found' })
  async remove(@Request() req, @Param('id') id: string) {
    return this.purchaseOrdersService.remove(req.user.tenantId, req.user.id, id);
  }
}
