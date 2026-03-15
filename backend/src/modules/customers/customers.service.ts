import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, userId: string, createCustomerDto: CreateCustomerDto) {
    const existing = await this.prisma.customer.findFirst({
      where: {
        tenantId,
        code: createCustomerDto.code,
        deletedAt: null,
      },
    });

    if (existing) {
      throw new ConflictException(`Customer with code ${createCustomerDto.code} already exists`);
    }

    const customer = await this.prisma.customer.create({
      data: {
        tenantId,
        code: createCustomerDto.code,
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
        isActive: true,
        createdBy: userId,
        updatedBy: userId,
      },
    });

    return customer;
  }

  async findAll(tenantId: string) {
    return this.prisma.customer.findMany({
      where: {
        tenantId,
        deletedAt: null,
      },
      orderBy: {
        code: 'asc',
      },
    });
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

    if (updateCustomerDto.code) {
      const existing = await this.prisma.customer.findFirst({
        where: {
          tenantId,
          code: updateCustomerDto.code,
          id: { not: id },
          deletedAt: null,
        },
      });

      if (existing) {
        throw new ConflictException(`Customer with code ${updateCustomerDto.code} already exists`);
      }
    }

    return this.prisma.customer.update({
      where: { id },
      data: {
        ...updateCustomerDto,
        updatedBy: userId,
      },
    });
  }

  async remove(tenantId: string, userId: string, id: string) {
    await this.findOne(tenantId, id);

    await this.prisma.customer.update({
      where: { id },
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
