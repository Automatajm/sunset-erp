import { IsString, IsOptional, IsBoolean, IsNumber, MaxLength, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateAccountDto {
  @ApiProperty({ example: '1000', description: 'Account code' })
  @IsString()
  @MaxLength(50)
  accountCode: string;

  @ApiProperty({ example: 'Cash in Bank', description: 'Account name' })
  @IsString()
  @MaxLength(255)
  accountName: string;

  @ApiProperty({ example: 'asset', description: 'Account type: asset, liability, equity, revenue, expense' })
  @IsString()
  @MaxLength(50)
  accountType: string;

  @ApiPropertyOptional({ example: 'current_asset', description: 'Account sub-type' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  accountSubType?: string;

  @ApiPropertyOptional({ example: '1', description: 'Account level (1=header, 2+=detail)' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  accountLevel?: number;

  @ApiPropertyOptional({ example: '1000', description: 'Parent account code' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  parentAccountCode?: string;

  @ApiPropertyOptional({ example: 'USD', description: 'Currency code' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional({ default: true, description: 'Is account active' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional({ default: false, description: 'Is header account (non-posting)' })
  @IsOptional()
  @IsBoolean()
  isHeader?: boolean;

  @ApiPropertyOptional({ description: 'Account description' })
  @IsOptional()
  @IsString()
  description?: string;
}
