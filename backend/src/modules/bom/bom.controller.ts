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
import { BomService } from './bom.service';
import { CreateBomDto } from './dto/create-bom.dto';
import { UpdateBomDto } from './dto/update-bom.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('Bill of Materials (BOM)')
@Controller('bom')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('JWT-auth')
export class BomController {
  constructor(private readonly bomService: BomService) {}

  @Post()
  @RequirePermissions('INVENTORY:CREATE')
  @ApiOperation({ summary: 'Create a new BOM' })
  @ApiResponse({ status: 201, description: 'BOM created successfully' })
  @ApiResponse({ status: 400, description: 'Circular reference detected' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  @ApiResponse({ status: 404, description: 'Item not found' })
  @ApiResponse({ status: 409, description: 'BOM code already exists' })
  async create(@Request() req, @Body() createBomDto: CreateBomDto) {
    return this.bomService.create(req.user.tenantId, req.user.id, createBomDto);
  }

  @Get()
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get all BOMs' })
  @ApiQuery({ name: 'itemId', required: false, description: 'Filter by item' })
  @ApiResponse({ status: 200, description: 'List of BOMs' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  async findAll(@Request() req, @Query('itemId') itemId?: string) {
    return this.bomService.findAll(req.user.tenantId, itemId);
  }

  @Get(':id')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get BOM by ID' })
  @ApiParam({ name: 'id', description: 'BOM UUID' })
  @ApiResponse({ status: 200, description: 'BOM details with components' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  @ApiResponse({ status: 404, description: 'BOM not found' })
  async findOne(@Request() req, @Param('id') id: string) {
    return this.bomService.findOne(req.user.tenantId, id);
  }

  @Get(':id/calculate/:quantity')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Calculate material requirements for production quantity' })
  @ApiParam({ name: 'id', description: 'BOM UUID' })
  @ApiParam({ name: 'quantity', description: 'Production quantity' })
  @ApiResponse({ status: 200, description: 'Material requirements calculated' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  @ApiResponse({ status: 404, description: 'BOM not found' })
  async calculateRequirements(
    @Request() req,
    @Param('id') id: string,
    @Param('quantity') quantity: string,
  ) {
    return this.bomService.calculateMaterialRequirements(
      req.user.tenantId,
      id,
      parseFloat(quantity),
    );
  }

  @Patch(':id')
  @RequirePermissions('INVENTORY:EDIT')
  @ApiOperation({ summary: 'Update BOM' })
  @ApiParam({ name: 'id', description: 'BOM UUID' })
  @ApiResponse({ status: 200, description: 'BOM updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  @ApiResponse({ status: 404, description: 'BOM not found' })
  @ApiResponse({ status: 409, description: 'BOM code already exists' })
  async update(
    @Request() req,
    @Param('id') id: string,
    @Body() updateBomDto: UpdateBomDto,
  ) {
    return this.bomService.update(req.user.tenantId, req.user.id, id, updateBomDto);
  }

  @Delete(':id')
  @RequirePermissions('INVENTORY:DELETE')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete BOM (soft delete)' })
  @ApiParam({ name: 'id', description: 'BOM UUID' })
  @ApiResponse({ status: 200, description: 'BOM deleted successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  @ApiResponse({ status: 404, description: 'BOM not found' })
  async remove(@Request() req, @Param('id') id: string) {
    return this.bomService.remove(req.user.tenantId, req.user.id, id);
  }
}
