// ============================================================================
// FILE: backend/src/modules/suppliers/suppliers.service.ts
// ============================================================================
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
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
    const last = await this.prisma.supplier.findFirst({
      where: { tenantId, code: { startsWith: prefix } },
      orderBy: { code: 'desc' },
    });
    if (!last) return `${prefix}-0001`;
    const parts = last.code.split('-');
    const lastNum = parseInt(parts[parts.length - 1], 10);
    const nextNum = isNaN(lastNum) ? 1 : lastNum + 1;
    return `${prefix}-${nextNum.toString().padStart(4, '0')}`;
  }

  // ── Create ─────────────────────────────────────────────────────────────────

  async create(tenantId: string, userId: string, dto: CreateSupplierDto) {
    // Auto-generate code if not provided
    const code = dto.code?.trim() || (await this.generateCode(tenantId));

    const existing = await this.prisma.supplier.findFirst({
      where: { tenantId, code, deletedAt: null },
    });
    if (existing) throw new ConflictException(`Supplier with code ${code} already exists`);

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

    if (dto.code) {
      const duplicate = await this.prisma.supplier.findFirst({
        where: { tenantId, code: dto.code, id: { not: id }, deletedAt: null },
      });
      if (duplicate) throw new ConflictException(`Supplier with code ${dto.code} already exists`);
    }

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
