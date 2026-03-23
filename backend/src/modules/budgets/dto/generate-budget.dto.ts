import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsEnum, IsOptional, IsString } from 'class-validator';

export class GenerateBudgetFromSoDto {
  @ApiProperty({
    description: 'SO statuses to include in MRP calculation',
    example: ['confirmed', 'shipped'],
    enum: ['draft', 'confirmed', 'shipped', 'delivered'],
    isArray: true,
  })
  @IsArray()
  @IsString({ each: true })
  soStatuses: string[];

  @ApiPropertyOptional({
    description: 'Overwrite existing budget lines for the same account+period. Default: false (skip duplicates)',
    example: false,
  })
  @IsOptional()
  @IsBoolean()
  overwrite?: boolean;

  @ApiPropertyOptional({
    description: 'Default GL account number for material costs (fallback)',
    example: '5.1.02',
  })
  @IsOptional()
  @IsString()
  defaultMaterialAccount?: string;

  @ApiPropertyOptional({
    description: 'Default GL account number for labor costs (fallback)',
    example: '5.1.03',
  })
  @IsOptional()
  @IsString()
  defaultLaborAccount?: string;

  @ApiPropertyOptional({
    description: 'Default GL account number for revenue (fallback)',
    example: '4.1.01',
  })
  @IsOptional()
  @IsString()
  defaultRevenueAccount?: string;
}