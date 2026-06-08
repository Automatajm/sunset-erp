import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Request,
  Res,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService, REFRESH_TOKEN_TTL_MS } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { SelectTenantDto } from './dto/select-tenant.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';

// spec-034 — the refresh cookie. Path-scoped to /api/auth so it is only sent to
// refresh/logout, never on ordinary API calls. Secure only in production (local
// dev runs over http, where Secure cookies are dropped).
const REFRESH_COOKIE = 'refresh_token';
const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/api/auth',
  maxAge: REFRESH_TOKEN_TTL_MS,
});

// Minimal cookie parser (avoids a cookie-parser dependency).
const readCookie = (req: { headers: Record<string, any> }, name: string): string | undefined => {
  const raw = req.headers?.cookie;
  if (!raw) return undefined;
  for (const part of String(raw).split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
};

const reqMeta = (req: any) => ({
  userAgent: req.headers?.['user-agent'],
  ip: req.ip ?? req.socket?.remoteAddress,
});

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
  async login(
    @Body() loginDto: LoginDto,
    @Request() req,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(loginDto);
    // Single-tenant login resolves a tenant immediately → issue the refresh
    // cookie now. Multi-tenant login defers it to select-tenant.
    if (!result.requiresTenantSelection && result.tenant) {
      const { raw } = await this.authService.issueRefreshToken(
        result.user.id,
        result.tenant.id,
        reqMeta(req),
      );
      res.cookie(REFRESH_COOKIE, raw, cookieOptions());
    }
    return result;
  }

  @Post('select-tenant')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Select tenant and get new token with tenant context' })
  @ApiResponse({ status: 200, description: 'Tenant selected successfully' })
  @ApiResponse({ status: 404, description: 'No access to tenant' })
  async selectTenant(
    @Request() req,
    @Body() selectTenantDto: SelectTenantDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.selectTenant(req.user.id, selectTenantDto);
    const { raw } = await this.authService.issueRefreshToken(
      result.user.id,
      result.tenant.id,
      reqMeta(req),
    );
    res.cookie(REFRESH_COOKIE, raw, cookieOptions());
    return result;
  }

  // spec-034 — silent refresh: reads the httpOnly cookie, rotates it, mints a
  // new 15m access token. The frontend apiClient calls this on a 401.
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh the access token using the refresh cookie' })
  @ApiResponse({ status: 200, description: 'New access token issued' })
  @ApiResponse({ status: 401, description: 'Refresh token missing/invalid/expired' })
  async refresh(@Request() req, @Res({ passthrough: true }) res: Response) {
    const raw = readCookie(req, REFRESH_COOKIE);
    const { accessToken, refresh } = await this.authService.refresh(raw, reqMeta(req));
    res.cookie(REFRESH_COOKIE, refresh.raw, cookieOptions());
    return { access_token: accessToken, token_type: 'Bearer' };
  }

  // spec-034 — logout: revoke the refresh token + clear the cookie. Idempotent.
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Log out — revoke the refresh token and clear the cookie' })
  @ApiResponse({ status: 200, description: 'Logged out' })
  async logout(@Request() req, @Res({ passthrough: true }) res: Response) {
    await this.authService.revokeRefreshToken(readCookie(req, REFRESH_COOKIE));
    res.clearCookie(REFRESH_COOKIE, { path: '/api/auth' });
    return { message: 'Logged out' };
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
