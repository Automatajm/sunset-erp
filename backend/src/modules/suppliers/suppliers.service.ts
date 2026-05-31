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
    return this.prisma.supplier.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { code: 'asc' },
    });
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

    return this.prisma.supplier.update({
      where: { id },
      data: { ...dto, updatedBy: userId },
    });
  }

  // ── Remove ─────────────────────────────────────────────────────────────────

  async remove(tenantId: string, userId: string, id: string) {
    await this.findOne(tenantId, id);
    const supplier = await this.prisma.supplier.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: userId },
    });
    return { message: 'Supplier deleted successfully', id: supplier.id };
  }
}
