import { IsString, IsOptional, MinLength, MaxLength, IsEnum } from 'class-validator';
import { PermissionScope } from '@prisma/client';

export class CreatePermissionDto {
  @IsString()
  @MinLength(2)
  @MaxLength(100)
  code: string;

  @IsString()
  @MinLength(2)
  @MaxLength(100)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsString()
  @MaxLength(50)
  module: string;

  @IsString()
  @MaxLength(50)
  resource: string;

  @IsString()
  @MaxLength(20)
  action: string;

  @IsOptional()
  @IsEnum(PermissionScope)
  scope?: PermissionScope;
}