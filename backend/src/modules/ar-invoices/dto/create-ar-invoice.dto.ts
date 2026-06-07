import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsUUID,
  ArrayMinSize,
  Length,
  Max,
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
  @Max(99999999999) // Decimal(15,3) capacity − 1 order of magnitude
  quantity: number;

  @ApiPropertyOptional({ example: 'units' })
  @IsOptional()
  @IsString()
  uom?: string;

  @ApiProperty({ example: 150.0 })
  @IsNumber()
  @Min(0)
  @Max(9999999999) // Decimal(15,4) capacity − 1 order of magnitude
  unitPrice: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  discountPercent?: number;

  @ApiPropertyOptional({ example: 500.0, description: 'Cost of goods for CoGS JE' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(999999999999) // Decimal(15,2) capacity − 1 order of magnitude
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

  @ApiPropertyOptional({
    example: 'USD',
    description: 'ISO 4217; defaults to the tenant base currency (catalog-validated)',
  })
  @IsOptional()
  @IsString()
  @Length(3, 3)
  currency?: string;

  @ApiPropertyOptional({ example: 'Net 30 payment terms apply' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ type: [CreateArInvoiceLineDto], description: 'Invoice lines (min 1)' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateArInvoiceLineDto)
  lines: CreateArInvoiceLineDto[];
}
