import {
  Injectable,
  NotFoundException,
  ConflictException,
  BadRequestException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../database/prisma.service';
import { RfqsService } from '../rfqs/rfqs.service';
import { CreatePurchaseRequisitionDto } from './dto/create-purchase-requisition.dto';
import { UpdatePurchaseRequisitionDto } from './dto/update-purchase-requisition.dto';

@Injectable()
export class PurchaseRequisitionsService {
  constructor(
    private prisma: PrismaService,
    private rfqs: RfqsService,
  ) {}

  // ── Auto-generate PR number ────────────────────────────────────────────────

  // Public shared API (spec-020): GeneralNeedsService injects this for convert-to-pr.
  // Numeric max over findMany; spans soft-deleted rows (spec-012).
  async generatePrNumber(tenantId: string, tx?: Prisma.TransactionClient): Promise<string> {
    const db = tx ?? this.prisma;
    const year = new Date().getFullYear();
    const prefix = `PR-${year}`;
    const existing = await db.purchaseRequisition.findMany({
      where: { tenantId, prNumber: { startsWith: prefix } },
      select: { prNumber: true },
    });
    const max = existing.reduce((m, r) => {
      const parts = r.prNumber.split('-');
      const n = parseInt(parts[parts.length - 1], 10);
      return isNaN(n) ? m : Math.max(m, n);
    }, 0);
    return `${prefix}-${(max + 1).toString().padStart(4, '0')}`;
  }

  // ── Create ─────────────────────────────────────────────────────────────────

  async create(tenantId: string, userId: string, dto: CreatePurchaseRequisitionDto) {
    // Validate catalog items
    for (const line of dto.lines) {
      if (line.itemId) {
        const item = await this.prisma.item.findFirst({
          where: { id: line.itemId, tenantId, deletedAt: null },
        });
        if (!item) throw new NotFoundException(`Item ${line.itemId} not found`);
      }
      if (line.warehouseId) {
        const wh = await this.prisma.warehouse.findFirst({
          where: { id: line.warehouseId, tenantId, deletedAt: null },
        });
        if (!wh) throw new NotFoundException(`Warehouse ${line.warehouseId} not found`);
      }
    }

    const prNumber = await this.generatePrNumber(tenantId);

    try {
      return await this.prisma.purchaseRequisition.create({
        data: {
          tenantId,
          prNumber,
          title: dto.title,
          requestedBy: userId,
          departmentId: dto.departmentId,
          priority: dto.priority ?? 'normal',
          requiredDate: new Date(dto.requiredDate),
          justification: dto.justification,
          source: dto.source ?? 'manual',
          estimatedAmount: dto.estimatedAmount,
          status: 'draft',
          notes: dto.notes,
          createdBy: userId,
          updatedBy: userId,
          lines: {
            create: dto.lines.map((line, index) => ({
              tenantId,
              lineNumber: index + 1,
              itemId: line.itemId,
              itemStatus: line.itemId ? 'catalog' : (line.itemStatus ?? 'pending_item'),
              genericDescription: line.genericDescription,
              genericSpec: line.genericSpec,
              quantity: line.quantity,
              uom: line.uom,
              unitEstimate: line.unitEstimate,
              requiredDate: new Date(line.requiredDate),
              warehouseId: line.warehouseId,
              notes: line.notes,
              createdBy: userId,
              updatedBy: userId,
            })),
          },
        },
        include: this.prInclude(),
      });
    } catch (e) {
      // @@unique([tenantId, prNumber]) can race on concurrent creates.
      if ((e as { code?: string })?.code === 'P2002') {
        throw new ConflictException(
          `PR number ${prNumber} was just taken by a concurrent request. Please retry.`,
        );
      }
      throw e;
    }
  }

  // ── Find All ───────────────────────────────────────────────────────────────

  async findAll(tenantId: string, status?: string, priority?: string) {
    const where: any = { tenantId, deletedAt: null };
    if (status) where.status = status;
    if (priority) where.priority = priority;

    const purchaseRequisitions = await this.prisma.purchaseRequisition.findMany({
      where,
      include: {
        _count: { select: { lines: true, rfqs: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return { purchaseRequisitions, count: purchaseRequisitions.length };
  }

  // ── Find One ───────────────────────────────────────────────────────────────

  async findOne(tenantId: string, id: string) {
    const pr = await this.prisma.purchaseRequisition.findFirst({
      where: { id, tenantId, deletedAt: null },
      include: this.prInclude(),
    });
    if (!pr) throw new NotFoundException(`Purchase Requisition ${id} not found`);
    return pr;
  }

  // ── Update header ──────────────────────────────────────────────────────────

  async update(tenantId: string, userId: string, id: string, dto: UpdatePurchaseRequisitionDto) {
    const pr = await this.findOne(tenantId, id);
    if (!['draft', 'submitted'].includes(pr.status)) {
      throw new BadRequestException('Can only update draft or submitted PRs');
    }

    await this.prisma.purchaseRequisition.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: {
        ...dto,
        requiredDate: dto.requiredDate ? new Date(dto.requiredDate) : undefined,
        updatedBy: userId,
      },
    });

    return this.findOne(tenantId, id);
  }

  // ── Status transitions ─────────────────────────────────────────────────────

  async updateStatus(
    tenantId: string,
    userId: string,
    id: string,
    status: string,
    reason?: string,
  ) {
    const pr = await this.findOne(tenantId, id);

    const validTransitions: Record<string, string[]> = {
      draft: ['submitted', 'cancelled'],
      submitted: ['approved', 'rejected', 'cancelled'],
      approved: ['in_progress', 'cancelled'],
      in_progress: ['completed', 'cancelled'],
      rejected: ['draft'], // allow re-submission after revision
    };

    const allowed = validTransitions[pr.status] ?? [];
    if (!allowed.includes(status)) {
      throw new BadRequestException(
        `Cannot transition from '${pr.status}' to '${status}'. Allowed: ${allowed.join(', ') || 'none'}`,
      );
    }

    const data: any = { status, updatedBy: userId };

    if (status === 'approved') {
      data.approvedBy = userId;
      data.approvedAt = new Date();
    }
    if (status === 'rejected') {
      if (!reason) throw new BadRequestException('Rejection reason is required');
      data.rejectedBy = userId;
      data.rejectedAt = new Date();
      data.rejectionReason = reason;
    }

    await this.prisma.purchaseRequisition.updateMany({
      where: { id, tenantId, deletedAt: null },
      data,
    });

    return {
      message: `PR ${pr.prNumber} → ${status}`,
      purchaseRequisition: await this.findOne(tenantId, id),
    };
  }

  // ── Convert to RFQ ─────────────────────────────────────────────────────────

  async convertToRfq(
    tenantId: string,
    userId: string,
    prId: string,
    lineIds: string[],
    rfqTitle: string,
    supplierIds: string[],
    currency: string = 'USD',
    responseDeadline?: string,
  ) {
    const pr = await this.findOne(tenantId, prId);

    if (!['approved', 'in_progress'].includes(pr.status)) {
      throw new BadRequestException('PR must be approved before converting to RFQ');
    }

    const lines = await this.prisma.purchaseRequisitionLine.findMany({
      where: {
        id: { in: lineIds },
        prId,
        tenantId,
        deletedAt: null,
      },
      include: { item: { select: { id: true, code: true, purchaseUomId: true } } },
    });

    if (lines.length === 0) {
      throw new BadRequestException('No valid lines found');
    }

    // Validate suppliers
    for (const supplierId of supplierIds) {
      const supplier = await this.prisma.supplier.findFirst({
        where: { id: supplierId, tenantId, deletedAt: null },
      });
      if (!supplier) throw new NotFoundException(`Supplier ${supplierId} not found`);
    }

    // Atomic: RFQ + supplier invites + lines + PR status commit together.
    // The RFQ number comes from the owning module's shared tx-aware generator.
    let rfq: any;
    let rfqNumber = '';
    try {
      await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        rfqNumber = await this.rfqs.generateRfqNumber(tenantId, tx);

        rfq = await tx.rfq.create({
          data: {
            tenantId,
            rfqNumber,
            title: rfqTitle,
            currency,
            responseDeadline: responseDeadline ? new Date(responseDeadline) : null,
            prId,
            status: 'draft',
            createdBy: userId,
            updatedBy: userId,
            rfqSuppliers: {
              create: supplierIds.map((supplierId) => ({
                tenantId,
                supplierId,
                status: 'invited',
                createdBy: userId,
                updatedBy: userId,
              })),
            },
            lines: {
              create: lines.map((l, idx) => ({
                tenantId,
                lineNumber: idx + 1,
                itemId: l.itemId,
                genericDescription: l.genericDescription,
                quantity: Number(l.quantity),
                uom: l.uom,
                requiredDate: l.requiredDate,
                prLineId: l.id,
                status: 'open',
                createdBy: userId,
                updatedBy: userId,
              })),
            },
          },
          include: { lines: true, rfqSuppliers: true },
        });

        // PR moves to in_progress along the existing approved → in_progress map
        // edge (no second status authority); already-in_progress PRs stay put.
        if (pr.status === 'approved') {
          await tx.purchaseRequisition.updateMany({
            where: { id: prId, tenantId, deletedAt: null },
            data: { status: 'in_progress', updatedBy: userId },
          });
        }
      });
    } catch (e) {
      if ((e as { code?: string })?.code === 'P2002') {
        throw new ConflictException(
          'An RFQ number was just taken by a concurrent request. Please retry.',
        );
      }
      throw e;
    }

    return {
      message: `RFQ ${rfqNumber} created from PR ${pr.prNumber}`,
      rfq,
    };
  }

  // ── Remove ─────────────────────────────────────────────────────────────────

  async remove(tenantId: string, userId: string, id: string) {
    const pr = await this.findOne(tenantId, id);
    if (pr.status !== 'draft') {
      throw new BadRequestException('Can only delete draft PRs');
    }

    await this.prisma.purchaseRequisition.updateMany({
      where: { id, tenantId, deletedAt: null },
      data: { deletedAt: new Date(), deletedBy: userId },
    });

    return { message: 'Purchase Requisition deleted successfully', id };
  }

  // ── Private include helper ─────────────────────────────────────────────────

  private prInclude() {
    return {
      lines: {
        where: { deletedAt: null },
        include: {
          item: { select: { id: true, code: true, name: true, baseUom: true } },
          warehouse: { select: { id: true, code: true, name: true } },
        },
        orderBy: { lineNumber: 'asc' as const },
      },
      rfqs: {
        select: { id: true, rfqNumber: true, status: true, issueDate: true },
      },
      _count: { select: { lines: true, rfqs: true } },
    };
  }
}
