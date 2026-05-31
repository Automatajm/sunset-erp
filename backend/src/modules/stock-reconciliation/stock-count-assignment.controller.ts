// ============================================================================
// FILE: backend/src/modules/stock-reconciliation/stock-count-assignment.controller.ts
// ============================================================================
import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Body,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiParam } from '@nestjs/swagger';
import { StockCountAssignmentService } from './stock-count-assignment.service';
import { CreateAssignmentDto } from './dto/create-assignment.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('Stock Count Assignments')
@Controller('stock-reconciliation/:sessionId/assignments')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('JWT-auth')
export class StockCountAssignmentController {
  constructor(private readonly service: StockCountAssignmentService) {}

  @Get()
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'List assignments for a session' })
  @ApiParam({ name: 'sessionId', description: 'Session UUID' })
  async findAll(@Request() req, @Param('sessionId') sessionId: string) {
    return this.service.findBySession(req.user.tenantId, sessionId);
  }

  @Post()
  @RequirePermissions('INVENTORY:APPROVE')
  @ApiOperation({ summary: 'Create assignment — resolves lines from filter criteria' })
  @ApiParam({ name: 'sessionId', description: 'Session UUID' })
  @ApiResponse({ status: 201, description: 'Assignment created with resolved line count' })
  @ApiResponse({ status: 400, description: 'No lines match the filters or already assigned' })
  async create(
    @Request() req,
    @Param('sessionId') sessionId: string,
    @Body() dto: CreateAssignmentDto,
  ) {
    return this.service.create(req.user.tenantId, req.user.id, sessionId, dto);
  }

  @Post('preview')
  @RequirePermissions('INVENTORY:VIEW')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Preview how many lines would be assigned (dry run)' })
  @ApiParam({ name: 'sessionId', description: 'Session UUID' })
  async preview(
    @Request() req,
    @Param('sessionId') sessionId: string,
    @Body() dto: CreateAssignmentDto,
  ) {
    return this.service.preview(req.user.tenantId, sessionId, dto);
  }

  @Delete(':assignmentId')
  @RequirePermissions('INVENTORY:APPROVE')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove assignment and release lines' })
  @ApiParam({ name: 'sessionId', description: 'Session UUID' })
  @ApiParam({ name: 'assignmentId', description: 'Assignment UUID' })
  async remove(
    @Request() req,
    @Param('sessionId') sessionId: string,
    @Param('assignmentId') assignmentId: string,
  ) {
    return this.service.remove(req.user.tenantId, sessionId, assignmentId);
  }
}
