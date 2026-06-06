// ============================================================================
// Unit tests for JournalEntriesService — spec-015-journal-entries
// PrismaService is mocked; these assert behavior, not the DB.
// Tests tagged [GAP] encode an unchecked `- [ ]` acceptance criterion and are
// expected to FAIL until that criterion is implemented (red → green).
// ============================================================================
import { Test } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { JournalEntriesService } from './journal-entries.service';
import { PrismaService } from '../../database/prisma.service';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const USER = '33333333-3333-3333-3333-333333333333';
const ACC_DR = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const ACC_CR = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

// Decimal stand-in for mocked Prisma returns.
const dec = (n: number) => ({ toNumber: () => n });

const postableAccount = (id: string) => ({
  id,
  accountNumber: '1.1.01',
  name: 'Cash',
  accountType: 'asset',
  allowManualPosting: true,
  isActive: true,
});

const balancedDto = (over: Record<string, unknown> = {}) =>
  ({
    entryDate: '2026-06-15',
    journalType: 'general',
    description: 'Test entry',
    lines: [
      { accountId: ACC_DR, debitAmount: 100, creditAmount: 0 },
      { accountId: ACC_CR, debitAmount: 0, creditAmount: 100 },
    ],
    ...over,
  }) as never;

describe('JournalEntriesService', () => {
  let service: JournalEntriesService;
  let prisma: {
    journalEntry: Record<string, jest.Mock>;
    account: Record<string, jest.Mock>;
  };

  const createdEntry = (data: Record<string, unknown>) => ({
    id: 'je-1',
    ...data,
    lines: [
      { lineNumber: 1, debitAmount: dec(100), creditAmount: dec(0), exchangeRate: dec(1) },
      { lineNumber: 2, debitAmount: dec(0), creditAmount: dec(100), exchangeRate: dec(1) },
    ],
  });

  beforeEach(async () => {
    prisma = {
      journalEntry: {
        findFirst: jest.fn(),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      account: { findFirst: jest.fn() },
    };
    const mod = await Test.createTestingModule({
      providers: [JournalEntriesService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = mod.get(JournalEntriesService);
  });

  // Collect the data written by either update() or updateMany() — implementation
  // may migrate from update({where:{id}}) to tenant-scoped updateMany + refetch.
  const writeCalls = () => [
    ...prisma.journalEntry.update.mock.calls.map(([a]) => a),
    ...prisma.journalEntry.updateMany.mock.calls.map(([a]) => a),
  ];

  // ── create — double-entry integrity ─────────────────────────────────────────
  it('create accepts a balanced entry, assigns JE-YYYYMM-0001 and status draft', async () => {
    prisma.account.findFirst.mockResolvedValue(postableAccount(ACC_DR));
    prisma.journalEntry.findFirst.mockResolvedValue(null); // no prior number
    prisma.journalEntry.create.mockImplementation(({ data }) => createdEntry(data));
    const result: any = await service.create(TENANT_A, USER, balancedDto());
    const now = new Date();
    const prefix = `JE-${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}`;
    expect(result.entryNumber).toBe(`${prefix}-0001`);
    expect(result.status).toBe('draft');
    expect(result.fiscalPeriod).toBe('2026-06');
    expect(prisma.journalEntry.create.mock.calls[0][0].data.tenantId).toBe(TENANT_A);
    expect(result.lines[0].debitAmount).toBe(100); // Decimal serialized to number
  });

  it('[GAP] create rejects an entry off by one cent (cent-exact, zero tolerance)', async () => {
    prisma.account.findFirst.mockResolvedValue(postableAccount(ACC_DR));
    prisma.journalEntry.findFirst.mockResolvedValue(null);
    prisma.journalEntry.create.mockImplementation(({ data }) => createdEntry(data));
    await expect(
      service.create(
        TENANT_A,
        USER,
        balancedDto({
          lines: [
            { accountId: ACC_DR, debitAmount: 100.0, creditAmount: 0 },
            { accountId: ACC_CR, debitAmount: 0, creditAmount: 100.01 },
          ],
        }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('create rejects a line carrying both debit and credit', async () => {
    await expect(
      service.create(
        TENANT_A,
        USER,
        balancedDto({
          lines: [
            { accountId: ACC_DR, debitAmount: 50, creditAmount: 50 },
            { accountId: ACC_CR, debitAmount: 50, creditAmount: 50 },
          ],
        }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  it('create rejects a line carrying neither debit nor credit', async () => {
    await expect(
      service.create(
        TENANT_A,
        USER,
        balancedDto({
          lines: [
            { accountId: ACC_DR, debitAmount: 0, creditAmount: 0 },
            { accountId: ACC_CR, debitAmount: 0, creditAmount: 0 },
          ],
        }),
      ),
    ).rejects.toThrow(BadRequestException);
  });

  // ── create — account gates (tenant-scoped reads) ────────────────────────────
  it('create throws 404 when a line account does not exist in the tenant', async () => {
    prisma.account.findFirst.mockResolvedValue(null);
    await expect(service.create(TENANT_B, USER, balancedDto())).rejects.toThrow(NotFoundException);
    expect(prisma.account.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_B, deletedAt: null }),
      }),
    );
  });

  it('create throws 400 for a header account (allowManualPosting false)', async () => {
    prisma.account.findFirst.mockResolvedValue({
      ...postableAccount(ACC_DR),
      allowManualPosting: false,
    });
    await expect(service.create(TENANT_A, USER, balancedDto())).rejects.toThrow(
      BadRequestException,
    );
  });

  it('create throws 400 for an inactive account', async () => {
    prisma.account.findFirst.mockResolvedValue({
      ...postableAccount(ACC_DR),
      isActive: false,
    });
    await expect(service.create(TENANT_A, USER, balancedDto())).rejects.toThrow(
      BadRequestException,
    );
  });

  // ── create — entry numbering (spec-012) ─────────────────────────────────────
  it('generateJeNumber increments from the latest number, tenant-scoped, spanning soft-deleted rows', async () => {
    const now = new Date();
    const prefix = `JE-${now.getFullYear()}${(now.getMonth() + 1).toString().padStart(2, '0')}`;
    prisma.account.findFirst.mockResolvedValue(postableAccount(ACC_DR));
    prisma.journalEntry.findFirst.mockResolvedValue({ entryNumber: `${prefix}-0007` });
    prisma.journalEntry.create.mockImplementation(({ data }) => createdEntry(data));
    const result: any = await service.create(TENANT_A, USER, balancedDto());
    expect(result.entryNumber).toBe(`${prefix}-0008`);
    const [numberQuery] = prisma.journalEntry.findFirst.mock.calls[0];
    expect(numberQuery.where.tenantId).toBe(TENANT_A);
    expect(numberQuery.where).not.toHaveProperty('deletedAt'); // spans soft-deleted
  });

  it('[GAP] create maps Prisma P2002 (entryNumber race) to ConflictException', async () => {
    prisma.account.findFirst.mockResolvedValue(postableAccount(ACC_DR));
    prisma.journalEntry.findFirst.mockResolvedValue(null);
    prisma.journalEntry.create.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
    );
    await expect(service.create(TENANT_A, USER, balancedDto())).rejects.toThrow(ConflictException);
  });

  // ── findAll ──────────────────────────────────────────────────────────────────
  it('findAll scopes the query to tenantId + deletedAt: null', async () => {
    await service.findAll(TENANT_A);
    expect(prisma.journalEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_A, deletedAt: null }),
      }),
    );
  });

  it('findAll applies the status filter when given', async () => {
    await service.findAll(TENANT_A, 'posted');
    expect(prisma.journalEntry.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: 'posted' }) }),
    );
  });

  it('[GAP] findAll returns the { journalEntries, count } envelope', async () => {
    prisma.journalEntry.findMany.mockResolvedValue([
      { id: 'a', lines: [] },
      { id: 'b', lines: [] },
    ]);
    const result: any = await service.findAll(TENANT_A);
    expect(result).toEqual(
      expect.objectContaining({ journalEntries: expect.any(Array), count: 2 }),
    );
  });

  it('[GAP] findAll lines include filters deletedAt: null', async () => {
    await service.findAll(TENANT_A);
    const [arg] = prisma.journalEntry.findMany.mock.calls[0];
    expect(arg.include.lines.where).toEqual(expect.objectContaining({ deletedAt: null }));
  });

  // ── findOne ──────────────────────────────────────────────────────────────────
  it('findOne throws NotFoundException for an id owned by another tenant', async () => {
    prisma.journalEntry.findFirst.mockResolvedValue(null);
    await expect(service.findOne(TENANT_B, 'owned-by-A')).rejects.toThrow(NotFoundException);
    expect(prisma.journalEntry.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_B, deletedAt: null }),
      }),
    );
  });

  it('[GAP] findOne lines include filters deletedAt: null', async () => {
    prisma.journalEntry.findFirst.mockResolvedValue({ id: 'je-1', status: 'draft', lines: [] });
    await service.findOne(TENANT_A, 'je-1');
    const [arg] = prisma.journalEntry.findFirst.mock.calls[0];
    expect(arg.include.lines.where).toEqual(expect.objectContaining({ deletedAt: null }));
  });

  // ── update ──────────────────────────────────────────────────────────────────
  it('update throws 400 when the entry is not draft', async () => {
    prisma.journalEntry.findFirst.mockResolvedValue({ id: 'je-1', status: 'posted', lines: [] });
    await expect(service.update(TENANT_A, USER, 'je-1', {} as never)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('update recomputes postingDate + fiscalPeriod when entryDate changes', async () => {
    prisma.journalEntry.findFirst.mockResolvedValue({ id: 'je-1', status: 'draft', lines: [] });
    prisma.journalEntry.update.mockResolvedValue({ id: 'je-1', status: 'draft', lines: [] });
    await service.update(TENANT_A, USER, 'je-1', { entryDate: '2026-07-10' } as never);
    const written = writeCalls().find((c) => c?.data?.fiscalPeriod);
    expect(written.data.fiscalPeriod).toBe('2026-07');
    expect(written.data.postingDate).toEqual(written.data.entryDate);
  });

  it('[GAP] update write is tenant-scoped at the write itself', async () => {
    prisma.journalEntry.findFirst.mockResolvedValue({ id: 'je-1', status: 'draft', lines: [] });
    prisma.journalEntry.update.mockResolvedValue({ id: 'je-1', status: 'draft', lines: [] });
    await service.update(TENANT_A, USER, 'je-1', { description: 'X' } as never);
    expect(writeCalls().some((c) => c?.where?.tenantId === TENANT_A)).toBe(true);
  });

  // ── post / unpost ───────────────────────────────────────────────────────────
  it('post throws 400 when the entry is not draft', async () => {
    prisma.journalEntry.findFirst.mockResolvedValue({ id: 'je-1', status: 'posted', lines: [] });
    await expect(service.post(TENANT_A, USER, 'je-1')).rejects.toThrow(BadRequestException);
  });

  it('post flips draft → posted and returns { message, journalEntry }', async () => {
    prisma.journalEntry.findFirst.mockResolvedValue({
      id: 'je-1',
      status: 'draft',
      entryNumber: 'JE-202606-0001',
      lines: [],
    });
    prisma.journalEntry.update.mockResolvedValue({ id: 'je-1', status: 'posted', lines: [] });
    const result: any = await service.post(TENANT_A, USER, 'je-1');
    expect(result.message).toContain('posted');
    expect(result.journalEntry).toBeDefined();
    expect(writeCalls().some((c) => c?.data?.status === 'posted')).toBe(true);
  });

  it('[GAP] post write is tenant-scoped at the write itself', async () => {
    prisma.journalEntry.findFirst.mockResolvedValue({
      id: 'je-1',
      status: 'draft',
      entryNumber: 'JE-202606-0001',
      lines: [],
    });
    prisma.journalEntry.update.mockResolvedValue({ id: 'je-1', status: 'posted', lines: [] });
    await service.post(TENANT_A, USER, 'je-1');
    expect(writeCalls().some((c) => c?.where?.tenantId === TENANT_A)).toBe(true);
  });

  it('unpost throws 400 when the entry is not posted', async () => {
    prisma.journalEntry.findFirst.mockResolvedValue({ id: 'je-1', status: 'draft', lines: [] });
    await expect(service.unpost(TENANT_A, USER, 'je-1')).rejects.toThrow(BadRequestException);
  });

  it('[GAP] unpost write is tenant-scoped at the write itself', async () => {
    prisma.journalEntry.findFirst.mockResolvedValue({
      id: 'je-1',
      status: 'posted',
      entryNumber: 'JE-202606-0001',
      lines: [],
    });
    prisma.journalEntry.update.mockResolvedValue({ id: 'je-1', status: 'draft', lines: [] });
    await service.unpost(TENANT_A, USER, 'je-1');
    expect(writeCalls().some((c) => c?.where?.tenantId === TENANT_A)).toBe(true);
  });

  // ── remove ──────────────────────────────────────────────────────────────────
  it('remove throws 400 when the entry is not draft', async () => {
    prisma.journalEntry.findFirst.mockResolvedValue({ id: 'je-1', status: 'posted', lines: [] });
    await expect(service.remove(TENANT_A, USER, 'je-1')).rejects.toThrow(BadRequestException);
  });

  it('remove soft-deletes (deletedAt + deletedBy) and returns { message, id }', async () => {
    prisma.journalEntry.findFirst.mockResolvedValue({ id: 'je-1', status: 'draft', lines: [] });
    prisma.journalEntry.update.mockResolvedValue({ id: 'je-1' });
    const result = await service.remove(TENANT_A, USER, 'je-1');
    const written = writeCalls().find((c) => c?.data?.deletedAt);
    expect(written.data.deletedAt).toEqual(expect.any(Date));
    expect(written.data.deletedBy).toBe(USER);
    expect(result).toEqual(expect.objectContaining({ message: expect.any(String), id: 'je-1' }));
  });

  it('[GAP] remove write is tenant-scoped at the write itself', async () => {
    prisma.journalEntry.findFirst.mockResolvedValue({ id: 'je-1', status: 'draft', lines: [] });
    prisma.journalEntry.update.mockResolvedValue({ id: 'je-1' });
    await service.remove(TENANT_A, USER, 'je-1');
    expect(writeCalls().some((c) => c?.where?.tenantId === TENANT_A)).toBe(true);
  });
});
