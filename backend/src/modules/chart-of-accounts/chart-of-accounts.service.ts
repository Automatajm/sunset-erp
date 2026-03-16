import { Injectable, NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateAccountDto } from './dto/create-account.dto';
import { UpdateAccountDto } from './dto/update-account.dto';

@Injectable()
export class ChartOfAccountsService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, userId: string, createAccountDto: CreateAccountDto) {
    // Check for duplicate account number
    const existing = await this.prisma.account.findFirst({
      where: {
        tenantId,
        accountNumber: createAccountDto.accountCode,
        deletedAt: null,
      },
    });

    if (existing) {
      throw new ConflictException(`Account with code ${createAccountDto.accountCode} already exists`);
    }

    // Verify parent account if provided
    let parentAccountId = null;
    if (createAccountDto.parentAccountCode) {
      const parent = await this.prisma.account.findFirst({
        where: {
          tenantId,
          accountNumber: createAccountDto.parentAccountCode,
          deletedAt: null,
        },
      });

      if (!parent) {
        throw new NotFoundException(`Parent account ${createAccountDto.parentAccountCode} not found`);
      }

      if (parent.allowManualPosting) {
        throw new BadRequestException('Parent account must not allow manual posting (must be a header account)');
      }

      parentAccountId = parent.id;
    }

    const account = await this.prisma.account.create({
      data: {
        tenantId,
        accountNumber: createAccountDto.accountCode,
        name: createAccountDto.accountName,
        accountType: createAccountDto.accountType,
        accountCategory: createAccountDto.accountSubType,
        parentAccountId,
        currency: createAccountDto.currency || 'USD',
        isActive: createAccountDto.isActive ?? true,
        allowManualPosting: !(createAccountDto.isHeader ?? false),
        requireReconciliation: false,
        isSystem: false,
        createdBy: userId,
        updatedBy: userId,
      },
    });

    return account;
  }

  async findAll(tenantId: string, accountType?: string) {
    const where: any = {
      tenantId,
      deletedAt: null,
    };

    if (accountType) {
      where.accountType = accountType;
    }

    const accounts = await this.prisma.account.findMany({
      where,
      orderBy: {
        accountNumber: 'asc',
      },
    });

    return accounts;
  }

  async findOne(tenantId: string, id: string) {
    const account = await this.prisma.account.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
      },
    });

    if (!account) {
      throw new NotFoundException(`Account with ID ${id} not found`);
    }

    return account;
  }

  async getByCode(tenantId: string, accountCode: string) {
    const account = await this.prisma.account.findFirst({
      where: {
        tenantId,
        accountNumber: accountCode,
        deletedAt: null,
      },
    });

    if (!account) {
      throw new NotFoundException(`Account with code ${accountCode} not found`);
    }

    return account;
  }

  async getAccountsByType(tenantId: string) {
    const accounts = await this.prisma.account.findMany({
      where: {
        tenantId,
        deletedAt: null,
      },
      orderBy: {
        accountNumber: 'asc',
      },
    });

    // Group by account type
    const grouped = accounts.reduce((acc, account) => {
      if (!acc[account.accountType]) {
        acc[account.accountType] = [];
      }
      acc[account.accountType].push(account);
      return acc;
    }, {} as Record<string, any[]>);

    return {
      byType: grouped,
      summary: {
        totalAccounts: accounts.length,
        assets: grouped['asset']?.length || 0,
        liabilities: grouped['liability']?.length || 0,
        equity: grouped['equity']?.length || 0,
        revenue: grouped['revenue']?.length || 0,
        expense: grouped['expense']?.length || 0,
      },
    };
  }

  async update(tenantId: string, userId: string, id: string, updateAccountDto: UpdateAccountDto) {
    await this.findOne(tenantId, id);

    if (updateAccountDto.accountCode) {
      const existing = await this.prisma.account.findFirst({
        where: {
          tenantId,
          accountNumber: updateAccountDto.accountCode,
          id: { not: id },
          deletedAt: null,
        },
      });

      if (existing) {
        throw new ConflictException(`Account with code ${updateAccountDto.accountCode} already exists`);
      }
    }

    const updateData: any = {
      updatedBy: userId,
    };

    if (updateAccountDto.accountCode) updateData.accountNumber = updateAccountDto.accountCode;
    if (updateAccountDto.accountName) updateData.name = updateAccountDto.accountName;
    if (updateAccountDto.accountType) updateData.accountType = updateAccountDto.accountType;
    if (updateAccountDto.accountSubType !== undefined) updateData.accountCategory = updateAccountDto.accountSubType;
    if (updateAccountDto.currency) updateData.currency = updateAccountDto.currency;
    if (updateAccountDto.isActive !== undefined) updateData.isActive = updateAccountDto.isActive;
    if (updateAccountDto.isHeader !== undefined) updateData.allowManualPosting = !updateAccountDto.isHeader;
    if (updateAccountDto.description !== undefined) updateData.description = updateAccountDto.description;

    const account = await this.prisma.account.update({
      where: { id },
      data: updateData,
    });

    return account;
  }

  async remove(tenantId: string, userId: string, id: string) {
    const account = await this.findOne(tenantId, id);

    // Check if it's a system account
    if (account.isSystem) {
      throw new BadRequestException('Cannot delete system account');
    }

    await this.prisma.account.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedBy: userId,
      },
    });

    return {
      message: 'Account deleted successfully',
      id,
    };
  }
}
