import {
  Controller, Get, Post, Body, Patch, Param,
  Delete, UseGuards, Request, HttpCode, HttpStatus, Query,
} from '@nestjs/common';
import {
  ApiTags, ApiOperation, ApiBearerAuth,
  ApiResponse, ApiParam, ApiQuery,
} from '@nestjs/swagger';
import { PurchaseRequisitionsService } from './purchase-requisitions.service';
import { CreatePurchaseRequisitionDto } from './dto/create-purchase-requisition.dto';
import { UpdatePurchaseRequisitionDto } from './dto/update-purchase-requisition.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('Purchase Requisitions')
@Controller('purchase-requisitions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('JWT-auth')
export class PurchaseRequisitionsController {
  constructor(private readonly prService: PurchaseRequisitionsService) {}

  @Post()
  @RequirePermissions('PROCUREMENT:CREATE')
  @ApiOperation({ summary: 'Create a new Purchase Requisition' })
  @ApiResponse({ status: 201, description: 'PR created in draft status' })
  async create(@Request() req, @Body() dto: CreatePurchaseRequisitionDto) {
    return this.prService.create(req.user.tenantId, req.user.id, dto);
  }

  @Get()
  @RequirePermissions('PROCUREMENT:VIEW')
  @ApiOperation({ summary: 'Get all Purchase Requisitions' })
  @ApiQuery({ name: 'status',   required: false })
  @ApiQuery({ name: 'priority', required: false })
  async findAll(
    @Request() req,
    @Query('status')   status?: string,
    @Query('priority') priority?: string,
  ) {
    return this.prService.findAll(req.user.tenantId, status, priority);
  }

  @Get(':id')
  @RequirePermissions('PROCUREMENT:VIEW')
  @ApiOperation({ summary: 'Get PR by ID with lines' })
  @ApiParam({ name: 'id', description: 'PR UUID' })
  async findOne(@Request() req, @Param('id') id: string) {
    return this.prService.findOne(req.user.tenantId, id);
  }

  @Patch(':id')
  @RequirePermissions('PROCUREMENT:EDIT')
  @ApiOperation({ summary: 'Update PR header (draft or submitted only)' })
  @ApiParam({ name: 'id', description: 'PR UUID' })
  async update(
    @Request() req,
    @Param('id') id: string,
    @Body() dto: UpdatePurchaseRequisitionDto,
  ) {
    return this.prService.update(req.user.tenantId, req.user.id, id, dto);
  }

  @Patch(':id/status/:status')
  @RequirePermissions('PROCUREMENT:APPROVE')
  @ApiOperation({ summary: 'Transition PR status' })
  @ApiParam({ name: 'id',     description: 'PR UUID' })
  @ApiParam({ name: 'status', description: 'submitted | approved | rejected | cancelled | in_progress | completed' })
  async updateStatus(
    @Request() req,
    @Param('id')     id: string,
    @Param('status') status: string,
    @Body() body: { reason?: string },
  ) {
    return this.prService.updateStatus(req.user.tenantId, req.user.id, id, status, body?.reason);
  }

  @Post(':id/convert-to-rfq')
  @RequirePermissions('PROCUREMENT:CREATE')
  @ApiOperation({ summary: 'Convert selected PR lines into an RFQ' })
  @ApiParam({ name: 'id', description: 'PR UUID' })
  @ApiResponse({ status: 201, description: 'RFQ created from PR lines' })
  async convertToRfq(
    @Request() req,
    @Param('id') id: string,
    @Body() body: {
      lineIds: string[];
      rfqTitle: string;
      supplierIds: string[];
      currency?: string;
      responseDeadline?: string;
    },
  ) {
    return this.prService.convertToRfq(
      req.user.tenantId,
      req.user.id,
      id,
      body.lineIds,
      body.rfqTitle,
      body.supplierIds,
      body.currency,
      body.responseDeadline,
    );
  }

  @Delete(':id')
  @RequirePermissions('PROCUREMENT:DELETE')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete PR (draft only, soft delete)' })
  @ApiParam({ name: 'id', description: 'PR UUID' })
  async remove(@Request() req, @Param('id') id: string) {
    return this.prService.remove(req.user.tenantId, req.user.id, id);
  }
}
