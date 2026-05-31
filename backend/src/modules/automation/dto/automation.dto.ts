import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString, IsOptional, IsBoolean, IsEnum } from 'class-validator';

export enum AutomationMode {
  FULL_AUTO = 'full_auto',
  REVIEW_REQUIRED = 'review_required',
  MANUAL = 'manual',
}

export class UpdateAutomationConfigDto {
  @ApiProperty({ enum: AutomationMode, example: 'review_required' })
  @IsEnum(AutomationMode)
  mode: AutomationMode;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  isEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}

export class ReviewQueueItemDto {
  @ApiPropertyOptional({ example: 'Approved — amounts verified' })
  @IsOptional()
  @IsString()
  notes?: string;
}

export class RejectQueueItemDto {
  @ApiProperty({ example: 'Wrong account used' })
  @IsString()
  rejectReason: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;
}
