// --- categories/categories.controller.ts ---
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
import { CategoriesService } from './categories.service';
import { CreateCategoryDto } from './dto/create-category.dto';
import { UpdateCategoryDto } from './dto/update-category.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('Categories')
@Controller('categories')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('JWT-auth')
export class CategoriesController {
  constructor(private readonly categoriesService: CategoriesService) {}

  @Post()
  @RequirePermissions('INVENTORY:CREATE')
  @ApiOperation({ summary: 'Create category (must belong to a MacroCategory)' })
  @ApiResponse({ status: 201, description: 'Category created successfully' })
  @ApiResponse({ status: 404, description: 'MacroCategory not found' })
  async create(@Request() req, @Body() dto: CreateCategoryDto) {
    return this.categoriesService.create(req.user.tenantId, req.user.id, dto);
  }

  @Get()
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get all categories' })
  @ApiQuery({ name: 'macroCategoryId', required: false, description: 'Filter by macro category' })
  @ApiResponse({ status: 200, description: 'List of categories with GL accounts and item counts' })
  async findAll(@Request() req, @Query('macroCategoryId') macroCategoryId?: string) {
    return this.categoriesService.findAll(req.user.tenantId, macroCategoryId);
  }

  @Get(':id')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get category by ID' })
  @ApiParam({ name: 'id', description: 'Category UUID' })
  @ApiResponse({ status: 200, description: 'Category details' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  async findOne(@Request() req, @Param('id') id: string) {
    return this.categoriesService.findOne(req.user.tenantId, id);
  }

  @Patch(':id')
  @RequirePermissions('INVENTORY:EDIT')
  @ApiOperation({ summary: 'Update category' })
  @ApiParam({ name: 'id', description: 'Category UUID' })
  @ApiResponse({ status: 200, description: 'Category updated successfully' })
  @ApiResponse({
    status: 404,
    description: 'Category, macro category, or GL account not found in tenant',
  })
  async update(@Request() req, @Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    return this.categoriesService.update(req.user.tenantId, req.user.id, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('INVENTORY:DELETE')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete category (soft delete — fails if has items)' })
  @ApiParam({ name: 'id', description: 'Category UUID' })
  @ApiResponse({ status: 200, description: 'Category deleted successfully' })
  @ApiResponse({ status: 400, description: 'Cannot delete — has items assigned' })
  @ApiResponse({ status: 404, description: 'Category not found' })
  async remove(@Request() req, @Param('id') id: string) {
    return this.categoriesService.remove(req.user.tenantId, req.user.id, id);
  }
}
