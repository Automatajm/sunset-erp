// ============================================================================
// FILE: frontend/app/procurement/goods-receipts/page.tsx
// ============================================================================
"use client";

import { useEffect, useState, useCallback, useMemo } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import { ERPTable, ERPColumn } from '@/components/ui/ERPTable';
import {
  ERPFilterBar, ERPFilter, useERPFilters, applyERPFilters, dateInSelection,
} from '@/components/ui/ERPFilterBar';
import { goodsReceiptsApi, GoodsReceipt, GrnStats, CreateGoodsReceiptDto } from '@/lib/api/goods-receipts';
import { purchaseOrdersApi } from '@/lib/api/purchase-orders';
import { warehousesApi } from '@/lib/api/warehouses';
import { itemsApi } from '@/lib/api/items';
import { suppliersApi } from '@/lib/api/suppliers';
import SearchSelect from '@/components/ui/SearchSelect';
import { DateSelection } from '@/components/ui/ERPDatePicker';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PO {
  id: string; poNumber: string; status: string;
  warehouseId?: string;
  supplier?: { name: string; code: string };
  lines?: { id: string; itemId: string; item?: { code: string; name: string; baseUom: string }; orderedQuantity: string; receivedQuantity: string; uom: string; unitPrice: string }[];
}
interface Warehouse { id: string; code: string; name: string; }
interface Item      { id: string; code: string; name: string; baseUom: string; }
interface Supplier  { id: string; code: string; name: string; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtAmt(v: number | string) {
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

// ─── Status / Condition config ────────────────────────────────────────────────

const STATUS_CFG = {
  posted:    { color: '#4ade80', bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.2)',  label: 'Posted'    },
  cancelled: { color: '#f87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.2)', label: 'Cancelled' },
};

const CONDITION_CFG: Record<string, { color: string; label: string }> = {
  complete:  { color: '#4ade80', label: 'Complete' },
  partial:   { color: '#fb923c', label: 'Partial'  },
  damaged:   { color: '#f87171', label: 'Damaged'  },
  rejected:  { color: '#f87171', label: 'Rejected' },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_CFG[status as keyof typeof STATUS_CFG] ?? STATUS_CFG.posted;
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'2px 9px', borderRadius:20, fontSize:11, fontWeight:500, color:s.color, background:s.bg, border:`0.5px solid ${s.border}`, whiteSpace:'nowrap' }}>
      <span style={{ width:5, height:5, borderRadius:'50%', background:s.color, flexShrink:0 }} />{s.label}
    </span>
  );
}

// ─── GRN Detail Drawer ────────────────────────────────────────────────────────

function GrnDetailDrawer({ grn, onClose, onAction }: {
  grn: GoodsReceipt; onClose: () => void; onAction: () => void;
}) {
  const [detail,     setDetail]     = useState<GoodsReceipt | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [cancelBusy, setCancelBusy] = useState(false);
  const [error,      setError]      = useState('');

  useEffect(() => {
    goodsReceiptsApi.getById(grn.id)
      .then(d => setDetail(d))
      .catch(() => setError('Failed to load GRN details.'))
      .finally(() => setLoading(false));
  }, [grn.id]);

  const handleCancel = async () => {
    if (!confirm(`Cancel GRN ${grn.grnNumber}? This will reverse all stock movements.`)) return;
    setCancelBusy(true);
    try { await goodsReceiptsApi.cancel(grn.id); onAction(); onClose(); }
    catch (err: any) { setError(err?.response?.data?.message || 'Cancel failed.'); }
    finally { setCancelBusy(false); }
  };

  const MONO: React.CSSProperties = { fontFamily: "'IBM Plex Mono',monospace" };

  return (
    <div style={{ position:'fixed', inset:0, zIndex:400, display:'flex' }}>
      <div style={{ flex:1, background:'rgba(0,0,0,0.5)', backdropFilter:'blur(2px)' }} onClick={onClose} />
      <div style={{ width:700, background:'#0a0712', borderLeft:'0.5px solid rgba(74,222,128,0.15)', display:'flex', flexDirection:'column', overflowY:'auto' }}>

        <div style={{ padding:'16px 20px', borderBottom:'0.5px solid rgba(255,255,255,0.06)', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div>
            <div style={{ fontSize:14, fontWeight:500, color:'#f1ede8', ...MONO }}>{grn.grnNumber}</div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,0.4)', marginTop:2 }}>
              {grn.supplierName ? `${grn.supplierName} · ` : ''}{grn.warehouseName}
              {grn.poNumber && <span style={{ color:'rgba(251,146,60,0.5)', marginLeft:8 }}>· PO {grn.poNumber}</span>}
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <StatusBadge status={grn.status} />
            <button onClick={onClose} style={{ width:24, height:24, borderRadius:6, background:'rgba(255,255,255,0.06)', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.45)', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
          </div>
        </div>

        {loading ? (
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'rgba(255,255,255,0.3)', fontSize:13 }}>Loading…</div>
        ) : detail ? (
          <div style={{ flex:1, overflowY:'auto', padding:'16px 20px', display:'flex', flexDirection:'column', gap:16 }}>
            {error && <div style={{ background:'rgba(239,68,68,0.08)', border:'0.5px solid rgba(239,68,68,0.2)', borderRadius:7, padding:'8px 12px', fontSize:12, color:'#fca5a5' }}>{error}</div>}

            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10 }}>
              {[
                { label:'Received Date', value: fmtDate(detail.receivedDate) },
                { label:'Condition',     value: CONDITION_CFG[detail.condition]?.label ?? detail.condition },
                { label:'PO Number',     value: detail.poNumber ?? '—' },
                { label:'Warehouse',     value:`${detail.warehouseCode} — ${detail.warehouseName}` },
              ].map(item => (
                <div key={item.label} style={{ background:'rgba(255,255,255,0.03)', borderRadius:8, padding:'8px 12px' }}>
                  <div style={{ fontSize:10, color:'rgba(255,255,255,0.3)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>{item.label}</div>
                  <div style={{ fontSize:12, color:'#e2dfd8' }}>{item.value}</div>
                </div>
              ))}
            </div>

            <div>
              <div style={{ fontSize:11, fontWeight:500, color:'rgba(74,222,128,0.6)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>Receipt Lines</div>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead>
                  <tr>
                    {['#','Item','Qty Received','UOM','Unit Cost','Total','Lot'].map(h => (
                      <th key={h} style={{ padding:'6px 8px', fontSize:10, color:'rgba(74,222,128,0.5)', fontWeight:500, letterSpacing:'0.08em', textTransform:'uppercase', textAlign:['Qty Received','Unit Cost','Total'].includes(h)?'right':'left', borderBottom:'0.5px solid rgba(255,255,255,0.06)', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detail.lines?.map(line => (
                    <tr key={line.id} style={{ borderBottom:'0.5px solid rgba(255,255,255,0.04)' }}>
                      <td style={{ padding:'8px', color:'rgba(255,255,255,0.3)', ...MONO }}>{line.lineNumber}</td>
                      <td style={{ padding:'8px' }}>
                        <div style={{ ...MONO, color:'#fb923c', fontSize:11 }}>{line.item?.code}</div>
                        <div style={{ color:'rgba(255,255,255,0.55)', fontSize:11, marginTop:1 }}>{line.item?.name}</div>
                      </td>
                      <td style={{ padding:'8px', textAlign:'right', ...MONO, color:'#4ade80', fontWeight:500 }}>{Number(line.receivedQuantity).toLocaleString()}</td>
                      <td style={{ padding:'8px', color:'rgba(255,255,255,0.45)' }}>{line.uom}</td>
                      <td style={{ padding:'8px', textAlign:'right', ...MONO, fontSize:11 }}>{line.unitCost ? fmtAmt(line.unitCost) : '—'}</td>
                      <td style={{ padding:'8px', textAlign:'right', ...MONO, fontWeight:500, color:'#e2dfd8' }}>
                        {line.unitCost ? fmtAmt(Number(line.receivedQuantity) * Number(line.unitCost)) : '—'}
                      </td>
                      <td style={{ padding:'8px', color:'rgba(255,255,255,0.35)', fontSize:11 }}>{line.lotNumber ?? '—'}</td>
                    </tr>
                  ))}
                  <tr style={{ background:'rgba(255,255,255,0.02)' }}>
                    <td colSpan={4} style={{ padding:'8px', fontSize:11, color:'rgba(255,255,255,0.3)', fontWeight:500 }}>TOTAL VALUE</td>
                    <td colSpan={2} style={{ padding:'8px', textAlign:'right', ...MONO, fontWeight:600, color:'#4ade80', fontSize:14 }}>
                      {fmtAmt(detail.lines?.reduce((sum, l) => sum + Number(l.receivedQuantity) * Number(l.unitCost ?? 0), 0) ?? 0)}
                    </td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>

            {detail.notes && (
              <div style={{ background:'rgba(255,255,255,0.02)', border:'0.5px solid rgba(255,255,255,0.06)', borderRadius:8, padding:'10px 14px' }}>
                <div style={{ fontSize:10, color:'rgba(255,255,255,0.3)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>Notes</div>
                <div style={{ fontSize:12, color:'rgba(255,255,255,0.55)', lineHeight:1.6 }}>{detail.notes}</div>
              </div>
            )}

            {detail.status === 'posted' && (
              <div style={{ display:'flex', gap:8, paddingTop:8, borderTop:'0.5px solid rgba(255,255,255,0.06)' }}>
                <button onClick={handleCancel} disabled={cancelBusy}
                  style={{ padding:'7px 16px', borderRadius:7, fontSize:12, cursor:'pointer', background:'rgba(239,68,68,0.08)', border:'0.5px solid rgba(239,68,68,0.2)', color:'#f87171', fontFamily:"'IBM Plex Sans',sans-serif", opacity:cancelBusy?0.5:1 }}>
                  {cancelBusy ? 'Cancelling…' : 'Cancel GRN'}
                </button>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ─── Create GRN Modal ─────────────────────────────────────────────────────────

interface NewGrnLine {
  itemId: string; receivedQuantity: string;
  uom: string; unitCost: string; lotNumber: string; notes: string;
  poLineId?: string;
}
const EMPTY_LINE: NewGrnLine = { itemId:'', receivedQuantity:'', uom:'PCS', unitCost:'', lotNumber:'', notes:'' };

// Check if a line is complete enough to allow adding another
function lineIsComplete(line: NewGrnLine): boolean {
  return !!line.itemId && !!line.receivedQuantity && Number(line.receivedQuantity) > 0;
}

function CreateGrnModal({ open, onClose, onSaved, warehouses, items }: {
  open: boolean; onClose: () => void; onSaved: () => void;
  warehouses: Warehouse[]; items: Item[];
}) {
  const [selectedPoId,  setSelectedPoId]  = useState('');
  const [selectedPo,    setSelectedPo]    = useState<PO | null>(null);
  const [poOptions,     setPoOptions]     = useState<PO[]>([]);
  const [poLoadingList, setPoLoadingList] = useState(false);
  const [poLoadingDet,  setPoLoadingDet]  = useState(false);
  const [warehouseId,   setWarehouseId]   = useState('');
  const [receivedDate,  setReceivedDate]  = useState('');
  const [condition,     setCondition]     = useState('complete');
  const [notes,         setNotes]         = useState('');
  const [lines,         setLines]         = useState<NewGrnLine[]>([{ ...EMPTY_LINE }]);
  const [submitting,    setSubmitting]    = useState(false);
  const [error,         setError]         = useState('');

  // Load receivable POs on mount
  useEffect(() => {
    if (!open) return;
    setPoLoadingList(true);
    purchaseOrdersApi.getAll({ status: 'confirmed' })
      .then(all => {
        // Include approved + partial (partial may not be supported by backend filter — merge both)
        return purchaseOrdersApi.getAll({ status: 'partially_received' }).then(partial => {
          const combined = [...(all as PO[]), ...(partial as PO[])];
          // deduplicate by id
          const deduped = Array.from(new Map(combined.map(p => [p.id, p])).values());
          setPoOptions(deduped);
        }).catch(() => setPoOptions(all as PO[]));
      })
      .catch(() => setPoOptions([]))
      .finally(() => setPoLoadingList(false));
  }, [open]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setSelectedPoId(''); setSelectedPo(null);
      setWarehouseId('');
      setReceivedDate(new Date().toISOString().slice(0,10));
      setCondition('complete'); setNotes('');
      setLines([{ ...EMPTY_LINE }]); setError('');
    }
  }, [open]);

  // When PO is selected from SearchSelect → load detail
  const handlePoSelect = useCallback(async (poId: string) => {
    setSelectedPoId(poId);
    if (!poId) {
      setSelectedPo(null);
      setLines([{ ...EMPTY_LINE }]);
      setWarehouseId('');
      return;
    }
    setPoLoadingDet(true);
    try {
      const detail = await purchaseOrdersApi.getById(poId) as PO;
      setSelectedPo(detail);
      // Auto-fill warehouse from PO if available
      if (detail.warehouseId) setWarehouseId(detail.warehouseId);
      // Pre-populate lines from PO pending quantities
      if (detail.lines?.length) {
        setLines(detail.lines.map(l => ({
          itemId: l.itemId,
          receivedQuantity: '',
          uom: l.uom || l.item?.baseUom || 'PCS',
          unitCost: l.unitPrice ?? '',
          lotNumber: '', notes: '',
          poLineId: l.id,
        })));
      }
      setError('');
    } catch { setError('Failed to load PO details.'); }
    finally { setPoLoadingDet(false); }
  }, []);

  const setLine = (idx: number, k: keyof NewGrnLine, v: string) =>
    setLines(ls => ls.map((l, i) => {
      if (i !== idx) return l;
      const upd = { ...l, [k]: v };
      // Auto-populate UOM when item is selected
      if (k === 'itemId') {
        const it = items.find(x => x.id === v);
        if (it) upd.uom = it.baseUom;
      }
      return upd;
    }));

  // Add line — only if last line is complete
  const handleAddLine = () => {
    const lastLine = lines[lines.length - 1];
    if (!lineIsComplete(lastLine)) {
      setError('Complete the current line (item + quantity > 0) before adding a new one.');
      return;
    }
    setError('');
    setLines(ls => [...ls, { ...EMPTY_LINE }]);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!warehouseId) { setError('Warehouse is required.'); return; }
    const validLines = lines.filter(l => l.itemId && l.receivedQuantity && Number(l.receivedQuantity) > 0);
    if (!validLines.length) { setError('At least one line with item and quantity > 0 is required.'); return; }
    setSubmitting(true); setError('');
    try {
      const dto: CreateGoodsReceiptDto = {
        poId: selectedPo?.id, warehouseId,
        receivedDate: receivedDate || undefined,
        condition, notes: notes || undefined,
        lines: validLines.map(l => ({
          poLineId: l.poLineId, itemId: l.itemId,
          receivedQuantity: Number(l.receivedQuantity), uom: l.uom,
          unitCost: l.unitCost ? Number(l.unitCost) : undefined,
          lotNumber: l.lotNumber || undefined, notes: l.notes || undefined,
        })),
      };
      await goodsReceiptsApi.create(dto);
      onSaved(); onClose();
    } catch (err: any) { setError(err?.response?.data?.message || 'Failed to create GRN.'); }
    finally { setSubmitting(false); }
  };

  if (!open) return null;

  const INP: React.CSSProperties = { background:'rgba(255,255,255,0.04)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:7, padding:'8px 12px', fontSize:12, fontFamily:"'IBM Plex Sans',sans-serif", color:'#f1ede8', outline:'none', width:'100%' };
  const LBL: React.CSSProperties = { fontSize:10, fontWeight:500, letterSpacing:'0.08em', textTransform:'uppercase', color:'rgba(74,222,128,0.6)' };
  const LINE_INP: React.CSSProperties = { background:'rgba(255,255,255,0.04)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:5, padding:'5px 7px', fontSize:12, fontFamily:"'IBM Plex Sans',sans-serif", color:'#f1ede8', outline:'none', width:'100%' };

  // PO options for SearchSelect
  const poSelectOptions = poOptions.map(p => ({
    value: p.id,
    label: p.poNumber,
    sublabel: p.supplier?.name ?? '',
  }));

  // Item options for SearchSelect
  const itemSelectOptions = items.map(it => ({
    value: it.id,
    label: it.code,
    sublabel: it.name,
  }));

  return (
    <>
      <style>{`
        .grn-overlay{position:fixed;inset:0;z-index:400;background:rgba(0,0,0,0.7);backdrop-filter:blur(4px);display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow-y:auto}
        .grn-box{background:#0e0b1a;border:0.5px solid rgba(74,222,128,0.2);border-radius:14px;width:100%;max-width:960px;margin:auto;position:relative;box-shadow:0 24px 60px rgba(0,0,0,0.7)}
        .grn-box::before{content:'';position:absolute;top:0;left:30px;right:30px;height:1px;background:linear-gradient(90deg,transparent,rgba(74,222,128,0.4),transparent);pointer-events:none}
        .grn-th{font-size:10px;color:rgba(74,222,128,0.5);text-transform:uppercase;letter-spacing:0.08em;padding:5px 6px;text-align:left;border-bottom:0.5px solid rgba(255,255,255,0.06);white-space:nowrap;font-weight:500}
        .grn-section{font-size:10px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.25);padding:6px 0 4px;border-bottom:0.5px solid rgba(255,255,255,0.06);margin-top:4px;display:flex;align-items:center;justify-content:space-between}
      `}</style>
      <div className="grn-overlay">
        <div className="grn-box">
          {/* Header */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px 12px', borderBottom:'0.5px solid rgba(255,255,255,0.06)', position:'sticky', top:0, background:'#0e0b1a', zIndex:10, borderRadius:'14px 14px 0 0' }}>
            <span style={{ fontSize:14, fontWeight:500, color:'#f1ede8' }}>New Goods Receipt (GRN)</span>
            <button onClick={onClose} style={{ width:24, height:24, borderRadius:6, background:'rgba(255,255,255,0.06)', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.45)', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ padding:'16px 20px', display:'flex', flexDirection:'column', gap:12 }}>
              {error && <div style={{ background:'rgba(239,68,68,0.1)', border:'0.5px solid rgba(239,68,68,0.25)', borderRadius:7, padding:'8px 12px', fontSize:12, color:'#fca5a5' }}>{error}</div>}

              {/* ── Section: Link to PO ── */}
              <div className="grn-section"><span>Link to Purchase Order (optional)</span></div>
              <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                <label style={LBL}>PO Number {poLoadingList && <span style={{ color:'rgba(255,255,255,0.3)', fontWeight:400 }}>— loading…</span>}</label>
                <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                  <div style={{ flex:1 }}>
                    <SearchSelect
                      options={poSelectOptions}
                      value={selectedPoId}
                      onChange={handlePoSelect}
                      placeholder="Search PO number or supplier…"
                      clearLabel="— No PO (manual receipt) —"
                      minWidth={340}
                    />
                  </div>
                  {poLoadingDet && (
                    <span style={{ fontSize:12, color:'rgba(255,255,255,0.3)' }}>Loading PO…</span>
                  )}
                  {selectedPo && (
                    <div style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 10px', background:'rgba(74,222,128,0.06)', border:'0.5px solid rgba(74,222,128,0.2)', borderRadius:7, flexShrink:0 }}>
                      <span style={{ fontSize:11, color:'#4ade80', fontFamily:"'IBM Plex Mono',monospace" }}>{selectedPo.poNumber}</span>
                      {selectedPo.supplier?.name && <span style={{ fontSize:11, color:'rgba(255,255,255,0.4)' }}>{selectedPo.supplier.name}</span>}
                      <span style={{ fontSize:10, color:'rgba(255,255,255,0.25)', background:'rgba(255,255,255,0.05)', padding:'1px 6px', borderRadius:4 }}>{selectedPo.lines?.length} lines</span>
                    </div>
                  )}
                </div>
              </div>

              {/* ── Section: Receipt Details ── */}
              <div className="grn-section"><span>Receipt Details</span></div>
              <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr', gap:10 }}>
                <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                  <label style={LBL}>Warehouse *</label>
                  <select
                    value={warehouseId}
                    onChange={e => setWarehouseId(e.target.value)}
                    style={{ ...INP, cursor:'pointer', borderColor: selectedPo?.warehouseId && warehouseId === selectedPo.warehouseId ? 'rgba(74,222,128,0.3)' : 'rgba(255,255,255,0.1)' }}>
                    <option value="">— Select warehouse —</option>
                    {warehouses.map(w => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
                  </select>
                  {selectedPo?.warehouseId && warehouseId === selectedPo.warehouseId && (
                    <span style={{ fontSize:9, color:'rgba(74,222,128,0.5)' }}>✓ auto-filled from PO</span>
                  )}
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                  <label style={LBL}>Received Date</label>
                  <input type="date" value={receivedDate} onChange={e => setReceivedDate(e.target.value)} style={INP} />
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                  <label style={LBL}>Condition</label>
                  <select value={condition} onChange={e => setCondition(e.target.value)} style={{ ...INP, cursor:'pointer' }}>
                    {['complete','partial','damaged','rejected'].map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                  <label style={LBL}>Notes</label>
                  <input style={INP} placeholder="Optional…" value={notes} onChange={e => setNotes(e.target.value)} />
                </div>
              </div>

              {/* ── Section: Lines ── */}
              <div className="grn-section">
                <span>Receipt Lines</span>
                {!selectedPo && (
                  <button type="button"
                    title={!lineIsComplete(lines[lines.length - 1]) ? 'Complete the current line first' : 'Add line'}
                    style={{
                      background: lineIsComplete(lines[lines.length - 1]) ? 'rgba(74,222,128,0.08)' : 'rgba(255,255,255,0.03)',
                      border: `0.5px solid ${lineIsComplete(lines[lines.length - 1]) ? 'rgba(74,222,128,0.25)' : 'rgba(255,255,255,0.08)'}`,
                      borderRadius:5, padding:'4px 10px', fontSize:11,
                      color: lineIsComplete(lines[lines.length - 1]) ? '#4ade80' : 'rgba(255,255,255,0.25)',
                      cursor: lineIsComplete(lines[lines.length - 1]) ? 'pointer' : 'not-allowed',
                      fontFamily:"'IBM Plex Sans',sans-serif",
                      transition:'all 0.15s',
                    }}
                    onClick={handleAddLine}>
                    + Add Line
                  </button>
                )}
              </div>

              <table style={{ width:'100%', borderCollapse:'collapse' }}>
                <thead>
                  <tr>
                    <th className="grn-th" style={{ width:240 }}>Item *</th>
                    <th className="grn-th" style={{ width:110 }}>Qty Received *</th>
                    <th className="grn-th" style={{ width:80 }}>UOM</th>
                    <th className="grn-th" style={{ width:100 }}>Unit Cost</th>
                    <th className="grn-th" style={{ width:120 }}>Lot Number</th>
                    <th className="grn-th">Notes</th>
                    {!selectedPo && <th className="grn-th" style={{ width:28 }}></th>}
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => {
                    const poLine = selectedPo?.lines?.find(l => l.id === line.poLineId);
                    const pendingQty = poLine
                      ? Number(poLine.orderedQuantity) - Number(poLine.receivedQuantity)
                      : null;
                    const isLineComplete = lineIsComplete(line);

                    return (
                      <tr key={idx} style={{ background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)' }}>

                        {/* Item cell */}
                        <td style={{ padding:'4px 3px', verticalAlign:'top' }}>
                          {selectedPo && poLine ? (
                            // PO-linked line: show item read-only
                            <div style={{ padding:'5px 7px', background:'rgba(255,255,255,0.02)', borderRadius:5, fontSize:12, border:'0.5px solid rgba(255,255,255,0.06)' }}>
                              <span style={{ fontFamily:"'IBM Plex Mono',monospace", color:'#fb923c', fontSize:11 }}>{poLine.item?.code}</span>
                              <span style={{ color:'rgba(255,255,255,0.5)', marginLeft:6, fontSize:11 }}>{poLine.item?.name}</span>
                            </div>
                          ) : (
                            // Manual: SearchSelect for item
                            <SearchSelect
                              options={itemSelectOptions}
                              value={line.itemId}
                              onChange={v => setLine(idx, 'itemId', v)}
                              placeholder="Search item…"
                              clearLabel="— Select item —"
                              minWidth={200}
                            />
                          )}
                        </td>

                        {/* Qty cell */}
                        <td style={{ padding:'4px 3px', verticalAlign:'top' }}>
                          <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                            <input
                              style={{
                                ...LINE_INP, textAlign:'right',
                                borderColor: line.receivedQuantity && Number(line.receivedQuantity) > 0
                                  ? 'rgba(74,222,128,0.3)'
                                  : 'rgba(255,255,255,0.1)',
                              }}
                              type="number" min="0" step="0.001"
                              placeholder={pendingQty !== null ? `max ${pendingQty}` : '0'}
                              value={line.receivedQuantity}
                              onChange={e => setLine(idx, 'receivedQuantity', e.target.value)}
                            />
                            {poLine && (
                              <div style={{ fontSize:9, color:'rgba(255,255,255,0.25)', textAlign:'right' }}>
                                ordered: {Number(poLine.orderedQuantity).toLocaleString()} · rcvd: {Number(poLine.receivedQuantity).toLocaleString()}
                              </div>
                            )}
                          </div>
                        </td>

                        {/* UOM cell — auto-filled, readonly if item selected */}
                        <td style={{ padding:'4px 3px', verticalAlign:'top' }}>
                          <input
                            style={{
                              ...LINE_INP,
                              color: line.uom ? '#fb923c' : 'rgba(255,255,255,0.4)',
                              background: line.itemId || poLine ? 'rgba(251,146,60,0.04)' : 'rgba(255,255,255,0.04)',
                              borderColor: line.uom ? 'rgba(251,146,60,0.2)' : 'rgba(255,255,255,0.1)',
                            }}
                            placeholder="PCS"
                            value={line.uom}
                            onChange={e => setLine(idx, 'uom', e.target.value)}
                          />
                        </td>

                        {/* Unit Cost */}
                        <td style={{ padding:'4px 3px', verticalAlign:'top' }}>
                          <input
                            style={{ ...LINE_INP, textAlign:'right' }}
                            type="number" min="0" step="0.0001"
                            placeholder={poLine ? String(poLine.unitPrice) : '0.00'}
                            value={line.unitCost}
                            onChange={e => setLine(idx, 'unitCost', e.target.value)}
                          />
                        </td>

                        {/* Lot Number */}
                        <td style={{ padding:'4px 3px', verticalAlign:'top' }}>
                          <input style={LINE_INP} placeholder="LOT-001" value={line.lotNumber} onChange={e => setLine(idx, 'lotNumber', e.target.value)} />
                        </td>

                        {/* Notes */}
                        <td style={{ padding:'4px 3px', verticalAlign:'top' }}>
                          <input style={LINE_INP} placeholder="Optional…" value={line.notes} onChange={e => setLine(idx, 'notes', e.target.value)} />
                        </td>

                        {/* Remove button — manual only */}
                        {!selectedPo && (
                          <td style={{ padding:'4px 3px', verticalAlign:'top' }}>
                            {lines.length > 1 && (
                              <button type="button"
                                style={{ width:22, height:22, borderRadius:4, background:'rgba(239,68,68,0.1)', border:'0.5px solid rgba(239,68,68,0.2)', color:'#f87171', cursor:'pointer', fontSize:13, display:'flex', alignItems:'center', justifyContent:'center' }}
                                onClick={() => setLines(ls => ls.filter((_,i) => i !== idx))}>×</button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Line completion hint for manual mode */}
              {!selectedPo && lines.length > 0 && !lineIsComplete(lines[lines.length - 1]) && lines.length > 1 && (
                <div style={{ fontSize:11, color:'rgba(251,146,60,0.5)', padding:'4px 6px', background:'rgba(251,146,60,0.05)', borderRadius:6, border:'0.5px solid rgba(251,146,60,0.15)' }}>
                  ⚠ Complete the last line (select item + enter quantity) to add more lines.
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ display:'flex', justifyContent:'flex-end', gap:8, padding:'12px 20px 18px', borderTop:'0.5px solid rgba(255,255,255,0.06)' }}>
              <button type="button" onClick={onClose}
                style={{ background:'rgba(255,255,255,0.05)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:7, padding:'8px 16px', fontSize:13, fontFamily:"'IBM Plex Sans',sans-serif", color:'rgba(255,255,255,0.5)', cursor:'pointer' }}>
                Cancel
              </button>
              <button type="submit" disabled={submitting}
                style={{ background:'linear-gradient(135deg,#166534,#15803d,#16a34a)', border:'none', borderRadius:7, padding:'8px 20px', fontSize:13, fontWeight:500, fontFamily:"'IBM Plex Sans',sans-serif", color:'white', cursor:'pointer', boxShadow:'0 3px 12px rgba(22,163,74,0.3)', opacity:submitting?0.5:1 }}>
                {submitting ? 'Creating…' : 'Create GRN'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function GoodsReceiptsPage() {
  const [grns,       setGrns]       = useState<GoodsReceipt[]>([]);
  const [stats,      setStats]      = useState<GrnStats | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [suppliers,  setSuppliers]  = useState<Supplier[]>([]);
  const [items,      setItems]      = useState<Item[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [detailGrn,  setDetailGrn]  = useState<GoodsReceipt | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [grnData, statsData, whData, itemData, supData] = await Promise.all([
        goodsReceiptsApi.getAll(),
        goodsReceiptsApi.getStats(),
        warehousesApi.getAll(),
        itemsApi.getAll(),
        suppliersApi.getAll(),
      ]);
      setGrns(grnData);
      setStats(statsData);
      setWarehouses(whData as Warehouse[]);
      setItems(itemData as Item[]);
      setSuppliers(supData as Supplier[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filterDefs = useMemo<ERPFilter<GoodsReceipt>[]>(() => [
    {
      key: 'supplierId', label: 'Supplier', type: 'searchselect',
      placeholder: 'Search supplier…', selectWidth: 200,
      options: suppliers.map(s => ({ value: s.id, label: `${s.code} — ${s.name}` })),
      filterFn: (row, val) => (row as any).supplierId === val || row.supplierName === suppliers.find(s => s.id === val)?.name,
    },
    {
      key: 'poId', label: 'PO Number', type: 'searchselect',
      placeholder: 'Search PO…', selectWidth: 175,
      options: Array.from(new Map(grns.filter(g => g.poId && g.poNumber).map(g => [g.poId!, { value: g.poId!, label: g.poNumber!, sublabel: g.supplierName ?? undefined }])).values()),
      filterFn: (row, val) => row.poId === val,
    },
    {
      key: 'warehouseId', label: 'Warehouse', type: 'searchselect',
      placeholder: 'Search warehouse…', selectWidth: 190,
      options: warehouses.map(w => ({ value: w.id, label: `${w.code} — ${w.name}` })),
      filterFn: (row, val) => row.warehouseId === val,
    },
    {
      key: 'receivedDate', label: 'Received Date', type: 'daterange',
      placeholder: 'Received date…', dateWidth: 195,
      filterFn: (row, val) => dateInSelection(row.receivedDate, val as DateSelection),
    },
    {
      key: 'condition', label: 'Condition', type: 'multiselect',
      options: Object.entries(CONDITION_CFG).map(([v, c]) => ({
        value: v, label: c.label,
        color: c.color, bg: `${c.color}15`, border: `${c.color}30`,
      })),
      filterFn: (row, val) => (val as string[]).includes(row.condition),
    },
    {
      key: 'hasPo', label: 'Linked to PO', type: 'boolean',
      placeholder: 'Linked to PO',
      filterFn: (row, val) => val === true ? !!row.poId : true,
    },
  ], [warehouses, suppliers, grns]);

  const { values: filterVals, setValue: setFilterVal, reset: resetFilters, activeCount: filterCount } = useERPFilters(filterDefs);

  const filtered = useMemo(() => {
    const base = applyERPFilters(grns, filterDefs, filterVals);
    return statusFilter ? base.filter(g => g.status === statusFilter) : base;
  }, [grns, filterDefs, filterVals, statusFilter]);

  const columns = useMemo<ERPColumn<GoodsReceipt>[]>(() => [
    {
      key: 'grnNumber', header: 'GRN Number', width: 150, sortable: true,
      value: r => r.grnNumber,
      render: r => <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:12, color:'#4ade80', fontWeight:500 }}>{r.grnNumber}</span>,
    },
    {
      key: 'poNumber', header: 'PO Number', width: 130, sortable: true,
      value: r => r.poNumber ?? '',
      render: r => r.poNumber
        ? <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color:'#fb923c' }}>{r.poNumber}</span>
        : <span style={{ color:'rgba(255,255,255,0.2)', fontSize:12 }}>—</span>,
    },
    {
      key: 'supplierName', header: 'Supplier', sortable: true,
      value: r => r.supplierName ?? '',
      render: r => <span style={{ color:'#e2dfd8', fontWeight:500 }}>{r.supplierName ?? '—'}</span>,
    },
    {
      key: 'warehouseCode', header: 'Warehouse', width: 140, sortable: true,
      value: r => r.warehouseCode,
      render: r => (
        <div>
          <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color:'#a78bfa' }}>{r.warehouseCode}</div>
          <div style={{ fontSize:10, color:'rgba(255,255,255,0.3)', marginTop:1 }}>{r.warehouseName}</div>
        </div>
      ),
    },
    {
      key: 'receivedDate', header: 'Received', width: 110, sortable: true,
      value: r => r.receivedDate,
      render: r => <span style={{ fontSize:12, color:'rgba(255,255,255,0.5)' }}>{fmtDateShort(r.receivedDate)}</span>,
    },
    {
      key: 'lineCount', header: 'Lines', width: 65, align: 'center', sortable: true,
      value: r => r.lineCount ?? 0,
      render: r => <span style={{ fontSize:12, color:'rgba(255,255,255,0.4)' }}>{r.lineCount ?? 0}</span>,
    },
    {
      key: 'totalValue', header: 'Total Value', width: 120, align: 'right', sortable: true,
      value: r => r.totalValue ?? 0,
      render: r => r.totalValue
        ? <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:12, fontWeight:500, color:'#e2dfd8' }}>{fmtAmt(r.totalValue)}</span>
        : <span style={{ color:'rgba(255,255,255,0.2)', fontSize:12 }}>—</span>,
    },
    {
      key: 'condition', header: 'Condition', width: 100, sortable: true,
      value: r => r.condition,
      render: r => {
        const c = CONDITION_CFG[r.condition];
        return c
          ? <span style={{ fontSize:11, color:c.color, background:`${c.color}15`, border:`0.5px solid ${c.color}30`, padding:'2px 8px', borderRadius:20 }}>{c.label}</span>
          : <span style={{ fontSize:11, color:'rgba(255,255,255,0.4)' }}>{r.condition}</span>;
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
        <button onClick={e => { e.stopPropagation(); setDetailGrn(r); }}
          style={{ padding:'4px 10px', borderRadius:6, fontSize:11, cursor:'pointer', background:'rgba(255,255,255,0.05)', border:'0.5px solid rgba(255,255,255,0.1)', color:'rgba(255,255,255,0.55)', fontFamily:"'IBM Plex Sans',sans-serif" }}>
          View
        </button>
      ),
    },
  ], []);

  return (
    <ERPShell breadcrumbs={['Home','Procurement','Goods Receipts']} title="Goods Receipts (GRN)">
      <style>{`
        .grn-page{padding:0 18px 12px;display:flex;flex-direction:column;height:100%;overflow:hidden}
        .grn-error{background:rgba(239,68,68,0.08);border:0.5px solid rgba(239,68,68,0.2);border-radius:8px;padding:10px 14px;margin-bottom:10px;font-size:13px;color:#fca5a5;flex-shrink:0}
      `}</style>
      <div className="grn-page">
        <div style={{ display:'flex', gap:10, marginBottom:10, flexShrink:0, flexWrap:'wrap' }}>
          {stats && [
            { key:'posted',    label:'Posted',    value:stats.posted,    color:'#4ade80', border:'rgba(74,222,128,0.2)'  },
            { key:'cancelled', label:'Cancelled', value:stats.cancelled, color:'#f87171', border:'rgba(248,113,113,0.2)' },
            { key:'today',     label:'Today',     value:stats.today,     color:'#60a5fa', border:'rgba(96,165,250,0.2)'  },
          ].map(s => {
            const isActive = statusFilter === s.key;
            return (
              <div key={s.key} onClick={() => setStatusFilter(prev => prev === s.key ? null : s.key)}
                style={{ background: isActive ? `${s.color}15` : 'rgba(10,7,18,0.7)', border:`0.5px solid ${isActive ? s.color : s.border}`, borderRadius:8, padding:'8px 14px', display:'flex', flexDirection:'column', gap:2, minWidth:90, cursor:'pointer', transition:'all 0.15s' }}>
                <span style={{ fontSize:10, color:s.color, textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:500 }}>{s.label}</span>
                <span style={{ fontSize:22, fontWeight:500, color: isActive ? s.color : '#f1ede8', fontFamily:"'IBM Plex Mono',monospace" }}>{s.value}</span>
              </div>
            );
          })}
          {stats && (
            <div style={{ background:'rgba(10,7,18,0.7)', border:'0.5px solid rgba(74,222,128,0.15)', borderRadius:8, padding:'8px 14px', display:'flex', flexDirection:'column', gap:2, minWidth:130 }}>
              <span style={{ fontSize:10, color:'rgba(74,222,128,0.6)', textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:500 }}>Total Value</span>
              <span style={{ fontSize:16, fontWeight:500, color:'#4ade80', fontFamily:"'IBM Plex Mono',monospace" }}>{fmtAmt(stats.totalValue)}</span>
            </div>
          )}
          <div onClick={() => setStatusFilter(null)}
            style={{ background: !statusFilter ? 'rgba(74,222,128,0.08)' : 'rgba(10,7,18,0.7)', border:`0.5px solid ${!statusFilter ? 'rgba(74,222,128,0.3)' : 'rgba(255,255,255,0.07)'}`, borderRadius:8, padding:'8px 14px', display:'flex', flexDirection:'column', gap:2, minWidth:70, cursor:'pointer', transition:'all 0.15s' }}>
            <span style={{ fontSize:10, color:'rgba(74,222,128,0.6)', textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:500 }}>Total</span>
            <span style={{ fontSize:22, fontWeight:500, color:'#4ade80', fontFamily:"'IBM Plex Mono',monospace" }}>{grns.length}</span>
          </div>
        </div>

        <div style={{ display:'flex', alignItems:'flex-end', gap:10, marginBottom:10, flexShrink:0, flexWrap:'wrap' }}>
          <div style={{ flex:1 }}>
            <ERPFilterBar filters={filterDefs} values={filterVals} onChange={setFilterVal} onReset={resetFilters} activeCount={filterCount} />
          </div>
          <button onClick={() => setCreateOpen(true)}
            style={{ display:'flex', alignItems:'center', gap:6, background:'linear-gradient(135deg,#166534,#15803d,#16a34a)', border:'none', borderRadius:7, padding:'7px 14px', fontSize:12, fontWeight:500, fontFamily:"'IBM Plex Sans',sans-serif", color:'white', cursor:'pointer', boxShadow:'0 3px 12px rgba(22,163,74,0.3)', flexShrink:0, alignSelf:'flex-end' }}>
            + New GRN
          </button>
        </div>

        {error && <div className="grn-error">{error}</div>}

        <div style={{ flex:1, minHeight:0, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          <ERPTable<GoodsReceipt>
            columns={columns}
            data={filtered}
            rowKey={r => r.id}
            loading={loading}
            exportFilename="goods-receipts"
            emptyMessage={filterCount || statusFilter ? 'No GRNs match your filters.' : 'No goods receipts yet.'}
            defaultPageSize={25}
            maxHeight="100%"
            onRowClick={g => setDetailGrn(g)}
          />
        </div>
      </div>

      <CreateGrnModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={fetchAll}
        warehouses={warehouses}
        items={items}
      />

      {detailGrn && (
        <GrnDetailDrawer grn={detailGrn} onClose={() => setDetailGrn(null)} onAction={() => { setDetailGrn(null); fetchAll(); }} />
      )}
    </ERPShell>
  );
}