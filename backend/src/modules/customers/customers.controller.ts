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
import { CustomersService } from './customers.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermissions } from '../../common/decorators/permissions.decorator';

@ApiTags('Customers')
@Controller('customers')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiBearerAuth('JWT-auth')
export class CustomersController {
  constructor(private readonly customersService: CustomersService) {}

  @Post()
  @RequirePermissions('SALES:CREATE')
  @ApiOperation({ summary: 'Create a new customer' })
  @ApiResponse({ status: 201, description: 'Customer created successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  async create(@Request() req, @Body() createCustomerDto: CreateCustomerDto) {
    return this.customersService.create(req.user.tenantId, req.user.id, createCustomerDto);
  }

  @Get()
  @RequirePermissions('SALES:VIEW')
  @ApiOperation({ summary: 'Get all customers' })
  @ApiResponse({ status: 200, description: 'List of customers' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  async findAll(@Request() req) {
    return this.customersService.findAll(req.user.tenantId);
  }

  @Get(':id')
  @RequirePermissions('SALES:VIEW')
  @ApiOperation({ summary: 'Get customer by ID' })
  @ApiParam({ name: 'id', description: 'Customer UUID' })
  @ApiResponse({ status: 200, description: 'Customer details' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async findOne(@Request() req, @Param('id') id: string) {
    return this.customersService.findOne(req.user.tenantId, id);
  }

  @Patch(':id')
  @RequirePermissions('SALES:EDIT')
  @ApiOperation({ summary: 'Update customer' })
  @ApiParam({ name: 'id', description: 'Customer UUID' })
  @ApiResponse({ status: 200, description: 'Customer updated successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async update(
    @Request() req,
    @Param('id') id: string,
    @Body() updateCustomerDto: UpdateCustomerDto,
  ) {
    return this.customersService.update(req.user.tenantId, req.user.id, id, updateCustomerDto);
  }

  @Delete(':id')
  @RequirePermissions('SALES:DELETE')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete customer (soft delete)' })
  @ApiParam({ name: 'id', description: 'Customer UUID' })
  @ApiResponse({ status: 200, description: 'Customer deleted successfully' })
  @ApiResponse({ status: 403, description: 'Forbidden - missing permission' })
  @ApiResponse({ status: 404, description: 'Customer not found' })
  async remove(@Request() req, @Param('id') id: string) {
    return this.customersService.remove(req.user.tenantId, req.user.id, id);
  }
}
