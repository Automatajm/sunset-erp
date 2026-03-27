"use client";

import { useEffect, useState, useCallback } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import { apInvoicesApi } from '@/lib/api/ap-invoices';
import { suppliersApi } from '@/lib/api/suppliers';
import { purchaseOrdersApi } from '@/lib/api/purchase-orders';

// ─── Types ────────────────────────────────────────────────────────────────────

interface APLine {
  id: string; lineNumber: number;
  item?: { id: string; code: string; name: string };
  description?: string;
  quantity: string; uom?: string;
  unitPrice: string; originalPoPrice?: string;
  discountPercent: string; lineTotal: string;
  priceVariance?: string;
}

interface APInvoice {
  id: string; invoiceNumber: string;
  supplier?: { id: string; code: string; name: string };
  purchaseOrder?: { id: string; poNumber: string };
  supplierRef?: string;
  invoiceDate: string; dueDate: string;
  status: string;
  subtotal: string; taxAmount: string; totalAmount: string; paidAmount: string;
  currency: string; notes?: string;
  lines?: APLine[];
  payments?: Array<{ id: string; paymentNumber: string; paymentDate: string; amount: string; paymentMethod?: string }>;
  _count?: { lines: number; payments: number };
}

interface KPIs {
  totalInvoiced: number; totalPaid: number;
  totalPending: number; totalOverdue: number; paymentRate: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtAmt(v: string | number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(v));
}
function fmtDate(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function daysUntil(d: string) {
  const diff = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
  return diff;
}

const MONO: React.CSSProperties = { fontFamily: "'IBM Plex Mono',monospace", fontSize: 12 };

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  draft:   { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.2)' },
  posted:  { color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',  border: 'rgba(96,165,250,0.2)' },
  partial: { color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.2)' },
  paid:    { color: '#4ade80', bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.2)' },
  void:    { color: 'rgba(255,255,255,0.3)', bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.1)' },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.draft;
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'2px 9px', borderRadius:20, fontSize:11, fontWeight:500, color:s.color, background:s.bg, border:`0.5px solid ${s.border}`, whiteSpace:'nowrap' }}>
      <span style={{ width:5, height:5, borderRadius:'50%', background:s.color, flexShrink:0 }} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// ─── AP Invoice Row ───────────────────────────────────────────────────────────

function APRow({ inv, onAction, actionBusy }: {
  inv: APInvoice;
  onAction: (id: string, action: 'post' | 'pay' | 'void') => void;
  actionBusy: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<APInvoice | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const busy = actionBusy === inv.id;
  const days = daysUntil(inv.dueDate);
  const outstanding = Number(inv.totalAmount) - Number(inv.paidAmount);

  const handleExpand = async () => {
    if (!expanded && !detail) {
      setLoadingDetail(true);
      try { setDetail(await apInvoicesApi.getById(inv.id) as APInvoice); }
      finally { setLoadingDetail(false); }
    }
    setExpanded(e => !e);
  };

  return (
    <>
      <tr style={{ cursor: 'pointer' }} onClick={handleExpand}>
        <td>
          <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
            <span style={{ fontSize:9, color:'rgba(255,255,255,0.3)', transform:expanded?'rotate(90deg)':'none', display:'inline-block', transition:'transform 0.15s' }}>▶</span>
            <span style={{ ...MONO, color:'#a78bfa', fontWeight:500 }}>{inv.invoiceNumber}</span>
          </span>
        </td>
        <td>
          <span style={{ color:'#e2dfd8', fontWeight:500 }}>{inv.supplier?.name ?? '—'}</span>
          {inv.purchaseOrder && <div style={{ fontSize:11, color:'rgba(167,139,250,0.55)', marginTop:1 }}>PO: {inv.purchaseOrder.poNumber}</div>}
          {inv.supplierRef && <div style={{ fontSize:11, color:'rgba(255,255,255,0.3)', marginTop:1 }}>Ref: {inv.supplierRef}</div>}
        </td>
        <td><span style={{ fontSize:12, color:'rgba(255,255,255,0.5)' }}>{fmtDate(inv.invoiceDate)}</span></td>
        <td>
          <span style={{ fontSize:12, color: days < 0 ? '#f87171' : days <= 7 ? '#fbbf24' : 'rgba(255,255,255,0.5)' }}>
            {fmtDate(inv.dueDate)}
            {inv.status !== 'paid' && inv.status !== 'void' && (
              <span style={{ fontSize:10, marginLeft:5, color: days < 0 ? '#f87171' : days <= 7 ? '#fbbf24' : 'rgba(255,255,255,0.3)' }}>
                {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'today' : `${days}d`}
              </span>
            )}
          </span>
        </td>
        <td style={{ textAlign:'right' }}>
          <span style={{ ...MONO, color:'#e2dfd8' }}>{fmtAmt(inv.totalAmount)}</span>
          {outstanding > 0.01 && inv.status !== 'draft' && (
            <div style={{ fontSize:10, color:'#f87171', marginTop:1 }}>Due: {fmtAmt(outstanding)}</div>
          )}
        </td>
        <td><StatusBadge status={inv.status} /></td>
        <td onClick={e => e.stopPropagation()}>
          <div style={{ display:'flex', gap:5 }}>
            {inv.status === 'draft' && (
              <button onClick={() => onAction(inv.id, 'post')} disabled={busy} style={{ padding:'4px 9px', borderRadius:6, fontSize:11, cursor:'pointer', color:'#60a5fa', background:'rgba(96,165,250,0.1)', border:'0.5px solid rgba(96,165,250,0.2)', fontFamily:"'IBM Plex Sans',sans-serif", opacity:busy?0.5:1 }}>
                {busy ? '…' : 'Post'}
              </button>
            )}
            {['posted', 'partial'].includes(inv.status) && (
              <button onClick={() => onAction(inv.id, 'pay')} disabled={busy} style={{ padding:'4px 9px', borderRadius:6, fontSize:11, cursor:'pointer', color:'#4ade80', background:'rgba(74,222,128,0.1)', border:'0.5px solid rgba(74,222,128,0.2)', fontFamily:"'IBM Plex Sans',sans-serif", opacity:busy?0.5:1 }}>
                {busy ? '…' : 'Pay'}
              </button>
            )}
            {['draft', 'posted'].includes(inv.status) && (
              <button onClick={() => onAction(inv.id, 'void')} disabled={busy} style={{ padding:'4px 9px', borderRadius:6, fontSize:11, cursor:'pointer', color:'#f87171', background:'rgba(248,113,113,0.08)', border:'0.5px solid rgba(248,113,113,0.2)', fontFamily:"'IBM Plex Sans',sans-serif", opacity:busy?0.5:1 }}>
                {busy ? '…' : 'Void'}
              </button>
            )}
          </div>
        </td>
      </tr>

      {expanded && (
        <tr>
          <td colSpan={7} style={{ padding:0, background:'rgba(167,139,250,0.01)' }}>
            {loadingDetail ? (
              <div style={{ padding:'16px 40px', fontSize:12, color:'rgba(255,255,255,0.3)' }}>Loading…</div>
            ) : detail ? (
              <div style={{ padding:'12px 40px 16px' }}>
                {/* Lines */}
                {detail.lines && detail.lines.length > 0 && (
                  <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:12 }}>
                    <thead>
                      <tr>{['#','Item','Description','Qty','UOM','PO Price','Invoice Price','Variance','Line Total'].map(h => (
                        <th key={h} style={{ padding:'5px 10px', fontSize:10, color:'rgba(255,255,255,0.3)', fontWeight:500, letterSpacing:'0.08em', textTransform:'uppercase', textAlign:['Qty','PO Price','Invoice Price','Variance','Line Total'].includes(h)?'right':'left', borderBottom:'0.5px solid rgba(255,255,255,0.04)' }}>{h}</th>
                      ))}</tr>
                    </thead>
                    <tbody>
                      {detail.lines.map(line => {
                        const variance = Number(line.priceVariance ?? 0);
                        return (
                          <tr key={line.id}>
                            <td style={{ padding:'6px 10px', fontSize:11, color:'rgba(255,255,255,0.3)' }}>{line.lineNumber}</td>
                            <td style={{ padding:'6px 10px' }}><span style={{ ...MONO, color:'#a78bfa' }}>{line.item?.code ?? '—'}</span></td>
                            <td style={{ padding:'6px 10px', fontSize:12, color:'rgba(255,255,255,0.45)' }}>{line.description || '—'}</td>
                            <td style={{ padding:'6px 10px', textAlign:'right', ...MONO }}>{line.quantity}</td>
                            <td style={{ padding:'6px 10px', fontSize:12, color:'rgba(255,255,255,0.45)' }}>{line.uom ?? '—'}</td>
                            <td style={{ padding:'6px 10px', textAlign:'right', ...MONO, color:'rgba(255,255,255,0.4)' }}>{line.originalPoPrice ? fmtAmt(line.originalPoPrice) : '—'}</td>
                            <td style={{ padding:'6px 10px', textAlign:'right', ...MONO }}>{fmtAmt(line.unitPrice)}</td>
                            <td style={{ padding:'6px 10px', textAlign:'right', fontSize:11, color: variance > 0 ? '#f87171' : variance < 0 ? '#4ade80' : 'rgba(255,255,255,0.3)' }}>
                              {variance !== 0 ? `${variance > 0 ? '+' : ''}${fmtAmt(variance)}` : '—'}
                            </td>
                            <td style={{ padding:'6px 10px', textAlign:'right', ...MONO, color:'#e2dfd8', fontWeight:500 }}>{fmtAmt(line.lineTotal)}</td>
                          </tr>
                        );
                      })}
                      <tr style={{ borderTop:'0.5px solid rgba(255,255,255,0.08)' }}>
                        <td colSpan={8} style={{ padding:'7px 10px', fontSize:11, color:'rgba(255,255,255,0.3)', fontWeight:500 }}>TOTAL</td>
                        <td style={{ padding:'7px 10px', textAlign:'right', ...MONO, color:'#a78bfa', fontWeight:600, fontSize:13 }}>{fmtAmt(detail.totalAmount)}</td>
                      </tr>
                    </tbody>
                  </table>
                )}
                {/* Payments */}
                {detail.payments && detail.payments.length > 0 && (
                  <div>
                    <div style={{ fontSize:10, fontWeight:500, letterSpacing:'0.1em', textTransform:'uppercase', color:'rgba(74,222,128,0.5)', marginBottom:6 }}>Payments</div>
                    <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                      {detail.payments.map(p => (
                        <div key={p.id} style={{ background:'rgba(74,222,128,0.06)', border:'0.5px solid rgba(74,222,128,0.15)', borderRadius:7, padding:'6px 12px', fontSize:11 }}>
                          <span style={{ ...MONO, color:'#4ade80' }}>{fmtAmt(p.amount)}</span>
                          <span style={{ color:'rgba(255,255,255,0.3)', marginLeft:8 }}>{fmtDate(p.paymentDate)}</span>
                          {p.paymentMethod && <span style={{ color:'rgba(255,255,255,0.25)', marginLeft:8 }}>{p.paymentMethod}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Payment Modal ────────────────────────────────────────────────────────────

function PaymentModal({ inv, onClose, onSaved }: { inv: APInvoice; onClose: () => void; onSaved: () => void }) {
  const outstanding = Number(inv.totalAmount) - Number(inv.paidAmount);
  const [form, setForm] = useState({ paymentDate: new Date().toISOString().split('T')[0], amount: outstanding.toFixed(2), paymentMethod: 'wire', reference: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(f => ({ ...f, [k]: e.target.value }));
  const INPUT: React.CSSProperties = { background:'rgba(255,255,255,0.04)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:7, padding:'8px 12px', fontSize:12, fontFamily:"'IBM Plex Sans',sans-serif", color:'#f1ede8', outline:'none', width:'100%' };
  const LABEL = { fontSize:10, fontWeight:500 as const, letterSpacing:'0.08em' as const, textTransform:'uppercase' as const, color:'rgba(251,146,60,0.6)', fontFamily:"'IBM Plex Sans',sans-serif" };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (Number(form.amount) <= 0) { setError('Amount must be greater than 0.'); return; }
    setBusy(true); setError('');
    try {
      await apInvoicesApi.applyPayment(inv.id, { paymentDate: form.paymentDate, amount: Number(form.amount), paymentMethod: form.paymentMethod || undefined, reference: form.reference || undefined, notes: form.notes || undefined });
      onSaved(); onClose();
    } catch (err) { setError((err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Payment failed.'); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ position:'fixed', inset:0, zIndex:400, background:'rgba(0,0,0,0.65)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ background:'#0e0b1a', border:'0.5px solid rgba(74,222,128,0.2)', borderRadius:14, width:'100%', maxWidth:460, boxShadow:'0 24px 60px rgba(0,0,0,0.7)' }}>
        <div style={{ position:'absolute', top:0, left:30, right:30, height:1, background:'linear-gradient(90deg,transparent,rgba(74,222,128,0.4),transparent)' }} />
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px 12px', borderBottom:'0.5px solid rgba(255,255,255,0.06)' }}>
          <div>
            <div style={{ fontSize:14, fontWeight:500, color:'#f1ede8', fontFamily:"'IBM Plex Sans',sans-serif" }}>Apply Payment</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.35)', marginTop:2 }}>{inv.invoiceNumber} · Outstanding: {fmtAmt(outstanding)}</div>
          </div>
          <button onClick={onClose} style={{ width:24, height:24, borderRadius:6, background:'rgba(255,255,255,0.06)', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.45)', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ padding:'16px 20px', display:'flex', flexDirection:'column', gap:12 }}>
            {error && <div style={{ background:'rgba(239,68,68,0.1)', border:'0.5px solid rgba(239,68,68,0.25)', borderRadius:7, padding:'8px 12px', fontSize:12, color:'#fca5a5' }}>{error}</div>}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div style={{ display:'flex', flexDirection:'column', gap:5 }}><label style={LABEL}>Payment Date</label><input type="date" style={INPUT} value={form.paymentDate} onChange={set('paymentDate')} /></div>
              <div style={{ display:'flex', flexDirection:'column', gap:5 }}><label style={LABEL}>Amount ($)</label><input type="number" min="0.01" step="0.01" style={INPUT} value={form.amount} onChange={set('amount')} /></div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                <label style={LABEL}>Method</label>
                <select style={INPUT} value={form.paymentMethod} onChange={set('paymentMethod')}>
                  {['wire','ach','check','transfer','cash'].map(m => <option key={m} value={m}>{m.charAt(0).toUpperCase()+m.slice(1)}</option>)}
                </select>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:5 }}><label style={LABEL}>Reference</label><input style={INPUT} placeholder="WIRE-2026-001" value={form.reference} onChange={set('reference')} /></div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:5 }}><label style={LABEL}>Notes</label><input style={INPUT} placeholder="Payment notes" value={form.notes} onChange={set('notes')} /></div>
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8, padding:'12px 20px 18px', borderTop:'0.5px solid rgba(255,255,255,0.06)' }}>
            <button type="button" onClick={onClose} style={{ background:'rgba(255,255,255,0.05)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:7, padding:'8px 16px', fontSize:13, fontFamily:"'IBM Plex Sans',sans-serif", color:'rgba(255,255,255,0.5)', cursor:'pointer' }}>Cancel</button>
            <button type="submit" disabled={busy} style={{ background:'linear-gradient(135deg,#15803d,#16a34a,#22c55e)', border:'none', borderRadius:7, padding:'8px 20px', fontSize:13, fontWeight:500, fontFamily:"'IBM Plex Sans',sans-serif", color:'white', cursor:'pointer', opacity:busy?0.5:1 }}>
              {busy ? 'Processing…' : `Pay ${fmtAmt(form.amount)}`}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ApInvoicesPage() {
  const [invoices,     setInvoices]     = useState<APInvoice[]>([]);
  const [kpis,         setKpis]         = useState<KPIs | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [actionBusy,   setActionBusy]   = useState<string | null>(null);
  const [payingInv,    setPayingInv]    = useState<APInvoice | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [invData, kpiData] = await Promise.all([
        apInvoicesApi.getAll(),
        apInvoicesApi.getKpis(),
      ]);
      setInvoices(invData as APInvoice[]);
      setKpis(kpiData as KPIs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filtered = invoices.filter(inv => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      inv.invoiceNumber.toLowerCase().includes(q) ||
      (inv.supplier?.name ?? '').toLowerCase().includes(q) ||
      (inv.purchaseOrder?.poNumber ?? '').toLowerCase().includes(q) ||
      (inv.supplierRef ?? '').toLowerCase().includes(q);
    const matchStatus = !statusFilter || inv.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleAction = async (id: string, action: 'post' | 'pay' | 'void') => {
    if (action === 'pay') {
      const inv = invoices.find(i => i.id === id);
      if (inv) { setPayingInv(inv); return; }
    }
    setActionBusy(id);
    try {
      if (action === 'post') await apInvoicesApi.post(id);
      if (action === 'void') await apInvoicesApi.void(id);
      fetchAll();
    } catch (err) {
      setError((err as { response?: { data?: { message?: string } } }).response?.data?.message || `${action} failed.`);
    } finally { setActionBusy(null); }
  };

  const allStatuses = ['draft', 'posted', 'partial', 'paid', 'void'];
  const counts = Object.fromEntries(allStatuses.map(s => [s, invoices.filter(i => i.status === s).length]));

  return (
    <ERPShell breadcrumbs={['Home', 'Procurement', 'AP Invoices']} title="Accounts Payable Invoices">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap');
        .ap-page { padding: 0 18px 24px; }
        .ap-kpis { display:grid; grid-template-columns:repeat(5,1fr); gap:8px; margin-bottom:16px; }
        .ap-kpi { background:rgba(10,7,18,0.7); border:0.5px solid rgba(167,139,250,0.12); border-radius:9px; padding:10px 14px; }
        .ap-kpi-label { font-size:10px; font-weight:500; letter-spacing:0.08em; text-transform:uppercase; color:rgba(167,139,250,0.5); margin-bottom:4px; }
        .ap-kpi-value { font-size:18px; font-weight:500; font-family:'IBM Plex Mono',monospace; color:#f1ede8; }
        .ap-stats { display:flex; gap:8px; margin-bottom:14px; flex-wrap:wrap; }
        .ap-stat { background:rgba(10,7,18,0.7); border-radius:8px; padding:6px 12px; display:flex; flex-direction:column; gap:2px; cursor:pointer; transition:opacity 0.15s; }
        .ap-stat:hover { opacity:0.8; }
        .ap-stat-label { font-size:10px; font-weight:500; letter-spacing:0.08em; text-transform:uppercase; }
        .ap-stat-value { font-size:18px; font-weight:500; font-family:'IBM Plex Mono',monospace; color:#f1ede8; }
        .ap-toolbar { display:flex; align-items:center; gap:10px; margin-bottom:14px; }
        .ap-search { background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.09); border-radius:7px; padding:7px 12px; font-size:12px; font-family:'IBM Plex Sans',sans-serif; color:#e2dfd8; outline:none; width:260px; }
        .ap-search::placeholder { color:rgba(255,255,255,0.2); }
        .ap-search:focus { border-color:rgba(167,139,250,0.4); }
        .ap-filter { background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.09); border-radius:7px; padding:7px 12px; font-size:12px; font-family:'IBM Plex Sans',sans-serif; color:#e2dfd8; outline:none; }
        .ap-filter option { background:#0e0b1a; }
        .ap-wrap { background:rgba(10,7,18,0.7); border:0.5px solid rgba(167,139,250,0.12); border-radius:10px; overflow:hidden; }
        .ap-table { width:100%; border-collapse:collapse; }
        .ap-table thead th { padding:9px 14px; font-size:10px; font-weight:500; letter-spacing:0.1em; text-transform:uppercase; color:rgba(167,139,250,0.55); background:rgba(167,139,250,0.05); border-bottom:0.5px solid rgba(255,255,255,0.06); text-align:left; white-space:nowrap; }
        .ap-table tbody td { padding:10px 14px; border-bottom:0.5px solid rgba(255,255,255,0.04); vertical-align:middle; font-size:13px; }
        .ap-table tbody tr:last-child td { border-bottom:none; }
        .ap-table tbody tr:hover td { background:rgba(167,139,250,0.02); }
        .ap-empty, .ap-loading { text-align:center; padding:52px 24px; color:rgba(255,255,255,0.25); font-size:13px; display:flex; flex-direction:column; align-items:center; gap:10px; }
        .ap-spinner { width:18px; height:18px; border-radius:50%; border:2px solid rgba(167,139,250,0.2); border-top-color:#a78bfa; animation:ap-spin 0.7s linear infinite; }
        @keyframes ap-spin { to { transform:rotate(360deg); } }
        .ap-footer { font-size:11px; color:rgba(255,255,255,0.22); padding:8px 14px; border-top:0.5px solid rgba(255,255,255,0.04); }
        .ap-error { background:rgba(239,68,68,0.08); border:0.5px solid rgba(239,68,68,0.2); border-radius:8px; padding:10px 14px; margin-bottom:14px; font-size:13px; color:#fca5a5; }
      `}</style>

      <div className="ap-page">

        {/* KPI Cards */}
        {kpis && (
          <div className="ap-kpis">
            {[
              { label: 'Total Invoiced', value: fmtAmt(kpis.totalInvoiced), color: '#a78bfa' },
              { label: 'Total Paid',     value: fmtAmt(kpis.totalPaid),     color: '#4ade80' },
              { label: 'Pending',        value: fmtAmt(kpis.totalPending),  color: '#fbbf24' },
              { label: 'Overdue',        value: fmtAmt(kpis.totalOverdue),  color: '#f87171' },
              { label: 'Payment Rate',   value: `${kpis.paymentRate.toFixed(1)}%`, color: kpis.paymentRate >= 80 ? '#4ade80' : '#fbbf24' },
            ].map(k => (
              <div key={k.label} className="ap-kpi">
                <div className="ap-kpi-label">{k.label}</div>
                <div className="ap-kpi-value" style={{ color: k.color }}>{k.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Status filter pills */}
        {invoices.length > 0 && (
          <div className="ap-stats">
            {allStatuses.map(s => {
              const style = STATUS_STYLE[s];
              return (
                <div key={s} className="ap-stat"
                  style={{ border:`0.5px solid ${statusFilter === s ? style.border : 'rgba(255,255,255,0.07)'}` }}
                  onClick={() => setStatusFilter(prev => prev === s ? '' : s)}
                >
                  <span className="ap-stat-label" style={{ color: style.color }}>{s.charAt(0).toUpperCase()+s.slice(1)}</span>
                  <span className="ap-stat-value">{counts[s]}</span>
                </div>
              );
            })}
            <div className="ap-stat"
              style={{ border:`0.5px solid ${!statusFilter ? 'rgba(167,139,250,0.3)' : 'rgba(255,255,255,0.07)'}` }}
              onClick={() => setStatusFilter('')}
            >
              <span className="ap-stat-label" style={{ color:'rgba(167,139,250,0.6)' }}>Total</span>
              <span className="ap-stat-value" style={{ color:'#a78bfa' }}>{invoices.length}</span>
            </div>
          </div>
        )}

        <div className="ap-toolbar">
          <input className="ap-search" placeholder="Search by invoice#, supplier, PO, ref…" value={search} onChange={e => setSearch(e.target.value)} />
          <select className="ap-filter" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="">All Status</option>
            {allStatuses.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase()+s.slice(1)}</option>)}
          </select>
        </div>

        {error && <div className="ap-error">{error}</div>}

        <div className="ap-wrap">
          {loading ? (
            <div className="ap-loading"><div className="ap-spinner" />Loading AP invoices…</div>
          ) : filtered.length === 0 ? (
            <div className="ap-empty">{search || statusFilter ? 'No invoices match your filters.' : 'No AP invoices yet. Post a Purchase Order to generate one.'}</div>
          ) : (
            <>
              <table className="ap-table">
                <thead>
                  <tr>
                    <th>Invoice #</th>
                    <th>Supplier / PO</th>
                    <th>Invoice Date</th>
                    <th>Due Date</th>
                    <th style={{ textAlign:'right' }}>Amount</th>
                    <th>Status</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(inv => (
                    <APRow key={inv.id} inv={inv} onAction={handleAction} actionBusy={actionBusy} />
                  ))}
                </tbody>
              </table>
              <div className="ap-footer">{filtered.length} of {invoices.length} AP invoice{invoices.length !== 1 ? 's' : ''}</div>
            </>
          )}
        </div>
      </div>

      {payingInv && (
        <PaymentModal
          inv={payingInv}
          onClose={() => setPayingInv(null)}
          onSaved={() => { setPayingInv(null); fetchAll(); }}
        />
      )}
    </ERPShell>
  );
}