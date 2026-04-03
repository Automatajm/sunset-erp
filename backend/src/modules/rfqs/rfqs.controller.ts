import {
  Controller, Get, Post, Body, Patch, Param,
  Delete, UseGuards, Request, HttpCode, HttpStatus, Query,
} from '@nestjs/common';
import {
  ApiTags, ApiOperation, ApiBearerAuth,
  ApiResponse, ApiParam, ApiQuery,
} from '@nestjs/swagger';
import { RfqsService } from './rfqs.service';
import { CreateRfqDto } from './dto/create-rfq.dto';
import { UpdateRfqDto } from './dto/update-rfq.dto';
import { SubmitRfqResponseDto } from './dto/submit-rfq-response.dto';
import { AwardRfqDto } from './dto/award-rfq.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('RFQs')
@Controller('rfqs')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('JWT-auth')
export class RfqsController {
  constructor(private readonly rfqsService: RfqsService) {}

  @Post()
  @RequirePermissions('PROCUREMENT:CREATE')
  @ApiOperation({ summary: 'Create a new RFQ with lines and supplier invitations' })
  @ApiResponse({ status: 201, description: 'RFQ created in draft status' })
  async create(@Request() req, @Body() dto: CreateRfqDto) {
    return this.rfqsService.create(req.user.tenantId, req.user.id, dto);
  }

  @Get()
  @RequirePermissions('PROCUREMENT:VIEW')
  @ApiOperation({ summary: 'Get all RFQs' })
  @ApiQuery({ name: 'status', required: false, description: 'draft | sent | partial_response | fully_responded | awarded | cancelled' })
  async findAll(@Request() req, @Query('status') status?: string) {
    return this.rfqsService.findAll(req.user.tenantId, status);
  }

  @Get(':id')
  @RequirePermissions('PROCUREMENT:VIEW')
  @ApiOperation({ summary: 'Get RFQ by ID with lines, suppliers and responses' })
  @ApiParam({ name: 'id', description: 'RFQ UUID' })
  async findOne(@Request() req, @Param('id') id: string) {
    return this.rfqsService.findOne(req.user.tenantId, id);
  }

  @Get(':id/comparison')
  @RequirePermissions('PROCUREMENT:VIEW')
  @ApiOperation({ summary: 'Get supplier comparison matrix for this RFQ' })
  @ApiParam({ name: 'id', description: 'RFQ UUID' })
  async getComparison(@Request() req, @Param('id') id: string) {
    return this.rfqsService.getComparison(req.user.tenantId, id);
  }

  @Patch(':id')
  @RequirePermissions('PROCUREMENT:EDIT')
  @ApiOperation({ summary: 'Update RFQ header (draft or sent only)' })
  @ApiParam({ name: 'id', description: 'RFQ UUID' })
  async update(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdateRfqDto,
  ) {
    return this.rfqsService.update(req.user.tenantId, req.user.id, id, dto);
  }

  @Post(':id/send')
  @RequirePermissions('PROCUREMENT:EDIT')
  @ApiOperation({ summary: 'Send RFQ to all invited suppliers' })
  @ApiParam({ name: 'id', description: 'RFQ UUID' })
  @ApiResponse({ status: 200, description: 'RFQ status changed to sent' })
  async send(@Request() req, @Param('id') id: string) {
    return this.rfqsService.send(req.user.tenantId, req.user.id, id);
  }

  @Post(':id/response')
  @RequirePermissions('PROCUREMENT:EDIT')
  @ApiOperation({ summary: 'Submit supplier response lines for this RFQ' })
  @ApiParam({ name: 'id', description: 'RFQ UUID' })
  @ApiResponse({ status: 200, description: 'Response recorded' })
  async submitResponse(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: SubmitRfqResponseDto,
  ) {
    return this.rfqsService.submitResponse(req.user.tenantId, req.user.id, id, dto);
  }

  @Post(':id/award')
  @RequirePermissions('PROCUREMENT:APPROVE')
  @ApiOperation({ summary: 'Award RFQ lines and auto-generate Purchase Orders per supplier' })
  @ApiParam({ name: 'id', description: 'RFQ UUID' })
  @ApiResponse({ status: 200, description: 'Lines awarded, POs generated' })
  async award(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: AwardRfqDto,
  ) {
    return this.rfqsService.award(req.user.tenantId, req.user.id, id, dto);
  }

  @Post(':id/cancel')
  @RequirePermissions('PROCUREMENT:EDIT')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel RFQ (not allowed if already awarded)' })
  @ApiParam({ name: 'id', description: 'RFQ UUID' })
  async cancel(@Request() req, @Param('id') id: string) {
    return this.rfqsService.cancel(req.user.tenantId, req.user.id, id);
  }

  @Delete(':id')
  @RequirePermissions('PROCUREMENT:DELETE')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete RFQ (draft only, soft delete)' })
  @ApiParam({ name: 'id', description: 'RFQ UUID' })
  async remove(@Request() req, @Param('id') id: string) {
    return this.rfqsService.remove(req.user.tenantId, req.user.id, id);
  }
}