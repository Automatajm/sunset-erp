import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
  ApiParam,
} from '@nestjs/swagger';
import { UnitPurpose } from '@prisma/client';
import { ItemsService } from './items.service';
import { CreateItemDto, UpdateItemDto, QueryItemsDto, AddUnitConversionDto } from './dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../auth/guards/permissions.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';

@ApiTags('items')
@ApiBearerAuth('JWT-auth')
@Controller('items')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Post()
  @RequirePermissions('MDM:items:create:tenant')
  @ApiOperation({
    summary: 'Create item',
    description: 'Create a new item in the catalog',
  })
  @ApiResponse({ status: 201, description: 'Item successfully created' })
  @ApiResponse({ status: 409, description: 'Item code already exists' })
  @ApiResponse({ status: 404, description: 'Category or unit not found' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  create(@Body() dto: CreateItemDto, @CurrentUser() user: any) {
    return this.itemsService.create(dto, user.tenantId, user.userId);
  }

  @Get()
  @RequirePermissions('MDM:items:read:tenant')
  @ApiOperation({
    summary: 'List items',
    description: 'Get paginated list of items with filters',
  })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 20 })
  @ApiQuery({ name: 'search', required: false, example: 'laptop' })
  @ApiQuery({ name: 'sortBy', required: false, example: 'createdAt' })
  @ApiQuery({ name: 'sortOrder', required: false, example: 'desc' })
  @ApiQuery({ name: 'itemType', required: false, enum: ['PRODUCT', 'SERVICE', 'FIXED_ASSET', 'TOOL', 'MATERIAL', 'CONSUMABLE'] })
  @ApiQuery({ name: 'categoryId', required: false, example: 'uuid' })
  @ApiQuery({ name: 'isSellable', required: false, type: Boolean })
  @ApiQuery({ name: 'isPurchasable', required: false, type: Boolean })
  @ApiQuery({ name: 'isInventoriable', required: false, type: Boolean })
  @ApiQuery({ name: 'isActive', required: false, type: Boolean, example: true })
  @ApiResponse({ status: 200, description: 'Items retrieved successfully' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  findAll(@Query() query: QueryItemsDto, @CurrentUser() user: any) {
    return this.itemsService.findAll(user.tenantId, query);
  }

  @Get(':id')
  @RequirePermissions('MDM:items:read:tenant')
  @ApiOperation({
    summary: 'Get item',
    description: 'Get item details including unit conversions',
  })
  @ApiParam({ name: 'id', example: 'uuid' })
  @ApiResponse({ status: 200, description: 'Item retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Item not found' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.itemsService.findOne(id, user.tenantId);
  }

  @Patch(':id')
  @RequirePermissions('MDM:items:update:tenant')
  @ApiOperation({
    summary: 'Update item',
    description: 'Update item information',
  })
  @ApiParam({ name: 'id', example: 'uuid' })
  @ApiResponse({ status: 200, description: 'Item updated successfully' })
  @ApiResponse({ status: 404, description: 'Item not found' })
  @ApiResponse({ status: 409, description: 'Item code already exists' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  update(
    @Param('id') id: string,
    @Body() dto: UpdateItemDto,
    @CurrentUser() user: any,
  ) {
    return this.itemsService.update(id, user.tenantId, dto);
  }

  @Delete(':id')
  @RequirePermissions('MDM:items:delete:tenant')
  @ApiOperation({
    summary: 'Delete item',
    description: 'Soft delete an item',
  })
  @ApiParam({ name: 'id', example: 'uuid' })
  @ApiResponse({ status: 200, description: 'Item deleted successfully' })
  @ApiResponse({ status: 404, description: 'Item not found' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.itemsService.remove(id, user.tenantId, user.userId);
  }

  // ============================================
  // UNIT CONVERSIONS
  // ============================================

  @Post(':id/unit-conversions')
  @RequirePermissions('MDM:items:update:tenant')
  @ApiOperation({
    summary: 'Add unit conversion',
    description: 'Add a unit conversion for purchase/storage/consumption/sale',
  })
  @ApiParam({ name: 'id', example: 'uuid', description: 'Item ID' })
  @ApiResponse({ status: 201, description: 'Unit conversion added successfully' })
  @ApiResponse({ status: 404, description: 'Item or unit not found' })
  @ApiResponse({ status: 409, description: 'Unit conversion already exists' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  addUnitConversion(
    @Param('id') id: string,
    @Body() dto: AddUnitConversionDto,
    @CurrentUser() user: any,
  ) {
    return this.itemsService.addUnitConversion(id, user.tenantId, dto);
  }

  @Get(':id/unit-conversions')
  @RequirePermissions('MDM:items:read:tenant')
  @ApiOperation({
    summary: 'Get unit conversions',
    description: 'Get all unit conversions for an item',
  })
  @ApiParam({ name: 'id', example: 'uuid', description: 'Item ID' })
  @ApiQuery({
    name: 'purpose',
    required: false,
    enum: ['PURCHASE', 'STORAGE', 'CONSUMPTION', 'SALE'],
  })
  @ApiResponse({ status: 200, description: 'Unit conversions retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Item not found' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  getUnitConversions(
    @Param('id') id: string,
    @Query('purpose') purpose: UnitPurpose,
    @CurrentUser() user: any,
  ) {
    return this.itemsService.getUnitConversions(id, user.tenantId, purpose);
  }

  @Delete(':id/unit-conversions/:conversionId')
  @RequirePermissions('MDM:items:update:tenant')
  @ApiOperation({
    summary: 'Remove unit conversion',
    description: 'Remove a unit conversion from an item',
  })
  @ApiParam({ name: 'id', example: 'uuid', description: 'Item ID' })
  @ApiParam({ name: 'conversionId', example: 'uuid', description: 'Conversion ID' })
  @ApiResponse({ status: 200, description: 'Unit conversion removed successfully' })
  @ApiResponse({ status: 404, description: 'Item or conversion not found' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  removeUnitConversion(
    @Param('id') id: string,
    @Param('conversionId') conversionId: string,
    @CurrentUser() user: any,
  ) {
    return this.itemsService.removeUnitConversion(id, conversionId, user.tenantId);
  }

  // ============================================
  // CONVERSIONS & CALCULATIONS
  // ============================================

  @Get(':id/convert')
  @RequirePermissions('MDM:items:read:tenant')
  @ApiOperation({
    summary: 'Convert quantity',
    description: 'Convert quantity from one unit to another',
  })
  @ApiParam({ name: 'id', example: 'uuid', description: 'Item ID' })
  @ApiQuery({ name: 'fromUnitId', required: true, example: 'uuid' })
  @ApiQuery({ name: 'toUnitId', required: true, example: 'uuid' })
  @ApiQuery({ name: 'quantity', required: true, example: 100 })
  @ApiResponse({ status: 200, description: 'Quantity converted successfully' })
  @ApiResponse({ status: 404, description: 'Item not found' })
  @ApiResponse({ status: 400, description: 'Invalid conversion' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  convertQuantity(
    @Param('id') id: string,
    @Query('fromUnitId') fromUnitId: string,
    @Query('toUnitId') toUnitId: string,
    @Query('quantity') quantity: string,
    @CurrentUser() user: any,
  ) {
    return this.itemsService.convertQuantity(
      id,
      user.tenantId,
      fromUnitId,
      toUnitId,
      parseFloat(quantity),
    );
  }

  @Get(':id/stock-in-all-units')
  @RequirePermissions('MDM:items:read:tenant')
  @ApiOperation({
    summary: 'Get stock in all units',
    description: 'Get current stock converted to all configured units',
  })
  @ApiParam({ name: 'id', example: 'uuid', description: 'Item ID' })
  @ApiResponse({ status: 200, description: 'Stock retrieved in all units' })
  @ApiResponse({ status: 404, description: 'Item not found' })
  @ApiResponse({ status: 400, description: 'Item not inventoriable or no stock' })
  @ApiResponse({ status: 403, description: 'Insufficient permissions' })
  getStockInAllUnits(@Param('id') id: string, @CurrentUser() user: any) {
    return this.itemsService.getStockInAllUnits(id, user.tenantId);
  }
}