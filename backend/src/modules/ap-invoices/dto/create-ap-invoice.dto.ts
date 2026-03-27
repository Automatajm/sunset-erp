import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString, IsUUID, IsOptional, IsNumber, IsArray,
  ValidateNested, IsDateString, Min,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateApInvoiceLineDto {
  @ApiPropertyOptional({ example: 'uuid-po-line-id' })
  @IsOptional()
  @IsUUID()
  poLineId?: string;

  @ApiPropertyOptional({ example: 'uuid-item-id' })
  @IsOptional()
  @IsUUID()
  itemId?: string;

  @ApiPropertyOptional({ example: 'MDF Board 18mm' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({ example: 50 })
  @IsNumber()
  @Min(0.001)
  quantity: number;

  @ApiPropertyOptional({ example: 'sheets' })
  @IsOptional()
  @IsString()
  uom?: string;

  @ApiProperty({ example: 28.50 })
  @IsNumber()
  @Min(0)
  unitPrice: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  discountPercent?: number;

  @ApiPropertyOptional({ example: 'uuid-inventory-account' })
  @IsOptional()
  @IsUUID()
  inventoryAccountId?: string;

  @ApiPropertyOptional({ example: 'uuid-expense-account' })
  @IsOptional()
  @IsUUID()
  expenseAccountId?: string;
}

export class CreateApInvoiceDto {
  @ApiProperty({ example: 'uuid-supplier-id' })
  @IsUUID()
  supplierId: string;

  @ApiPropertyOptional({ example: 'uuid-po-id' })
  @IsOptional()
  @IsUUID()
  poId?: string;

  @ApiProperty({ example: '2026-03-21' })
  @IsDateString()
  invoiceDate: string;

  @ApiProperty({ example: '2026-04-20' })
  @IsDateString()
  dueDate: string;

  @ApiPropertyOptional({ example: 'SUP-INV-2026-0042' })
  @IsOptional()
  @IsString()
  supplierRef?: string;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [CreateApInvoiceLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateApInvoiceLineDto)
  lines: CreateApInvoiceLineDto[];
}