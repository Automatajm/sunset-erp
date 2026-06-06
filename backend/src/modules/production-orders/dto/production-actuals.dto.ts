import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsUUID, IsOptional, IsNumber, IsDateString, Min, Max } from 'class-validator';

export class CreateLaborActualDto {
  @ApiPropertyOptional({ example: '2026-03-21' })
  @IsOptional()
  @IsDateString()
  workDate?: string;

  @ApiPropertyOptional({ example: 'EMP-001' })
  @IsOptional()
  @IsString()
  employeeId?: string;

  @ApiPropertyOptional({ example: 'Juan Perez' })
  @IsOptional()
  @IsString()
  employeeName?: string;

  @ApiPropertyOptional({ example: 8, description: 'Planned hours for comparison' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(99999) // Decimal(8,2) capacity − 1 order of magnitude
  hoursPlanned?: number;

  @ApiProperty({ example: 9.5, description: 'Actual hours worked' })
  @IsNumber()
  @Min(0.01)
  @Max(99999) // Decimal(8,2) capacity − 1 order of magnitude
  hoursActual: number;

  @ApiPropertyOptional({ example: 15.0, description: 'Labor cost per hour' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(99999) // Decimal(10,4) capacity − 1 order of magnitude
  laborRate?: number;

  @ApiPropertyOptional({ example: 'Overtime due to machine downtime' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateMaterialActualDto {
  @ApiProperty({ example: 'uuid-item-id' })
  @IsUUID()
  itemId: string;

  @ApiProperty({ example: 100, description: 'Planned quantity from BOM' })
  @IsNumber()
  @Min(0)
  @Max(9999999999) // Decimal(15,4) capacity − 1 order of magnitude
  qtyPlanned: number;

  @ApiProperty({ example: 108, description: 'Actual quantity consumed' })
  @IsNumber()
  @Min(0)
  @Max(9999999999) // Decimal(15,4) capacity − 1 order of magnitude
  qtyActual: number;

  @ApiPropertyOptional({ example: 2.5, description: 'Unit cost for variance calculation' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(99999) // Decimal(10,4) capacity − 1 order of magnitude
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
  @Max(99999999999) // Decimal(15,3) capacity − 1 order of magnitude
  quantityDelivered: number;

  @ApiPropertyOptional({ example: 'uuid-warehouse-id', description: 'Target FG warehouse' })
  @IsOptional()
  @IsUUID()
  warehouseId?: string;

  @ApiPropertyOptional({
    example: 25.0,
    description: 'Unit cost of finished good (for JE valuation)',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(99999) // Decimal(10,4) capacity − 1 order of magnitude
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
  @IsUUID()
  debitAccountId?: string;

  @ApiPropertyOptional({
    example: 'uuid-fg-account',
    description: 'Override credit account (FG inventory)',
  })
  @IsOptional()
  @IsUUID()
  creditAccountId?: string;

  @ApiPropertyOptional({ example: 'Merma adjustment Q1 2026' })
  @IsOptional()
  @IsString()
  notes?: string;
}
