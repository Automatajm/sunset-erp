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
import { JournalEntriesService } from './journal-entries.service';
import { CreateJournalEntryDto } from './dto/create-journal-entry.dto';
import { UpdateJournalEntryDto } from './dto/update-journal-entry.dto';
import { FindJournalEntriesQueryDto } from './dto/find-journal-entries-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('Journal Entries')
@Controller('journal-entries')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('JWT-auth')
export class JournalEntriesController {
  constructor(private readonly journalEntriesService: JournalEntriesService) {}

  @Post()
  @RequirePermissions('ACCOUNTING:CREATE')
  @ApiOperation({ summary: 'Create a new journal entry' })
  @ApiResponse({ status: 201, description: 'Journal entry created successfully' })
  @ApiResponse({ status: 400, description: 'Journal entry not balanced or validation error' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  @ApiResponse({ status: 404, description: 'Line account not found in tenant' })
  @ApiResponse({ status: 409, description: 'Entry number collision (concurrent create) - retry' })
  async create(@Request() req, @Body() createJournalEntryDto: CreateJournalEntryDto) {
    return this.journalEntriesService.create(req.user.tenantId, req.user.id, createJournalEntryDto);
  }

  @Get()
  @RequirePermissions('ACCOUNTING:VIEW')
  @ApiOperation({ summary: 'Get all journal entries' })
  @ApiQuery({ name: 'status', required: false, description: 'Filter by status (draft, posted)' })
  @ApiResponse({ status: 200, description: 'Envelope { journalEntries, count }' })
  @ApiResponse({ status: 400, description: 'status must be draft or posted' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  async findAll(@Request() req, @Query() query: FindJournalEntriesQueryDto) {
    return this.journalEntriesService.findAll(req.user.tenantId, query.status);
  }

  @Get(':id')
  @RequirePermissions('ACCOUNTING:VIEW')
  @ApiOperation({ summary: 'Get journal entry by ID' })
  @ApiParam({ name: 'id', description: 'Journal entry UUID' })
  @ApiResponse({ status: 200, description: 'Journal entry details' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  @ApiResponse({ status: 404, description: 'Journal entry not found' })
  async findOne(@Request() req, @Param('id') id: string) {
    return this.journalEntriesService.findOne(req.user.tenantId, id);
  }

  @Patch(':id')
  @RequirePermissions('ACCOUNTING:EDIT')
  @ApiOperation({ summary: 'Update journal entry (draft only)' })
  @ApiParam({ name: 'id', description: 'Journal entry UUID' })
  @ApiResponse({ status: 200, description: 'Journal entry updated successfully' })
  @ApiResponse({ status: 400, description: 'Only draft entries can be updated' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  @ApiResponse({ status: 404, description: 'Journal entry not found' })
  async update(
    @Request() req,
    @Param('id') id: string,
    @Body() updateJournalEntryDto: UpdateJournalEntryDto,
  ) {
    return this.journalEntriesService.update(
      req.user.tenantId,
      req.user.id,
      id,
      updateJournalEntryDto,
    );
  }

  @Patch(':id/post')
  @RequirePermissions('ACCOUNTING:POST')
  @ApiOperation({ summary: 'Post journal entry' })
  @ApiParam({ name: 'id', description: 'Journal entry UUID' })
  @ApiResponse({ status: 200, description: 'Journal entry posted successfully' })
  @ApiResponse({ status: 400, description: 'Only draft entries can be posted' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  @ApiResponse({ status: 404, description: 'Journal entry not found' })
  async post(@Request() req, @Param('id') id: string) {
    return this.journalEntriesService.post(req.user.tenantId, req.user.id, id);
  }

  @Patch(':id/unpost')
  @RequirePermissions('ACCOUNTING:POST')
  @ApiOperation({ summary: 'Unpost journal entry' })
  @ApiParam({ name: 'id', description: 'Journal entry UUID' })
  @ApiResponse({ status: 200, description: 'Journal entry unposted successfully' })
  @ApiResponse({ status: 400, description: 'Only posted entries can be unposted' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  @ApiResponse({ status: 404, description: 'Journal entry not found' })
  async unpost(@Request() req, @Param('id') id: string) {
    return this.journalEntriesService.unpost(req.user.tenantId, req.user.id, id);
  }

  @Delete(':id')
  @RequirePermissions('ACCOUNTING:DELETE')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete journal entry (soft delete, draft only)' })
  @ApiParam({ name: 'id', description: 'Journal entry UUID' })
  @ApiResponse({ status: 200, description: 'Journal entry deleted successfully' })
  @ApiResponse({ status: 400, description: 'Only draft entries can be deleted' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  @ApiResponse({ status: 404, description: 'Journal entry not found' })
  async remove(@Request() req, @Param('id') id: string) {
    return this.journalEntriesService.remove(req.user.tenantId, req.user.id, id);
  }
}
