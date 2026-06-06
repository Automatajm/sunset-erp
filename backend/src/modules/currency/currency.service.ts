// ============================================================================
// FILE: backend/src/modules/currency/currency.service.ts
// spec-021 — Multi-currency infrastructure. CurrencyService is leaf
// infrastructure (depends only on PrismaService, like UomService): monetary
// modules inject it to FREEZE a rate at transaction creation. The rate is
// never recalculated after creation — updates recompute amountBase with the
// frozen rate (the frozen-rate pattern, binding for SO/PO/AR/AP).
// ============================================================================
import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateExchangeRateDto } from './dto/create-exchange-rate.dto';
import { Decimal } from '@prisma/client/runtime/library';

@Injectable()
export class CurrencyService {
  constructor(private prisma: PrismaService) {}

  // ── getRate — most recent rate effective on or before `date` ──────────────

  async getRate(tenantId: string, from: string, to: string, date: Date): Promise<Decimal> {
    if (from === to) return new Decimal(1);

    const direct = await this.prisma.exchangeRate.findFirst({
      where: { tenantId, fromCurrency: from, toCurrency: to, effectiveDate: { lte: date } },
      orderBy: { effectiveDate: 'desc' },
    });
    if (direct) return new Decimal(direct.rate);

    // Inverse-pair fallback: a stored DOP→USD rate serves USD→DOP as 1/rate.
    const inverse = await this.prisma.exchangeRate.findFirst({
      where: { tenantId, fromCurrency: to, toCurrency: from, effectiveDate: { lte: date } },
      orderBy: { effectiveDate: 'desc' },
    });
    if (inverse) return new Decimal(1).div(new Decimal(inverse.rate));

    throw new NotFoundException(
      `No exchange rate found for ${from} -> ${to} (or inverse) on or before ` +
        `${date.toISOString().split('T')[0]} - add one via POST /api/exchange-rates`,
    );
  }

  // ── convert — Decimal-safe; converted rounded to 2 (monetary) ─────────────

  async convert(
    tenantId: string,
    amount: Decimal | number,
    from: string,
    to: string,
    date: Date,
  ): Promise<{ amount: Decimal; rate: Decimal; converted: Decimal }> {
    const amt = new Decimal(amount);
    const rate = await this.getRate(tenantId, from, to, date);
    return { amount: amt, rate, converted: amt.mul(rate).toDecimalPlaces(2) };
  }

  // ── Base currency (frozen onto transactions at creation) ──────────────────

  async getBaseCurrency(tenantId: string): Promise<string> {
    const settings = await this.prisma.tenantSettings.findFirst({
      where: { tenantId },
      select: { baseCurrency: true },
    });
    return settings?.baseCurrency ?? 'DOP';
  }

  // ── Rates CRUD ─────────────────────────────────────────────────────────────

  async create(tenantId: string, userId: string, dto: CreateExchangeRateDto) {
    if (dto.fromCurrency === dto.toCurrency)
      throw new BadRequestException('fromCurrency and toCurrency must differ');

    for (const code of [dto.fromCurrency, dto.toCurrency]) {
      const currency = await this.prisma.currency.findFirst({ where: { code } });
      if (!currency) throw new NotFoundException(`Currency ${code} not in the catalog`);
    }

    try {
      return await this.prisma.exchangeRate.create({
        data: {
          tenantId,
          fromCurrency: dto.fromCurrency,
          toCurrency: dto.toCurrency,
          rate: new Decimal(dto.rate),
          effectiveDate: new Date(dto.rateDate),
          source: dto.source ?? 'manual',
          createdBy: userId,
        },
      });
    } catch (e: any) {
      if (e?.code === 'P2002')
        throw new ConflictException(
          `A ${dto.fromCurrency} -> ${dto.toCurrency} rate for ${dto.rateDate} already exists`,
        );
      throw e;
    }
  }

  async findAll(tenantId: string, filters?: { from?: string; to?: string }) {
    const where: any = { tenantId };
    if (filters?.from) where.fromCurrency = filters.from;
    if (filters?.to) where.toCurrency = filters.to;
    const exchangeRates = await this.prisma.exchangeRate.findMany({
      where,
      orderBy: [{ effectiveDate: 'desc' }, { fromCurrency: 'asc' }],
    });
    return {
      exchangeRates: exchangeRates.map((r) => ({ ...r, rate: Number(r.rate) })),
      count: exchangeRates.length,
    };
  }
}
