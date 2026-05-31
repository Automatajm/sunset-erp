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
import { FiscalPeriodsService } from './fiscal-periods.service';
import { CreateFiscalPeriodDto } from './dto/create-fiscal-period.dto';
import { UpdateFiscalPeriodDto } from './dto/update-fiscal-period.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('Fiscal Periods')
@Controller('fiscal-periods')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('JWT-auth')
export class FiscalPeriodsController {
  constructor(private readonly fiscalPeriodsService: FiscalPeriodsService) {}

  @Post()
  @RequirePermissions('ACCOUNTING:CREATE')
  @ApiOperation({ summary: 'Create a new fiscal period' })
  @ApiResponse({ status: 201, description: 'Fiscal period created successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  @ApiResponse({ status: 409, description: 'Period code already exists' })
  async create(@Request() req, @Body() createFiscalPeriodDto: CreateFiscalPeriodDto) {
    return this.fiscalPeriodsService.create(req.user.tenantId, req.user.id, createFiscalPeriodDto);
  }

  @Get()
  @RequirePermissions('ACCOUNTING:VIEW')
  @ApiOperation({ summary: 'Get all fiscal periods' })
  @ApiQuery({ name: 'fiscalYear', required: false, description: 'Filter by fiscal year' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status' })
  @ApiResponse({ status: 200, description: 'List of fiscal periods' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  async findAll(
    @Request() req,
    @Query('fiscalYear') fiscalYear?: string,
    @Query('status') status?: string,
  ) {
    return this.fiscalPeriodsService.findAll(req.user.tenantId, fiscalYear, status);
  }

  @Get('current')
  @RequirePermissions('ACCOUNTING:VIEW')
  @ApiOperation({ summary: 'Get current fiscal period' })
  @ApiResponse({ status: 200, description: 'Current fiscal period' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  @ApiResponse({ status: 404, description: 'No current period defined' })
  async getCurrentPeriod(@Request() req) {
    return this.fiscalPeriodsService.getCurrentPeriod(req.user.tenantId);
  }

  @Get(':id')
  @RequirePermissions('ACCOUNTING:VIEW')
  @ApiOperation({ summary: 'Get fiscal period by ID' })
  @ApiParam({ name: 'id', description: 'Fiscal period UUID' })
  @ApiResponse({ status: 200, description: 'Fiscal period details' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  @ApiResponse({ status: 404, description: 'Fiscal period not found' })
  async findOne(@Request() req, @Param('id') id: string) {
    return this.fiscalPeriodsService.findOne(req.user.tenantId, id);
  }

  @Patch(':id')
  @RequirePermissions('ACCOUNTING:EDIT')
  @ApiOperation({ summary: 'Update fiscal period' })
  @ApiParam({ name: 'id', description: 'Fiscal period UUID' })
  @ApiResponse({ status: 200, description: 'Fiscal period updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  @ApiResponse({ status: 404, description: 'Fiscal period not found' })
  @ApiResponse({ status: 409, description: 'Period code already exists' })
  async update(
    @Request() req,
    @Param('id') id: string,
    @Body() updateFiscalPeriodDto: UpdateFiscalPeriodDto,
  ) {
    return this.fiscalPeriodsService.update(
      req.user.tenantId,
      req.user.id,
      id,
      updateFiscalPeriodDto,
    );
  }

  @Patch(':id/close')
  @RequirePermissions('ACCOUNTING:POST')
  @ApiOperation({ summary: 'Close fiscal period' })
  @ApiParam({ name: 'id', description: 'Fiscal period UUID' })
  @ApiResponse({ status: 200, description: 'Period closed successfully' })
  @ApiResponse({ status: 400, description: 'Period already closed or has unposted entries' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  async closePeriod(@Request() req, @Param('id') id: string) {
    return this.fiscalPeriodsService.closePeriod(req.user.tenantId, req.user.id, id);
  }

  @Patch(':id/reopen')
  @RequirePermissions('ACCOUNTING:POST')
  @ApiOperation({ summary: 'Reopen closed fiscal period' })
  @ApiParam({ name: 'id', description: 'Fiscal period UUID' })
  @ApiResponse({ status: 200, description: 'Period reopened successfully' })
  @ApiResponse({ status: 400, description: 'Only closed periods can be reopened' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  async reopenPeriod(@Request() req, @Param('id') id: string) {
    return this.fiscalPeriodsService.reopenPeriod(req.user.tenantId, req.user.id, id);
  }

  @Patch(':id/lock')
  @RequirePermissions('ACCOUNTING:POST')
  @ApiOperation({ summary: 'Lock fiscal period (prevent any changes)' })
  @ApiParam({ name: 'id', description: 'Fiscal period UUID' })
  @ApiResponse({ status: 200, description: 'Period locked successfully' })
  @ApiResponse({ status: 400, description: 'Only closed periods can be locked' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  async lockPeriod(@Request() req, @Param('id') id: string) {
    return this.fiscalPeriodsService.lockPeriod(req.user.tenantId, req.user.id, id);
  }

  @Patch(':id/unlock')
  @RequirePermissions('ACCOUNTING:POST')
  @ApiOperation({ summary: 'Unlock locked fiscal period' })
  @ApiParam({ name: 'id', description: 'Fiscal period UUID' })
  @ApiResponse({ status: 200, description: 'Period unlocked successfully' })
  @ApiResponse({ status: 400, description: 'Only locked periods can be unlocked' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  async unlockPeriod(@Request() req, @Param('id') id: string) {
    return this.fiscalPeriodsService.unlockPeriod(req.user.tenantId, req.user.id, id);
  }

  @Delete(':id')
  @RequirePermissions('ACCOUNTING:DELETE')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete fiscal period (soft delete)' })
  @ApiParam({ name: 'id', description: 'Fiscal period UUID' })
  @ApiResponse({ status: 200, description: 'Fiscal period deleted successfully' })
  @ApiResponse({
    status: 400,
    description: 'Cannot delete closed/locked periods or periods with entries',
  })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  async remove(@Request() req, @Param('id') id: string) {
    return this.fiscalPeriodsService.remove(req.user.tenantId, req.user.id, id);
  }
}
