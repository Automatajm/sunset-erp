import {
  IsString,
  IsUUID,
  IsOptional,
  IsArray,
  IsDateString,
  ArrayMinSize,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ConvertToRfqDto {
  @ApiProperty({ description: 'PR line IDs to quote', type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  lineIds: string[];

  @ApiProperty({ example: 'RFQ Materias Primas Abril 2026' })
  @IsString()
  @MaxLength(255)
  rfqTitle: string;

  @ApiProperty({ description: 'Supplier IDs to invite (1-N)', type: [String] })
  @IsArray()
  @ArrayMinSize(1)
  @IsUUID('4', { each: true })
  supplierIds: string[];

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional({ description: 'Response deadline date' })
  @IsOptional()
  @IsDateString()
  responseDeadline?: string;
}
