// ============================================================================
// FILE: backend/src/modules/users/dto/assign-roles.dto.ts
// ============================================================================
import { IsArray, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AssignRolesDto {
  @ApiProperty({ type: [String], description: 'Role UUIDs — replaces all current roles for this tenant' })
  @IsArray()
  @IsUUID('4', { each: true })
  roleIds: string[];
}