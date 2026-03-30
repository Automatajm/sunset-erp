"use client";

import { useEffect, useState, useCallback, useRef } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import { itemsApi } from '@/lib/api/items';
import { warehousesApi } from '@/lib/api/warehouses';
import apiClient from '@/lib/api/client';
import { stockTransactionsApi } from '@/lib/api/stock-transactions';
import { purchaseOrdersApi } from '@/lib/api/purchase-orders';
import { CreateStockTransactionDto, Item, Warehouse } from '@/lib/api/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LedgerRow {
  id: string; movementNumber: string; movementType: string; movementDate: string;
  item?: { id: string; code: string; name: string; itemType: string; baseUom: string };
  warehouse?: { id: string; code: string; name: string };
  referenceType?: string; referenceNumber: string;
  quantity: number; signedQuantity: number; uom: string;
  unitCost: number; totalValue: number;
  openingBalance: number; closingBalance: number; notes?: string;
}

interface LedgerTotals {
  totalIn: number; totalOut: number; netMovement: number;
  totalInValue: number; totalOutValue: number; netValue: number;
  openingBalance: number; closingBalance: number;
}

interface POLine {
  id: string; lineNumber: number;
  item?: { id: string; code: string; name: string; baseUom: string };
  orderedQuantity: string; receivedQuantity: string;
  uom: string; unitPrice: string; status: string;
}

interface PODetail {
  id: string; poNumber: string;
  supplier?: { name: string };
  lines?: POLine[];
}

// ─── Constants ────────────────────────────────────────────────────────────────

const TX_TYPES = [
  { value: 'receipt',         label: 'Receipt',      color: '#4ade80', bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.2)',  sign: '+' },
  { value: 'issue',           label: 'Issue',        color: '#f87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.2)', sign: '−' },
  { value: 'transfer',        label: 'Transfer',     color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',  border: 'rgba(96,165,250,0.2)',  sign: '⇄' },
  { value: 'adjustment',      label: 'Adjustment',   color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.2)',  sign: '±' },
  { value: 'opening_balance', label: 'Opening Bal.', color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.2)', sign: '◎' },
];

const RECEIPT_CONDITIONS = [
  { value: 'complete',      label: 'Complete — full qty, good condition' },
  { value: 'partial',       label: 'Partial — less than ordered' },
  { value: 'damaged',       label: 'Damaged — items with damage' },
  { value: 'wrong_item',    label: 'Wrong item received' },
  { value: 'late',          label: 'Late delivery' },
  { value: 'presentation',  label: 'Presentation issue (packaging, labeling)' },
  { value: 'overshipment',  label: 'Overshipment — more than ordered' },
];

const ITEM_TYPE_COLOR: Record<string, string> = {
  finished_good: '#4ade80', raw_material: '#60a5fa',
  consumable: '#fbbf24', service: 'rgba(255,255,255,0.35)',
};

const EMPTY_FORM: CreateStockTransactionDto = {
  transactionType: 'receipt', itemId: '', warehouseId: '',
  quantity: 0, uom: 'PCS',
  referenceId: '', referenceType: '', lotNumber: '', serialNumber: '',
  notes: '', transactionDate: '',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTxCfg(t: string) {
  return TX_TYPES.find(x => x.value === t) ?? { value: t, label: t, color: '#e2dfd8', bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.1)', sign: '·' };
}
function fmtAmt(v: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(v);
}
function fmtQty(v: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(Math.abs(v));
}
function fmtDate(d: string) {
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const MONO: React.CSSProperties = { fontFamily: "'IBM Plex Mono',monospace" };

// ─── Badge ────────────────────────────────────────────────────────────────────

function TxBadge({ type }: { type: string }) {
  const c = getTxCfg(type);
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'2px 8px', borderRadius:20, fontSize:10, fontWeight:500, color:c.color, background:c.bg, border:`0.5px solid ${c.border}`, whiteSpace:'nowrap' }}>
      <span style={{ fontSize:11 }}>{c.sign}</span>{c.label}
    </span>
  );
}

// ─── Create modal — enriched with PO lookup ───────────────────────────────────

function CreateTxModal({ open, onClose, onSaved, items, warehouses }: {
  open: boolean; onClose: () => void; onSaved: () => void;
  items: Item[]; warehouses: Warehouse[];
}) {
  const [mode,        setMode]        = useState<'po' | 'manual'>('po');
  const [poInput,     setPoInput]     = useState('');
  const [poLooking,   setPoLooking]   = useState(false);
  const [poDetail,    setPoDetail]    = useState<PODetail | null>(null);
  const [poError,     setPoError]     = useState('');
  // Multi-line receipt state: lineId → { qty, unitCost, checked }
  const [lineRecv, setLineRecv]       = useState<Record<string, { qty: string; unitCost: string; checked: boolean }>>({});
  const [condition,   setCondition]   = useState('complete');
  const [warehouseId, setWarehouseId] = useState('');
  const [lotNumber,   setLotNumber]   = useState('');
  const [txDate,      setTxDate]      = useState('');
  const [notes,       setNotes]       = useState('');
  const [busy,        setBusy]        = useState(false);
  const [error,       setError]       = useState('');

  // Manual mode state
  const [form, setForm] = useState<CreateStockTransactionDto>(EMPTY_FORM);

  useEffect(() => {
    if (open) {
      setMode('po'); setPoInput(''); setPoDetail(null); setPoError('');
      setLineRecv({}); setCondition('complete');
      setWarehouseId(''); setLotNumber('');
      setTxDate(''); setNotes(''); setError('');
      setForm(EMPTY_FORM);
    }
  }, [open]);

  // ── PO Lookup ──────────────────────────────────────────────────────────────
  const lookupPO = async () => {
    if (!poInput.trim()) return;
    setPoLooking(true); setPoError(''); setPoDetail(null); setLineRecv({});
    try {
      const all = await purchaseOrdersApi.getAll() as any[];
      const found = all.find((p: any) =>
        p.poNumber.toLowerCase() === poInput.trim().toLowerCase()
      );
      if (!found) { setPoError(`PO "${poInput}" not found.`); return; }
      if (!['confirmed', 'partially_received'].includes(found.status)) {
        setPoError(`PO is "${found.status}" — only confirmed or partially received POs can be received.`);
        return;
      }
      const detail = await purchaseOrdersApi.getById(found.id) as PODetail;
      setPoDetail(detail);
      // Auto-check all open lines with full pending qty
      const initRecv: Record<string, { qty: string; unitCost: string; checked: boolean }> = {};
      detail.lines?.forEach(l => {
        const pending = Number(l.orderedQuantity) - Number(l.receivedQuantity);
        if (l.status !== 'closed' && pending > 0) {
          initRecv[l.id] = { qty: String(pending), unitCost: l.unitPrice, checked: true };
        }
      });
      setLineRecv(initRecv);
    } catch {
      setPoError('Failed to load PO.');
    } finally { setPoLooking(false); }
  };

  // Helpers for multi-line receipt
  const openLines = poDetail?.lines?.filter(l => {
    const pending = Number(l.orderedQuantity) - Number(l.receivedQuantity);
    return l.status !== 'closed' && pending > 0;
  }) ?? [];
  const checkedCount = Object.values(lineRecv).filter(v => v.checked).length;
  const allChecked = openLines.length > 0 && checkedCount === openLines.length;

  const toggleAll = () => {
    setLineRecv(prev => {
      const next = { ...prev };
      openLines.forEach(l => {
        const pending = Number(l.orderedQuantity) - Number(l.receivedQuantity);
        if (allChecked) {
          next[l.id] = { ...next[l.id], checked: false };
        } else {
          next[l.id] = { qty: next[l.id]?.qty ?? String(pending), unitCost: next[l.id]?.unitCost ?? l.unitPrice, checked: true };
        }
      });
      return next;
    });
  };

  const toggleLine = (lineId: string, line: POLine) => {
    setLineRecv(prev => {
      const cur = prev[lineId];
      const pending = Number(line.orderedQuantity) - Number(line.receivedQuantity);
      return { ...prev, [lineId]: { qty: cur?.qty ?? String(pending), unitCost: cur?.unitCost ?? line.unitPrice, checked: !cur?.checked } };
    });
  };

  const setLineQty = (lineId: string, qty: string) =>
    setLineRecv(prev => ({ ...prev, [lineId]: { ...prev[lineId], qty } }));

  const setLineUnitCost = (lineId: string, uc: string) =>
    setLineRecv(prev => ({ ...prev, [lineId]: { ...prev[lineId], unitCost: uc } }));

  // ── Submit PO receipt ──────────────────────────────────────────────────────
  const handleSubmitPO = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!poDetail) { setError('Look up a PO first.'); return; }
    if (!warehouseId) { setError('Select a warehouse.'); return; }
    const toReceive = Object.values(lineRecv).filter(v => v.checked && Number(v.qty) > 0);
    if (!toReceive.length) { setError('Check at least one line and enter a quantity.'); return; }

    setBusy(true); setError('');
    try {
      const condLabel = RECEIPT_CONDITIONS.find(c => c.value === condition)?.label ?? condition;
      const fullNotes = [`Condition: ${condLabel}`, notes.trim() ? `Notes: ${notes.trim()}` : ''].filter(Boolean).join(' | ');

      const linesToReceive = Object.entries(lineRecv)
        .filter(([, v]) => v.checked && Number(v.qty) > 0)
        .map(([lineId, v]) => ({ lineId, receivedQuantity: Number(v.qty), unitCost: v.unitCost ? Number(v.unitCost) : undefined, lotNumber: lotNumber || undefined }));

      await (purchaseOrdersApi as any).receive(poDetail.id, {
        warehouseId,
        lines: linesToReceive,
        notes: fullNotes,
      });
      onSaved(); onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Receipt failed.');
    } finally { setBusy(false); }
  };

  // ── Submit manual ──────────────────────────────────────────────────────────
  const handleSubmitManual = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!form.itemId || !form.warehouseId) { setError('Item and warehouse are required.'); return; }
    if (!form.quantity || form.quantity === 0) { setError('Quantity must be non-zero.'); return; }
    setBusy(true); setError('');
    try {
      await stockTransactionsApi.create(form);
      onSaved(); onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Operation failed.');
    } finally { setBusy(false); }
  };

  if (!open) return null;

  const I: React.CSSProperties = { background:'rgba(255,255,255,0.04)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:7, padding:'9px 12px', fontSize:13, fontFamily:"'IBM Plex Sans',sans-serif", color:'#f1ede8', outline:'none', width:'100%' };
  const L: React.CSSProperties = { fontSize:11, fontWeight:500, letterSpacing:'0.08em', textTransform:'uppercase', color:'rgba(251,146,60,0.6)', fontFamily:"'IBM Plex Sans',sans-serif" };
  const S: React.CSSProperties = { fontSize:10, fontWeight:500, letterSpacing:'0.12em', textTransform:'uppercase', color:'rgba(255,255,255,0.22)', paddingTop:8, borderTop:'0.5px solid rgba(255,255,255,0.06)', marginTop:4 };

  return (
    <div style={{ position:'fixed', inset:0, zIndex:400, background:'rgba(0,0,0,0.65)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ background:'#0e0b1a', border:'0.5px solid rgba(251,146,60,0.2)', borderRadius:14, width:'100%', maxWidth:600, maxHeight:'94vh', display:'flex', flexDirection:'column', position:'relative', boxShadow:'0 24px 60px rgba(0,0,0,0.7)' }}>
        <div style={{ position:'absolute', top:0, left:30, right:30, height:1, background:'linear-gradient(90deg,transparent,rgba(251,146,60,0.4),transparent)', pointerEvents:'none' }} />

        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 20px 0', flexShrink:0 }}>
          <span style={{ fontSize:14, fontWeight:500, color:'#f1ede8', fontFamily:"'IBM Plex Sans',sans-serif" }}>New Stock Transaction</span>
          <button onClick={onClose} style={{ width:24, height:24, borderRadius:6, background:'rgba(255,255,255,0.06)', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.45)', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
        </div>

        {/* Mode tabs */}
        <div style={{ display:'flex', padding:'0 20px', borderBottom:'0.5px solid rgba(255,255,255,0.06)', flexShrink:0 }}>
          {([['po', '📦 From Purchase Order'], ['manual', '✏️ Manual Entry']] as const).map(([m, label]) => (
            <button key={m} type="button" onClick={() => { setMode(m); setError(''); }}
              style={{ padding:'10px 14px', fontSize:12, cursor:'pointer', color: mode===m ? '#fb923c' : 'rgba(255,255,255,0.4)', border:'none', borderBottom: mode===m ? '2px solid #fb923c' : '2px solid transparent', background:'none', fontFamily:"'IBM Plex Sans',sans-serif", transition:'color 0.15s', whiteSpace:'nowrap' }}>
              {label}
            </button>
          ))}
        </div>

        {/* Scrollable body */}
        <div style={{ flex:1, overflowY:'auto', minHeight:0 }}>

          {/* ── PO mode ── */}
          {mode === 'po' && (
            <form onSubmit={handleSubmitPO}>
              <div style={{ padding:'16px 20px', display:'flex', flexDirection:'column', gap:12 }}>
                {error && <div style={{ background:'rgba(239,68,68,0.1)', border:'0.5px solid rgba(239,68,68,0.25)', borderRadius:7, padding:'8px 12px', fontSize:12, color:'#fca5a5' }}>{error}</div>}

                {/* PO search */}
                <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                  <label style={L}>Purchase Order #</label>
                  <div style={{ display:'flex', gap:8 }}>
                    <input
                      style={{ ...I, flex:1 }}
                      placeholder="PO-2026-074"
                      value={poInput}
                      onChange={e => setPoInput(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), lookupPO())}
                    />
                    <button type="button" onClick={lookupPO} disabled={poLooking || !poInput.trim()}
                      style={{ padding:'9px 16px', borderRadius:7, fontSize:12, fontWeight:500, fontFamily:"'IBM Plex Sans',sans-serif", background:'rgba(251,146,60,0.12)', border:'0.5px solid rgba(251,146,60,0.25)', color:'#fb923c', cursor:'pointer', whiteSpace:'nowrap', opacity: (!poInput.trim() || poLooking) ? 0.5 : 1 }}>
                      {poLooking ? '…' : 'Look up'}
                    </button>
                  </div>
                  {poError && <div style={{ fontSize:12, color:'#f87171', marginTop:2 }}>{poError}</div>}
                </div>

                {/* PO info banner */}
                {poDetail && (
                  <div style={{ background:'rgba(96,165,250,0.06)', border:'0.5px solid rgba(96,165,250,0.2)', borderRadius:8, padding:'10px 14px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:500, color:'#60a5fa', fontFamily:"'IBM Plex Mono',monospace" }}>{poDetail.poNumber}</div>
                      <div style={{ fontSize:11, color:'rgba(255,255,255,0.45)', marginTop:2 }}>{poDetail.supplier?.name}</div>
                    </div>
                    <div style={{ fontSize:11, color:'rgba(255,255,255,0.35)' }}>{poDetail.lines?.filter(l=>l.status!=='closed').length} open lines</div>
                  </div>
                )}

                {/* Lines selector — multi-check */}
                {poDetail && poDetail.lines && (
                  <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                      <label style={L}>Lines to Receive</label>
                      <button type="button" onClick={toggleAll}
                        style={{ fontSize:11, color: allChecked ? '#f87171' : '#4ade80', background:'none', border:'none', cursor:'pointer', fontFamily:"'IBM Plex Sans',sans-serif" }}>
                        {allChecked ? '☐ Deselect all' : '☑ Select all'}
                      </button>
                    </div>
                    <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                      <thead>
                        <tr>
                          {['','#','Item','Pending','UOM','Receive Qty','Unit Cost'].map(h => (
                            <th key={h} style={{ padding:'5px 8px', fontSize:10, color:'rgba(251,146,60,0.5)', fontWeight:500, textTransform:'uppercase', letterSpacing:'0.07em', textAlign: ['Pending','Receive Qty','Unit Cost'].includes(h) ? 'right' : 'left', borderBottom:'0.5px solid rgba(255,255,255,0.06)', whiteSpace:'nowrap' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {poDetail.lines.map(line => {
                          const pending = Number(line.orderedQuantity) - Number(line.receivedQuantity);
                          const isClosed = line.status === 'closed' || pending <= 0;
                          const rv = lineRecv[line.id];
                          const isChecked = !!rv?.checked;
                          return (
                            <tr key={line.id}
                              style={{ opacity: isClosed ? 0.35 : 1, background: isChecked ? 'rgba(74,222,128,0.04)' : 'transparent', borderBottom:'0.5px solid rgba(255,255,255,0.04)', transition:'background 0.1s' }}
                            >
                              <td style={{ padding:'6px 8px' }}>
                                <div onClick={() => !isClosed && toggleLine(line.id, line)}
                                  style={{ width:16, height:16, borderRadius:4, border:`1.5px solid ${isChecked ? '#4ade80' : 'rgba(255,255,255,0.2)'}`, background: isChecked ? '#4ade80' : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', cursor: isClosed ? 'not-allowed' : 'pointer', flexShrink:0, transition:'all 0.1s' }}>
                                  {isChecked && <svg width="9" height="9" viewBox="0 0 9 9" fill="none"><path d="M1.5 4.5L3.5 6.5L7.5 2.5" stroke="#0a0712" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                                </div>
                              </td>
                              <td style={{ padding:'6px 8px', color:'rgba(255,255,255,0.35)' }}>{line.lineNumber}</td>
                              <td style={{ padding:'6px 8px' }}>
                                <div style={{ ...MONO, fontSize:11, color:'#fb923c' }}>{line.item?.code}</div>
                                <div style={{ fontSize:10, color:'rgba(255,255,255,0.4)', marginTop:1 }}>{line.item?.name}</div>
                              </td>
                              <td style={{ padding:'6px 8px', textAlign:'right', ...MONO, color: isClosed ? 'rgba(255,255,255,0.2)' : '#fb923c', fontWeight:500 }}>{isClosed ? '✓ done' : pending.toLocaleString()}</td>
                              <td style={{ padding:'6px 8px', color:'rgba(255,255,255,0.35)', fontSize:11 }}>{line.uom}</td>
                              <td style={{ padding:'6px 8px' }}>
                                {!isClosed && isChecked ? (
                                  <input type="number" min="0.001" max={pending} step="0.001"
                                    value={rv?.qty ?? ''}
                                    onChange={e => setLineQty(line.id, e.target.value)}
                                    style={{ background:'rgba(74,222,128,0.08)', border:'0.5px solid rgba(74,222,128,0.25)', borderRadius:5, padding:'4px 7px', fontSize:12, fontFamily:"'IBM Plex Mono',monospace", color:'#e2dfd8', outline:'none', width:'90px', textAlign:'right' }}
                                  />
                                ) : <span style={{ fontSize:11, color:'rgba(255,255,255,0.2)' }}>—</span>}
                              </td>
                              <td style={{ padding:'6px 8px' }}>
                                {!isClosed && isChecked ? (
                                  <input type="number" min="0" step="0.0001"
                                    value={rv?.unitCost ?? ''}
                                    onChange={e => setLineUnitCost(line.id, e.target.value)}
                                    style={{ background:'rgba(255,255,255,0.04)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:5, padding:'4px 7px', fontSize:12, fontFamily:"'IBM Plex Mono',monospace", color:'#e2dfd8', outline:'none', width:'90px', textAlign:'right' }}
                                  />
                                ) : <span style={{ fontSize:11, color:'rgba(255,255,255,0.2)' }}>—</span>}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                    {checkedCount > 0 && (
                      <div style={{ fontSize:11, color:'rgba(74,222,128,0.7)', textAlign:'right' }}>
                        {checkedCount} line{checkedCount !== 1 ? 's' : ''} selected
                      </div>
                    )}
                  </div>
                )}

                {/* Receipt details — shown when at least one line checked */}
                {checkedCount > 0 && (
                  <>
                    <div style={S}>Receipt Details</div>

                    <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                      <label style={L}>Warehouse *</label>
                      <select style={{ ...I, cursor:'pointer' }} value={warehouseId} onChange={e => setWarehouseId(e.target.value)} required>
                        <option value="">— Select warehouse —</option>
                        {warehouses.map(w => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
                      </select>
                    </div>

                    <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                      <label style={L}>Receipt Condition</label>
                      <select style={{ ...I, cursor:'pointer' }} value={condition} onChange={e => setCondition(e.target.value)}>
                        {RECEIPT_CONDITIONS.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
                      </select>
                    </div>

                    {condition !== 'complete' && (
                      <div style={{ background:'rgba(251,191,36,0.06)', border:'0.5px solid rgba(251,191,36,0.2)', borderRadius:8, padding:'8px 12px', fontSize:12, color:'#fbbf24' }}>
                        ⚠️ Non-standard receipt — document details in notes below.
                      </div>
                    )}

                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                      <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                        <label style={L}>Receipt Date</label>
                        <input style={I} type="date" value={txDate} onChange={e => setTxDate(e.target.value)} />
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                        <label style={L}>Lot Number (all lines)</label>
                        <input style={I} placeholder="LOT-2026-001" value={lotNumber} onChange={e => setLotNumber(e.target.value)} />
                      </div>
                    </div>

                    <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                      <label style={L}>Notes / Issues</label>
                      <textarea style={{ ...I, resize:'vertical', minHeight:56 } as React.CSSProperties}
                        placeholder={condition !== 'complete' ? 'Describe the issue in detail…' : 'Optional notes…'}
                        value={notes} onChange={e => setNotes(e.target.value)} />
                    </div>
                  </>
                )}
              </div>

              <div style={{ display:'flex', justifyContent:'flex-end', gap:8, padding:'12px 20px 18px', borderTop:'0.5px solid rgba(255,255,255,0.06)', flexShrink:0 }}>
                <button type="button" onClick={onClose} style={{ background:'rgba(255,255,255,0.05)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:7, padding:'8px 16px', fontSize:13, fontFamily:"'IBM Plex Sans',sans-serif", color:'rgba(255,255,255,0.5)', cursor:'pointer' }}>Cancel</button>
                <button type="submit" disabled={busy || !poDetail || checkedCount === 0 || !warehouseId}
                  style={{ background:'linear-gradient(135deg,#166534,#15803d,#16a34a)', border:'none', borderRadius:7, padding:'8px 20px', fontSize:13, fontWeight:500, fontFamily:"'IBM Plex Sans',sans-serif", color:'white', cursor:'pointer', opacity: (busy || !poDetail || checkedCount === 0 || !warehouseId) ? 0.4 : 1 }}>
                  {busy ? 'Posting…' : '✓ Post Receipt'}
                </button>
              </div>
            </form>
          )}

          {/* ── Manual mode ── */}
          {mode === 'manual' && (
            <form onSubmit={handleSubmitManual}>
              <div style={{ padding:'16px 20px', display:'flex', flexDirection:'column', gap:12 }}>
                {error && <div style={{ background:'rgba(239,68,68,0.1)', border:'0.5px solid rgba(239,68,68,0.25)', borderRadius:7, padding:'8px 12px', fontSize:12, color:'#fca5a5' }}>{error}</div>}

                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                    <label style={L}>Type *</label>
                    <select style={{ ...I, cursor:'pointer' }} value={form.transactionType} onChange={e => setForm(f => ({ ...f, transactionType: e.target.value }))}>
                      {TX_TYPES.map(t => <option key={t.value} value={t.value}>{t.sign} {t.label}</option>)}
                    </select>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                    <label style={L}>Date</label>
                    <input style={I} type="date" value={form.transactionDate} onChange={e => setForm(f => ({ ...f, transactionDate: e.target.value }))} />
                  </div>
                </div>

                <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                  <label style={L}>Item *</label>
                  <select style={{ ...I, cursor:'pointer' }} value={form.itemId}
                    onChange={e => { const it = items.find(i => i.id === e.target.value); setForm(f => ({ ...f, itemId: e.target.value, uom: it?.baseUom ?? f.uom })); }}>
                    <option value="">— Select item —</option>
                    {items.map(i => <option key={i.id} value={i.id}>{i.code} — {i.name}</option>)}
                  </select>
                </div>

                <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                  <label style={L}>Warehouse *</label>
                  <select style={{ ...I, cursor:'pointer' }} value={form.warehouseId} onChange={e => setForm(f => ({ ...f, warehouseId: e.target.value }))}>
                    <option value="">— Select warehouse —</option>
                    {warehouses.map(w => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
                  </select>
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                    <label style={L}>Quantity *</label>
                    <input style={I} type="number" step="0.001" placeholder="100"
                      value={form.quantity || ''} onChange={e => setForm(f => ({ ...f, quantity: e.target.value === '' ? 0 : Number(e.target.value) }))} required />
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                    <label style={L}>UOM *</label>
                    <input style={I} placeholder="PCS" value={form.uom} onChange={e => setForm(f => ({ ...f, uom: e.target.value }))} required />
                  </div>
                </div>

                <div style={S}>Reference (Optional)</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                    <label style={L}>Reference Type</label>
                    <input style={I} placeholder="purchase_order" value={form.referenceType} onChange={e => setForm(f => ({ ...f, referenceType: e.target.value }))} />
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                    <label style={L}>Reference ID</label>
                    <input style={I} placeholder="PO-2026-001" value={form.referenceId} onChange={e => setForm(f => ({ ...f, referenceId: e.target.value }))} />
                  </div>
                </div>

                <div style={S}>Lot / Serial (Optional)</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                  <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                    <label style={L}>Lot Number</label>
                    <input style={I} placeholder="LOT-2026-001" value={form.lotNumber} onChange={e => setForm(f => ({ ...f, lotNumber: e.target.value }))} />
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                    <label style={L}>Serial Number</label>
                    <input style={I} placeholder="SN-123456" value={form.serialNumber} onChange={e => setForm(f => ({ ...f, serialNumber: e.target.value }))} />
                  </div>
                </div>

                <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                  <label style={L}>Notes</label>
                  <textarea style={{ ...I, resize:'vertical', minHeight:56 } as React.CSSProperties}
                    placeholder="Transaction notes…" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
                </div>
              </div>

              <div style={{ display:'flex', justifyContent:'flex-end', gap:8, padding:'12px 20px 18px', borderTop:'0.5px solid rgba(255,255,255,0.06)', flexShrink:0 }}>
                <button type="button" onClick={onClose} style={{ background:'rgba(255,255,255,0.05)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:7, padding:'8px 16px', fontSize:13, fontFamily:"'IBM Plex Sans',sans-serif", color:'rgba(255,255,255,0.5)', cursor:'pointer' }}>Cancel</button>
                <button type="submit" disabled={busy}
                  style={{ background:'linear-gradient(135deg,#c2410c,#ea580c,#f97316)', border:'none', borderRadius:7, padding:'8px 20px', fontSize:13, fontWeight:500, fontFamily:"'IBM Plex Sans',sans-serif", color:'white', cursor:'pointer', boxShadow:'0 3px 12px rgba(234,88,12,0.35)', opacity:busy?0.5:1 }}>
                  {busy ? 'Posting…' : 'Post Transaction'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function StockTransactionsPage() {
  const [rows,            setRows]         = useState<LedgerRow[]>([]);
  const [items,           setItems]        = useState<Item[]>([]);
  const [warehouses,      setWarehouses]   = useState<Warehouse[]>([]);
  const [loading,         setLoading]      = useState(true);
  const [error,           setError]        = useState('');
  const [search,          setSearch]       = useState('');
  const [typeFilter,      setTypeFilter]   = useState('');
  const [warehouseFilter, setWHFilter]     = useState('');
  const [itemTypeFilter,  setITFilter]     = useState('');
  const [modalOpen,       setModalOpen]    = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [ledger, its, whs] = await Promise.all([
        apiClient.get('/stock-transactions/ledger'),
        itemsApi.getAll(),
        warehousesApi.getAll(),
      ]);
      const data = ledger.data as { rows: LedgerRow[]; totals: any; count: number };
      setRows(data.rows ?? []);
      setItems(its as Item[]);
      setWarehouses(whs as Warehouse[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filtered = rows.filter(row => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      (row.item?.code ?? '').toLowerCase().includes(q) ||
      (row.item?.name ?? '').toLowerCase().includes(q) ||
      (row.warehouse?.name ?? '').toLowerCase().includes(q) ||
      (row.referenceNumber ?? '').toLowerCase().includes(q) ||
      row.movementNumber.toLowerCase().includes(q);
    return matchSearch &&
      (!typeFilter      || row.movementType === typeFilter) &&
      (!warehouseFilter || row.warehouse?.id === warehouseFilter) &&
      (!itemTypeFilter  || row.item?.itemType === itemTypeFilter);
  });

  const filteredTotals = {
    totalIn:       filtered.filter(r => r.signedQuantity > 0).reduce((s, r) => s + r.quantity, 0),
    totalOut:      filtered.filter(r => r.signedQuantity < 0).reduce((s, r) => s + r.quantity, 0),
    totalInValue:  filtered.filter(r => r.signedQuantity > 0).reduce((s, r) => s + r.totalValue, 0),
    totalOutValue: filtered.filter(r => r.signedQuantity < 0).reduce((s, r) => s + Math.abs(r.totalValue), 0),
    netValue:      filtered.reduce((s, r) => s + r.totalValue, 0),
  };

  const typeCounts = TX_TYPES.reduce((acc, t) => {
    acc[t.value] = rows.filter(r => r.movementType === t.value).length;
    return acc;
  }, {} as Record<string, number>);

  const hasFilters = !!(search || typeFilter || warehouseFilter || itemTypeFilter);
  const SEL: React.CSSProperties = { background:'rgba(255,255,255,0.04)', border:'0.5px solid rgba(255,255,255,0.09)', borderRadius:7, padding:'7px 10px', fontSize:12, fontFamily:"'IBM Plex Sans',sans-serif", color:'#e2dfd8', outline:'none', cursor:'pointer' };

  return (
    <ERPShell breadcrumbs={['Home', 'Inventory', 'Stock Transactions']} title="Stock Transactions">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap');
        .st-page{padding:0 18px 12px;display:flex;flex-direction:column;height:100%;overflow:hidden}
        .st-pills{display:flex;gap:6px;margin-bottom:10px;flex-wrap:wrap;flex-shrink:0}
        .st-pill{background:rgba(10,7,18,0.7);border-radius:8px;padding:6px 12px;display:flex;flex-direction:column;gap:1px;cursor:pointer;transition:all 0.15s;min-width:76px;flex-shrink:0}
        .st-pill-label{font-size:9px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase}
        .st-pill-value{font-size:20px;font-weight:500;font-family:'IBM Plex Mono',monospace;color:#f1ede8}
        .st-totals{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-bottom:10px;flex-shrink:0}
        .st-total{background:rgba(10,7,18,0.7);border-radius:8px;padding:8px 12px}
        .st-total-label{font-size:9px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;color:rgba(255,255,255,0.3);margin-bottom:3px}
        .st-total-value{font-size:13px;font-weight:500;font-family:'IBM Plex Mono',monospace}
        .st-toolbar{display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;flex-shrink:0}
        .st-search{background:rgba(255,255,255,0.04);border:0.5px solid rgba(255,255,255,0.09);border-radius:7px;padding:7px 12px;font-size:12px;font-family:'IBM Plex Sans',sans-serif;color:#e2dfd8;outline:none;width:240px}
        .st-search::placeholder{color:rgba(255,255,255,0.2)}
        .st-search:focus{border-color:rgba(251,146,60,0.4);box-shadow:0 0 0 2px rgba(234,88,12,0.08)}
        .st-btn-new{display:flex;align-items:center;gap:6px;margin-left:auto;background:linear-gradient(135deg,#c2410c,#ea580c,#f97316);border:none;border-radius:7px;padding:7px 14px;font-size:12px;font-weight:500;font-family:'IBM Plex Sans',sans-serif;color:white;cursor:pointer;box-shadow:0 3px 12px rgba(234,88,12,0.3);flex-shrink:0}
        .st-btn-new svg{width:13px;height:13px;display:block;flex-shrink:0}
        .st-btn-reset{background:rgba(255,255,255,0.04);border:0.5px solid rgba(255,255,255,0.09);border-radius:7px;padding:7px 10px;font-size:11px;font-family:'IBM Plex Sans',sans-serif;color:rgba(255,255,255,0.4);cursor:pointer}
        .st-wrap{background:rgba(10,7,18,0.7);border:0.5px solid rgba(251,146,60,0.12);border-radius:10px;overflow:hidden;flex:1;min-height:0;display:flex;flex-direction:column}
        .st-scroll{flex:1;overflow-y:auto;min-height:0}
        .st-table{width:100%;border-collapse:collapse}
        .st-table thead th{padding:8px 12px;font-size:9px;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;color:rgba(251,146,60,0.55);background:rgba(251,146,60,0.05);border-bottom:0.5px solid rgba(255,255,255,0.06);text-align:left;white-space:nowrap;position:sticky;top:0}
        .st-table thead th.r{text-align:right}
        .st-table tbody td{padding:9px 12px;border-bottom:0.5px solid rgba(255,255,255,0.03);vertical-align:middle}
        .st-table tbody tr:last-child td{border-bottom:none}
        .st-table tbody tr:hover td{background:rgba(251,146,60,0.02)}
        .st-empty,.st-loading{text-align:center;padding:52px 24px;color:rgba(255,255,255,0.25);font-size:13px;display:flex;flex-direction:column;align-items:center;gap:10px}
        .st-spinner{width:18px;height:18px;border-radius:50%;border:2px solid rgba(251,146,60,0.2);border-top-color:#fb923c;animation:st-spin 0.7s linear infinite}
        @keyframes st-spin{to{transform:rotate(360deg)}}
        .st-footer{font-size:11px;color:rgba(255,255,255,0.22);padding:8px 12px;border-top:0.5px solid rgba(255,255,255,0.04);display:flex;justify-content:space-between;align-items:center;flex-shrink:0}
        .st-error{background:rgba(239,68,68,0.08);border:0.5px solid rgba(239,68,68,0.2);border-radius:8px;padding:10px 14px;margin-bottom:10px;font-size:13px;color:#fca5a5;flex-shrink:0}
      `}</style>

      <div className="st-page">

        {/* Type pills */}
        {rows.length > 0 && (
          <div className="st-pills">
            {TX_TYPES.filter(t => typeCounts[t.value] > 0).map(t => (
              <div key={t.value} className="st-pill"
                style={{ border:`0.5px solid ${typeFilter===t.value ? t.border : 'rgba(255,255,255,0.07)'}`, background: typeFilter===t.value ? t.bg : 'rgba(10,7,18,0.7)' }}
                onClick={() => setTypeFilter(prev => prev===t.value ? '' : t.value)}
              >
                <span className="st-pill-label" style={{ color: t.color }}>{t.sign} {t.label}</span>
                <span className="st-pill-value">{typeCounts[t.value]}</span>
              </div>
            ))}
            <div className="st-pill" style={{ border:`0.5px solid ${!typeFilter ? 'rgba(251,146,60,0.3)' : 'rgba(255,255,255,0.07)'}` }} onClick={() => setTypeFilter('')}>
              <span className="st-pill-label" style={{ color:'rgba(251,146,60,0.6)' }}>All</span>
              <span className="st-pill-value" style={{ color:'#fb923c' }}>{rows.length}</span>
            </div>
          </div>
        )}

        {/* Totals bar */}
        {rows.length > 0 && (
          <div className="st-totals">
            {[
              { label: 'Total IN (qty)',  value: `+${new Intl.NumberFormat('en-US',{maximumFractionDigits:3}).format(filteredTotals.totalIn)}`,  color: '#4ade80' },
              { label: 'Total OUT (qty)', value: `−${new Intl.NumberFormat('en-US',{maximumFractionDigits:3}).format(filteredTotals.totalOut)}`, color: '#f87171' },
              { label: 'IN Value',        value: fmtAmt(filteredTotals.totalInValue),  color: '#4ade80' },
              { label: 'OUT Value',       value: fmtAmt(filteredTotals.totalOutValue), color: '#f87171' },
              { label: 'Net Value',       value: fmtAmt(filteredTotals.netValue), color: filteredTotals.netValue >= 0 ? '#4ade80' : '#f87171' },
            ].map(t => (
              <div key={t.label} className="st-total" style={{ border:`0.5px solid ${t.color}18` }}>
                <div className="st-total-label">{t.label}</div>
                <div className="st-total-value" style={{ color: t.color }}>{t.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Toolbar */}
        <div className="st-toolbar">
          <input className="st-search" placeholder="Search item, warehouse, reference #…" value={search} onChange={e => setSearch(e.target.value)} />
          <select style={SEL} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="">All Types</option>
            {TX_TYPES.map(t => <option key={t.value} value={t.value}>{t.sign} {t.label}</option>)}
          </select>
          <select style={SEL} value={warehouseFilter} onChange={e => setWHFilter(e.target.value)}>
            <option value="">All Warehouses</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
          </select>
          <select style={SEL} value={itemTypeFilter} onChange={e => setITFilter(e.target.value)}>
            <option value="">All Categories</option>
            {['finished_good','raw_material','consumable','service'].map(t => (
              <option key={t} value={t}>{t.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</option>
            ))}
          </select>
          {hasFilters && (
            <button className="st-btn-reset" onClick={() => { setSearch(''); setTypeFilter(''); setWHFilter(''); setITFilter(''); }}>↺ Clear</button>
          )}
          <button className="st-btn-new" onClick={() => setModalOpen(true)}>
            <svg viewBox="0 0 13 13" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
              <line x1="6.5" y1="1" x2="6.5" y2="12"/><line x1="1" y1="6.5" x2="12" y2="6.5"/>
            </svg>
            New Transaction
          </button>
        </div>

        {error && <div className="st-error">{error}</div>}

        {/* Table — full remaining height */}
        <div className="st-wrap">
          {loading ? (
            <div className="st-loading"><div className="st-spinner" />Loading transactions…</div>
          ) : filtered.length === 0 ? (
            <div className="st-empty">{hasFilters ? 'No transactions match your filters.' : 'No stock transactions yet.'}</div>
          ) : (
            <>
              <div className="st-scroll">
                <table className="st-table">
                  <thead>
                    <tr>
                      <th>Movement #</th><th>Type</th><th>Item</th><th>Category</th>
                      <th>Warehouse</th><th className="r">Quantity</th><th>UOM</th>
                      <th className="r">Unit Cost</th><th className="r">Total Value</th>
                      <th>Reference</th><th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(row => {
                      const isIn  = row.signedQuantity > 0;
                      const isOut = row.signedQuantity < 0;
                      const itColor = ITEM_TYPE_COLOR[row.item?.itemType ?? ''] ?? 'rgba(255,255,255,0.35)';
                      return (
                        <tr key={row.id}>
                          <td><span style={{ ...MONO, fontSize:11, color:'#fb923c' }}>{row.movementNumber}</span></td>
                          <td><TxBadge type={row.movementType} /></td>
                          <td>
                            <span style={{ ...MONO, fontSize:11, color:'#f1ede8', fontWeight:500 }}>{row.item?.code ?? '—'}</span>
                            <div style={{ fontSize:10, color:'rgba(255,255,255,0.35)', marginTop:1 }}>{row.item?.name}</div>
                          </td>
                          <td>{row.item?.itemType && <span style={{ fontSize:9, padding:'1px 6px', borderRadius:10, color:itColor, background:`${itColor}15`, border:`0.5px solid ${itColor}30`, whiteSpace:'nowrap' }}>{row.item.itemType.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</span>}</td>
                          <td>
                            <span style={{ fontSize:11, color:'rgba(255,255,255,0.4)' }}>{row.warehouse?.code ?? '—'}</span>
                            <div style={{ fontSize:10, color:'rgba(255,255,255,0.25)', marginTop:1 }}>{row.warehouse?.name}</div>
                          </td>
                          <td style={{ textAlign:'right' }}>
                            <span style={{ ...MONO, fontSize:13, fontWeight:600, color: isIn ? '#4ade80' : isOut ? '#f87171' : '#fbbf24' }}>
                              {isIn ? '+' : isOut ? '−' : '±'}{fmtQty(row.signedQuantity)}
                            </span>
                          </td>
                          <td><span style={{ fontSize:10, color:'rgba(255,255,255,0.35)' }}>{row.uom}</span></td>
                          <td style={{ textAlign:'right' }}><span style={{ ...MONO, fontSize:11, color:'rgba(255,255,255,0.45)' }}>{row.unitCost > 0 ? fmtAmt(row.unitCost) : '—'}</span></td>
                          <td style={{ textAlign:'right' }}>
                            <span style={{ ...MONO, fontSize:12, fontWeight:500, color: isIn ? '#4ade80' : isOut ? '#f87171' : '#fbbf24' }}>
                              {row.totalValue !== 0 ? (isIn ? '+' : '−') + fmtAmt(Math.abs(row.totalValue)) : '—'}
                            </span>
                          </td>
                          <td>
                            {row.referenceType && <div style={{ fontSize:9, color:'rgba(255,255,255,0.25)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:1 }}>{row.referenceType.replace(/_/g,' ')}</div>}
                            <span style={{ ...MONO, fontSize:11, color: row.referenceNumber !== '—' ? '#fb923c' : 'rgba(255,255,255,0.2)' }}>{row.referenceNumber}</span>
                          </td>
                          <td><span style={{ fontSize:11, color:'rgba(255,255,255,0.4)' }}>{fmtDate(row.movementDate)}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="st-footer">
                <span>{filtered.length} of {rows.length} transaction{rows.length !== 1 ? 's' : ''}</span>
                {hasFilters && <span style={{ fontSize:10, color:'rgba(251,146,60,0.4)' }}>Filtered · IN {fmtAmt(filteredTotals.totalInValue)} / OUT {fmtAmt(filteredTotals.totalOutValue)}</span>}
              </div>
            </>
          )}
        </div>
      </div>

      <CreateTxModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={fetchAll} items={items} warehouses={warehouses} />
    </ERPShell>
  );
}