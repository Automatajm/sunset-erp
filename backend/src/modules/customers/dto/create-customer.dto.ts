import {
  IsString,
  IsOptional,
  IsEmail,
  IsNumber,
  IsIn,
  IsBoolean,
  MaxLength,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCustomerDto {
  @ApiProperty({ example: 'ABC Manufacturing Inc.', description: 'Customer name' })
  @IsString()
  @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ example: 'ABC Manufacturing Incorporated', description: 'Legal name' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  legalName?: string;

  @ApiPropertyOptional({ example: '987-65-4321', description: 'Tax ID' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  taxId?: string;

  @ApiPropertyOptional({ example: '+1-555-0188', description: 'Phone number' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ example: 'contact@abcmfg.com', description: 'Email' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ example: 'https://abcmfg.com', description: 'Website' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  website?: string;

  @ApiPropertyOptional({ example: 50000, description: 'Credit limit' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(9999999999999.99) // Decimal(15,2) — DB overflow must be a 400, not a 500
  creditLimit?: number;

  @ApiPropertyOptional({ example: 'good', enum: ['good', 'watch', 'hold'] })
  @IsOptional()
  @IsIn(['good', 'watch', 'hold'])
  creditStatus?: string;

  @ApiPropertyOptional({ example: 'Net 30', description: 'Payment terms' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  paymentTerms?: string;

  @ApiPropertyOptional({ example: 'USD', description: 'Currency' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional({ description: 'Notes' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({ default: true, description: 'Is customer active' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
