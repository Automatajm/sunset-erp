// --- macro-categories/macro-categories.controller.ts ---
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiResponse } from '@nestjs/swagger';
import { MacroCategoriesService } from './macro-categories.service';
import { CreateMacroCategoryDto } from './dto/create-macro-category.dto';
import { UpdateMacroCategoryDto } from './dto/update-macro-category.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('Macro Categories')
@Controller('macro-categories')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('JWT-auth')
export class MacroCategoriesController {
  constructor(private readonly macroCategoriesService: MacroCategoriesService) {}

  @Post()
  @RequirePermissions('INVENTORY:CREATE')
  @ApiOperation({ summary: 'Create a new macro category' })
  @ApiResponse({ status: 201, description: 'Macro category created successfully' })
  async create(@Request() req, @Body() dto: CreateMacroCategoryDto) {
    return this.macroCategoriesService.create(req.user.tenantId, req.user.id, dto);
  }

  @Get()
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get all macro categories' })
  @ApiResponse({ status: 200, description: 'List of macro categories with category counts' })
  async findAll(@Request() req) {
    return this.macroCategoriesService.findAll(req.user.tenantId);
  }

  @Get(':id')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get macro category with its child categories' })
  @ApiParam({ name: 'id', description: 'MacroCategory UUID' })
  @ApiResponse({ status: 200, description: 'Macro category with child categories' })
  @ApiResponse({ status: 404, description: 'Macro category not found' })
  async findOne(@Request() req, @Param('id') id: string) {
    return this.macroCategoriesService.findOne(req.user.tenantId, id);
  }

  @Patch(':id')
  @RequirePermissions('INVENTORY:EDIT')
  @ApiOperation({ summary: 'Update macro category' })
  @ApiParam({ name: 'id', description: 'MacroCategory UUID' })
  @ApiResponse({ status: 200, description: 'Macro category updated successfully' })
  @ApiResponse({ status: 404, description: 'Macro category not found' })
  async update(@Request() req, @Param('id') id: string, @Body() dto: UpdateMacroCategoryDto) {
    return this.macroCategoriesService.update(req.user.tenantId, req.user.id, id, dto);
  }

  @Delete(':id')
  @RequirePermissions('INVENTORY:DELETE')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete macro category (soft delete — fails if has categories)' })
  @ApiParam({ name: 'id', description: 'MacroCategory UUID' })
  @ApiResponse({ status: 200, description: 'Macro category deleted successfully' })
  @ApiResponse({ status: 400, description: 'Cannot delete — has child categories' })
  @ApiResponse({ status: 404, description: 'Macro category not found' })
  async remove(@Request() req, @Param('id') id: string) {
    return this.macroCategoriesService.remove(req.user.tenantId, req.user.id, id);
  }
}
