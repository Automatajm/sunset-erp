// FILE: backend/src/modules/tenants/dto/update-tenant.dto.ts
import { IsString, IsOptional, IsIn, Length } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateTenantDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() legalName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() taxId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(2,2) country?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() industry?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() companySize?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() @Length(3,3) defaultCurrency?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() defaultLanguage?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() timezone?: string;
  @ApiPropertyOptional({ enum: ['free','starter','professional','enterprise'] })
  @IsOptional() @IsIn(['free','starter','professional','enterprise']) subscriptionPlan?: string;
  @ApiPropertyOptional({ enum: ['active','suspended','cancelled'] })
  @IsOptional() @IsIn(['active','suspended','cancelled']) status?: string;
}