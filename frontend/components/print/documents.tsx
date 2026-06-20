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
import { purchaseRequisitionsApi } from '@/lib/api/purchase-requisitions';
import { journalEntriesApi } from '@/lib/api/journal-entries';
import { bomApi } from '@/lib/api/bom';
import { customersApi } from '@/lib/api/customers';
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

  // ── spec-frontend-007 — round 3 ─────────────────────────────────────────────

  'purchase-requisition': {
    title: 'Purchase Requisition',
    fetch: (id) => purchaseRequisitionsApi.getById(id),
    render: (pr) => (
      <DocumentLayout
        title="Purchase Requisition" number={pr.prNumber} date={pr.requiredDate} status={pr.status}
        party={{ label: 'Request', name: pr.title ?? '—', lines: [pr.departmentId ? `Department: ${pr.departmentId}` : null, pr.source ? `Source: ${pr.source}` : null] }}
        meta={[
          { label: 'Required Date', value: fmtD(pr.requiredDate) },
          { label: 'Priority', value: pr.priority ?? '—' },
          { label: 'Estimated Amount', value: pr.estimatedAmount != null ? Number(pr.estimatedAmount).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—' },
        ]}
        footerNote={[
          pr.justification ? `Justification: ${pr.justification}` : null,
          pr.status === 'rejected' && pr.rejectionReason ? `Rejection reason: ${pr.rejectionReason}` : null,
        ].filter(Boolean).join(' — ') || null}
        signatures={['Requested by', 'Approved by']}
      >
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>
              <th style={{ ...TH, width: 32 }}>#</th>
              <th style={TH}>Item</th>
              <th style={THR}>Qty</th>
              <th style={{ ...TH, width: 60 }}>UOM</th>
              <th style={THR}>Unit Est.</th>
              <th style={THR}>Line Est.</th>
              <th style={{ ...TH, width: 90 }}>Warehouse</th>
            </tr>
          </thead>
          <tbody>
            {(pr.lines ?? []).map((l: any, i: number) => {
              const lineEst = l.unitEstimate != null ? Number(l.quantity) * Number(l.unitEstimate) : null;
              return (
                <tr key={l.id ?? i}>
                  <td style={TD}>{l.lineNumber ?? i + 1}</td>
                  <td style={TD}>
                    {l.item?.code
                      ? <><span style={{ fontWeight: 600, color: '#111' }}>{l.item.code}</span> — {l.item.name}</>
                      : <>{l.genericDescription ?? '—'}{l.itemStatus && l.itemStatus !== 'catalog' ? <span style={{ fontSize: 9, color: '#888' }}> ({l.itemStatus})</span> : null}</>}
                  </td>
                  <td style={TDR}>{fmtQ(l.quantity)}</td>
                  <td style={TD}>{l.uom ?? '—'}</td>
                  <td style={TDR}>{l.unitEstimate != null ? Number(l.unitEstimate).toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'}</td>
                  <td style={TDR}>{lineEst != null ? lineEst.toLocaleString('en-US', { minimumFractionDigits: 2 }) : '—'}</td>
                  <td style={TD}>{l.warehouse?.code ?? '—'}</td>
                </tr>
              );
            })}
            {(pr.lines ?? []).length === 0 && (
              <tr><td style={{ ...TD, textAlign: 'center', color: '#999' }} colSpan={7}>No line items</td></tr>
            )}
          </tbody>
        </table>
      </DocumentLayout>
    ),
  },

  'journal-entry': {
    title: 'Journal Entry Voucher',
    fetch: (id) => journalEntriesApi.getById(id),
    render: (je: any) => {
      const lines: any[] = je.lines ?? [];
      const totDebit = lines.reduce((s, l) => s + Number(l.debitAmount ?? 0), 0);
      const totCredit = lines.reduce((s, l) => s + Number(l.creditAmount ?? 0), 0);
      const money2 = (v: number) => v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const fiscal = typeof je.fiscalPeriod === 'string' ? je.fiscalPeriod : je.fiscalPeriod?.name ?? null;
      return (
        <DocumentLayout
          title="Journal Entry Voucher" number={je.entryNumber} date={je.entryDate} status={je.status}
          party={{ label: 'Description', name: je.description ?? '—', lines: [je.reference ? `Ref: ${je.reference}` : null] }}
          meta={[
            { label: 'Entry Date', value: fmtD(je.entryDate) },
            { label: 'Posting Date', value: fmtD(je.postingDate) },
            { label: 'Journal Type', value: je.journalType ?? '—' },
            ...(fiscal ? [{ label: 'Fiscal Period', value: fiscal }] : []),
          ]}
          signatures={['Prepared by', 'Approved by']}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...TH, width: 32 }}>#</th>
                <th style={{ ...TH, width: 90 }}>Account</th>
                <th style={TH}>Account Name / Description</th>
                <th style={{ ...THR, width: 100 }}>Debit</th>
                <th style={{ ...THR, width: 100 }}>Credit</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l: any, i: number) => {
                const fx = l.currency && Number(l.exchangeRate ?? 1) !== 1;
                return (
                  <tr key={l.id ?? i}>
                    <td style={TD}>{l.lineNumber ?? i + 1}</td>
                    <td style={{ ...TD, fontWeight: 600, color: '#111', whiteSpace: 'nowrap' }}>{l.account?.accountNumber ?? '—'}</td>
                    <td style={TD}>
                      {l.account?.name ?? '—'}
                      {l.description && <div style={{ fontSize: 10, color: '#777' }}>{l.description}</div>}
                      {fx && <div style={{ fontSize: 9, color: '#999' }}>{l.currency} @ {Number(l.exchangeRate)}</div>}
                    </td>
                    <td style={TDR}>{Number(l.debitAmount ?? 0) !== 0 ? money2(Number(l.debitAmount)) : ''}</td>
                    <td style={TDR}>{Number(l.creditAmount ?? 0) !== 0 ? money2(Number(l.creditAmount)) : ''}</td>
                  </tr>
                );
              })}
              {lines.length === 0 && (
                <tr><td style={{ ...TD, textAlign: 'center', color: '#999' }} colSpan={5}>No lines</td></tr>
              )}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={2} />
                <td style={{ ...TDR, fontWeight: 700, color: '#111', borderTop: '1.5px solid #333', textAlign: 'right' }}>Totals</td>
                <td style={{ ...TDR, fontWeight: 700, color: '#111', borderTop: '1.5px solid #333' }}>{money2(totDebit)}</td>
                <td style={{ ...TDR, fontWeight: 700, color: '#111', borderTop: '1.5px solid #333' }}>{money2(totCredit)}</td>
              </tr>
            </tfoot>
          </table>
        </DocumentLayout>
      );
    },
  },

  'ar-receipt': {
    title: 'Payment Receipt',
    fetch: (id) => arInvoicesApi.getById(id),
    render: (inv: any, q) => {
      // :id is the INVOICE; ?paymentId= selects the embedded payment (there is
      // no standalone payment endpoint). Missing/unknown id → explicit error.
      const payment = (inv.payments ?? []).find((p: any) => p.id === q.get('paymentId'));
      if (!payment) {
        return (
          <div style={{ padding: 40, textAlign: 'center', fontFamily: "'IBM Plex Sans',sans-serif" }}>
            <div style={{ fontSize: 15, fontWeight: 600, color: '#111' }}>Payment not found</div>
            <div style={{ fontSize: 12, color: '#666', marginTop: 8 }}>
              This receipt route needs a valid <code>?paymentId=</code> belonging to invoice {inv.invoiceNumber}.
            </div>
          </div>
        );
      }
      const balanceDue = Number(inv.totalAmount ?? 0) - Number(inv.paidAmount ?? 0);
      const crossCurrency = inv.currency && payment.baseCurrency && inv.currency !== payment.baseCurrency;
      const money2 = (v: unknown) => Number(v ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      return (
        <DocumentLayout
          title="Payment Receipt" number={payment.paymentNumber} date={payment.paymentDate} status="received"
          currency={inv.currency}
          party={{ label: 'Received From', name: inv.customer?.name ?? '—', lines: [inv.customer?.code, inv.customer?.email] }}
          meta={[
            { label: 'Payment Date', value: fmtD(payment.paymentDate) },
            { label: 'Method', value: payment.paymentMethod ?? '—' },
            { label: 'Invoice', value: inv.invoiceNumber },
            ...(payment.reference ? [{ label: 'Reference', value: payment.reference }] : []),
          ]}
          footerNote={payment.notes}
          signatures={['Received by', 'Customer']}
        >
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              <tr>
                <td style={{ ...TD, color: '#888' }}>Amount received</td>
                <td style={{ ...TDR, fontSize: 16, fontWeight: 700, color: 'var(--accent-pressed)' }}>{inv.currency ? inv.currency + ' ' : ''}{money2(payment.amount)}</td>
              </tr>
              {crossCurrency && (
                <tr>
                  <td style={{ ...TD, color: '#888' }}>Equivalent ({payment.baseCurrency}, rate {Number(payment.exchangeRate)})</td>
                  <td style={TDR}>{payment.baseCurrency} {money2(payment.amountBase)}</td>
                </tr>
              )}
              <tr>
                <td style={{ ...TD, color: '#888' }}>Invoice total</td>
                <td style={TDR}>{money2(inv.totalAmount)}</td>
              </tr>
              <tr>
                <td style={{ ...TD, color: '#888' }}>Paid to date</td>
                <td style={TDR}>{money2(inv.paidAmount)}</td>
              </tr>
              <tr>
                <td style={{ ...TD, fontWeight: 700, color: '#111', borderTop: '1.5px solid #333' }}>Balance due</td>
                <td style={{ ...TDR, fontWeight: 700, color: balanceDue > 0 ? '#111' : '#1a7f37', borderTop: '1.5px solid #333' }}>{money2(balanceDue)}</td>
              </tr>
            </tbody>
          </table>
        </DocumentLayout>
      );
    },
  },

  // ── spec-frontend-008 — round 4 ─────────────────────────────────────────────

  bom: {
    title: 'BOM Recipe Card',
    fetch: (id) => bomApi.getById(id),
    render: (bom: any) => {
      const components = (bom.components ?? []).filter((c: any) => !c.isPhantom);
      const routings = (bom.routings ?? []).filter((r: any) => r.isActive !== false);
      return (
        <DocumentLayout
          title="BOM Recipe Card" number={bom.bomNumber} date={bom.effectiveFrom ?? bom.createdAt}
          status={bom.isActive ? 'active' : 'inactive'}
          party={{
            label: 'Product',
            name: bom.parentItem ? `${bom.parentItem.code ?? ''} — ${bom.parentItem.name ?? ''}` : '—',
            lines: [
              bom.effectiveFrom ? `Effective from: ${fmtD(bom.effectiveFrom)}` : null,
              bom.effectiveTo ? `Effective to: ${fmtD(bom.effectiveTo)}` : null,
            ],
          }}
          meta={[
            { label: 'Components', value: components.length },
            { label: 'Routing Steps', value: routings.length },
          ]}
        >
          <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#888', margin: '0 0 6px' }}>Components (per unit)</div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...TH, width: 32 }}>#</th>
                <th style={TH}>Component</th>
                <th style={THR}>Qty Per Unit</th>
                <th style={{ ...TH, width: 70 }}>UOM</th>
                <th style={THR}>Scrap %</th>
              </tr>
            </thead>
            <tbody>
              {components.map((c: any, i: number) => (
                <tr key={c.id ?? i}>
                  <td style={TD}>{c.lineNumber ?? i + 1}</td>
                  <td style={TD}>
                    {c.consumptionGroup?.code && <span style={{ fontWeight: 600, color: '#111' }}>{c.consumptionGroup.code}</span>}
                    {c.consumptionGroup?.code ? ' — ' : ''}{c.consumptionGroup?.name ?? '—'}
                  </td>
                  <td style={TDR}>{fmtQ(c.quantityPer)}</td>
                  <td style={TD}>{c.uom ?? '—'}</td>
                  <td style={TDR}>{fmtQ(c.scrapPercent, 2)}</td>
                </tr>
              ))}
              {components.length === 0 && (
                <tr><td style={{ ...TD, textAlign: 'center', color: '#999' }} colSpan={5}>No components</td></tr>
              )}
            </tbody>
          </table>

          {routings.length > 0 && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#888', margin: '18px 0 6px' }}>Routing</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={{ ...TH, width: 44 }}>Step</th>
                    <th style={TH}>Description</th>
                    <th style={THR}>Setup (h)</th>
                    <th style={THR}>Run / Unit (h)</th>
                  </tr>
                </thead>
                <tbody>
                  {routings.map((r: any, i: number) => (
                    <tr key={r.id ?? i}>
                      <td style={TD}>{r.stepNumber ?? i + 1}</td>
                      <td style={TD}>{r.description ?? '—'}{r.notes && <div style={{ fontSize: 10, color: '#777' }}>{r.notes}</div>}</td>
                      <td style={TDR}>{fmtQ(r.setupTime)}</td>
                      <td style={TDR}>{fmtQ(r.runTimePerUnit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </DocumentLayout>
      );
    },
  },

  'customer-statement': {
    title: 'Customer Statement',
    fetch: async (id) => {
      // :id is the CUSTOMER — compose the header + their AR invoices.
      const [customer, invoices] = await Promise.all([
        customersApi.getById(id),
        arInvoicesApi.getAll({ customerId: id }),
      ]);
      return { customer, invoices };
    },
    render: ({ customer, invoices }: any) => {
      const rows = (invoices ?? [])
        .filter((i: any) => i.status !== 'void')
        .sort((a: any, b: any) => String(a.invoiceDate).localeCompare(String(b.invoiceDate)));
      const money2 = (v: unknown) => Number(v ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      const balanceOf = (i: any) => Number(i.totalAmount ?? 0) - Number(i.paidAmount ?? 0);

      // spec-021 discipline: never silently sum across currencies — one
      // totals/aging block per currency (single-currency customers get one).
      const byCurrency: Record<string, any[]> = {};
      for (const i of rows) (byCurrency[i.currency ?? '—'] ??= []).push(i);

      const aging = (list: any[]) => {
        const buckets = { Current: 0, '1-30': 0, '31-60': 0, '61-90': 0, '90+': 0 } as Record<string, number>;
        const now = new Date();
        for (const i of list) {
          const bal = balanceOf(i);
          if (bal <= 0) continue;
          const days = i.dueDate ? Math.floor((now.getTime() - new Date(i.dueDate).getTime()) / 86400000) : 0;
          const key = days <= 0 ? 'Current' : days <= 30 ? '1-30' : days <= 60 ? '31-60' : days <= 90 ? '61-90' : '90+';
          buckets[key] += bal;
        }
        return buckets;
      };

      return (
        <DocumentLayout
          title="Customer Statement" number={customer.code ?? '—'} date={new Date().toISOString()}
          party={{ label: 'Customer', name: customer.name ?? '—', lines: [customer.code, customer.email] }}
          meta={[
            { label: 'Open Invoices', value: rows.filter((i: any) => balanceOf(i) > 0).length },
            { label: 'Total Invoices', value: rows.length },
          ]}
          footerNote="This statement reflects invoices recorded as of the date above."
        >
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={TH}>Invoice</th>
                <th style={TH}>Date</th>
                <th style={TH}>Due</th>
                <th style={{ ...TH, width: 70 }}>Status</th>
                <th style={{ ...TH, width: 44 }}>Ccy</th>
                <th style={THR}>Total</th>
                <th style={THR}>Paid</th>
                <th style={THR}>Balance</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((i: any) => (
                <tr key={i.id}>
                  <td style={{ ...TD, fontWeight: 600, color: '#111' }}>{i.invoiceNumber}</td>
                  <td style={TD}>{fmtD(i.invoiceDate)}</td>
                  <td style={TD}>{fmtD(i.dueDate)}</td>
                  <td style={TD}>{i.status}</td>
                  <td style={TD}>{i.currency ?? '—'}</td>
                  <td style={TDR}>{money2(i.totalAmount)}</td>
                  <td style={TDR}>{money2(i.paidAmount)}</td>
                  <td style={{ ...TDR, fontWeight: 600 }}>{money2(balanceOf(i))}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td style={{ ...TD, textAlign: 'center', color: '#999' }} colSpan={8}>No invoices for this customer</td></tr>
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot>
                {Object.entries(byCurrency).map(([ccy, list]) => (
                  <tr key={ccy}>
                    <td colSpan={4} />
                    <td style={{ ...TDR, fontWeight: 700, color: '#111', borderTop: '1.5px solid #333' }}>{ccy}</td>
                    <td style={{ ...TDR, fontWeight: 700, color: '#111', borderTop: '1.5px solid #333' }}>{money2(list.reduce((s, i) => s + Number(i.totalAmount ?? 0), 0))}</td>
                    <td style={{ ...TDR, fontWeight: 700, color: '#111', borderTop: '1.5px solid #333' }}>{money2(list.reduce((s, i) => s + Number(i.paidAmount ?? 0), 0))}</td>
                    <td style={{ ...TDR, fontWeight: 700, color: 'var(--accent-pressed)', borderTop: '1.5px solid #333' }}>{money2(list.reduce((s, i) => s + balanceOf(i), 0))}</td>
                  </tr>
                ))}
              </tfoot>
            )}
          </table>

          {rows.some((i: any) => balanceOf(i) > 0) && (
            <>
              <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#888', margin: '18px 0 6px' }}>Aging (days past due)</div>
              {Object.entries(byCurrency).map(([ccy, list]) => {
                const b = aging(list);
                if (Object.values(b).every(v => v === 0)) return null;
                return (
                  <table key={ccy} style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
                    <thead>
                      <tr>
                        <th style={{ ...TH, width: 44 }}>{ccy}</th>
                        {Object.keys(b).map(k => <th key={k} style={THR}>{k}</th>)}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td style={TD} />
                        {Object.values(b).map((v, i) => <td key={i} style={{ ...TDR, fontWeight: i > 1 ? 600 : 400 }}>{money2(v)}</td>)}
                      </tr>
                    </tbody>
                  </table>
                );
              })}
            </>
          )}
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
