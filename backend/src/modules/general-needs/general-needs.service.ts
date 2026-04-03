import {
  Injectable, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreateGeneralNeedDto } from './dto/create-general-need.dto';
import { UpdateGeneralNeedDto } from './dto/update-general-need.dto';
import { UpdateGeneralNeedLineDto } from './dto/update-general-need-line.dto';

@Injectable()
export class GeneralNeedsService {
  constructor(private prisma: PrismaService) {}

  // ── Auto-generate GN number ────────────────────────────────────────────────

  private async generateGnNumber(tenantId: string): Promise<string> {
    const year   = new Date().getFullYear();
    const prefix = `GN-${year}`;
    const last   = await this.prisma.generalNeed.findFirst({
      where:   { tenantId, gnNumber: { startsWith: prefix } },
      orderBy: { gnNumber: 'desc' },
    });
    if (!last) return `${prefix}-0001`;
    const parts   = last.gnNumber.split('-');
    const lastNum = parseInt(parts[parts.length - 1], 10);
    const nextNum = isNaN(lastNum) ? 1 : lastNum + 1;
    return `${prefix}-${nextNum.toString().padStart(4, '0')}`;
  }

  // ── Create ─────────────────────────────────────────────────────────────────

  async create(tenantId: string, userId: string, dto: CreateGeneralNeedDto) {
    // Validate items exist if provided
    for (const line of dto.lines) {
      if (line.itemId) {
        const item = await this.prisma.item.findFirst({
          where: { id: line.itemId, tenantId, deletedAt: null },
        });
        if (!item) throw new NotFoundException(`Item ${line.itemId} not found`);
      }
      if (line.suggestedSupplierId) {
        const supplier = await this.prisma.supplier.findFirst({
          where: { id: line.suggestedSupplierId, tenantId, deletedAt: null },
        });
        if (!supplier) throw new NotFoundException(`Supplier ${line.suggestedSupplierId} not found`);
      }
    }

    const gnNumber = await this.generateGnNumber(tenantId);

    return this.prisma.generalNeed.create({
      data: {
        tenantId,
        gnNumber,
        title:       dto.title,
        description: dto.description,
        periodStart: new Date(dto.periodStart),
        periodEnd:   new Date(dto.periodEnd),
        source:      dto.source ?? 'manual',
        status:      'draft',
        notes:       dto.notes,
        createdBy:   userId,
        updatedBy:   userId,
        lines: {
          create: dto.lines.map((line, index) => ({
            tenantId,
            lineNumber:           index + 1,
            itemId:               line.itemId,
            genericDescription:   line.genericDescription,
            quantity:             line.quantity,
            uom:                  line.uom,
            requiredDate:         new Date(line.requiredDate),
            suggestedSupplierId:  line.suggestedSupplierId,
            estimatedUnitCost:    line.estimatedUnitCost,
            sourceType:           line.sourceType,
            sourceMoId:           line.sourceMoId,
            status:               'pending',
            notes:                line.notes,
            createdBy:            userId,
            updatedBy:            userId,
          })),
        },
      },
      include: {
        lines: {
          include: {
            item:              { select: { id: true, code: true, name: true } },
            suggestedSupplier: { select: { id: true, code: true, name: true } },
          },
          orderBy: { lineNumber: 'asc' },
        },
      },
    });
  }

  // ── Find All ───────────────────────────────────────────────────────────────

  async findAll(tenantId: string, status?: string) {
    const where: any = { tenantId, deletedAt: null };
    if (status) where.status = status;

    return this.prisma.generalNeed.findMany({
      where,
      include: {
        _count: { select: { lines: true, rfqs: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ── Find One ───────────────────────────────────────────────────────────────

  async findOne(tenantId: string, id: string) {
    const gn = await this.prisma.generalNeed.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: {
        lines: {
          where: { deletedAt: null },
          include: {
            item:              { select: { id: true, code: true, name: true, baseUom: true } },
            suggestedSupplier: { select: { id: true, code: true, name: true } },
            purchaseRequisitionLine: {
              select: { id: true, quantity: true, uom: true },
            },
          },
          orderBy: { lineNumber: 'asc' },
        },
        rfqs: {
          select: { id: true, rfqNumber: true, status: true, issueDate: true },
        },
      },
    });
    if (!gn) throw new NotFoundException(`General Need ${id} not found`);
    return gn;
  }

  // ── Update header ──────────────────────────────────────────────────────────

  async update(tenantId: string, userId: string, id: string, dto: UpdateGeneralNeedDto) {
    const gn = await this.findOne(tenantId, id);
    if (!['draft', 'in_progress'].includes(gn.status)) {
      throw new BadRequestException('Can only update draft or in_progress General Needs');
    }

    const { lines: _lines, ...headerDto } = dto as any;

    return this.prisma.generalNeed.update({
      where: { id },
      data: {
        ...headerDto,
        periodStart: headerDto.periodStart ? new Date(headerDto.periodStart) : undefined,
        periodEnd:   headerDto.periodEnd   ? new Date(headerDto.periodEnd)   : undefined,
        updatedBy: userId,
      },
      include: {
        lines: {
          include: {
            item:              { select: { id: true, code: true, name: true } },
            suggestedSupplier: { select: { id: true, code: true, name: true } },
          },
          orderBy: { lineNumber: 'asc' },
        },
      },
    });
  }

  // ── Update status ──────────────────────────────────────────────────────────

  async updateStatus(tenantId: string, userId: string, id: string, status: string) {
    const gn = await this.findOne(tenantId, id);

    const validTransitions: Record<string, string[]> = {
      draft:       ['in_progress', 'cancelled'],
      in_progress: ['completed', 'cancelled'],
    };

    const allowed = validTransitions[gn.status] ?? [];
    if (!allowed.includes(status)) {
      throw new BadRequestException(
        `Cannot transition from '${gn.status}' to '${status}'. Allowed: ${allowed.join(', ') || 'none'}`,
      );
    }

    const updated = await this.prisma.generalNeed.update({
      where: { id },
      data:  { status, updatedBy: userId },
    });

    return { message: `General Need ${gn.gnNumber} → ${status}`, generalNeed: updated };
  }

  // ── Update a single line ───────────────────────────────────────────────────

  async updateLine(
    tenantId: string,
    userId: string,
    gnId: string,
    lineId: string,
    dto: UpdateGeneralNeedLineDto,
  ) {
    await this.findOne(tenantId, gnId);

    const line = await this.prisma.generalNeedLine.findFirst({
      where: { id: lineId, gnId, tenantId, deletedAt: null },
    });
    if (!line) throw new NotFoundException(`General Need Line ${lineId} not found`);

    return this.prisma.generalNeedLine.update({
      where: { id: lineId },
      data: {
        ...dto,
        requiredDate: dto.requiredDate ? new Date(dto.requiredDate) : undefined,
        updatedBy: userId,
      },
    });
  }

  // ── Convert lines to PR ────────────────────────────────────────────────────
  // Converts selected GN lines into a PurchaseRequisition

  async convertToPr(
    tenantId: string,
    userId: string,
    gnId: string,
    lineIds: string[],
    prTitle: string,
    priority: string = 'normal',
  ) {
    const gn = await this.findOne(tenantId, gnId);

    const lines = await this.prisma.generalNeedLine.findMany({
      where: {
        id:     { in: lineIds },
        gnId,
        tenantId,
        status: 'pending',
        deletedAt: null,
      },
    });

    if (lines.length === 0) {
      throw new BadRequestException('No convertible lines found (must be status: pending)');
    }

    // Generate PR number
    const year     = new Date().getFullYear();
    const prPrefix = `PR-${year}`;
    const lastPr   = await this.prisma.purchaseRequisition.findFirst({
      where:   { tenantId, prNumber: { startsWith: prPrefix } },
      orderBy: { prNumber: 'desc' },
    });
    const prNext = lastPr
      ? (parseInt(lastPr.prNumber.split('-')[2], 10) + 1).toString().padStart(4, '0')
      : '0001';
    const prNumber = `${prPrefix}-${prNext}`;

    // Create PR with lines
    const pr = await this.prisma.purchaseRequisition.create({
      data: {
        tenantId,
        prNumber,
        title:        prTitle,
        requestedBy:  userId,
        priority,
        requiredDate: lines.reduce((latest, l) =>
          l.requiredDate > latest ? l.requiredDate : latest,
          lines[0].requiredDate,
        ),
        source:     'general_need',
        sourceRefId: gnId,
        status:     'draft',
        createdBy:  userId,
        updatedBy:  userId,
        lines: {
          create: lines.map((l, idx) => ({
            tenantId,
            lineNumber:   idx + 1,
            itemId:       l.itemId,
            itemStatus:   l.itemId ? 'catalog' : 'pending_item',
            genericDescription: l.genericDescription,
            quantity:     l.quantity,
            uom:          l.uom,
            unitEstimate: l.estimatedUnitCost,
            requiredDate: l.requiredDate,
            status:       'open',
            createdBy:    userId,
            updatedBy:    userId,
          })),
        },
      },
      include: { lines: true },
    });

    // Mark GN lines as converted and link prLineId
    for (let i = 0; i < lines.length; i++) {
      await this.prisma.generalNeedLine.update({
        where: { id: lines[i].id },
        data: {
          status:   'converted',
          prLineId: pr.lines[i].id,
          updatedBy: userId,
        },
      });
    }

    // If all lines converted → move GN to in_progress
    const remaining = await this.prisma.generalNeedLine.count({
      where: { gnId, tenantId, status: 'pending', deletedAt: null },
    });
    if (remaining === 0) {
      await this.prisma.generalNeed.update({
        where: { id: gnId },
        data:  { status: 'in_progress', updatedBy: userId },
      });
    }

    return { message: `Created PR ${prNumber} from ${lines.length} GN lines`, purchaseRequisition: pr };
  }

  // ── Explode from MOs ───────────────────────────────────────────────────────
  // Auto-generates GN lines from open/confirmed Production Orders

  async explodeFromMos(
    tenantId: string,
    userId: string,
    gnId: string,
    moIds: string[],
  ) {
    const gn = await this.findOne(tenantId, gnId);
    if (!['draft', 'in_progress'].includes(gn.status)) {
      throw new BadRequestException('Can only explode into draft or in_progress General Needs');
    }

    const mos = await this.prisma.productionOrder.findMany({
      where: {
        id:       { in: moIds },
        tenantId,
        status:   { in: ['draft', 'confirmed'] },
        deletedAt: null,
      },
      include: {
        materialActuals: false,
      },
    });

    if (mos.length === 0) throw new NotFoundException('No open Production Orders found');

    // Get last line number
    const lastLine = await this.prisma.generalNeedLine.findFirst({
      where:   { gnId, tenantId, deletedAt: null },
      orderBy: { lineNumber: 'desc' },
    });
    let nextLineNum = (lastLine?.lineNumber ?? 0) + 1;

    const createdLines: any[] = [];

    for (const mo of mos) {
      // Get BOM components if bomId exists
      if (!mo.bomId) continue;

      const bomComponents = await this.prisma.bomComponent.findMany({
        where: { bomId: mo.bomId, deletedAt: null },
        include: {
          componentItem: {
            select: { id: true, code: true, name: true, baseUom: true, defaultSupplierId: true },
          },
        },
      });

      for (const comp of bomComponents) {
        const neededQty = Number(comp.quantityPer) * Number(mo.quantityToProduce);

        // Find preferred supplier for this item
        const preferredSi = await this.prisma.supplierItem.findFirst({
          where: { itemId: comp.componentItemId, tenantId, isPreferred: true, deletedAt: null },
        });

        const line = await this.prisma.generalNeedLine.create({
          data: {
            tenantId,
            gnId,
            lineNumber:         nextLineNum++,
            itemId:             comp.componentItemId,
            quantity:           neededQty,
            uom:                comp.uom,
            requiredDate:       mo.plannedStartDate ?? new Date(gn.periodEnd),
            suggestedSupplierId: preferredSi?.supplierId,
            estimatedUnitCost:  preferredSi?.lastPrice ? Number(preferredSi.lastPrice) : undefined,
            sourceType:         'mo',
            sourceMoId:         mo.id,
            status:             'pending',
            notes:              `Exploded from MO ${mo.poNumber}`,
            createdBy:          userId,
            updatedBy:          userId,
          },
        });

        createdLines.push(line);
      }
    }

    return {
      message: `Created ${createdLines.length} lines from ${mos.length} MOs`,
      linesCreated: createdLines.length,
    };
  }

  // ── Remove ─────────────────────────────────────────────────────────────────

  async remove(tenantId: string, userId: string, id: string) {
    const gn = await this.findOne(tenantId, id);
    if (gn.status !== 'draft') {
      throw new BadRequestException('Can only delete draft General Needs');
    }

    await this.prisma.generalNeed.update({
      where: { id },
      data:  { deletedAt: new Date(), deletedBy: userId },
    });

    return { message: 'General Need deleted successfully', id };
  }
}