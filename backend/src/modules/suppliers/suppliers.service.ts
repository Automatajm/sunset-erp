import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';

@Injectable()
export class SuppliersService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, userId: string, createSupplierDto: CreateSupplierDto) {
    // Check if supplier code already exists for this tenant
    const existing = await this.prisma.supplier.findFirst({
      where: {
        tenantId,
        code: createSupplierDto.code,
        deletedAt: null,
      },
    });

    if (existing) {
      throw new ConflictException(`Supplier with code ${createSupplierDto.code} already exists`);
    }

    const supplier = await this.prisma.supplier.create({
      data: {
        tenantId,
        code: createSupplierDto.code,
        name: createSupplierDto.name,
        legalName: createSupplierDto.legalName,
        taxId: createSupplierDto.taxId,
        phone: createSupplierDto.phone,
        email: createSupplierDto.email,
        website: createSupplierDto.website,
        paymentTerms: createSupplierDto.paymentTerms,
        currency: createSupplierDto.currency,
        category: createSupplierDto.category,
        notes: createSupplierDto.notes,
        isActive: true,
        createdBy: userId,
        updatedBy: userId,
      },
    });

    return supplier;
  }

  async findAll(tenantId: string) {
    const suppliers = await this.prisma.supplier.findMany({
      where: {
        tenantId,
        deletedAt: null,
      },
      orderBy: {
        code: 'asc',
      },
    });

    return suppliers;
  }

  async findOne(tenantId: string, id: string) {
    const supplier = await this.prisma.supplier.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
      },
    });

    if (!supplier) {
      throw new NotFoundException(`Supplier with ID ${id} not found`);
    }

    return supplier;
  }

  async update(tenantId: string, userId: string, id: string, updateSupplierDto: UpdateSupplierDto) {
    // Verify supplier exists and belongs to tenant
    await this.findOne(tenantId, id);

    // If updating code, check for duplicates
    if (updateSupplierDto.code) {
      const existing = await this.prisma.supplier.findFirst({
        where: {
          tenantId,
          code: updateSupplierDto.code,
          id: { not: id },
          deletedAt: null,
        },
      });

      if (existing) {
        throw new ConflictException(`Supplier with code ${updateSupplierDto.code} already exists`);
      }
    }

    const supplier = await this.prisma.supplier.update({
      where: { id },
      data: {
        ...updateSupplierDto,
        updatedBy: userId,
      },
    });

    return supplier;
  }

  async remove(tenantId: string, userId: string, id: string) {
    // Verify supplier exists and belongs to tenant
    await this.findOne(tenantId, id);

    // Soft delete
    const supplier = await this.prisma.supplier.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedBy: userId,
      },
    });

    return {
      message: 'Supplier deleted successfully',
      id: supplier.id,
    };
  }
}
