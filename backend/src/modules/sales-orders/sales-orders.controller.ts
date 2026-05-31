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
import { SalesOrdersService } from './sales-orders.service';
import { CreateSalesOrderDto } from './dto/create-sales-order.dto';
import { UpdateSalesOrderDto } from './dto/update-sales-order.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('Sales Orders')
@Controller('sales-orders')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('JWT-auth')
export class SalesOrdersController {
  constructor(private readonly salesOrdersService: SalesOrdersService) {}

  @Post()
  @RequirePermissions('SALES:CREATE')
  @ApiOperation({ summary: 'Create a new sales order' })
  @ApiResponse({ status: 201, description: 'SO created successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  @ApiResponse({ status: 404, description: 'Customer or item not found' })
  async create(@Request() req, @Body() createSalesOrderDto: CreateSalesOrderDto) {
    return this.salesOrdersService.create(req.user.tenantId, req.user.id, createSalesOrderDto);
  }

  @Get()
  @RequirePermissions('SALES:VIEW')
  @ApiOperation({ summary: 'Get all sales orders' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status' })
  @ApiResponse({ status: 200, description: 'List of sales orders' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  async findAll(@Request() req, @Query('status') status?: string) {
    return this.salesOrdersService.findAll(req.user.tenantId, status);
  }

  @Get(':id')
  @RequirePermissions('SALES:VIEW')
  @ApiOperation({ summary: 'Get sales order by ID' })
  @ApiParam({ name: 'id', description: 'SO UUID' })
  @ApiResponse({ status: 200, description: 'Sales order details' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  @ApiResponse({ status: 404, description: 'Sales order not found' })
  async findOne(@Request() req, @Param('id') id: string) {
    return this.salesOrdersService.findOne(req.user.tenantId, id);
  }

  @Patch(':id')
  @RequirePermissions('SALES:EDIT')
  @ApiOperation({ summary: 'Update sales order' })
  @ApiParam({ name: 'id', description: 'SO UUID' })
  @ApiResponse({ status: 200, description: 'SO updated successfully' })
  @ApiResponse({ status: 400, description: 'Can only update draft SOs' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  @ApiResponse({ status: 404, description: 'Sales order not found' })
  async update(
    @Request() req,
    @Param('id') id: string,
    @Body() updateSalesOrderDto: UpdateSalesOrderDto,
  ) {
    return this.salesOrdersService.update(req.user.tenantId, req.user.id, id, updateSalesOrderDto);
  }

  @Patch(':id/status/:status')
  @RequirePermissions('SALES:APPROVE')
  @ApiOperation({ summary: 'Update sales order status' })
  @ApiParam({ name: 'id', description: 'SO UUID' })
  @ApiParam({ name: 'status', description: 'New status: confirmed, shipped, delivered, closed' })
  @ApiResponse({ status: 200, description: 'Status updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  @ApiResponse({ status: 404, description: 'Sales order not found' })
  async updateStatus(@Request() req, @Param('id') id: string, @Param('status') status: string) {
    return this.salesOrdersService.updateStatus(req.user.tenantId, req.user.id, id, status);
  }

  @Delete(':id')
  @RequirePermissions('SALES:DELETE')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete sales order (soft delete)' })
  @ApiParam({ name: 'id', description: 'SO UUID' })
  @ApiResponse({ status: 200, description: 'SO deleted successfully' })
  @ApiResponse({ status: 400, description: 'Can only delete draft SOs' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  @ApiResponse({ status: 404, description: 'Sales order not found' })
  async remove(@Request() req, @Param('id') id: string) {
    return this.salesOrdersService.remove(req.user.tenantId, req.user.id, id);
  }
}
