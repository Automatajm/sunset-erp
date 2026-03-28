// --- supplier-items/supplier-items.controller.ts ---
import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards, Request, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { SupplierItemsService } from './supplier-items.service';
import { CreateSupplierItemDto } from './dto/create-supplier-item.dto';
import { UpdateSupplierItemDto } from './dto/update-supplier-item.dto';
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
  @ApiOperation({ summary: 'Create supplier-item relationship with auto conversion factor from catalog' })
  @ApiResponse({ status: 201, description: 'Supplier item created successfully' })
  @ApiResponse({ status: 409, description: 'Supplier already has an entry for this item' })
  async create(@Request() req, @Body() dto: CreateSupplierItemDto) {
    return this.supplierItemsService.create(req.user.tenantId, req.user.id, dto);
  }
 
  @Get()
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get supplier-item relationships' })
  @ApiQuery({ name: 'itemId',      required: false, description: 'Filter by item' })
  @ApiQuery({ name: 'supplierId',  required: false, description: 'Filter by supplier' })
  @ApiQuery({ name: 'isPreferred', required: false, description: 'true | false' })
  @ApiResponse({ status: 200, description: 'List of supplier-item relationships with conversion preview' })
  async findAll(
    @Request() req,
    @Query('itemId')      itemId?:      string,
    @Query('supplierId')  supplierId?:  string,
    @Query('isPreferred') isPreferred?: string,
  ) {
    return this.supplierItemsService.findAll(req.user.tenantId, {
      itemId,
      supplierId,
      isPreferred: isPreferred === 'true' ? true : isPreferred === 'false' ? false : undefined,
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
 
  @Get(':id')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get supplier-item by ID' })
  @ApiParam({ name: 'id', description: 'SupplierItem UUID' })
  @ApiResponse({ status: 200, description: 'Supplier item details' })
  @ApiResponse({ status: 404, description: 'Supplier item not found' })
  async findOne(@Request() req, @Param('id') id: string) {
    return this.supplierItemsService.findOne(req.user.tenantId, id);
  }
 
  @Patch(':id')
  @RequirePermissions('INVENTORY:EDIT')
  @ApiOperation({ summary: 'Update supplier-item (setting isPreferred=true clears others for this item)' })
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