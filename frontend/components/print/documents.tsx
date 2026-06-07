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

const lineFrom = (l: any, qtyKey: string, priceKey?: string): DocLine => ({
  code: l.item?.code ?? null,
  description: l.description ?? l.item?.name ?? null,
  quantity: l[qtyKey],
  uom: l.uom ?? l.item?.baseUom ?? null,
  unitPrice: priceKey ? l[priceKey] : null,
  lineTotal: l.lineTotal ?? null,
});

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
};
