// ============================================================================
// FILE: frontend/app/procurement/ap-invoices/page.tsx
// ============================================================================
"use client";

import { useEffect, useState, useCallback, useMemo } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import SearchSelect from '@/components/ui/SearchSelect';
import { ERPTable, ERPColumn } from '@/components/ui/ERPTable';
import {
  ERPFilterBar, ERPFilter, ERPFilterValues,
  useERPFilters, applyERPFilters, dateInSelection,
} from '@/components/ui/ERPFilterBar';
import { apInvoicesApi } from '@/lib/api/ap-invoices';
import { suppliersApi } from '@/lib/api/suppliers';
import { itemsApi } from '@/lib/api/items';
import { purchaseOrdersApi } from '@/lib/api/purchase-orders';
import { goodsReceiptsApi, GoodsReceipt } from '@/lib/api/goods-receipts';
import apiClient from '@/lib/api/client';
import { DateSelection } from '@/components/ui/ERPDatePicker';
import { PrintButton } from '@/components/print/PrintButton';
import { FormModal } from '@/components/ui/modal';

// ─── Types ────────────────────────────────────────────────────────────────────

interface APLine {
  id: string; lineNumber: number;
  item?: { id: string; code: string; name: string };
  description?: string;
  quantity: string; uom?: string;
  unitPrice: string; originalPoPrice?: string;
  discountPercent: string; lineTotal: string;
  priceVariance?: string;
  goodsReceiptLine?: { id: string; receivedQuantity: string; unitCost?: string };
}

interface APInvoice {
  id: string; invoiceNumber: string;
  supplier?: { id: string; code: string; name: string };
  purchaseOrder?: { id: string; poNumber: string };
  goodsReceipt?: { id: string; grnNumber: string; status: string; receivedDate: string };
  supplierRef?: string; grnId?: string;
  invoiceDate: string; dueDate: string; status: string;
  subtotal: string; taxAmount: string; totalAmount: string; paidAmount: string;
  currency: string; notes?: string;
  lines?: APLine[];
  payments?: Array<{ id: string; paymentNumber: string; paymentDate: string; amount: string; paymentMethod?: string }>;
  _count?: { lines: number; payments: number };
}

interface Supplier { id: string; code: string; name: string; }
interface Item     { id: string; code: string; name: string; baseUom: string; isPurchasable?: boolean; }
interface PODetail {
  id: string; poNumber: string; status: string;
  supplier?: { id: string; code: string; name: string };
  lines?: Array<{ id: string; itemId: string; item?: { code: string; name: string; baseUom: string }; orderedQuantity: string; receivedQuantity: string; uom: string; unitPrice: string; discountPercent: string; }>;
}
interface PO { id: string; poNumber: string; supplier?: { name: string } }
interface GRNOption { id: string; grnNumber: string; supplierName?: string; warehouseCode: string; }

interface MatchLine {
  lineNumber: number; itemCode: string; itemName: string;
  invoiceQty: number; invoicePrice: number;
  poQty: number | null; poPrice: number | null; grnQty: number | null;
  poQtyOk: boolean | null; grnQtyOk: boolean | null; priceOk: boolean | null;
  priceDiffPct: number | null; lineMatches: boolean; issues: string[];
}

interface MatchStatus {
  matchStatus: 'no_match' | 'two_way' | 'three_way_matched' | 'three_way_failed';
  allLinesMatch: boolean; priceTolerance: string;
  purchaseOrder?: { poNumber: string; status: string };
  goodsReceipt?: { grnNumber: string; status: string; receivedDate: string; condition: string };
  lines: MatchLine[];
  summary: { total: number; matched: number; failed: number };
  canPost: boolean;
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
function fmtDateShort(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function daysUntil(d: string) {
  return Math.ceil((new Date(d).getTime() - Date.now()) / 86400000);
}

const MONO: React.CSSProperties = { fontFamily: "'IBM Plex Mono',monospace", fontSize: 12 };

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, { color: string; bg: string; border: string; label: string }> = {
  draft:   { color: 'var(--warning, #fbbf24)', bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.2)',  label: 'Draft'   },
  posted:  { color: 'var(--accent-blue, #60a5fa)', bg: 'rgba(96,165,250,0.1)',  border: 'rgba(96,165,250,0.2)',  label: 'Posted'  },
  partial: { color: 'var(--accent-violet, #a78bfa)', bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.2)', label: 'Partial' },
  paid:    { color: 'var(--success, #4ade80)', bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.2)',  label: 'Paid'    },
  void:    { color: 'rgba(255,255,255,0.3)', bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.1)', label: 'Void' },
};

const MATCH_CFG = {
  no_match:          { color: 'rgba(255,255,255,0.3)', bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.1)', label: 'No Match' },
  two_way:           { color: 'var(--warning, #fbbf24)', bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.2)',  label: '2-Way'   },
  three_way_matched: { color: 'var(--success, #4ade80)', bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.2)',  label: '3-Way Match' },
  three_way_failed:  { color: 'var(--danger, #f87171)', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.2)', label: '3-Way Fail' },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.draft;
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'2px 9px', borderRadius:20, fontSize:11, fontWeight:500, color:s.color, background:s.bg, border:`0.5px solid ${s.border}`, whiteSpace:'nowrap' }}>
      <span style={{ width:5, height:5, borderRadius:'50%', background:s.color, flexShrink:0 }} />{s.label}
    </span>
  );
}

function MatchBadge({ status }: { status: keyof typeof MATCH_CFG }) {
  const m = MATCH_CFG[status] ?? MATCH_CFG.no_match;
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'2px 8px', borderRadius:20, fontSize:10, fontWeight:600, color:m.color, background:m.bg, border:`0.5px solid ${m.border}`, whiteSpace:'nowrap' }}>
      {m.label}
    </span>
  );
}

// ─── 3-Way Match Panel ────────────────────────────────────────────────────────

function ThreeWayMatchPanel({ invoiceId, invoiceStatus, currentGrnId, onLinked, onUnlinked }: {
  invoiceId: string; invoiceStatus: string; currentGrnId?: string;
  onLinked: () => void; onUnlinked: () => void;
}) {
  const [match,       setMatch]       = useState<MatchStatus | null>(null);
  const [loading,     setLoading]     = useState(false);
  const [grns,        setGrns]        = useState<GoodsReceipt[]>([]);
  const [selectedGrn, setSelectedGrn] = useState('');
  const [linking,     setLinking]     = useState(false);
  const [unlinking,   setUnlinking]   = useState(false);
  const [error,       setError]       = useState('');

  const loadMatch = useCallback(async () => {
    setLoading(true);
    try { const res = await apiClient.get(`/ap-invoices/${invoiceId}/match-status`); setMatch(res.data); }
    catch { setError('Failed to load match status.'); }
    finally { setLoading(false); }
  }, [invoiceId]);

  useEffect(() => {
    loadMatch();
    if (invoiceStatus === 'draft') goodsReceiptsApi.getAll().then(g => setGrns(g.filter(x => x.status === 'posted')));
  }, [invoiceId, invoiceStatus, loadMatch]);

  const handleLink = async () => {
    if (!selectedGrn) { setError('Select a GRN first.'); return; }
    setLinking(true); setError('');
    try { await apiClient.post(`/ap-invoices/${invoiceId}/link-grn`, { grnId: selectedGrn }); await loadMatch(); onLinked(); }
    catch (err: any) { setError(err?.response?.data?.message || 'Link failed.'); }
    finally { setLinking(false); }
  };

  const handleUnlink = async () => {
    setUnlinking(true); setError('');
    try { await apiClient.post(`/ap-invoices/${invoiceId}/unlink-grn`); await loadMatch(); onUnlinked(); }
    catch (err: any) { setError(err?.response?.data?.message || 'Unlink failed.'); }
    finally { setUnlinking(false); }
  };

  if (loading) return <div style={{ padding:'12px 0', fontSize:12, color:'rgba(255,255,255,0.3)' }}>Loading match status…</div>;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      {match && (
        <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
          <MatchBadge status={match.matchStatus} />
          {match.purchaseOrder && <span style={{ fontSize:11, color:'rgba(255,255,255,0.35)' }}>PO: <span style={{ ...MONO, color:'var(--accent-strong, #fb923c)' }}>{match.purchaseOrder.poNumber}</span></span>}
          {match.goodsReceipt  && <span style={{ fontSize:11, color:'rgba(255,255,255,0.35)' }}>GRN: <span style={{ ...MONO, color:'var(--success, #4ade80)' }}>{match.goodsReceipt.grnNumber}</span><span style={{ color:'rgba(255,255,255,0.25)', marginLeft:6 }}>({fmtDateShort(match.goodsReceipt.receivedDate)})</span></span>}
          <span style={{ fontSize:10, color:'rgba(255,255,255,0.25)' }}>Tolerance: {match.priceTolerance}</span>
          <span style={{ fontSize:10, color: match.summary.failed > 0 ? 'var(--danger, #f87171)' : 'var(--success, #4ade80)', marginLeft:'auto' }}>{match.summary.matched}/{match.summary.total} lines matched</span>
        </div>
      )}
      {error && <div style={{ background:'rgba(239,68,68,0.08)', border:'0.5px solid rgba(239,68,68,0.2)', borderRadius:7, padding:'7px 10px', fontSize:12, color:'var(--danger-subtle, #fca5a5)' }}>{error}</div>}
      {invoiceStatus === 'draft' && (
        <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
          {currentGrnId ? (
            <button onClick={handleUnlink} disabled={unlinking}
              style={{ padding:'5px 12px', borderRadius:6, fontSize:11, cursor:'pointer', background:'rgba(248,113,113,0.08)', border:'0.5px solid rgba(248,113,113,0.2)', color:'var(--danger, #f87171)', fontFamily:"'IBM Plex Sans',sans-serif", opacity:unlinking?0.5:1 }}>
              {unlinking ? 'Unlinking…' : 'Unlink GRN'}
            </button>
          ) : (
            <>
              <div style={{ minWidth:220 }}>
                <SearchSelect
                  options={grns.map(g => ({ value: g.id, label: `${g.grnNumber} · ${g.supplierName ?? g.warehouseCode} · ${fmtDateShort(g.receivedDate)}` }))}
                  value={selectedGrn}
                  onChange={setSelectedGrn}
                  placeholder="Select GRN to link…"
                  clearLabel="— Select GRN to link —"
                  minWidth={280}
                />
              </div>
              <button onClick={handleLink} disabled={linking || !selectedGrn}
                style={{ padding:'5px 12px', borderRadius:6, fontSize:11, cursor: linking||!selectedGrn?'not-allowed':'pointer', background:'rgba(74,222,128,0.1)', border:'0.5px solid rgba(74,222,128,0.25)', color:'var(--success, #4ade80)', fontFamily:"'IBM Plex Sans',sans-serif", opacity: linking||!selectedGrn?0.5:1 }}>
                {linking ? 'Linking…' : 'Link GRN'}
              </button>
            </>
          )}
        </div>
      )}
      {match && match.lines.length > 0 && (
        <div style={{ border:'0.5px solid rgba(255,255,255,0.06)', borderRadius:8, overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:11 }}>
            <thead>
              <tr style={{ background:'rgba(255,255,255,0.02)' }}>
                {['#','Item','Inv Qty','PO Qty','GRN Rcvd','Inv Price','PO Price','Δ%','Match'].map(h => (
                  <th key={h} style={{ padding:'5px 8px', fontSize:9, color:'rgba(167,139,250,0.55)', fontWeight:500, letterSpacing:'0.08em', textTransform:'uppercase', textAlign: ['Inv Qty','PO Qty','GRN Rcvd','Inv Price','PO Price','Δ%'].includes(h)?'right':'left', borderBottom:'0.5px solid rgba(255,255,255,0.06)', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {match.lines.map(line => (
                <tr key={line.lineNumber} style={{ borderBottom:'0.5px solid rgba(255,255,255,0.04)', background: !line.lineMatches ? 'rgba(248,113,113,0.03)' : 'transparent' }}>
                  <td style={{ padding:'6px 8px', color:'rgba(255,255,255,0.3)' }}>{line.lineNumber}</td>
                  <td style={{ padding:'6px 8px' }}>
                    <div style={{ ...MONO, color:'var(--accent-violet, #a78bfa)', fontSize:10 }}>{line.itemCode ?? '—'}</div>
                    <div style={{ color:'rgba(255,255,255,0.35)', fontSize:10, marginTop:1, maxWidth:140, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{line.itemName}</div>
                  </td>
                  <td style={{ padding:'6px 8px', textAlign:'right', ...MONO }}>{line.invoiceQty}</td>
                  <td style={{ padding:'6px 8px', textAlign:'right' }}><span style={{ ...MONO, color: line.poQtyOk === false ? 'var(--danger, #f87171)' : line.poQtyOk === true ? 'var(--success, #4ade80)' : 'rgba(255,255,255,0.3)' }}>{line.poQty ?? '—'}</span></td>
                  <td style={{ padding:'6px 8px', textAlign:'right' }}><span style={{ ...MONO, color: line.grnQtyOk === false ? 'var(--danger, #f87171)' : line.grnQtyOk === true ? 'var(--success, #4ade80)' : 'rgba(255,255,255,0.3)' }}>{line.grnQty ?? '—'}</span></td>
                  <td style={{ padding:'6px 8px', textAlign:'right', ...MONO }}>{fmtAmt(line.invoicePrice)}</td>
                  <td style={{ padding:'6px 8px', textAlign:'right', ...MONO, color:'rgba(255,255,255,0.4)' }}>{line.poPrice ? fmtAmt(line.poPrice) : '—'}</td>
                  <td style={{ padding:'6px 8px', textAlign:'right' }}><span style={{ fontSize:10, color: line.priceOk === false ? 'var(--danger, #f87171)' : line.priceOk === true ? 'var(--success, #4ade80)' : 'rgba(255,255,255,0.3)' }}>{line.priceDiffPct !== null ? `${line.priceDiffPct}%` : '—'}</span></td>
                  <td style={{ padding:'6px 8px' }}>
                    {line.lineMatches ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--success, #4ade80)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> : (
                      <div><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--danger, #f87171)" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>{line.issues.map((iss, i) => <div key={i} style={{ fontSize:9, color:'rgba(248,113,113,0.7)', marginTop:1, maxWidth:160, lineHeight:1.3 }}>{iss}</div>)}</div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {match?.matchStatus === 'three_way_matched' && (
        <div style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(74,222,128,0.05)', border:'0.5px solid rgba(74,222,128,0.2)', borderRadius:7, padding:'8px 12px', fontSize:12, color:'var(--success, #4ade80)' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0 }}><polyline points="20 6 9 17 4 12"/></svg>
          <span>All {match.summary.total} lines pass 3-way match. Invoice is ready to post.</span>
        </div>
      )}
      {match?.matchStatus === 'three_way_failed' && (
        <div style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(248,113,113,0.05)', border:'0.5px solid rgba(248,113,113,0.2)', borderRadius:7, padding:'8px 12px', fontSize:12, color:'var(--danger, #f87171)' }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink:0 }}><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          <span>{match.summary.failed} line{match.summary.failed !== 1 ? 's' : ''} failed. Resolve discrepancies before posting.</span>
        </div>
      )}
    </div>
  );
}

// ─── AP Invoice Detail Drawer ─────────────────────────────────────────────────

function APDrawer({ inv, onClose, onAction }: { inv: APInvoice; onClose: () => void; onAction: () => void }) {
  const [detail,     setDetail]     = useState<APInvoice | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [activeTab,  setActiveTab]  = useState<'lines' | 'match' | 'payments'>('lines');
  const [actionBusy, setActionBusy] = useState(false);
  const [payOpen,    setPayOpen]    = useState(false);
  const [error,      setError]      = useState('');

  const loadDetail = useCallback(async () => {
    setLoading(true);
    try { setDetail(await apInvoicesApi.getById(inv.id) as APInvoice); }
    catch { setError('Failed to load invoice details.'); }
    finally { setLoading(false); }
  }, [inv.id]);

  useEffect(() => { loadDetail(); }, [loadDetail]);

  const handleAction = async (action: 'post' | 'void') => {
    setActionBusy(true); setError('');
    try {
      if (action === 'post') await apInvoicesApi.post(inv.id);
      if (action === 'void') await apInvoicesApi.void(inv.id);
      onAction(); onClose();
    } catch (err: any) { setError(err?.response?.data?.message || `${action} failed.`); }
    finally { setActionBusy(false); }
  };

  const days = daysUntil(inv.dueDate);
  const outstanding = Number(inv.totalAmount) - Number(inv.paidAmount);

  return (
    <div style={{ position:'fixed', inset:0, zIndex:400, display:'flex' }}>
      <div style={{ flex:1, background:'rgba(0,0,0,0.5)', backdropFilter:'blur(2px)' }} onClick={onClose} />
      <div style={{ width:780, background:'var(--bg, #0a0712)', borderLeft:'0.5px solid rgba(167,139,250,0.15)', display:'flex', flexDirection:'column', overflowY:'auto' }}>
        {/* Header */}
        <div style={{ padding:'16px 20px', borderBottom:'0.5px solid rgba(255,255,255,0.06)', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div>
            <div style={{ fontSize:14, fontWeight:500, color:'var(--text-strong, #f1ede8)', ...MONO }}>{inv.invoiceNumber}</div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,0.4)', marginTop:2 }}>
              {inv.supplier?.name}
              {inv.purchaseOrder && <span style={{ color:'rgba(167,139,250,0.5)', marginLeft:8 }}>· PO {inv.purchaseOrder.poNumber}</span>}
              {inv.goodsReceipt  && <span style={{ color:'rgba(74,222,128,0.5)',  marginLeft:8 }}>· GRN {inv.goodsReceipt.grnNumber}</span>}
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <StatusBadge status={inv.status} />
            <PrintButton doc="ap-invoice" id={inv.id} style={{ padding:'6px 12px' }} />
            <button onClick={onClose} style={{ width:24, height:24, borderRadius:6, background:'rgba(255,255,255,0.06)', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.45)', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
          </div>
        </div>

        {loading ? (
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'rgba(255,255,255,0.3)', fontSize:13 }}>Loading…</div>
        ) : detail ? (
          <div style={{ flex:1, overflowY:'auto', padding:'16px 20px', display:'flex', flexDirection:'column', gap:14 }}>
            {error && <div style={{ background:'rgba(239,68,68,0.08)', border:'0.5px solid rgba(239,68,68,0.2)', borderRadius:7, padding:'8px 12px', fontSize:12, color:'var(--danger-subtle, #fca5a5)' }}>{error}</div>}

            {/* Info grid */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10 }}>
              {[
                { label:'Invoice Date', value: fmtDate(detail.invoiceDate) },
                { label:'Due Date',     value: fmtDate(detail.dueDate), extra: inv.status !== 'paid' && inv.status !== 'void' ? (days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'today' : `${days}d`) : undefined, extraColor: days < 0 ? 'var(--danger, #f87171)' : 'var(--warning, #fbbf24)' },
                { label:'Outstanding',  value: outstanding > 0.01 ? fmtAmt(outstanding) : '—', valueColor: outstanding > 0.01 ? 'var(--danger, #f87171)' : 'var(--success, #4ade80)' },
                { label:'Currency',     value: detail.currency },
              ].map(item => (
                <div key={item.label} style={{ background:'rgba(255,255,255,0.03)', borderRadius:8, padding:'8px 12px' }}>
                  <div style={{ fontSize:10, color:'rgba(255,255,255,0.3)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>{item.label}</div>
                  <div style={{ fontSize:13, color:(item as any).valueColor ?? 'var(--text-primary, #e2dfd8)' }}>{item.value}</div>
                  {(item as any).extra && <div style={{ fontSize:10, color:(item as any).extraColor, marginTop:2 }}>{(item as any).extra}</div>}
                </div>
              ))}
            </div>

            {/* 3-Way Match warning — draft with PO but no GRN */}
            {detail.status === 'draft' && (detail as any).poId && !(detail as any).grnId && (
              <div style={{ display:'flex', alignItems:'flex-start', gap:10, background:'rgba(251,191,36,0.06)', border:'0.5px solid rgba(251,191,36,0.25)', borderRadius:8, padding:'10px 14px' }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--warning, #fbbf24)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0 }}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                <div>
                  <div style={{ fontSize:12, fontWeight:500, color:'var(--warning, #fbbf24)', marginBottom:3 }}>No GRN linked</div>
                  <div style={{ fontSize:11, color:'rgba(255,255,255,0.45)', lineHeight:1.6 }}>
                    This invoice has a linked PO but no Goods Receipt. For a full 3-way match, receive the goods first via <strong style={{ color:'rgba(255,255,255,0.6)' }}>Procurement → Goods Receipts</strong>, then link the GRN in the Match tab before posting.
                  </div>
                </div>
              </div>
            )}

            {/* Tabs */}
            <div style={{ display:'flex', gap:0, background:'rgba(255,255,255,0.03)', borderRadius:7, border:'0.5px solid rgba(255,255,255,0.07)', overflow:'hidden', width:'fit-content' }}>
              {([
                { key:'lines',    label:'Lines' },
                { key:'match',    label:'3-Way Match' },
                { key:'payments', label:`Payments (${detail.payments?.length ?? 0})` },
              ] as { key: typeof activeTab; label: string }[]).map(t => (
                <button key={t.key} onClick={() => setActiveTab(t.key)}
                  style={{ padding:'6px 16px', fontSize:12, fontFamily:"'IBM Plex Sans',sans-serif", cursor:'pointer', border:'none', background: activeTab === t.key ? 'rgba(167,139,250,0.15)' : 'transparent', color: activeTab === t.key ? 'var(--accent-violet, #a78bfa)' : 'rgba(255,255,255,0.4)', borderRight:'0.5px solid rgba(255,255,255,0.07)', transition:'all 0.15s' }}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Lines tab */}
            {activeTab === 'lines' && detail.lines && (
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead>
                  <tr>{['#','Item','Description','Qty','UOM','PO Price','Invoice Price','Variance','Total'].map(h => (
                    <th key={h} style={{ padding:'6px 8px', fontSize:10, color:'rgba(167,139,250,0.5)', fontWeight:500, letterSpacing:'0.08em', textTransform:'uppercase', textAlign:['Qty','PO Price','Invoice Price','Variance','Total'].includes(h)?'right':'left', borderBottom:'0.5px solid rgba(255,255,255,0.06)', whiteSpace:'nowrap' }}>{h}</th>
                  ))}</tr>
                </thead>
                <tbody>
                  {detail.lines.map(line => {
                    const variance = Number(line.priceVariance ?? 0);
                    return (
                      <tr key={line.id} style={{ borderBottom:'0.5px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding:'7px 8px', color:'rgba(255,255,255,0.3)' }}>{line.lineNumber}</td>
                        <td style={{ padding:'7px 8px' }}><span style={{ ...MONO, color:'var(--accent-violet, #a78bfa)', fontSize:11 }}>{line.item?.code ?? '—'}</span></td>
                        <td style={{ padding:'7px 8px', color:'rgba(255,255,255,0.45)', fontSize:11 }}>{line.description || '—'}</td>
                        <td style={{ padding:'7px 8px', textAlign:'right', ...MONO }}>{line.quantity}</td>
                        <td style={{ padding:'7px 8px', color:'rgba(255,255,255,0.4)' }}>{line.uom ?? '—'}</td>
                        <td style={{ padding:'7px 8px', textAlign:'right', ...MONO, color:'rgba(255,255,255,0.4)' }}>{line.originalPoPrice ? fmtAmt(line.originalPoPrice) : '—'}</td>
                        <td style={{ padding:'7px 8px', textAlign:'right', ...MONO }}>{fmtAmt(line.unitPrice)}</td>
                        <td style={{ padding:'7px 8px', textAlign:'right', fontSize:11, color: variance > 0 ? 'var(--danger, #f87171)' : variance < 0 ? 'var(--success, #4ade80)' : 'rgba(255,255,255,0.3)' }}>{variance !== 0 ? `${variance > 0 ? '+' : ''}${fmtAmt(variance)}` : '—'}</td>
                        <td style={{ padding:'7px 8px', textAlign:'right', ...MONO, color:'var(--text-primary, #e2dfd8)', fontWeight:500 }}>{fmtAmt(line.lineTotal)}</td>
                      </tr>
                    );
                  })}
                  <tr style={{ background:'rgba(255,255,255,0.02)' }}>
                    <td colSpan={8} style={{ padding:'7px 8px', fontSize:11, color:'rgba(255,255,255,0.3)', fontWeight:500 }}>TOTAL</td>
                    <td style={{ padding:'7px 8px', textAlign:'right', ...MONO, color:'var(--accent-violet, #a78bfa)', fontWeight:600, fontSize:13 }}>{fmtAmt(detail.totalAmount)}</td>
                  </tr>
                </tbody>
              </table>
            )}

            {/* 3-Way Match tab */}
            {activeTab === 'match' && (
              <ThreeWayMatchPanel
                invoiceId={inv.id}
                invoiceStatus={inv.status}
                currentGrnId={(detail as any).grnId}
                onLinked={() => { loadDetail(); onAction(); }}
                onUnlinked={() => { loadDetail(); onAction(); }}
              />
            )}

            {/* Payments tab */}
            {activeTab === 'payments' && (
              <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                {detail.payments && detail.payments.length > 0 ? (
                  detail.payments.map(p => (
                    <div key={p.id} style={{ display:'flex', alignItems:'center', gap:12, background:'rgba(74,222,128,0.05)', border:'0.5px solid rgba(74,222,128,0.15)', borderRadius:8, padding:'10px 14px' }}>
                      <span style={{ ...MONO, color:'var(--success, #4ade80)', fontSize:14, fontWeight:500 }}>{fmtAmt(p.amount)}</span>
                      <span style={{ fontSize:12, color:'rgba(255,255,255,0.4)' }}>{fmtDate(p.paymentDate)}</span>
                      {p.paymentMethod && <span style={{ fontSize:11, color:'rgba(255,255,255,0.25)', padding:'1px 6px', borderRadius:4, background:'rgba(255,255,255,0.05)', border:'0.5px solid rgba(255,255,255,0.08)' }}>{p.paymentMethod}</span>}
                      <span style={{ ...MONO, fontSize:10, color:'rgba(255,255,255,0.25)', marginLeft:'auto' }}>{p.paymentNumber}</span>
                    </div>
                  ))
                ) : <div style={{ fontSize:12, color:'rgba(255,255,255,0.25)', padding:'8px 0' }}>No payments recorded yet.</div>}
              </div>
            )}

            {detail.notes && (
              <div style={{ background:'rgba(255,255,255,0.02)', border:'0.5px solid rgba(255,255,255,0.06)', borderRadius:8, padding:'10px 14px' }}>
                <div style={{ fontSize:10, color:'rgba(255,255,255,0.3)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>Notes</div>
                <div style={{ fontSize:12, color:'rgba(255,255,255,0.5)', lineHeight:1.6 }}>{detail.notes}</div>
              </div>
            )}

            {/* Actions */}
            <div style={{ display:'flex', gap:8, paddingTop:8, borderTop:'0.5px solid rgba(255,255,255,0.06)', flexWrap:'wrap' }}>
              {detail.status === 'draft' && (
                <button onClick={() => handleAction('post')} disabled={actionBusy}
                  style={{ padding:'7px 16px', borderRadius:7, fontSize:12, fontWeight:500, cursor:'pointer', background:'rgba(96,165,250,0.1)', border:'0.5px solid rgba(96,165,250,0.25)', color:'var(--accent-blue, #60a5fa)', fontFamily:"'IBM Plex Sans',sans-serif", opacity:actionBusy?0.5:1 }}>
                  {actionBusy ? '…' : 'Post Invoice'}
                </button>
              )}
              {['posted','partial'].includes(detail.status) && (
                <button onClick={() => setPayOpen(true)}
                  style={{ padding:'7px 16px', borderRadius:7, fontSize:12, fontWeight:500, cursor:'pointer', background:'rgba(74,222,128,0.1)', border:'0.5px solid rgba(74,222,128,0.25)', color:'var(--success, #4ade80)', fontFamily:"'IBM Plex Sans',sans-serif" }}>
                  $ Apply Payment
                </button>
              )}
              {['draft','posted'].includes(detail.status) && (
                <button onClick={() => handleAction('void')} disabled={actionBusy}
                  style={{ padding:'7px 16px', borderRadius:7, fontSize:12, cursor:'pointer', background:'rgba(239,68,68,0.08)', border:'0.5px solid rgba(239,68,68,0.2)', color:'var(--danger, #f87171)', fontFamily:"'IBM Plex Sans',sans-serif", opacity:actionBusy?0.5:1 }}>
                  Void
                </button>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {payOpen && detail && (
        <PaymentModal inv={detail} onClose={() => setPayOpen(false)} onSaved={() => { setPayOpen(false); loadDetail(); onAction(); }} />
      )}
    </div>
  );
}

// ─── Payment Modal ────────────────────────────────────────────────────────────

function PaymentModal({ inv, onClose, onSaved }: { inv: APInvoice; onClose: () => void; onSaved: () => void }) {
  const outstanding = Number(inv.totalAmount) - Number(inv.paidAmount);
  const [form, setForm] = useState({ paymentDate: new Date().toISOString().split('T')[0], amount: outstanding.toFixed(2), paymentMethod: 'wire', reference: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(f => ({ ...f, [k]: e.target.value }));
  const INP: React.CSSProperties = { background:'var(--l04, rgba(255,255,255,0.04))', border:'0.5px solid var(--w10, rgba(255,255,255,0.1))', borderRadius:7, padding:'8px 12px', fontSize:12, fontFamily:"'IBM Plex Sans',sans-serif", color:'var(--text-strong, #f1ede8)', outline:'none', width:'100%' };
  const LBL: React.CSSProperties = { fontSize:10, fontWeight:500, letterSpacing:'0.08em', textTransform:'uppercase', color:'rgba(251,146,60,0.6)', fontFamily:"'IBM Plex Sans',sans-serif" };

  const isValid = Number(form.amount) > 0;
  const handleSubmit = async () => {
    if (!isValid) { setError('Amount must be > 0.'); return; }
    setBusy(true); setError('');
    try { await apInvoicesApi.applyPayment(inv.id, { paymentDate: form.paymentDate, amount: Number(form.amount), paymentMethod: form.paymentMethod || undefined, reference: form.reference || undefined, notes: form.notes || undefined }); onSaved(); }
    catch (err: any) { setError(err?.response?.data?.message || 'Payment failed.'); }
    finally { setBusy(false); }
  };

  return (
    <FormModal
      open
      onClose={onClose}
      title="Apply Payment"
      description={`${inv.invoiceNumber} · Outstanding: ${fmtAmt(outstanding)}`}
      submitLabel={`Pay ${fmtAmt(form.amount)}`}
      submitting={busy}
      isValid={isValid}
      error={error}
      width={460}
      onSubmit={handleSubmit}
    >
          <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div style={{ display:'flex', flexDirection:'column', gap:5 }}><label style={LBL}>Payment Date</label><input type="date" style={INP} value={form.paymentDate} onChange={set('paymentDate')} /></div>
              <div style={{ display:'flex', flexDirection:'column', gap:5 }}><label style={LBL}>Amount ($)</label><input type="number" min="0.01" step="0.01" style={INP} value={form.amount} onChange={set('amount')} /></div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                <label style={LBL}>Method</label>
                <SearchSelect options={['wire','ach','check','transfer','cash'].map(m => ({ value: m, label: m.charAt(0).toUpperCase()+m.slice(1) }))} value={form.paymentMethod} onChange={v => setForm(f => ({ ...f, paymentMethod: v }))} placeholder="Method…" minWidth={180} />
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:5 }}><label style={LBL}>Reference</label><input style={INP} placeholder="WIRE-2026-001" value={form.reference} onChange={set('reference')} /></div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:5 }}><label style={LBL}>Notes</label><input style={INP} placeholder="Payment notes" value={form.notes} onChange={set('notes')} /></div>
          </div>
    </FormModal>
  );
}


// ─── Create AP Invoice Modal ──────────────────────────────────────────────────

type CreateMode = 'choose' | 'from_po' | 'manual';

interface NewAPLine {
  itemId: string; description: string;
  quantity: string; uom: string; unitPrice: string; discountPercent: string;
  poLineId?: string;
}
const EMPTY_AP_LINE: NewAPLine = { itemId:'', description:'', quantity:'', uom:'', unitPrice:'', discountPercent:'0' };

function CreateApInvoiceModal({ suppliers, items, onClose, onSaved }: {
  suppliers: Supplier[]; items: Item[];
  onClose: () => void; onSaved: () => void;
}) {
  const [mode,        setMode]        = useState<CreateMode>('choose');
  const [poSearch,    setPoSearch]    = useState('');
  const [poLoading,   setPoLoading]   = useState(false);
  const [selectedPo,  setSelectedPo]  = useState<PODetail | null>(null);
  const [supplierId,  setSupplierId]  = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0,10));
  const [dueDate,     setDueDate]     = useState(() => {
    const d = new Date(); d.setDate(d.getDate() + 30); return d.toISOString().slice(0,10);
  });
  const [supplierRef, setSupplierRef] = useState('');
  const [currency,    setCurrency]    = useState('USD');
  const [notes,       setNotes]       = useState('');
  const [lines,       setLines]       = useState<NewAPLine[]>([{ ...EMPTY_AP_LINE }]);
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState('');

  const INP: React.CSSProperties = { background:'var(--l04, rgba(255,255,255,0.04))', border:'0.5px solid var(--w10, rgba(255,255,255,0.1))', borderRadius:7, padding:'8px 12px', fontSize:12, fontFamily:"'IBM Plex Sans',sans-serif", color:'var(--text-strong, #f1ede8)', outline:'none', width:'100%' };
  const LBL: React.CSSProperties = { fontSize:10, fontWeight:500, letterSpacing:'0.08em', textTransform:'uppercase', color:'rgba(167,139,250,0.7)', fontFamily:"'IBM Plex Sans',sans-serif" };
  const LINE_INP: React.CSSProperties = { background:'var(--l04, rgba(255,255,255,0.04))', border:'0.5px solid var(--w10, rgba(255,255,255,0.1))', borderRadius:5, padding:'5px 7px', fontSize:12, fontFamily:"'IBM Plex Sans',sans-serif", color:'var(--text-strong, #f1ede8)', outline:'none', width:'100%' };

  const searchPo = async () => {
    if (!poSearch.trim()) return;
    setPoLoading(true); setError('');
    try {
      const all = await purchaseOrdersApi.getAll();
      const found = (all as any[]).find(p => p.poNumber.toLowerCase() === poSearch.toLowerCase().trim());
      if (!found) { setError(`PO "${poSearch}" not found`); return; }
      const detail = await purchaseOrdersApi.getById(found.id) as PODetail;
      if (!['confirmed','received','partial'].includes(detail.status)) {
        setError(`PO is in status "${detail.status}" — needs confirmed, received or partial.`); return;
      }
      setSelectedPo(detail);
      setSupplierId(detail.supplier?.id ?? '');
      if (detail.lines?.length) {
        setLines(detail.lines.map(l => ({
          itemId: l.itemId, description: l.item?.name ?? '',
          quantity: l.orderedQuantity, uom: l.uom,
          unitPrice: l.unitPrice, discountPercent: l.discountPercent ?? '0',
          poLineId: l.id,
        })));
      }
    } catch { setError('Failed to load PO.'); }
    finally { setPoLoading(false); }
  };

  const fromPoSubmit = async () => {
    if (!selectedPo) return;
    setSubmitting(true); setError('');
    try {
      await apInvoicesApi.createFromPo(selectedPo.id);
      onSaved();
    } catch (err: any) { setError(err?.response?.data?.message || 'Failed to create from PO.'); }
    finally { setSubmitting(false); }
  };

  const setLine = (idx: number, k: keyof NewAPLine, v: string) =>
    setLines(ls => ls.map((l, i) => {
      if (i !== idx) return l;
      const upd = { ...l, [k]: v };
      if (k === 'itemId') { const it = items.find(x => x.id === v); if (it) { upd.uom = it.baseUom; upd.description = it.name; } }
      return upd;
    }));

  const lineTotal = (l: NewAPLine) =>
    (Number(l.quantity) || 0) * (Number(l.unitPrice) || 0) * (1 - (Number(l.discountPercent) || 0) / 100);
  const grandTotal = lines.reduce((s, l) => s + lineTotal(l), 0);

  const manualSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supplierId)    { setError('Supplier is required.'); return; }
    if (!invoiceDate)   { setError('Invoice date is required.'); return; }
    if (!dueDate)       { setError('Due date is required.'); return; }
    const validLines = lines.filter(l => l.quantity && l.unitPrice && Number(l.quantity) > 0 && Number(l.unitPrice) >= 0);
    if (!validLines.length) { setError('At least one complete line is required.'); return; }
    setSubmitting(true); setError('');
    try {
      await apInvoicesApi.create({
        supplierId, poId: selectedPo?.id,
        invoiceDate, dueDate,
        supplierRef: supplierRef || undefined,
        currency: currency || 'USD',
        notes: notes || undefined,
        lines: validLines.map(l => ({
          poLineId:        l.poLineId,
          itemId:          l.itemId || undefined,
          description:     l.description || undefined,
          quantity:        Number(l.quantity),
          uom:             l.uom || undefined,
          unitPrice:       Number(l.unitPrice),
          discountPercent: Number(l.discountPercent) || undefined,
        })),
      });
      onSaved();
    } catch (err: any) { setError(err?.response?.data?.message || 'Failed to create invoice.'); }
    finally { setSubmitting(false); }
  };

  return (
    <>
      <style>{`
        .apci-overlay{position:fixed;inset:0;z-index:450;background:rgba(0,0,0,0.72);backdrop-filter:blur(4px);display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow-y:auto}
        .apci-box{background:var(--surface, #0e0b1a);border:0.5px solid rgba(167,139,250,0.22);border-radius:14px;width:100%;max-width:920px;margin:auto;position:relative;box-shadow:0 24px 60px rgba(0,0,0,0.75)}
        .apci-box::before{content:\'\';position:absolute;top:0;left:30px;right:30px;height:1px;background:linear-gradient(90deg,transparent,rgba(167,139,250,0.45),transparent);pointer-events:none}
        .apci-th{font-size:10px;color:rgba(167,139,250,0.5);text-transform:uppercase;letter-spacing:0.08em;padding:5px 6px;text-align:left;border-bottom:0.5px solid rgba(255,255,255,0.06);white-space:nowrap;font-weight:500}
        .apci-section{font-size:10px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.25);padding:6px 0 4px;border-bottom:0.5px solid rgba(255,255,255,0.06);margin-top:4px;display:flex;align-items:center;justify-content:space-between}
      `}</style>
      <div className="apci-overlay">
        <div className="apci-box">

          {/* Header */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px 12px', borderBottom:'0.5px solid rgba(255,255,255,0.06)', position:'sticky', top:0, background:'var(--surface, #0e0b1a)', zIndex:1, borderRadius:'14px 14px 0 0' }}>
            <span style={{ fontSize:14, fontWeight:500, color:'var(--text-strong, #f1ede8)' }}>New AP Invoice</span>
            <button onClick={onClose} style={{ width:24, height:24, borderRadius:6, background:'rgba(255,255,255,0.06)', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.45)', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
          </div>

          <div style={{ padding:'16px 20px', display:'flex', flexDirection:'column', gap:14 }}>
            {error && <div style={{ background:'rgba(239,68,68,0.1)', border:'0.5px solid rgba(239,68,68,0.25)', borderRadius:7, padding:'8px 12px', fontSize:12, color:'var(--danger-subtle, #fca5a5)' }}>{error}</div>}

            {/* ── Mode chooser ── */}
            {mode === 'choose' && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, padding:'8px 0' }}>
                {/* From PO */}
                <div onClick={() => setMode('from_po')}
                  style={{ background:'rgba(251,146,60,0.05)', border:'0.5px solid rgba(251,146,60,0.2)', borderRadius:10, padding:'20px 22px', cursor:'pointer', transition:'all 0.15s', display:'flex', flexDirection:'column', gap:8 }}
                  onMouseEnter={e => (e.currentTarget.style.background='rgba(251,146,60,0.1)')}
                  onMouseLeave={e => (e.currentTarget.style.background='rgba(251,146,60,0.05)')}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent-strong, #fb923c)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 2h6a2 2 0 0 1 2 2v0a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2v0a2 2 0 0 1 2-2z"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><line x1="9" y1="12" x2="15" y2="12"/><line x1="9" y1="16" x2="15" y2="16"/></svg>
                  <div style={{ fontSize:14, fontWeight:500, color:'var(--accent-strong, #fb923c)' }}>From Purchase Order</div>
                  <div style={{ fontSize:12, color:'rgba(255,255,255,0.4)', lineHeight:1.6 }}>
                    Auto-generate an AP Invoice from a confirmed PO. Lines, prices and supplier are pre-filled automatically.
                  </div>
                  <div style={{ fontSize:11, color:'rgba(251,146,60,0.55)', marginTop:4 }}>Recommended for standard procurement flow →</div>
                </div>
                {/* Manual */}
                <div onClick={() => setMode('manual')}
                  style={{ background:'rgba(167,139,250,0.05)', border:'0.5px solid rgba(167,139,250,0.2)', borderRadius:10, padding:'20px 22px', cursor:'pointer', transition:'all 0.15s', display:'flex', flexDirection:'column', gap:8 }}
                  onMouseEnter={e => (e.currentTarget.style.background='rgba(167,139,250,0.1)')}
                  onMouseLeave={e => (e.currentTarget.style.background='rgba(167,139,250,0.05)')}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent-violet, #a78bfa)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  <div style={{ fontSize:14, fontWeight:500, color:'var(--accent-violet, #a78bfa)' }}>Manual Entry</div>
                  <div style={{ fontSize:12, color:'rgba(255,255,255,0.4)', lineHeight:1.6 }}>
                    Create an AP Invoice manually. Use for services, expenses or invoices without a linked Purchase Order.
                  </div>
                  <div style={{ fontSize:11, color:'rgba(167,139,250,0.55)', marginTop:4 }}>For direct expenses and service invoices →</div>
                </div>
              </div>
            )}

            {/* ── From PO mode ── */}
            {mode === 'from_po' && (
              <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                <button onClick={() => { setMode('choose'); setSelectedPo(null); setPoSearch(''); setError(''); }}
                  style={{ alignSelf:'flex-start', background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.4)', fontSize:12, fontFamily:"'IBM Plex Sans',sans-serif", display:'flex', alignItems:'center', gap:4 }}>
                  ← Back
                </button>

                <div className="apci-section"><span>Find Purchase Order</span></div>
                <div style={{ display:'flex', gap:8, alignItems:'flex-end' }}>
                  <div style={{ display:'flex', flexDirection:'column', gap:5, flex:1 }}>
                    <label style={LBL}>PO Number</label>
                    <input style={INP} placeholder="e.g. PO-2026-0001" value={poSearch}
                      onChange={e => setPoSearch(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), searchPo())} />
                  </div>
                  <button type="button" onClick={searchPo} disabled={poLoading}
                    style={{ padding:'8px 18px', borderRadius:7, fontSize:12, cursor:'pointer', background:'rgba(251,146,60,0.1)', border:'0.5px solid rgba(251,146,60,0.25)', color:'var(--accent-strong, #fb923c)', fontFamily:"'IBM Plex Sans',sans-serif", whiteSpace:'nowrap', opacity:poLoading?0.5:1 }}>
                    {poLoading ? 'Searching…' : 'Find PO'}
                  </button>
                </div>

                {selectedPo && (
                  <>
                    {/* PO summary */}
                    <div style={{ background:'rgba(251,146,60,0.05)', border:'0.5px solid rgba(251,146,60,0.2)', borderRadius:8, padding:'12px 16px', display:'flex', alignItems:'center', gap:16, flexWrap:'wrap' }}>
                      <div>
                        <div style={{ fontSize:13, fontWeight:500, color:'var(--accent-strong, #fb923c)', fontFamily:"'IBM Plex Mono',monospace" }}>{selectedPo.poNumber}</div>
                        <div style={{ fontSize:12, color:'rgba(255,255,255,0.45)', marginTop:2 }}>{selectedPo.supplier?.name} · {selectedPo.lines?.length} line{selectedPo.lines?.length !== 1 ? 's' : ''}</div>
                      </div>
                      <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, background:'rgba(74,222,128,0.1)', color:'var(--success, #4ade80)', border:'0.5px solid rgba(74,222,128,0.2)' }}>{selectedPo.status}</span>
                      <div style={{ marginLeft:'auto', fontSize:11, color:'rgba(255,255,255,0.35)' }}>Invoice will be created in draft with all PO lines pre-filled.</div>
                    </div>

                    {/* Lines preview */}
                    <div style={{ border:'0.5px solid rgba(255,255,255,0.06)', borderRadius:8, overflow:'hidden' }}>
                      <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                        <thead>
                          <tr style={{ background:'rgba(255,255,255,0.02)' }}>
                            {['Item','Qty','UOM','Unit Price','Line Total'].map(h => (
                              <th key={h} style={{ padding:'6px 10px', fontSize:10, color:'rgba(251,146,60,0.5)', fontWeight:500, textTransform:'uppercase', letterSpacing:'0.08em', textAlign: ['Qty','Unit Price','Line Total'].includes(h)?'right':'left', borderBottom:'0.5px solid rgba(255,255,255,0.06)', whiteSpace:'nowrap' }}>{h}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {selectedPo.lines?.map(l => (
                            <tr key={l.id} style={{ borderBottom:'0.5px solid rgba(255,255,255,0.04)' }}>
                              <td style={{ padding:'7px 10px' }}>
                                <div style={{ fontFamily:"'IBM Plex Mono',monospace", color:'var(--accent-strong, #fb923c)', fontSize:11 }}>{l.item?.code}</div>
                                <div style={{ color:'rgba(255,255,255,0.45)', fontSize:11, marginTop:1 }}>{l.item?.name}</div>
                              </td>
                              <td style={{ padding:'7px 10px', textAlign:'right', fontFamily:"'IBM Plex Mono',monospace" }}>{Number(l.orderedQuantity).toLocaleString()}</td>
                              <td style={{ padding:'7px 10px', color:'rgba(255,255,255,0.4)' }}>{l.uom}</td>
                              <td style={{ padding:'7px 10px', textAlign:'right', fontFamily:"'IBM Plex Mono',monospace" }}>{fmtAmt(l.unitPrice)}</td>
                              <td style={{ padding:'7px 10px', textAlign:'right', fontFamily:"'IBM Plex Mono',monospace", fontWeight:500, color:'var(--text-primary, #e2dfd8)' }}>
                                {fmtAmt(Number(l.orderedQuantity) * Number(l.unitPrice) * (1 - Number(l.discountPercent || 0)/100))}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
                      <button type="button" onClick={onClose} style={{ background:'var(--l05, rgba(255,255,255,0.05))', border:'0.5px solid var(--w10, rgba(255,255,255,0.1))', borderRadius:7, padding:'8px 16px', fontSize:13, fontFamily:"'IBM Plex Sans',sans-serif", color:'var(--w50, rgba(255,255,255,0.5))', cursor:'pointer' }}>Cancel</button>
                      <button onClick={fromPoSubmit} disabled={submitting}
                        style={{ background:'linear-gradient(135deg,#92400e,#d97706,var(--accent-strong, #fb923c))', border:'none', borderRadius:7, padding:'8px 22px', fontSize:13, fontWeight:500, fontFamily:"'IBM Plex Sans',sans-serif", color:'white', cursor:'pointer', boxShadow:'0 3px 12px rgba(251,146,60,0.3)', opacity:submitting?0.5:1 }}>
                        {submitting ? 'Creating…' : 'Create from PO'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}

            {/* ── Manual mode ── */}
            {mode === 'manual' && (
              <form onSubmit={manualSubmit} style={{ display:'flex', flexDirection:'column', gap:12 }}>
                <button type="button" onClick={() => { setMode('choose'); setError(''); setSupplierId(''); setLines([{ ...EMPTY_AP_LINE }]); }}
                  style={{ alignSelf:'flex-start', background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.4)', fontSize:12, fontFamily:"'IBM Plex Sans',sans-serif", display:'flex', alignItems:'center', gap:4 }}>
                  ← Back
                </button>

                <div className="apci-section"><span>Invoice Header</span></div>
                <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr', gap:10 }}>
                  <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                    <label style={LBL}>Supplier *</label>
                    <SearchSelect
                      options={suppliers.map(s => ({ value: s.id, label: `${s.code} — ${s.name}` }))}
                      value={supplierId}
                      onChange={setSupplierId}
                      placeholder="Search supplier…"
                      clearLabel="— Select supplier —"
                      minWidth={280}
                    />
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                    <label style={LBL}>Invoice Date *</label>
                    <input type="date" value={invoiceDate} onChange={e => setInvoiceDate(e.target.value)} style={INP} />
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                    <label style={LBL}>Due Date *</label>
                    <input type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={INP} />
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                    <label style={LBL}>Currency</label>
                    <SearchSelect options={['USD','EUR','DOP','GBP'].map(c => ({ value: c, label: c }))} value={currency} onChange={setCurrency} placeholder="Currency…" minWidth={160} />
                  </div>
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 2fr', gap:10 }}>
                  <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                    <label style={LBL}>Supplier Ref (ext. invoice #)</label>
                    <input style={INP} placeholder="SUP-INV-2026-042" value={supplierRef} onChange={e => setSupplierRef(e.target.value)} />
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                    <label style={LBL}>Notes</label>
                    <input style={INP} placeholder="Optional…" value={notes} onChange={e => setNotes(e.target.value)} />
                  </div>
                </div>

                <div className="apci-section">
                  <span>Invoice Lines</span>
                  <button type="button"
                    style={{ background:'var(--l04, rgba(255,255,255,0.04))', border:'0.5px solid var(--w10, rgba(255,255,255,0.1))', borderRadius:5, padding:'4px 10px', fontSize:11, color:'var(--w50, rgba(255,255,255,0.5))', cursor:'pointer', fontFamily:"'IBM Plex Sans',sans-serif" }}
                    onClick={() => setLines(ls => [...ls, { ...EMPTY_AP_LINE }])}>+ Add Line</button>
                </div>

                <table style={{ width:'100%', borderCollapse:'collapse' }}>
                  <thead>
                    <tr>
                      {['Item','Description','Qty *','UOM','Unit Price *','Disc%','Total',''].map(h => (
                        <th key={h} className="apci-th" style={{ width: h===''?24:h==='Disc%'?55:h==='UOM'?65:h==='Qty *'?80:h==='Unit Price *'?100:h==='Total'?100:undefined }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line, idx) => (
                      <tr key={idx}>
                        <td style={{ padding:'4px 3px' }}>
                          <SearchSelect
                            options={items.filter(it => it.isPurchasable !== false).map(it => ({ value: it.id, label: `${it.code} — ${it.name}` }))}
                            value={line.itemId}
                            onChange={v => setLine(idx, 'itemId', v)}
                            placeholder="Item (opt.)…"
                            clearLabel="— Item (opt.) —"
                            minWidth={240}
                          />
                        </td>
                        <td style={{ padding:'4px 3px' }}><input className="apci-th" style={LINE_INP} placeholder="Description" value={line.description} onChange={e => setLine(idx, 'description', e.target.value)} /></td>
                        <td style={{ padding:'4px 3px' }}><input style={{ ...LINE_INP, textAlign:'right', borderColor: line.quantity && Number(line.quantity)>0 ? 'rgba(167,139,250,0.3)':'rgba(255,255,255,0.1)' }} type="number" min="0" step="0.001" placeholder="0" value={line.quantity} onChange={e => setLine(idx, 'quantity', e.target.value)} /></td>
                        <td style={{ padding:'4px 3px' }}><input style={LINE_INP} placeholder="PCS" value={line.uom} onChange={e => setLine(idx, 'uom', e.target.value)} /></td>
                        <td style={{ padding:'4px 3px' }}><input style={{ ...LINE_INP, textAlign:'right', borderColor: line.unitPrice ? 'rgba(167,139,250,0.3)':'rgba(255,255,255,0.1)' }} type="number" min="0" step="0.0001" placeholder="0.00" value={line.unitPrice} onChange={e => setLine(idx, 'unitPrice', e.target.value)} /></td>
                        <td style={{ padding:'4px 3px' }}><input style={{ ...LINE_INP, textAlign:'right' }} type="number" min="0" max="100" step="0.1" placeholder="0" value={line.discountPercent} onChange={e => setLine(idx, 'discountPercent', e.target.value)} /></td>
                        <td style={{ padding:'4px 6px', fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color:'var(--text-primary, #e2dfd8)', textAlign:'right' }}>
                          {lineTotal(line) > 0 ? fmtAmt(lineTotal(line)) : '—'}
                        </td>
                        <td style={{ padding:'4px 3px' }}>
                          {lines.length > 1 && (
                            <button type="button"
                              style={{ width:20, height:20, borderRadius:4, background:'rgba(239,68,68,0.1)', border:'0.5px solid rgba(239,68,68,0.2)', color:'var(--danger, #f87171)', cursor:'pointer', fontSize:13, display:'flex', alignItems:'center', justifyContent:'center' }}
                              onClick={() => setLines(ls => ls.filter((_,i) => i !== idx))}>×</button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 0', borderTop:'0.5px solid rgba(255,255,255,0.06)' }}>
                  <span style={{ fontSize:12, color:'rgba(255,255,255,0.3)' }}>Grand Total</span>
                  <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:15, fontWeight:500, color:'var(--accent-violet, #a78bfa)' }}>{fmtAmt(grandTotal)}</span>
                </div>

                <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
                  <button type="button" onClick={onClose} style={{ background:'var(--l05, rgba(255,255,255,0.05))', border:'0.5px solid var(--w10, rgba(255,255,255,0.1))', borderRadius:7, padding:'8px 16px', fontSize:13, fontFamily:"'IBM Plex Sans',sans-serif", color:'var(--w50, rgba(255,255,255,0.5))', cursor:'pointer' }}>Cancel</button>
                  <button type="submit" disabled={submitting}
                    style={{ background:'linear-gradient(135deg,#4c1d95,#6d28d9,#7c3aed)', border:'none', borderRadius:7, padding:'8px 22px', fontSize:13, fontWeight:500, fontFamily:"'IBM Plex Sans',sans-serif", color:'white', cursor:'pointer', boxShadow:'0 3px 12px rgba(109,40,217,0.35)', opacity:submitting?0.5:1 }}>
                    {submitting ? 'Creating…' : 'Create AP Invoice'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ApInvoicesPage() {
  const [invoices,     setInvoices]     = useState<APInvoice[]>([]);
  const [suppliers,    setSuppliers]    = useState<Supplier[]>([]);
  const [items,        setItems]        = useState<Item[]>([]);
  const [createOpen,   setCreateOpen]   = useState(false);
  const [pos,          setPos]          = useState<PO[]>([]);
  const [grns,         setGrns]         = useState<GRNOption[]>([]);
  const [kpis,         setKpis]         = useState<KPIs | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [statusFilter, setStatusFilter] = useState<string | null>(null);
  const [detailInv,    setDetailInv]    = useState<APInvoice | null>(null);

  // ── Filter definitions ─────────────────────────────────────────────────────
  const filterDefs = useMemo<ERPFilter<APInvoice>[]>(() => [
    // 1. Supplier — searchselect
    {
      key: 'supplierId', label: 'Supplier', type: 'searchselect',
      placeholder: 'Search supplier…',
      selectWidth: 210,
      options: suppliers.map(s => ({ value: s.id, label: `${s.code} — ${s.name}` })),
      filterFn: (row, val) => row.supplier?.id === val,
    },
    // 2. Supplier Ref — free text search (compact)
    {
      key: 'supplierRef', label: 'Supplier Ref', type: 'search',
      placeholder: 'Ref / invoice #…',
      inputWidth: 150,
      filterFn: (row, val) =>
        !!(row.supplierRef ?? '').toLowerCase().includes(String(val).toLowerCase()) ||
        row.invoiceNumber.toLowerCase().includes(String(val).toLowerCase()),
    },
    // 3. Invoice Date range — daterange picker
    {
      key: 'invoiceDate', label: 'Invoice Date', type: 'daterange',
      placeholder: 'Invoice date…', dateWidth: 200,
      filterFn: (row, val) => dateInSelection(row.invoiceDate, val as DateSelection),
    },
    // 3. Due Date range — daterange picker
    {
      key: 'dueDate', label: 'Due Date', type: 'daterange',
      placeholder: 'Due date…', dateWidth: 195,
      filterFn: (row, val) => dateInSelection(row.dueDate, val as DateSelection),
    },
    // 4. Match Status — multiselect
    {
      key: 'matchStatus', label: 'Match', type: 'multiselect',
      options: [
        { value: 'no_match',          label: 'No Match', color: 'rgba(255,255,255,0.4)', bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.12)' },
        { value: 'two_way',           label: '2-Way',    color: 'var(--warning, #fbbf24)', bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.25)'  },
        { value: 'three_way_matched', label: '3-Way Match',  color: 'var(--success, #4ade80)', bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.25)'  },
        { value: 'three_way_failed',  label: '3-Way Fail',  color: 'var(--danger, #f87171)', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.25)' },
      ],
      filterFn: (row, val) => {
        const arr = val as string[];
        const hasPo  = !!row.purchaseOrder;
        const hasGrn = !!(row as any).grnId;
        const ms = !hasPo && !hasGrn ? 'no_match' : hasPo && !hasGrn ? 'two_way' : 'three_way_matched';
        return arr.includes(ms);
      },
    },
    // 5. Currency — select
    {
      key: 'currency', label: 'Currency', type: 'select', placeholder: 'All',
      options: ['USD','EUR','DOP','GBP'].map(c => ({ value: c, label: c })),
      filterFn: (row, val) => row.currency === val,
    },
    // 6. PO Number — searchselect
    {
      key: 'poId', label: 'PO Number', type: 'searchselect',
      placeholder: 'Search PO…',
      selectWidth: 185,
      options: pos.map(p => ({
        value: p.id,
        label: p.poNumber,
        sublabel: p.supplier?.name,
      })),
      filterFn: (row, val) => row.purchaseOrder?.id === val,
    },
    // 7. GRN Number — searchselect
    {
      key: 'grnId', label: 'GRN Number', type: 'searchselect',
      placeholder: 'Search GRN…',
      selectWidth: 185,
      options: grns.map(g => ({
        value: g.id,
        label: g.grnNumber,
        sublabel: g.supplierName ?? g.warehouseCode,
      })),
      filterFn: (row, val) => (row as any).grnId === val,
    },
  ], [suppliers, pos, grns]);

  const { values: filterVals, setValue: setFilterVal, reset: resetFilters, activeCount: filterCount } = useERPFilters(filterDefs);

  const filtered = useMemo(() => {
    const base = applyERPFilters(invoices, filterDefs, filterVals);
    return statusFilter ? base.filter(i => i.status === statusFilter) : base;
  }, [invoices, filterDefs, filterVals, statusFilter]);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [invData, kpiData, supData, grnData, itemData] = await Promise.all([
        apInvoicesApi.getAll(),
        apInvoicesApi.getKpis(),
        suppliersApi.getAll(),
        goodsReceiptsApi.getAll(),
        itemsApi.getAll(),
      ]);
      setInvoices(invData as APInvoice[]);
      setKpis(kpiData as KPIs);
      setSuppliers(supData as Supplier[]);
      setItems(itemData as Item[]);
      // Build PO list from invoices that have a linked PO (deduped)
      const poMap = new Map<string, PO>();
      (invData as APInvoice[]).forEach(inv => {
        if (inv.purchaseOrder) poMap.set(inv.purchaseOrder.id, { id: inv.purchaseOrder.id, poNumber: inv.purchaseOrder.poNumber, supplier: inv.supplier });
      });
      setPos(Array.from(poMap.values()).sort((a,b) => a.poNumber.localeCompare(b.poNumber)));
      setGrns((grnData as GRNOption[]).filter(g => g.id));
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to load data.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Columns ────────────────────────────────────────────────────────────────
  const columns = useMemo<ERPColumn<APInvoice>[]>(() => [
    {
      key: 'invoiceNumber', header: 'Invoice #', width: 150, sortable: true,
      value: r => r.invoiceNumber,
      render: r => <span style={{ ...MONO, color:'var(--accent-violet, #a78bfa)', fontWeight:500 }}>{r.invoiceNumber}</span>,
    },
    {
      key: 'supplier', header: 'Supplier', sortable: true,
      value: r => r.supplier?.name ?? '',
      render: r => (
        <div>
          <div style={{ color:'var(--text-primary, #e2dfd8)', fontWeight:500 }}>{r.supplier?.name ?? '—'}</div>
          {r.purchaseOrder && <div style={{ fontSize:11, color:'rgba(167,139,250,0.5)', marginTop:1 }}>PO: {r.purchaseOrder.poNumber}</div>}
          {r.supplierRef   && <div style={{ fontSize:10, color:'rgba(255,255,255,0.25)', marginTop:1 }}>Ref: {r.supplierRef}</div>}
        </div>
      ),
    },
    {
      key: 'match', header: 'Match', width: 110, sortable: false,
      render: r => {
        const hasPo = !!r.purchaseOrder; const hasGrn = !!(r as any).grnId;
        const status: keyof typeof MATCH_CFG = !hasPo && !hasGrn ? 'no_match' : hasPo && !hasGrn ? 'two_way' : 'three_way_matched';
        return <MatchBadge status={status} />;
      },
    },
    {
      key: 'invoiceDate', header: 'Invoice Date', width: 115, sortable: true,
      value: r => r.invoiceDate,
      render: r => <span style={{ fontSize:12, color:'rgba(255,255,255,0.5)' }}>{fmtDateShort(r.invoiceDate)}</span>,
    },
    {
      key: 'dueDate', header: 'Due Date', width: 120, sortable: true,
      value: r => r.dueDate,
      render: r => {
        const days = daysUntil(r.dueDate);
        const overdue = days < 0 && r.status !== 'paid' && r.status !== 'void';
        return (
          <div>
            <span style={{ fontSize:12, color: overdue ? 'var(--danger, #f87171)' : 'rgba(255,255,255,0.5)' }}>{fmtDateShort(r.dueDate)}</span>
            {r.status !== 'paid' && r.status !== 'void' && days <= 7 && (
              <div style={{ fontSize:10, color: days < 0 ? 'var(--danger, #f87171)' : 'var(--warning, #fbbf24)', marginTop:1 }}>
                {days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'today' : `${days}d`}
              </div>
            )}
          </div>
        );
      },
    },
    {
      key: 'totalAmount', header: 'Total', width: 120, align: 'right', sortable: true,
      value: r => Number(r.totalAmount),
      render: r => <span style={{ ...MONO, fontWeight:500, color:'var(--text-primary, #e2dfd8)' }}>{fmtAmt(r.totalAmount)}</span>,
    },
    {
      key: 'outstanding', header: 'Outstanding', width: 120, align: 'right', sortable: true,
      value: r => Number(r.totalAmount) - Number(r.paidAmount),
      render: r => {
        const out = Number(r.totalAmount) - Number(r.paidAmount);
        return out > 0.01
          ? <span style={{ ...MONO, fontSize:12, color:'var(--danger, #f87171)' }}>{fmtAmt(out)}</span>
          : <span style={{ fontSize:12, color:'rgba(74,222,128,0.5)' }}>—</span>;
      },
    },
    {
      key: 'status', header: 'Status', width: 100, sortable: true,
      value: r => r.status,
      render: r => <StatusBadge status={r.status} />,
    },
    {
      key: '_actions', header: '', width: 70, sortable: false,
      render: r => (
        <button onClick={e => { e.stopPropagation(); setDetailInv(r); }}
          style={{ padding:'4px 10px', borderRadius:6, fontSize:11, cursor:'pointer', background:'var(--l05, rgba(255,255,255,0.05))', border:'0.5px solid var(--w10, rgba(255,255,255,0.1))', color:'rgba(255,255,255,0.55)', fontFamily:"'IBM Plex Sans',sans-serif" }}>
          View
        </button>
      ),
    },
  ], []);

  const counts = useMemo(() => Object.fromEntries(
    ['draft','posted','partial','paid','void'].map(s => [s, invoices.filter(i => i.status === s).length])
  ), [invoices]);

  return (
    <ERPShell breadcrumbs={['Home','Procurement','AP Invoices']} title="Accounts Payable Invoices">
      <style>{`
        .ap-page{padding:0 18px 12px;display:flex;flex-direction:column;height:100%;overflow:hidden}
        .ap-error{background:rgba(239,68,68,0.08);border:0.5px solid rgba(239,68,68,0.2);border-radius:8px;padding:10px 14px;margin-bottom:10px;font-size:13px;color:var(--danger-subtle, #fca5a5);flex-shrink:0}
      `}</style>

      <div className="ap-page">

        {/* KPI bar */}
        {kpis && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:8, marginBottom:10, flexShrink:0 }}>
            {[
              { label:'Total Invoiced', value: fmtAmt(kpis.totalInvoiced), color:'var(--accent-violet, #a78bfa)' },
              { label:'Total Paid',     value: fmtAmt(kpis.totalPaid),     color:'var(--success, #4ade80)' },
              { label:'Pending',        value: fmtAmt(kpis.totalPending),  color:'var(--warning, #fbbf24)' },
              { label:'Overdue',        value: fmtAmt(kpis.totalOverdue),  color:'var(--danger, #f87171)' },
              { label:'Payment Rate',   value: `${kpis.paymentRate.toFixed(1)}%`, color: kpis.paymentRate >= 80 ? 'var(--success, #4ade80)' : 'var(--warning, #fbbf24)' },
            ].map(k => (
              <div key={k.label} style={{ background:'rgba(10,7,18,0.7)', border:'0.5px solid rgba(167,139,250,0.12)', borderRadius:9, padding:'10px 14px' }}>
                <div style={{ fontSize:10, fontWeight:500, letterSpacing:'0.08em', textTransform:'uppercase', color:'rgba(167,139,250,0.5)', marginBottom:4 }}>{k.label}</div>
                <div style={{ fontSize:18, fontWeight:500, fontFamily:"'IBM Plex Mono',monospace", color:k.color }}>{k.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Status filter pills */}
        <div style={{ display:'flex', gap:8, marginBottom:10, flexShrink:0, flexWrap:'wrap' }}>
          {(['draft','posted','partial','paid','void'] as const).map(s => {
            const style = STATUS_STYLE[s]; const isActive = statusFilter === s;
            return (
              <div key={s} onClick={() => setStatusFilter(prev => prev === s ? null : s)}
                style={{ background: isActive ? style.bg : 'rgba(10,7,18,0.7)', border:`0.5px solid ${isActive ? style.color : style.border}`, borderRadius:8, padding:'6px 12px', display:'flex', flexDirection:'column', gap:2, minWidth:70, cursor:'pointer', transition:'all 0.15s' }}>
                <span style={{ fontSize:10, color:style.color, textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:500 }}>{style.label}</span>
                <span style={{ fontSize:18, fontWeight:500, color: isActive ? style.color : 'var(--text-strong, #f1ede8)', fontFamily:"'IBM Plex Mono',monospace" }}>{counts[s] ?? 0}</span>
              </div>
            );
          })}
          <div onClick={() => setStatusFilter(null)}
            style={{ background: !statusFilter ? 'rgba(167,139,250,0.08)' : 'rgba(10,7,18,0.7)', border:`0.5px solid ${!statusFilter ? 'rgba(167,139,250,0.3)' : 'rgba(255,255,255,0.07)'}`, borderRadius:8, padding:'6px 12px', display:'flex', flexDirection:'column', gap:2, minWidth:60, cursor:'pointer', transition:'all 0.15s' }}>
            <span style={{ fontSize:10, color:'rgba(167,139,250,0.6)', textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:500 }}>All</span>
            <span style={{ fontSize:18, fontWeight:500, color:'var(--accent-violet, #a78bfa)', fontFamily:"'IBM Plex Mono',monospace" }}>{invoices.length}</span>
          </div>
        </div>

        {/* Filter bar + New button */}
        <div style={{ display:'flex', alignItems:'flex-end', gap:10, marginBottom:10, flexShrink:0, flexWrap:'wrap' }}>
          <div style={{ flex:1 }}>
            <ERPFilterBar
              filters={filterDefs}
              values={filterVals}
              onChange={setFilterVal}
              onReset={resetFilters}
              activeCount={filterCount}
            />
          </div>
          <button onClick={() => setCreateOpen(true)}
            style={{ display:'flex', alignItems:'center', gap:6, background:'linear-gradient(135deg,#4c1d95,#6d28d9,#7c3aed)', border:'none', borderRadius:7, padding:'7px 14px', fontSize:12, fontWeight:500, fontFamily:"'IBM Plex Sans',sans-serif", color:'white', cursor:'pointer', boxShadow:'0 3px 12px rgba(109,40,217,0.35)', flexShrink:0, alignSelf:'flex-end', whiteSpace:'nowrap' }}>
            + New AP Invoice
          </button>
        </div>

        {error && <div className="ap-error">{error}</div>}

        {/* Table */}
        <div style={{ flex:1, minHeight:0, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          <ERPTable<APInvoice>
            columns={columns}
            data={filtered}
            rowKey={r => r.id}
            loading={loading}
            exportFilename="ap-invoices"
            emptyMessage={filterCount || statusFilter ? 'No invoices match your filters.' : 'No AP invoices yet.'}
            defaultPageSize={25}
            maxHeight="100%"
            onRowClick={inv => setDetailInv(inv)}
          />
        </div>
      </div>

      {detailInv && (
        <APDrawer
          inv={detailInv}
          onClose={() => setDetailInv(null)}
          onAction={() => { setDetailInv(null); fetchAll(); }}
        />
      )}

      {createOpen && (
        <CreateApInvoiceModal
          suppliers={suppliers}
          items={items}
          onClose={() => setCreateOpen(false)}
          onSaved={() => { setCreateOpen(false); fetchAll(); }}
        />
      )}
    </ERPShell>
  );
}