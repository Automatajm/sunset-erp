import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString,
  IsOptional,
  IsNumber,
  IsDateString,
  Min,
  IsArray,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateLaborActualDto {
  @ApiPropertyOptional({ example: '2026-03-21' })
  @IsOptional()
  @IsDateString()
  workDate?: string;

  @ApiPropertyOptional({ example: 'EMP-001' })
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional({ example: 'Juan Pérez' })
  @IsOptional()
  @IsString()
  employeeName?: string;

  @ApiPropertyOptional({ example: 8, description: 'Planned hours for comparison' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  hoursPlanned?: number;

  @ApiProperty({ example: 9.5, description: 'Actual hours worked' })
  @IsNumber()
  @Min(0.01)
  hoursActual: number;

  @ApiPropertyOptional({ example: 15.0, description: 'Labor cost per hour' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  laborRate?: number;

  @ApiPropertyOptional({ example: 'Overtime due to machine downtime' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateMaterialActualDto {
  @ApiProperty({ example: 'uuid-item-id' })
  @IsString()
  itemId: string;

  @ApiProperty({ example: 100, description: 'Planned quantity from BOM' })
  @IsNumber()
  @Min(0)
  qtyPlanned: number;

  @ApiProperty({ example: 108, description: 'Actual quantity consumed' })
  @IsNumber()
  @Min(0)
  qtyActual: number;

  @ApiPropertyOptional({ example: 2.5, description: 'Unit cost for variance calculation' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;

  @ApiPropertyOptional({ example: 'Extra usage due to defects' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class DeliverFgDto {
  @ApiProperty({ example: 950, description: 'Quantity of finished goods actually delivered' })
  @IsNumber()
  @Min(0.001)
  quantityDelivered: number;

  @ApiPropertyOptional({ example: 'uuid-warehouse-id', description: 'Target FG warehouse' })
  @IsOptional()
  @IsString()
  warehouseId?: string;

  @ApiPropertyOptional({
    example: 25.0,
    description: 'Unit cost of finished good (for JE valuation)',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  unitCost?: number;

  @ApiPropertyOptional({ example: 'Delivered to main warehouse' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class PostVarianceJeDto {
  @ApiPropertyOptional({
    example: 'uuid-expense-account',
    description: 'Override debit account (merma expense)',
  })
  @IsOptional()
  @IsString()
  debitAccountId?: string;

  @ApiPropertyOptional({
    example: 'uuid-fg-account',
    description: 'Override credit account (FG inventory)',
  })
  @IsOptional()
  @IsString()
  creditAccountId?: string;

  @ApiPropertyOptional({ example: 'Merma adjustment Q1 2026' })
  @IsOptional()
  @IsString()
  notes?: string;
}
