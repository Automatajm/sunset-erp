// ============================================================================
// Unit tests for PurchaseRequisitionsService — spec-020-procurement-cluster
// PrismaService (and RfqsService once injected) are mocked.
// Tests tagged [GAP] encode an unchecked `- [ ]` acceptance criterion and are
// expected to FAIL until that criterion is implemented (red → green).
// ============================================================================
import { Test } from '@nestjs/testing';
import {
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { PurchaseRequisitionsService } from './purchase-requisitions.service';
import { PrismaService } from '../../database/prisma.service';
import { RfqsService } from '../rfqs/rfqs.service';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const USER = '33333333-3333-3333-3333-333333333333';
const SUP = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';

type ModelMock = Record<string, jest.Mock>;
const model = (): ModelMock => ({
  findFirst: jest.fn(),
  findMany: jest.fn().mockResolvedValue([]),
  create: jest.fn(),
  update: jest.fn().mockResolvedValue({}),
  updateMany: jest.fn().mockResolvedValue({ count: 1 }),
});

const prRecord = (over: Record<string, unknown> = {}) => ({
  id: 'pr-1',
  tenantId: TENANT_A,
  prNumber: 'PR-2026-0001',
  status: 'draft',
  lines: [],
  rfqs: [],
  ...over,
});

const prLine = (over: Record<string, unknown> = {}) => ({
  id: 'prl-1',
  itemId: null,
  genericDescription: 'Widget',
  quantity: 10,
  uom: 'PCS',
  requiredDate: new Date('2026-07-01'),
  ...over,
});

describe('PurchaseRequisitionsService', () => {
  let service: PurchaseRequisitionsService;
  let prisma: Record<string, any>;
  let rfqService: { generateRfqNumber: jest.Mock };

  beforeEach(async () => {
    prisma = {
      purchaseRequisition: model(),
      purchaseRequisitionLine: model(),
      rfq: model(),
      supplier: model(),
      item: model(),
      warehouse: model(),
      $transaction: jest.fn(async (arg: unknown) =>
        typeof arg === 'function'
          ? (arg as (tx: unknown) => unknown)(prisma)
          : Promise.all(arg as Promise<unknown>[]),
      ),
    };
    rfqService = { generateRfqNumber: jest.fn().mockResolvedValue('RFQ-2026-0099') };
    const mod = await Test.createTestingModule({
      providers: [
        PurchaseRequisitionsService,
        { provide: PrismaService, useValue: prisma },
        { provide: RfqsService, useValue: rfqService },
      ],
    }).compile();
    service = mod.get(PurchaseRequisitionsService);
  });

  const writesOf = (m: ModelMock) => [
    ...m.update.mock.calls.map(([a]: [any]) => a),
    ...m.updateMany.mock.calls.map(([a]: [any]) => a),
  ];

  // ── envelope / P2002 ────────────────────────────────────────────────────────
  it('[GAP] findAll returns the { purchaseRequisitions, count } envelope', async () => {
    prisma.purchaseRequisition.findMany.mockResolvedValue([prRecord()]);
    const result: any = await service.findAll(TENANT_A);
    expect(result).toEqual(
      expect.objectContaining({ purchaseRequisitions: expect.any(Array), count: 1 }),
    );
  });

  it('[GAP] create maps Prisma P2002 (prNumber race) to ConflictException', async () => {
    prisma.purchaseRequisition.findFirst.mockResolvedValue(null);
    prisma.purchaseRequisition.create.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
    );
    await expect(
      service.create(TENANT_A, USER, {
        title: 'Need',
        requiredDate: '2026-07-01',
        lines: [
          { genericDescription: 'W', quantity: 1, uom: 'PCS', requiredDate: '2026-07-01' },
        ],
      } as never),
    ).rejects.toThrow(ConflictException);
  });

  it('findOne throws 404 for an id owned by another tenant', async () => {
    prisma.purchaseRequisition.findFirst.mockResolvedValue(null);
    await expect(service.findOne(TENANT_B, 'owned-by-A')).rejects.toThrow(NotFoundException);
  });

  // ── scoped writes ([GAP] ×4) ────────────────────────────────────────────────
  it('[GAP] update / updateStatus / remove writes are tenant-scoped at the write itself', async () => {
    prisma.purchaseRequisition.findFirst.mockResolvedValue(prRecord());
    prisma.purchaseRequisition.update.mockResolvedValue(prRecord());
    await service.update(TENANT_A, USER, 'pr-1', { title: 'X' } as never);
    await service.updateStatus(TENANT_A, USER, 'pr-1', 'submitted');
    await service.remove(TENANT_A, USER, 'pr-1');
    const scoped = writesOf(prisma.purchaseRequisition).filter(
      (c: any) => c?.where?.tenantId === TENANT_A,
    );
    expect(scoped.length).toBeGreaterThanOrEqual(3);
  });

  // ── state machine (preserved) ───────────────────────────────────────────────
  it('updateStatus rejects an illegal transition (draft → approved) with 400', async () => {
    prisma.purchaseRequisition.findFirst.mockResolvedValue(prRecord({ status: 'draft' }));
    await expect(
      service.updateStatus(TENANT_A, USER, 'pr-1', 'approved'),
    ).rejects.toThrow(BadRequestException);
  });

  it('reject requires a reason', async () => {
    prisma.purchaseRequisition.findFirst.mockResolvedValue(prRecord({ status: 'submitted' }));
    await expect(service.updateStatus(TENANT_A, USER, 'pr-1', 'rejected')).rejects.toThrow(
      BadRequestException,
    );
  });

  // ── convertToRfq ([GAP] tx + injected generator + map assertion) ────────────
  const approvedPr = () => prRecord({ status: 'approved' });

  const happyConvertMocks = () => {
    prisma.purchaseRequisition.findFirst.mockResolvedValue(approvedPr());
    prisma.purchaseRequisitionLine.findMany.mockResolvedValue([prLine()]);
    prisma.supplier.findFirst.mockResolvedValue({ id: SUP });
    prisma.rfq.findFirst.mockResolvedValue(null);
    prisma.rfq.create.mockImplementation(({ data }: any) => ({ id: 'rfq-1', ...data }));
  };

  it('convertToRfq guards: 400 when PR is draft; 400 when no lines match', async () => {
    prisma.purchaseRequisition.findFirst.mockResolvedValue(prRecord({ status: 'draft' }));
    await expect(
      service.convertToRfq(TENANT_A, USER, 'pr-1', ['prl-1'], 'Q', [SUP]),
    ).rejects.toThrow(BadRequestException);
    prisma.purchaseRequisition.findFirst.mockResolvedValue(approvedPr());
    prisma.purchaseRequisitionLine.findMany.mockResolvedValue([]);
    await expect(
      service.convertToRfq(TENANT_A, USER, 'pr-1', ['prl-1'], 'Q', [SUP]),
    ).rejects.toThrow(BadRequestException);
  });

  it('[GAP] convertToRfq runs in one $transaction and uses the injected RFQ number generator', async () => {
    happyConvertMocks();
    await service.convertToRfq(TENANT_A, USER, 'pr-1', ['prl-1'], 'Q', [SUP]);
    expect(prisma.$transaction).toHaveBeenCalled();
    expect(rfqService.generateRfqNumber).toHaveBeenCalledWith(TENANT_A, expect.anything());
  });

  it('[GAP] convertToRfq PR-status flip is tenant-scoped and the created RFQ carries tenantId + prId', async () => {
    happyConvertMocks();
    await service.convertToRfq(TENANT_A, USER, 'pr-1', ['prl-1'], 'Q', [SUP]);
    expect(
      writesOf(prisma.purchaseRequisition).some((c: any) => c?.where?.tenantId === TENANT_A),
    ).toBe(true);
    const rfq = prisma.rfq.create.mock.calls[0][0].data;
    expect(rfq.tenantId).toBe(TENANT_A);
    expect(rfq.prId).toBe('pr-1');
  });

  it('[GAP] generatePrNumber is public, tx-aware and numeric-max based', async () => {
    const year = new Date().getFullYear();
    prisma.purchaseRequisition.findMany.mockResolvedValue([
      { prNumber: `PR-${year}-99` },
      { prNumber: `PR-${year}-104` },
    ]);
    prisma.purchaseRequisition.findFirst.mockResolvedValue(null);
    const num = await (service as any).generatePrNumber(TENANT_A);
    expect(num).toBe(`PR-${year}-0105`);
  });
});
