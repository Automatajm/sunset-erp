import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
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
import { StockTransactionsService } from './stock-transactions.service';
import { CreateStockTransactionDto } from './dto/create-stock-transaction.dto';
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

  @Get()
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get all stock transactions with filters' })
  @ApiQuery({ name: 'itemId', required: false, description: 'Filter by item' })
  @ApiQuery({ name: 'warehouseId', required: false, description: 'Filter by warehouse' })
  @ApiQuery({ name: 'transactionType', required: false, description: 'Filter by type' })
  @ApiResponse({ status: 200, description: 'List of stock transactions' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  async findAll(
    @Request() req,
    @Query('itemId') itemId?: string,
    @Query('warehouseId') warehouseId?: string,
    @Query('transactionType') transactionType?: string,
  ) {
    return this.stockTransactionsService.findAll(req.user.tenantId, {
      itemId,
      warehouseId,
      transactionType,
    });
  }

  @Get('balance')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get current stock balance' })
  @ApiQuery({ name: 'itemId', required: false, description: 'Filter by item' })
  @ApiQuery({ name: 'warehouseId', required: false, description: 'Filter by warehouse' })
  @ApiResponse({ status: 200, description: 'Current stock balances' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  async getStockBalance(
    @Request() req,
    @Query('itemId') itemId?: string,
    @Query('warehouseId') warehouseId?: string,
  ) {
    return this.stockTransactionsService.getStockBalance(req.user.tenantId, {
      itemId,
      warehouseId,
    });
  }

  @Get('valuation')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Inventory valuation — onHand × WAC unit cost per item/warehouse' })
  @ApiQuery({ name: 'warehouseId', required: false })
  @ApiQuery({ name: 'itemType',    required: false, description: 'raw_material | finished_good | consumable' })
  @ApiResponse({ status: 200, description: 'Inventory valuation report' })
  async getValuation(
    @Request() req,
    @Query('warehouseId') warehouseId?: string,
    @Query('itemType')    itemType?: string,
  ) {
    return this.stockTransactionsService.getValuation(req.user.tenantId, { warehouseId, itemType });
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
