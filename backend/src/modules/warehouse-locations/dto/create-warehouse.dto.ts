// ============================================================================
// FILE 1 — backend/src/modules/warehouses/dto/create-warehouse.dto.ts
// ============================================================================
 
import { IsString, IsOptional, IsBoolean, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
 
export class CreateWarehouseDto {
  @ApiProperty({ example: 'WH-001', description: 'Warehouse code' })
  @IsString()
  @MaxLength(50)
  code: string;
 
  @ApiProperty({ example: 'Main Warehouse', description: 'Warehouse name' })
  @IsString()
  @MaxLength(255)
  name: string;
 
  @ApiPropertyOptional({ example: 'regular', description: 'Warehouse type: regular, consignment, transit' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  warehouseType?: string;
 
  @ApiPropertyOptional({ example: '123 Storage St, Industrial Zone', description: 'Address' })
  @IsOptional()
  @IsString()
  address?: string;
 
  @ApiPropertyOptional({ default: true, description: 'Is warehouse active' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
 
  @ApiPropertyOptional({
    default: false,
    description: 'Enable location tracking (Zone→Aisle→Rack→Level→Bin). When false, stock is balanced at warehouse level only.',
  })
  @IsOptional()
  @IsBoolean()
  locationTrackingEnabled?: boolean;
}