import { Controller, Get, Post, Body, Param, UseGuards, Request, Query } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { StockTransactionsService } from './stock-transactions.service';
import { CreateStockTransactionDto } from './dto/create-stock-transaction.dto';
import {
  FindMovementsQueryDto,
  BalanceQueryDto,
  ReportQueryDto,
  PlanningQueryDto,
  TurnoverQueryDto,
  LedgerQueryDto,
} from './dto/query.dtos';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('Stock Transactions')
@Controller('stock-transactions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('JWT-auth')
export class StockTransactionsController {
  constructor(private readonly stockTransactionsService: StockTransactionsService) {}

  @Post()
  @RequirePermissions('INVENTORY:CREATE')
  @ApiOperation({ summary: 'Create stock transaction (receipt, issue, transfer, adjustment)' })
  @ApiResponse({ status: 201, description: 'Transaction created and stock updated' })
  @ApiResponse({ status: 400, description: 'Invalid transaction data' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  @ApiResponse({ status: 404, description: 'Item or warehouse not found' })
  async create(@Request() req, @Body() createStockTransactionDto: CreateStockTransactionDto) {
    return this.stockTransactionsService.create(
      req.user.tenantId,
      req.user.id,
      createStockTransactionDto,
    );
  }

  @Get('abc')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({
    summary: 'ABC Analysis — items ranked by value with cumulative % and A/B/C classification',
  })
  @ApiQuery({ name: 'warehouseId', required: false })
  @ApiQuery({
    name: 'itemType',
    required: false,
    description: 'raw_material | finished_good | consumable',
  })
  @ApiResponse({ status: 200, description: 'ABC Analysis report' })
  @ApiResponse({ status: 400, description: 'Invalid query parameter' })
  async getAbcAnalysis(@Request() req, @Query() query: ReportQueryDto) {
    return this.stockTransactionsService.getAbcAnalysis(req.user.tenantId, {
      warehouseId: query.warehouseId,
      itemType: query.itemType,
    });
  }

  @Get('aging')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({
    summary: 'Stock Aging — days since last movement per item/warehouse, bucketed by age',
  })
  @ApiQuery({ name: 'warehouseId', required: false })
  @ApiQuery({
    name: 'itemType',
    required: false,
    description: 'raw_material | finished_good | consumable',
  })
  @ApiResponse({ status: 200, description: 'Stock aging report' })
  @ApiResponse({ status: 400, description: 'Invalid query parameter' })
  async getStockAging(@Request() req, @Query() query: ReportQueryDto) {
    return this.stockTransactionsService.getStockAging(req.user.tenantId, {
      warehouseId: query.warehouseId,
      itemType: query.itemType,
    });
  }

  @Get()
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get all stock transactions with filters' })
  @ApiQuery({ name: 'itemId', required: false, description: 'Filter by item' })
  @ApiQuery({ name: 'warehouseId', required: false, description: 'Filter by warehouse' })
  @ApiQuery({ name: 'transactionType', required: false, description: 'Filter by type' })
  @ApiResponse({ status: 200, description: 'Envelope { movements, count }' })
  @ApiResponse({ status: 400, description: 'Invalid query parameter' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  async findAll(@Request() req, @Query() query: FindMovementsQueryDto) {
    return this.stockTransactionsService.findAll(req.user.tenantId, {
      itemId: query.itemId,
      warehouseId: query.warehouseId,
      transactionType: query.transactionType,
    });
  }

  @Get('balance')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get current stock balance' })
  @ApiQuery({ name: 'itemId', required: false, description: 'Filter by item' })
  @ApiQuery({ name: 'warehouseId', required: false, description: 'Filter by warehouse' })
  @ApiResponse({ status: 200, description: 'Current stock balances' })
  @ApiResponse({ status: 400, description: 'Invalid query parameter' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  async getStockBalance(@Request() req, @Query() query: BalanceQueryDto) {
    return this.stockTransactionsService.getStockBalance(req.user.tenantId, {
      itemId: query.itemId,
      warehouseId: query.warehouseId,
    });
  }

  @Get('planning')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Stock planning — ATP, alerts, coverage, PO/SO demand' })
  @ApiQuery({ name: 'warehouseId', required: false })
  @ApiQuery({ name: 'itemType', required: false })
  @ApiQuery({ name: 'alertOnly', required: false })
  @ApiResponse({ status: 200, description: 'Stock planning report (rows + summary)' })
  @ApiResponse({ status: 400, description: 'Invalid query parameter' })
  async getStockPlanning(@Request() req, @Query() query: PlanningQueryDto) {
    return this.stockTransactionsService.getStockPlanning(req.user.tenantId, {
      warehouseId: query.warehouseId,
      itemType: query.itemType,
      alertOnly: query.alertOnly === 'true',
    });
  }

  @Get('ledger')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({
    summary: 'Stock ledger — enriched movements with running balance, reference numbers and totals',
  })
  @ApiQuery({ name: 'itemId', required: false })
  @ApiQuery({ name: 'warehouseId', required: false })
  @ApiQuery({
    name: 'itemType',
    required: false,
    description: 'finished_good | raw_material | consumable',
  })
  @ApiQuery({
    name: 'movementType',
    required: false,
    description: 'receipt | issue | transfer | adjustment | opening_balance',
  })
  @ApiQuery({
    name: 'referenceNumber',
    required: false,
    description: 'Filter by document number (INV-2026-0001)',
  })
  @ApiQuery({ name: 'dateFrom', required: false, description: 'YYYY-MM-DD' })
  @ApiQuery({ name: 'dateTo', required: false, description: 'YYYY-MM-DD' })
  @ApiResponse({ status: 200, description: 'Stock ledger with running balance and totals' })
  @ApiResponse({ status: 400, description: 'Invalid query parameter' })
  async getLedger(@Request() req, @Query() query: LedgerQueryDto) {
    return this.stockTransactionsService.getLedger(req.user.tenantId, {
      itemId: query.itemId,
      warehouseId: query.warehouseId,
      itemType: query.itemType,
      movementType: query.movementType,
      referenceNumber: query.referenceNumber,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    });
  }

  @Get('valuation')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Inventory valuation — onHand × WAC unit cost per item/warehouse' })
  @ApiQuery({ name: 'warehouseId', required: false })
  @ApiQuery({
    name: 'itemType',
    required: false,
    description: 'raw_material | finished_good | consumable',
  })
  @ApiResponse({ status: 200, description: 'Inventory valuation report' })
  @ApiResponse({ status: 400, description: 'Invalid query parameter' })
  async getValuation(@Request() req, @Query() query: ReportQueryDto) {
    return this.stockTransactionsService.getValuation(req.user.tenantId, {
      warehouseId: query.warehouseId,
      itemType: query.itemType,
    });
  }

  @Get('turnover')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Inventory Turnover — COGS / Avg Inventory, Days on Hand per item' })
  @ApiQuery({ name: 'warehouseId', required: false })
  @ApiQuery({
    name: 'itemType',
    required: false,
    description: 'raw_material | finished_good | consumable',
  })
  @ApiQuery({
    name: 'dateFrom',
    required: false,
    description: 'YYYY-MM-DD (default: Jan 1 current year)',
  })
  @ApiQuery({ name: 'dateTo', required: false, description: 'YYYY-MM-DD (default: today)' })
  @ApiResponse({ status: 200, description: 'Inventory turnover report' })
  @ApiResponse({ status: 400, description: 'Invalid query parameter' })
  async getInventoryTurnover(@Request() req, @Query() query: TurnoverQueryDto) {
    return this.stockTransactionsService.getInventoryTurnover(req.user.tenantId, {
      warehouseId: query.warehouseId,
      itemType: query.itemType,
      dateFrom: query.dateFrom,
      dateTo: query.dateTo,
    });
  }

  @Get(':id')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get stock transaction by ID' })
  @ApiParam({ name: 'id', description: 'Transaction UUID' })
  @ApiResponse({ status: 200, description: 'Transaction details' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  @ApiResponse({ status: 404, description: 'Transaction not found' })
  async findOne(@Request() req, @Param('id') id: string) {
    return this.stockTransactionsService.findOne(req.user.tenantId, id);
  }
}
