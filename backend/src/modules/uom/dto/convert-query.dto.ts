// ============================================================================
// FILE: backend/src/modules/uom/dto/convert-query.dto.ts
// ============================================================================
import { IsString, IsNotEmpty, IsNumber, IsPositive } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class ConvertQueryDto {
  @ApiProperty({ example: 'GAL', description: 'Source UOM code' })
  @IsString()
  @IsNotEmpty()
  from: string;

  @ApiProperty({ example: 'LTR', description: 'Target UOM code' })
  @IsString()
  @IsNotEmpty()
  to: string;

  @ApiProperty({ example: 2, description: 'Quantity to convert (must be > 0)' })
  @Type(() => Number)
  @IsNumber()
  @IsPositive()
  qty: number;
}
