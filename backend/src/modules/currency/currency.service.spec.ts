// ============================================================================
// Unit tests for CurrencyService — spec-021-multi-currency
// PrismaService is mocked; these assert behavior, not the DB.
// ============================================================================
import { Test } from '@nestjs/testing';
import { NotFoundException, ConflictException, BadRequestException } from '@nestjs/common';
import { CurrencyService } from './currency.service';
import { PrismaService } from '../../database/prisma.service';
import { Decimal } from '@prisma/client/runtime/library';

const TENANT_A = '11111111-1111-1111-1111-111111111111';
const USER = '33333333-3333-3333-3333-333333333333';
const DATE = new Date('2026-06-06');

describe('CurrencyService', () => {
  let service: CurrencyService;
  let prisma: Record<string, any>;

  beforeEach(async () => {
    prisma = {
      exchangeRate: { findFirst: jest.fn(), findMany: jest.fn(), create: jest.fn() },
      currency: { findFirst: jest.fn() },
      tenantSettings: { findFirst: jest.fn() },
    };
    const mod = await Test.createTestingModule({
      providers: [CurrencyService, { provide: PrismaService, useValue: prisma }],
    }).compile();
    service = mod.get(CurrencyService);
  });

  // ── getRate ────────────────────────────────────────────────────────────────

  it('getRate returns 1 for an identity pair without touching the DB', async () => {
    const rate = await service.getRate(TENANT_A, 'DOP', 'DOP', DATE);
    expect(rate.toNumber()).toBe(1);
    expect(prisma.exchangeRate.findFirst).not.toHaveBeenCalled();
  });

  it('getRate returns the most recent direct rate effective on or before the date, tenant-scoped', async () => {
    prisma.exchangeRate.findFirst.mockResolvedValueOnce({ rate: new Decimal('59.5') });
    const rate = await service.getRate(TENANT_A, 'USD', 'DOP', DATE);
    expect(rate.toNumber()).toBe(59.5);
    expect(prisma.exchangeRate.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          tenantId: TENANT_A,
          fromCurrency: 'USD',
          toCurrency: 'DOP',
          effectiveDate: { lte: DATE },
        }),
        orderBy: { effectiveDate: 'desc' },
      }),
    );
  });

  it('getRate falls back to the inverse pair (1 / rate)', async () => {
    prisma.exchangeRate.findFirst
      .mockResolvedValueOnce(null) // direct USD→DOP missing
      .mockResolvedValueOnce({ rate: new Decimal('0.016807') }); // DOP→USD present
    const rate = await service.getRate(TENANT_A, 'USD', 'DOP', DATE);
    expect(rate.toNumber()).toBeCloseTo(59.499, 2);
  });

  it('getRate throws NotFoundException with an actionable message when no pair exists', async () => {
    prisma.exchangeRate.findFirst.mockResolvedValue(null);
    await expect(service.getRate(TENANT_A, 'GBP', 'DOP', DATE)).rejects.toThrow(
      /GBP -> DOP.*exchange-rates/,
    );
  });

  // ── convert ────────────────────────────────────────────────────────────────

  it('convert is Decimal-safe and rounds the converted amount to 2 decimals', async () => {
    prisma.exchangeRate.findFirst.mockResolvedValueOnce({ rate: new Decimal('59.5') });
    const res = await service.convert(TENANT_A, new Decimal('10.10'), 'USD', 'DOP', DATE);
    expect(res.rate.toNumber()).toBe(59.5);
    expect(res.converted.toNumber()).toBe(600.95); // 10.10 × 59.5 exact, no float drift
  });

  // ── getBaseCurrency ────────────────────────────────────────────────────────

  it('getBaseCurrency reads TenantSettings and defaults to DOP when missing', async () => {
    prisma.tenantSettings.findFirst.mockResolvedValueOnce({ baseCurrency: 'USD' });
    expect(await service.getBaseCurrency(TENANT_A)).toBe('USD');
    prisma.tenantSettings.findFirst.mockResolvedValueOnce(null);
    expect(await service.getBaseCurrency(TENANT_A)).toBe('DOP');
  });

  // ── create ─────────────────────────────────────────────────────────────────

  const dto = {
    fromCurrency: 'USD',
    toCurrency: 'DOP',
    rate: 59.5,
    rateDate: '2026-06-01',
  } as any;

  it('create rejects an identical currency pair with 400', async () => {
    await expect(service.create(TENANT_A, USER, { ...dto, toCurrency: 'USD' })).rejects.toThrow(
      BadRequestException,
    );
  });

  it('create throws 404 when a currency is not in the catalog', async () => {
    prisma.currency.findFirst.mockResolvedValue(null);
    await expect(service.create(TENANT_A, USER, dto)).rejects.toThrow(NotFoundException);
  });

  it('create writes tenant-scoped with frozen source and audit', async () => {
    prisma.currency.findFirst.mockResolvedValue({ code: 'USD' });
    prisma.exchangeRate.create.mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'rate-1', ...data }),
    );
    await service.create(TENANT_A, USER, dto);
    expect(prisma.exchangeRate.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          tenantId: TENANT_A,
          fromCurrency: 'USD',
          toCurrency: 'DOP',
          source: 'manual',
          createdBy: USER,
        }),
      }),
    );
  });

  it('create maps a P2002 duplicate (tenant+pair+date) to 409 ConflictException', async () => {
    prisma.currency.findFirst.mockResolvedValue({ code: 'USD' });
    prisma.exchangeRate.create.mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), { code: 'P2002' }),
    );
    await expect(service.create(TENANT_A, USER, dto)).rejects.toThrow(ConflictException);
  });

  // ── findAll ────────────────────────────────────────────────────────────────

  it('findAll is tenant-scoped and returns the { exchangeRates, count } envelope', async () => {
    prisma.exchangeRate.findMany.mockResolvedValue([{ id: 'r1', rate: new Decimal('59.5') }]);
    const res = await service.findAll(TENANT_A, { from: 'USD' });
    expect(prisma.exchangeRate.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ tenantId: TENANT_A, fromCurrency: 'USD' }),
      }),
    );
    expect(res).toHaveProperty('exchangeRates');
    expect(res.count).toBe(1);
    expect(res.exchangeRates[0].rate).toBe(59.5); // Decimal serialized as number
  });
});
