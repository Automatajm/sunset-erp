import { IsString, IsOptional, IsBoolean, IsIn, IsUUID, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAccountDto {
  @ApiProperty({ example: '1.1.03' })
  @IsString()
  @MaxLength(50)
  accountNumber: string;

  @ApiProperty({ example: 'Cash on Hand' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 'asset', enum: ['asset', 'liability', 'equity', 'revenue', 'expense'] })
  @IsIn(['asset', 'liability', 'equity', 'revenue', 'expense'])
  accountType: string;

  @ApiPropertyOptional({ example: 'current_asset' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  accountCategory?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  parentAccountId?: string;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  allowManualPosting?: boolean;
}
