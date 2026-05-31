// ============================================================================
// FILE: backend/src/modules/users/dto/reset-password.dto.ts
// ============================================================================
import { IsString, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({ example: 'NewSecurePass123!' })
  @IsString()
  @MinLength(8)
  newPassword: string;
}
