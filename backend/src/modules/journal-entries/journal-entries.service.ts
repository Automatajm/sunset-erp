import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateJournalEntryDto } from './dto/create-journal-entry.dto';
import { UpdateJournalEntryDto } from './dto/update-journal-entry.dto';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class JournalEntriesService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, userId: string, createJournalEntryDto: CreateJournalEntryDto) {
    // Validate double-entry: debits must equal credits
    const totalDebits = createJournalEntryDto.lines.reduce(
      (sum, line) => sum + line.debitAmount,
      0
    );
    const totalCredits = createJournalEntryDto.lines.reduce(
      (sum, line) => sum + line.creditAmount,
      0
    );

    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      throw new BadRequestException(
        `Journal entry is not balanced. Debits: ${totalDebits}, Credits: ${totalCredits}`
      );
    }

    // Validate that each line has either debit or credit (not both, not neither)
    for (const line of createJournalEntryDto.lines) {
      if (line.debitAmount > 0 && line.creditAmount > 0) {
        throw new BadRequestException('A line cannot have both debit and credit amounts');
      }
      if (line.debitAmount === 0 && line.creditAmount === 0) {
        throw new BadRequestException('A line must have either a debit or credit amount');
      }
    }

    // Verify all accounts exist and allow manual posting
    for (const line of createJournalEntryDto.lines) {
      const account = await this.prisma.account.findFirst({
        where: {
          id: line.accountId,
          tenantId,
          deletedAt: null,
        },
      });

      if (!account) {
        throw new NotFoundException(`Account with ID ${line.accountId} not found`);
      }

      if (!account.allowManualPosting) {
        throw new BadRequestException(
          `Account ${account.accountNumber} - ${account.name} does not allow manual posting (it's a header account)`
        );
      }

      if (!account.isActive) {
        throw new BadRequestException(
          `Account ${account.accountNumber} - ${account.name} is inactive`
        );
      }
    }

    // Generate JE number
    const entryNumber = await this.generateJeNumber(tenantId);

    // Get fiscal period (YYYY-MM format)
    const entryDate = new Date(createJournalEntryDto.entryDate);
    const fiscalPeriod = `${entryDate.getFullYear()}-${(entryDate.getMonth() + 1).toString().padStart(2, '0')}`;

    // Create journal entry with lines
    const journalEntry = await this.prisma.journalEntry.create({
      data: {
        tenantId,
        entryNumber,
        entryDate: entryDate,
        postingDate: entryDate,
        fiscalPeriod,
        journalType: createJournalEntryDto.journalType || 'general',
        description: createJournalEntryDto.description,
        reference: createJournalEntryDto.reference ?? null,
        status: 'draft',
        createdBy: userId,
        updatedBy: userId,
        lines: {
          create: createJournalEntryDto.lines.map((line, index) => ({
            tenantId,
            accountId: line.accountId,
            lineNumber: index + 1,
            debitAmount: new Decimal(line.debitAmount),
            creditAmount: new Decimal(line.creditAmount),
            description: line.description,
            currency: 'USD',
            exchangeRate: new Decimal(1),
            createdBy: userId,
            updatedBy: userId,
          })),
        },
      },
      include: {
        lines: {
          include: {
            account: {
              select: {
                id: true,
                accountNumber: true,
                name: true,
                accountType: true,
              },
            },
          },
          orderBy: {
            lineNumber: 'asc',
          },
        },
      },
    });

    return this.formatJournalEntryResponse(journalEntry);
  }

  async findAll(tenantId: string, status?: string) {
    const where: any = {
      tenantId,
      deletedAt: null,
    };

    if (status) {
      where.status = status;
    }

    const entries = await this.prisma.journalEntry.findMany({
      where,
      include: {
        lines: {
          include: {
            account: {
              select: {
                accountNumber: true,
                name: true,
              },
            },
          },
          orderBy: {
            lineNumber: 'asc',
          },
        },
      },
      orderBy: {
        entryDate: 'desc',
      },
    });

    return entries.map(entry => this.formatJournalEntryResponse(entry));
  }

  async findOne(tenantId: string, id: string) {
    const entry = await this.prisma.journalEntry.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
      },
      include: {
        lines: {
          include: {
            account: {
              select: {
                id: true,
                accountNumber: true,
                name: true,
                accountType: true,
              },
            },
          },
          orderBy: {
            lineNumber: 'asc',
          },
        },
      },
    });

    if (!entry) {
      throw new NotFoundException(`Journal entry with ID ${id} not found`);
    }

    return this.formatJournalEntryResponse(entry);
  }

  async update(tenantId: string, userId: string, id: string, updateJournalEntryDto: UpdateJournalEntryDto) {
    const existingEntry = await this.findOne(tenantId, id);

    if (existingEntry.status !== 'draft') {
      throw new BadRequestException('Only draft journal entries can be updated');
    }

    const updateData: any = {
      updatedBy: userId,
    };

    if (updateJournalEntryDto.entryDate) {
      const entryDate = new Date(updateJournalEntryDto.entryDate);
      updateData.entryDate = entryDate;
      updateData.postingDate = entryDate;
      updateData.fiscalPeriod = `${entryDate.getFullYear()}-${(entryDate.getMonth() + 1).toString().padStart(2, '0')}`;
    }

    if (updateJournalEntryDto.description !== undefined) 
      updateData.description = updateJournalEntryDto.description;
    if (updateJournalEntryDto.reference !== undefined) 
      updateData.reference = updateJournalEntryDto.reference;

    const updatedEntry = await this.prisma.journalEntry.update({
      where: { id },
      data: updateData,
      include: {
        lines: {
          include: {
            account: {
              select: {
                id: true,
                accountNumber: true,
                name: true,
                accountType: true,
              },
            },
          },
          orderBy: {
            lineNumber: 'asc',
          },
        },
      },
    });

    return this.formatJournalEntryResponse(updatedEntry);
  }

  async post(tenantId: string, userId: string, id: string) {
    const entry = await this.findOne(tenantId, id);

    if (entry.status !== 'draft') {
      throw new BadRequestException('Only draft journal entries can be posted');
    }

    const updated = await this.prisma.journalEntry.update({
      where: { id },
      data: {
        status: 'posted',
        updatedBy: userId,
      },
      include: {
        lines: {
          include: {
            account: true,
          },
        },
      },
    });

    return {
      message: `Journal entry ${entry.entryNumber} posted successfully`,
      journalEntry: this.formatJournalEntryResponse(updated),
    };
  }

  async unpost(tenantId: string, userId: string, id: string) {
    const entry = await this.findOne(tenantId, id);

    if (entry.status !== 'posted') {
      throw new BadRequestException('Only posted journal entries can be unposted');
    }

    const updated = await this.prisma.journalEntry.update({
      where: { id },
      data: {
        status: 'draft',
        updatedBy: userId,
      },
      include: {
        lines: {
          include: {
            account: true,
          },
        },
      },
    });

    return {
      message: `Journal entry ${entry.entryNumber} unposted successfully`,
      journalEntry: this.formatJournalEntryResponse(updated),
    };
  }

  async remove(tenantId: string, userId: string, id: string) {
    const entry = await this.findOne(tenantId, id);

    if (entry.status !== 'draft') {
      throw new BadRequestException('Only draft journal entries can be deleted');
    }

    await this.prisma.journalEntry.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedBy: userId,
      },
    });

    return {
      message: 'Journal entry deleted successfully',
      id,
    };
  }

  private async generateJeNumber(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const month = (new Date().getMonth() + 1).toString().padStart(2, '0');
    const prefix = `JE-${year}${month}`;

    const lastJe = await this.prisma.journalEntry.findFirst({
      where: {
        tenantId,
        entryNumber: {
          startsWith: prefix,
        },
      },
      orderBy: {
        entryNumber: 'desc',
      },
    });

    if (!lastJe) {
      return `${prefix}-0001`;
    }

    const lastNumber = parseInt(lastJe.entryNumber.split('-')[2]);
    const nextNumber = (lastNumber + 1).toString().padStart(4, '0');

    return `${prefix}-${nextNumber}`;
  }

  private formatJournalEntryResponse(entry: any) {
    return {
      ...entry,
      lines: entry.lines?.map(line => ({
        ...line,
        debitAmount: line.debitAmount.toNumber(),
        creditAmount: line.creditAmount.toNumber(),
        exchangeRate: line.exchangeRate?.toNumber(),
      })),
    };
  }
}


