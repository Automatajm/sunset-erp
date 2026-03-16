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
import { ProductionOrdersService } from './production-orders.service';
import { CreateProductionOrderDto } from './dto/create-production-order.dto';
import { UpdateProductionOrderDto } from './dto/update-production-order.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('Production Orders')
@Controller('production-orders')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('JWT-auth')
export class ProductionOrdersController {
  constructor(private readonly productionOrdersService: ProductionOrdersService) {}

  @Post()
  @RequirePermissions('INVENTORY:CREATE')
  @ApiOperation({ summary: 'Create production order from BOM' })
  @ApiResponse({ status: 201, description: 'Production order created' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  @ApiResponse({ status: 404, description: 'BOM not found' })
  async create(@Request() req, @Body() createProductionOrderDto: CreateProductionOrderDto) {
    return this.productionOrdersService.create(
      req.user.tenantId,
      req.user.id,
      createProductionOrderDto,
    );
  }

  @Get()
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get all production orders' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status' })
  @ApiResponse({ status: 200, description: 'List of production orders' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  async findAll(@Request() req, @Query('status') status?: string) {
    return this.productionOrdersService.findAll(req.user.tenantId, status);
  }

  @Get(':id')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get production order by ID' })
  @ApiParam({ name: 'id', description: 'Production order UUID' })
  @ApiResponse({ status: 200, description: 'Production order details' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  @ApiResponse({ status: 404, description: 'Production order not found' })
  async findOne(@Request() req, @Param('id') id: string) {
    return this.productionOrdersService.findOne(req.user.tenantId, id);
  }

  @Patch(':id')
  @RequirePermissions('INVENTORY:EDIT')
  @ApiOperation({ summary: 'Update production order' })
  @ApiParam({ name: 'id', description: 'Production order UUID' })
  @ApiResponse({ status: 200, description: 'Production order updated' })
  @ApiResponse({ status: 400, description: 'Can only update draft orders' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  @ApiResponse({ status: 404, description: 'Production order not found' })
  async update(
    @Request() req,
    @Param('id') id: string,
    @Body() updateProductionOrderDto: UpdateProductionOrderDto,
  ) {
    return this.productionOrdersService.update(
      req.user.tenantId,
      req.user.id,
      id,
      updateProductionOrderDto,
    );
  }

  @Patch(':id/status/:status')
  @RequirePermissions('INVENTORY:EDIT')
  @ApiOperation({ summary: 'Update production order status' })
  @ApiParam({ name: 'id', description: 'Production order UUID' })
  @ApiParam({ name: 'status', description: 'New status: released, in_progress, completed, cancelled' })
  @ApiResponse({ status: 200, description: 'Status updated' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  @ApiResponse({ status: 404, description: 'Production order not found' })
  async updateStatus(
    @Request() req,
    @Param('id') id: string,
    @Param('status') status: string,
  ) {
    return this.productionOrdersService.updateStatus(
      req.user.tenantId,
      req.user.id,
      id,
      status,
    );
  }

  @Delete(':id')
  @RequirePermissions('INVENTORY:DELETE')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete production order (soft delete)' })
  @ApiParam({ name: 'id', description: 'Production order UUID' })
  @ApiResponse({ status: 200, description: 'Production order deleted' })
  @ApiResponse({ status: 400, description: 'Can only delete draft orders' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  @ApiResponse({ status: 404, description: 'Production order not found' })
  async remove(@Request() req, @Param('id') id: string) {
    return this.productionOrdersService.remove(req.user.tenantId, req.user.id, id);
  }
}
