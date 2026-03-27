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
import { CashFlowService } from './cash-flow.service';
import { CreateCashFlowProjectionDto } from './dto/create-cash-flow-projection.dto';
import { UpdateCashFlowProjectionDto } from './dto/update-cash-flow-projection.dto';
import { CreateCashFlowLineDto } from './dto/create-cash-flow-line.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('Cash Flow Projection')
@Controller('cash-flow')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('JWT-auth')
export class CashFlowController {
  constructor(private readonly cashFlowService: CashFlowService) {}

  @Post()
  @RequirePermissions('ACCOUNTING:CREATE')
  @ApiOperation({ summary: 'Create a new cash flow projection' })
  @ApiResponse({ status: 201, description: 'Projection created successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  @ApiResponse({ status: 409, description: 'Projection code already exists' })
  async create(
    @Request() req,
    @Body() createCashFlowProjectionDto: CreateCashFlowProjectionDto,
  ) {
    return this.cashFlowService.create(
      req.user.tenantId,
      req.user.id,
      createCashFlowProjectionDto,
    );
  }

  @Get()
  @RequirePermissions('ACCOUNTING:VIEW')
  @ApiOperation({ summary: 'Get all cash flow projections' })
  @ApiQuery({
    name: 'scenario',
    required: false,
    description: 'Filter by scenario (optimistic/realistic/pessimistic)',
  })
  @ApiResponse({ status: 200, description: 'List of cash flow projections' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  async findAll(@Request() req, @Query('scenario') scenario?: string) {
    return this.cashFlowService.findAll(req.user.tenantId, scenario);
  }

  @Get(':id')
  @RequirePermissions('ACCOUNTING:VIEW')
  @ApiOperation({ summary: 'Get cash flow projection by ID' })
  @ApiParam({ name: 'id', description: 'Projection UUID' })
  @ApiResponse({ status: 200, description: 'Projection details' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  @ApiResponse({ status: 404, description: 'Projection not found' })
  async findOne(@Request() req, @Param('id') id: string) {
    return this.cashFlowService.findOne(req.user.tenantId, id);
  }

  @Patch(':id')
  @RequirePermissions('ACCOUNTING:EDIT')
  @ApiOperation({ summary: 'Update cash flow projection' })
  @ApiParam({ name: 'id', description: 'Projection UUID' })
  @ApiResponse({ status: 200, description: 'Projection updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  @ApiResponse({ status: 404, description: 'Projection not found' })
  async update(
    @Request() req,
    @Param('id') id: string,
    @Body() updateCashFlowProjectionDto: UpdateCashFlowProjectionDto,
  ) {
    return this.cashFlowService.update(
      req.user.tenantId,
      req.user.id,
      id,
      updateCashFlowProjectionDto,
    );
  }

  @Delete(':id')
  @RequirePermissions('ACCOUNTING:DELETE')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete cash flow projection (soft delete)' })
  @ApiParam({ name: 'id', description: 'Projection UUID' })
  @ApiResponse({ status: 200, description: 'Projection deleted successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  async remove(@Request() req, @Param('id') id: string) {
    return this.cashFlowService.remove(req.user.tenantId, req.user.id, id);
  }

  // ============================================================================
  // CASH FLOW LINES
  // ============================================================================

  @Post(':id/lines')
  @RequirePermissions('ACCOUNTING:CREATE')
  @ApiOperation({ summary: 'Add cash flow line' })
  @ApiParam({ name: 'id', description: 'Projection UUID' })
  @ApiResponse({ status: 201, description: 'Cash flow line added successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  async addCashFlowLine(
    @Request() req,
    @Param('id') id: string,
    @Body() createCashFlowLineDto: CreateCashFlowLineDto,
  ) {
    return this.cashFlowService.addCashFlowLine(
      req.user.tenantId,
      req.user.id,
      id,
      createCashFlowLineDto,
    );
  }

  @Patch(':id/lines/:lineId')
  @RequirePermissions('ACCOUNTING:EDIT')
  @ApiOperation({ summary: 'Update cash flow line' })
  @ApiParam({ name: 'id', description: 'Projection UUID' })
  @ApiParam({ name: 'lineId', description: 'Cash flow line UUID' })
  @ApiResponse({ status: 200, description: 'Cash flow line updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  async updateCashFlowLine(
    @Request() req,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body() updateData: Partial<CreateCashFlowLineDto>,
  ) {
    return this.cashFlowService.updateCashFlowLine(
      req.user.tenantId,
      req.user.id,
      id,
      lineId,
      updateData,
    );
  }

  @Delete(':id/lines/:lineId')
  @RequirePermissions('ACCOUNTING:DELETE')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete cash flow line' })
  @ApiParam({ name: 'id', description: 'Projection UUID' })
  @ApiParam({ name: 'lineId', description: 'Cash flow line UUID' })
  @ApiResponse({ status: 200, description: 'Cash flow line deleted successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  async removeCashFlowLine(
    @Request() req,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
  ) {
    return this.cashFlowService.removeCashFlowLine(
      req.user.tenantId,
      req.user.id,
      id,
      lineId,
    );
  }

  // ============================================================================
  // CASH FLOW SUMMARY REPORT
  // ============================================================================

  @Get(':id/summary')
  @RequirePermissions('ACCOUNTING:VIEW')
  @ApiOperation({ summary: 'Get cash flow summary report' })
  @ApiParam({ name: 'id', description: 'Projection UUID' })
  @ApiResponse({ status: 200, description: 'Cash flow summary by period' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  async getCashFlowSummary(@Request() req, @Param('id') id: string) {
    return this.cashFlowService.getCashFlowSummary(req.user.tenantId, id);
  }
  @Post(':id/generate-from-data')
  @RequirePermissions('ACCOUNTING:CREATE')
  @ApiOperation({ summary: 'Auto-populate cash flow from AR invoices, POs and budget lines' })
  @ApiParam({ name: 'id', description: 'Projection UUID' })
  @ApiResponse({ status: 201, description: 'Lines generated from data' })
  async generateFromData(
    @Request() req,
    @Param('id') id: string,
    @Body() options: {
      startDate?: string;
      endDate?: string;
      includeAR?: boolean;
      includePO?: boolean;
      includeBudget?: boolean;
    } = {},
  ) {
    return this.cashFlowService.generateFromData(
      req.user.tenantId,
      req.user.id,
      id,
      options,
    );
  }
}
