import { IsString, IsUUID, IsOptional, IsArray, ValidateNested, MaxLength } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { CreateSalesOrderLineDto } from './create-sales-order-line.dto';

export class CreateSalesOrderDto {
  @ApiProperty({ description: 'Customer UUID' })
  @IsUUID()
  customerId: string;

  @ApiPropertyOptional({ example: 'PO-12345', description: 'Customer PO number' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  customerPo?: string;

  @ApiPropertyOptional({ example: '2026-04-25', description: 'Requested delivery date' })
  @IsOptional()
  @IsString()
  requestedDate?: string;

  @ApiPropertyOptional({ example: '2026-04-30', description: 'Promised delivery date' })
  @IsOptional()
  @IsString()
  promisedDate?: string;

  @ApiPropertyOptional({ example: 'Net 30', description: 'Payment terms' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  paymentTerms?: string;

  @ApiPropertyOptional({ example: 'USD', description: 'Currency code' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiProperty({ description: 'Sales order lines', type: [CreateSalesOrderLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSalesOrderLineDto)
  lines: CreateSalesOrderLineDto[];
}
