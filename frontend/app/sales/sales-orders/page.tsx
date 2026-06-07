"use client";

import { useEffect, useState, useCallback } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import { salesOrdersApi } from '@/lib/api/sales-orders';
import { customersApi } from '@/lib/api/customers';
import { itemsApi } from '@/lib/api/items';
import { PrintButton } from '@/components/print/PrintButton';
import { Customer, Item, SOStatus } from '@/lib/api/types';

// ─── Real backend types ───────────────────────────────────────────────────────

interface SOLine {
  id: string;
  lineNumber: number;
  itemId: string;
  item?: { id: string; code: string; name: string; baseUom: string };
  description?: string;
  orderedQuantity: string;
  shippedQuantity: string;
  uom: string;
  unitPrice: string;
  discountPercent: string;
  lineTotal: string;
  deliveryDate?: string;
  status: string;
}

interface SO {
  id: string;
  soNumber: string;
  customerId: string;
  customer?: { id: string; code: string; name: string };
  orderDate: string;
  customerPo?: string;
  requestedDate?: string;
  promisedDate?: string;
  paymentTerms?: string;
  currency?: string;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  total: string;
  status: SOStatus;
  notes?: string;
  lines?: SOLine[];
  _count?: { lines: number };
  createdAt: string;
}

interface NewSOLine {
  itemId: string;
  description: string;
  orderedQuantity: string;
  uom: string;
  unitPrice: string;
  discountPercent: string;
  deliveryDate: string;
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

const EMPTY_LINE: NewSOLine = {
  itemId: '', description: '', orderedQuantity: '', uom: '',
  unitPrice: '', discountPercent: '0', deliveryDate: '',
};

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<SOStatus, { color: string; bg: string; border: string }> = {
  draft:     { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.2)' },
  confirmed: { color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',  border: 'rgba(96,165,250,0.2)' },
  shipped:   { color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.2)' },
  delivered: { color: '#4ade80', bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.2)' },
  closed:    { color: 'rgba(255,255,255,0.35)', bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.1)' },
};

// Status workflow: what actions are available per status
const STATUS_ACTIONS: Record<SOStatus, { label: string; next: string; color: string; bg: string; border: string }[]> = {
  draft:     [{ label: 'Confirm', next: 'confirmed', color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',  border: 'rgba(96,165,250,0.2)' }],
  confirmed: [{ label: 'Ship',    next: 'shipped',   color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.2)' }],
  shipped:   [{ label: 'Deliver', next: 'delivered', color: '#4ade80', bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.2)' }],
  delivered: [{ label: 'Close',   next: 'closed',    color: 'rgba(255,255,255,0.4)', bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.1)' }],
  closed:    [],
};

function StatusBadge({ status }: { status: SOStatus }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.draft;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 500,
      color: s.color, background: s.bg, border: `0.5px solid ${s.border}`,
      whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// ─── SO row with expandable detail ───────────────────────────────────────────

function SORow({ so, onStatusChange, actionBusy }: {
  so: SO;
  onStatusChange: (id: string, status: string) => void;
  actionBusy: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<SO | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const busy = actionBusy === so.id;
  const lineCount = so._count?.lines ?? so.lines?.length ?? 0;
  const actions = STATUS_ACTIONS[so.status] ?? [];

  const MONO = { fontFamily: "'IBM Plex Mono',monospace", fontSize: 12 } as React.CSSProperties;

  const handleExpand = async () => {
    if (!expanded && !detail) {
      setLoadingDetail(true);
      try {
        const d = await salesOrdersApi.getById(so.id);
        setDetail(d as SO);
      } finally { setLoadingDetail(false); }
    }
    setExpanded(e => !e);
  };

  return (
    <>
      <tr style={{ cursor: 'pointer' }} onClick={handleExpand}>
        <td>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', transform: expanded ? 'rotate(90deg)' : 'none', display: 'inline-block', transition: 'transform 0.15s' }}>▶</span>
            <span style={{ ...MONO, color: '#fb923c', fontWeight: 500 }}>{so.soNumber}</span>
          </span>
        </td>
        <td>
          <span style={{ color: '#e2dfd8', fontWeight: 500 }}>{so.customer?.name ?? '—'}</span>
          {so.customerPo && <div style={{ fontSize: 11, color: 'rgba(251,146,60,0.55)', marginTop: 1 }}>PO: {so.customerPo}</div>}
        </td>
        <td><span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{fmtDate(so.orderDate)}</span></td>
        <td><span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{fmtDate(so.promisedDate)}</span></td>
        <td><span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{lineCount} line{lineCount !== 1 ? 's' : ''}</span></td>
        <td style={{ textAlign: 'right' }}>
          <span style={{ ...MONO, color: '#e2dfd8' }}>{fmtAmt(so.total)}</span>
        </td>
        <td><span style={{ ...MONO, fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{so.currency ?? 'USD'}</span></td>
        <td><StatusBadge status={so.status} /></td>
        <td onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
            {actions.map(action => (
              <button
                key={action.next}
                onClick={() => onStatusChange(so.id, action.next)}
                disabled={busy}
                style={{ padding: '4px 9px', borderRadius: 6, fontSize: 11, cursor: 'pointer', color: action.color, background: action.bg, border: `0.5px solid ${action.border}`, fontFamily: "'IBM Plex Sans',sans-serif", opacity: busy ? 0.5 : 1, whiteSpace: 'nowrap' }}
              >
                {busy ? '…' : action.label}
              </button>
            ))}
            <PrintButton doc="sales-order" id={so.id} label="" style={{ padding: '4px 7px' }} />
          </div>
        </td>
      </tr>

      {expanded && (
        <tr>
          <td colSpan={9} style={{ padding: 0, background: 'rgba(96,165,250,0.01)' }}>
            {loadingDetail ? (
              <div style={{ padding: '16px 40px', fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Loading lines…</div>
            ) : detail?.lines ? (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['#', 'Item', 'Description', 'Ordered', 'Shipped', 'UOM', 'Unit Price', 'Disc%', 'Line Total', 'Delivery'].map(h => (
                      <th key={h} style={{ padding: '6px 14px 6px ' + (h === '#' ? '40px' : '14px'), fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: ['Ordered','Shipped','Unit Price','Disc%','Line Total'].includes(h) ? 'right' : 'left', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detail.lines.map(line => (
                    <tr key={line.id}>
                      <td style={{ padding: '7px 14px 7px 40px', fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{line.lineNumber}</td>
                      <td style={{ padding: '7px 14px' }}>
                        <span style={{ ...MONO, color: '#fb923c' }}>{line.item?.code}</span>
                        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginLeft: 8 }}>{line.item?.name}</span>
                      </td>
                      <td style={{ padding: '7px 14px', fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{line.description || '—'}</td>
                      <td style={{ padding: '7px 14px', textAlign: 'right', ...MONO }}>{line.orderedQuantity}</td>
                      <td style={{ padding: '7px 14px', textAlign: 'right', ...MONO, color: Number(line.shippedQuantity) > 0 ? '#4ade80' : 'rgba(255,255,255,0.3)' }}>{line.shippedQuantity}</td>
                      <td style={{ padding: '7px 14px', fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{line.uom}</td>
                      <td style={{ padding: '7px 14px', textAlign: 'right', ...MONO }}>{fmtAmt(line.unitPrice)}</td>
                      <td style={{ padding: '7px 14px', textAlign: 'right', fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{Number(line.discountPercent) > 0 ? `${line.discountPercent}%` : '—'}</td>
                      <td style={{ padding: '7px 14px', textAlign: 'right', ...MONO, color: '#e2dfd8', fontWeight: 500 }}>{fmtAmt(line.lineTotal)}</td>
                      <td style={{ padding: '7px 14px', fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{fmtDate(line.deliveryDate)}</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: '0.5px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
                    <td colSpan={8} style={{ padding: '8px 14px', fontSize: 11, color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>TOTAL</td>
                    <td style={{ padding: '8px 14px', textAlign: 'right', ...MONO, color: '#fb923c', fontWeight: 600, fontSize: 13 }}>{fmtAmt(detail.total)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            ) : null}
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Create SO modal ──────────────────────────────────────────────────────────

function CreateSOModal({ open, onClose, onSaved, customers, items }: {
  open: boolean; onClose: () => void; onSaved: () => void;
  customers: Customer[]; items: Item[];
}) {
  const [header, setHeader] = useState({
    customerId: '', customerPo: '', requestedDate: '', promisedDate: '',
    paymentTerms: '', currency: 'USD', notes: '',
  });
  const [lines, setLines] = useState<NewSOLine[]>([{ ...EMPTY_LINE }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setError('');
      setHeader({ customerId: '', customerPo: '', requestedDate: '', promisedDate: '', paymentTerms: 'Net 30', currency: 'USD', notes: '' });
      setLines([{ ...EMPTY_LINE }]);
    }
  }, [open]);

  const setH = (key: keyof typeof header) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setHeader(h => ({ ...h, [key]: e.target.value }));

  const setLine = (idx: number, key: keyof NewSOLine, value: string) =>
    setLines(ls => ls.map((l, i) => {
      if (i !== idx) return l;
      const updated = { ...l, [key]: value };
      if (key === 'itemId') {
        const item = items.find(it => it.id === value);
        if (item) updated.uom = item.baseUom;
      }
      return updated;
    }));

  const calcLineTotal = (line: NewSOLine) => {
    const qty = Number(line.orderedQuantity) || 0;
    const price = Number(line.unitPrice) || 0;
    const disc = Number(line.discountPercent) || 0;
    return qty * price * (1 - disc / 100);
  };

  const grandTotal = lines.reduce((s, l) => s + calcLineTotal(l), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!header.customerId) { setError('Customer is required.'); return; }
    const validLines = lines.filter(l => l.itemId && l.orderedQuantity && l.unitPrice);
    if (validLines.length === 0) { setError('At least one complete line is required.'); return; }
    setSubmitting(true); setError('');
    try {
      await salesOrdersApi.create({
        customerId:    header.customerId,
        customerPo:    header.customerPo   || undefined,
        requestedDate: header.requestedDate || undefined,
        promisedDate:  header.promisedDate  || undefined,
        paymentTerms:  header.paymentTerms  || undefined,
        currency:      header.currency,
        notes:         header.notes         || undefined,
        lines: validLines.map(l => ({
          itemId:          l.itemId,
          description:     l.description    || undefined,
          orderedQuantity: Number(l.orderedQuantity),
          uom:             l.uom,
          unitPrice:       Number(l.unitPrice),
          discountPercent: Number(l.discountPercent) || undefined,
          deliveryDate:    l.deliveryDate    || undefined,
        })),
      });
      onSaved(); onClose();
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
      setError(msg || 'Operation failed.');
    } finally { setSubmitting(false); }
  };

  if (!open) return null;

  const inputCls = { background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '8px 12px', fontSize: 12, fontFamily: "'IBM Plex Sans',sans-serif", color: '#f1ede8', outline: 'none', width: '100%' } as React.CSSProperties;
  const labelCls = { fontSize: 10, fontWeight: 500, letterSpacing: '0.08em' as const, textTransform: 'uppercase' as const, color: 'rgba(251,146,60,0.6)', fontFamily: "'IBM Plex Sans',sans-serif" };

  return (
    <>
      <style>{`
        .so-overlay { position:fixed; inset:0; z-index:400; background:rgba(0,0,0,0.7); backdrop-filter:blur(4px); display:flex; align-items:flex-start; justify-content:center; padding:20px; overflow-y:auto; }
        .so-box { background:#0e0b1a; border:0.5px solid rgba(251,146,60,0.2); border-radius:14px; width:100%; max-width:820px; margin:auto; position:relative; box-shadow:0 24px 60px rgba(0,0,0,0.7); }
        .so-box::before { content:''; position:absolute; top:0; left:30px; right:30px; height:1px; background:linear-gradient(90deg,transparent,rgba(251,146,60,0.4),transparent); }
        .so-lines-table { width:100%; border-collapse:collapse; }
        .so-lines-table th { font-size:10px; color:rgba(251,146,60,0.5); text-transform:uppercase; letter-spacing:0.08em; padding:5px 6px; text-align:left; border-bottom:0.5px solid rgba(255,255,255,0.06); white-space:nowrap; }
        .so-lines-table td { padding:4px 3px; vertical-align:middle; }
        .so-line-input { background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.1); border-radius:5px; padding:5px 7px; font-size:12px; font-family:'IBM Plex Sans',sans-serif; color:#f1ede8; outline:none; width:100%; }
        .so-line-select { background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.1); border-radius:5px; padding:5px 7px; font-size:12px; font-family:'IBM Plex Sans',sans-serif; color:#f1ede8; outline:none; width:100%; }
        .so-line-select option { background:#0e0b1a; }
        .so-section { font-size:10px; font-weight:500; letter-spacing:0.12em; text-transform:uppercase; color:rgba(255,255,255,0.25); padding:6px 0 4px; border-bottom:0.5px solid rgba(255,255,255,0.06); margin-top:4px; display:flex; align-items:center; justify-content:space-between; }
        .so-btn-add { background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.1); border-radius:5px; padding:4px 10px; font-size:11px; color:rgba(255,255,255,0.5); cursor:pointer; font-family:'IBM Plex Sans',sans-serif; }
        .so-btn-add:hover { background:rgba(255,255,255,0.08); }
        .so-btn-rm { width:20px; height:20px; border-radius:4px; background:rgba(239,68,68,0.1); border:0.5px solid rgba(239,68,68,0.2); color:#f87171; cursor:pointer; font-size:13px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
      `}</style>

      <div className="so-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="so-box">
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px 12px', borderBottom:'0.5px solid rgba(255,255,255,0.06)', position:'sticky', top:0, background:'#0e0b1a', zIndex:1, borderRadius:'14px 14px 0 0' }}>
            <span style={{ fontSize:14, fontWeight:500, color:'#f1ede8', fontFamily:"'IBM Plex Sans',sans-serif" }}>New Sales Order</span>
            <button onClick={onClose} style={{ width:24, height:24, borderRadius:6, background:'rgba(255,255,255,0.06)', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.45)', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ padding:'16px 20px', display:'flex', flexDirection:'column', gap:12 }}>
              {error && <div style={{ background:'rgba(239,68,68,0.1)', border:'0.5px solid rgba(239,68,68,0.25)', borderRadius:7, padding:'8px 12px', fontSize:12, color:'#fca5a5' }}>{error}</div>}

              <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', gap:10 }}>
                <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                  <label style={labelCls}>Customer *</label>
                  <select value={header.customerId} onChange={setH('customerId')} style={{ ...inputCls, cursor:'pointer' }}>
                    <option value="">— Select customer —</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
                  </select>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                  <label style={labelCls}>Customer PO</label>
                  <input placeholder="CUST-PO-001" value={header.customerPo} onChange={setH('customerPo')} style={inputCls} />
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                  <label style={labelCls}>Currency</label>
                  <select value={header.currency} onChange={setH('currency')} style={{ ...inputCls, cursor:'pointer' }}>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="DOP">DOP</option>
                  </select>
                </div>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
                <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                  <label style={labelCls}>Requested Date</label>
                  <input type="date" value={header.requestedDate} onChange={setH('requestedDate')} style={inputCls} />
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                  <label style={labelCls}>Promised Date</label>
                  <input type="date" value={header.promisedDate} onChange={setH('promisedDate')} style={inputCls} />
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                  <label style={labelCls}>Payment Terms</label>
                  <input placeholder="Net 30" value={header.paymentTerms} onChange={setH('paymentTerms')} style={inputCls} />
                </div>
              </div>

              <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                <label style={labelCls}>Notes</label>
                <input placeholder="Additional notes" value={header.notes} onChange={setH('notes')} style={inputCls} />
              </div>

              {/* Lines */}
              <div className="so-section">
                <span>Order Lines</span>
                <button type="button" className="so-btn-add" onClick={() => setLines(ls => [...ls, { ...EMPTY_LINE }])}>+ Add Line</button>
              </div>

              <table className="so-lines-table">
                <thead>
                  <tr>
                    <th style={{ width: 220 }}>Item *</th>
                    <th>Description</th>
                    <th style={{ width: 80 }}>Qty *</th>
                    <th style={{ width: 60 }}>UOM</th>
                    <th style={{ width: 90 }}>Price *</th>
                    <th style={{ width: 60 }}>Disc%</th>
                    <th style={{ width: 100 }}>Total</th>
                    <th style={{ width: 110 }}>Delivery</th>
                    <th style={{ width: 24 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => (
                    <tr key={idx}>
                      <td>
                        <select className="so-line-select" value={line.itemId} onChange={e => setLine(idx, 'itemId', e.target.value)}>
                          <option value="">— Item —</option>
                          {items.filter(it => it.isSaleable).map(it => <option key={it.id} value={it.id}>{it.code} — {it.name}</option>)}
                        </select>
                      </td>
                      <td><input className="so-line-input" placeholder="Description" value={line.description} onChange={e => setLine(idx, 'description', e.target.value)} /></td>
                      <td><input className="so-line-input" type="number" min="0" step="0.001" placeholder="0" value={line.orderedQuantity} onChange={e => setLine(idx, 'orderedQuantity', e.target.value)} style={{ textAlign: 'right' }} /></td>
                      <td><input className="so-line-input" placeholder="PCS" value={line.uom} onChange={e => setLine(idx, 'uom', e.target.value)} /></td>
                      <td><input className="so-line-input" type="number" min="0" step="0.01" placeholder="0.00" value={line.unitPrice} onChange={e => setLine(idx, 'unitPrice', e.target.value)} style={{ textAlign: 'right' }} /></td>
                      <td><input className="so-line-input" type="number" min="0" max="100" step="0.1" placeholder="0" value={line.discountPercent} onChange={e => setLine(idx, 'discountPercent', e.target.value)} style={{ textAlign: 'right' }} /></td>
                      <td style={{ padding: '4px 6px', fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: '#e2dfd8', textAlign: 'right' }}>
                        {calcLineTotal(line) > 0 ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(calcLineTotal(line)) : '—'}
                      </td>
                      <td><input className="so-line-input" type="date" value={line.deliveryDate} onChange={e => setLine(idx, 'deliveryDate', e.target.value)} /></td>
                      <td>
                        {lines.length > 1 && (
                          <button type="button" className="so-btn-rm" onClick={() => setLines(ls => ls.filter((_, i) => i !== idx))}>×</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ display:'flex', justifyContent:'flex-end', gap:16, padding:'8px 0', borderTop:'0.5px solid rgba(255,255,255,0.06)' }}>
                <span style={{ fontSize:12, color:'rgba(255,255,255,0.4)' }}>Grand Total</span>
                <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:14, fontWeight:500, color:'#fb923c' }}>
                  {new Intl.NumberFormat('en-US', { style:'currency', currency:'USD' }).format(grandTotal)}
                </span>
              </div>
            </div>

            <div style={{ display:'flex', justifyContent:'flex-end', gap:8, padding:'12px 20px 18px', borderTop:'0.5px solid rgba(255,255,255,0.06)' }}>
              <button type="button" onClick={onClose} style={{ background:'rgba(255,255,255,0.05)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:7, padding:'8px 16px', fontSize:13, fontFamily:"'IBM Plex Sans',sans-serif", color:'rgba(255,255,255,0.5)', cursor:'pointer' }}>Cancel</button>
              <button type="submit" disabled={submitting} style={{ background:'linear-gradient(135deg,#c2410c,#ea580c,#f97316)', border:'none', borderRadius:7, padding:'8px 20px', fontSize:13, fontWeight:500, fontFamily:"'IBM Plex Sans',sans-serif", color:'white', cursor:'pointer', boxShadow:'0 3px 12px rgba(234,88,12,0.35)', opacity:submitting?0.5:1 }}>
                {submitting ? 'Creating…' : 'Create Sales Order'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SalesOrdersPage() {
  const [orders,       setOrders]       = useState<SO[]>([]);
  const [customers,    setCustomers]    = useState<Customer[]>([]);
  const [items,        setItems]        = useState<Item[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState<SOStatus | ''>('');
  const [createOpen,   setCreateOpen]   = useState(false);
  const [actionBusy,   setActionBusy]   = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [raw, custs, its] = await Promise.all([
        salesOrdersApi.getAll(),
        customersApi.getAll(),
        itemsApi.getAll(),
      ]);
      setOrders(extractList(raw as unknown));
      setCustomers(custs);
      setItems(its);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load data.';
      setError(message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filtered = orders.filter(o => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      o.soNumber.toLowerCase().includes(q) ||
      (o.customer?.name ?? '').toLowerCase().includes(q) ||
      (o.customerPo ?? '').toLowerCase().includes(q);
    const matchStatus = !statusFilter || o.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleStatusChange = async (id: string, status: string) => {
    setActionBusy(id);
    try {
      await salesOrdersApi.updateStatus(id, status as 'confirmed' | 'shipped' | 'delivered' | 'closed');
      fetchAll();
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
      setError(msg || 'Status update failed.');
    } finally { setActionBusy(null); }
  };

  const allStatuses: SOStatus[] = ['draft', 'confirmed', 'shipped', 'delivered', 'closed'];
  const counts = Object.fromEntries(allStatuses.map(s => [s, orders.filter(o => o.status === s).length])) as Record<SOStatus, number>;

  return (
    <ERPShell breadcrumbs={['Home', 'Sales', 'Sales Orders']} title="Sales Orders">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap');
        .so-page { padding: 0 18px 24px; }
        .so-stats { display:flex; gap:8px; margin-bottom:14px; flex-wrap:wrap; }
        .so-stat { background:rgba(10,7,18,0.7); border-radius:8px; padding:7px 12px; display:flex; flex-direction:column; gap:2px; min-width:80px; cursor:pointer; transition:opacity 0.15s; }
        .so-stat:hover { opacity:0.8; }
        .so-stat-label { font-size:10px; font-weight:500; letter-spacing:0.08em; text-transform:uppercase; }
        .so-stat-value { font-size:20px; font-weight:500; font-family:'IBM Plex Mono',monospace; color:#f1ede8; }
        .so-toolbar { display:flex; align-items:center; gap:10px; margin-bottom:14px; flex-wrap:wrap; }
        .so-search { background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.09); border-radius:7px; padding:7px 12px; font-size:12px; font-family:'IBM Plex Sans',sans-serif; color:#e2dfd8; outline:none; width:240px; }
        .so-search::placeholder { color:rgba(255,255,255,0.2); }
        .so-search:focus { border-color:rgba(251,146,60,0.4); box-shadow:0 0 0 2px rgba(234,88,12,0.08); }
        .so-filter { background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.09); border-radius:7px; padding:7px 12px; font-size:12px; font-family:'IBM Plex Sans',sans-serif; color:#e2dfd8; outline:none; }
        .so-filter option { background:#0e0b1a; color:#f1ede8; }
        .so-btn-new { display:flex; align-items:center; gap:6px; margin-left:auto; background:linear-gradient(135deg,#c2410c,#ea580c,#f97316); border:none; border-radius:7px; padding:7px 14px; font-size:12px; font-weight:500; font-family:'IBM Plex Sans',sans-serif; color:white; cursor:pointer; box-shadow:0 3px 12px rgba(234,88,12,0.3); transition:opacity 0.15s, transform 0.15s; flex-shrink:0; }
        .so-btn-new:hover { opacity:0.88; transform:translateY(-1px); }
        .so-btn-new svg { width:13px; height:13px; display:block; flex-shrink:0; }
        .so-wrap { background:rgba(10,7,18,0.7); border:0.5px solid rgba(251,146,60,0.12); border-radius:10px; overflow:hidden; }
        .so-table { width:100%; border-collapse:collapse; }
        .so-table thead th { padding:9px 14px; font-size:10px; font-weight:500; letter-spacing:0.1em; text-transform:uppercase; color:rgba(251,146,60,0.55); background:rgba(251,146,60,0.05); border-bottom:0.5px solid rgba(255,255,255,0.06); text-align:left; white-space:nowrap; }
        .so-table tbody td { padding:10px 14px; border-bottom:0.5px solid rgba(255,255,255,0.04); vertical-align:middle; font-size:13px; }
        .so-table tbody tr:last-child td { border-bottom:none; }
        .so-table tbody tr:hover td { background:rgba(251,146,60,0.03); }
        .so-empty, .so-loading { text-align:center; padding:52px 24px; color:rgba(255,255,255,0.25); font-size:13px; display:flex; flex-direction:column; align-items:center; gap:10px; }
        .so-spinner { width:18px; height:18px; border-radius:50%; border:2px solid rgba(251,146,60,0.2); border-top-color:#fb923c; animation:so-spin 0.7s linear infinite; flex-shrink:0; }
        @keyframes so-spin { to { transform:rotate(360deg); } }
        .so-footer { font-size:11px; color:rgba(255,255,255,0.22); padding:8px 14px; border-top:0.5px solid rgba(255,255,255,0.04); }
        .so-error { background:rgba(239,68,68,0.08); border:0.5px solid rgba(239,68,68,0.2); border-radius:8px; padding:10px 14px; margin-bottom:14px; font-size:13px; color:#fca5a5; }
      `}</style>

      <div className="so-page">

        {/* Stats */}
        {orders.length > 0 && (
          <div className="so-stats">
            {allStatuses.map(s => {
              const style = STATUS_STYLE[s];
              return (
                <div key={s} className="so-stat"
                  style={{ border: `0.5px solid ${statusFilter === s ? style.border : 'rgba(255,255,255,0.07)'}` }}
                  onClick={() => setStatusFilter(prev => (prev === s ? '' : (s as SOStatus)))}
                >
                  <span className="so-stat-label" style={{ color: style.color }}>{s.charAt(0).toUpperCase() + s.slice(1)}</span>
                  <span className="so-stat-value">{counts[s]}</span>
                </div>
              );
            })}
            <div className="so-stat"
              style={{ border: `0.5px solid ${!statusFilter ? 'rgba(251,146,60,0.3)' : 'rgba(255,255,255,0.07)'}` }}
              onClick={() => setStatusFilter('')}
            >
              <span className="so-stat-label" style={{ color: 'rgba(251,146,60,0.6)' }}>Total</span>
              <span className="so-stat-value" style={{ color: '#fb923c' }}>{orders.length}</span>
            </div>
          </div>
        )}

        <div className="so-toolbar">
          <input className="so-search" placeholder="Search by SO#, customer, PO#…" value={search} onChange={e => setSearch(e.target.value)} />
          <select className="so-filter" value={statusFilter} onChange={e => setStatusFilter(e.target.value as SOStatus | '')}>
            <option value="">All Status</option>
            {allStatuses.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
          <button className="so-btn-new" onClick={() => setCreateOpen(true)}>
            <svg viewBox="0 0 13 13" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
              <line x1="6.5" y1="1" x2="6.5" y2="12" /><line x1="1" y1="6.5" x2="12" y2="6.5" />
            </svg>
            New SO
          </button>
        </div>

        {error && <div className="so-error">{error}</div>}

        <div className="so-wrap">
          {loading ? (
            <div className="so-loading"><div className="so-spinner" />Loading sales orders…</div>
          ) : filtered.length === 0 ? (
            <div className="so-empty">{search || statusFilter ? 'No orders match your filters.' : 'No sales orders yet.'}</div>
          ) : (
            <>
              <table className="so-table">
                <thead>
                  <tr>
                    <th>SO Number</th>
                    <th>Customer / PO</th>
                    <th>Order Date</th>
                    <th>Promised</th>
                    <th>Lines</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                    <th>Currency</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(so => (
                    <SORow key={so.id} so={so} onStatusChange={handleStatusChange} actionBusy={actionBusy} />
                  ))}
                </tbody>
              </table>
              <div className="so-footer">
                {filtered.length} of {orders.length} sales order{orders.length !== 1 ? 's' : ''}
              </div>
            </>
          )}
        </div>
      </div>

      <CreateSOModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={fetchAll}
        customers={customers}
        items={items}
      />
    </ERPShell>
  );
}