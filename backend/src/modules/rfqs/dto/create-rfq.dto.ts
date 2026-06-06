import {
  IsString,
  IsOptional,
  IsUUID,
  IsDateString,
  IsArray,
  ValidateNested,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateRfqLineDto } from './create-rfq-line.dto';

export class CreateRfqDto {
  @ApiProperty({ example: 'Cotización Materias Primas Q2-2026' })
  @IsString()
  @MaxLength(255)
  title: string;

  @ApiPropertyOptional({ example: 'USD', default: 'USD' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional({ description: 'Response deadline date' })
  @IsOptional()
  @IsDateString()
  responseDeadline?: string;

  @ApiPropertyOptional({ description: 'Source Purchase Requisition ID' })
  @IsOptional()
  @IsUUID()
  prId?: string;

  @ApiPropertyOptional({ description: 'Source General Need ID' })
  @IsOptional()
  @IsUUID()
  gnId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ description: 'Supplier IDs to invite (1-N)', type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  supplierIds: string[];

  @ApiProperty({ type: [CreateRfqLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateRfqLineDto)
  lines: CreateRfqLineDto[];
}
