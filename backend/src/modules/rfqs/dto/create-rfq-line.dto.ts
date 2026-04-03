import {
  IsString, IsOptional, IsUUID, IsNumber,
  IsDateString, Min, MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRfqLineDto {
  @ApiPropertyOptional({ description: 'Catalog item ID' })
  @IsOptional()
  @IsUUID()
  itemId?: string;

  @ApiPropertyOptional({ description: 'Free-text description for non-catalog items' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  genericDescription?: string;

  @ApiProperty({ example: 100 })
  @IsNumber()
  @Min(0.001)
  quantity: number;

  @ApiProperty({ example: 'KG' })
  @IsString()
  @MaxLength(20)
  uom: string;

  @ApiProperty({ description: 'Required delivery date' })
  @IsDateString()
  requiredDate: string;

  @ApiPropertyOptional({ description: 'Source PR line ID (traceability)' })
  @IsOptional()
  @IsUUID()
  prLineId?: string;

  @ApiPropertyOptional({ description: 'Source GN line ID (traceability)' })
  @IsOptional()
  @IsUUID()
  gnLineId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}