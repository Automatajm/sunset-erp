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
  Query,
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
import { ProductionPlansService } from './production-plans.service';
import { CreateProductionPlanDto } from './dto/create-production-plan.dto';
import {
  UpdateProductionPlanDto,
  UpdateProductionPlanLineDto,
} from './dto/update-production-plan.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('Production Plans')
@Controller('production-plans')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('JWT-auth')
export class ProductionPlansController {
  constructor(private readonly service: ProductionPlansService) {}

  @Post()
  @RequirePermissions('MFG:CREATE')
  @ApiOperation({ summary: 'Create a new Production Plan (PP-YYYY-NNNN)' })
  async create(@Request() req, @Body() dto: CreateProductionPlanDto) {
    return this.service.create(req.user.tenantId, req.user.id, dto);
  }

  @Get()
  @RequirePermissions('MFG:VIEW')
  @ApiOperation({ summary: 'List all Production Plans' })
  @ApiQuery({ name: 'horizon', required: false, enum: ['weekly', 'monthly', 'quarterly'] })
  @ApiQuery({ name: 'status', required: false })
  async findAll(
    @Request() req,
    @Query('horizon') horizon?: string,
    @Query('status') status?: string,
  ) {
    return this.service.findAll(req.user.tenantId, horizon, status);
  }

  @Get(':id')
  @RequirePermissions('MFG:VIEW')
  @ApiOperation({ summary: 'Get Production Plan by ID with lines and MO links' })
  @ApiParam({ name: 'id' })
  async findOne(@Request() req, @Param('id') id: string) {
    return this.service.findOne(req.user.tenantId, id);
  }

  @Get(':id/actual-vs-planned')
  @RequirePermissions('MFG:VIEW')
  @ApiOperation({ summary: 'Actual vs Planned summary with MO breakdown per line' })
  @ApiParam({ name: 'id' })
  async getActualVsPlanned(@Request() req, @Param('id') id: string) {
    return this.service.getActualVsPlanned(req.user.tenantId, id);
  }

  @Patch(':id')
  @RequirePermissions('MFG:EDIT')
  @ApiOperation({ summary: 'Update Production Plan header (draft or confirmed only)' })
  @ApiParam({ name: 'id' })
  async update(@Request() req, @Param('id') id: string, @Body() dto: UpdateProductionPlanDto) {
    return this.service.update(req.user.tenantId, req.user.id, id, dto);
  }

  @Patch(':id/lines/:lineId')
  @RequirePermissions('MFG:EDIT')
  @ApiOperation({ summary: 'Update a plan line (qty, dates, producedQty)' })
  @ApiParam({ name: 'id' })
  @ApiParam({ name: 'lineId' })
  async updateLine(
    @Request() req,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body() dto: UpdateProductionPlanLineDto,
  ) {
    return this.service.updateLine(req.user.tenantId, req.user.id, id, lineId, dto);
  }

  @Patch(':id/status/:status')
  @RequirePermissions('MFG:APPROVE')
  @ApiOperation({
    summary: 'Transition plan status: draft → confirmed → in_progress → completed | cancelled',
  })
  @ApiParam({ name: 'id' })
  @ApiParam({ name: 'status' })
  async updateStatus(@Request() req, @Param('id') id: string, @Param('status') status: string) {
    return this.service.updateStatus(req.user.tenantId, req.user.id, id, status);
  }

  @Post(':id/generate-mos')
  @RequirePermissions('MFG:CREATE')
  @ApiOperation({ summary: 'Auto-generate MOs from confirmed plan lines (Opción A)' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 201, description: 'MOs created and plan lines updated to mo_created' })
  async generateMos(@Request() req, @Param('id') id: string, @Body() body: { lineIds?: string[] }) {
    return this.service.generateMos(req.user.tenantId, req.user.id, id, body.lineIds);
  }

  @Post(':id/lines/:lineId/link-mo')
  @RequirePermissions('MFG:EDIT')
  @ApiOperation({ summary: 'Link an existing MO to a plan line (Opción B — manual link)' })
  @ApiParam({ name: 'id' })
  @ApiParam({ name: 'lineId' })
  async linkMo(
    @Request() req,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body() body: { moId: string },
  ) {
    return this.service.linkMo(req.user.tenantId, req.user.id, id, lineId, body.moId);
  }

  @Delete(':id')
  @RequirePermissions('MFG:DELETE')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete Production Plan (draft only, soft delete)' })
  @ApiParam({ name: 'id' })
  async remove(@Request() req, @Param('id') id: string) {
    return this.service.remove(req.user.tenantId, req.user.id, id);
  }
}
