"use client";

import { useEffect, useState, useCallback } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import { purchaseOrdersApi } from '@/lib/api/purchase-orders';
import { suppliersApi } from '@/lib/api/suppliers';
import { itemsApi } from '@/lib/api/items';
import { Supplier, Item, POStatus } from '@/lib/api/types';

// ─── Real backend types ───────────────────────────────────────────────────────

interface POLine {
  id: string;
  lineNumber: number;
  itemId: string;
  item?: { id: string; code: string; name: string; baseUom: string };
  description?: string;
  orderedQuantity: string;
  receivedQuantity: string;
  uom: string;
  unitPrice: string;
  discountPercent: string;
  lineTotal: string;
  expectedDate?: string;
  status: string;
}

interface PO {
  id: string;
  poNumber: string;
  supplierId: string;
  supplier?: { id: string; code: string; name: string; email?: string; phone?: string };
  poDate: string;
  expectedDate?: string;
  deliveryAddress?: string;
  paymentTerms?: string;
  currency?: string;
  subtotal: string;
  discountAmount: string;
  taxAmount: string;
  total: string;
  status: POStatus;
  notes?: string;
  lines?: POLine[];
  _count?: { lines: number };
  createdAt: string;
}

interface NewPOLine {
  itemId: string;
  description: string;
  orderedQuantity: string;
  uom: string;
  unitPrice: string;
  discountPercent: string;
  expectedDate: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractList(data: unknown): PO[] {
  if (Array.isArray(data)) return data as PO[];
  const d = data as Record<string, unknown>;
  if (d?.value && Array.isArray(d.value)) return d.value as PO[];
  return [];
}

function fmtAmt(v: string | number) {
  const n = Number(v);
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function fmtDate(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const EMPTY_LINE: NewPOLine = {
  itemId: '', description: '', orderedQuantity: '', uom: '',
  unitPrice: '', discountPercent: '0', expectedDate: '',
};

// ─── Status badge ─────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<POStatus, { color: string; bg: string; border: string }> = {
  draft:    { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.2)' },
  approved: { color: '#4ade80', bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.2)' },
  rejected: { color: '#f87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.2)' },
  closed:   { color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',  border: 'rgba(96,165,250,0.2)' },
};

function StatusBadge({ status }: { status: POStatus }) {
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

// ─── PO row with expandable detail ───────────────────────────────────────────

function PORow({ po, onStatusChange, actionBusy }: {
  po: PO;
  onStatusChange: (id: string, status: string) => void;
  actionBusy: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<PO | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const busy = actionBusy === po.id;
  const lineCount = po._count?.lines ?? po.lines?.length ?? 0;

  const handleExpand = async () => {
    if (!expanded && !detail) {
      setLoadingDetail(true);
      try {
        const d = await purchaseOrdersApi.getById(po.id);
        setDetail(d as PO);
      } finally { setLoadingDetail(false); }
    }
    setExpanded(e => !e);
  };

  const MONO = { fontFamily: "'IBM Plex Mono',monospace", fontSize: 12 } as React.CSSProperties;

  return (
    <>
      <tr style={{ cursor: 'pointer' }} onClick={handleExpand}>
        <td>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', transform: expanded ? 'rotate(90deg)' : 'none', display: 'inline-block', transition: 'transform 0.15s' }}>▶</span>
            <span style={{ ...MONO, color: '#fb923c', fontWeight: 500 }}>{po.poNumber}</span>
          </span>
        </td>
        <td><span style={{ color: '#e2dfd8', fontWeight: 500 }}>{po.supplier?.name ?? '—'}</span></td>
        <td><span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{fmtDate(po.poDate)}</span></td>
        <td><span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{fmtDate(po.expectedDate)}</span></td>
        <td><span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{lineCount} line{lineCount !== 1 ? 's' : ''}</span></td>
        <td style={{ textAlign: 'right' }}>
          <span style={{ ...MONO, color: '#e2dfd8' }}>{fmtAmt(po.total)}</span>
        </td>
        <td><span style={{ ...MONO, fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{po.currency ?? 'USD'}</span></td>
        <td><StatusBadge status={po.status} /></td>
        <td onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', gap: 5 }}>
            {po.status === 'draft' && (
              <>
                <button onClick={() => onStatusChange(po.id, 'approved')} disabled={busy} style={{ padding: '4px 9px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(74,222,128,0.1)', color: '#4ade80', border: '0.5px solid rgba(74,222,128,0.2)', fontFamily: "'IBM Plex Sans',sans-serif", opacity: busy ? 0.5 : 1 }}>{busy ? '…' : 'Approve'}</button>
                <button onClick={() => onStatusChange(po.id, 'rejected')} disabled={busy} style={{ padding: '4px 9px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(248,113,113,0.08)', color: '#f87171', border: '0.5px solid rgba(248,113,113,0.2)', fontFamily: "'IBM Plex Sans',sans-serif", opacity: busy ? 0.5 : 1 }}>Reject</button>
              </>
            )}
            {po.status === 'approved' && (
              <button onClick={() => onStatusChange(po.id, 'closed')} disabled={busy} style={{ padding: '4px 9px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(96,165,250,0.08)', color: '#60a5fa', border: '0.5px solid rgba(96,165,250,0.2)', fontFamily: "'IBM Plex Sans',sans-serif", opacity: busy ? 0.5 : 1 }}>{busy ? '…' : 'Close'}</button>
            )}
          </div>
        </td>
      </tr>

      {expanded && (
        <tr>
          <td colSpan={9} style={{ padding: 0, background: 'rgba(251,146,60,0.015)' }}>
            {loadingDetail ? (
              <div style={{ padding: '16px 40px', fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Loading lines…</div>
            ) : detail?.lines ? (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    {['#', 'Item', 'Description', 'Qty', 'UOM', 'Unit Price', 'Disc%', 'Line Total', 'Expected'].map(h => (
                      <th key={h} style={{ padding: '6px 14px 6px ' + (h === '#' ? '40px' : '14px'), fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: ['Qty','Unit Price','Disc%','Line Total'].includes(h) ? 'right' : 'left', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>{h}</th>
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
                      <td style={{ padding: '7px 14px', fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{line.uom}</td>
                      <td style={{ padding: '7px 14px', textAlign: 'right', ...MONO }}>{fmtAmt(line.unitPrice)}</td>
                      <td style={{ padding: '7px 14px', textAlign: 'right', fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{Number(line.discountPercent) > 0 ? `${line.discountPercent}%` : '—'}</td>
                      <td style={{ padding: '7px 14px', textAlign: 'right', ...MONO, color: '#e2dfd8', fontWeight: 500 }}>{fmtAmt(line.lineTotal)}</td>
                      <td style={{ padding: '7px 14px', fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{fmtDate(line.expectedDate)}</td>
                    </tr>
                  ))}
                  <tr style={{ borderTop: '0.5px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
                    <td colSpan={7} style={{ padding: '8px 14px', fontSize: 11, color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>TOTAL</td>
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

// ─── Create PO modal ──────────────────────────────────────────────────────────

function CreatePOModal({ open, onClose, onSaved, suppliers, items }: {
  open: boolean; onClose: () => void; onSaved: () => void;
  suppliers: Supplier[]; items: Item[];
}) {
  const [header, setHeader] = useState({
    supplierId: '', expectedDate: '', deliveryAddress: '', paymentTerms: '', currency: 'USD', notes: '',
  });
  const [lines, setLines] = useState<NewPOLine[]>([{ ...EMPTY_LINE }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setError('');
      setHeader({ supplierId: '', expectedDate: '', deliveryAddress: '', paymentTerms: 'Net 30', currency: 'USD', notes: '' });
      setLines([{ ...EMPTY_LINE }]);
    }
  }, [open]);

  const setH = (key: keyof typeof header) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setHeader(h => ({ ...h, [key]: e.target.value }));

  const setLine = (idx: number, key: keyof NewPOLine, value: string) =>
    setLines(ls => ls.map((l, i) => {
      if (i !== idx) return l;
      const updated = { ...l, [key]: value };
      if (key === 'itemId') {
        const item = items.find(it => it.id === value);
        if (item) updated.uom = item.baseUom;
      }
      return updated;
    }));

  const calcLineTotal = (line: NewPOLine) => {
    const qty = Number(line.orderedQuantity) || 0;
    const price = Number(line.unitPrice) || 0;
    const disc = Number(line.discountPercent) || 0;
    return qty * price * (1 - disc / 100);
  };

  const grandTotal = lines.reduce((s, l) => s + calcLineTotal(l), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!header.supplierId) { setError('Supplier is required.'); return; }
    const validLines = lines.filter(l => l.itemId && l.orderedQuantity && l.unitPrice);
    if (validLines.length === 0) { setError('At least one complete line is required.'); return; }
    setSubmitting(true); setError('');
    try {
      await purchaseOrdersApi.create({
        supplierId: header.supplierId,
        expectedDate: header.expectedDate || undefined,
        deliveryAddress: header.deliveryAddress || undefined,
        paymentTerms: header.paymentTerms || undefined,
        currency: header.currency,
        notes: header.notes || undefined,
        lines: validLines.map(l => ({
          itemId: l.itemId,
          description: l.description || undefined,
          orderedQuantity: Number(l.orderedQuantity),
          uom: l.uom,
          unitPrice: Number(l.unitPrice),
          discountPercent: Number(l.discountPercent) || undefined,
          expectedDate: l.expectedDate || undefined,
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
        .po-overlay { position:fixed; inset:0; z-index:400; background:rgba(0,0,0,0.7); backdrop-filter:blur(4px); display:flex; align-items:flex-start; justify-content:center; padding:20px; overflow-y:auto; }
        .po-box { background:#0e0b1a; border:0.5px solid rgba(251,146,60,0.2); border-radius:14px; width:100%; max-width:820px; margin:auto; position:relative; box-shadow:0 24px 60px rgba(0,0,0,0.7); }
        .po-box::before { content:''; position:absolute; top:0; left:30px; right:30px; height:1px; background:linear-gradient(90deg,transparent,rgba(251,146,60,0.4),transparent); }
        .po-lines-table { width:100%; border-collapse:collapse; }
        .po-lines-table th { font-size:10px; color:rgba(251,146,60,0.5); text-transform:uppercase; letter-spacing:0.08em; padding:5px 6px; text-align:left; border-bottom:0.5px solid rgba(255,255,255,0.06); white-space:nowrap; }
        .po-lines-table td { padding:4px 3px; vertical-align:middle; }
        .po-line-input { background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.1); border-radius:5px; padding:5px 7px; font-size:12px; font-family:'IBM Plex Sans',sans-serif; color:#f1ede8; outline:none; width:100%; }
        .po-line-select { background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.1); border-radius:5px; padding:5px 7px; font-size:12px; font-family:'IBM Plex Sans',sans-serif; color:#f1ede8; outline:none; width:100%; }
        .po-line-select option { background:#0e0b1a; }
        .po-section { font-size:10px; font-weight:500; letter-spacing:0.12em; text-transform:uppercase; color:rgba(255,255,255,0.25); padding:6px 0 4px; border-bottom:0.5px solid rgba(255,255,255,0.06); margin-top:4px; display:flex; align-items:center; justify-content:space-between; }
        .po-btn-add { background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.1); border-radius:5px; padding:4px 10px; font-size:11px; color:rgba(255,255,255,0.5); cursor:pointer; font-family:'IBM Plex Sans',sans-serif; }
        .po-btn-add:hover { background:rgba(255,255,255,0.08); }
        .po-btn-rm { width:20px; height:20px; border-radius:4px; background:rgba(239,68,68,0.1); border:0.5px solid rgba(239,68,68,0.2); color:#f87171; cursor:pointer; font-size:13px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
      `}</style>

      <div className="po-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="po-box">
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px 12px', borderBottom:'0.5px solid rgba(255,255,255,0.06)', position:'sticky', top:0, background:'#0e0b1a', zIndex:1, borderRadius:'14px 14px 0 0' }}>
            <span style={{ fontSize:14, fontWeight:500, color:'#f1ede8', fontFamily:"'IBM Plex Sans',sans-serif" }}>New Purchase Order</span>
            <button onClick={onClose} style={{ width:24, height:24, borderRadius:6, background:'rgba(255,255,255,0.06)', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.45)', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ padding:'16px 20px', display:'flex', flexDirection:'column', gap:12 }}>
              {error && <div style={{ background:'rgba(239,68,68,0.1)', border:'0.5px solid rgba(239,68,68,0.25)', borderRadius:7, padding:'8px 12px', fontSize:12, color:'#fca5a5' }}>{error}</div>}

              {/* Header */}
              <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', gap:10 }}>
                <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                  <label style={labelCls}>Supplier *</label>
                  <select value={header.supplierId} onChange={setH('supplierId')} style={{ ...inputCls, cursor:'pointer' }}>
                    <option value="">— Select supplier —</option>
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
                  </select>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                  <label style={labelCls}>Expected Date</label>
                  <input type="date" value={header.expectedDate} onChange={setH('expectedDate')} style={inputCls} />
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

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                  <label style={labelCls}>Payment Terms</label>
                  <input placeholder="Net 30" value={header.paymentTerms} onChange={setH('paymentTerms')} style={inputCls} />
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                  <label style={labelCls}>Delivery Address</label>
                  <input placeholder="123 Main St" value={header.deliveryAddress} onChange={setH('deliveryAddress')} style={inputCls} />
                </div>
              </div>

              <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                <label style={labelCls}>Notes</label>
                <input placeholder="Additional notes" value={header.notes} onChange={setH('notes')} style={inputCls} />
              </div>

              {/* Lines */}
              <div className="po-section">
                <span>Order Lines</span>
                <button type="button" className="po-btn-add" onClick={() => setLines(ls => [...ls, { ...EMPTY_LINE }])}>+ Add Line</button>
              </div>

              <table className="po-lines-table">
                <thead>
                  <tr>
                    <th style={{ width: 220 }}>Item *</th>
                    <th>Description</th>
                    <th style={{ width: 80 }}>Qty *</th>
                    <th style={{ width: 60 }}>UOM</th>
                    <th style={{ width: 90 }}>Price *</th>
                    <th style={{ width: 60 }}>Disc%</th>
                    <th style={{ width: 100 }}>Total</th>
                    <th style={{ width: 110 }}>Exp. Date</th>
                    <th style={{ width: 24 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => (
                    <tr key={idx}>
                      <td>
                        <select className="po-line-select" value={line.itemId} onChange={e => setLine(idx, 'itemId', e.target.value)}>
                          <option value="">— Item —</option>
                          {items.map(it => <option key={it.id} value={it.id}>{it.code} — {it.name}</option>)}
                        </select>
                      </td>
                      <td><input className="po-line-input" placeholder="Description" value={line.description} onChange={e => setLine(idx, 'description', e.target.value)} /></td>
                      <td><input className="po-line-input" type="number" min="0" step="0.001" placeholder="0" value={line.orderedQuantity} onChange={e => setLine(idx, 'orderedQuantity', e.target.value)} style={{ textAlign: 'right' }} /></td>
                      <td><input className="po-line-input" placeholder="PCS" value={line.uom} onChange={e => setLine(idx, 'uom', e.target.value)} /></td>
                      <td><input className="po-line-input" type="number" min="0" step="0.01" placeholder="0.00" value={line.unitPrice} onChange={e => setLine(idx, 'unitPrice', e.target.value)} style={{ textAlign: 'right' }} /></td>
                      <td><input className="po-line-input" type="number" min="0" max="100" step="0.1" placeholder="0" value={line.discountPercent} onChange={e => setLine(idx, 'discountPercent', e.target.value)} style={{ textAlign: 'right' }} /></td>
                      <td style={{ padding: '4px 6px', fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: '#e2dfd8', textAlign: 'right' }}>
                        {calcLineTotal(line) > 0 ? new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(calcLineTotal(line)) : '—'}
                      </td>
                      <td><input className="po-line-input" type="date" value={line.expectedDate} onChange={e => setLine(idx, 'expectedDate', e.target.value)} /></td>
                      <td>
                        {lines.length > 1 && (
                          <button type="button" className="po-btn-rm" onClick={() => setLines(ls => ls.filter((_, i) => i !== idx))}>×</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Grand total */}
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
                {submitting ? 'Creating…' : 'Create Purchase Order'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PurchaseOrdersPage() {
  const [orders,      setOrders]      = useState<PO[]>([]);
  const [suppliers,   setSuppliers]   = useState<Supplier[]>([]);
  const [items,       setItems]       = useState<Item[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [search,      setSearch]      = useState('');
  const [statusFilter,setStatusFilter]= useState<POStatus | ''>('');
  const [createOpen,  setCreateOpen]  = useState(false);
  const [actionBusy,  setActionBusy]  = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [raw, sups, its] = await Promise.all([
        purchaseOrdersApi.getAll(),
        suppliersApi.getAll(),
        itemsApi.getAll(),
      ]);
      setOrders(extractList(raw as unknown));
      setSuppliers(sups);
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
      o.poNumber.toLowerCase().includes(q) ||
      (o.supplier?.name ?? '').toLowerCase().includes(q) ||
      (o.notes ?? '').toLowerCase().includes(q);
    const matchStatus = !statusFilter || o.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleStatusChange = async (id: string, status: string) => {
    setActionBusy(id);
    try {
      await purchaseOrdersApi.updateStatus(id, status as 'approved' | 'rejected' | 'closed');
      fetchAll();
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
      setError(msg || 'Status update failed.');
    } finally { setActionBusy(null); }
  };

  // Summary counts
  const counts = {
    draft:    orders.filter(o => o.status === 'draft').length,
    approved: orders.filter(o => o.status === 'approved').length,
    rejected: orders.filter(o => o.status === 'rejected').length,
    closed:   orders.filter(o => o.status === 'closed').length,
  };

  return (
    <ERPShell breadcrumbs={['Home', 'Procurement', 'Purchase Orders']} title="Purchase Orders">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap');
        .po-page { padding: 0 18px 24px; }
        .po-stats { display:flex; gap:10px; margin-bottom:14px; flex-wrap:wrap; }
        .po-stat { background:rgba(10,7,18,0.7); border-radius:8px; padding:8px 14px; display:flex; flex-direction:column; gap:2px; min-width:90px; cursor:pointer; transition:opacity 0.15s; }
        .po-stat:hover { opacity:0.8; }
        .po-stat-label { font-size:10px; font-weight:500; letter-spacing:0.08em; text-transform:uppercase; }
        .po-stat-value { font-size:22px; font-weight:500; font-family:'IBM Plex Mono',monospace; color:#f1ede8; }
        .po-toolbar { display:flex; align-items:center; gap:10px; margin-bottom:14px; flex-wrap:wrap; }
        .po-search { background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.09); border-radius:7px; padding:7px 12px; font-size:12px; font-family:'IBM Plex Sans',sans-serif; color:#e2dfd8; outline:none; width:240px; }
        .po-search::placeholder { color:rgba(255,255,255,0.2); }
        .po-search:focus { border-color:rgba(251,146,60,0.4); box-shadow:0 0 0 2px rgba(234,88,12,0.08); }
        .po-filter { background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.09); border-radius:7px; padding:7px 12px; font-size:12px; font-family:'IBM Plex Sans',sans-serif; color:#e2dfd8; outline:none; }
        .po-filter option { background:#0e0b1a; color:#f1ede8; }
        .po-btn-new { display:flex; align-items:center; gap:6px; margin-left:auto; background:linear-gradient(135deg,#c2410c,#ea580c,#f97316); border:none; border-radius:7px; padding:7px 14px; font-size:12px; font-weight:500; font-family:'IBM Plex Sans',sans-serif; color:white; cursor:pointer; box-shadow:0 3px 12px rgba(234,88,12,0.3); transition:opacity 0.15s, transform 0.15s; flex-shrink:0; }
        .po-btn-new:hover { opacity:0.88; transform:translateY(-1px); }
        .po-btn-new svg { width:13px; height:13px; display:block; flex-shrink:0; }
        .po-wrap { background:rgba(10,7,18,0.7); border:0.5px solid rgba(251,146,60,0.12); border-radius:10px; overflow:hidden; }
        .po-table { width:100%; border-collapse:collapse; }
        .po-table thead th { padding:9px 14px; font-size:10px; font-weight:500; letter-spacing:0.1em; text-transform:uppercase; color:rgba(251,146,60,0.55); background:rgba(251,146,60,0.05); border-bottom:0.5px solid rgba(255,255,255,0.06); text-align:left; white-space:nowrap; }
        .po-table tbody td { padding:10px 14px; border-bottom:0.5px solid rgba(255,255,255,0.04); vertical-align:middle; font-size:13px; }
        .po-table tbody tr:last-child td { border-bottom:none; }
        .po-table tbody tr:hover td { background:rgba(251,146,60,0.03); }
        .po-empty, .po-loading { text-align:center; padding:52px 24px; color:rgba(255,255,255,0.25); font-size:13px; display:flex; flex-direction:column; align-items:center; gap:10px; }
        .po-spinner { width:18px; height:18px; border-radius:50%; border:2px solid rgba(251,146,60,0.2); border-top-color:#fb923c; animation:po-spin 0.7s linear infinite; flex-shrink:0; }
        @keyframes po-spin { to { transform:rotate(360deg); } }
        .po-footer { font-size:11px; color:rgba(255,255,255,0.22); padding:8px 14px; border-top:0.5px solid rgba(255,255,255,0.04); }
        .po-error { background:rgba(239,68,68,0.08); border:0.5px solid rgba(239,68,68,0.2); border-radius:8px; padding:10px 14px; margin-bottom:14px; font-size:13px; color:#fca5a5; }
      `}</style>

      <div className="po-page">

        {/* Stats */}
        {orders.length > 0 && (
          <div className="po-stats">
            {(Object.entries(counts) as [POStatus, number][]).map(([s, count]) => {
              const style = STATUS_STYLE[s];
              return (
                <div key={s} className="po-stat"
                  style={{ border: `0.5px solid ${statusFilter === s ? style.border : 'rgba(255,255,255,0.07)'}` }}
                  onClick={() => setStatusFilter(prev => prev === s ? '' : s)}
                >
                  <span className="po-stat-label" style={{ color: style.color }}>{s.charAt(0).toUpperCase() + s.slice(1)}</span>
                  <span className="po-stat-value">{count}</span>
                </div>
              );
            })}
            <div className="po-stat"
              style={{ border: `0.5px solid ${!statusFilter ? 'rgba(251,146,60,0.3)' : 'rgba(255,255,255,0.07)'}` }}
              onClick={() => setStatusFilter('')}
            >
              <span className="po-stat-label" style={{ color: 'rgba(251,146,60,0.6)' }}>Total</span>
              <span className="po-stat-value" style={{ color: '#fb923c' }}>{orders.length}</span>
            </div>
          </div>
        )}

        <div className="po-toolbar">
          <input className="po-search" placeholder="Search by PO#, supplier, notes…" value={search} onChange={e => setSearch(e.target.value)} />
          <select className="po-filter" value={statusFilter} onChange={e => setStatusFilter(e.target.value as POStatus | '')}>
            <option value="">All Status</option>
            <option value="draft">Draft</option>
            <option value="approved">Approved</option>
            <option value="rejected">Rejected</option>
            <option value="closed">Closed</option>
          </select>
          <button className="po-btn-new" onClick={() => setCreateOpen(true)}>
            <svg viewBox="0 0 13 13" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
              <line x1="6.5" y1="1" x2="6.5" y2="12" /><line x1="1" y1="6.5" x2="12" y2="6.5" />
            </svg>
            New PO
          </button>
        </div>

        {error && <div className="po-error">{error}</div>}

        <div className="po-wrap">
          {loading ? (
            <div className="po-loading"><div className="po-spinner" />Loading purchase orders…</div>
          ) : filtered.length === 0 ? (
            <div className="po-empty">{search || statusFilter ? 'No orders match your filters.' : 'No purchase orders yet.'}</div>
          ) : (
            <>
              <table className="po-table">
                <thead>
                  <tr>
                    <th>PO Number</th>
                    <th>Supplier</th>
                    <th>PO Date</th>
                    <th>Expected</th>
                    <th>Lines</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                    <th>Currency</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(po => (
                    <PORow key={po.id} po={po} onStatusChange={handleStatusChange} actionBusy={actionBusy} />
                  ))}
                </tbody>
              </table>
              <div className="po-footer">
                {filtered.length} of {orders.length} purchase order{orders.length !== 1 ? 's' : ''}
              </div>
            </>
          )}
        </div>
      </div>

      <CreatePOModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={fetchAll}
        suppliers={suppliers}
        items={items}
      />
    </ERPShell>
  );
}