// --- supplier-items/dto/create-supplier-item.dto.ts ---
import {
  IsString,
  IsOptional,
  IsBoolean,
  IsUUID,
  IsNumber,
  IsInt,
  IsIn,
  IsDateString,
  Min,
  Max,
  MaxLength,
} from 'class-validator';

// ICC Incoterms 2020 — the only valid three-letter delivery terms.
const INCOTERMS = [
  'EXW',
  'FCA',
  'CPT',
  'CIP',
  'DAP',
  'DPU',
  'DDP',
  'FAS',
  'FOB',
  'CFR',
  'CIF',
] as const;

// Safe caps within the Decimal column capacities — overflow fails 400, never 500.
// packSize/lastPrice: Decimal(15,4) (< 1e11) | moq: Decimal(15,3) (< 1e12) |
// conversionFactor: Decimal(18,8) (< 1e10).
const MAX_PRICE_OR_PACK = 99999999999;
const MAX_MOQ = 999999999999;
const MAX_FACTOR = 9999999999;
const MAX_LEAD_TIME_DAYS = 3650;
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSupplierItemDto {
  @ApiProperty({ description: 'Supplier ID' })
  @IsUUID()
  supplierId: string;

  @ApiProperty({ description: 'Item ID' })
  @IsUUID()
  itemId: string;

  @ApiPropertyOptional({ example: 'LOC-GAL-001', description: "Supplier's own code for this item" })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  supplierItemCode?: string;

  @ApiPropertyOptional({
    example: 'Loctite Adhesive 1 Gallon',
    description: "Supplier's item description",
  })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  supplierItemName?: string;

  @ApiProperty({ description: 'Purchase UOM ID (from cfg_uom_units)' })
  @IsUUID()
  purchaseUomId: string;

  @ApiPropertyOptional({ example: 1, description: 'Pack size in purchase UOM units', default: 1 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(MAX_PRICE_OR_PACK)
  packSize?: number;

  @ApiPropertyOptional({
    example: 1,
    description:
      'Conversion factor: defaults to 1 — the purchase-UOM rule forces unit equality with the item, so no conversion is needed (triple-UOM conversion lives on the Item factors).',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(MAX_FACTOR)
  conversionFactor?: number;

  @ApiPropertyOptional({ example: 45.99, description: 'Last known price per purchase UOM' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(MAX_PRICE_OR_PACK)
  lastPrice?: number;

  @ApiPropertyOptional({ example: 7, description: 'Lead time in days', default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(MAX_LEAD_TIME_DAYS)
  leadTimeDays?: number;

  @ApiPropertyOptional({
    example: 1,
    description: 'Minimum order quantity in purchase UOM',
    default: 1,
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(MAX_MOQ)
  moq?: number;

  @ApiPropertyOptional({ default: false, description: 'Mark as preferred supplier for this item' })
  @IsOptional()
  @IsBoolean()
  isPreferred?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  notes?: string;

  // ── commercial / pricing v2 (recovered from older branch) ──────────────────

  @ApiPropertyOptional({ example: 'USD', default: 'USD', description: 'Price currency (ISO 4217)' })
  @IsOptional()
  @IsString()
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional({ example: 'FOB', enum: INCOTERMS, description: 'ICC Incoterm 2020' })
  @IsOptional()
  @IsIn(INCOTERMS)
  incoterm?: string;

  @ApiPropertyOptional({ example: 'Net 30', description: 'Payment terms' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  paymentTerms?: string;

  @ApiPropertyOptional({ example: '2026-04-11', description: 'Current price validity start date' })
  @IsOptional()
  @IsDateString()
  priceValidFrom?: string;

  @ApiPropertyOptional({ example: '2026-10-11', description: 'Current price expiry date' })
  @IsOptional()
  @IsDateString()
  priceValidUntil?: string;

  @ApiPropertyOptional({
    example: 30,
    default: 30,
    description: 'Days before expiry to start alerting',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  priceAlertDays?: number;

  @ApiPropertyOptional({ example: 4.5, description: 'Quality rating 0–5' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(5)
  qualityRating?: number;

  @ApiPropertyOptional({ default: false, description: 'Block this supplier for this item' })
  @IsOptional()
  @IsBoolean()
  isBlocked?: boolean;

  @ApiPropertyOptional({ example: 'Quality issues', description: 'Reason the supplier is blocked' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  blockedReason?: string;
}
