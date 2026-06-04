// ============================================================================
// FILE: backend/src/modules/suppliers/suppliers.service.ts
// ============================================================================
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

@Injectable()
export class SuppliersService {
  constructor(private prisma: PrismaService) {}

  // ── Auto-generate supplier code ────────────────────────────────────────────

  private async generateCode(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `SUP-${year}`;
    // NOTE: intentionally NOT scoped to `deletedAt: null`. The `@@unique([tenantId, code])`
    // constraint spans soft-deleted rows, so a soft-deleted supplier still occupies its code.
    // Considering all codes (including soft-deleted) guarantees we never regenerate a code that
    // would collide on the unique constraint.
    // Numeric max, not lexicographic ('-99' ranks above '-104' as a string) — spec-012.
    const rows = await this.prisma.supplier.findMany({
      where: { tenantId, code: { startsWith: prefix } },
      select: { code: true },
    });
    const max = rows.reduce((m, r) => {
      const n = parseInt(r.code.split('-')[2] ?? '', 10);
      return isNaN(n) ? m : Math.max(m, n);
    }, 0);
    return `${prefix}-${String(max + 1).padStart(4, '0')}`;
  }

  // ── Create ─────────────────────────────────────────────────────────────────

  async create(tenantId: string, userId: string, dto: CreateSupplierDto) {
    // Codes are always system-assigned (spec-012) — generator spans soft-deleted
    // rows and never collides among active rows.
    const code = await this.generateCode(tenantId);

    return this.prisma.supplier.create({
      data: {
        tenantId,
        code,
        name: dto.name,
        legalName: dto.legalName,
        taxId: dto.taxId,
        taxType: dto.taxType,
        phone: dto.phone,
        email: dto.email,
        website: dto.website,
        contactName: dto.contactName,
        contactPhone: dto.contactPhone,
        contactEmail: dto.contactEmail,
        address: dto.address,
        city: dto.city,
        country: dto.country,
        paymentTerms: dto.paymentTerms,
        currency: dto.currency,
        incoterms: dto.incoterms,
        creditLimit: dto.creditLimit,
        minimumOrderAmount: dto.minimumOrderAmount,
        minimumOrderCurrency: dto.minimumOrderCurrency,
        deliveryLeadDays: dto.deliveryLeadDays,
        category: dto.category,
        isPreferred: dto.isPreferred ?? false,
        qualityRating: dto.qualityRating,
        bankName: dto.bankName,
        bankAccount: dto.bankAccount,
        bankRouting: dto.bankRouting,
        notes: dto.notes,
        isActive: true,
        createdBy: userId,
        updatedBy: userId,
      },
    });
  }

  // ── Find All ───────────────────────────────────────────────────────────────

  async findAll(tenantId: string) {
    // List is a summary projection: sensitive banking fields are stripped here.
    // The detail endpoint (findOne) returns the full row.
    const rows = await this.prisma.supplier.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { code: 'asc' },
    });
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- intentional drop of sensitive fields
    const suppliers = rows.map(({ bankAccount, bankRouting, ...rest }) => rest);
    return { suppliers, count: suppliers.length };
  }

  // ── Find One ───────────────────────────────────────────────────────────────

  async findOne(tenantId: string, id: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!supplier) throw new NotFoundException(`Supplier ${id} not found`);
    return supplier;
  }

  // ── Update ─────────────────────────────────────────────────────────────────

  async update(tenantId: string, userId: string, id: string, dto: UpdateSupplierDto) {
    await this.findOne(tenantId, id);

    // Codes are immutable (spec-012) — the DTO no longer carries one.
    // Tenant-scoped write: the write itself enforces tenancy, not just the preceding findOne.
    await this.prisma.supplier.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { ...dto, updatedBy: userId },
    });
    return this.findOne(tenantId, id);
  }

  // ── Remove ─────────────────────────────────────────────────────────────────

  async remove(tenantId: string, userId: string, id: string) {
    const supplier = await this.findOne(tenantId, id);
    // Tenant-scoped soft delete: the write itself enforces tenancy.
    await this.prisma.supplier.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { deletedAt: new Date(), deletedBy: userId },
    });
    return { message: 'Supplier deleted successfully', id: supplier.id };
  }
}
