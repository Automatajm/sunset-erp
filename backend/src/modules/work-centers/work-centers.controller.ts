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
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse, ApiParam } from '@nestjs/swagger';
import { WorkCentersService } from './work-centers.service';
import { CreateWorkCenterDto } from './dto/create-work-center.dto';
import { UpdateWorkCenterDto } from './dto/update-work-center.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('Work Centers')
@Controller('work-centers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('JWT-auth')
export class WorkCentersController {
  constructor(private readonly workCentersService: WorkCentersService) {}

  @Post()
  @RequirePermissions('INVENTORY:CREATE')
  @ApiOperation({ summary: 'Create a new work center' })
  @ApiResponse({ status: 201, description: 'Work center created successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  async create(@Request() req, @Body() createWorkCenterDto: CreateWorkCenterDto) {
    return this.workCentersService.create(req.user.tenantId, req.user.id, createWorkCenterDto);
  }

  @Get()
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get all work centers' })
  @ApiResponse({ status: 200, description: 'List of work centers' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  async findAll(@Request() req) {
    return this.workCentersService.findAll(req.user.tenantId);
  }

  @Get(':id')
  @RequirePermissions('INVENTORY:VIEW')
  @ApiOperation({ summary: 'Get work center by ID' })
  @ApiParam({ name: 'id', description: 'Work center UUID' })
  @ApiResponse({ status: 200, description: 'Work center details' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  @ApiResponse({ status: 404, description: 'Work center not found' })
  async findOne(@Request() req, @Param('id') id: string) {
    return this.workCentersService.findOne(req.user.tenantId, id);
  }

  @Patch(':id')
  @RequirePermissions('INVENTORY:EDIT')
  @ApiOperation({ summary: 'Update work center' })
  @ApiParam({ name: 'id', description: 'Work center UUID' })
  @ApiResponse({ status: 200, description: 'Work center updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  @ApiResponse({ status: 404, description: 'Work center not found' })
  @ApiResponse({ status: 409, description: 'Work center code already exists' })
  async update(
    @Request() req,
    @Param('id') id: string,
    @Body() updateWorkCenterDto: UpdateWorkCenterDto,
  ) {
    return this.workCentersService.update(req.user.tenantId, req.user.id, id, updateWorkCenterDto);
  }

  @Delete(':id')
  @RequirePermissions('INVENTORY:DELETE')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete work center (soft delete)' })
  @ApiParam({ name: 'id', description: 'Work center UUID' })
  @ApiResponse({ status: 200, description: 'Work center deleted successfully' })
  @ApiResponse({ status: 400, description: 'Cannot delete — BOM routings still reference it' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  @ApiResponse({ status: 404, description: 'Work center not found' })
  async remove(@Request() req, @Param('id') id: string) {
    return this.workCentersService.remove(req.user.tenantId, req.user.id, id);
  }
}
