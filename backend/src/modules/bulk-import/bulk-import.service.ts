import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { BulkImportDto, BulkImportEntity, BulkImportError, BulkImportResult } from './dto/bulk-import.dto';

@Injectable()
export class BulkImportService {
  constructor(private prisma: PrismaService) {}

  async importEntity(tenantId: string, userId: string, entity: BulkImportEntity, dto: BulkImportDto): Promise<BulkImportResult> {
    let records = dto.records ?? [];
    if (dto.sourceUrl) records = await this.fetchFromUrl(dto.sourceUrl, dto.sourceToken);
    if (!records || records.length === 0) throw new BadRequestException('No records to import.');
    if (records.length > 2000) throw new BadRequestException('Maximum 2,000 records per batch.');
    const dryRun = dto.dryRun ?? false;
    const upsert = dto.upsert ?? false;
    switch (entity) {
      case 'items':        return this.importItems(tenantId, userId, records, dryRun, upsert);
      case 'customers':    return this.importCustomers(tenantId, userId, records, dryRun, upsert);
      case 'suppliers':    return this.importSuppliers(tenantId, userId, records, dryRun, upsert);
      case 'warehouses':   return this.importWarehouses(tenantId, userId, records, dryRun, upsert);
      case 'work-centers': return this.importWorkCenters(tenantId, userId, records, dryRun, upsert);
      case 'accounts':     return this.importAccounts(tenantId, userId, records, dryRun, upsert);
      default: throw new BadRequestException(`Unsupported entity: ${entity}`);
    }
  }

  private async fetchFromUrl(url: string, token?: string): Promise<Record<string, any>[]> {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (token) headers['Authorization'] = token.startsWith('Bearer ') ? token : `Bearer ${token}`;
      const response = await fetch(url, { headers });
      if (!response.ok) throw new BadRequestException(`Source URL returned ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data)) throw new BadRequestException('Source URL must return a JSON array.');
      return data;
    } catch (err: any) {
      if (err instanceof BadRequestException) throw err;
      throw new BadRequestException(`Failed to fetch from URL: ${err.message}`);
    }
  }

  private req(row: number, record: Record<string, any>, field: string, errors: BulkImportError[]): string | null {
    const val = record[field];
    if (val === undefined || val === null || String(val).trim() === '') {
      errors.push({ row, field, message: `${field} is required`, value: val });
      return null;
    }
    return String(val).trim();
  }

  private str(record: Record<string, any>, field: string): string | undefined {
    const val = record[field];
    if (val === undefined || val === null || String(val).trim() === '') return undefined;
    return String(val).trim();
  }

  private num(record: Record<string, any>, field: string): number | undefined {
    const val = record[field];
    if (val === undefined || val === null || String(val).trim() === '') return undefined;
    const n = Number(val);
    return isNaN(n) ? undefined : n;
  }

  private bool(record: Record<string, any>, field: string, fallback = true): boolean {
    const val = record[field];
    if (val === undefined || val === null) return fallback;
    if (typeof val === 'boolean') return val;
    return ['true', '1', 'yes', 'y'].includes(String(val).toLowerCase());
  }

  private buildResult(entity: string, total: number, inserted: number, updated: number, skipped: number, errors: BulkImportError[], dryRun: boolean, upsert: boolean): BulkImportResult {
    return {
      entity, total,
      valid:    total - errors.length,
      inserted: dryRun ? 0 : inserted,
      updated:  dryRun ? 0 : updated,
      skipped,
      errors, dryRun, upsert,
    };
  }

  // ── ITEMS ──────────────────────────────────────────────────────────────────

  async importItems(tenantId: string, userId: string, records: Record<string, any>[], dryRun: boolean, upsert: boolean): Promise<BulkImportResult> {
    const errors: BulkImportError[] = [];
    let inserted = 0, updated = 0, skipped = 0;

    for (let i = 0; i < records.length; i++) {
      const r = records[i]; const row = i + 1;
      const rowErrors: BulkImportError[] = [];
      const code     = this.req(row, r, 'code',     rowErrors);
      const name     = this.req(row, r, 'name',     rowErrors);
      const itemType = this.req(row, r, 'itemType', rowErrors);
      const baseUom  = this.req(row, r, 'baseUom',  rowErrors);
      if (rowErrors.length > 0) { errors.push(...rowErrors); continue; }

      const existing = await this.prisma.item.findFirst({ where: { tenantId, code: code!, deletedAt: null } });

      if (existing) {
        if (upsert) {
          if (!dryRun) {
            await this.prisma.item.update({
              where: { id: existing.id },
              data: {
                name: name!, itemType: itemType!, baseUom: baseUom!,
                description:      this.str(r, 'description')      ?? existing.description      ?? undefined,
                isStockable:      this.bool(r, 'isStockable',      existing.isStockable),
                isPurchasable:    this.bool(r, 'isPurchasable',    existing.isPurchasable),
                isSaleable:       this.bool(r, 'isSaleable',       existing.isSaleable),
                isManufacturable: this.bool(r, 'isManufacturable', existing.isManufacturable),
                valuationMethod:  this.str(r, 'valuationMethod')   ?? existing.valuationMethod,
                standardCost:     this.num(r, 'standardCost')      ?? existing.standardCost    ?? undefined,
                leadTimeDays:     this.num(r, 'leadTimeDays')      ?? existing.leadTimeDays,
                safetyStock:      this.num(r, 'safetyStock')       ?? existing.safetyStock     ?? undefined,
                reorderPoint:     this.num(r, 'reorderPoint')      ?? existing.reorderPoint    ?? undefined,
                reorderQuantity:  this.num(r, 'reorderQuantity')   ?? existing.reorderQuantity ?? undefined,
                updatedBy: userId,
              },
            });
          }
          updated++;
        } else { skipped++; }
        continue;
      }

      if (!dryRun) {
        await this.prisma.item.create({
          data: {
            tenantId, code: code!, name: name!, itemType: itemType!, baseUom: baseUom!,
            description:      this.str(r, 'description'),
            isStockable:      this.bool(r, 'isStockable',      true),
            isPurchasable:    this.bool(r, 'isPurchasable',    true),
            isSaleable:       this.bool(r, 'isSaleable',       true),
            isManufacturable: this.bool(r, 'isManufacturable', false),
            isLotTracked:     this.bool(r, 'isLotTracked',     false),
            isSerialTracked:  this.bool(r, 'isSerialTracked',  false),
            valuationMethod:  this.str(r, 'valuationMethod') ?? 'average',
            standardCost:     this.num(r, 'standardCost'),
            leadTimeDays:     this.num(r, 'leadTimeDays')    ?? 0,
            safetyStock:      this.num(r, 'safetyStock')     ?? 0,
            reorderPoint:     this.num(r, 'reorderPoint')    ?? 0,
            reorderQuantity:  this.num(r, 'reorderQuantity') ?? 0,
            isActive: true, createdBy: userId, updatedBy: userId,
          },
        });
      }
      inserted++;
    }
    return this.buildResult('items', records.length, inserted, updated, skipped, errors, dryRun, upsert);
  }

  // ── CUSTOMERS ─────────────────────────────────────────────────────────────

  async importCustomers(tenantId: string, userId: string, records: Record<string, any>[], dryRun: boolean, upsert: boolean): Promise<BulkImportResult> {
    const errors: BulkImportError[] = [];
    let inserted = 0, updated = 0, skipped = 0;

    for (let i = 0; i < records.length; i++) {
      const r = records[i]; const row = i + 1;
      const rowErrors: BulkImportError[] = [];
      const code = this.req(row, r, 'code', rowErrors);
      const name = this.req(row, r, 'name', rowErrors);
      if (rowErrors.length > 0) { errors.push(...rowErrors); continue; }

      const existing = await this.prisma.customer.findFirst({ where: { tenantId, code: code!, deletedAt: null } });

      if (existing) {
        if (upsert) {
          if (!dryRun) {
            await this.prisma.customer.update({
              where: { id: existing.id },
              data: {
                name,
                legalName:    this.str(r, 'legalName')    ?? existing.legalName    ?? undefined,
                taxId:        this.str(r, 'taxId')        ?? existing.taxId        ?? undefined,
                phone:        this.str(r, 'phone')        ?? existing.phone        ?? undefined,
                email:        this.str(r, 'email')        ?? existing.email        ?? undefined,
                website:      this.str(r, 'website')      ?? existing.website      ?? undefined,
                creditLimit:  this.num(r, 'creditLimit')  ?? existing.creditLimit  ?? undefined,
                paymentTerms: this.str(r, 'paymentTerms') ?? existing.paymentTerms ?? undefined,
                currency:     this.str(r, 'currency')     ?? existing.currency     ?? undefined,
                notes:        this.str(r, 'notes')        ?? existing.notes        ?? undefined,
                updatedBy: userId,
              },
            });
          }
          updated++;
        } else { skipped++; }
        continue;
      }

      if (!dryRun) {
        await this.prisma.customer.create({
          data: {
            tenantId, code: code!, name: name!,
            legalName: this.str(r, 'legalName'), taxId: this.str(r, 'taxId'),
            phone: this.str(r, 'phone'), email: this.str(r, 'email'), website: this.str(r, 'website'),
            creditLimit: this.num(r, 'creditLimit') ?? 0,
            paymentTerms: this.str(r, 'paymentTerms'), currency: this.str(r, 'currency'),
            notes: this.str(r, 'notes'), isActive: true, createdBy: userId, updatedBy: userId,
          },
        });
      }
      inserted++;
    }
    return this.buildResult('customers', records.length, inserted, updated, skipped, errors, dryRun, upsert);
  }

  // ── SUPPLIERS ─────────────────────────────────────────────────────────────

  async importSuppliers(tenantId: string, userId: string, records: Record<string, any>[], dryRun: boolean, upsert: boolean): Promise<BulkImportResult> {
    const errors: BulkImportError[] = [];
    let inserted = 0, updated = 0, skipped = 0;

    for (let i = 0; i < records.length; i++) {
      const r = records[i]; const row = i + 1;
      const rowErrors: BulkImportError[] = [];
      const code = this.req(row, r, 'code', rowErrors);
      const name = this.req(row, r, 'name', rowErrors);
      if (rowErrors.length > 0) { errors.push(...rowErrors); continue; }

      const existing = await this.prisma.supplier.findFirst({ where: { tenantId, code: code!, deletedAt: null } });

      if (existing) {
        if (upsert) {
          if (!dryRun) {
            await this.prisma.supplier.update({
              where: { id: existing.id },
              data: {
                name,
                legalName:    this.str(r, 'legalName')    ?? existing.legalName    ?? undefined,
                taxId:        this.str(r, 'taxId')        ?? existing.taxId        ?? undefined,
                phone:        this.str(r, 'phone')        ?? existing.phone        ?? undefined,
                email:        this.str(r, 'email')        ?? existing.email        ?? undefined,
                website:      this.str(r, 'website')      ?? existing.website      ?? undefined,
                paymentTerms: this.str(r, 'paymentTerms') ?? existing.paymentTerms ?? undefined,
                currency:     this.str(r, 'currency')     ?? existing.currency     ?? undefined,
                creditLimit:  this.num(r, 'creditLimit')  ?? existing.creditLimit  ?? undefined,
                category:     this.str(r, 'category')     ?? existing.category     ?? undefined,
                notes:        this.str(r, 'notes')        ?? existing.notes        ?? undefined,
                updatedBy: userId,
              },
            });
          }
          updated++;
        } else { skipped++; }
        continue;
      }

      if (!dryRun) {
        await this.prisma.supplier.create({
          data: {
            tenantId, code: code!, name: name!,
            legalName: this.str(r, 'legalName'), taxId: this.str(r, 'taxId'),
            phone: this.str(r, 'phone'), email: this.str(r, 'email'), website: this.str(r, 'website'),
            paymentTerms: this.str(r, 'paymentTerms'), currency: this.str(r, 'currency'),
            creditLimit: this.num(r, 'creditLimit'), category: this.str(r, 'category'),
            notes: this.str(r, 'notes'), isActive: true, createdBy: userId, updatedBy: userId,
          },
        });
      }
      inserted++;
    }
    return this.buildResult('suppliers', records.length, inserted, updated, skipped, errors, dryRun, upsert);
  }

  // ── WAREHOUSES ────────────────────────────────────────────────────────────

  async importWarehouses(tenantId: string, userId: string, records: Record<string, any>[], dryRun: boolean, upsert: boolean): Promise<BulkImportResult> {
    const errors: BulkImportError[] = [];
    let inserted = 0, updated = 0, skipped = 0;

    for (let i = 0; i < records.length; i++) {
      const r = records[i]; const row = i + 1;
      const rowErrors: BulkImportError[] = [];
      const code = this.req(row, r, 'code', rowErrors);
      const name = this.req(row, r, 'name', rowErrors);
      if (rowErrors.length > 0) { errors.push(...rowErrors); continue; }

      const existing = await this.prisma.warehouse.findFirst({ where: { tenantId, code: code!, deletedAt: null } });

      if (existing) {
        if (upsert) {
          if (!dryRun) {
            await this.prisma.warehouse.update({
              where: { id: existing.id },
              data: {
                name,
                warehouseType: this.str(r, 'warehouseType') ?? existing.warehouseType,
                address:       this.str(r, 'address')       ?? existing.address ?? undefined,
                updatedBy: userId,
              },
            });
          }
          updated++;
        } else { skipped++; }
        continue;
      }

      if (!dryRun) {
        await this.prisma.warehouse.create({
          data: {
            tenantId, code: code!, name: name!,
            warehouseType: this.str(r, 'warehouseType') ?? 'regular',
            address: this.str(r, 'address'),
            isActive: true, createdBy: userId, updatedBy: userId,
          },
        });
      }
      inserted++;
    }
    return this.buildResult('warehouses', records.length, inserted, updated, skipped, errors, dryRun, upsert);
  }

  // ── WORK CENTERS ──────────────────────────────────────────────────────────

  async importWorkCenters(tenantId: string, userId: string, records: Record<string, any>[], dryRun: boolean, upsert: boolean): Promise<BulkImportResult> {
    const errors: BulkImportError[] = [];
    let inserted = 0, updated = 0, skipped = 0;

    for (let i = 0; i < records.length; i++) {
      const r = records[i]; const row = i + 1;
      const rowErrors: BulkImportError[] = [];
      const code           = this.req(row, r, 'code',           rowErrors);
      const name           = this.req(row, r, 'name',           rowErrors);
      const workCenterType = this.req(row, r, 'workCenterType', rowErrors);
      if (rowErrors.length > 0) { errors.push(...rowErrors); continue; }

      const existing = await this.prisma.workCenter.findFirst({ where: { tenantId, code: code!, deletedAt: null } });

      if (existing) {
        if (upsert) {
          if (!dryRun) {
            await this.prisma.workCenter.update({
              where: { id: existing.id },
              data: {
                name, workCenterType: workCenterType!,
                capacityPerHour:   this.num(r, 'capacityPerHour')   ?? existing.capacityPerHour   ?? undefined,
                efficiencyPercent: this.num(r, 'efficiencyPercent') ?? existing.efficiencyPercent ?? undefined,
                costPerHour:       this.num(r, 'costPerHour')       ?? existing.costPerHour       ?? undefined,
                updatedBy: userId,
              },
            });
          }
          updated++;
        } else { skipped++; }
        continue;
      }

      if (!dryRun) {
        await this.prisma.workCenter.create({
          data: {
            tenantId, code: code!, name: name!, workCenterType: workCenterType!,
            capacityPerHour:   this.num(r, 'capacityPerHour'),
            efficiencyPercent: this.num(r, 'efficiencyPercent') ?? 100,
            costPerHour:       this.num(r, 'costPerHour'),
            isActive: true, createdBy: userId, updatedBy: userId,
          },
        });
      }
      inserted++;
    }
    return this.buildResult('work-centers', records.length, inserted, updated, skipped, errors, dryRun, upsert);
  }

  // ── ACCOUNTS ──────────────────────────────────────────────────────────────

  async importAccounts(tenantId: string, userId: string, records: Record<string, any>[], dryRun: boolean, upsert: boolean): Promise<BulkImportResult> {
    const errors: BulkImportError[] = [];
    let inserted = 0, updated = 0, skipped = 0;

    for (let i = 0; i < records.length; i++) {
      const r = records[i]; const row = i + 1;
      const rowErrors: BulkImportError[] = [];
      const accountNumber = this.req(row, r, 'accountNumber', rowErrors);
      const name          = this.req(row, r, 'name',          rowErrors);
      const accountType   = this.req(row, r, 'accountType',   rowErrors);
      if (rowErrors.length > 0) { errors.push(...rowErrors); continue; }

      const existing = await this.prisma.account.findFirst({ where: { tenantId, accountNumber: accountNumber!, deletedAt: null } });

      if (existing) {
        if (upsert) {
          if (!dryRun) {
            await this.prisma.account.update({
              where: { id: existing.id },
              data: {
                name, accountType: accountType!,
                accountCategory:       this.str(r, 'accountCategory')       ?? existing.accountCategory       ?? undefined,
                currency:              this.str(r, 'currency')              ?? existing.currency              ?? undefined,
                isSystem:              this.bool(r, 'isSystem',              existing.isSystem),
                allowManualPosting:    this.bool(r, 'allowManualPosting',    existing.allowManualPosting),
                requireReconciliation: this.bool(r, 'requireReconciliation', existing.requireReconciliation),
                updatedBy: userId,
              },
            });
          }
          updated++;
        } else { skipped++; }
        continue;
      }

      if (!dryRun) {
        await this.prisma.account.create({
          data: {
            tenantId, accountNumber: accountNumber!, name: name!, accountType: accountType!,
            accountCategory:       this.str(r, 'accountCategory'),
            currency:              this.str(r, 'currency'),
            isSystem:              this.bool(r, 'isSystem',              false),
            allowManualPosting:    this.bool(r, 'allowManualPosting',    true),
            requireReconciliation: this.bool(r, 'requireReconciliation', false),
            isActive: true, createdBy: userId, updatedBy: userId,
          },
        });
      }
      inserted++;
    }
    return this.buildResult('accounts', records.length, inserted, updated, skipped, errors, dryRun, upsert);
  }
}