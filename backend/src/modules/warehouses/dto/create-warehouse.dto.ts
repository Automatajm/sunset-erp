// ============================================================================
// FILE: backend/src/modules/warehouses/dto/create-warehouse.dto.ts
// ============================================================================
import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';

export class CreateWarehouseDto {
  @ApiPropertyOptional({
    example: 'WH-REG-001',
    description: 'Warehouse code. If omitted, auto-generated as WH-{TYPE}-{NNN}',
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  code?: string;

  @ApiProperty({ example: 'Main Warehouse' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({
    example: 'regular',
    description: 'regular | consignment | transit',
    default: 'regular',
  })
  @IsOptional()
  @IsString()
  warehouseType?: string;

  @ApiPropertyOptional({ example: 'Zona Industrial Los Minas' })
  @IsOptional()
  @IsString()
  address?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({
    default: false,
    description: 'Enable Zone → Aisle → Rack → Level → Bin location tracking',
  })
  @IsOptional()
  @IsBoolean()
  locationTrackingEnabled?: boolean;
}
