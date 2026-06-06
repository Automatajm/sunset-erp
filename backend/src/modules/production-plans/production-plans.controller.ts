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
import { GenerateMosDto, LinkMoDto, FindPlansQueryDto } from './dto/plan-action.dtos';
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
  @ApiResponse({ status: 201, description: 'Draft plan created; bomId auto-resolved per line' })
  @ApiResponse({ status: 400, description: 'Inverted period/line dates or validation error' })
  @ApiResponse({ status: 404, description: 'Item, BOM or SO line not found in tenant' })
  @ApiResponse({ status: 409, description: 'Plan number collision (concurrent) - retry' })
  async create(@Request() req, @Body() dto: CreateProductionPlanDto) {
    return this.service.create(req.user.tenantId, req.user.id, dto);
  }

  @Get()
  @RequirePermissions('MFG:VIEW')
  @ApiOperation({ summary: 'List all Production Plans' })
  @ApiQuery({ name: 'horizon', required: false, enum: ['weekly', 'monthly', 'quarterly'] })
  @ApiQuery({ name: 'status', required: false })
  @ApiResponse({ status: 200, description: 'Envelope { productionPlans, count }' })
  @ApiResponse({ status: 400, description: 'Invalid query parameter' })
  async findAll(@Request() req, @Query() query: FindPlansQueryDto) {
    return this.service.findAll(req.user.tenantId, query.horizon, query.status);
  }

  @Get(':id')
  @RequirePermissions('MFG:VIEW')
  @ApiOperation({ summary: 'Get Production Plan by ID with lines and MO links' })
  @ApiParam({ name: 'id' })
  @ApiResponse({
    status: 200,
    description: 'Plan with lines, BOM/SO/MO joins, Decimals as numbers',
  })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  async findOne(@Request() req, @Param('id') id: string) {
    return this.service.findOne(req.user.tenantId, id);
  }

  @Get(':id/actual-vs-planned')
  @RequirePermissions('MFG:VIEW')
  @ApiOperation({ summary: 'Actual vs Planned summary with MO breakdown per line' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 200, description: 'Per-line variance, completion %, MO summary, totals' })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  async getActualVsPlanned(@Request() req, @Param('id') id: string) {
    return this.service.getActualVsPlanned(req.user.tenantId, id);
  }

  @Patch(':id')
  @RequirePermissions('MFG:EDIT')
  @ApiOperation({ summary: 'Update Production Plan header (draft or confirmed only)' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 200, description: 'Plan updated' })
  @ApiResponse({ status: 400, description: 'Plan not draft/confirmed or inverted dates' })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  async update(@Request() req, @Param('id') id: string, @Body() dto: UpdateProductionPlanDto) {
    return this.service.update(req.user.tenantId, req.user.id, id, dto);
  }

  @Patch(':id/lines/:lineId')
  @RequirePermissions('MFG:EDIT')
  @ApiOperation({ summary: 'Update a plan line (qty, dates, producedQty)' })
  @ApiParam({ name: 'id' })
  @ApiParam({ name: 'lineId' })
  @ApiResponse({ status: 200, description: 'Line updated' })
  @ApiResponse({ status: 404, description: 'Plan or line not found' })
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
  @ApiResponse({ status: 200, description: 'Status transitioned' })
  @ApiResponse({ status: 400, description: 'Illegal transition (lists allowed targets)' })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  async updateStatus(@Request() req, @Param('id') id: string, @Param('status') status: string) {
    return this.service.updateStatus(req.user.tenantId, req.user.id, id, status);
  }

  @Post(':id/generate-mos')
  @RequirePermissions('MFG:CREATE')
  @ApiOperation({ summary: 'Auto-generate MOs from confirmed plan lines (Opción A)' })
  @ApiParam({ name: 'id' })
  @ApiResponse({
    status: 201,
    description: 'MOs created atomically; lines mo_created; plan in_progress',
  })
  @ApiResponse({ status: 400, description: 'Plan not confirmed/in_progress' })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  @ApiResponse({ status: 409, description: 'MO number collision (concurrent) - retry' })
  async generateMos(@Request() req, @Param('id') id: string, @Body() body: GenerateMosDto) {
    return this.service.generateMos(req.user.tenantId, req.user.id, id, body.lineIds);
  }

  @Post(':id/lines/:lineId/link-mo')
  @RequirePermissions('MFG:EDIT')
  @ApiOperation({ summary: 'Link an existing MO to a plan line (Opción B — manual link)' })
  @ApiParam({ name: 'id' })
  @ApiParam({ name: 'lineId' })
  @ApiResponse({ status: 200, description: 'MO linked, line mo_created' })
  @ApiResponse({ status: 400, description: 'Line already has a linked MO' })
  @ApiResponse({ status: 404, description: 'Plan, line or MO not found' })
  @ApiResponse({ status: 409, description: 'MO already linked to another plan line' })
  async linkMo(
    @Request() req,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body() body: LinkMoDto,
  ) {
    return this.service.linkMo(req.user.tenantId, req.user.id, id, lineId, body.moId);
  }

  @Delete(':id')
  @RequirePermissions('MFG:DELETE')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete Production Plan (draft only, soft delete)' })
  @ApiParam({ name: 'id' })
  @ApiResponse({ status: 200, description: 'Plan soft-deleted' })
  @ApiResponse({ status: 400, description: 'Plan is not draft' })
  @ApiResponse({ status: 404, description: 'Plan not found' })
  async remove(@Request() req, @Param('id') id: string) {
    return this.service.remove(req.user.tenantId, req.user.id, id);
  }
}
