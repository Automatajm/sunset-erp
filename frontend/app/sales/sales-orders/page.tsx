"use client";
// ============================================================================
// frontend/app/sales/sales-orders/page.tsx
// spec-ux-t5-sales T5.2 — ERPTable + ERPFilterBar + FormModal + SearchSelect + ConfirmModal.
// Expandable-row detail → row-click ModalShell.
// ============================================================================
import { useEffect, useState, useCallback, useMemo } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import SearchSelect from '@/components/ui/SearchSelect';
import { ERPTable, ERPColumn } from '@/components/ui/ERPTable';
import { FormModal } from '@/components/ui/modal/FormModal';
import { ModalShell } from '@/components/ui/modal/ModalShell';
import { salesOrdersApi } from '@/lib/api/sales-orders';
import { customersApi } from '@/lib/api/customers';
import { itemsApi } from '@/lib/api/items';
import { PrintButton } from '@/components/print/PrintButton';
import { ConfirmModal } from '@/components/ui/modal';
import { Customer, Item, SOStatus } from '@/lib/api/types';

// ─── Types ──────────────────────────────────────────────────────────────────
interface SOLine {
  id: string; lineNumber: number; itemId: string;
  item?: { id: string; code: string; name: string; baseUom: string };
  description?: string; orderedQuantity: string; shippedQuantity: string; uom: string;
  unitPrice: string; discountPercent: string; lineTotal: string; deliveryDate?: string; status: string;
}
interface SO {
  id: string; soNumber: string; customerId: string;
  customer?: { id: string; code: string; name: string };
  orderDate: string; customerPo?: string; requestedDate?: string; promisedDate?: string;
  paymentTerms?: string; currency?: string; subtotal: string; discountAmount: string;
  taxAmount: string; total: string; status: SOStatus; notes?: string;
  lines?: SOLine[]; _count?: { lines: number }; createdAt: string;
}
interface NewSOLine {
  itemId: string; description: string; orderedQuantity: string; uom: string;
  unitPrice: string; discountPercent: string; deliveryDate: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function extractList(data: unknown): SO[] {
  if (Array.isArray(data)) return data as SO[];
  const d = data as Record<string, unknown>;
  if (d?.value && Array.isArray(d.value)) return d.value as SO[];
  return [];
}
function fmtAmt(v: string | number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(v));
}
function fmtDate(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
const MONO = { fontFamily: "'IBM Plex Mono',monospace", fontSize: 12 } as React.CSSProperties;
const EMPTY_LINE: NewSOLine = { itemId: '', description: '', orderedQuantity: '', uom: '', unitPrice: '', discountPercent: '0', deliveryDate: '' };
const ALL_STATUSES: SOStatus[] = ['draft', 'confirmed', 'shipped', 'delivered', 'closed'];

const INP: React.CSSProperties = { background: 'var(--l04, rgba(255,255,255,0.04))', border: '0.5px solid var(--w10, rgba(255,255,255,0.1))', borderRadius: 7, padding: '8px 12px', fontSize: 12, fontFamily: "'IBM Plex Sans',sans-serif", color: 'var(--text-strong, #f1ede8)', outline: 'none', width: '100%' };
const LBL: React.CSSProperties = { fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(251,146,60,0.6)', fontFamily: "'IBM Plex Sans',sans-serif" };

const STATUS_STYLE: Record<SOStatus, { color: string; bg: string; border: string }> = {
  draft:     { color: 'var(--warning, #fbbf24)', bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.2)' },
  confirmed: { color: 'var(--accent-blue, #60a5fa)', bg: 'rgba(96,165,250,0.1)',  border: 'rgba(96,165,250,0.2)' },
  shipped:   { color: 'var(--accent-violet, #a78bfa)', bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.2)' },
  delivered: { color: 'var(--success, #4ade80)', bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.2)' },
  closed:    { color: 'rgba(255,255,255,0.35)', bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.1)' },
};
const STATUS_ACTIONS: Record<SOStatus, { label: string; next: string; color: string; bg: string; border: string }[]> = {
  draft:     [{ label: 'Confirm', next: 'confirmed', color: 'var(--accent-blue, #60a5fa)', bg: 'rgba(96,165,250,0.1)',  border: 'rgba(96,165,250,0.2)' }],
  confirmed: [{ label: 'Ship',    next: 'shipped',   color: 'var(--accent-violet, #a78bfa)', bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.2)' }],
  shipped:   [{ label: 'Deliver', next: 'delivered', color: 'var(--success, #4ade80)', bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.2)' }],
  delivered: [{ label: 'Close',   next: 'closed',    color: 'rgba(255,255,255,0.4)', bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.1)' }],
  closed:    [],
};

function StatusBadge({ status }: { status: SOStatus }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.draft;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 500, color: s.color, background: s.bg, border: `0.5px solid ${s.border}`, whiteSpace: 'nowrap' }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// ─── Detail modal (lines) ─────────────────────────────────────────────────────
function SODetailModal({ so, onClose }: { so: SO | null; onClose: () => void }) {
  const [detail, setDetail] = useState<SO | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!so) { setDetail(null); return; }
    setLoading(true);
    salesOrdersApi.getById(so.id).then(d => setDetail(d as SO)).finally(() => setLoading(false));
  }, [so]);

  const TH = (h: string, right = false) =>
    <th key={h} style={{ padding: '6px 10px', fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: right ? 'right' : 'left', borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>{h}</th>;

  return (
    <ModalShell open={!!so} onClose={onClose} title={so ? `${so.soNumber} — Lines` : ''} width={860}>
      {loading ? (
        <div style={{ padding: '16px', fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Loading lines…</div>
      ) : detail?.lines ? (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>{TH('#')}{TH('Item')}{TH('Description')}{TH('Ordered', true)}{TH('Shipped', true)}{TH('UOM')}{TH('Unit Price', true)}{TH('Disc%', true)}{TH('Line Total', true)}{TH('Delivery')}</tr>
          </thead>
          <tbody>
            {detail.lines.map(line => (
              <tr key={line.id}>
                <td style={{ padding: '7px 10px', fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{line.lineNumber}</td>
                <td style={{ padding: '7px 10px' }}><span style={{ ...MONO, color: 'var(--accent-strong, #fb923c)' }}>{line.item?.code}</span> <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{line.item?.name}</span></td>
                <td style={{ padding: '7px 10px', fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{line.description || '—'}</td>
                <td style={{ padding: '7px 10px', textAlign: 'right', ...MONO }}>{line.orderedQuantity}</td>
                <td style={{ padding: '7px 10px', textAlign: 'right', ...MONO, color: Number(line.shippedQuantity) > 0 ? 'var(--success, #4ade80)' : 'rgba(255,255,255,0.3)' }}>{line.shippedQuantity}</td>
                <td style={{ padding: '7px 10px', fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{line.uom}</td>
                <td style={{ padding: '7px 10px', textAlign: 'right', ...MONO }}>{fmtAmt(line.unitPrice)}</td>
                <td style={{ padding: '7px 10px', textAlign: 'right', fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{Number(line.discountPercent) > 0 ? `${line.discountPercent}%` : '—'}</td>
                <td style={{ padding: '7px 10px', textAlign: 'right', ...MONO, color: 'var(--text-primary, #e2dfd8)', fontWeight: 500 }}>{fmtAmt(line.lineTotal)}</td>
                <td style={{ padding: '7px 10px', fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{fmtDate(line.deliveryDate)}</td>
              </tr>
            ))}
            <tr style={{ borderTop: '0.5px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
              <td colSpan={8} style={{ padding: '8px 10px', fontSize: 11, color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>TOTAL</td>
              <td style={{ padding: '8px 10px', textAlign: 'right', ...MONO, color: 'var(--accent-strong, #fb923c)', fontWeight: 600, fontSize: 13 }}>{fmtAmt(detail.total)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      ) : <div style={{ padding: '16px', fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>No lines.</div>}
    </ModalShell>
  );
}

// ─── Create modal (shared FormModal) ──────────────────────────────────────────
function CreateSOModal({ open, onClose, onSaved, customers, items }: {
  open: boolean; onClose: () => void; onSaved: () => void; customers: Customer[]; items: Item[];
}) {
  const [header, setHeader] = useState({ customerId: '', customerPo: '', requestedDate: '', promisedDate: '', paymentTerms: '', currency: 'USD', notes: '' });
  const [lines, setLines] = useState<NewSOLine[]>([{ ...EMPTY_LINE }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setHeader({ customerId: '', customerPo: '', requestedDate: '', promisedDate: '', paymentTerms: 'Net 30', currency: 'USD', notes: '' });
      setLines([{ ...EMPTY_LINE }]);
    }
  }, [open]);

  const setLine = (idx: number, key: keyof NewSOLine, value: string) =>
    setLines(ls => ls.map((l, i) => {
      if (i !== idx) return l;
      const updated = { ...l, [key]: value };
      if (key === 'itemId') { const item = items.find(it => it.id === value); if (item) updated.uom = item.baseUom; }
      return updated;
    }));

  const calcLineTotal = (line: NewSOLine) => (Number(line.orderedQuantity) || 0) * (Number(line.unitPrice) || 0) * (1 - (Number(line.discountPercent) || 0) / 100);
  const grandTotal = lines.reduce((s, l) => s + calcLineTotal(l), 0);
  const validLines = lines.filter(l => l.itemId && l.orderedQuantity && l.unitPrice);
  const isValid = !!header.customerId && validLines.length > 0;

  const submit = async () => {
    if (!header.customerId) { setError('Customer is required.'); return; }
    if (validLines.length === 0) { setError('At least one complete line is required.'); return; }
    setSubmitting(true); setError(null);
    try {
      await salesOrdersApi.create({
        customerId: header.customerId, customerPo: header.customerPo || undefined,
        requestedDate: header.requestedDate || undefined, promisedDate: header.promisedDate || undefined,
        paymentTerms: header.paymentTerms || undefined, currency: header.currency, notes: header.notes || undefined,
        lines: validLines.map(l => ({
          itemId: l.itemId, description: l.description || undefined, orderedQuantity: Number(l.orderedQuantity),
          uom: l.uom, unitPrice: Number(l.unitPrice), discountPercent: Number(l.discountPercent) || undefined,
          deliveryDate: l.deliveryDate || undefined,
        })),
      });
      onSaved(); onClose();
    } catch (err) {
      setError((err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Operation failed.');
    } finally { setSubmitting(false); }
  };

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) =>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}><label style={LBL}>{label}</label>{children}</div>;

  return (
    <FormModal open={open} onClose={onClose} title="New Sales Order" submitLabel="Create Sales Order" submitting={submitting} isValid={isValid} error={error} onSubmit={submit} width={820}>
      <style>{`
        .sol-table{width:100%;border-collapse:collapse}
        .sol-table th{font-size:10px;color:rgba(251,146,60,0.5);text-transform:uppercase;letter-spacing:0.08em;padding:5px 6px;text-align:left;border-bottom:0.5px solid rgba(255,255,255,0.06);white-space:nowrap}
        .sol-table td{padding:4px 3px;vertical-align:middle}
        .sol-inp{background:rgba(255,255,255,0.04);border:0.5px solid rgba(255,255,255,0.1);border-radius:5px;padding:5px 7px;font-size:12px;font-family:'IBM Plex Sans',sans-serif;color:var(--text-strong, #f1ede8);outline:none;width:100%}
        .sol-section{font-size:10px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.25);padding:6px 0 4px;border-bottom:0.5px solid rgba(255,255,255,0.06);margin-top:4px;display:flex;align-items:center;justify-content:space-between}
        .sol-btn-add{background:rgba(255,255,255,0.04);border:0.5px solid rgba(255,255,255,0.1);border-radius:5px;padding:4px 10px;font-size:11px;color:rgba(255,255,255,0.5);cursor:pointer;font-family:'IBM Plex Sans',sans-serif}
        .sol-btn-rm{width:20px;height:20px;border-radius:4px;background:rgba(239,68,68,0.1);border:0.5px solid rgba(239,68,68,0.2);color:var(--danger, #f87171);cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
      `}</style>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
          <Field label="Customer *">
            <SearchSelect options={customers.map(c => ({ value: c.id, label: `${c.code} — ${c.name}` }))} value={header.customerId} onChange={v => setHeader(h => ({ ...h, customerId: v }))} placeholder="Search customer…" clearLabel="— Select customer —" minWidth={300} />
          </Field>
          <Field label="Customer PO"><input placeholder="CUST-PO-001" value={header.customerPo} onChange={e => setHeader(h => ({ ...h, customerPo: e.target.value }))} style={INP} /></Field>
          <Field label="Currency">
            <SearchSelect options={['USD', 'EUR', 'DOP'].map(c => ({ value: c, label: c }))} value={header.currency} onChange={v => setHeader(h => ({ ...h, currency: v }))} placeholder="Currency…" minWidth={160} />
          </Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <Field label="Requested Date"><input type="date" value={header.requestedDate} onChange={e => setHeader(h => ({ ...h, requestedDate: e.target.value }))} style={INP} /></Field>
          <Field label="Promised Date"><input type="date" value={header.promisedDate} onChange={e => setHeader(h => ({ ...h, promisedDate: e.target.value }))} style={INP} /></Field>
          <Field label="Payment Terms"><input placeholder="Net 30" value={header.paymentTerms} onChange={e => setHeader(h => ({ ...h, paymentTerms: e.target.value }))} style={INP} /></Field>
        </div>
        <Field label="Notes"><input placeholder="Additional notes" value={header.notes} onChange={e => setHeader(h => ({ ...h, notes: e.target.value }))} style={INP} /></Field>

        <div className="sol-section">
          <span>Order Lines</span>
          <button type="button" className="sol-btn-add" onClick={() => setLines(ls => [...ls, { ...EMPTY_LINE }])}>+ Add Line</button>
        </div>
        <table className="sol-table">
          <thead>
            <tr>
              <th style={{ width: 220 }}>Item *</th><th>Description</th><th style={{ width: 80 }}>Qty *</th>
              <th style={{ width: 60 }}>UOM</th><th style={{ width: 90 }}>Price *</th><th style={{ width: 60 }}>Disc%</th>
              <th style={{ width: 100 }}>Total</th><th style={{ width: 110 }}>Delivery</th><th style={{ width: 24 }}></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => (
              <tr key={idx}>
                <td>
                  <SearchSelect options={items.filter(it => it.isSaleable).map(it => ({ value: it.id, label: `${it.code} — ${it.name}` }))} value={line.itemId} onChange={v => setLine(idx, 'itemId', v)} placeholder="Item…" clearLabel="— Item —" minWidth={240} />
                </td>
                <td><input className="sol-inp" placeholder="Description" value={line.description} onChange={e => setLine(idx, 'description', e.target.value)} /></td>
                <td><input className="sol-inp" type="number" min="0" step="0.001" placeholder="0" value={line.orderedQuantity} onChange={e => setLine(idx, 'orderedQuantity', e.target.value)} style={{ textAlign: 'right' }} /></td>
                <td><input className="sol-inp" placeholder="PCS" value={line.uom} onChange={e => setLine(idx, 'uom', e.target.value)} /></td>
                <td><input className="sol-inp" type="number" min="0" step="0.01" placeholder="0.00" value={line.unitPrice} onChange={e => setLine(idx, 'unitPrice', e.target.value)} style={{ textAlign: 'right' }} /></td>
                <td><input className="sol-inp" type="number" min="0" max="100" step="0.1" placeholder="0" value={line.discountPercent} onChange={e => setLine(idx, 'discountPercent', e.target.value)} style={{ textAlign: 'right' }} /></td>
                <td style={{ padding: '4px 6px', ...MONO, fontSize: 11, color: 'var(--text-primary, #e2dfd8)', textAlign: 'right' }}>{calcLineTotal(line) > 0 ? fmtAmt(calcLineTotal(line)) : '—'}</td>
                <td><input className="sol-inp" type="date" value={line.deliveryDate} onChange={e => setLine(idx, 'deliveryDate', e.target.value)} /></td>
                <td>{lines.length > 1 && <button type="button" className="sol-btn-rm" onClick={() => setLines(ls => ls.filter((_, i) => i !== idx))}>×</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, padding: '8px 0', borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Grand Total</span>
          <span style={{ ...MONO, fontSize: 14, fontWeight: 500, color: 'var(--accent-strong, #fb923c)' }}>{fmtAmt(grandTotal)}</span>
        </div>
      </div>
    </FormModal>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function SalesOrdersPage() {
  const [orders,       setOrders]       = useState<SO[]>([]);
  const [customers,    setCustomers]    = useState<Customer[]>([]);
  const [items,        setItems]        = useState<Item[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [statusFilter, setStatusFilter] = useState<SOStatus | ''>('');
  const [createOpen,   setCreateOpen]   = useState(false);
  const [detailSo,     setDetailSo]     = useState<SO | null>(null);
  const [actionBusy,   setActionBusy]   = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ id: string; status: string; soNumber: string; label: string; description: string } | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [raw, custs, its] = await Promise.all([salesOrdersApi.getAll(), customersApi.getAll(), itemsApi.getAll()]);
      setOrders(extractList(raw as unknown)); setCustomers(custs); setItems(its);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filtered = useMemo(() => statusFilter ? orders.filter(o => o.status === statusFilter) : orders, [orders, statusFilter]);

  const runStatusChange = async (id: string, status: string) => {
    setActionBusy(id);
    try {
      await salesOrdersApi.updateStatus(id, status as 'confirmed' | 'shipped' | 'delivered' | 'closed');
      fetchAll();
    } catch (err) {
      setError((err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Status update failed.');
      throw err; // ConfirmModal surfaces inline + stays open
    } finally { setActionBusy(null); }
  };

  const handleStatusChange = (id: string, status: string) => {
    if (status === 'shipped' || status === 'delivered') {
      const so = orders.find(o => o.id === id);
      setConfirmAction({
        id, status, soNumber: so?.soNumber ?? '',
        label: status === 'shipped' ? 'Ship Order' : 'Mark Delivered',
        description: status === 'shipped'
          ? 'Shipping this order creates outbound stock movements and decrements inventory. It cannot be undone.'
          : 'Marking this order delivered finalizes fulfillment. It cannot be undone.',
      });
      return;
    }
    runStatusChange(id, status);
  };

  const counts = Object.fromEntries(ALL_STATUSES.map(s => [s, orders.filter(o => o.status === s).length])) as Record<SOStatus, number>;

  const columns = useMemo<ERPColumn<SO>[]>(() => [
    {
      key: 'soNumber', header: 'SO Number', width: 140, sortable: true,
      value: r => r.soNumber,
      render: r => <span style={{ ...MONO, color: 'var(--accent-strong, #fb923c)', fontWeight: 500 }}>{r.soNumber}</span>,
    },
    {
      key: 'customer', header: 'Customer / PO', sortable: true,
      value: r => r.customer?.name ?? '',
      render: r => (
        <div>
          <span style={{ color: 'var(--text-primary, #e2dfd8)', fontWeight: 500 }}>{r.customer?.name ?? '—'}</span>
          {r.customerPo && <div style={{ fontSize: 11, color: 'rgba(251,146,60,0.55)', marginTop: 1 }}>PO: {r.customerPo}</div>}
        </div>
      ),
    },
    { key: 'orderDate', header: 'Order Date', width: 120, sortable: true, value: r => r.orderDate ?? '', render: r => <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{fmtDate(r.orderDate)}</span> },
    { key: 'promisedDate', header: 'Promised', width: 120, sortable: true, value: r => r.promisedDate ?? '', render: r => <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{fmtDate(r.promisedDate)}</span> },
    { key: 'lines', header: 'Lines', width: 70, align: 'center', sortable: true, value: r => r._count?.lines ?? r.lines?.length ?? 0, render: r => { const n = r._count?.lines ?? r.lines?.length ?? 0; return <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{n}</span>; } },
    { key: 'total', header: 'Total', width: 120, align: 'right', sortable: true, value: r => Number(r.total), render: r => <span style={{ ...MONO, color: 'var(--text-primary, #e2dfd8)' }}>{fmtAmt(r.total)}</span> },
    { key: 'currency', header: 'Currency', width: 90, sortable: true, value: r => r.currency ?? 'USD', render: r => <span style={{ ...MONO, fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{r.currency ?? 'USD'}</span> },
    { key: 'status', header: 'Status', width: 120, sortable: true, value: r => r.status, render: r => <StatusBadge status={r.status} /> },
    {
      key: '_actions', header: '', width: 170, sortable: false,
      render: r => {
        const busy = actionBusy === r.id;
        return (
          <div style={{ display: 'flex', gap: 5, alignItems: 'center' }} onClick={e => e.stopPropagation()}>
            {(STATUS_ACTIONS[r.status] ?? []).map(action => (
              <button key={action.next} onClick={() => handleStatusChange(r.id, action.next)} disabled={busy}
                style={{ padding: '4px 9px', borderRadius: 6, fontSize: 11, cursor: 'pointer', color: action.color, background: action.bg, border: `0.5px solid ${action.border}`, fontFamily: "'IBM Plex Sans',sans-serif", opacity: busy ? 0.5 : 1, whiteSpace: 'nowrap' }}>
                {busy ? '…' : action.label}
              </button>
            ))}
            <PrintButton doc="sales-order" id={r.id} label="" style={{ padding: '4px 7px' }} />
          </div>
        );
      },
    },
  ], [actionBusy, orders]);

  return (
    <ERPShell breadcrumbs={['Home', 'Sales', 'Sales Orders']} title="Sales Orders">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap');
        .so-page { padding: 0 18px 12px; display:flex; flex-direction:column; height:100%; overflow:hidden; }
        .so-stats { display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap; flex-shrink:0; }
        .so-stat { background:rgba(10,7,18,0.7); border-radius:8px; padding:7px 12px; display:flex; flex-direction:column; gap:2px; min-width:80px; cursor:pointer; transition:opacity 0.15s; }
        .so-stat:hover { opacity:0.8; }
        .so-stat-label { font-size:10px; font-weight:500; letter-spacing:0.08em; text-transform:uppercase; }
        .so-stat-value { font-size:20px; font-weight:500; font-family:'IBM Plex Mono',monospace; color:var(--text-strong, #f1ede8); }
        .so-btn-new { display:flex; align-items:center; gap:6px; background:linear-gradient(135deg,var(--accent-pressed, #c2410c),var(--accent, #ea580c),var(--accent-mid, #f97316)); border:none; border-radius:7px; padding:7px 14px; font-size:12px; font-weight:500; font-family:'IBM Plex Sans',sans-serif; color:white; cursor:pointer; box-shadow:0 3px 12px rgba(234,88,12,0.3); flex-shrink:0; align-self:flex-end; }
        .so-btn-new:hover { opacity:0.88; }
        .so-btn-new svg { width:13px; height:13px; display:block; flex-shrink:0; }
        .so-error { background:rgba(239,68,68,0.08); border:0.5px solid rgba(239,68,68,0.2); border-radius:8px; padding:10px 14px; margin-bottom:10px; font-size:13px; color:var(--danger-subtle, #fca5a5); flex-shrink:0; }
      `}</style>

      <div className="so-page">
        {orders.length > 0 && (
          <div className="so-stats">
            {ALL_STATUSES.map(s => {
              const style = STATUS_STYLE[s];
              return (
                <div key={s} className="so-stat" style={{ border: `0.5px solid ${statusFilter === s ? style.border : 'rgba(255,255,255,0.07)'}` }} onClick={() => setStatusFilter(prev => (prev === s ? '' : s))}>
                  <span className="so-stat-label" style={{ color: style.color }}>{s.charAt(0).toUpperCase() + s.slice(1)}</span>
                  <span className="so-stat-value">{counts[s]}</span>
                </div>
              );
            })}
            <div className="so-stat" style={{ border: `0.5px solid ${!statusFilter ? 'rgba(251,146,60,0.3)' : 'rgba(255,255,255,0.07)'}` }} onClick={() => setStatusFilter('')}>
              <span className="so-stat-label" style={{ color: 'rgba(251,146,60,0.6)' }}>Total</span>
              <span className="so-stat-value" style={{ color: 'var(--accent-strong, #fb923c)' }}>{orders.length}</span>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 10, flexShrink: 0, flexWrap: 'wrap' }}>
          <div style={{ width: 220 }}>
            <SearchSelect
              options={ALL_STATUSES.map(s => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))}
              value={statusFilter}
              onChange={v => setStatusFilter(v as SOStatus | '')}
              placeholder="All Status"
              clearLabel="All Status"
              minWidth={200}
            />
          </div>
          <button className="so-btn-new" onClick={() => setCreateOpen(true)}>
            <svg viewBox="0 0 13 13" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><line x1="6.5" y1="1" x2="6.5" y2="12" /><line x1="1" y1="6.5" x2="12" y2="6.5" /></svg>
            New SO
          </button>
        </div>

        {error && <div className="so-error">{error}</div>}

        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <ERPTable<SO>
            columns={columns}
            data={filtered}
            rowKey={r => r.id}
            loading={loading}
            exportFilename="sales-orders"
            emptyMessage={statusFilter ? 'No orders match your filters.' : 'No sales orders yet.'}
            defaultPageSize={25}
            maxHeight="100%"
            onRowClick={r => setDetailSo(r)}
          />
        </div>
      </div>

      <CreateSOModal open={createOpen} onClose={() => setCreateOpen(false)} onSaved={fetchAll} customers={customers} items={items} />
      <SODetailModal so={detailSo} onClose={() => setDetailSo(null)} />

      <ConfirmModal
        open={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        title={confirmAction ? `${confirmAction.label} ${confirmAction.soNumber}?` : ''}
        description={confirmAction?.description}
        variant="destructive"
        confirmLabel={confirmAction?.label}
        onConfirm={async () => { if (confirmAction) await runStatusChange(confirmAction.id, confirmAction.status); }}
      />
    </ERPShell>
  );
}
