// ============================================================================
// FILE: backend/src/modules/uom/dto/unit-filter.dto.ts
// ============================================================================
import { IsOptional, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

const UOM_TYPES = ['volume', 'mass', 'count', 'length', 'area', 'time'];
const UOM_SYSTEMS = ['metric', 'imperial', 'universal'];

export class UnitFilterDto {
  @ApiPropertyOptional({ enum: UOM_TYPES, example: 'volume' })
  @IsOptional()
  @IsIn(UOM_TYPES)
  type?: string;

  @ApiPropertyOptional({ enum: UOM_SYSTEMS, example: 'metric' })
  @IsOptional()
  @IsIn(UOM_SYSTEMS)
  system?: string;
}
