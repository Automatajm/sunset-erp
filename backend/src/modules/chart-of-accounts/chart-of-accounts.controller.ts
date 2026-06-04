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
import { ChartOfAccountsService } from './chart-of-accounts.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('Chart of Accounts')
@Controller('chart-of-accounts')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('JWT-auth')
export class ChartOfAccountsController {
  constructor(private readonly chartOfAccountsService: ChartOfAccountsService) {}

  @Post()
  @RequirePermissions('ACCOUNTING:CREATE')
  @ApiOperation({ summary: 'Create a new account' })
  @ApiResponse({ status: 201, description: 'Account created successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  @ApiResponse({ status: 409, description: 'Account code already exists' })
  async create(@Request() req, @Body() createAccountDto: CreateAccountDto) {
    return this.chartOfAccountsService.create(req.user.tenantId, req.user.id, createAccountDto);
  }

  @Get()
  @RequirePermissions('ACCOUNTING:VIEW')
  @ApiOperation({ summary: 'Get all accounts' })
  @ApiQuery({ name: 'accountType', required: false, description: 'Filter by account type' })
  @ApiResponse({ status: 200, description: 'List of accounts' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  async findAll(@Request() req, @Query('accountType') accountType?: string) {
    return this.chartOfAccountsService.findAll(req.user.tenantId, accountType);
  }

  @Get('by-type')
  @RequirePermissions('ACCOUNTING:VIEW')
  @ApiOperation({ summary: 'Get accounts grouped by type' })
  @ApiResponse({ status: 200, description: 'Accounts grouped by type' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  async getByType(@Request() req) {
    return this.chartOfAccountsService.getAccountsByType(req.user.tenantId);
  }

  @Get('code/:code')
  @RequirePermissions('ACCOUNTING:VIEW')
  @ApiOperation({ summary: 'Get account by code' })
  @ApiParam({ name: 'code', description: 'Account code' })
  @ApiResponse({ status: 200, description: 'Account details' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  @ApiResponse({ status: 404, description: 'Account not found' })
  async getByCode(@Request() req, @Param('code') code: string) {
    return this.chartOfAccountsService.getByCode(req.user.tenantId, code);
  }

  @Get(':id')
  @RequirePermissions('ACCOUNTING:VIEW')
  @ApiOperation({ summary: 'Get account by ID' })
  @ApiParam({ name: 'id', description: 'Account UUID' })
  @ApiResponse({ status: 200, description: 'Account details' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  @ApiResponse({ status: 404, description: 'Account not found' })
  async findOne(@Request() req, @Param('id') id: string) {
    return this.chartOfAccountsService.findOne(req.user.tenantId, id);
  }

  @Patch(':id')
  @RequirePermissions('ACCOUNTING:EDIT')
  @ApiOperation({ summary: 'Update account' })
  @ApiParam({ name: 'id', description: 'Account UUID' })
  @ApiResponse({ status: 200, description: 'Account updated successfully' })
  @ApiResponse({
    status: 400,
    description: 'Cannot change accountNumber/accountType of a system account',
  })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  @ApiResponse({ status: 404, description: 'Account not found' })
  @ApiResponse({ status: 409, description: 'Account code already exists' })
  async update(
    @Request() req,
    @Param('id') id: string,
    @Body() updateAccountDto: UpdateAccountDto,
  ) {
    return this.chartOfAccountsService.update(req.user.tenantId, req.user.id, id, updateAccountDto);
  }

  @Delete(':id')
  @RequirePermissions('ACCOUNTING:DELETE')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete account (soft delete)' })
  @ApiParam({ name: 'id', description: 'Account UUID' })
  @ApiResponse({ status: 200, description: 'Account deleted successfully' })
  @ApiResponse({
    status: 400,
    description: 'Cannot delete system account, or active child accounts still reference it',
  })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  @ApiResponse({ status: 404, description: 'Account not found' })
  async remove(@Request() req, @Param('id') id: string) {
    return this.chartOfAccountsService.remove(req.user.tenantId, req.user.id, id);
  }
}
