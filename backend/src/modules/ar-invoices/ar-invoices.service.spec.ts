// ============================================================================
// Unit tests for ArInvoicesService — spec-026-ar-invoices (mirror of spec-025)
// PrismaService, AutomationService, StockTransactionsService and (spec-021)
// CurrencyService are mocked; these assert behavior, not the DB.
// Tests tagged [GAP] encode an unchecked `- [ ]` acceptance criterion and are
// expected to FAIL until that criterion is implemented (red → green).
// ============================================================================
import { Test } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { ArInvoicesService } from './ar-invoices.service';
import { PrismaService } from '../../database/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AutomationService } from '../automation/automation.service';
import { StockTransactionsService } from '../stock-transactions/stock-transactions.service';
import { CurrencyService } from '../currency/currency.service';
import { Decimal } from '@prisma/client/runtime/library';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const TENANT_B = '22222222-2222-2222-2222-222222222222';
const USER = '33333333-3333-3333-3333-333333333333';
const CUST = '44444444-4444-4444-4444-444444444444';
const INV_ID = '55555555-5555-5555-5555-555555555555';
const SO_ID = '66666666-6666-6666-6666-666666666666';

const YEAR = new Date().getFullYear();

type ModelMock = Record<string, jest.Mock>;

describe('ArInvoicesService', () => {
  let service: ArInvoicesService;
  let prisma: Record<string, any>;
  let automation: { handleAutoJe: jest.Mock };
  let stockService: { shipFromArInvoice: jest.Mock };
  let currency: { getRate: jest.Mock; getBaseCurrency: jest.Mock; convert: jest.Mock };

  const model = (): ModelMock => ({
    findFirst: jest.fn(),
    findMany: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    updateMany: jest.fn(),
    count: jest.fn(),
  });

  beforeEach(async () => {
    prisma = {
      arInvoice: model(),
      arInvoiceLine: model(),
      arPayment: model(),
      customer: model(),
      salesOrder: model(),
      item: model(),
      journalEntry: model(),
      account: model(),
      fiscalPeriod: model(),
      currency: model(),
      bom: model(),
      bomComponent: model(),
    };
    automation = { handleAutoJe: jest.fn().mockResolvedValue({ je: { id: 'je-1' } }) };
    stockService = { shipFromArInvoice: jest.fn().mockResolvedValue(undefined) };
    currency = {
      getRate: jest.fn().mockResolvedValue(new Decimal('59.5')),
      getBaseCurrency: jest.fn().mockResolvedValue('DOP'),
      convert: jest.fn(),
    };

    const mod = await Test.createTestingModule({
      providers: [
        ArInvoicesService,
        { provide: PrismaService, useValue: prisma },
        {
          provide: NotificationsService,
          useValue: { safeQueue: jest.fn(), safeQueueOnce: jest.fn() },
        },
        { provide: AutomationService, useValue: automation },
        { provide: StockTransactionsService, useValue: stockService },
        { provide: CurrencyService, useValue: currency },
      ],
    }).compile();
    service = mod.get(ArInvoicesService);
  });

  const setupCreateMocks = () => {
    prisma.customer.findFirst.mockResolvedValue({ id: CUST });
    prisma.currency.findFirst.mockResolvedValue({ code: 'ANY' }); // catalog validation
    prisma.salesOrder.findFirst.mockResolvedValue({ id: SO_ID, status: 'confirmed' });
    prisma.item.findFirst.mockResolvedValue({ id: 'item-1' });
    prisma.arInvoice.findFirst.mockResolvedValue(null); // number gen (legacy)
    prisma.arInvoice.findMany.mockResolvedValue([]); // number gen (numeric-max)
    prisma.arInvoice.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: INV_ID, ...data }),
    );
  };

  const createDto = (over: Record<string, any> = {}): any => ({
    customerId: CUST,
    invoiceDate: '2026-06-06',
    dueDate: '2026-07-06',
    lines: [{ description: 'svc line', quantity: 10, unitPrice: 100 }],
    ...over,
  });

  const invoiceRow = (over: Record<string, any> = {}): any => ({
    id: INV_ID,
    invoiceNumber: `INV-${YEAR}-0001`,
    status: 'draft',
    totalAmount: new Decimal('1000'),
    paidAmount: new Decimal('0'),
    invoiceDate: new Date('2026-06-06'),
    jeId: null,
    soId: null,
    customer: { name: 'Cust' },
    lines: [],
    ...over,
  });

  // ── Reads + envelope ───────────────────────────────────────────────────────

  it('findAll scopes the query to tenantId + deletedAt: null', async () => {
    prisma.arInvoice.findMany.mockResolvedValue([]);
    await service.findAll(TENANT_A, {});
    expect(prisma.arInvoice.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_A, deletedAt: null }),
      }),
    );
  });

  it('[GAP] findAll returns the { arInvoices, count } envelope', async () => {
    prisma.arInvoice.findMany.mockResolvedValue([]);
    const res: any = await service.findAll(TENANT_A, {});
    expect(res).toHaveProperty('arInvoices');
    expect(res).toHaveProperty('count');
  });

  it('findOne throws NotFoundException for another tenant', async () => {
    prisma.arInvoice.findFirst.mockResolvedValue(null);
    await expect(service.findOne(TENANT_B, INV_ID)).rejects.toThrow(NotFoundException);
  });

  // ── Frozen-rate pattern (spec-021 gate, mirror of spec-025) ───────────────

  it('[GAP] create defaults currency to the tenant base currency, not USD', async () => {
    setupCreateMocks();
    await service.create(TENANT_A, USER, createDto());
    expect(currency.getBaseCurrency).toHaveBeenCalledWith(TENANT_A);
    expect(prisma.arInvoice.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ currency: 'DOP' }) }),
    );
  });

  it('[GAP] create freezes exchangeRate and amountBase at the invoice date', async () => {
    setupCreateMocks();
    await service.create(TENANT_A, USER, createDto({ currency: 'USD' }));
    expect(currency.getRate).toHaveBeenCalledWith(TENANT_A, 'USD', 'DOP', expect.any(Date));
    const data = prisma.arInvoice.create.mock.calls[0][0].data;
    expect(Number(data.exchangeRate)).toBe(59.5);
    expect(Number(data.amountBase)).toBeCloseTo(59500, 2); // 1000 × 59.5
    expect(data.baseCurrency).toBe('DOP');
  });

  it('[GAP] createFromSalesOrder freezes the rate at the RETROACTIVE invoice date', async () => {
    prisma.salesOrder.findFirst.mockResolvedValue({
      id: SO_ID,
      status: 'confirmed',
      orderDate: new Date('2026-05-01'),
      customerId: CUST,
      soNumber: 'SO-1',
      currency: 'USD',
      subtotal: 900,
      taxAmount: 0,
      total: 900,
      lines: [],
    });
    prisma.arInvoice.findFirst.mockResolvedValue(null);
    prisma.arInvoice.findMany.mockResolvedValue([]);
    prisma.arInvoice.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: INV_ID, ...data }),
    );
    await service.createFromSalesOrder(TENANT_A, USER, SO_ID);
    // The rate date must be the SO orderDate, not today
    const rateDate = currency.getRate.mock.calls[0][3] as Date;
    expect(rateDate.toISOString().slice(0, 10)).toBe('2026-05-01');
    const data = prisma.arInvoice.create.mock.calls[0][0].data;
    expect(Number(data.amountBase)).toBeCloseTo(900 * 59.5, 1);
  });

  // ── Dead COGS stub ─────────────────────────────────────────────────────────

  it('[GAP] createFromSalesOrder no longer queries BOMs (dead stub removed), cogsAmount null', async () => {
    prisma.salesOrder.findFirst.mockResolvedValue({
      id: SO_ID,
      status: 'confirmed',
      orderDate: new Date('2026-05-01'),
      customerId: CUST,
      soNumber: 'SO-1',
      currency: null,
      subtotal: 900,
      taxAmount: 0,
      total: 900,
      lines: [
        {
          itemId: 'item-1',
          orderedQuantity: 10,
          uom: 'PCS',
          unitPrice: 90,
          discountPercent: 0,
          lineTotal: 900,
          description: 'x',
          item: { name: 'x' },
        },
      ],
    });
    prisma.arInvoice.findFirst.mockResolvedValue(null);
    prisma.arInvoice.findMany.mockResolvedValue([]);
    prisma.arInvoice.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: INV_ID, ...data }),
    );
    await service.createFromSalesOrder(TENANT_A, USER, SO_ID);
    expect(prisma.bom.findFirst).not.toHaveBeenCalled(); // stub burned 2 queries/line
    const data = prisma.arInvoice.create.mock.calls[0][0].data;
    expect(data.lines.create[0].cogsAmount).toBeNull();
  });

  // ── Decimal-safe money ─────────────────────────────────────────────────────

  it('[GAP] line totals are Decimal-exact (no float drift)', async () => {
    setupCreateMocks();
    await service.create(
      TENANT_A,
      USER,
      createDto({ lines: [{ description: 'x', quantity: 3, unitPrice: 0.1 }] }),
    );
    const data = prisma.arInvoice.create.mock.calls[0][0].data;
    expect(Number(data.subtotal)).toBe(0.3); // float math gives 0.30000000000000004
  });

  // ── Sending integrity ──────────────────────────────────────────────────────

  it('send blocks a non-draft invoice with 400', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue(invoiceRow({ status: 'sent' }));
    await expect(service.send(TENANT_A, USER, INV_ID)).rejects.toThrow(BadRequestException);
  });

  it('[GAP] send ABORTS (400) when the FG shipment fails — no silent divergence', async () => {
    jest
      .spyOn(service, 'findOne')
      .mockResolvedValue(
        invoiceRow({ lines: [{ itemId: 'item-1', quantity: 1, uom: 'PCS', lineTotal: 10 }] }),
      );
    prisma.account.findFirst.mockResolvedValue({ id: 'acct-1' });
    prisma.fiscalPeriod.findFirst.mockResolvedValue(null);
    prisma.journalEntry.findFirst.mockResolvedValue(null);
    prisma.journalEntry.findMany.mockResolvedValue([]);
    prisma.arInvoice.update.mockResolvedValue({});
    prisma.arInvoice.updateMany.mockResolvedValue({ count: 1 });
    stockService.shipFromArInvoice.mockRejectedValue(new Error('no stock'));

    await expect(service.send(TENANT_A, USER, INV_ID)).rejects.toThrow(BadRequestException);
    const flips = [
      ...prisma.arInvoice.update.mock.calls,
      ...prisma.arInvoice.updateMany.mock.calls,
    ].filter((c) => c[0]?.data?.status === 'sent');
    expect(flips).toHaveLength(0);
  });

  it('send blocks when the fiscal period is closed', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue(invoiceRow());
    prisma.account.findFirst.mockResolvedValue({ id: 'acct-1' });
    prisma.journalEntry.findFirst.mockResolvedValue(null);
    prisma.journalEntry.findMany.mockResolvedValue([]);
    prisma.fiscalPeriod.findFirst.mockResolvedValue({ status: 'closed' });
    await expect(service.send(TENANT_A, USER, INV_ID)).rejects.toThrow(/closed/);
  });

  // ── Void ───────────────────────────────────────────────────────────────────

  it('void blocks already-void and fully paid invoices (400)', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue(invoiceRow({ status: 'void' }));
    await expect(service.void(TENANT_A, USER, INV_ID)).rejects.toThrow(BadRequestException);
    jest.spyOn(service, 'findOne').mockResolvedValue(invoiceRow({ status: 'paid' }));
    await expect(service.void(TENANT_A, USER, INV_ID)).rejects.toThrow(BadRequestException);
  });

  it('[GAP] void of a partially paid invoice → 409 (reverse payments first)', async () => {
    jest
      .spyOn(service, 'findOne')
      .mockResolvedValue(invoiceRow({ status: 'partial', paidAmount: new Decimal('500') }));
    await expect(service.void(TENANT_A, USER, INV_ID)).rejects.toThrow(ConflictException);
  });

  it('[GAP] void scopes the original-JE lookup by tenantId', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue(invoiceRow({ status: 'sent', jeId: 'je-9' }));
    prisma.journalEntry.findFirst.mockResolvedValue(null);
    prisma.journalEntry.findMany.mockResolvedValue([]);
    prisma.arInvoice.update.mockResolvedValue({});
    prisma.arInvoice.updateMany.mockResolvedValue({ count: 1 });
    await service.void(TENANT_A, USER, INV_ID);
    expect(prisma.journalEntry.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'je-9', tenantId: TENANT_A }),
      }),
    );
  });

  // ── Payments ───────────────────────────────────────────────────────────────

  const setupPaymentMocks = (inv: any) => {
    jest.spyOn(service, 'findOne').mockResolvedValue(inv);
    prisma.account.findFirst.mockResolvedValue({ id: 'acct-1' });
    prisma.fiscalPeriod.findFirst.mockResolvedValue(null);
    prisma.journalEntry.findFirst.mockResolvedValue(null);
    prisma.journalEntry.findMany.mockResolvedValue([]);
    prisma.arPayment.findFirst.mockResolvedValue(null);
    prisma.arPayment.findMany.mockResolvedValue([]);
    prisma.arPayment.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'pay-1', ...data }),
    );
    prisma.arInvoice.update.mockResolvedValue({});
    prisma.arInvoice.updateMany.mockResolvedValue({ count: 1 });
  };

  it('applyPayment blocks draft/void invoices and over-payments', async () => {
    setupPaymentMocks(invoiceRow({ status: 'draft' }));
    await expect(
      service.applyPayment(TENANT_A, USER, INV_ID, { paymentDate: '2026-06-10', amount: 1 } as any),
    ).rejects.toThrow(BadRequestException);

    setupPaymentMocks(
      invoiceRow({
        status: 'sent',
        totalAmount: new Decimal('100'),
        paidAmount: new Decimal('90'),
      }),
    );
    await expect(
      service.applyPayment(TENANT_A, USER, INV_ID, {
        paymentDate: '2026-06-10',
        amount: 50,
      } as any),
    ).rejects.toThrow(/exceeds outstanding/);
  });

  it('[GAP] applyPayment freezes its OWN rate at the payment date', async () => {
    setupPaymentMocks(invoiceRow({ status: 'sent', currency: 'USD' }));
    await service.applyPayment(TENANT_A, USER, INV_ID, {
      paymentDate: '2026-06-10',
      amount: 500,
    } as any);
    const data = prisma.arPayment.create.mock.calls[0][0].data;
    expect(Number(data.exchangeRate)).toBe(59.5);
    expect(Number(data.amountBase)).toBeCloseTo(29750, 2);
    expect(data.baseCurrency).toBe('DOP');
  });

  it('[GAP] applyPayment writes the invoice via tenant-scoped updateMany (full pay → paid)', async () => {
    setupPaymentMocks(invoiceRow({ status: 'sent' }));
    await service.applyPayment(TENANT_A, USER, INV_ID, {
      paymentDate: '2026-06-10',
      amount: 1000,
    } as any);
    expect(prisma.arInvoice.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: INV_ID, tenantId: TENANT_A, deletedAt: null }),
        data: expect.objectContaining({ status: 'paid' }),
      }),
    );
  });

  // ── Draft-only guards + scoped writes ──────────────────────────────────────

  it('update/remove block non-draft invoices with 400', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue(invoiceRow({ status: 'sent' }));
    await expect(service.update(TENANT_A, USER, INV_ID, { notes: 'x' } as any)).rejects.toThrow(
      BadRequestException,
    );
    await expect(service.remove(TENANT_A, USER, INV_ID)).rejects.toThrow(BadRequestException);
  });

  it('[GAP] update and remove write via tenant-scoped updateMany', async () => {
    jest.spyOn(service, 'findOne').mockResolvedValue(invoiceRow());
    prisma.arInvoice.updateMany.mockResolvedValue({ count: 1 });
    await service.update(TENANT_A, USER, INV_ID, { notes: 'x' } as any);
    await service.remove(TENANT_A, USER, INV_ID);
    for (const call of prisma.arInvoice.updateMany.mock.calls) {
      expect(call[0].where).toEqual(
        expect.objectContaining({ id: INV_ID, tenantId: TENANT_A, deletedAt: null }),
      );
    }
  });

  // ── createFromSalesOrder guards ────────────────────────────────────────────

  it('createFromSalesOrder blocks wrong SO status and duplicate invoices', async () => {
    prisma.salesOrder.findFirst.mockResolvedValue({ id: SO_ID, status: 'draft', lines: [] });
    await expect(service.createFromSalesOrder(TENANT_A, USER, SO_ID)).rejects.toThrow(
      /Cannot invoice SO/,
    );
    prisma.salesOrder.findFirst.mockResolvedValue({
      id: SO_ID,
      status: 'confirmed',
      orderDate: new Date(),
      soNumber: 'SO-1',
      lines: [],
    });
    prisma.arInvoice.findFirst.mockResolvedValue({ invoiceNumber: 'INV-1' });
    await expect(service.createFromSalesOrder(TENANT_A, USER, SO_ID)).rejects.toThrow(
      /already exists/,
    );
  });

  // ── Document numbering ─────────────────────────────────────────────────────

  it('[GAP] invoiceNumber comes from the NUMERIC max', async () => {
    setupCreateMocks();
    prisma.arInvoice.findMany.mockResolvedValue([
      { invoiceNumber: `INV-${YEAR}-999` },
      { invoiceNumber: `INV-${YEAR}-1000` },
    ]);
    await service.create(TENANT_A, USER, createDto());
    expect(prisma.arInvoice.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ invoiceNumber: `INV-${YEAR}-1001` }),
      }),
    );
  });

  it('[GAP] an invoiceNumber P2002 collision maps to 409 ConflictException', async () => {
    setupCreateMocks();
    prisma.arInvoice.create.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
    );
    await expect(service.create(TENANT_A, USER, createDto())).rejects.toThrow(ConflictException);
  });

  // ── Aging / KPI base amounts ───────────────────────────────────────────────

  it('[GAP] aging buckets and KPIs include base-currency sums', async () => {
    prisma.arInvoice.findMany.mockResolvedValue([
      {
        id: INV_ID,
        invoiceNumber: 'INV-1',
        customer: {},
        invoiceDate: new Date(),
        dueDate: new Date(),
        totalAmount: new Decimal('100'),
        paidAmount: new Decimal('0'),
        exchangeRate: new Decimal('59.5'),
        status: 'sent',
      },
    ]);
    const aging: any = await service.getAging(TENANT_A);
    expect(aging.summary.current.amountBase).toBeCloseTo(5950, 2);
    const kpis: any = await service.getKpis(TENANT_A);
    expect(kpis.invoicedBase).toBeCloseTo(5950, 2);
  });
});
