// ============================================================================
// FILE: backend/src/modules/stock-reconciliation/stock-reconciliation.controller.ts
// ============================================================================
import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Request,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { StockReconciliationService } from './stock-reconciliation.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateCountLineDto } from './dto/update-count-line.dto';
import { ApproveSessionDto } from './dto/approve-session.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('Stock Reconciliation')
@Controller('stock-reconciliation')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('JWT-auth')
export class StockReconciliationController {
  constructor(private readonly service: StockReconciliationService) {}

  @Get()
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'List all cycle count sessions' })
  @ApiQuery({ name: 'warehouseId', required: false })
  @ApiQuery({ name: 'status', required: false })
  findAll(
    @Request() req,
    @Query('warehouseId') warehouseId?: string,
    @Query('status') status?: string,
  ) {
    return this.service.findAll(req.user.tenantId, { warehouseId, status });
  }

  @Get(':id')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get cycle count session with all lines' })
  findOne(@Request() req, @Param('id') id: string) {
    return this.service.findOne(req.user.tenantId, id);
  }

  @Post()
  @RequirePermissions('INVENTORY:CREATE')
  @ApiOperation({ summary: 'Create cycle count session (snapshot current stock)' })
  create(@Request() req, @Body() dto: CreateSessionDto) {
    return this.service.create(req.user.tenantId, req.user.id, dto);
  }

  @Patch(':id/start')
  @RequirePermissions('INVENTORY:CREATE')
  @ApiOperation({ summary: 'Start session — draft → in_progress' })
  start(@Request() req, @Param('id') id: string) {
    return this.service.startSession(req.user.tenantId, req.user.id, id);
  }

  @Patch(':id/lines')
  @RequirePermissions('INVENTORY:COUNT')
  @ApiOperation({ summary: 'Enter physical count for one line — requires INVENTORY:COUNT' })
  updateLine(@Request() req, @Param('id') id: string, @Body() dto: UpdateCountLineDto) {
    return this.service.updateLine(req.user.tenantId, req.user.id, id, dto);
  }

  @Patch(':id/submit')
  @RequirePermissions('INVENTORY:COUNT')
  @ApiOperation({ summary: 'Submit for approval — in_progress → pending_approval' })
  submit(@Request() req, @Param('id') id: string) {
    return this.service.submitForApproval(req.user.tenantId, req.user.id, id);
  }

  @Patch(':id/approve')
  @RequirePermissions('INVENTORY:APPROVE')
  @ApiOperation({
    summary: 'Approve session — pending_approval → approved (INVENTORY:APPROVE required)',
  })
  approve(@Request() req, @Param('id') id: string, @Body() dto: ApproveSessionDto) {
    return this.service.approve(req.user.tenantId, req.user.id, id, dto);
  }

  @Patch(':id/post')
  @RequirePermissions('INVENTORY:APPROVE')
  @ApiOperation({ summary: 'Post adjustments — approved → posted (INVENTORY:APPROVE required)' })
  post(@Request() req, @Param('id') id: string) {
    return this.service.post(req.user.tenantId, req.user.id, id);
  }

  @Patch(':id/cancel')
  @RequirePermissions('INVENTORY:CREATE')
  @ApiOperation({ summary: 'Cancel session (any status except posted/cancelled)' })
  cancel(@Request() req, @Param('id') id: string) {
    return this.service.cancel(req.user.tenantId, req.user.id, id);
  }
}
