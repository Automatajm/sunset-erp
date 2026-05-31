// ============================================================================
// FILE: backend/src/modules/bulk-import/dto/bulk-import.dto.ts
// ============================================================================
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsBoolean, IsOptional, IsString } from 'class-validator';

export const BULK_IMPORT_ENTITIES = [
  'items',
  'customers',
  'suppliers',
  'warehouses',
  'warehouse-locations',
  'work-centers',
  'accounts',
  'sales-orders',
  'purchase-orders',
  'budget-lines',
  'fiscal-periods',
  'boms',
  'bom-routings',
  'users',
  'roles',
] as const;

export type BulkImportEntity = (typeof BULK_IMPORT_ENTITIES)[number];

export class BulkImportDto {
  @ApiPropertyOptional({ description: 'Array of records to import', isArray: true })
  @IsOptional()
  @IsArray()
  records?: Record<string, any>[];

  @ApiPropertyOptional({ description: 'External URL to fetch records from (JSON array)' })
  @IsOptional()
  @IsString()
  sourceUrl?: string;

  @ApiPropertyOptional({ description: 'Bearer token for sourceUrl authentication' })
  @IsOptional()
  @IsString()
  sourceToken?: string;

  @ApiPropertyOptional({
    description: 'If true, validate only - do not insert or update',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  dryRun?: boolean;

  @ApiPropertyOptional({
    description: 'If true, update existing records instead of skipping',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  upsert?: boolean;
}

export interface BulkImportError {
  row: number;
  field: string;
  message: string;
  value?: any;
}

export interface BulkImportResult {
  entity: string;
  total: number;
  valid: number;
  inserted: number;
  updated: number;
  skipped: number;
  errors: BulkImportError[];
  dryRun: boolean;
  upsert: boolean;
}
