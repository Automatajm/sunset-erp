// --- uom/uom.service.ts ---
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
 
@Injectable()
export class UomService {
  constructor(private prisma: PrismaService) {}
 
  async findAllUnits(filters?: { type?: string; system?: string }) {
    const where: any = { isActive: true };
    if (filters?.type)   where.type   = filters.type;
    if (filters?.system) where.system = filters.system;
    return this.prisma.uomUnit.findMany({
      where,
      orderBy: [{ type: 'asc' }, { system: 'asc' }, { isBase: 'desc' }, { code: 'asc' }],
    });
  }
 
  async findOneUnit(id: string) {
    const unit = await this.prisma.uomUnit.findUnique({ where: { id } });
    if (!unit) throw new NotFoundException(`UOM unit ${id} not found`);
    return unit;
  }
 
  async findUnitByCode(code: string) {
    const unit = await this.prisma.uomUnit.findUnique({ where: { code } });
    if (!unit) throw new NotFoundException(`UOM unit with code ${code} not found`);
    return unit;
  }
 
  async findAllConversions() {
    return this.prisma.uomConversion.findMany({
      where: { isActive: true },
      include: {
        fromUom: { select: { code: true, name: true, type: true, system: true } },
        toUom:   { select: { code: true, name: true, type: true, system: true } },
      },
      orderBy: [{ fromUom: { type: 'asc' } }, { fromUom: { code: 'asc' } }],
    });
  }
 
  async convert(fromCode: string, toCode: string, quantity: number): Promise<{
    fromUom: string; toUom: string; inputQty: number;
    outputQty: number; factor: number; isAutomatic: boolean;
  }> {
    if (fromCode === toCode) {
      return { fromUom: fromCode, toUom: toCode, inputQty: quantity, outputQty: quantity, factor: 1, isAutomatic: true };
    }
    const from = await this.findUnitByCode(fromCode);
    const to   = await this.findUnitByCode(toCode);
    const conversion = await this.prisma.uomConversion.findUnique({
      where: { fromUomId_toUomId: { fromUomId: from.id, toUomId: to.id } },
    });
    if (!conversion) {
      throw new NotFoundException(`No conversion found from ${fromCode} to ${toCode}. Manual factor required.`);
    }
    const factor    = Number(conversion.factor);
    const outputQty = Math.round(quantity * factor * 1_000_000) / 1_000_000;
    return { fromUom: fromCode, toUom: toCode, inputQty: quantity, outputQty, factor, isAutomatic: true };
  }
 
  // Used internally by SupplierItemsService to auto-calculate conversion factors
  async getConversionFactor(fromUomId: string, toUomId: string): Promise<number | null> {
    if (fromUomId === toUomId) return 1;
    const conversion = await this.prisma.uomConversion.findUnique({
      where: { fromUomId_toUomId: { fromUomId, toUomId } },
    });
    return conversion ? Number(conversion.factor) : null;
  }
}