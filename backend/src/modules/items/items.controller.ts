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
import { ItemsService } from './items.service';
import { CreateItemDto } from './dto/create-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('Items')
@Controller('items')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('JWT-auth')
export class ItemsController {
  constructor(private readonly itemsService: ItemsService) {}

  @Post()
  @RequirePermissions('INVENTORY:CREATE')
  @ApiOperation({ summary: 'Create a new item' })
  @ApiResponse({ status: 201, description: 'Item created successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  @ApiResponse({ status: 409, description: 'Item code already exists' })
  async create(@Request() req, @Body() createItemDto: CreateItemDto) {
    return this.itemsService.create(
      req.user.tenantId,
      req.user.id,
      createItemDto,
    );
  }

  @Get()
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get all items' })
  @ApiQuery({ name: 'itemType', required: false, description: 'Filter by item type' })
  @ApiResponse({ status: 200, description: 'List of items' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  async findAll(@Request() req, @Query('itemType') itemType?: string) {
    return this.itemsService.findAll(req.user.tenantId, itemType);
  }

  @Get('statistics')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get items statistics' })
  @ApiResponse({ status: 200, description: 'Items statistics by type' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  async getStatistics(@Request() req) {
    return this.itemsService.getStatistics(req.user.tenantId);
  }

  @Get(':id')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get item by ID' })
  @ApiParam({ name: 'id', description: 'Item UUID' })
  @ApiResponse({ status: 200, description: 'Item details' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  @ApiResponse({ status: 404, description: 'Item not found' })
  async findOne(@Request() req, @Param('id') id: string) {
    return this.itemsService.findOne(req.user.tenantId, id);
  }

  @Patch(':id')
  @RequirePermissions('INVENTORY:EDIT')
  @ApiOperation({ summary: 'Update item' })
  @ApiParam({ name: 'id', description: 'Item UUID' })
  @ApiResponse({ status: 200, description: 'Item updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  @ApiResponse({ status: 404, description: 'Item not found' })
  @ApiResponse({ status: 409, description: 'Item code already exists' })
  async update(
    @Request() req,
    @Param('id') id: string,
    @Body() updateItemDto: UpdateItemDto,
  ) {
    return this.itemsService.update(
      req.user.tenantId,
      req.user.id,
      id,
      updateItemDto,
    );
  }

  @Delete(':id')
  @RequirePermissions('INVENTORY:DELETE')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete item (soft delete)' })
  @ApiParam({ name: 'id', description: 'Item UUID' })
  @ApiResponse({ status: 200, description: 'Item deleted successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  @ApiResponse({ status: 404, description: 'Item not found' })
  async remove(@Request() req, @Param('id') id: string) {
    return this.itemsService.remove(req.user.tenantId, req.user.id, id);
  }
}
