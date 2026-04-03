import {
  IsString, IsOptional, IsDateString, IsArray,
  ValidateNested, IsEnum, MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateGeneralNeedLineDto } from './create-general-need-line.dto';

export class CreateGeneralNeedDto {
  @ApiProperty({ example: 'Necesidades Abril 2026', description: 'GN title' })
  @IsString()
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ description: 'Period start date (YYYY-MM-DD)' })
  @IsDateString()
  periodStart: string;

  @ApiProperty({ description: 'Period end date (YYYY-MM-DD)' })
  @IsDateString()
  periodEnd: string;

  @ApiPropertyOptional({
    enum: ['manual', 'mrp_explode'],
    default: 'manual',
    description: 'Origin: manual entry or MO explosion',
  })
  @IsOptional()
  @IsEnum(['manual', 'mrp_explode'])
  source?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [CreateGeneralNeedLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateGeneralNeedLineDto)
  lines: CreateGeneralNeedLineDto[];
}