// ============================================================================
// Unit tests for ChartOfAccountsService — spec-007-chart-of-accounts
// PrismaService is mocked; these assert behavior, not the DB.
// Tests tagged [GAP] encode an unchecked `- [ ]` acceptance criterion and are
// expected to FAIL until that criterion is implemented (red → green).
// ============================================================================
import { Test } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { ChartOfAccountsService } from './chart-of-accounts.service';
import { PrismaService } from '../../database/prisma.service';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const USER = '33333333-3333-3333-3333-333333333333';

describe('ChartOfAccountsService', () => {
  let service: ChartOfAccountsService;
  let prisma: { account: Record<string, jest.Mock> };

  beforeEach(async () => {
    prisma = {
      account: {
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
      },
    };
    const mod = await Test.createTestingModule({
      providers: [ChartOfAccountsService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = mod.get(ChartOfAccountsService);
  });

  // ── Tenant scoping — reads ───────────────────────────────────────────────
  it('findAll scopes the query to tenantId + deletedAt: null and orders by accountNumber asc', async () => {
    prisma.account.findMany.mockResolvedValue([]);
    await service.findAll(TENANT_A);
    expect(prisma.account.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_A, deletedAt: null }),
        orderBy: { accountNumber: 'asc' },
      }),
    );
  });

  it('findAll applies the accountType filter when provided', async () => {
    prisma.account.findMany.mockResolvedValue([]);
    await service.findAll(TENANT_A, 'asset');
    expect(prisma.account.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT_A,
          deletedAt: null,
          accountType: 'asset',
        }),
      }),
    );
  });

  it('findOne scopes by id + tenantId + deletedAt: null', async () => {
    prisma.account.findFirst.mockResolvedValue({ id: 'x' });
    await service.findOne(TENANT_A, 'x');
    expect(prisma.account.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'x', tenantId: TENANT_A, deletedAt: null },
      }),
    );
  });

  it('findOne throws NotFoundException for an id owned by another tenant', async () => {
    prisma.account.findFirst.mockResolvedValue(null); // wrong-tenant query returns nothing
    await expect(service.findOne(TENANT_B, 'owned-by-A')).rejects.toThrow(NotFoundException);
  });

  it('getByCode scopes by tenantId + accountNumber + deletedAt: null and 404s when missing', async () => {
    prisma.account.findFirst.mockResolvedValue(null);
    await expect(service.getByCode(TENANT_A, '1.1.03')).rejects.toThrow(NotFoundException);
    expect(prisma.account.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: TENANT_A, accountNumber: '1.1.03', deletedAt: null },
      }),
    );
  });

  it('getAccountsByType scopes the query and buckets into byType + summary', async () => {
    prisma.account.findMany.mockResolvedValue([
      { id: 'a1', accountType: 'asset' },
      { id: 'a2', accountType: 'asset' },
      { id: 'r1', accountType: 'revenue' },
    ]);
    const result = await service.getAccountsByType(TENANT_A);
    expect(prisma.account.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_A, deletedAt: null }),
      }),
    );
    expect(result.summary).toEqual({
      totalAccounts: 3,
      assets: 2,
      liabilities: 0,
      equity: 0,
      revenue: 1,
      expense: 0,
    });
    expect(result.byType.asset).toHaveLength(2);
  });

  // ── Create ────────────────────────────────────────────────────────────────
  it('create runs the duplicate-accountNumber check scoped to tenantId + deletedAt: null', async () => {
    prisma.account.findFirst.mockResolvedValue(null);
    prisma.account.create.mockImplementation(({ data }) => ({ id: 'new', ...data }));
    await service.create(TENANT_A, USER, {
      accountNumber: '1.1.03',
      name: 'Cash',
      accountType: 'asset',
    } as any);
    expect(prisma.account.findFirst).toHaveBeenCalledWith({
      where: { tenantId: TENANT_A, accountNumber: '1.1.03', deletedAt: null },
    });
  });

  it('create throws ConflictException on a duplicate accountNumber', async () => {
    prisma.account.findFirst.mockResolvedValue({ id: 'dup', accountNumber: '1.1.03' });
    await expect(
      service.create(TENANT_A, USER, {
        accountNumber: '1.1.03',
        name: 'Dup',
        accountType: 'asset',
      } as any),
    ).rejects.toThrow(ConflictException);
  });

  it('create validates parentAccountId with a tenant-scoped lookup and 404s when missing', async () => {
    prisma.account.findFirst
      .mockResolvedValueOnce(null) // duplicate check — no conflict
      .mockResolvedValueOnce(null); // parent lookup — not found
    await expect(
      service.create(TENANT_A, USER, {
        accountNumber: '1.1.03.1',
        name: 'Child',
        accountType: 'asset',
        parentAccountId: 'missing-parent',
      } as any),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.account.findFirst).toHaveBeenNthCalledWith(2, {
      where: { id: 'missing-parent', tenantId: TENANT_A, deletedAt: null },
    });
  });

  it('create writes tenantId from the JWT, audit columns, and safe defaults', async () => {
    prisma.account.findFirst.mockResolvedValue(null);
    prisma.account.create.mockImplementation(({ data }) => ({ id: 'new', ...data }));
    await service.create(TENANT_A, USER, {
      accountNumber: '1.1.03',
      name: 'Cash',
      accountType: 'asset',
    } as any);
    expect(prisma.account.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT_A,
          currency: 'USD',
          isActive: true,
          allowManualPosting: true,
          requireReconciliation: false,
          isSystem: false,
          createdBy: USER,
          updatedBy: USER,
        }),
      }),
    );
  });

  // ── Update ────────────────────────────────────────────────────────────────
  it('update throws NotFoundException when the account is in another tenant', async () => {
    prisma.account.findFirst.mockResolvedValue(null);
    await expect(service.update(TENANT_B, USER, 'id', {} as any)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('update accountNumber-conflict check is tenant-scoped and excludes self', async () => {
    prisma.account.findFirst
      .mockResolvedValueOnce({ id: 'id', isSystem: false }) // findOne guard
      .mockResolvedValueOnce(null); // conflict check
    prisma.account.update.mockResolvedValue({ id: 'id' });
    prisma.account.updateMany.mockResolvedValue({ count: 1 });
    prisma.account.findFirst.mockResolvedValue({ id: 'id', isSystem: false }); // re-fetch fallback
    await service.update(TENANT_A, USER, 'id', { accountNumber: '9.9.99' } as any);
    expect(prisma.account.findFirst).toHaveBeenNthCalledWith(2, {
      where: {
        tenantId: TENANT_A,
        accountNumber: '9.9.99',
        id: { not: 'id' },
        deletedAt: null,
      },
    });
  });

  it('update throws ConflictException when the new accountNumber belongs to another row', async () => {
    prisma.account.findFirst
      .mockResolvedValueOnce({ id: 'id', isSystem: false }) // findOne guard
      .mockResolvedValueOnce({ id: 'other', accountNumber: 'TAKEN' }); // conflict
    await expect(
      service.update(TENANT_A, USER, 'id', { accountNumber: 'TAKEN' } as any),
    ).rejects.toThrow(ConflictException);
  });

  it('[GAP] update writes are tenant-scoped at the write itself (spec §Tenant scoping — currently where:{id})', async () => {
    prisma.account.findFirst.mockResolvedValue({ id: 'id', isSystem: false }); // guard + re-fetch
    prisma.account.update.mockResolvedValue({ id: 'id' });
    prisma.account.updateMany.mockResolvedValue({ count: 1 });
    await service.update(TENANT_A, USER, 'id', { name: 'X' } as any);
    // Target: updateMany({ where: { id, tenantId, deletedAt: null } }) per spec-006 convention.
    const scopedUpdateMany = prisma.account.updateMany.mock.calls.some(
      ([arg]) => arg?.where?.tenantId === TENANT_A,
    );
    const scopedUpdate = prisma.account.update.mock.calls.some(
      ([arg]) => arg?.where?.tenantId === TENANT_A,
    );
    expect(scopedUpdateMany || scopedUpdate).toBe(true);
  });

  it('[GAP] update rejects an accountNumber change on a system account (spec §Business rules)', async () => {
    prisma.account.findFirst.mockResolvedValue({
      id: 'sys',
      isSystem: true,
      accountNumber: '1.0.00',
      accountType: 'asset',
    });
    prisma.account.update.mockResolvedValue({ id: 'sys' });
    prisma.account.updateMany.mockResolvedValue({ count: 1 });
    await expect(
      service.update(TENANT_A, USER, 'sys', { accountNumber: '9.9.99' } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('[GAP] update rejects an accountType change on a system account (spec §Business rules)', async () => {
    prisma.account.findFirst.mockResolvedValue({
      id: 'sys',
      isSystem: true,
      accountNumber: '1.0.00',
      accountType: 'asset',
    });
    prisma.account.update.mockResolvedValue({ id: 'sys' });
    prisma.account.updateMany.mockResolvedValue({ count: 1 });
    await expect(
      service.update(TENANT_A, USER, 'sys', { accountType: 'expense' } as any),
    ).rejects.toThrow(BadRequestException);
  });

  it('update still allows a name edit on a system account (no-op guard fields untouched)', async () => {
    prisma.account.findFirst.mockResolvedValue({
      id: 'sys',
      isSystem: true,
      accountNumber: '1.0.00',
      accountType: 'asset',
    });
    prisma.account.update.mockResolvedValue({ id: 'sys', name: 'Renamed' });
    prisma.account.updateMany.mockResolvedValue({ count: 1 });
    await expect(
      service.update(TENANT_A, USER, 'sys', { name: 'Renamed' } as any),
    ).resolves.toBeDefined();
  });

  // ── Remove ────────────────────────────────────────────────────────────────
  it('remove throws NotFoundException for an unknown / other-tenant id', async () => {
    prisma.account.findFirst.mockResolvedValue(null);
    await expect(service.remove(TENANT_B, USER, 'id')).rejects.toThrow(NotFoundException);
  });

  it('remove throws BadRequestException for a system account', async () => {
    prisma.account.findFirst.mockResolvedValue({ id: 'sys', isSystem: true });
    await expect(service.remove(TENANT_A, USER, 'sys')).rejects.toThrow(BadRequestException);
  });

  it('[GAP] remove is blocked while active child accounts exist (spec §Business rules)', async () => {
    prisma.account.findFirst.mockResolvedValue({ id: 'parent', isSystem: false });
    prisma.account.count.mockResolvedValue(2); // two active children point at it
    prisma.account.update.mockResolvedValue({ id: 'parent' });
    prisma.account.updateMany.mockResolvedValue({ count: 1 });
    await expect(service.remove(TENANT_A, USER, 'parent')).rejects.toThrow(BadRequestException);
    // The child count must itself be tenant-scoped.
    expect(prisma.account.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          parentAccountId: 'parent',
          tenantId: TENANT_A,
          deletedAt: null,
        }),
      }),
    );
  });

  it('remove performs a soft delete (deletedAt + deletedBy), never a hard delete', async () => {
    prisma.account.findFirst.mockResolvedValue({ id: 'id', isSystem: false });
    prisma.account.count.mockResolvedValue(0);
    prisma.account.update.mockResolvedValue({ id: 'id' });
    prisma.account.updateMany.mockResolvedValue({ count: 1 });
    const result = await service.remove(TENANT_A, USER, 'id');
    const writeCall =
      prisma.account.updateMany.mock.calls[0] ?? prisma.account.update.mock.calls[0];
    const [arg] = writeCall;
    expect(arg.data).toEqual(expect.objectContaining({ deletedBy: USER }));
    expect(arg.data.deletedAt).toBeInstanceOf(Date);
    expect(result).toEqual(expect.objectContaining({ message: expect.any(String), id: 'id' }));
  });

  it('[GAP] remove soft-delete write is tenant-scoped at the write itself (spec §Tenant scoping)', async () => {
    prisma.account.findFirst.mockResolvedValue({ id: 'id', isSystem: false });
    prisma.account.count.mockResolvedValue(0);
    prisma.account.update.mockResolvedValue({ id: 'id' });
    prisma.account.updateMany.mockResolvedValue({ count: 1 });
    await service.remove(TENANT_A, USER, 'id');
    const scopedUpdateMany = prisma.account.updateMany.mock.calls.some(
      ([arg]) => arg?.where?.tenantId === TENANT_A,
    );
    const scopedUpdate = prisma.account.update.mock.calls.some(
      ([arg]) => arg?.where?.tenantId === TENANT_A,
    );
    expect(scopedUpdateMany || scopedUpdate).toBe(true);
  });

  // ── Response format ───────────────────────────────────────────────────────
  it('[GAP] findAll returns { accounts, count } envelope (spec §Endpoints)', async () => {
    prisma.account.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    const result: any = await service.findAll(TENANT_A);
    expect(result).toEqual(expect.objectContaining({ accounts: expect.any(Array), count: 2 }));
  });
});
