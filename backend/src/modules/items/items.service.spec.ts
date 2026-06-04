// ============================================================================
// Unit tests for ItemsService — spec-003-items
// PrismaService and UomService are mocked; these assert behavior, not the DB.
// Tests tagged [GAP] encode an unchecked `- [ ]` acceptance criterion and are
// expected to FAIL until that criterion is implemented (red → green).
// ============================================================================
import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { ItemsService } from './items.service';
import { PrismaService } from '../../database/prisma.service';
import { UomService } from '../uom/uom.service';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const USER = '33333333-3333-3333-3333-333333333333';

describe('ItemsService', () => {
  let service: ItemsService;
  let prisma: {
    item: Record<string, jest.Mock>;
    supplierItem: Record<string, jest.Mock>;
  };
  let uom: { getConversionFactor: jest.Mock };

  beforeEach(async () => {
    prisma = {
      item: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        count: jest.fn(),
        groupBy: jest.fn(),
      },
      supplierItem: { findFirst: jest.fn() },
    };
    uom = { getConversionFactor: jest.fn() };
    const mod = await Test.createTestingModule({
      providers: [
        ItemsService,
        { provide: PrismaService, useValue: prisma },
        { provide: UomService, useValue: uom },
      ],
    }).compile();
    service = mod.get(ItemsService);
  });

  // ── Tenant scoping ──────────────────────────────────────────────────────────
  it('findAll scopes the query to tenantId + deletedAt: null', async () => {
    prisma.item.findMany.mockResolvedValue([]);
    await service.findAll(TENANT_A);
    expect(prisma.item.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_A, deletedAt: null }),
      }),
    );
  });

  it('findAll applies the optional itemType filter', async () => {
    prisma.item.findMany.mockResolvedValue([]);
    await service.findAll(TENANT_A, 'raw_material');
    expect(prisma.item.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT_A,
          deletedAt: null,
          itemType: 'raw_material',
        }),
      }),
    );
  });

  it('findOne scopes by id + tenantId + deletedAt: null', async () => {
    prisma.item.findFirst.mockResolvedValue({ id: 'x' });
    await service.findOne(TENANT_A, 'x');
    expect(prisma.item.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'x', tenantId: TENANT_A, deletedAt: null },
      }),
    );
  });

  it('findOne throws NotFoundException for an id owned by another tenant', async () => {
    prisma.item.findFirst.mockResolvedValue(null); // wrong-tenant query returns nothing
    await expect(service.findOne(TENANT_B, 'owned-by-A')).rejects.toThrow(NotFoundException);
  });

  // ── Create ────────────────────────────────────────────────────────────────
  it('create auto-generates an ITEM-NNNN code (spec-012: always system-assigned)', async () => {
    prisma.item.findMany.mockResolvedValueOnce([]); // generateItemCode: no prior codes
    prisma.item.create.mockImplementation(({ data }) => ({ id: 'new', ...data }));
    const result: any = await service.create(TENANT_A, USER, {
      name: 'Bolt',
      itemType: 'raw_material',
      baseUom: 'PCS',
    } as any);
    expect(result.code).toMatch(/^ITEM-0001$/);
    expect(prisma.item.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tenantId: TENANT_A }) }),
    );
  });

  it('create defaults barcodeInternal to the generated code when omitted', async () => {
    prisma.item.findMany.mockResolvedValueOnce([]);
    prisma.item.create.mockImplementation(({ data }) => ({ id: 'new', ...data }));
    const result: any = await service.create(TENANT_A, USER, {
      name: 'Bolt',
      itemType: 'raw_material',
      baseUom: 'PCS',
    } as any);
    expect(result.barcodeInternal).toBe(result.code);
  });

  // ── Update / remove ───────────────────────────────────────────────────────
  it('update throws NotFoundException when the item is in another tenant', async () => {
    prisma.item.findFirst.mockResolvedValue(null);
    await expect(service.update(TENANT_B, USER, 'id', { name: 'X' } as any)).rejects.toThrow(
      NotFoundException,
    );
  });

  it('[GAP] update writes are tenant-scoped (spec §Data model — currently where:{id})', async () => {
    prisma.item.findFirst.mockResolvedValue({ id: 'id', code: 'ITEM-0001' }); // findOne guard + re-fetch
    prisma.item.update.mockResolvedValue({ id: 'id' });
    prisma.item.updateMany.mockResolvedValue({ count: 1 });
    await service.update(TENANT_A, USER, 'id', { name: 'X' } as any);
    // Target: the write itself enforces tenancy (updateMany scoped, or update where includes tenantId).
    const scopedUpdateMany = prisma.item.updateMany.mock.calls.some(
      ([arg]) => arg?.where?.tenantId === TENANT_A,
    );
    const scopedUpdate = prisma.item.update.mock.calls.some(
      ([arg]) => arg?.where?.tenantId === TENANT_A,
    );
    expect(scopedUpdateMany || scopedUpdate).toBe(true);
  });

  it('remove performs a soft delete (deletedAt + deletedBy), not a hard delete', async () => {
    prisma.item.findFirst.mockResolvedValueOnce({ id: 'id' });
    prisma.item.update.mockResolvedValue({ id: 'id' });
    prisma.item.updateMany.mockResolvedValue({ count: 1 });
    await service.remove(TENANT_A, USER, 'id');
    const updateCall = prisma.item.update.mock.calls[0]?.[0];
    const updateManyCall = prisma.item.updateMany.mock.calls[0]?.[0];
    const data = updateCall?.data ?? updateManyCall?.data;
    expect(data).toEqual(expect.objectContaining({ deletedBy: USER }));
    expect(data.deletedAt).toBeInstanceOf(Date);
  });

  it('[GAP] remove write is tenant-scoped (spec §Data model — currently where:{id})', async () => {
    prisma.item.findFirst.mockResolvedValueOnce({ id: 'id' });
    prisma.item.update.mockResolvedValue({ id: 'id' });
    prisma.item.updateMany.mockResolvedValue({ count: 1 });
    await service.remove(TENANT_A, USER, 'id');
    const scopedUpdateMany = prisma.item.updateMany.mock.calls.some(
      ([arg]) => arg?.where?.tenantId === TENANT_A,
    );
    const scopedUpdate = prisma.item.update.mock.calls.some(
      ([arg]) => arg?.where?.tenantId === TENANT_A,
    );
    expect(scopedUpdateMany || scopedUpdate).toBe(true);
  });

  // ── Barcode lookup ──────────────────────────────────────────────────────────
  it('findByBarcode scopes by tenantId + deletedAt and reports matchedBy', async () => {
    prisma.item.findFirst.mockResolvedValueOnce({ id: 'i', barcodeInternal: 'ITEM-0001' });
    const res: any = await service.findByBarcode(TENANT_A, 'ITEM-0001');
    expect(res.matchedBy).toBe('barcodeInternal');
    expect(prisma.item.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_A, deletedAt: null }),
      }),
    );
  });

  it('findByBarcode throws NotFoundException when nothing resolves the scan', async () => {
    prisma.item.findFirst.mockResolvedValue(null); // internal, external, code all miss
    prisma.supplierItem.findFirst.mockResolvedValue(null); // supplier code misses
    await expect(service.findByBarcode(TENANT_A, 'NOPE')).rejects.toThrow(NotFoundException);
  });

  it('findManyByCodes scopes the query to tenantId + deletedAt: null', async () => {
    prisma.item.findMany.mockResolvedValue([]);
    await service.findManyByCodes(TENANT_A, ['ITEM-0001']);
    expect(prisma.item.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_A, deletedAt: null }),
      }),
    );
  });

  // ── Statistics ────────────────────────────────────────────────────────────
  it('getStatistics scopes every count to tenantId + deletedAt: null', async () => {
    prisma.item.count.mockResolvedValue(0);
    prisma.item.groupBy.mockResolvedValue([]);
    await service.getStatistics(TENANT_A);
    for (const call of prisma.item.count.mock.calls) {
      expect(call[0].where).toEqual(
        expect.objectContaining({ tenantId: TENANT_A, deletedAt: null }),
      );
    }
    expect(prisma.item.groupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_A, deletedAt: null }),
      }),
    );
  });

  // ── Response format ─────────────────────────────────────────────────────────
  it('[GAP] findAll returns { items, count } envelope (spec §Response format)', async () => {
    prisma.item.findMany.mockResolvedValue([{ id: 'a' }, { id: 'b' }]);
    const result: any = await service.findAll(TENANT_A);
    expect(result).toEqual(expect.objectContaining({ items: expect.any(Array), count: 2 }));
  });
});
