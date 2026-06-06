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
import { ApiTags, ApiOperation, ApiBearerAuth, ApiQuery, ApiResponse } from '@nestjs/swagger';
import { StockReconciliationService } from './stock-reconciliation.service';
import { CreateSessionDto } from './dto/create-session.dto';
import { UpdateCountLineDto } from './dto/update-count-line.dto';
import { ApproveSessionDto } from './dto/approve-session.dto';
import { FindSessionsQueryDto } from './dto/find-sessions-query.dto';
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
  @ApiResponse({ status: 200, description: 'Envelope { sessions, count }' })
  @ApiResponse({ status: 400, description: 'Invalid query parameter' })
  findAll(@Request() req, @Query() query: FindSessionsQueryDto) {
    return this.service.findAll(req.user.tenantId, {
      warehouseId: query.warehouseId,
      status: query.status,
    });
  }

  @Get(':id')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get cycle count session with all lines' })
  @ApiResponse({ status: 200, description: 'Session with lines, Decimals as numbers' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  findOne(@Request() req, @Param('id') id: string) {
    return this.service.findOne(req.user.tenantId, id);
  }

  @Post()
  @RequirePermissions('INVENTORY:CREATE')
  @ApiOperation({ summary: 'Create cycle count session (snapshot current stock)' })
  @ApiResponse({ status: 201, description: 'Draft session with snapshot lines' })
  @ApiResponse({ status: 400, description: 'No stock positions match — nothing to count' })
  @ApiResponse({ status: 404, description: 'Warehouse not found' })
  create(@Request() req, @Body() dto: CreateSessionDto) {
    return this.service.create(req.user.tenantId, req.user.id, dto);
  }

  @Patch(':id/start')
  @RequirePermissions('INVENTORY:CREATE')
  @ApiOperation({ summary: 'Start session — draft → in_progress' })
  @ApiResponse({ status: 200, description: 'Session started' })
  @ApiResponse({ status: 400, description: 'Session is not draft' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  start(@Request() req, @Param('id') id: string) {
    return this.service.startSession(req.user.tenantId, req.user.id, id);
  }

  @Patch(':id/lines')
  @RequirePermissions('INVENTORY:COUNT')
  @ApiOperation({ summary: 'Enter physical count for one line — requires INVENTORY:COUNT' })
  @ApiResponse({ status: 200, description: 'Line counted with signed variances' })
  @ApiResponse({
    status: 400,
    description: 'Session not in_progress / neither or both counted quantities given',
  })
  @ApiResponse({ status: 404, description: 'Session or line not found' })
  updateLine(@Request() req, @Param('id') id: string, @Body() dto: UpdateCountLineDto) {
    return this.service.updateLine(req.user.tenantId, req.user.id, id, dto);
  }

  @Patch(':id/submit')
  @RequirePermissions('INVENTORY:COUNT')
  @ApiOperation({ summary: 'Submit for approval — in_progress → pending_approval' })
  @ApiResponse({ status: 200, description: 'Submitted with variance summary' })
  @ApiResponse({ status: 400, description: 'Not in_progress or uncounted lines remain' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  submit(@Request() req, @Param('id') id: string) {
    return this.service.submitForApproval(req.user.tenantId, req.user.id, id);
  }

  @Patch(':id/approve')
  @RequirePermissions('INVENTORY:APPROVE')
  @ApiOperation({
    summary: 'Approve session — pending_approval → approved (INVENTORY:APPROVE required)',
  })
  @ApiResponse({ status: 200, description: 'Approved with approvedBy/approvedAt' })
  @ApiResponse({ status: 400, description: 'Session is not pending_approval' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  approve(@Request() req, @Param('id') id: string, @Body() dto: ApproveSessionDto) {
    return this.service.approve(req.user.tenantId, req.user.id, id, dto);
  }

  @Patch(':id/post')
  @RequirePermissions('INVENTORY:APPROVE')
  @ApiOperation({ summary: 'Post adjustments — approved → posted (INVENTORY:APPROVE required)' })
  @ApiResponse({ status: 200, description: 'Posted — signed CYCLE_COUNT adjustments created' })
  @ApiResponse({ status: 400, description: 'Session is not approved' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  @ApiResponse({ status: 409, description: 'Movement-number collision (concurrent) - retry' })
  post(@Request() req, @Param('id') id: string) {
    return this.service.post(req.user.tenantId, req.user.id, id);
  }

  @Patch(':id/cancel')
  @RequirePermissions('INVENTORY:CREATE')
  @ApiOperation({ summary: 'Cancel session (any status except posted/cancelled)' })
  @ApiResponse({ status: 200, description: 'Session cancelled' })
  @ApiResponse({ status: 400, description: 'Session already posted/cancelled' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  cancel(@Request() req, @Param('id') id: string) {
    return this.service.cancel(req.user.tenantId, req.user.id, id);
  }
}
