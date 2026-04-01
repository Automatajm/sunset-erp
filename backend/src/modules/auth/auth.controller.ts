import { Controller, Post, Body, Get, UseGuards, Request } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { SelectTenantDto } from './dto/select-tenant.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiResponse({ status: 201, description: 'User successfully registered' })
  @ApiResponse({ status: 409, description: 'User already exists' })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('login')
  @ApiOperation({ summary: 'Login and get JWT token' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('select-tenant')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Select tenant and get new token with tenant context' })
  @ApiResponse({ status: 200, description: 'Tenant selected successfully' })
  @ApiResponse({ status: 404, description: 'No access to tenant' })
  async selectTenant(@Request() req, @Body() selectTenantDto: SelectTenantDto) {
    return this.authService.selectTenant(req.user.id, selectTenantDto);
  }

  @Get('tenants')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get list of tenants user has access to' })
  @ApiResponse({ status: 200, description: 'List of accessible tenants' })
  async getUserTenants(@Request() req) {
    const tenants = await this.authService.getUserTenants(req.user.id);
    return {
      tenants,
      count: tenants.length,
    };
  }

  // Sprint 14F - List users in tenant for assignment UI
  @Get('users')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'List active users in current tenant - used for count assignment' })
  @ApiResponse({ status: 200, description: 'List of users in tenant with roles' })
  async getTenantUsers(@Request() req) {
    const users = await this.authService.getTenantUsers(req.user.tenantId);
    return { users, count: users.length };
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get authenticated user profile' })
  @ApiResponse({ status: 200, description: 'User profile retrieved' })
  getProfile(@Request() req) {
    return {
      message: 'Authenticated user profile',
      user: req.user,
      tenantId: req.user.tenantId || null,
    };
  }

  @Get('check')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Check if authentication is valid' })
  @ApiResponse({ status: 200, description: 'Authentication valid' })
  checkAuth(@Request() req) {
    return {
      message: 'Authentication valid',
      authenticated: true,
      hasTenant: !!req.user.tenantId,
    };
  }
}