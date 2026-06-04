import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  // ── Auto-code CL-YYYY-NNNN (spec-012: codes are system-assigned, immutable) ──
  private async generateCode(tenantId: string): Promise<string> {
    const prefix = `CL-${new Date().getFullYear()}`;
    // Numeric max (never lexicographic), NaN-guarded, spanning soft-deleted rows —
    // @@unique([tenantId, code]) spans them (house convention).
    const rows = await this.prisma.customer.findMany({
      where: { tenantId, code: { startsWith: prefix } },
      select: { code: true },
    });
    const max = rows.reduce((m, r) => {
      const n = parseInt(r.code.split('-')[2] ?? '', 10);
      return isNaN(n) ? m : Math.max(m, n);
    }, 0);
    return `${prefix}-${String(max + 1).padStart(4, '0')}`;
  }

  async create(tenantId: string, userId: string, createCustomerDto: CreateCustomerDto) {
    const customer = await this.prisma.customer.create({
      data: {
        tenantId,
        code: await this.generateCode(tenantId),
        name: createCustomerDto.name,
        legalName: createCustomerDto.legalName,
        taxId: createCustomerDto.taxId,
        phone: createCustomerDto.phone,
        email: createCustomerDto.email,
        website: createCustomerDto.website,
        creditLimit: createCustomerDto.creditLimit || 0,
        creditStatus: createCustomerDto.creditStatus || 'good',
        paymentTerms: createCustomerDto.paymentTerms,
        currency: createCustomerDto.currency,
        notes: createCustomerDto.notes,
        isActive: createCustomerDto.isActive ?? true,
        createdBy: userId,
        updatedBy: userId,
      },
    });

    return customer;
  }

  async findAll(tenantId: string) {
    const customers = await this.prisma.customer.findMany({
      where: {
        tenantId,
        deletedAt: null,
      },
      orderBy: {
        code: 'asc',
      },
    });
    return { customers, count: customers.length };
  }

  async findOne(tenantId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
      },
    });

    if (!customer) {
      throw new NotFoundException(`Customer with ID ${id} not found`);
    }

    return customer;
  }

  async update(tenantId: string, userId: string, id: string, updateCustomerDto: UpdateCustomerDto) {
    await this.findOne(tenantId, id);

    // Codes are immutable (spec-012). Tenant scope enforced at the write itself
    // (updateMany — Prisma update() only accepts unique wheres), then re-fetch.
    await this.prisma.customer.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: {
        ...updateCustomerDto,
        updatedBy: userId,
      },
    });
    return this.prisma.customer.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
  }

  async remove(tenantId: string, userId: string, id: string) {
    // Own-relation filtered count — a customer referenced by active sales orders
    // cannot be deleted (spec-013); no sales-orders module query.
    const customer = await this.prisma.customer.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: { _count: { select: { salesOrders: { where: { deletedAt: null } } } } },
    });
    if (!customer) {
      throw new NotFoundException(`Customer with ID ${id} not found`);
    }
    if (customer._count.salesOrders > 0) {
      throw new BadRequestException(
        `Cannot delete: ${customer._count.salesOrders} sales orders still reference this customer`,
      );
    }

    await this.prisma.customer.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: {
        deletedAt: new Date(),
        deletedBy: userId,
      },
    });

    return {
      message: 'Customer deleted successfully',
      id,
    };
  }
}
