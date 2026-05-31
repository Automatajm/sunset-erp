// ─────────────────────────────────────────────────────────────────────────────
// FILE: backend/src/modules/warehouse-locations/dto/create-rack.dto.ts
// ─────────────────────────────────────────────────────────────────────────────
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsUUID, IsOptional, IsBoolean, MaxLength } from 'class-validator';

export class CreateRackDto {
  @ApiProperty({ example: 'uuid-aisle-id', description: 'Parent aisle UUID' })
  @IsUUID()
  aisleId: string;

  @ApiProperty({
    example: '01',
    description: 'Rack code. fullCode auto-generated: ZONE-AISLE-RACK',
  })
  @IsString()
  @MaxLength(10)
  code: string;

  @ApiPropertyOptional({ example: 'Rack 1' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
