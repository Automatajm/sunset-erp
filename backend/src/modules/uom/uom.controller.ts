// --- uom/uom.controller.ts ---
import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiParam, ApiResponse } from '@nestjs/swagger';
import { UomService } from './uom.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';
import { ConvertQueryDto } from './dto/convert-query.dto';
import { UnitFilterDto } from './dto/unit-filter.dto';

@ApiTags('UOM')
@Controller('uom')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('JWT-auth')
export class UomController {
  constructor(private readonly uomService: UomService) {}

  @Get('units')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get all UOM units' })
  @ApiResponse({ status: 200, description: 'List of UOM units' })
  @ApiResponse({ status: 400, description: 'Invalid type or system filter' })
  async findAllUnits(@Query() filters: UnitFilterDto) {
    return this.uomService.findAllUnits(filters);
  }

  @Get('units/:id')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get UOM unit by ID' })
  @ApiParam({ name: 'id', description: 'UOM unit UUID' })
  @ApiResponse({ status: 200, description: 'UOM unit details' })
  @ApiResponse({ status: 400, description: 'Malformed UUID' })
  @ApiResponse({ status: 404, description: 'UOM unit not found' })
  async findOneUnit(@Param('id', ParseUUIDPipe) id: string) {
    return this.uomService.findOneUnit(id);
  }

  @Get('conversions')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get all UOM conversion factors' })
  @ApiResponse({ status: 200, description: 'List of UOM conversions with fromUom/toUom' })
  async findAllConversions() {
    return this.uomService.findAllConversions();
  }

  @Get('convert')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Convert a quantity between two UOM units' })
  @ApiResponse({ status: 200, description: 'Conversion result with outputQty and factor' })
  @ApiResponse({ status: 400, description: 'Missing from/to or qty not a positive number' })
  @ApiResponse({ status: 404, description: 'Unknown UOM code or no conversion between codes' })
  async convert(@Query() query: ConvertQueryDto) {
    return this.uomService.convert(query.from, query.to, query.qty);
  }
}
