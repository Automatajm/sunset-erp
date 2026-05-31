import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../database/prisma.service';
import { CreatePurchaseRequisitionDto } from './dto/create-purchase-requisition.dto';
import { UpdatePurchaseRequisitionDto } from './dto/update-purchase-requisition.dto';

@Injectable()
export class PurchaseRequisitionsService {
  constructor(private prisma: PrismaService) {}

  // ── Auto-generate PR number ────────────────────────────────────────────────

  private async generatePrNumber(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `PR-${year}`;
    const last = await this.prisma.purchaseRequisition.findFirst({
      where: { tenantId, prNumber: { startsWith: prefix } },
      orderBy: { prNumber: 'desc' },
    });
    if (!last) return `${prefix}-0001`;
    const parts = last.prNumber.split('-');
    const lastNum = parseInt(parts[parts.length - 1], 10);
    const nextNum = isNaN(lastNum) ? 1 : lastNum + 1;
    return `${prefix}-${nextNum.toString().padStart(4, '0')}`;
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

    return this.prisma.purchaseRequisition.create({
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
  }

  // ── Find All ───────────────────────────────────────────────────────────────

  async findAll(tenantId: string, status?: string, priority?: string) {
    const where: any = { tenantId, deletedAt: null };
    if (status) where.status = status;
    if (priority) where.priority = priority;

    return this.prisma.purchaseRequisition.findMany({
      where,
      include: {
        _count: { select: { lines: true, rfqs: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
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

    return this.prisma.purchaseRequisition.update({
      where: { id },
      data: {
        ...dto,
        requiredDate: dto.requiredDate ? new Date(dto.requiredDate) : undefined,
        updatedBy: userId,
      },
      include: this.prInclude(),
    });
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

    const updated = await this.prisma.purchaseRequisition.update({
      where: { id },
      data,
    });

    return { message: `PR ${pr.prNumber} → ${status}`, purchaseRequisition: updated };
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

    // Generate RFQ number
    const year = new Date().getFullYear();
    const rfqPrefix = `RFQ-${year}`;
    const lastRfq = await this.prisma.rfq.findFirst({
      where: { tenantId, rfqNumber: { startsWith: rfqPrefix } },
      orderBy: { rfqNumber: 'desc' },
    });
    const rfqNext = lastRfq
      ? (parseInt(lastRfq.rfqNumber.split('-')[2], 10) + 1).toString().padStart(4, '0')
      : '0001';
    const rfqNumber = `${rfqPrefix}-${rfqNext}`;

    const rfq = await this.prisma.rfq.create({
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

    // Update PR status to in_progress
    await this.prisma.purchaseRequisition.update({
      where: { id: prId },
      data: { status: 'in_progress', updatedBy: userId },
    });

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

    await this.prisma.purchaseRequisition.update({
      where: { id },
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
