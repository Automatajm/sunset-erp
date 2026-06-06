import {
  IsString,
  IsUUID,
  IsOptional,
  IsArray,
  IsIn,
  ArrayMinSize,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ConvertToPrDto {
  @ApiProperty({ description: 'GN line IDs to convert', type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  lineIds: string[];

  @ApiProperty({ example: 'PR Necesidades Abril 2026' })
  @IsString()
  @MaxLength(255)
  prTitle: string;

  @ApiPropertyOptional({ enum: ['normal', 'urgent', 'critical'], default: 'normal' })
  @IsOptional()
  @IsIn(['normal', 'urgent', 'critical'])
  priority?: string;
}
