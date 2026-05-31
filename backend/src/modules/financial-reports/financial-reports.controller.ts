import { Controller, Get, Query, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiQuery } from '@nestjs/swagger';
import { FinancialReportsService } from './financial-reports.service';
import { ReportParametersDto } from './dto/report-parameters.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('Financial Reports')
@Controller('financial-reports')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('JWT-auth')
export class FinancialReportsController {
  constructor(private readonly financialReportsService: FinancialReportsService) {}

  @Get('trial-balance')
  @RequirePermissions('ACCOUNTING:VIEW')
  @ApiOperation({ summary: 'Get Trial Balance report' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Start date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'End date (YYYY-MM-DD)' })
  @ApiQuery({ name: 'fiscalPeriod', required: false, description: 'Fiscal period (YYYY-MM)' })
  @ApiResponse({ status: 200, description: 'Trial Balance report' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  async getTrialBalance(@Request() req, @Query() params: ReportParametersDto) {
    return this.financialReportsService.getTrialBalance(req.user.tenantId, params);
  }

  @Get('profit-and-loss')
  @RequirePermissions('ACCOUNTING:VIEW')
  @ApiOperation({ summary: 'Get Profit & Loss Statement (Income Statement)' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Period start date' })
  @ApiQuery({ name: 'endDate', required: false, description: 'Period end date' })
  @ApiQuery({ name: 'fiscalPeriod', required: false, description: 'Fiscal period (YYYY-MM)' })
  @ApiResponse({ status: 200, description: 'Profit & Loss Statement' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  async getProfitAndLoss(@Request() req, @Query() params: ReportParametersDto) {
    return this.financialReportsService.getProfitAndLoss(req.user.tenantId, params);
  }

  @Get('balance-sheet')
  @RequirePermissions('ACCOUNTING:VIEW')
  @ApiOperation({ summary: 'Get Balance Sheet (Statement of Financial Position)' })
  @ApiQuery({ name: 'endDate', required: false, description: 'As of date (YYYY-MM-DD)' })
  @ApiResponse({ status: 200, description: 'Balance Sheet' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  async getBalanceSheet(@Request() req, @Query() params: ReportParametersDto) {
    return this.financialReportsService.getBalanceSheet(req.user.tenantId, params);
  }

  @Get('general-ledger')
  @RequirePermissions('ACCOUNTING:VIEW')
  @ApiOperation({ summary: 'Get General Ledger detail' })
  @ApiQuery({ name: 'startDate', required: false, description: 'Start date' })
  @ApiQuery({ name: 'endDate', required: false, description: 'End date' })
  @ApiQuery({ name: 'fiscalPeriod', required: false, description: 'Fiscal period' })
  @ApiQuery({ name: 'accountNumber', required: false, description: 'Filter by account number' })
  @ApiResponse({ status: 200, description: 'General Ledger report' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  async getGeneralLedger(@Request() req, @Query() params: ReportParametersDto) {
    return this.financialReportsService.getGeneralLedger(req.user.tenantId, params);
  }
}
