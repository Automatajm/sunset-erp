// ============================================================================
// FILE: backend/src/modules/users/dto/create-user.dto.ts
// ============================================================================
import { IsEmail, IsString, IsOptional, IsArray, IsUUID, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ example: 'juan@company.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'SecurePass123!' })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiProperty({ example: 'Juan' })
  @IsString()
  firstName: string;

  @ApiProperty({ example: 'Rivera' })
  @IsString()
  lastName: string;

  @ApiPropertyOptional({ example: '+1-809-555-0000' })
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional({ type: [String], description: 'Role UUIDs to assign' })
  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  roleIds?: string[];
}