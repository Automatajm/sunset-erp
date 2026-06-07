'use client';

// ============================================================================
// FILE: frontend/components/print/documents.tsx
// spec-frontend-005 — the 6 printable documents, each a thin composition of
// <DocumentLayout> + <LinesTable>. Registry maps a doc key → { title, fetch,
// render } so the /print/[doc]/[id] route stays dumb.
// ============================================================================
import React from 'react';
import { DocumentLayout, LinesTable, DocLine } from './DocumentLayout';
import { purchaseOrdersApi } from '@/lib/api/purchase-orders';
import { salesOrdersApi } from '@/lib/api/sales-orders';
import { arInvoicesApi } from '@/lib/api/ar-invoices';
import { apInvoicesApi } from '@/lib/api/ap-invoices';
import { goodsReceiptsApi } from '@/lib/api/goods-receipts';
import { stockTransactionsApi } from '@/lib/api/stock-transactions';
import { rfqsApi } from '@/lib/api/rfqs';
import { productionOrdersApi } from '@/lib/api/production-orders';
import apiClient from '@/lib/api/client';

const lineFrom = (l: any, qtyKey: string, priceKey?: string): DocLine => ({
  code: l.item?.code ?? null,
  description: l.description ?? l.item?.name ?? null,
  quantity: l[qtyKey],
  uom: l.uom ?? l.item?.baseUom ?? null,
  unitPrice: priceKey ? l[priceKey] : null,
  lineTotal: l.lineTotal ?? null,
});

// spec-frontend-006 — shared cell styles for the custom (fill-in) tables.
const TH: React.CSSProperties = { textAlign: 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#888', borderBottom: '1.5px solid #333', padding: '7px 8px' };
const TD: React.CSSProperties = { fontSize: 11, color: '#222', borderBottom: '0.5px solid #eee', padding: '7px 8px', verticalAlign: 'top' };
const THR: React.CSSProperties = { ...TH, textAlign: 'right' };
const TDR: React.CSSProperties = { ...TD, textAlign: 'right', whiteSpace: 'nowrap' };
// Blank fill-in cell — bordered so it reads as "write here" on paper.
const BLANK: React.CSSProperties = { ...TD, border: '0.5px solid #ccc', minWidth: 60 };

const fmtD = (s: string | null | undefined) =>
  s ? new Date(s).toLocaleDateString('en-US') : '—';
const fmtQ = (v: unknown, dec = 3) =>
  Number(v ?? 0).toLocaleString('en-US', { maximumFractionDigits: dec });

export interface PrintDoc {
  title: string;
  fetch: (id: string, query: URLSearchParams) => Promise<any>;
  render: (data: any, query: URLSearchParams) => React.ReactNode;
}

export const PRINT_DOCS: Record<string, PrintDoc> = {
  'purchase-order': {
    title: 'Purchase Order',
    fetch: (id) => purchaseOrdersApi.getById(id),
    render: (po) => (
      <DocumentLayout
        title="Purchase Order" number={po.poNumber} date={po.poDate} status={po.status}
        currency={po.currency}
        party={{ label: 'Supplier', name: po.supplier?.name ?? '—', lines: [po.supplier?.code, po.supplier?.email, po.supplier?.phone] }}
        meta={[
          { label: 'Expected Date', value: po.expectedDate ? new Date(po.expectedDate).toLocaleDateString('en-US') : '—' },
          { label: 'Payment Terms', value: po.paymentTerms ?? '—' },
          { label: 'Currency', value: po.currency ?? '—' },
        ]}
        terms={po.paymentTerms} footerNote={po.notes}
      >
        <LinesTable currency={po.currency} totals={{ subtotal: po.subtotal, tax: po.taxAmount, total: po.total }}
          lines={(po.lines ?? []).map((l: any) => lineFrom(l, 'orderedQuantity', 'unitPrice'))} />
      </DocumentLayout>
    ),
  },

  'sales-order': {
    title: 'Sales Order',
    fetch: (id) => salesOrdersApi.getById(id),
    render: (so) => (
      <DocumentLayout
        title="Sales Order" number={so.soNumber} date={so.orderDate} status={so.status}
        currency={so.currency}
        party={{ label: 'Customer', name: so.customer?.name ?? '—', lines: [so.customer?.code, so.customer?.email, so.customer?.phone] }}
        meta={[
          { label: 'Order Date', value: so.orderDate ? new Date(so.orderDate).toLocaleDateString('en-US') : '—' },
          { label: 'Currency', value: so.currency ?? '—' },
        ]}
        footerNote={so.notes}
      >
        <LinesTable currency={so.currency} totals={{ subtotal: so.subtotal, tax: so.taxAmount, total: so.total }}
          lines={(so.lines ?? []).map((l: any) => lineFrom(l, 'orderedQuantity', 'unitPrice'))} />
      </DocumentLayout>
    ),
  },

  'ar-invoice': {
    title: 'Invoice',
    fetch: (id) => arInvoicesApi.getById(id),
    render: (inv) => (
      <DocumentLayout
        title="Customer Invoice" number={inv.invoiceNumber} date={inv.invoiceDate} status={inv.status}
        currency={inv.currency}
        party={{ label: 'Bill To', name: inv.customer?.name ?? '—', lines: [inv.customer?.code, inv.customer?.email] }}
        meta={[
          { label: 'Invoice Date', value: inv.invoiceDate ? new Date(inv.invoiceDate).toLocaleDateString('en-US') : '—' },
          { label: 'Due Date', value: inv.dueDate ? new Date(inv.dueDate).toLocaleDateString('en-US') : '—' },
          { label: 'Currency', value: inv.currency ?? '—' },
          { label: 'Paid', value: Number(inv.paidAmount ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 }) },
        ]}
        footerNote={inv.notes}
      >
        <LinesTable currency={inv.currency} totals={{ subtotal: inv.subtotal, tax: inv.taxAmount, total: inv.totalAmount }}
          lines={(inv.lines ?? []).map((l: any) => lineFrom(l, 'quantity', 'unitPrice'))} />
      </DocumentLayout>
    ),
  },

  'ap-invoice': {
    title: 'Payable',
    fetch: (id) => apInvoicesApi.getById(id),
    render: (inv) => (
      <DocumentLayout
        title="Supplier Invoice (AP)" number={inv.invoiceNumber} date={inv.invoiceDate} status={inv.status}
        currency={inv.currency}
        party={{ label: 'Supplier', name: inv.supplier?.name ?? '—', lines: [inv.supplier?.code, inv.supplierRef ? `Ref: ${inv.supplierRef}` : null] }}
        meta={[
          { label: 'Invoice Date', value: inv.invoiceDate ? new Date(inv.invoiceDate).toLocaleDateString('en-US') : '—' },
          { label: 'Due Date', value: inv.dueDate ? new Date(inv.dueDate).toLocaleDateString('en-US') : '—' },
          { label: 'Currency', value: inv.currency ?? '—' },
          { label: 'Paid', value: Number(inv.paidAmount ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2 }) },
        ]}
        footerNote={inv.notes}
      >
        <LinesTable currency={inv.currency} totals={{ subtotal: inv.subtotal, tax: inv.taxAmount, total: inv.totalAmount }}
          lines={(inv.lines ?? []).map((l: any) => lineFrom(l, 'quantity', 'unitPrice'))} />
      </DocumentLayout>
    ),
  },

  'goods-receipt': {
    title: 'Goods Receipt',
    fetch: (id) => goodsReceiptsApi.getById(id),
    render: (grn) => (
      <DocumentLayout
        title="Goods Receipt Note" number={grn.grnNumber} date={grn.receivedDate} status={grn.status}
        party={{ label: 'Supplier', name: grn.supplierName ?? grn.supplier?.name ?? '—', lines: [grn.poNumber ? `PO: ${grn.poNumber}` : null, grn.warehouseName ? `Warehouse: ${grn.warehouseName}` : null] }}
        meta={[
          { label: 'Received Date', value: grn.receivedDate ? new Date(grn.receivedDate).toLocaleDateString('en-US') : '—' },
          { label: 'Condition', value: grn.condition ?? '—' },
          { label: 'Warehouse', value: grn.warehouseCode ?? '—' },
        ]}
        footerNote={grn.notes}
      >
        <LinesTable
          lines={(grn.lines ?? []).map((l: any) => ({
            code: l.item?.code ?? null,
            description: l.notes ?? l.item?.name ?? null,
            quantity: l.receivedQuantity,
            uom: l.uom ?? null,
            unitPrice: l.unitCost ?? null,
            lineTotal: l.unitCost != null ? Number(l.receivedQuantity) * Number(l.unitCost) : null,
          }))}
        />
      </DocumentLayout>
    ),
  },

  'stock-movements': {
    title: 'Stock Movement Report',
    fetch: (_id, q) =>
      stockTransactionsApi.getLedger({
        warehouseId: q.get('warehouseId') ?? undefined,
        itemId: q.get('itemId') ?? undefined,
        dateFrom: q.get('from') ?? undefined,
        dateTo: q.get('to') ?? undefined,
      } as any),
    render: (data, q) => {
      const rows: any[] = Array.isArray(data) ? data : (data?.movements ?? data?.ledger ?? data?.rows ?? []);
      const from = q.get('from'); const to = q.get('to');
      return (
        <DocumentLayout
          title="Stock Movement Report"
          number={`LEDGER-${(to ?? new Date().toISOString().slice(0, 10))}`}
          date={new Date().toISOString()}
          party={{ label: 'Period', name: `${from ?? 'start'} → ${to ?? 'today'}`, lines: [q.get('warehouseId') ? `Warehouse filter applied` : 'All warehouses'] }}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                {['Date', 'Movement #', 'Type', 'Item', 'Qty', 'UOM'].map((h, i) => (
                  <th key={i} style={{ textAlign: i >= 4 ? 'right' : 'left', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: '#888', borderBottom: '1.5px solid #333', padding: '7px 8px' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((m: any, i: number) => (
                <tr key={i}>
                  <td style={{ fontSize: 11, padding: '6px 8px', borderBottom: '0.5px solid #eee' }}>{m.movementDate ? new Date(m.movementDate).toLocaleDateString('en-US') : '—'}</td>
                  <td style={{ fontSize: 11, padding: '6px 8px', borderBottom: '0.5px solid #eee' }}>{m.movementNumber ?? '—'}</td>
                  <td style={{ fontSize: 11, padding: '6px 8px', borderBottom: '0.5px solid #eee' }}>{m.movementType ?? '—'}</td>
                  <td style={{ fontSize: 11, padding: '6px 8px', borderBottom: '0.5px solid #eee' }}>{m.item?.code ?? m.itemCode ?? '—'} {m.item?.name ?? m.itemName ?? ''}</td>
                  <td style={{ fontSize: 11, padding: '6px 8px', borderBottom: '0.5px solid #eee', textAlign: 'right' }}>{Number(m.quantity ?? 0).toLocaleString('en-US')}</td>
                  <td style={{ fontSize: 11, padding: '6px 8px', borderBottom: '0.5px solid #eee', textAlign: 'right' }}>{m.uom ?? '—'}</td>
                </tr>
              ))}
              {rows.length === 0 && <tr><td colSpan={6} style={{ textAlign: 'center', color: '#999', padding: 16, fontSize: 11 }}>No movements in range</td></tr>}
            </tbody>
          </table>
        </DocumentLayout>
      );
    },
  },

  // ── spec-frontend-006 — round 2 ─────────────────────────────────────────────

  rfq: {
    title: 'Request for Quotation',
    fetch: (id) => rfqsApi.getById(id),
    render: (rfq, q) => {
      // ?rfqSupplierId= addresses the printout to one invited supplier.
      const addressee = (rfq.rfqSuppliers ?? []).find((s: any) => s.id === q.get('rfqSupplierId'));
      const source = rfq.purchaseRequisition?.prNumber
        ? `PR: ${rfq.purchaseRequisition.prNumber}`
        : rfq.generalNeed?.gnNumber ? `GN: ${rfq.generalNeed.gnNumber}` : null;
      return (
        <DocumentLayout
          title="Request for Quotation" number={rfq.rfqNumber} date={rfq.issueDate} status={rfq.status}
          currency={rfq.currency}
          party={addressee
            ? { label: 'Supplier', name: addressee.supplier?.name ?? '—', lines: [addressee.supplier?.code, addressee.supplier?.contactName, addressee.supplier?.contactEmail] }
            : { label: 'Subject', name: rfq.title ?? '—', lines: [source] }}
          meta={[
            { label: 'Issue Date', value: fmtD(rfq.issueDate) },
            { label: 'Response Deadline', value: fmtD(rfq.responseDeadline) },
            { label: 'Currency', value: rfq.currency ?? '—' },
            ...(addressee && source ? [{ label: 'Source', value: source }] : []),
          ]}
          footerNote={rfq.notes}
        >
          <p style={{ fontSize: 11, color: '#555', margin: '0 0 10px' }}>
            Please quote your best unit price and lead time for the items below and return this
            document by the response deadline.
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...TH, width: 32 }}>#</th>
                <th style={TH}>Item</th>
                <th style={THR}>Qty</th>
                <th style={{ ...TH, width: 60 }}>UOM</th>
                <th style={TH}>Required</th>
                <th style={{ ...THR, width: 90 }}>Unit Price</th>
                <th style={{ ...TH, width: 80 }}>Lead Time</th>
                <th style={{ ...TH, width: 110 }}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {(rfq.lines ?? []).map((l: any, i: number) => (
                <tr key={l.id ?? i}>
                  <td style={TD}>{l.lineNumber ?? i + 1}</td>
                  <td style={TD}>
                    {l.item?.code && <span style={{ fontWeight: 600, color: '#111' }}>{l.item.code}</span>}
                    {l.item?.code ? ' — ' : ''}{l.item?.name ?? l.genericDescription ?? '—'}
                  </td>
                  <td style={TDR}>{fmtQ(l.quantity)}</td>
                  <td style={TD}>{l.uom ?? '—'}</td>
                  <td style={TD}>{fmtD(l.requiredDate)}</td>
                  <td style={BLANK} />
                  <td style={BLANK} />
                  <td style={BLANK} />
                </tr>
              ))}
              {(rfq.lines ?? []).length === 0 && (
                <tr><td style={{ ...TD, textAlign: 'center', color: '#999' }} colSpan={8}>No line items</td></tr>
              )}
            </tbody>
          </table>
        </DocumentLayout>
      );
    },
  },

  'production-order': {
    title: 'Production Order',
    fetch: (id) => productionOrdersApi.getById(id),
    render: (mo) => {
      const qty = Number(mo.quantityToProduce ?? 0);
      const components = (mo.bom?.components ?? []).filter((c: any) => !c.isPhantom);
      return (
        <DocumentLayout
          title="Production Order Traveler" number={mo.poNumber} date={mo.plannedStartDate} status={mo.status}
          party={{
            label: 'Product',
            name: mo.bom?.parentItem ? `${mo.bom.parentItem.code ?? ''} — ${mo.bom.parentItem.name ?? ''}` : '—',
            lines: [mo.bom?.bomNumber ? `BOM: ${mo.bom.bomNumber} v${mo.bom.version ?? 1}` : null],
          }}
          meta={[
            { label: 'Quantity to Produce', value: fmtQ(qty) },
            { label: 'Priority', value: mo.priority ?? '—' },
            { label: 'Planned Start', value: fmtD(mo.plannedStartDate) },
            { label: 'Planned End', value: fmtD(mo.plannedEndDate) },
          ]}
          footerNote={mo.notes}
          signatures={['Prepared by', 'Produced by', 'Quality Control']}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...TH, width: 32 }}>#</th>
                <th style={TH}>Component</th>
                <th style={THR}>Qty Per</th>
                <th style={{ ...TH, width: 60 }}>UOM</th>
                <th style={THR}>Scrap %</th>
                <th style={THR}>Total Required</th>
                <th style={{ ...THR, width: 90 }}>Issued Qty</th>
                <th style={{ ...TH, width: 100 }}>Issued By</th>
              </tr>
            </thead>
            <tbody>
              {components.map((c: any, i: number) => {
                const scrap = Number(c.scrapPercent ?? 0);
                const required = Number(c.quantityPer ?? 0) * qty * (1 + scrap / 100);
                return (
                  <tr key={c.id ?? i}>
                    <td style={TD}>{c.lineNumber ?? i + 1}</td>
                    <td style={TD}>
                      {c.consumptionGroup?.code && <span style={{ fontWeight: 600, color: '#111' }}>{c.consumptionGroup.code}</span>}
                      {c.consumptionGroup?.code ? ' — ' : ''}{c.consumptionGroup?.name ?? '—'}
                    </td>
                    <td style={TDR}>{fmtQ(c.quantityPer)}</td>
                    <td style={TD}>{c.uom ?? '—'}</td>
                    <td style={TDR}>{fmtQ(scrap, 2)}</td>
                    <td style={{ ...TDR, fontWeight: 600 }}>{fmtQ(required)}</td>
                    <td style={BLANK} />
                    <td style={BLANK} />
                  </tr>
                );
              })}
              {components.length === 0 && (
                <tr><td style={{ ...TD, textAlign: 'center', color: '#999' }} colSpan={8}>No components on BOM</td></tr>
              )}
            </tbody>
          </table>
        </DocumentLayout>
      );
    },
  },

  'stock-count': {
    title: 'Stock Count Sheet',
    fetch: async (id) => {
      const res = await apiClient.get(`/stock-reconciliation/${id}`);
      return res.data;
    },
    render: (session, q) => {
      // Blind by default (counter must not see the expected qty); ?blind=0 shows it.
      const blind = q.get('blind') !== '0';
      return (
        <DocumentLayout
          title={blind ? 'Stock Count Sheet' : 'Stock Count Sheet (with system quantities)'}
          number={session.sessionNumber} date={session.countDate} status={session.status}
          party={{
            label: 'Warehouse',
            name: session.warehouse ? `${session.warehouse.code} — ${session.warehouse.name}` : '—',
            lines: [session.description],
          }}
          meta={[
            { label: 'Count Date', value: fmtD(session.countDate) },
            { label: 'Lines', value: (session.lines ?? []).length },
          ]}
          footerNote={session.notes}
          signatures={['Counted by', 'Verified by']}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...TH, width: 32 }}>#</th>
                <th style={TH}>Item</th>
                <th style={{ ...TH, width: 60 }}>UOM</th>
                {!blind && <th style={THR}>System Qty</th>}
                <th style={{ ...THR, width: 100 }}>Counted Qty</th>
                <th style={{ ...TH, width: 130 }}>Notes</th>
              </tr>
            </thead>
            <tbody>
              {(session.lines ?? []).map((l: any, i: number) => (
                <tr key={l.id ?? i}>
                  <td style={TD}>{i + 1}</td>
                  <td style={TD}>
                    {l.item?.code && <span style={{ fontWeight: 600, color: '#111' }}>{l.item.code}</span>}
                    {l.item?.code ? ' — ' : ''}{l.item?.name ?? '—'}
                  </td>
                  <td style={TD}>{l.storageUom ?? '—'}</td>
                  {!blind && <td style={TDR}>{fmtQ(l.systemStorageQty)}</td>}
                  <td style={BLANK} />
                  <td style={BLANK} />
                </tr>
              ))}
              {(session.lines ?? []).length === 0 && (
                <tr><td style={{ ...TD, textAlign: 'center', color: '#999' }} colSpan={blind ? 5 : 6}>No lines in this session</td></tr>
              )}
            </tbody>
          </table>
        </DocumentLayout>
      );
    },
  },
};
