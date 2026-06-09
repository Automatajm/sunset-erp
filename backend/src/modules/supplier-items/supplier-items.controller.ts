// --- supplier-items/supplier-items.controller.ts ---
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { SupplierItemsService } from './supplier-items.service';
import { CreateSupplierItemDto } from './dto/create-supplier-item.dto';
import { UpdateSupplierItemDto } from './dto/update-supplier-item.dto';
import { UpdateSupplierItemPriceDto } from './dto/update-price.dto';
import { FindSupplierItemsQueryDto } from './dto/find-supplier-items-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('Supplier Items')
@Controller('supplier-items')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('JWT-auth')
export class SupplierItemsController {
  constructor(private readonly supplierItemsService: SupplierItemsService) {}

  @Post()
  @RequirePermissions('INVENTORY:CREATE')
  @ApiOperation({
    summary: 'Create supplier-item relationship with auto conversion factor from catalog',
  })
  @ApiResponse({ status: 201, description: 'Supplier item created successfully' })
  @ApiResponse({ status: 409, description: 'Supplier already has an entry for this item' })
  async create(@Request() req, @Body() dto: CreateSupplierItemDto) {
    return this.supplierItemsService.create(req.user.tenantId, req.user.id, dto);
  }

  @Get()
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get supplier-item relationships' })
  @ApiQuery({ name: 'itemId', required: false, description: 'Filter by item' })
  @ApiQuery({ name: 'supplierId', required: false, description: 'Filter by supplier' })
  @ApiQuery({ name: 'isPreferred', required: false, description: 'true | false' })
  @ApiResponse({
    status: 200,
    description: 'Envelope { supplierItems, count } with conversion preview',
  })
  @ApiResponse({ status: 400, description: 'Invalid query parameter' })
  async findAll(@Request() req, @Query() query: FindSupplierItemsQueryDto) {
    return this.supplierItemsService.findAll(req.user.tenantId, {
      itemId: query.itemId,
      supplierId: query.supplierId,
      isPreferred:
        query.isPreferred === 'true' ? true : query.isPreferred === 'false' ? false : undefined,
    });
  }

  @Get('by-item/:itemId')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get all suppliers for a specific item' })
  @ApiParam({ name: 'itemId', description: 'Item UUID' })
  @ApiResponse({ status: 200, description: 'Suppliers for this item ordered by preferred first' })
  async findByItem(@Request() req, @Param('itemId') itemId: string) {
    return this.supplierItemsService.findByItem(req.user.tenantId, itemId);
  }

  @Get('by-supplier/:supplierId')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get all items for a specific supplier' })
  @ApiParam({ name: 'supplierId', description: 'Supplier UUID' })
  @ApiResponse({ status: 200, description: 'Items sourced from this supplier' })
  async findBySupplier(@Request() req, @Param('supplierId') supplierId: string) {
    return this.supplierItemsService.findBySupplier(req.user.tenantId, supplierId);
  }

  // NOTE: static GET routes must precede @Get(':id') so they are not captured as an id.

  @Get('expiring-prices')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({
    summary: 'List supplier-items whose price is expiring within a window (or all with an expiry)',
  })
  @ApiQuery({
    name: 'daysAhead',
    required: false,
    description: 'Window in days (alias: days). Omit for every priced row with an expiry date.',
  })
  @ApiQuery({ name: 'days', required: false, description: 'Alias of daysAhead' })
  @ApiResponse({ status: 200, description: 'Rows with expiryStatus + daysUntilExpiry' })
  async expiringPrices(
    @Request() req,
    @Query('daysAhead') daysAhead?: string,
    @Query('days') days?: string,
  ) {
    const raw = daysAhead ?? days;
    const parsed = raw != null && raw !== '' ? parseInt(raw, 10) : undefined;
    return this.supplierItemsService.expiringPrices(
      req.user.tenantId,
      parsed != null && !Number.isNaN(parsed) ? parsed : undefined,
    );
  }

  @Get('counts-by-supplier')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Count of active supplier-items per supplier' })
  @ApiResponse({ status: 200, description: 'Map { supplierId: count }' })
  async countsBySupplier(@Request() req) {
    return this.supplierItemsService.countsBySupplier(req.user.tenantId);
  }

  @Get('counts-by-item')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Count of active suppliers per item' })
  @ApiResponse({ status: 200, description: 'Map { itemId: count }' })
  async countsByItem(@Request() req) {
    return this.supplierItemsService.countsByItem(req.user.tenantId);
  }

  @Get(':id')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get supplier-item by ID' })
  @ApiParam({ name: 'id', description: 'SupplierItem UUID' })
  @ApiResponse({ status: 200, description: 'Supplier item details' })
  @ApiResponse({ status: 404, description: 'Supplier item not found' })
  async findOne(@Request() req, @Param('id') id: string) {
    return this.supplierItemsService.findOne(req.user.tenantId, id);
  }

  @Get(':id/price-history')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Price-history timeline for a supplier-item (newest first)' })
  @ApiParam({ name: 'id', description: 'SupplierItem UUID' })
  @ApiResponse({ status: 200, description: 'SupplierItemPriceHistory rows' })
  @ApiResponse({ status: 404, description: 'Supplier item not found' })
  async priceHistory(@Request() req, @Param('id') id: string) {
    return this.supplierItemsService.priceHistory(req.user.tenantId, id);
  }

  @Patch(':id/price')
  @RequirePermissions('INVENTORY:EDIT')
  @ApiOperation({
    summary: 'Update the current price and append a price-history record',
  })
  @ApiParam({ name: 'id', description: 'SupplierItem UUID' })
  @ApiResponse({ status: 200, description: 'Updated supplier-item with the new price' })
  @ApiResponse({ status: 404, description: 'Supplier item (or referenced RFQ) not found' })
  async updatePrice(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdateSupplierItemPriceDto,
  ) {
    return this.supplierItemsService.updatePrice(req.user.tenantId, req.user.id, id, dto);
  }

  @Patch(':id')
  @RequirePermissions('INVENTORY:EDIT')
  @ApiOperation({
    summary: 'Update supplier-item (setting isPreferred=true clears others for this item)',
  })
  @ApiParam({ name: 'id', description: 'SupplierItem UUID' })
  @ApiResponse({ status: 200, description: 'Supplier item updated successfully' })
  @ApiResponse({ status: 404, description: 'Supplier item not found' })
  async update(@Request() req, @Param('id') id: string, @Body() dto: UpdateSupplierItemDto) {
    return this.supplierItemsService.update(req.user.tenantId, req.user.id, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('INVENTORY:DELETE')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete supplier-item (soft delete)' })
  @ApiParam({ name: 'id', description: 'SupplierItem UUID' })
  @ApiResponse({ status: 200, description: 'Supplier item deleted successfully' })
  @ApiResponse({ status: 404, description: 'Supplier item not found' })
  async remove(@Request() req, @Param('id') id: string) {
    return this.supplierItemsService.remove(req.user.tenantId, req.user.id, id);
  }
}
