// ============================================================================
// FILE: backend/src/modules/roles/dto/update-role-permissions.dto.ts
// ============================================================================
import { IsArray, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateRolePermissionsDto {
  @ApiProperty({
    type: [String],
    description: 'Permission UUIDs — replaces all current permissions for this role',
  })
  @IsArray()
  @IsUUID('4', { each: true })
  permissionIds: string[];
}
