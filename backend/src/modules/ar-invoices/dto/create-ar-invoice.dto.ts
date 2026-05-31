import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsUUID,
  IsOptional,
  IsNumber,
  IsArray,
  ValidateNested,
  IsDateString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateArInvoiceLineDto {
  @ApiPropertyOptional({ example: 'uuid-item-id' })
  @IsOptional()
  @IsUUID()
  itemId?: string;

  @ApiPropertyOptional({ example: 'Consulting services - March' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 10 })
  @IsNumber()
  @Min(0.001)
  quantity: number;

  @ApiPropertyOptional({ example: 'units' })
  @IsOptional()
  @IsString()
  uom?: string;

  @ApiProperty({ example: 150.0 })
  @IsNumber()
  @Min(0)
  unitPrice: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  discountPercent?: number;

  @ApiPropertyOptional({ example: 500.0, description: 'Cost of goods for CoGS JE' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  cogsAmount?: number;

  @ApiPropertyOptional({ example: 'uuid-revenue-account' })
  @IsOptional()
  @IsUUID()
  revenueAccountId?: string;

  @ApiPropertyOptional({ example: 'uuid-cogs-account' })
  @IsOptional()
  @IsUUID()
  cogsAccountId?: string;
}

export class CreateArInvoiceDto {
  @ApiProperty({ example: 'uuid-customer-id' })
  @IsUUID()
  customerId: string;

  @ApiPropertyOptional({ example: 'uuid-sales-order-id' })
  @IsOptional()
  @IsUUID()
  soId?: string;

  @ApiProperty({ example: '2026-03-21' })
  @IsDateString()
  invoiceDate: string;

  @ApiProperty({ example: '2026-04-20' })
  @IsDateString()
  dueDate: string;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: 'Net 30 payment terms apply' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [CreateArInvoiceLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateArInvoiceLineDto)
  lines: CreateArInvoiceLineDto[];
}
