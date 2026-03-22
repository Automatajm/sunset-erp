import {
  Controller, Get, Patch, Param, Body,
  UseGuards, Request, Query,
} from '@nestjs/common';
import {
  ApiTags, ApiOperation, ApiBearerAuth,
  ApiResponse, ApiParam, ApiQuery,
} from '@nestjs/swagger';
import { AutomationService } from './automation.service';
import { UpdateAutomationConfigDto, ReviewQueueItemDto, RejectQueueItemDto } from './dto/automation.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('Automation Engine')
@Controller('automation')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('JWT-auth')
export class AutomationController {
  constructor(private readonly automationService: AutomationService) {}

  // ── CONFIG ────────────────────────────────────

  @Get('config')
  @RequirePermissions('ACCOUNTING:VIEW')
  @ApiOperation({
    summary: 'Get automation config for all modules',
    description: 'Returns mode (full_auto | review_required | manual) for each module. Creates defaults if missing.',
  })
  @ApiResponse({ status: 200, description: 'Config for all automation modules' })
  async getConfigs(@Request() req) {
    return this.automationService.getConfigs(req.user.tenantId);
  }

  @Patch('config/:module')
  @RequirePermissions('ACCOUNTING:POST')
  @ApiOperation({
    summary: 'Update automation mode for a module',
    description: 'full_auto = post immediately | review_required = draft + queue | manual = no auto-JE',
  })
  @ApiParam({ name: 'module', description: 'ar_invoice | ar_payment | ar_reversal | fg_delivery | production_variance | po_receipt | mo_issue' })
  @ApiResponse({ status: 200, description: 'Config updated' })
  async updateConfig(
    @Request() req,
    @Param('module') module: string,
    @Body() dto: UpdateAutomationConfigDto,
  ) {
    return this.automationService.updateConfig(req.user.tenantId, req.user.id, module, dto);
  }

  // ── JE QUEUE ──────────────────────────────────

  @Get('queue')
  @RequirePermissions('ACCOUNTING:VIEW')
  @ApiOperation({
    summary: 'Get JE review queue',
    description: 'Lists auto-generated JEs awaiting finance review. Filter by status or event type.',
  })
  @ApiQuery({ name: 'status',    required: false, description: 'pending | approved | rejected' })
  @ApiQuery({ name: 'eventType', required: false, description: 'ar_invoice | ar_payment | fg_delivery | production_variance' })
  @ApiResponse({ status: 200, description: 'Queue items with full JE detail' })
  async getQueue(
    @Request() req,
    @Query('status') status?: string,
    @Query('eventType') eventType?: string,
  ) {
    return this.automationService.getQueue(req.user.tenantId, { status, eventType });
  }

  @Get('queue/stats')
  @RequirePermissions('ACCOUNTING:VIEW')
  @ApiOperation({ summary: 'Get queue stats — pending / approved / rejected counts' })
  @ApiResponse({ status: 200, description: 'Queue statistics' })
  async getQueueStats(@Request() req) {
    return this.automationService.getQueueStats(req.user.tenantId);
  }

  @Patch('queue/:id/approve')
  @RequirePermissions('ACCOUNTING:POST')
  @ApiOperation({
    summary: 'Approve queue item → posts the draft JE',
    description: 'Transitions JE from draft to posted. Queue item moves to approved.',
  })
  @ApiParam({ name: 'id', description: 'Queue item UUID' })
  @ApiResponse({ status: 200, description: 'JE posted, queue item approved' })
  @ApiResponse({ status: 400, description: 'Item already reviewed' })
  async approve(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: ReviewQueueItemDto,
  ) {
    return this.automationService.approveQueueItem(req.user.tenantId, req.user.id, id, dto);
  }

  @Patch('queue/:id/reject')
  @RequirePermissions('ACCOUNTING:POST')
  @ApiOperation({
    summary: 'Reject queue item → deletes the draft JE',
    description: 'Deletes the draft JE. Queue item moves to rejected with reason.',
  })
  @ApiParam({ name: 'id', description: 'Queue item UUID' })
  @ApiResponse({ status: 200, description: 'JE deleted, queue item rejected' })
  @ApiResponse({ status: 400, description: 'Item already reviewed' })
  async reject(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: RejectQueueItemDto,
  ) {
    return this.automationService.rejectQueueItem(req.user.tenantId, req.user.id, id, dto);
  }
}