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

  // ── Create ─────────────────────────────────────────────────────────────────

  async create(tenantId: string, userId: string, dto: CreateSupplierDto) {
    const existing = await this.prisma.supplier.findFirst({
      where: { tenantId, code: dto.code, deletedAt: null },
    });
    if (existing) throw new ConflictException(`Supplier with code ${dto.code} already exists`);

    return this.prisma.supplier.create({
      data: {
        tenantId,
        // Identity
        code:      dto.code,
        name:      dto.name,
        legalName: dto.legalName,
        taxId:     dto.taxId,
        taxType:   dto.taxType,
        // Corporate contact
        phone:   dto.phone,
        email:   dto.email,
        website: dto.website,
        // Operational contact
        contactName:  dto.contactName,
        contactPhone: dto.contactPhone,
        contactEmail: dto.contactEmail,
        // Address
        address: dto.address,
        city:    dto.city,
        country: dto.country,
        // Commercial
        paymentTerms:        dto.paymentTerms,
        currency:            dto.currency,
        incoterms:           dto.incoterms,
        creditLimit:         dto.creditLimit,
        minimumOrderAmount:  dto.minimumOrderAmount,
        minimumOrderCurrency: dto.minimumOrderCurrency,
        deliveryLeadDays:    dto.deliveryLeadDays,
        // Classification
        category:      dto.category,
        isPreferred:   dto.isPreferred ?? false,
        qualityRating: dto.qualityRating,
        // Banking
        bankName:    dto.bankName,
        bankAccount: dto.bankAccount,
        bankRouting: dto.bankRouting,
        // Misc
        notes:    dto.notes,
        isActive: true,
        createdBy: userId,
        updatedBy: userId,
      },
    });
  }

  // ── Find All ───────────────────────────────────────────────────────────────

  async findAll(tenantId: string) {
    return this.prisma.supplier.findMany({
      where:   { tenantId, deletedAt: null },
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
      data:  { ...dto, updatedBy: userId },
    });
  }

  // ── Remove ─────────────────────────────────────────────────────────────────

  async remove(tenantId: string, userId: string, id: string) {
    await this.findOne(tenantId, id);
    const supplier = await this.prisma.supplier.update({
      where: { id },
      data:  { deletedAt: new Date(), deletedBy: userId },
    });
    return { message: 'Supplier deleted successfully', id: supplier.id };
  }
}