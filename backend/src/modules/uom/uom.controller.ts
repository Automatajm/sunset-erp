// --- uom/uom.controller.ts ---
import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiParam } from '@nestjs/swagger';
import { UomService } from './uom.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('UOM')
@Controller('uom')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('JWT-auth')
export class UomController {
  constructor(private readonly uomService: UomService) {}

  @Get('units')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get all UOM units' })
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'volume | mass | count | length | area | time',
  })
  @ApiQuery({ name: 'system', required: false, description: 'metric | imperial | universal' })
  async findAllUnits(@Query('type') type?: string, @Query('system') system?: string) {
    return this.uomService.findAllUnits({ type, system });
  }

  @Get('units/:id')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get UOM unit by ID' })
  @ApiParam({ name: 'id', description: 'UOM unit UUID' })
  async findOneUnit(@Param('id') id: string) {
    return this.uomService.findOneUnit(id);
  }

  @Get('conversions')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get all UOM conversion factors' })
  async findAllConversions() {
    return this.uomService.findAllConversions();
  }

  @Get('convert')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Convert a quantity between two UOM units' })
  @ApiQuery({ name: 'from', required: true, description: 'Source UOM code e.g. GAL' })
  @ApiQuery({ name: 'to', required: true, description: 'Target UOM code e.g. LTR' })
  @ApiQuery({ name: 'qty', required: true, description: 'Quantity to convert' })
  async convert(@Query('from') from: string, @Query('to') to: string, @Query('qty') qty: string) {
    return this.uomService.convert(from, to, Number(qty));
  }
}
