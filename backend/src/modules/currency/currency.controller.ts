// ============================================================================
// FILE: backend/src/modules/currency/currency.controller.ts
// ============================================================================
import { Controller, Get, Post, Body, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { CurrencyService } from './currency.service';
import { CreateExchangeRateDto, QueryExchangeRatesDto } from './dto/create-exchange-rate.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('Exchange Rates')
@Controller('exchange-rates')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('JWT-auth')
export class CurrencyController {
  constructor(private readonly service: CurrencyService) {}

  // ── POST /exchange-rates ──────────────────────────────────────────────────
  @Post()
  @RequirePermissions('SETTINGS:EDIT')
  @ApiOperation({ summary: 'Register an exchange rate for the tenant' })
  @ApiResponse({ status: 201, description: 'Rate created' })
  @ApiResponse({ status: 400, description: 'Validation error or identical currency pair' })
  @ApiResponse({ status: 404, description: 'Currency not in the catalog' })
  @ApiResponse({ status: 409, description: 'Duplicate rate for tenant + pair + date' })
  async create(@Request() req, @Body() dto: CreateExchangeRateDto) {
    return this.service.create(req.user.tenantId, req.user.id, dto);
  }

  // ── GET /exchange-rates ───────────────────────────────────────────────────
  @Get()
  @RequirePermissions('SETTINGS:VIEW')
  @ApiOperation({ summary: 'List tenant exchange rates, newest effective date first' })
  @ApiQuery({ name: 'from', required: false, description: 'Filter by fromCurrency' })
  @ApiQuery({ name: 'to', required: false, description: 'Filter by toCurrency' })
  @ApiResponse({ status: 200, description: '{ exchangeRates: [...], count: n }' })
  async findAll(@Request() req, @Query() query: QueryExchangeRatesDto) {
    return this.service.findAll(req.user.tenantId, { from: query.from, to: query.to });
  }
}
