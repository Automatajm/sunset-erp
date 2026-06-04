import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

@Injectable()
export class ChartOfAccountsService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, userId: string, dto: CreateAccountDto) {
    const existing = await this.prisma.account.findFirst({
      where: { tenantId, accountNumber: dto.accountNumber, deletedAt: null },
    });
    if (existing) throw new ConflictException(`Account ${dto.accountNumber} already exists`);

    if (dto.parentAccountId) {
      const parent = await this.prisma.account.findFirst({
        where: { id: dto.parentAccountId, tenantId, deletedAt: null },
      });
      if (!parent) throw new NotFoundException(`Parent account ${dto.parentAccountId} not found`);
    }

    return this.prisma.account.create({
      data: {
        tenantId,
        accountNumber: dto.accountNumber,
        name: dto.name,
        accountType: dto.accountType,
        accountCategory: dto.accountCategory ?? null,
        parentAccountId: dto.parentAccountId ?? null,
        currency: dto.currency ?? 'USD',
        isActive: dto.isActive ?? true,
        allowManualPosting: dto.allowManualPosting ?? true,
        requireReconciliation: false,
        isSystem: false,
        createdBy: userId,
        updatedBy: userId,
      },
    });
  }

  async findAll(tenantId: string, accountType?: string) {
    const accounts = await this.prisma.account.findMany({
      where: { tenantId, deletedAt: null, ...(accountType ? { accountType } : {}) },
      orderBy: { accountNumber: 'asc' },
    });
    return { accounts, count: accounts.length };
  }

  async findOne(tenantId: string, id: string) {
    const account = await this.prisma.account.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
    if (!account) throw new NotFoundException(`Account ${id} not found`);
    return account;
  }

  async getByCode(tenantId: string, accountNumber: string) {
    const account = await this.prisma.account.findFirst({
      where: { tenantId, accountNumber, deletedAt: null },
    });
    if (!account) throw new NotFoundException(`Account ${accountNumber} not found`);
    return account;
  }

  async getAccountsByType(tenantId: string) {
    const accounts = await this.prisma.account.findMany({
      where: { tenantId, deletedAt: null },
      orderBy: { accountNumber: 'asc' },
    });
    const grouped = accounts.reduce(
      (acc, a) => {
        (acc[a.accountType] ??= []).push(a);
        return acc;
      },
      {} as Record<string, typeof accounts>,
    );
    return {
      byType: grouped,
      summary: {
        totalAccounts: accounts.length,
        assets: grouped['asset']?.length ?? 0,
        liabilities: grouped['liability']?.length ?? 0,
        equity: grouped['equity']?.length ?? 0,
        revenue: grouped['revenue']?.length ?? 0,
        expense: grouped['expense']?.length ?? 0,
      },
    };
  }

  async update(tenantId: string, userId: string, id: string, dto: UpdateAccountDto) {
    const account = await this.findOne(tenantId, id);
    // System accounts: accountNumber/accountType are immutable (spec-007) —
    // automated postings depend on them. Same-value no-ops are allowed.
    if (account.isSystem) {
      if (dto.accountNumber !== undefined && dto.accountNumber !== account.accountNumber)
        throw new BadRequestException('Cannot change accountNumber of a system account');
      if (dto.accountType !== undefined && dto.accountType !== account.accountType)
        throw new BadRequestException('Cannot change accountType of a system account');
    }
    if (dto.accountNumber) {
      const dup = await this.prisma.account.findFirst({
        where: { tenantId, accountNumber: dto.accountNumber, id: { not: id }, deletedAt: null },
      });
      if (dup) throw new ConflictException(`Account ${dto.accountNumber} already exists`);
    }
    const data: Record<string, unknown> = { updatedBy: userId };
    if (dto.accountNumber !== undefined) data.accountNumber = dto.accountNumber;
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.accountType !== undefined) data.accountType = dto.accountType;
    if (dto.accountCategory !== undefined) data.accountCategory = dto.accountCategory;
    if (dto.currency !== undefined) data.currency = dto.currency;
    if (dto.isActive !== undefined) data.isActive = dto.isActive;
    if (dto.allowManualPosting !== undefined) data.allowManualPosting = dto.allowManualPosting;
    // Tenant scope enforced at the write itself (updateMany — Prisma update() only
    // accepts unique wheres), then re-fetch to preserve the response shape (spec-007).
    await this.prisma.account.updateMany({
      where: { id, tenantId, deletedAt: null },
      data,
    });
    return this.prisma.account.findFirst({
      where: { id, tenantId, deletedAt: null },
    });
  }

  async remove(tenantId: string, userId: string, id: string) {
    const account = await this.findOne(tenantId, id);
    if (account.isSystem) throw new BadRequestException('Cannot delete system account');
    // Referential guard: never orphan the hierarchy (spec-007).
    const childCount = await this.prisma.account.count({
      where: { parentAccountId: id, tenantId, deletedAt: null },
    });
    if (childCount > 0)
      throw new BadRequestException(
        `Cannot delete: ${childCount} child accounts still reference this account`,
      );
    await this.prisma.account.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { deletedAt: new Date(), deletedBy: userId },
    });
    return { message: 'Account deleted successfully', id };
  }
}
