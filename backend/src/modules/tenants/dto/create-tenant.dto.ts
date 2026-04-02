// FILE: backend/src/modules/tenants/dto/create-tenant.dto.ts
import { IsString, IsOptional, IsIn, Length } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTenantDto {
  @ApiPropertyOptional({ example: 'ACME-0001', description: 'Tenant code — auto-generated from name if not provided' })
  @IsOptional() @IsString() @Length(2, 50)
  code?: string;

  @ApiProperty({ example: 'Acme Manufacturing LLC' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'DO', description: '2-letter country code' })
  @IsString() @Length(2, 2)
  country: string;

  @ApiPropertyOptional({ example: 'Acme Manufacturing S.A.S.' })
  @IsOptional() @IsString()
  legalName?: string;

  @ApiPropertyOptional({ example: '101-234567-8' })
  @IsOptional() @IsString()
  taxId?: string;

  @ApiPropertyOptional({ example: 'Manufacturing' })
  @IsOptional() @IsString()
  industry?: string;

  @ApiPropertyOptional({ example: '50-200', enum: ['1-10','11-50','50-200','200-500','500+'] })
  @IsOptional() @IsString()
  companySize?: string;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional() @IsString() @Length(3, 3)
  defaultCurrency?: string;

  @ApiPropertyOptional({ example: 'en-US' })
  @IsOptional() @IsString()
  defaultLanguage?: string;

  @ApiPropertyOptional({ example: 'America/Santo_Domingo' })
  @IsOptional() @IsString()
  timezone?: string;

  @ApiPropertyOptional({ enum: ['free','starter','professional','enterprise'] })
  @IsOptional() @IsIn(['free','starter','professional','enterprise'])
  subscriptionPlan?: string;
}