// ─────────────────────────────────────────────────────────────────────────────
// FILE: backend/src/modules/warehouse-locations/dto/create-zone.dto.ts
// ─────────────────────────────────────────────────────────────────────────────
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsUUID, IsOptional, IsBoolean, MaxLength } from 'class-validator';

export class CreateZoneDto {
  @ApiProperty({ example: 'uuid-warehouse-id', description: 'Parent warehouse UUID' })
  @IsUUID()
  warehouseId: string;

  @ApiProperty({ example: 'STOR', description: 'Zone code — will be uppercased automatically' })
  @IsString()
  @MaxLength(20)
  code: string;

  @ApiProperty({ example: 'Storage Area', description: 'Zone display name' })
  @IsString()
  @MaxLength(100)
  name: string;

  @ApiPropertyOptional({
    example: 'storage',
    description: 'Zone type: storage | receiving | shipping | quarantine | production | returns',
    default: 'storage',
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  zoneType?: string;

  @ApiPropertyOptional({ example: 'Main storage area for raw materials' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}