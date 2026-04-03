// ============================================================================
// FILE: backend/src/modules/suppliers/dto/create-supplier.dto.ts
// ============================================================================
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsString, IsOptional, IsBoolean, IsNumber, IsEmail,
  IsUrl, IsIn, Min, Max, MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';

const INCOTERMS = ['EXW','FCA','CPT','CIP','DAP','DPU','DDP','FAS','FOB','CFR','CIF'];

export class CreateSupplierDto {
  // ── Identity ──────────────────────────────────────────────────────────────
  @ApiProperty({ example: 'SUP-001' })
  @IsString() @MaxLength(50)
  code: string;

  @ApiProperty({ example: 'Acme Corporation' })
  @IsString() @MaxLength(255)
  name: string;

  @ApiPropertyOptional({ example: 'Acme Corporation LLC' })
  @IsOptional() @IsString() @MaxLength(255)
  legalName?: string;

  @ApiPropertyOptional({ example: '123-45678-9' })
  @IsOptional() @IsString() @MaxLength(50)
  taxId?: string;

  @ApiPropertyOptional({ example: 'ITBIS' })
  @IsOptional() @IsString() @MaxLength(50)
  taxType?: string;

  // ── Contact ───────────────────────────────────────────────────────────────
  @ApiPropertyOptional({ example: '+1-809-555-0123' })
  @IsOptional() @IsString() @MaxLength(20)
  phone?: string;

  @ApiPropertyOptional({ example: 'contact@acme.com' })
  @IsOptional() @IsString() @MaxLength(255)
  email?: string;

  @ApiPropertyOptional({ example: 'https://acme.com' })
  @IsOptional() @IsString() @MaxLength(255)
  website?: string;

  // ── Operational contact ───────────────────────────────────────────────────
  @ApiPropertyOptional({ example: 'Juan Pérez' })
  @IsOptional() @IsString() @MaxLength(255)
  contactName?: string;

  @ApiPropertyOptional({ example: '+1-809-555-0001' })
  @IsOptional() @IsString() @MaxLength(20)
  contactPhone?: string;

  @ApiPropertyOptional({ example: 'jperez@acme.com' })
  @IsOptional() @IsString() @MaxLength(255)
  contactEmail?: string;

  // ── Address ───────────────────────────────────────────────────────────────
  @ApiPropertyOptional({ example: 'Av. 27 de Febrero #123' })
  @IsOptional() @IsString()
  address?: string;

  @ApiPropertyOptional({ example: 'Santo Domingo' })
  @IsOptional() @IsString() @MaxLength(100)
  city?: string;

  @ApiPropertyOptional({ example: 'DO', description: 'ISO 2-char country code' })
  @IsOptional() @IsString() @MaxLength(2)
  country?: string;

  // ── Commercial ────────────────────────────────────────────────────────────
  @ApiPropertyOptional({ example: 'Net 30' })
  @IsOptional() @IsString() @MaxLength(50)
  paymentTerms?: string;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional() @IsString() @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional({ example: 'FOB', enum: INCOTERMS })
  @IsOptional() @IsString() @IsIn(INCOTERMS)
  incoterms?: string;

  @ApiPropertyOptional({ example: 10000 })
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number)
  creditLimit?: number;

  @ApiPropertyOptional({ example: 500 })
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number)
  minimumOrderAmount?: number;

  @ApiPropertyOptional({ example: 'USD' })
  @IsOptional() @IsString() @MaxLength(3)
  minimumOrderCurrency?: string;

  @ApiPropertyOptional({ example: 7 })
  @IsOptional() @IsNumber() @Min(0) @Type(() => Number)
  deliveryLeadDays?: number;

  @ApiPropertyOptional({ example: 4.5, description: '0.00 – 5.00' })
  @IsOptional() @IsNumber() @Min(0) @Max(5) @Type(() => Number)
  qualityRating?: number;

  @ApiPropertyOptional({ example: 'Manufacturing' })
  @IsOptional() @IsString() @MaxLength(100)
  category?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional() @IsBoolean()
  isPreferred?: boolean;

  // ── Banking ───────────────────────────────────────────────────────────────
  @ApiPropertyOptional({ example: 'Banco Popular' })
  @IsOptional() @IsString() @MaxLength(255)
  bankName?: string;

  @ApiPropertyOptional({ example: '123-456789-0' })
  @IsOptional() @IsString() @MaxLength(100)
  bankAccount?: string;

  @ApiPropertyOptional({ example: '021000021' })
  @IsOptional() @IsString() @MaxLength(50)
  bankRouting?: string;

  // ── Notes ─────────────────────────────────────────────────────────────────
  @ApiPropertyOptional()
  @IsOptional() @IsString()
  notes?: string;
}