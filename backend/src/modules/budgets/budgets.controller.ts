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
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  @ApiResponse({ status: 409, description: 'Budget code already exists' })
  async create(@Request() req, @Body() createBudgetDto: CreateBudgetDto) {
    return this.budgetsService.create(
      req.user.tenantId,
      req.user.id,
      createBudgetDto,
    );
  }

  @Get()
  @RequirePermissions('ACCOUNTING:VIEW')
  @ApiOperation({ summary: 'Get all budgets' })
  @ApiQuery({ name: 'fiscalYear', required: false, description: 'Filter by fiscal year' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status (draft/approved)' })
  @ApiResponse({ status: 200, description: 'List of budgets' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
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
  @ApiParam({ name: 'id', description: 'Budget UUID' })
  @ApiResponse({ status: 200, description: 'Budget details' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  @ApiResponse({ status: 404, description: 'Budget not found' })
  async findOne(@Request() req, @Param('id') id: string) {
    return this.budgetsService.findOne(req.user.tenantId, id);
  }

  @Patch(':id')
  @RequirePermissions('ACCOUNTING:EDIT')
  @ApiOperation({ summary: 'Update budget' })
  @ApiParam({ name: 'id', description: 'Budget UUID' })
  @ApiResponse({ status: 200, description: 'Budget updated successfully' })
  @ApiResponse({ status: 400, description: 'Cannot edit approved budgets' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  @ApiResponse({ status: 404, description: 'Budget not found' })
  async update(
    @Request() req,
    @Param('id') id: string,
    @Body() updateBudgetDto: UpdateBudgetDto,
  ) {
    return this.budgetsService.update(
      req.user.tenantId,
      req.user.id,
      id,
      updateBudgetDto,
    );
  }

  @Delete(':id')
  @RequirePermissions('ACCOUNTING:DELETE')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete budget (soft delete)' })
  @ApiParam({ name: 'id', description: 'Budget UUID' })
  @ApiResponse({ status: 200, description: 'Budget deleted successfully' })
  @ApiResponse({ status: 400, description: 'Can only delete draft budgets' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  async remove(@Request() req, @Param('id') id: string) {
    return this.budgetsService.remove(req.user.tenantId, req.user.id, id);
  }

  // ============================================================================
  // BUDGET LINES
  // ============================================================================

  @Post(':id/lines')
  @RequirePermissions('ACCOUNTING:CREATE')
  @ApiOperation({ summary: 'Add budget line' })
  @ApiParam({ name: 'id', description: 'Budget UUID' })
  @ApiResponse({ status: 201, description: 'Budget line added successfully' })
  @ApiResponse({ status: 400, description: 'Cannot add lines to approved budgets' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  @ApiResponse({ status: 409, description: 'Budget line already exists for this account/period' })
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
  @ApiParam({ name: 'id', description: 'Budget UUID' })
  @ApiParam({ name: 'lineId', description: 'Budget line UUID' })
  @ApiResponse({ status: 200, description: 'Budget line updated successfully' })
  @ApiResponse({ status: 400, description: 'Cannot edit lines in approved budgets' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  async updateBudgetLine(
    @Request() req,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
    @Body() updateData: Partial<CreateBudgetLineDto>,
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
  @ApiParam({ name: 'id', description: 'Budget UUID' })
  @ApiParam({ name: 'lineId', description: 'Budget line UUID' })
  @ApiResponse({ status: 200, description: 'Budget line deleted successfully' })
  @ApiResponse({ status: 400, description: 'Cannot delete lines from approved budgets' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  async removeBudgetLine(
    @Request() req,
    @Param('id') id: string,
    @Param('lineId') lineId: string,
  ) {
    return this.budgetsService.removeBudgetLine(
      req.user.tenantId,
      req.user.id,
      id,
      lineId,
    );
  }

  // ============================================================================
  // BUDGET APPROVAL
  // ============================================================================

  @Patch(':id/approve')
  @RequirePermissions('ACCOUNTING:POST')
  @ApiOperation({ summary: 'Approve budget' })
  @ApiParam({ name: 'id', description: 'Budget UUID' })
  @ApiResponse({ status: 200, description: 'Budget approved successfully' })
  @ApiResponse({ status: 400, description: 'Budget already approved or has no lines' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  async approveBudget(@Request() req, @Param('id') id: string) {
    return this.budgetsService.approveBudget(req.user.tenantId, req.user.id, id);
  }

  // ============================================================================
  // BUDGET VS ACTUAL REPORT
  // ============================================================================

  @Get(':id/vs-actual')
  @RequirePermissions('ACCOUNTING:VIEW')
  @ApiOperation({ summary: 'Get budget vs actual report' })
  @ApiParam({ name: 'id', description: 'Budget UUID' })
  @ApiQuery({ name: 'startPeriod', required: false, description: 'Start period (YYYY-MM)' })
  @ApiQuery({ name: 'endPeriod', required: false, description: 'End period (YYYY-MM)' })
  @ApiResponse({ status: 200, description: 'Budget vs actual report' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  async getBudgetVsActual(
    @Request() req,
    @Param('id') id: string,
    @Query('startPeriod') startPeriod?: string,
    @Query('endPeriod') endPeriod?: string,
  ) {
    return this.budgetsService.getBudgetVsActual(
      req.user.tenantId,
      id,
      startPeriod,
      endPeriod,
    );
  }
}
