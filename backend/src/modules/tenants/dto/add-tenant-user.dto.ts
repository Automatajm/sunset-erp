// FILE: backend/src/modules/tenants/dto/add-tenant-user.dto.ts
import { IsUUID, IsBoolean, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class AddTenantUserDto {
  @ApiProperty({ description: 'User UUID to add to this tenant' })
  @IsUUID('4')
  userId: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
