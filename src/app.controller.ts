import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { PrismaService } from './prisma/prisma.service';

@ApiTags('health')
@Controller()
export class AppController {
  constructor(private prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'API Info', description: 'Get basic API information' })
  @ApiResponse({ status: 200, description: 'API information retrieved' })
  getHello() {
    return {
      message: 'Sunset ERP API',
      version: '1.0.0',
      status: 'running',
    };
  }

  @Get('health')
  @ApiOperation({ summary: 'Health Check', description: 'Check API and database health status' })
  @ApiResponse({ status: 200, description: 'System is healthy' })
  @ApiResponse({ status: 500, description: 'System has issues' })
  async getHealth() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'ok',
        database: 'connected',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'error',
        database: 'disconnected',
        error: error.message,
      };
    }
  }

  @Get('tenants')
  @ApiOperation({ summary: 'List Tenants', description: 'Get all available tenants' })
  @ApiResponse({ status: 200, description: 'Tenants retrieved successfully' })
  async getTenants() {
    const tenants = await this.prisma.tenant.findMany({
      select: {
        id: true,
        code: true,
        name: true,
        isActive: true,
      },
    });
    return { data: tenants };
  }
}