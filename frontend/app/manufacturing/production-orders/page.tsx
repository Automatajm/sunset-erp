"use client";

import { useEffect, useState, useCallback } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import { productionOrdersApi } from '@/lib/api/production-orders';
import { bomApi } from '@/lib/api/bom';
import { ProductionOrderStatus, ProductionPriority } from '@/lib/api/types';

interface Bom { id: string; bomNumber: string; parentItem?: { name: string } }
interface ProductionOrder {
  id: string; poNumber: string; itemId: string; bomId: string;
  quantityToProduce: number; quantityProduced: number;
  plannedStartDate?: string; plannedEndDate?: string;
  actualStartDate?: string; actualEndDate?: string;
  status: ProductionOrderStatus; priority?: ProductionPriority; notes?: string;
}

function extractList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  const d = data as Record<string, unknown>;
  if (d?.value && Array.isArray(d.value)) return d.value as T[];
  return [];
}

function fmtDate(d?: string | null) { if (!d) return '—'; return new Date(d).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }); }

const PO_STATUS: Record<ProductionOrderStatus, { color: string; bg: string; border: string }> = {
  draft:       { color:'#fbbf24', bg:'rgba(251,191,36,0.1)',  border:'rgba(251,191,36,0.2)' },
  released:    { color:'#60a5fa', bg:'rgba(96,165,250,0.1)',  border:'rgba(96,165,250,0.2)' },
  in_progress: { color:'#a78bfa', bg:'rgba(167,139,250,0.1)', border:'rgba(167,139,250,0.2)' },
  completed:   { color:'#4ade80', bg:'rgba(74,222,128,0.1)',  border:'rgba(74,222,128,0.2)' },
  cancelled:   { color:'#f87171', bg:'rgba(248,113,113,0.1)', border:'rgba(248,113,113,0.2)' },
};
const PRIORITY_COLOR: Record<string, string> = { low:'rgba(255,255,255,0.3)', medium:'#fbbf24', high:'#fb923c', urgent:'#f87171' };
const STATUS_FLOW: Record<ProductionOrderStatus, string | null> = { draft:'released', released:'in_progress', in_progress:'completed', completed:null, cancelled:null };

const INPUT: React.CSSProperties = { background:'rgba(255,255,255,0.04)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:7, padding:'9px 12px', fontSize:13, fontFamily:"'IBM Plex Sans',sans-serif", color:'#f1ede8', outline:'none', width:'100%' };
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ display:'flex', flexDirection:'column', gap:5 }}><label style={{ fontSize:11, fontWeight:500, letterSpacing:'0.08em', textTransform:'uppercase' as const, color:'rgba(251,146,60,0.6)', fontFamily:"'IBM Plex Sans',sans-serif" }}>{label}</label>{children}</div>;
}

function MOModal({ boms, onClose, onSaved }: { boms: Bom[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ bomId:'', quantityToProduce:'', plannedStartDate:'', plannedEndDate:'', priority:'' as ProductionPriority | '', notes:'' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.bomId || !form.quantityToProduce) { setError('BOM and quantity required.'); return; }
    setBusy(true); setError('');
    try {
      await productionOrdersApi.create({ bomId:form.bomId, quantityToProduce:Number(form.quantityToProduce), plannedStartDate:form.plannedStartDate||undefined, plannedEndDate:form.plannedEndDate||undefined, priority:form.priority||undefined, notes:form.notes||undefined });
      onSaved(); onClose();
    } catch (err) { setError((err as {response?:{data?:{message?:string}}}).response?.data?.message || 'Failed.'); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ position:'fixed', inset:0, zIndex:400, background:'rgba(0,0,0,0.65)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ background:'#0e0b1a', border:'0.5px solid rgba(251,146,60,0.2)', borderRadius:14, width:'100%', maxWidth:520, position:'relative', boxShadow:'0 24px 60px rgba(0,0,0,0.7)' }}>
        <div style={{ position:'absolute', top:0, left:30, right:30, height:1, background:'linear-gradient(90deg,transparent,rgba(251,146,60,0.4),transparent)' }} />
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px 12px', borderBottom:'0.5px solid rgba(255,255,255,0.06)' }}>
          <span style={{ fontSize:14, fontWeight:500, color:'#f1ede8', fontFamily:"'IBM Plex Sans',sans-serif" }}>New Production Order</span>
          <button onClick={onClose} style={{ width:24, height:24, borderRadius:6, background:'rgba(255,255,255,0.06)', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.45)', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ padding:'16px 20px', display:'flex', flexDirection:'column', gap:12 }}>
            {error && <div style={{ background:'rgba(239,68,68,0.1)', border:'0.5px solid rgba(239,68,68,0.25)', borderRadius:7, padding:'8px 12px', fontSize:12, color:'#fca5a5' }}>{error}</div>}
            <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:10 }}>
              <Field label="BOM *"><select style={INPUT} value={form.bomId} onChange={set('bomId')}><option value="">— Select BOM —</option>{boms.map(b => <option key={b.id} value={b.id}>{b.bomNumber} — {b.parentItem?.name}</option>)}</select></Field>
              <Field label="Qty To Produce *"><input style={INPUT} type="number" min="1" placeholder="100" value={form.quantityToProduce} onChange={set('quantityToProduce')} required /></Field>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
              <Field label="Planned Start"><input style={INPUT} type="date" value={form.plannedStartDate} onChange={set('plannedStartDate')} /></Field>
              <Field label="Planned End"><input style={INPUT} type="date" value={form.plannedEndDate} onChange={set('plannedEndDate')} /></Field>
              <Field label="Priority"><select style={INPUT} value={form.priority} onChange={set('priority')}><option value="">— None —</option>{['low','medium','high','urgent'].map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase()+p.slice(1)}</option>)}</select></Field>
            </div>
            <Field label="Notes"><input style={INPUT} placeholder="Optional notes" value={form.notes} onChange={set('notes')} /></Field>
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8, padding:'12px 20px 18px', borderTop:'0.5px solid rgba(255,255,255,0.06)' }}>
            <button type="button" onClick={onClose} style={{ background:'rgba(255,255,255,0.05)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:7, padding:'8px 16px', fontSize:13, fontFamily:"'IBM Plex Sans',sans-serif", color:'rgba(255,255,255,0.5)', cursor:'pointer' }}>Cancel</button>
            <button type="submit" disabled={busy} style={{ background:'linear-gradient(135deg,#c2410c,#ea580c,#f97316)', border:'none', borderRadius:7, padding:'8px 20px', fontSize:13, fontWeight:500, fontFamily:"'IBM Plex Sans',sans-serif", color:'white', cursor:'pointer', boxShadow:'0 3px 12px rgba(234,88,12,0.35)', opacity:busy?0.5:1 }}>{busy?'Creating…':'Create'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function ProductionOrdersPage() {
  const [list, setList] = useState<ProductionOrder[]>([]);
  const [boms, setBoms] = useState<Bom[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProductionOrderStatus | ''>('');
  const [modalOpen, setModalOpen] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    try { setLoading(true); setList(extractList<ProductionOrder>(await productionOrdersApi.getAll())); }
    catch (err) { setError(err instanceof Error ? err.message : 'Load failed.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchOrders();
    bomApi.getAll().then(raw => setBoms(extractList<Bom>(raw as unknown))).catch(() => {});
  }, [fetchOrders]);

  const filtered = list.filter(o => !statusFilter || o.status === statusFilter);

  const handleStatusChange = async (id: string, status: string) => {
    setActionBusy(id);
    try { await productionOrdersApi.updateStatus(id, status as ProductionOrderStatus); fetchOrders(); }
    catch (err) { setError((err as {response?:{data?:{message?:string}}}).response?.data?.message || 'Status update failed.'); }
    finally { setActionBusy(null); }
  };

  const counts = Object.keys(PO_STATUS).reduce((acc, s) => ({ ...acc, [s]: list.filter(o => o.status === s).length }), {} as Record<string, number>);
  const MONO = { fontFamily:"'IBM Plex Mono',monospace", fontSize:12 } as React.CSSProperties;

  return (
    <ERPShell breadcrumbs={['Home', 'Manufacturing', 'Production Orders']} title="Production Orders">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap');
        .mo-page { padding: 0 18px 24px; }
        .mo-stats { display:flex; gap:10px; margin-bottom:14px; flex-wrap:wrap; }
        .mo-stat { background:rgba(10,7,18,0.7); border-radius:8px; padding:7px 12px; display:flex; flex-direction:column; gap:2px; min-width:80px; cursor:pointer; transition:opacity 0.15s; }
        .mo-stat:hover { opacity:0.8; }
        .mo-stat-label { font-size:10px; font-weight:500; letter-spacing:0.08em; text-transform:uppercase; }
        .mo-stat-value { font-size:20px; font-weight:500; font-family:'IBM Plex Mono',monospace; color:#f1ede8; }
        .mo-toolbar { display:flex; align-items:center; gap:10px; margin-bottom:14px; flex-wrap:wrap; }
        .mo-filter { background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.09); border-radius:7px; padding:7px 12px; font-size:12px; font-family:'IBM Plex Sans',sans-serif; color:#e2dfd8; outline:none; }
        .mo-filter option { background:#0e0b1a; color:#f1ede8; }
        .mo-btn-new { display:flex; align-items:center; gap:6px; margin-left:auto; background:linear-gradient(135deg,#c2410c,#ea580c,#f97316); border:none; border-radius:7px; padding:7px 14px; font-size:12px; font-weight:500; font-family:'IBM Plex Sans',sans-serif; color:white; cursor:pointer; box-shadow:0 3px 12px rgba(234,88,12,0.3); flex-shrink:0; }
        .mo-btn-new svg { width:13px; height:13px; display:block; flex-shrink:0; }
        .mo-wrap { background:rgba(10,7,18,0.7); border:0.5px solid rgba(251,146,60,0.12); border-radius:10px; overflow:hidden; }
        .mo-table { width:100%; border-collapse:collapse; }
        .mo-table thead th { padding:9px 14px; font-size:10px; font-weight:500; letter-spacing:0.1em; text-transform:uppercase; color:rgba(251,146,60,0.55); background:rgba(251,146,60,0.05); border-bottom:0.5px solid rgba(255,255,255,0.06); text-align:left; white-space:nowrap; }
        .mo-table tbody td { padding:10px 14px; border-bottom:0.5px solid rgba(255,255,255,0.04); vertical-align:middle; font-size:13px; }
        .mo-table tbody tr:last-child td { border-bottom:none; }
        .mo-table tbody tr:hover td { background:rgba(251,146,60,0.03); }
        .mo-empty, .mo-loading { text-align:center; padding:52px 24px; color:rgba(255,255,255,0.25); font-size:13px; }
        .mo-footer { font-size:11px; color:rgba(255,255,255,0.22); padding:8px 14px; border-top:0.5px solid rgba(255,255,255,0.04); }
        .mo-error { background:rgba(239,68,68,0.08); border:0.5px solid rgba(239,68,68,0.2); border-radius:8px; padding:10px 14px; margin-bottom:14px; font-size:13px; color:#fca5a5; }
      `}</style>
      <div className="mo-page">
        {list.length > 0 && (
          <div className="mo-stats">
            {(Object.entries(PO_STATUS) as [ProductionOrderStatus, typeof PO_STATUS[ProductionOrderStatus]][]).map(([s, style]) => (
              <div key={s} className="mo-stat" style={{ border:`0.5px solid ${statusFilter===s ? style.border : 'rgba(255,255,255,0.07)'}` }} onClick={() => setStatusFilter(prev => prev===s ? '' : s)}>
                <span className="mo-stat-label" style={{ color:style.color }}>{s.replace('_',' ').replace(/\b\w/g,c=>c.toUpperCase())}</span>
                <span className="mo-stat-value">{counts[s] ?? 0}</span>
              </div>
            ))}
            <div className="mo-stat" style={{ border:`0.5px solid ${!statusFilter ? 'rgba(251,146,60,0.3)' : 'rgba(255,255,255,0.07)'}` }} onClick={() => setStatusFilter('')}>
              <span className="mo-stat-label" style={{ color:'rgba(251,146,60,0.6)' }}>Total</span>
              <span className="mo-stat-value" style={{ color:'#fb923c' }}>{list.length}</span>
            </div>
          </div>
        )}
        <div className="mo-toolbar">
          <select className="mo-filter" value={statusFilter} onChange={e => setStatusFilter(e.target.value as ProductionOrderStatus | '')}>
            <option value="">All Status</option>
            {(Object.keys(PO_STATUS) as ProductionOrderStatus[]).map(s => <option key={s} value={s}>{s.replace('_',' ').replace(/\b\w/g,c=>c.toUpperCase())}</option>)}
          </select>
          <button className="mo-btn-new" onClick={() => setModalOpen(true)}>
            <svg viewBox="0 0 13 13" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><line x1="6.5" y1="1" x2="6.5" y2="12"/><line x1="1" y1="6.5" x2="12" y2="6.5"/></svg>
            New Production Order
          </button>
        </div>
        {error && <div className="mo-error">{error}</div>}
        <div className="mo-wrap">
          {loading ? <div className="mo-loading">Loading…</div>
          : filtered.length === 0 ? <div className="mo-empty">{statusFilter ? 'No orders match.' : 'No production orders yet.'}</div>
          : (<>
            <table className="mo-table">
              <thead><tr>{['MO Number','BOM','Qty To Produce','Progress','Planned Start','Planned End','Priority','Status',''].map(h => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {filtered.map(mo => {
                  const s = PO_STATUS[mo.status];
                  const nextStatus = STATUS_FLOW[mo.status];
                  const busy = actionBusy === mo.id;
                  const pct = mo.quantityToProduce > 0 ? Math.round((mo.quantityProduced / mo.quantityToProduce) * 100) : 0;
                  return (
                    <tr key={mo.id}>
                      <td><span style={{ ...MONO, color:'#fb923c', fontWeight:500 }}>{mo.poNumber}</span></td>
                      <td><span style={{ fontSize:12, color:'rgba(255,255,255,0.55)' }}>{boms.find(b => b.id === mo.bomId)?.bomNumber ?? '—'}</span></td>
                      <td style={{ textAlign:'right' }}><span style={MONO}>{mo.quantityToProduce}</span></td>
                      <td>
                        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                          <span style={{ ...MONO, color: pct >= 100 ? '#4ade80' : '#e2dfd8', fontSize:11 }}>{mo.quantityProduced}/{mo.quantityToProduce}</span>
                          <div style={{ width:52, height:4, borderRadius:2, background:'rgba(255,255,255,0.1)', flexShrink:0 }}>
                            <div style={{ width:`${Math.min(pct,100)}%`, height:'100%', borderRadius:2, background: pct >= 100 ? '#4ade80' : '#fb923c' }} />
                          </div>
                          <span style={{ fontSize:10, color:'rgba(255,255,255,0.3)' }}>{pct}%</span>
                        </div>
                      </td>
                      <td><span style={{ fontSize:12, color:'rgba(255,255,255,0.45)' }}>{fmtDate(mo.plannedStartDate)}</span></td>
                      <td><span style={{ fontSize:12, color:'rgba(255,255,255,0.45)' }}>{fmtDate(mo.plannedEndDate)}</span></td>
                      <td>{mo.priority && <span style={{ fontSize:11, color: PRIORITY_COLOR[mo.priority] }}>{mo.priority.charAt(0).toUpperCase()+mo.priority.slice(1)}</span>}</td>
                      <td><span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'2px 9px', borderRadius:20, fontSize:11, fontWeight:500, color:s.color, background:s.bg, border:`0.5px solid ${s.border}`, whiteSpace:'nowrap' }}><span style={{ width:5, height:5, borderRadius:'50%', background:s.color, flexShrink:0 }} />{mo.status.replace('_',' ').replace(/\b\w/g,c=>c.toUpperCase())}</span></td>
                      <td>
                        <div style={{ display:'flex', gap:5 }}>
                          {nextStatus && <button onClick={() => handleStatusChange(mo.id, nextStatus)} disabled={busy} style={{ padding:'4px 9px', borderRadius:6, fontSize:11, cursor:'pointer', background:'rgba(251,146,60,0.1)', color:'#fb923c', border:'0.5px solid rgba(251,146,60,0.2)', fontFamily:"'IBM Plex Sans',sans-serif", opacity:busy?0.5:1 }}>{busy?'…':nextStatus.replace('_',' ').replace(/\b\w/g,c=>c.toUpperCase())}</button>}
                          {mo.status !== 'completed' && mo.status !== 'cancelled' && <button onClick={() => handleStatusChange(mo.id, 'cancelled')} disabled={busy} style={{ padding:'4px 9px', borderRadius:6, fontSize:11, cursor:'pointer', background:'rgba(248,113,113,0.08)', color:'#f87171', border:'0.5px solid rgba(248,113,113,0.2)', fontFamily:"'IBM Plex Sans',sans-serif", opacity:busy?0.5:1 }}>Cancel</button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="mo-footer">{filtered.length} of {list.length} order{list.length !== 1 ? 's' : ''}</div>
          </>)}
        </div>
      </div>
      {modalOpen && <MOModal boms={boms} onClose={() => setModalOpen(false)} onSaved={fetchOrders} />}
    </ERPShell>
  );
}