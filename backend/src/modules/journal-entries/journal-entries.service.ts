import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateJournalEntryDto } from './dto/create-journal-entry.dto';
import { UpdateJournalEntryDto } from './dto/update-journal-entry.dto';
import { Decimal } from '@prisma/client/runtime/library';

// Shared include for entry reads — lines must exclude soft-deleted rows.
const LINES_INCLUDE = {
  lines: {
    where: { deletedAt: null },
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
      lineNumber: 'asc' as const,
    },
  },
};

@Injectable()
export class JournalEntriesService {
  constructor(private prisma: PrismaService) {}

  async create(tenantId: string, userId: string, createJournalEntryDto: CreateJournalEntryDto) {
    // Validate double-entry cent-exact: sum integer cents, zero tolerance.
    const toCents = (amount: number) => Math.round(amount * 100);
    const totalDebits = createJournalEntryDto.lines.reduce(
      (sum, line) => sum + toCents(line.debitAmount),
      0,
    );
    const totalCredits = createJournalEntryDto.lines.reduce(
      (sum, line) => sum + toCents(line.creditAmount),
      0,
    );

    if (totalDebits !== totalCredits) {
      throw new BadRequestException(
        `Journal entry is not balanced. Debits: ${totalDebits / 100}, Credits: ${totalCredits / 100}`,
      );
    }

    // Validate that each line has either debit or credit (not both, not neither),
    // compared in cents so sub-cent noise cannot slip through either side.
    for (const line of createJournalEntryDto.lines) {
      const debitCents = toCents(line.debitAmount);
      const creditCents = toCents(line.creditAmount);
      if (debitCents > 0 && creditCents > 0) {
        throw new BadRequestException('A line cannot have both debit and credit amounts');
      }
      if (debitCents === 0 && creditCents === 0) {
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
          `Account ${account.accountNumber} - ${account.name} does not allow manual posting (it's a header account)`,
        );
      }

      if (!account.isActive) {
        throw new BadRequestException(
          `Account ${account.accountNumber} - ${account.name} is inactive`,
        );
      }
    }

    // Generate JE number
    const entryNumber = await this.generateJeNumber(tenantId);

    // Get fiscal period (YYYY-MM format)
    const entryDate = new Date(createJournalEntryDto.entryDate);
    const fiscalPeriod = `${entryDate.getFullYear()}-${(entryDate.getMonth() + 1).toString().padStart(2, '0')}`;

    // Create journal entry with lines. The @@unique([tenantId, entryNumber])
    // index can race on concurrent creates — surface that as 409, never a 500.
    let journalEntry;
    try {
      journalEntry = await this.prisma.journalEntry.create({
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
        include: LINES_INCLUDE,
      });
    } catch (e) {
      if ((e as { code?: string })?.code === 'P2002') {
        throw new ConflictException(
          `Journal entry number ${entryNumber} was just taken by a concurrent request. Please retry.`,
        );
      }
      throw e;
    }

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
          where: { deletedAt: null },
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

    return {
      journalEntries: entries.map((entry) => this.formatJournalEntryResponse(entry)),
      count: entries.length,
    };
  }

  async findOne(tenantId: string, id: string) {
    const entry = await this.prisma.journalEntry.findFirst({
      where: {
        id,
        tenantId,
        deletedAt: null,
      },
      include: LINES_INCLUDE,
    });

    if (!entry) {
      throw new NotFoundException(`Journal entry with ID ${id} not found`);
    }

    return this.formatJournalEntryResponse(entry);
  }

  async update(
    tenantId: string,
    userId: string,
    id: string,
    updateJournalEntryDto: UpdateJournalEntryDto,
  ) {
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

    // Tenant-scoped at the write itself (not only via the findOne above).
    await this.prisma.journalEntry.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: updateData,
    });

    return this.findOne(tenantId, id);
  }

  async post(tenantId: string, userId: string, id: string) {
    const entry = await this.findOne(tenantId, id);

    if (entry.status !== 'draft') {
      throw new BadRequestException('Only draft journal entries can be posted');
    }

    await this.prisma.journalEntry.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: {
        status: 'posted',
        updatedBy: userId,
      },
    });

    return {
      message: `Journal entry ${entry.entryNumber} posted successfully`,
      journalEntry: await this.findOne(tenantId, id),
    };
  }

  async unpost(tenantId: string, userId: string, id: string) {
    const entry = await this.findOne(tenantId, id);

    if (entry.status !== 'posted') {
      throw new BadRequestException('Only posted journal entries can be unposted');
    }

    await this.prisma.journalEntry.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: {
        status: 'draft',
        updatedBy: userId,
      },
    });

    return {
      message: `Journal entry ${entry.entryNumber} unposted successfully`,
      journalEntry: await this.findOne(tenantId, id),
    };
  }

  async remove(tenantId: string, userId: string, id: string) {
    const entry = await this.findOne(tenantId, id);

    if (entry.status !== 'draft') {
      throw new BadRequestException('Only draft journal entries can be deleted');
    }

    await this.prisma.journalEntry.updateMany({
      where: { id, tenantId, deletedAt: null },
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

    // Deliberately spans soft-deleted rows (spec-012: numbers are never reused).
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
      lines: entry.lines?.map((line) => ({
        ...line,
        debitAmount: line.debitAmount.toNumber(),
        creditAmount: line.creditAmount.toNumber(),
        exchangeRate: line.exchangeRate?.toNumber(),
      })),
    };
  }
}
