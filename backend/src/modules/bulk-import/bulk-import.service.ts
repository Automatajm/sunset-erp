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
      case 'sales-orders':    return this.importSalesOrders(tenantId, userId, records, dryRun, upsert);
      case 'purchase-orders': return this.importPurchaseOrders(tenantId, userId, records, dryRun, upsert);
      case 'budget-lines':    return this.importBudgetLines(tenantId, userId, records, dryRun, upsert);
      case 'fiscal-periods': return this.importFiscalPeriods(tenantId, userId, records, dryRun, upsert);
      case 'boms':           return this.importBoms(tenantId, userId, records, dryRun, upsert);
      case 'bom-routings':   return this.importBomRoutings(tenantId, userId, records, dryRun, upsert);
      case 'warehouse-locations': return this.importWarehouseLocations(tenantId, userId, records, dryRun, upsert);
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

  // ── Date parser — handles YYYY-MM-DD, Excel serials, JS Dates ──────────────
  private parseDate(val: any): string | null {
    if (!val) return null;
    if (val instanceof Date) {
      if (isNaN(val.getTime())) return null;
      return val.toISOString().slice(0, 10);
    }
    const s = String(val).trim().replace(/[\u00a0\u200b\ufeff]/g, '');
    if (!s) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
    const n = Number(s);
    if (!isNaN(n) && n > 40000 && n < 60000) {
      return new Date((n - 25569) * 86400 * 1000).toISOString().slice(0, 10);
    }
    if (s.includes('T')) return s.slice(0, 10);
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
    return null;
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

  async importWarehouses(
  tenantId: string, userId: string,
  records: Record<string, any>[], dryRun: boolean, upsert: boolean,
): Promise<BulkImportResult> {
  const errors: BulkImportError[] = [];
  let inserted = 0, updated = 0, skipped = 0;
 
  // TYPE_PREFIX map for auto-code generation
  const TYPE_PREFIX: Record<string, string> = {
    regular: 'REG', consignment: 'CON', transit: 'TRN',
  };
 
  const generateCode = async (warehouseType: string): Promise<string> => {
    const prefix = `WH-${TYPE_PREFIX[warehouseType] ?? 'REG'}`;
    const last = await this.prisma.warehouse.findFirst({
      where: { tenantId, code: { startsWith: prefix }, deletedAt: null },
      orderBy: { code: 'desc' },
    });
    if (!last) return `${prefix}-001`;
    const parts = last.code.split('-');
    const lastNum = parseInt(parts[parts.length - 1], 10);
    const nextNum = isNaN(lastNum) ? 1 : lastNum + 1;
    return `${prefix}-${nextNum.toString().padStart(3, '0')}`;
  };
 
  for (let i = 0; i < records.length; i++) {
    const r = records[i]; const row = i + 1;
    const rowErrors: BulkImportError[] = [];
    const name = this.req(row, r, 'name', rowErrors);
    if (rowErrors.length > 0) { errors.push(...rowErrors); continue; }
 
    const warehouseType = this.str(r, 'warehouseType') ?? 'regular';
    // Code: use provided value or auto-generate
    const rawCode = this.str(r, 'code');
    const code = rawCode
      ? rawCode.toUpperCase()
      : await generateCode(warehouseType);
 
    const existing = await this.prisma.warehouse.findFirst({
      where: { tenantId, code, deletedAt: null },
    });
 
    if (existing) {
      if (upsert) {
        if (!dryRun) {
          await this.prisma.warehouse.update({
            where: { id: existing.id },
            data: {
              name,
              warehouseType,
              address:                 this.str(r, 'address')                ?? existing.address  ?? undefined,
              isActive:                r.isActive !== undefined               ? this.bool(r, 'isActive', existing.isActive) : existing.isActive,
              locationTrackingEnabled: r.locationTrackingEnabled !== undefined ? this.bool(r, 'locationTrackingEnabled', existing.locationTrackingEnabled) : existing.locationTrackingEnabled,
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
          tenantId, code, name: name!,
          warehouseType,
          address:                 this.str(r, 'address'),
          isActive:                this.bool(r, 'isActive',                true),
          locationTrackingEnabled: this.bool(r, 'locationTrackingEnabled', false),
          createdBy: userId, updatedBy: userId,
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

  // ============================================================================
  // SALES ORDERS (flat format — grouped by customerCode+orderDate)
  // ============================================================================

  async importSalesOrders(tenantId: string, userId: string, records: Record<string, any>[], dryRun: boolean, upsert: boolean): Promise<BulkImportResult> {
    const errors: BulkImportError[] = [];
    let inserted = 0, updated = 0, skipped = 0;

    // ── Group rows by customerCode + orderDate ──────────────────────────────
    const groups = new Map<string, Record<string, any>[]>();
    for (let i = 0; i < records.length; i++) {
      const r = records[i]; const row = i + 1;
      const rowErrors: BulkImportError[] = [];
      const customerCode = this.req(row, r, 'customerCode', rowErrors);
      const orderDate    = this.req(row, r, 'orderDate',    rowErrors);
      const itemCode     = this.req(row, r, 'itemCode',     rowErrors);
      const qty          = this.req(row, r, 'qty',          rowErrors);
      const unitPrice    = this.req(row, r, 'unitPrice',    rowErrors);
      if (rowErrors.length > 0) { errors.push(...rowErrors); continue; }

      const parsedOrderDate = this.parseDate(orderDate);
      if (!parsedOrderDate) { errors.push({ row, field: 'orderDate', message: `Invalid date: ${orderDate}` }); continue; }
      const key = `${customerCode}||${parsedOrderDate}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push({ ...r, _row: row, _parsedDate: parsedOrderDate });
    }

    // ── Process each group as one Sales Order ───────────────────────────────
    for (const [key, rows] of groups) {
      const first = rows[0];
      const row   = first._row;
      const customerCode = String(first.customerCode).trim();

      // Resolve customer by code
      const customer = await this.prisma.customer.findFirst({
        where: { tenantId, code: customerCode, deletedAt: null },
      });
      if (!customer) {
        errors.push({ row, field: 'customerCode', message: `Customer code ${customerCode} not found` });
        continue;
      }

      // Resolve items for all lines
      const lines: any[] = [];
      let hasLineError = false;
      let subtotal = 0;

      for (const r of rows) {
        const itemCode = String(r.itemCode).trim();
        const item = await this.prisma.item.findFirst({
          where: { tenantId, code: itemCode, deletedAt: null },
        });
        if (!item) {
          errors.push({ row: r._row, field: 'itemCode', message: `Item code ${itemCode} not found` });
          hasLineError = true; continue;
        }

        const qty          = Number(r.qty)       || 0;
        const unitPrice    = Number(r.unitPrice)  || 0;
        const discount     = Number(r.discount)   || 0;
        const lineTotal    = qty * unitPrice * (1 - discount / 100);
        subtotal          += lineTotal;

        lines.push({
          tenantId,
          lineNumber:       lines.length + 1,
          itemId:           item.id,
          description:      this.str(r, 'notes') ?? item.name,
          orderedQuantity:  qty,
          reservedQuantity: 0,
          shippedQuantity:  0,
          uom:              this.str(r, 'uom') ?? item.baseUom,
          unitPrice,
          discountPercent:  discount,
          lineTotal,
          deliveryDate:     this.str(r, 'promisedDate') ? new Date(this.str(r, 'promisedDate')!) : null,
          status:           'open',
          createdBy:        userId,
          updatedBy:        userId,
        });
      }

      if (hasLineError) continue;

      // Check if SO with same customer+date already exists (by soNumber pattern)
      const orderDateStr = first._parsedDate as string;
      const existingSo = await this.prisma.salesOrder.findFirst({
        where: {
          tenantId,
          customerId: customer.id,
          orderDate: { gte: new Date(orderDateStr + 'T00:00:00'), lte: new Date(orderDateStr + 'T23:59:59') },
          deletedAt: null,
        },
      });

      if (existingSo) {
        if (upsert) {
          if (!dryRun) {
            // Add new lines to existing SO
            for (const line of lines) {
              const lastLine = await this.prisma.salesOrderLine.findFirst({
                where: { salesOrderId: existingSo.id, deletedAt: null },
                orderBy: { lineNumber: 'desc' },
              });
              const nextLine = (lastLine?.lineNumber ?? 0) + 1;
              await this.prisma.salesOrderLine.create({
                data: { ...line, salesOrderId: existingSo.id, lineNumber: nextLine },
              });
            }
            await this.prisma.salesOrder.update({
              where: { id: existingSo.id },
              data: { subtotal: { increment: subtotal }, total: { increment: subtotal }, updatedBy: userId },
            });
          }
          updated++;
        } else { skipped++; }
        continue;
      }

      if (!dryRun) {
        // Generate SO number
        const year   = new Date(orderDateStr).getFullYear();
        const prefix = `SO-${year}`;
        const lastSo = await this.prisma.salesOrder.findFirst({
          where: { tenantId, soNumber: { startsWith: prefix } },
          orderBy: { soNumber: 'desc' },
        });
        const nextNum  = lastSo ? (parseInt(lastSo.soNumber.split('-')[2]) + 1).toString().padStart(4, '0') : '0001';
        const soNumber = `${prefix}-${nextNum}`;

        await this.prisma.salesOrder.create({
          data: {
            tenantId, soNumber,
            customerId:   customer.id,
            orderDate:    new Date(orderDateStr),
            promisedDate: this.str(first, 'promisedDate') ? new Date(this.str(first, 'promisedDate')!) : null,
            paymentTerms: this.str(first, 'paymentTerms'),
            currency:     this.str(first, 'currency') ?? 'USD',
            exchangeRate: 1,
            subtotal, discountAmount: 0, taxAmount: 0, total: subtotal,
            status: 'draft',
            notes:  this.str(first, 'notes'),
            createdBy: userId, updatedBy: userId,
            lines: { create: lines },
          },
        });
      }
      inserted++;
    }

    return this.buildResult('sales-orders', records.length, inserted, updated, skipped, errors, dryRun, upsert);
  }

  // ============================================================================
  // PURCHASE ORDERS (flat format — grouped by supplierCode+poDate)
  // ============================================================================

  async importPurchaseOrders(tenantId: string, userId: string, records: Record<string, any>[], dryRun: boolean, upsert: boolean): Promise<BulkImportResult> {
    const errors: BulkImportError[] = [];
    let inserted = 0, updated = 0, skipped = 0;

    const groups = new Map<string, Record<string, any>[]>();
    for (let i = 0; i < records.length; i++) {
      const r = records[i]; const row = i + 1;
      const rowErrors: BulkImportError[] = [];
      this.req(row, r, 'supplierCode', rowErrors);
      this.req(row, r, 'poDate',       rowErrors);
      this.req(row, r, 'itemCode',     rowErrors);
      this.req(row, r, 'qty',          rowErrors);
      this.req(row, r, 'unitPrice',    rowErrors);
      if (rowErrors.length > 0) { errors.push(...rowErrors); continue; }

      const parsedPoDate = this.parseDate(r.poDate);
      if (!parsedPoDate) { errors.push({ row, field: 'poDate', message: `Invalid date: ${r.poDate}` }); continue; }
      const key = `${String(r.supplierCode).trim()}||${parsedPoDate}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push({ ...r, _row: row, _parsedDate: parsedPoDate });
    }

    for (const [key, rows] of groups) {
      const first        = rows[0];
      const row          = first._row;
      const supplierCode = String(first.supplierCode).trim();

      const supplier = await this.prisma.supplier.findFirst({
        where: { tenantId, code: supplierCode, deletedAt: null },
      });
      if (!supplier) {
        errors.push({ row, field: 'supplierCode', message: `Supplier code ${supplierCode} not found` });
        continue;
      }

      const lines: any[] = [];
      let hasLineError = false;
      let subtotal = 0;

      for (const r of rows) {
        const itemCode = String(r.itemCode).trim();
        const item = await this.prisma.item.findFirst({
          where: { tenantId, code: itemCode, deletedAt: null },
        });
        if (!item) {
          errors.push({ row: r._row, field: 'itemCode', message: `Item code ${itemCode} not found` });
          hasLineError = true; continue;
        }

        const qty       = Number(r.qty)      || 0;
        const unitPrice = Number(r.unitPrice) || 0;
        const discount  = Number(r.discount)  || 0;
        const lineTotal = qty * unitPrice * (1 - discount / 100);
        subtotal       += lineTotal;

        lines.push({
          tenantId,
          lineNumber:       lines.length + 1,
          itemId:           item.id,
          description:      this.str(r, 'notes') ?? item.name,
          orderedQuantity:  qty,
          receivedQuantity: 0,
          uom:              this.str(r, 'uom') ?? item.baseUom,
          unitPrice,
          discountPercent:  discount,
          lineTotal,
          expectedDate:     this.str(r, 'expectedDate') ? new Date(this.str(r, 'expectedDate')!) : null,
          status:           'open',
          createdBy:        userId,
          updatedBy:        userId,
        });
      }

      if (hasLineError) continue;

      const poDateStr = first._parsedDate as string;
      const existingPo = await this.prisma.purchaseOrder.findFirst({
        where: {
          tenantId,
          supplierId: supplier.id,
          poDate: { gte: new Date(poDateStr + 'T00:00:00'), lte: new Date(poDateStr + 'T23:59:59') },
          deletedAt: null,
        },
      });

      if (existingPo) {
        if (upsert) {
          if (!dryRun) {
            for (const line of lines) {
              const lastLine = await this.prisma.purchaseOrderLine.findFirst({
                where: { purchaseOrderId: existingPo.id, deletedAt: null },
                orderBy: { lineNumber: 'desc' },
              });
              await this.prisma.purchaseOrderLine.create({
                data: { ...line, purchaseOrderId: existingPo.id, lineNumber: (lastLine?.lineNumber ?? 0) + 1 },
              });
            }
            await this.prisma.purchaseOrder.update({
              where: { id: existingPo.id },
              data: { subtotal: { increment: subtotal }, total: { increment: subtotal }, updatedBy: userId },
            });
          }
          updated++;
        } else { skipped++; }
        continue;
      }

      if (!dryRun) {
        const year   = new Date(poDateStr).getFullYear();
        const prefix = `PO-${year}`;
        const lastPo = await this.prisma.purchaseOrder.findFirst({
          where: { tenantId, poNumber: { startsWith: prefix } },
          orderBy: { poNumber: 'desc' },
        });
        const nextNum  = lastPo ? (parseInt(lastPo.poNumber.split('-')[2]) + 1).toString().padStart(4, '0') : '0001';
        const poNumber = `${prefix}-${nextNum}`;

        await this.prisma.purchaseOrder.create({
          data: {
            tenantId, poNumber,
            supplierId:      supplier.id,
            poDate:          new Date(poDateStr),
            expectedDate:    this.str(first, 'expectedDate') ? new Date(this.str(first, 'expectedDate')!) : null,
            deliveryAddress: this.str(first, 'deliveryAddress'),
            paymentTerms:    this.str(first, 'paymentTerms'),
            currency:        this.str(first, 'currency') ?? 'USD',
            exchangeRate:    1,
            subtotal, discountAmount: 0, taxAmount: 0, total: subtotal,
            status: 'draft',
            notes:  this.str(first, 'notes'),
            createdBy: userId, updatedBy: userId,
            lines: { create: lines },
          },
        });
      }
      inserted++;
    }

    return this.buildResult('purchase-orders', records.length, inserted, updated, skipped, errors, dryRun, upsert);
  }

  // ============================================================================
  // BUDGET LINES (flat — budgetCode must exist)
  // ============================================================================

  async importBudgetLines(tenantId: string, userId: string, records: Record<string, any>[], dryRun: boolean, upsert: boolean): Promise<BulkImportResult> {
    const errors: BulkImportError[] = [];
    let inserted = 0, updated = 0, skipped = 0;

    for (let i = 0; i < records.length; i++) {
      const r = records[i]; const row = i + 1;
      const rowErrors: BulkImportError[] = [];
      const budgetCode    = this.req(row, r, 'budgetCode',    rowErrors);
      const accountNumber = this.req(row, r, 'accountNumber', rowErrors);
      const fiscalPeriod  = this.req(row, r, 'fiscalPeriod',  rowErrors);
      const amount        = this.req(row, r, 'amount',        rowErrors);
      if (rowErrors.length > 0) { errors.push(...rowErrors); continue; }

      // Resolve budget
      const budget = await this.prisma.budget.findFirst({
        where: { tenantId, budgetCode: budgetCode!, deletedAt: null },
      });
      if (!budget) {
        errors.push({ row, field: 'budgetCode', message: `Budget code ${budgetCode} not found` });
        continue;
      }
      if (budget.status === 'approved') {
        errors.push({ row, field: 'budgetCode', message: `Budget ${budgetCode} is approved — cannot add lines` });
        continue;
      }

      // Resolve account
      const account = await this.prisma.account.findFirst({
        where: { tenantId, accountNumber: accountNumber!, deletedAt: null },
      });
      if (!account) {
        errors.push({ row, field: 'accountNumber', message: `Account ${accountNumber} not found` });
        continue;
      }

      // Check existing line
      const existing = await this.prisma.budgetLine.findFirst({
        where: { budgetId: budget.id, accountId: account.id, fiscalPeriod: fiscalPeriod!, deletedAt: null },
      });

      if (existing) {
        if (upsert) {
          if (!dryRun) {
            await this.prisma.budgetLine.update({
              where: { id: existing.id },
              data: { budgetAmount: Number(amount), notes: this.str(r, 'notes') ?? existing.notes ?? undefined, updatedBy: userId },
            });
          }
          updated++;
        } else { skipped++; }
        continue;
      }

      if (!dryRun) {
        await this.prisma.budgetLine.create({
          data: {
            tenantId,
            budgetId:     budget.id,
            accountId:    account.id,
            fiscalPeriod: fiscalPeriod!,
            budgetAmount: Number(amount),
            notes:        this.str(r, 'notes'),
            createdBy:    userId,
            updatedBy:    userId,
          },
        });
      }
      inserted++;
    }

    return this.buildResult('budget-lines', records.length, inserted, updated, skipped, errors, dryRun, upsert);
  }
  // ============================================================================
  // FISCAL PERIODS
  // ============================================================================

  async importFiscalPeriods(tenantId: string, userId: string, records: Record<string, any>[], dryRun: boolean, upsert: boolean): Promise<BulkImportResult> {
    const errors: BulkImportError[] = [];
    let inserted = 0, updated = 0, skipped = 0;

    for (let i = 0; i < records.length; i++) {
      const r = records[i]; const row = i + 1;
      const rowErrors: BulkImportError[] = [];
      const periodCode    = this.req(row, r, 'periodCode',    rowErrors);
      const periodName    = this.req(row, r, 'periodName',    rowErrors);
      const startDate     = this.req(row, r, 'startDate',     rowErrors);
      const endDate       = this.req(row, r, 'endDate',       rowErrors);
      const fiscalYear    = this.req(row, r, 'fiscalYear',    rowErrors);
      if (rowErrors.length > 0) { errors.push(...rowErrors); continue; }

      const existing = await this.prisma.fiscalPeriod.findFirst({
        where: { tenantId, periodCode: periodCode!, deletedAt: null },
      });

      if (existing) {
        if (upsert) {
          if (!dryRun) {
            await this.prisma.fiscalPeriod.update({
              where: { id: existing.id },
              data: {
                periodName:    periodName!,
                startDate:     new Date(startDate!),
                endDate:       new Date(endDate!),
                fiscalYear:    fiscalYear!,
                fiscalQuarter: this.str(r, 'fiscalQuarter') ?? existing.fiscalQuarter ?? undefined,
                status:        this.str(r, 'status')        ?? existing.status,
                isCurrent:     this.bool(r, 'isCurrent',    existing.isCurrent),
                updatedBy:     userId,
              },
            });
          }
          updated++;
        } else { skipped++; }
        continue;
      }

      if (!dryRun) {
        const isCurrent = this.bool(r, 'isCurrent', false);
        if (isCurrent) {
          await this.prisma.fiscalPeriod.updateMany({
            where: { tenantId, isCurrent: true, deletedAt: null },
            data:  { isCurrent: false },
          });
        }
        await this.prisma.fiscalPeriod.create({
          data: {
            tenantId,
            periodCode:    periodCode!,
            periodName:    periodName!,
            startDate:     new Date(startDate!),
            endDate:       new Date(endDate!),
            fiscalYear:    fiscalYear!,
            fiscalQuarter: this.str(r, 'fiscalQuarter'),
            status:        this.str(r, 'status') ?? 'open',
            isCurrent,
            createdBy:     userId,
            updatedBy:     userId,
          },
        });
      }
      inserted++;
    }
    return this.buildResult('fiscal-periods', records.length, inserted, updated, skipped, errors, dryRun, upsert);
  }

  // ============================================================================
  // BOMs (with components)
  // ============================================================================

  async importBoms(tenantId: string, userId: string, records: Record<string, any>[], dryRun: boolean, upsert: boolean): Promise<BulkImportResult> {
    const errors: BulkImportError[] = [];
    let inserted = 0, updated = 0, skipped = 0;
    const { Decimal } = await import('@prisma/client/runtime/library');

    // Group rows by bomNumber + parentItemCode
    const groups = new Map<string, Record<string, any>[]>();
    for (let i = 0; i < records.length; i++) {
      const r = records[i]; const row = i + 1;
      const rowErrors: BulkImportError[] = [];
      this.req(row, r, 'bomNumber',       rowErrors);
      this.req(row, r, 'parentItemCode',  rowErrors);
      this.req(row, r, 'componentCode',   rowErrors);
      this.req(row, r, 'quantityPer',     rowErrors);
      if (rowErrors.length > 0) { errors.push(...rowErrors); continue; }

      const key = String(r.bomNumber).trim();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push({ ...r, _row: row });
    }

    for (const [bomNumber, rows] of groups) {
      const first           = rows[0];
      const row             = first._row;
      const parentItemCode  = String(first.parentItemCode).trim();

      // Resolve parent item
      const parentItem = await this.prisma.item.findFirst({
        where: { tenantId, code: parentItemCode, deletedAt: null },
      });
      if (!parentItem) {
        errors.push({ row, field: 'parentItemCode', message: `Item ${parentItemCode} not found` });
        continue;
      }

      // Check existing BOM
      const existing = await this.prisma.bom.findFirst({
        where: { tenantId, bomNumber, deletedAt: null },
      });

      if (existing) {
        if (upsert) {
          if (!dryRun) {
            // Delete existing components and recreate
            await this.prisma.bomComponent.deleteMany({ where: { bomId: existing.id } });
            for (let idx = 0; idx < rows.length; idx++) {
              const r         = rows[idx];
              const compCode  = String(r.componentCode).trim();
              const compItem  = await this.prisma.item.findFirst({ where: { tenantId, code: compCode, deletedAt: null } });
              if (!compItem) { errors.push({ row: r._row, field: 'componentCode', message: `Item ${compCode} not found` }); continue; }
              await this.prisma.bomComponent.create({
                data: {
                  tenantId, bomId: existing.id,
                  componentItemId: compItem.id,
                  lineNumber:      idx + 1,
                  quantityPer:     new Decimal(Number(r.quantityPer) || 1),
                  uom:             this.str(r, 'uom') ?? compItem.baseUom,
                  scrapPercent:    new Decimal(Number(r.scrapPercent) || 0),
                  createdBy: userId, updatedBy: userId,
                },
              });
            }
          }
          updated++;
        } else { skipped++; }
        continue;
      }

      // Resolve all component items first
      const components: any[] = [];
      let hasError = false;
      for (let idx = 0; idx < rows.length; idx++) {
        const r        = rows[idx];
        const compCode = String(r.componentCode).trim();
        const compItem = await this.prisma.item.findFirst({ where: { tenantId, code: compCode, deletedAt: null } });
        if (!compItem) {
          errors.push({ row: r._row, field: 'componentCode', message: `Item ${compCode} not found` });
          hasError = true; continue;
        }
        components.push({
          tenantId,
          componentItemId: compItem.id,
          lineNumber:      idx + 1,
          quantityPer:     new Decimal(Number(r.quantityPer) || 1),
          uom:             this.str(r, 'uom') ?? compItem.baseUom,
          scrapPercent:    new Decimal(Number(r.scrapPercent) || 0),
          createdBy: userId, updatedBy: userId,
        });
      }
      if (hasError) continue;

      if (!dryRun) {
        await this.prisma.bom.create({
          data: {
            tenantId,
            bomNumber,
            parentItemId: parentItem.id,
            version:      Number(this.str(first, 'version')) || 1,
            isActive:     this.bool(first, 'isActive', true),
            createdBy:    userId,
            updatedBy:    userId,
            components:   { create: components },
          },
        });
      }
      inserted++;
    }
    return this.buildResult('boms', records.length, inserted, updated, skipped, errors, dryRun, upsert);
  }

  // ============================================================================
  // BOM ROUTINGS
  // ============================================================================

  async importBomRoutings(tenantId: string, userId: string, records: Record<string, any>[], dryRun: boolean, upsert: boolean): Promise<BulkImportResult> {
    const errors: BulkImportError[] = [];
    let inserted = 0, updated = 0, skipped = 0;
    const { Decimal } = await import('@prisma/client/runtime/library');

    for (let i = 0; i < records.length; i++) {
      const r = records[i]; const row = i + 1;
      const rowErrors: BulkImportError[] = [];
      const bomNumber      = this.req(row, r, 'bomNumber',      rowErrors);
      const stepNumber     = this.req(row, r, 'stepNumber',     rowErrors);
      const workCenterCode = this.req(row, r, 'workCenterCode', rowErrors);
      if (rowErrors.length > 0) { errors.push(...rowErrors); continue; }

      // Resolve BOM
      const bom = await this.prisma.bom.findFirst({
        where: { tenantId, bomNumber: bomNumber!, deletedAt: null },
      });
      if (!bom) { errors.push({ row, field: 'bomNumber', message: `BOM ${bomNumber} not found` }); continue; }

      // Resolve work center
      const wc = await this.prisma.workCenter.findFirst({
        where: { tenantId, code: workCenterCode!, deletedAt: null },
      });
      if (!wc) { errors.push({ row, field: 'workCenterCode', message: `Work center ${workCenterCode} not found` }); continue; }

      const step = Number(stepNumber);

      // Check existing routing step
      const existing = await this.prisma.bomRouting.findFirst({
        where: { bomId: bom.id, stepNumber: step, deletedAt: null },
      });

      if (existing) {
        if (upsert) {
          if (!dryRun) {
            await this.prisma.bomRouting.update({
              where: { id: existing.id },
              data: {
                workCenterId:   wc.id,
                description:    this.str(r, 'description')    ?? existing.description ?? undefined,
                setupTime:      new Decimal(this.num(r, 'setupTime')      ?? Number(existing.setupTime)),
                runTimePerUnit: new Decimal(this.num(r, 'runTimePerUnit') ?? Number(existing.runTimePerUnit)),
                notes:          this.str(r, 'notes')          ?? existing.notes       ?? undefined,
                updatedBy:      userId,
              },
            });
          }
          updated++;
        } else { skipped++; }
        continue;
      }

      if (!dryRun) {
        await this.prisma.bomRouting.create({
          data: {
            tenantId,
            bomId:          bom.id,
            stepNumber:     step,
            workCenterId:   wc.id,
            description:    this.str(r, 'description'),
            setupTime:      new Decimal(this.num(r, 'setupTime')      ?? 0),
            runTimePerUnit: new Decimal(this.num(r, 'runTimePerUnit') ?? 0),
            notes:          this.str(r, 'notes'),
            createdBy:      userId,
            updatedBy:      userId,
          },
        });
      }
      inserted++;
    }
    return this.buildResult('bom-routings', records.length, inserted, updated, skipped, errors, dryRun, upsert);
  }
  // ============================================================================
// REPLACE importWarehouseLocations() in bulk-import.service.ts
// Fix: dry run now builds an in-memory cache of "would-be-created" nodes
// so parent references within the same batch resolve correctly
// ============================================================================

async importWarehouseLocations(
  tenantId: string, userId: string,
  records: Record<string, any>[], dryRun: boolean, upsert: boolean,
): Promise<BulkImportResult> {
  const errors: BulkImportError[] = [];
  let inserted = 0, updated = 0, skipped = 0;

  const VALID_LEVELS = ['zone', 'aisle', 'rack', 'level', 'bin'];

  // ── In-memory cache for dry run parent resolution ─────────────────────────
  // Maps fullCode → true for nodes that would be created in this batch
  // so that child rows can resolve parents even in dry run mode
  const dryCache = new Set<string>();

  for (let i = 0; i < records.length; i++) {
    const r = records[i]; const row = i + 1;
    const rowErrors: BulkImportError[] = [];

    const warehouseCode = this.req(row, r, 'warehouseCode', rowErrors);
    const level         = this.req(row, r, 'level',         rowErrors);
    const code          = this.req(row, r, 'code',          rowErrors);
    const name          = this.req(row, r, 'name',          rowErrors);

    if (rowErrors.length > 0) { errors.push(...rowErrors); continue; }
    if (!VALID_LEVELS.includes(level!)) {
      errors.push({ row, field: 'level', message: `Invalid level: ${level}. Must be one of: ${VALID_LEVELS.join(', ')}` });
      continue;
    }

    // Resolve warehouse
    const warehouse = await this.prisma.warehouse.findFirst({
      where: { tenantId, code: warehouseCode!, deletedAt: null },
    });
    if (!warehouse) {
      errors.push({ row, field: 'warehouseCode', message: `Warehouse code ${warehouseCode} not found` });
      continue;
    }

    const parentCode = this.str(r, 'parentCode');

    // ── Helper: find zone by code (DB + dryCache) ──────────────────────────
    const findZone = async (zoneCode: string) => {
      const db = await this.prisma.warehouseZone.findFirst({
        where: { tenantId, warehouseId: warehouse.id, code: zoneCode, deletedAt: null },
      });
      if (db) return { id: db.id, code: db.code, fullCode: db.code };
      // Check dry cache
      if (dryCache.has(`ZONE:${warehouseCode}:${zoneCode}`)) {
        return { id: `dry:${zoneCode}`, code: zoneCode, fullCode: zoneCode };
      }
      return null;
    };

    const findAisle = async (aisleFullCode: string) => {
      const db = await this.prisma.warehouseAisle.findFirst({
        where: { tenantId, fullCode: aisleFullCode, zone: { warehouseId: warehouse.id }, deletedAt: null },
      });
      if (db) return { id: db.id, fullCode: db.fullCode };
      if (dryCache.has(`AISLE:${warehouseCode}:${aisleFullCode}`)) {
        return { id: `dry:${aisleFullCode}`, fullCode: aisleFullCode };
      }
      return null;
    };

    const findRack = async (rackFullCode: string) => {
      const db = await this.prisma.warehouseRack.findFirst({
        where: { tenantId, fullCode: rackFullCode, aisle: { zone: { warehouseId: warehouse.id } }, deletedAt: null },
      });
      if (db) return { id: db.id, fullCode: db.fullCode };
      if (dryCache.has(`RACK:${warehouseCode}:${rackFullCode}`)) {
        return { id: `dry:${rackFullCode}`, fullCode: rackFullCode };
      }
      return null;
    };

    const findLevel = async (levelFullCode: string) => {
      const db = await this.prisma.warehouseLevel.findFirst({
        where: { tenantId, fullCode: levelFullCode, rack: { aisle: { zone: { warehouseId: warehouse.id } } }, deletedAt: null },
      });
      if (db) return { id: db.id, fullCode: db.fullCode };
      if (dryCache.has(`LEVEL:${warehouseCode}:${levelFullCode}`)) {
        return { id: `dry:${levelFullCode}`, fullCode: levelFullCode };
      }
      return null;
    };

    // ── Zone ─────────────────────────────────────────────────────────────
    if (level === 'zone') {
      const existing = await this.prisma.warehouseZone.findFirst({
        where: { tenantId, warehouseId: warehouse.id, code: code!, deletedAt: null },
      });
      if (existing) {
        if (upsert) {
          if (!dryRun) await this.prisma.warehouseZone.update({ where: { id: existing.id }, data: { name: name!, zoneType: this.str(r, 'zoneType') ?? existing.zoneType, description: this.str(r, 'description') ?? existing.description ?? undefined, updatedBy: userId } });
          updated++;
        } else { skipped++; }
        // Cache existing for child resolution in this batch
        dryCache.add(`ZONE:${warehouseCode}:${code}`);
        continue;
      }
      if (!dryRun) {
        await this.prisma.warehouseZone.create({ data: { tenantId, warehouseId: warehouse.id, code: code!, name: name!, zoneType: this.str(r, 'zoneType') ?? 'storage', description: this.str(r, 'description'), isActive: true, createdBy: userId, updatedBy: userId } });
      }
      // Add to dry cache so subsequent rows can reference this zone
      dryCache.add(`ZONE:${warehouseCode}:${code}`);
      inserted++;
      continue;
    }

    // ── Aisle ─────────────────────────────────────────────────────────────
    if (level === 'aisle') {
      if (!parentCode) { errors.push({ row, field: 'parentCode', message: 'parentCode (zone code) required for aisle' }); continue; }
      const zone = await findZone(parentCode);
      if (!zone) { errors.push({ row, field: 'parentCode', message: `Zone code ${parentCode} not found in warehouse ${warehouseCode}` }); continue; }
      const fullCode = `${zone.fullCode}-${code}`;
      const isDryNode = zone.id.startsWith('dry:');
      const existing = isDryNode ? null : await this.prisma.warehouseAisle.findFirst({ where: { zoneId: zone.id, code: code!, deletedAt: null } });
      if (existing) {
        if (upsert) { if (!dryRun) await this.prisma.warehouseAisle.update({ where: { id: existing.id }, data: { name: name!, fullCode, updatedBy: userId } }); updated++; }
        else { skipped++; }
        dryCache.add(`AISLE:${warehouseCode}:${fullCode}`);
        continue;
      }
      if (!dryRun && !isDryNode) {
        await this.prisma.warehouseAisle.create({ data: { tenantId, zoneId: zone.id, code: code!, name: name!, fullCode, isActive: true, createdBy: userId, updatedBy: userId } });
      }
      dryCache.add(`AISLE:${warehouseCode}:${fullCode}`);
      inserted++;
      continue;
    }

    // ── Rack ──────────────────────────────────────────────────────────────
    if (level === 'rack') {
      if (!parentCode) { errors.push({ row, field: 'parentCode', message: 'parentCode (aisle fullCode e.g. STOR-01) required for rack' }); continue; }
      const aisle = await findAisle(parentCode);
      if (!aisle) { errors.push({ row, field: 'parentCode', message: `Aisle fullCode ${parentCode} not found` }); continue; }
      const fullCode = `${aisle.fullCode}-${code}`;
      const isDryNode = aisle.id.startsWith('dry:');
      const existing = isDryNode ? null : await this.prisma.warehouseRack.findFirst({ where: { aisleId: aisle.id, code: code!, deletedAt: null } });
      if (existing) {
        if (upsert) { if (!dryRun) await this.prisma.warehouseRack.update({ where: { id: existing.id }, data: { name: name!, fullCode, updatedBy: userId } }); updated++; }
        else { skipped++; }
        dryCache.add(`RACK:${warehouseCode}:${fullCode}`);
        continue;
      }
      if (!dryRun && !isDryNode) {
        await this.prisma.warehouseRack.create({ data: { tenantId, aisleId: aisle.id, code: code!, name: name!, fullCode, isActive: true, createdBy: userId, updatedBy: userId } });
      }
      dryCache.add(`RACK:${warehouseCode}:${fullCode}`);
      inserted++;
      continue;
    }

    // ── Level ─────────────────────────────────────────────────────────────
    if (level === 'level') {
      if (!parentCode) { errors.push({ row, field: 'parentCode', message: 'parentCode (rack fullCode e.g. STOR-01-01) required for level' }); continue; }
      const rack = await findRack(parentCode);
      if (!rack) { errors.push({ row, field: 'parentCode', message: `Rack fullCode ${parentCode} not found` }); continue; }
      const fullCode = `${rack.fullCode}-${code}`;
      const isDryNode = rack.id.startsWith('dry:');
      const existing = isDryNode ? null : await this.prisma.warehouseLevel.findFirst({ where: { rackId: rack.id, code: code!, deletedAt: null } });
      if (existing) {
        if (upsert) {
          if (!dryRun) await this.prisma.warehouseLevel.update({ where: { id: existing.id }, data: { name: name!, fullCode, maxWeightKg: this.num(r, 'maxWeightKg') ?? existing.maxWeightKg ?? undefined, maxVolumeLtr: this.num(r, 'maxVolumeLtr') ?? existing.maxVolumeLtr ?? undefined, maxPallets: this.num(r, 'maxPallets') != null ? Number(this.num(r, 'maxPallets')) : existing.maxPallets ?? undefined, updatedBy: userId } });
          updated++;
        } else { skipped++; }
        dryCache.add(`LEVEL:${warehouseCode}:${fullCode}`);
        continue;
      }
      if (!dryRun && !isDryNode) {
        await this.prisma.warehouseLevel.create({ data: { tenantId, rackId: rack.id, code: code!, name: name!, fullCode, maxWeightKg: this.num(r, 'maxWeightKg'), maxVolumeLtr: this.num(r, 'maxVolumeLtr'), maxPallets: this.num(r, 'maxPallets') != null ? Number(this.num(r, 'maxPallets')) : undefined, isActive: true, createdBy: userId, updatedBy: userId } });
      }
      dryCache.add(`LEVEL:${warehouseCode}:${fullCode}`);
      inserted++;
      continue;
    }

    // ── Bin ───────────────────────────────────────────────────────────────
    if (level === 'bin') {
      if (!parentCode) { errors.push({ row, field: 'parentCode', message: 'parentCode (level fullCode e.g. STOR-01-01-01) required for bin' }); continue; }
      const lvl = await findLevel(parentCode);
      if (!lvl) { errors.push({ row, field: 'parentCode', message: `Level fullCode ${parentCode} not found` }); continue; }
      const fullCode = `${lvl.fullCode}-${code}`;
      const isDryNode = lvl.id.startsWith('dry:');
      const existing = isDryNode ? null : await this.prisma.warehouseBin.findFirst({ where: { levelId: lvl.id, code: code!, deletedAt: null } });
      if (existing) {
        if (upsert) {
          if (!dryRun) await this.prisma.warehouseBin.update({ where: { id: existing.id }, data: { name: name!, fullCode, binType: this.str(r, 'binType') ?? existing.binType, maxWeightKg: this.num(r, 'maxWeightKg') ?? existing.maxWeightKg ?? undefined, maxVolumeLtr: this.num(r, 'maxVolumeLtr') ?? existing.maxVolumeLtr ?? undefined, maxPallets: this.num(r, 'maxPallets') != null ? Number(this.num(r, 'maxPallets')) : existing.maxPallets ?? undefined, notes: this.str(r, 'notes') ?? existing.notes ?? undefined, updatedBy: userId } });
          updated++;
        } else { skipped++; }
        continue;
      }
      if (!dryRun && !isDryNode) {
        await this.prisma.warehouseBin.create({ data: { tenantId, levelId: lvl.id, code: code!, name: name!, fullCode, binType: this.str(r, 'binType') ?? 'standard', maxWeightKg: this.num(r, 'maxWeightKg'), maxVolumeLtr: this.num(r, 'maxVolumeLtr'), maxPallets: this.num(r, 'maxPallets') != null ? Number(this.num(r, 'maxPallets')) : undefined, allowMixedItems: this.bool(r, 'allowMixedItems', true), notes: this.str(r, 'notes'), isActive: true, createdBy: userId, updatedBy: userId } });
      }
      inserted++;
    }
  }

  return this.buildResult('warehouse-locations', records.length, inserted, updated, skipped, errors, dryRun, upsert);
}
}