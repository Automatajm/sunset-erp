// ============================================================================
// FILE: backend/src/modules/notifications/notifications.controller.ts
// spec-022 — list / retry / cancel / manual drain. Guarded by SETTINGS:VIEW
// (read) / SETTINGS:EDIT (mutations) — reuses the spec-021 permission codes.
// emailApiKey is never part of any response here (it lives on TenantSettings).
// ============================================================================
import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiParam } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { QueryNotificationsDto } from './dto/query-notifications.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('Notifications')
@Controller('notifications')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('JWT-auth')
export class NotificationsController {
  constructor(private readonly service: NotificationsService) {}

  @Get()
  @RequirePermissions('SETTINGS:VIEW')
  @ApiOperation({ summary: 'List notifications (queue + history) for the tenant' })
  @ApiResponse({ status: 200, description: '{ notifications: [...], count: n }' })
  @ApiResponse({ status: 400, description: 'Query param outside the whitelist' })
  async findAll(@Request() req, @Query() query: QueryNotificationsDto) {
    return this.service.findAll(req.user.tenantId, query);
  }

  @Post('drain')
  @RequirePermissions('SETTINGS:EDIT')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Manually drain pending notifications (also runs on a 15s worker)' })
  @ApiResponse({ status: 200, description: '{ attempted, sent, failed }' })
  async drain() {
    return this.service.drainPending();
  }

  @Post(':id/retry')
  @RequirePermissions('SETTINGS:EDIT')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', description: 'Notification UUID' })
  @ApiOperation({ summary: 'Re-queue a failed/pending notification' })
  @ApiResponse({ status: 200, description: 'Re-queued' })
  @ApiResponse({ status: 400, description: 'Illegal status transition' })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  async retry(@Request() req, @Param('id') id: string) {
    return this.service.retry(req.user.tenantId, id);
  }

  @Post(':id/cancel')
  @RequirePermissions('SETTINGS:EDIT')
  @HttpCode(HttpStatus.OK)
  @ApiParam({ name: 'id', description: 'Notification UUID' })
  @ApiOperation({ summary: 'Cancel a pending/failed notification' })
  @ApiResponse({ status: 200, description: 'Cancelled' })
  @ApiResponse({ status: 400, description: 'Already sent or cancelled' })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  async cancel(@Request() req, @Param('id') id: string) {
    return this.service.cancel(req.user.tenantId, id);
  }
}
