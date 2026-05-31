// ============================================================================
// FILE: backend/src/modules/roles/dto/create-role.dto.ts
// ============================================================================
import { IsString, IsOptional, IsArray, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRoleDto {
  @ApiProperty({ example: 'WAREHOUSE_SUPERVISOR' })
  @IsString()
  code: string;

  @ApiProperty({ example: 'Warehouse Supervisor' })
  @IsString()
  name: string;

  @ApiPropertyOptional({ example: 'Can manage stock counts and assign auxiliaries' })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ type: [String], description: 'Permission UUIDs to assign' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  permissionIds?: string[];
}
