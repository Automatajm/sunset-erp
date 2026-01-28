import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsBoolean, IsOptional, IsInt, IsUUID, IsArray } from 'class-validator';

export class CreateStatusTransitionDto {
  @ApiProperty({ example: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  statusGroupId: string;

  @ApiPropertyOptional({ example: 'uuid', description: 'From status (null = any status)' })
  @IsUUID()
  @IsOptional()
  fromStatusId?: string;

  @ApiProperty({ example: 'uuid' })
  @IsUUID()
  @IsNotEmpty()
  toStatusId: string;

  @ApiProperty({ example: 'Aprobar Recepción' })
  @IsString()
  @IsNotEmpty()
  transitionName: string;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  requiresApproval?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsBoolean()
  @IsOptional()
  requiresReason?: boolean;

  @ApiPropertyOptional({ example: 'INV:receipts:approve:tenant' })
  @IsString()
  @IsOptional()
  requiredPermission?: string;

  @ApiPropertyOptional({ example: ['ADMIN', 'SUPERVISOR'] })
  @IsArray()
  @IsOptional()
  allowedRoles?: string[];

  @ApiPropertyOptional({ 
    example: { requireFields: ['approvedBy'], customChecks: ['allLinesReceived'] }
  })
  @IsOptional()
  validationRules?: any;

  @ApiPropertyOptional({
    example: { sendNotification: true, updateStock: true }
  })
  @IsOptional()
  autoActions?: any;

  @ApiPropertyOptional({ default: 0 })
  @IsInt()
  @IsOptional()
  displayOrder?: number;
}