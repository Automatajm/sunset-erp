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
import { BudgetsService } from './budgets.service';
import { CreateBudgetDto } from './dto/create-budget.dto';
import { UpdateBudgetDto } from './dto/update-budget.dto';
import { CreateBudgetLineDto } from './dto/create-budget-line.dto';
import { UpdateBudgetLineDto } from './dto/update-budget-line.dto';
import { GenerateBudgetFromSoDto } from './dto/generate-budget.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('Budgets')
@Controller('budgets')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('JWT-auth')
export class BudgetsController {
  constructor(private readonly budgetsService: BudgetsService) {}

  @Post()
  @RequirePermissions('ACCOUNTING:CREATE')
  @ApiOperation({ summary: 'Create a new budget' })
  @ApiResponse({ status: 201, description: 'Budget created successfully' })
  @ApiResponse({ status: 409, description: 'Budget code already exists' })
  async create(@Request() req, @Body() createBudgetDto: CreateBudgetDto) {
    return this.budgetsService.create(req.user.tenantId, req.user.id, createBudgetDto);
  }

  @Get()
  @RequirePermissions('ACCOUNTING:VIEW')
  @ApiOperation({ summary: 'Get all budgets' })
  @ApiResponse({ status: 200, description: '{ budgets, count } envelope' })
  @ApiQuery({ name: 'fiscalYear', required: false })
  @ApiQuery({ name: 'status', required: false })
  async findAll(
    @Request() req,
    @Query('fiscalYear') fiscalYear?: string,
    @Query('status') status?: string,
  ) {
    return this.budgetsService.findAll(req.user.tenantId, fiscalYear, status);
  }

  @Get(':id')
  @RequirePermissions('ACCOUNTING:VIEW')
  @ApiOperation({ summary: 'Get budget by ID' })
  @ApiResponse({ status: 200, description: 'Budget with lines' })
  @ApiResponse({ status: 404, description: 'Budget not found' })
  @ApiParam({ name: 'id', description: 'Budget UUID' })
  async findOne(@Request() req, @Param('id') id: string) {
    return this.budgetsService.findOne(req.user.tenantId, id);
  }

  @Patch(':id')
  @RequirePermissions('ACCOUNTING:EDIT')
  @ApiOperation({ summary: 'Update budget' })
  @ApiResponse({ status: 200, description: 'Budget updated' })
  @ApiResponse({ status: 400, description: 'Approved budgets are immutable' })
  @ApiResponse({ status: 404, description: 'Budget not found' })
  @ApiResponse({ status: 409, description: 'Budget code already exists' })
  @ApiParam({ name: 'id', description: 'Budget UUID' })
  async update(@Request() req, @Param('id') id: string, @Body() updateBudgetDto: UpdateBudgetDto) {
    return this.budgetsService.update(req.user.tenantId, req.user.id, id, updateBudgetDto);
  }

  @Delete(':id')
  @RequirePermissions('ACCOUNTING:DELETE')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete budget (soft delete)' })
  @ApiResponse({ status: 200, description: 'Budget deleted' })
  @ApiResponse({ status: 400, description: 'Only draft budgets can be deleted' })
  @ApiResponse({ status: 404, description: 'Budget not found' })
  @ApiParam({ name: 'id', description: 'Budget UUID' })
  async remove(@Request() req, @Param('id') id: string) {
    return this.budgetsService.remove(req.user.tenantId, req.user.id, id);
  }

  // ── Budget Lines ────────────────────────────────────────────────────────────

  @Post(':id/lines')
  @RequirePermissions('ACCOUNTING:CREATE')
  @ApiOperation({ summary: 'Add budget line' })
  @ApiResponse({ status: 201, description: 'Budget line created' })
  @ApiResponse({ status: 400, description: 'Approved budgets cannot take new lines' })
  @ApiResponse({ status: 404, description: 'Budget or account not found' })
  @ApiResponse({ status: 409, description: 'Line for account+period already exists' })
  @ApiParam({ name: 'id', description: 'Budget UUID' })
  async addBudgetLine(
    @Request() req,
    @Param('id') id: string,
    @Body() createBudgetLineDto: CreateBudgetLineDto,
  ) {
    return this.budgetsService.addBudgetLine(
      req.user.tenantId,
      req.user.id,
      id,
      createBudgetLineDto,
    );
  }

  @Patch(':id/lines/:lineId')
  @RequirePermissions('ACCOUNTING:EDIT')
  @ApiOperation({ summary: 'Update budget line' })
  @ApiResponse({ status: 200, description: 'Budget line updated' })
  @ApiResponse({ status: 400, description: 'Approved budgets are immutable' })
  @ApiResponse({ status: 404, description: 'Budget or line not found' })
  @ApiParam({ name: 'id', description: 'Budget UUID' })
  @ApiParam({ name: 'lineId', description: 'Budget line UUID' })
  async updateBudgetLine(
    @Request() req,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body() updateData: UpdateBudgetLineDto,
  ) {
    return this.budgetsService.updateBudgetLine(
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
  @ApiOperation({ summary: 'Delete budget line' })
  @ApiResponse({ status: 200, description: 'Budget line deleted' })
  @ApiResponse({ status: 400, description: 'Approved budgets are immutable' })
  @ApiResponse({ status: 404, description: 'Budget or line not found' })
  @ApiParam({ name: 'id', description: 'Budget UUID' })
  @ApiParam({ name: 'lineId', description: 'Budget line UUID' })
  async removeBudgetLine(@Request() req, @Param('id') id: string, @Param('lineId') lineId: string) {
    return this.budgetsService.removeBudgetLine(req.user.tenantId, req.user.id, id, lineId);
  }

  // ── Approval ────────────────────────────────────────────────────────────────

  @Patch(':id/approve')
  @RequirePermissions('ACCOUNTING:POST')
  @ApiOperation({ summary: 'Approve budget' })
  @ApiResponse({ status: 200, description: 'Budget approved' })
  @ApiResponse({ status: 400, description: 'Already approved or has no lines' })
  @ApiResponse({ status: 404, description: 'Budget not found' })
  @ApiParam({ name: 'id', description: 'Budget UUID' })
  async approveBudget(@Request() req, @Param('id') id: string) {
    return this.budgetsService.approveBudget(req.user.tenantId, req.user.id, id);
  }

  // ── Budget vs Actual ────────────────────────────────────────────────────────

  @Get(':id/vs-actual')
  @RequirePermissions('ACCOUNTING:VIEW')
  @ApiOperation({ summary: 'Get budget vs actual report' })
  @ApiResponse({ status: 200, description: 'Budget vs actual lines with variance' })
  @ApiResponse({ status: 404, description: 'Budget not found' })
  @ApiParam({ name: 'id', description: 'Budget UUID' })
  @ApiQuery({ name: 'startPeriod', required: false, description: 'YYYY-MM' })
  @ApiQuery({ name: 'endPeriod', required: false, description: 'YYYY-MM' })
  async getBudgetVsActual(
    @Request() req,
    @Param('id') id: string,
    @Query('startPeriod') startPeriod?: string,
    @Query('endPeriod') endPeriod?: string,
  ) {
    return this.budgetsService.getBudgetVsActual(req.user.tenantId, id, startPeriod, endPeriod);
  }

  // ── Sprint 8 — MRP Auto-generation ─────────────────────────────────────────

  @Post(':id/generate-from-so')
  @RequirePermissions('ACCOUNTING:CREATE')
  @ApiOperation({
    summary: 'Generate budget lines from Sales Orders via MRP',
    description:
      'Revenue → promisedDate period. Materials + Labor → (promisedDate - leadTimeDays) period.',
  })
  @ApiParam({ name: 'id', description: 'Budget UUID' })
  @ApiResponse({ status: 201, description: 'Budget lines generated' })
  @ApiResponse({ status: 400, description: 'Cannot generate for approved budgets' })
  async generateFromSalesOrders(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: GenerateBudgetFromSoDto,
  ) {
    return this.budgetsService.generateFromSalesOrders(req.user.tenantId, req.user.id, id, dto);
  }
}
