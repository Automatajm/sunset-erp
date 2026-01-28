import { IsString, IsOptional, MinLength, MaxLength, IsEnum } from 'class-validator';
import { SystemRole } from '@prisma/client';

export class CreateRoleDto {
  @IsString()
  @MinLength(2)
  @MaxLength(50)
  code: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsEnum(SystemRole)
  systemRole?: SystemRole;

  @IsOptional()
  @IsString()
  parentRoleId?: string;
}