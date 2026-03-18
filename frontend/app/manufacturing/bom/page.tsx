"use client";
import React from 'react';

import { useEffect, useState, useCallback } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import { bomApi } from '@/lib/api/bom';
import { itemsApi } from '@/lib/api/items';
import { Item } from '@/lib/api/types';

interface BomComponent {
  id: string; lineNumber: number; componentItemId: string;
  componentItem?: { id: string; code: string; name: string; baseUom: string };
  quantityPer: number; uom: string; scrapPercent?: number; isPhantom?: boolean;
}

interface Bom {
  id: string; bomNumber: string; parentItemId: string;
  parentItem?: { id: string; code: string; name: string; baseUom: string };
  version?: number; isActive: boolean;
  components?: BomComponent[]; _count?: { components: number };
  createdAt: string;
}

function extractList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  const d = data as Record<string, unknown>;
  if (d?.value && Array.isArray(d.value)) return d.value as T[];
  return [];
}

const INPUT: React.CSSProperties = { background:'rgba(255,255,255,0.04)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:7, padding:'9px 12px', fontSize:13, fontFamily:"'IBM Plex Sans',sans-serif", color:'#f1ede8', outline:'none', width:'100%' };
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ display:'flex', flexDirection:'column', gap:5 }}><label style={{ fontSize:11, fontWeight:500, letterSpacing:'0.08em', textTransform:'uppercase' as const, color:'rgba(251,146,60,0.6)', fontFamily:"'IBM Plex Sans',sans-serif" }}>{label}</label>{children}</div>;
}

function BOMModal({ items, onClose, onSaved }: { items: Item[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ parentItemId: '', bomNumber: '', version: '1' });
  const [components, setComponents] = useState([{ componentItemId: '', quantityPer: '', uom: '', scrapPercent: '0' }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const setComp = (idx: number, k: string, v: string) =>
    setComponents(cs => cs.map((c, i) => {
      if (i !== idx) return c;
      const updated = { ...c, [k]: v };
      if (k === 'componentItemId') { const it = items.find(x => x.id === v); if (it) updated.uom = it.baseUom; }
      return updated;
    }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.parentItemId) { setError('Parent item required.'); return; }
    const validComps = components.filter(c => c.componentItemId && c.quantityPer);
    if (validComps.length === 0) { setError('At least one component required.'); return; }
    setBusy(true); setError('');
    try {
      await bomApi.create({ parentItemId: form.parentItemId, bomNumber: form.bomNumber || undefined, version: Number(form.version) || 1, isActive: true, components: validComps.map(c => ({ componentItemId: c.componentItemId, quantityPer: Number(c.quantityPer), uom: c.uom, scrapPercent: Number(c.scrapPercent) || undefined })) });
      onSaved(); onClose();
    } catch (err) { setError((err as {response?:{data?:{message?:string}}}).response?.data?.message || 'Failed.'); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ position:'fixed', inset:0, zIndex:400, background:'rgba(0,0,0,0.7)', backdropFilter:'blur(4px)', display:'flex', alignItems:'flex-start', justifyContent:'center', padding:20, overflowY:'auto' }}>
      <div style={{ background:'#0e0b1a', border:'0.5px solid rgba(251,146,60,0.2)', borderRadius:14, width:'100%', maxWidth:720, margin:'auto', position:'relative', boxShadow:'0 24px 60px rgba(0,0,0,0.7)' }}>
        <div style={{ position:'absolute', top:0, left:30, right:30, height:1, background:'linear-gradient(90deg,transparent,rgba(251,146,60,0.4),transparent)' }} />
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px 12px', borderBottom:'0.5px solid rgba(255,255,255,0.06)', position:'sticky', top:0, background:'#0e0b1a', zIndex:1, borderRadius:'14px 14px 0 0' }}>
          <span style={{ fontSize:14, fontWeight:500, color:'#f1ede8', fontFamily:"'IBM Plex Sans',sans-serif" }}>New Bill of Materials</span>
          <button onClick={onClose} style={{ width:24, height:24, borderRadius:6, background:'rgba(255,255,255,0.06)', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.45)', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ padding:'16px 20px', display:'flex', flexDirection:'column', gap:12 }}>
            {error && <div style={{ background:'rgba(239,68,68,0.1)', border:'0.5px solid rgba(239,68,68,0.25)', borderRadius:7, padding:'8px 12px', fontSize:12, color:'#fca5a5' }}>{error}</div>}
            <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr', gap:10 }}>
              <Field label="Parent Item *">
                <select style={INPUT} value={form.parentItemId} onChange={e => setForm(f => ({ ...f, parentItemId: e.target.value }))}>
                  <option value="">— Select item —</option>
                  {items.filter(i => i.isManufacturable).map(i => <option key={i.id} value={i.id}>{i.code} — {i.name}</option>)}
                </select>
              </Field>
              <Field label="BOM Number"><input style={INPUT} placeholder="BOM-001" value={form.bomNumber} onChange={e => setForm(f => ({ ...f, bomNumber: e.target.value }))} /></Field>
              <Field label="Version"><input style={INPUT} type="number" min="1" value={form.version} onChange={e => setForm(f => ({ ...f, version: e.target.value }))} /></Field>
            </div>
            <div style={{ fontSize:10, fontWeight:500, letterSpacing:'0.12em', textTransform:'uppercase', color:'rgba(255,255,255,0.25)', padding:'4px 0 2px', borderBottom:'0.5px solid rgba(255,255,255,0.06)', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span>Components</span>
              <button type="button" onClick={() => setComponents(cs => [...cs, { componentItemId:'', quantityPer:'', uom:'', scrapPercent:'0' }])} style={{ background:'rgba(255,255,255,0.04)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:5, padding:'3px 10px', fontSize:11, color:'rgba(255,255,255,0.5)', cursor:'pointer', fontFamily:"'IBM Plex Sans',sans-serif" }}>+ Add</button>
            </div>
            <table style={{ width:'100%', borderCollapse:'collapse' }}>
              <thead><tr>{['Component Item *','Qty Per *','UOM','Scrap %',''].map(h => <th key={h} style={{ fontSize:10, color:'rgba(251,146,60,0.5)', textTransform:'uppercase', letterSpacing:'0.08em', padding:'4px 6px', textAlign:'left', borderBottom:'0.5px solid rgba(255,255,255,0.06)' }}>{h}</th>)}</tr></thead>
              <tbody>
                {components.map((c, idx) => (
                  <tr key={idx}>
                    <td style={{ padding:'4px 3px' }}>
                      <select style={{ ...INPUT, fontSize:12, padding:'6px 8px' }} value={c.componentItemId} onChange={e => setComp(idx, 'componentItemId', e.target.value)}>
                        <option value="">— Item —</option>
                        {items.map(i => <option key={i.id} value={i.id}>{i.code} — {i.name}</option>)}
                      </select>
                    </td>
                    <td style={{ padding:'4px 3px', width:80 }}><input style={{ ...INPUT, fontSize:12, padding:'6px 8px', textAlign:'right' }} type="number" min="0" step="0.001" placeholder="1" value={c.quantityPer} onChange={e => setComp(idx, 'quantityPer', e.target.value)} /></td>
                    <td style={{ padding:'4px 3px', width:70 }}><input style={{ ...INPUT, fontSize:12, padding:'6px 8px' }} placeholder="PCS" value={c.uom} onChange={e => setComp(idx, 'uom', e.target.value)} /></td>
                    <td style={{ padding:'4px 3px', width:70 }}><input style={{ ...INPUT, fontSize:12, padding:'6px 8px', textAlign:'right' }} type="number" min="0" max="100" placeholder="0" value={c.scrapPercent} onChange={e => setComp(idx, 'scrapPercent', e.target.value)} /></td>
                    <td style={{ padding:'4px 3px', width:24 }}>{components.length > 1 && <button type="button" onClick={() => setComponents(cs => cs.filter((_,i) => i !== idx))} style={{ width:20, height:20, borderRadius:4, background:'rgba(239,68,68,0.1)', border:'0.5px solid rgba(239,68,68,0.2)', color:'#f87171', cursor:'pointer', fontSize:13, display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8, padding:'12px 20px 18px', borderTop:'0.5px solid rgba(255,255,255,0.06)' }}>
            <button type="button" onClick={onClose} style={{ background:'rgba(255,255,255,0.05)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:7, padding:'8px 16px', fontSize:13, fontFamily:"'IBM Plex Sans',sans-serif", color:'rgba(255,255,255,0.5)', cursor:'pointer' }}>Cancel</button>
            <button type="submit" disabled={busy} style={{ background:'linear-gradient(135deg,#c2410c,#ea580c,#f97316)', border:'none', borderRadius:7, padding:'8px 20px', fontSize:13, fontWeight:500, fontFamily:"'IBM Plex Sans',sans-serif", color:'white', cursor:'pointer', boxShadow:'0 3px 12px rgba(234,88,12,0.35)', opacity:busy?0.5:1 }}>{busy ? 'Creating…' : 'Create BOM'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function BOMPage() {
  const [list, setList] = useState<Bom[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, Bom>>({});
  const [modalOpen, setModalOpen] = useState(false);

  const fetchBoms = useCallback(async () => {
    try { setLoading(true); setList(extractList<Bom>(await bomApi.getAll())); }
    catch (err) { setError(err instanceof Error ? err.message : 'Load failed.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchBoms();
    itemsApi.getAll().then(setItems).catch(() => {});
  }, [fetchBoms]);

  const handleExpand = async (bom: Bom) => {
    if (expanded === bom.id) { setExpanded(null); return; }
    setExpanded(bom.id);
    if (!detail[bom.id]) {
      try { const d = await bomApi.getById(bom.id); setDetail(prev => ({ ...prev, [bom.id]: d as Bom })); }
      catch {}
    }
  };

  const MONO = { fontFamily:"'IBM Plex Mono',monospace", fontSize:12 } as React.CSSProperties;

  return (
    <ERPShell breadcrumbs={['Home', 'Manufacturing', 'Bill of Materials']} title="Bill of Materials">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap');
        .bom-page { padding: 0 18px 24px; }
        .bom-toolbar { display:flex; align-items:center; gap:10px; margin-bottom:14px; justify-content:flex-end; }
        .bom-btn-new { display:flex; align-items:center; gap:6px; background:linear-gradient(135deg,#c2410c,#ea580c,#f97316); border:none; border-radius:7px; padding:7px 14px; font-size:12px; font-weight:500; font-family:'IBM Plex Sans',sans-serif; color:white; cursor:pointer; box-shadow:0 3px 12px rgba(234,88,12,0.3); }
        .bom-btn-new svg { width:13px; height:13px; display:block; flex-shrink:0; }
        .bom-wrap { background:rgba(10,7,18,0.7); border:0.5px solid rgba(251,146,60,0.12); border-radius:10px; overflow:hidden; }
        .bom-table { width:100%; border-collapse:collapse; }
        .bom-table thead th { padding:9px 14px; font-size:10px; font-weight:500; letter-spacing:0.1em; text-transform:uppercase; color:rgba(251,146,60,0.55); background:rgba(251,146,60,0.05); border-bottom:0.5px solid rgba(255,255,255,0.06); text-align:left; white-space:nowrap; }
        .bom-table tbody td { padding:10px 14px; border-bottom:0.5px solid rgba(255,255,255,0.04); vertical-align:middle; font-size:13px; }
        .bom-table tbody tr:last-child td { border-bottom:none; }
        .bom-table tbody tr:hover td { background:rgba(251,146,60,0.03); }
        .bom-empty, .bom-loading { text-align:center; padding:52px 24px; color:rgba(255,255,255,0.25); font-size:13px; }
        .bom-footer { font-size:11px; color:rgba(255,255,255,0.22); padding:8px 14px; border-top:0.5px solid rgba(255,255,255,0.04); }
        .bom-error { background:rgba(239,68,68,0.08); border:0.5px solid rgba(239,68,68,0.2); border-radius:8px; padding:10px 14px; margin-bottom:14px; font-size:13px; color:#fca5a5; }
      `}</style>
      <div className="bom-page">
        <div className="bom-toolbar">
          <button className="bom-btn-new" onClick={() => setModalOpen(true)}>
            <svg viewBox="0 0 13 13" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><line x1="6.5" y1="1" x2="6.5" y2="12"/><line x1="1" y1="6.5" x2="12" y2="6.5"/></svg>
            New BOM
          </button>
        </div>
        {error && <div className="bom-error">{error}</div>}
        <div className="bom-wrap">
          {loading ? <div className="bom-loading">Loading…</div>
          : list.length === 0 ? <div className="bom-empty">No BOMs yet.</div>
          : (<>
            <table className="bom-table">
              <thead><tr>{['BOM Number','Parent Item','Version','Components','Status',''].map(h => <th key={h}>{h}</th>)}</tr></thead>
              <tbody>
                {list.map(bom => (<React.Fragment key={bom.id}>
                  <tr key={bom.id} style={{ cursor:'pointer' }} onClick={() => handleExpand(bom)}>
                    <td>
                      <span style={{ display:'inline-flex', alignItems:'center', gap:6 }}>
                        <span style={{ fontSize:9, color:'rgba(255,255,255,0.3)', transform: expanded===bom.id ? 'rotate(90deg)':'none', display:'inline-block', transition:'transform 0.15s' }}>▶</span>
                        <span style={{ ...MONO, color:'#fb923c', fontWeight:500 }}>{bom.bomNumber}</span>
                      </span>
                    </td>
                    <td>
                      <span style={{ ...MONO, color:'#fb923c', fontSize:11 }}>{bom.parentItem?.code}</span>
                      <span style={{ fontSize:12, color:'rgba(255,255,255,0.6)', marginLeft:8 }}>{bom.parentItem?.name}</span>
                    </td>
                    <td><span style={{ fontSize:12, color:'rgba(255,255,255,0.45)' }}>v{bom.version ?? 1}</span></td>
                    <td><span style={{ fontSize:12, color:'rgba(255,255,255,0.45)' }}>{bom._count?.components ?? bom.components?.length ?? 0} component{(bom._count?.components ?? 0) !== 1 ? 's' : ''}</span></td>
                    <td><span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, color: bom.isActive ? '#4ade80' : '#f87171', background: bom.isActive ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)', border:`0.5px solid ${bom.isActive ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)'}` }}>{bom.isActive ? 'Active' : 'Inactive'}</span></td>
                    <td onClick={e => e.stopPropagation()}><button style={{ padding:'4px 9px', borderRadius:6, fontSize:11, cursor:'pointer', background:'rgba(239,68,68,0.08)', color:'#f87171', border:'0.5px solid rgba(239,68,68,0.2)', fontFamily:"'IBM Plex Sans',sans-serif" }}>Delete</button></td>
                  </tr>
                  {expanded === bom.id && (
                    <tr key={`${bom.id}-exp`}>
                      <td colSpan={6} style={{ padding:0, background:'rgba(251,146,60,0.015)' }}>
                        {!detail[bom.id] ? <div style={{ padding:'12px 40px', fontSize:12, color:'rgba(255,255,255,0.3)' }}>Loading…</div> : (
                          <table style={{ width:'100%', borderCollapse:'collapse' }}>
                            <thead><tr>{['#','Component','Qty Per','UOM','Scrap %','Phantom'].map(h => <th key={h} style={{ padding:`6px 14px 6px ${h==='#'?'40px':'14px'}`, fontSize:10, color:'rgba(255,255,255,0.3)', fontWeight:500, letterSpacing:'0.08em', textTransform:'uppercase', textAlign:'left', borderBottom:'0.5px solid rgba(255,255,255,0.04)' }}>{h}</th>)}</tr></thead>
                            <tbody>
                              {detail[bom.id].components?.map(comp => (
                                <tr key={comp.id}>
                                  <td style={{ padding:'7px 14px 7px 40px', fontSize:11, color:'rgba(255,255,255,0.3)' }}>{comp.lineNumber}</td>
                                  <td style={{ padding:'7px 14px' }}>
                                    <span style={{ ...MONO, color:'#fb923c', fontSize:11 }}>{comp.componentItem?.code}</span>
                                    <span style={{ fontSize:12, color:'rgba(255,255,255,0.6)', marginLeft:8 }}>{comp.componentItem?.name}</span>
                                  </td>
                                  <td style={{ padding:'7px 14px', ...MONO, color:'#e2dfd8' }}>{comp.quantityPer}</td>
                                  <td style={{ padding:'7px 14px', fontSize:12, color:'rgba(255,255,255,0.45)' }}>{comp.uom}</td>
                                  <td style={{ padding:'7px 14px', fontSize:12, color: (comp.scrapPercent ?? 0) > 0 ? '#fbbf24' : 'rgba(255,255,255,0.25)' }}>{comp.scrapPercent ? `${comp.scrapPercent}%` : '—'}</td>
                                  <td style={{ padding:'7px 14px', fontSize:11, color: comp.isPhantom ? '#60a5fa' : 'rgba(255,255,255,0.25)' }}>{comp.isPhantom ? 'Yes' : 'No'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>))}
              </tbody>
            </table>
            <div className="bom-footer">{list.length} BOM{list.length !== 1 ? 's' : ''}</div>
          </>)}
        </div>
      </div>
      {modalOpen && <BOMModal items={items} onClose={() => setModalOpen(false)} onSaved={fetchBoms} />}
    </ERPShell>
  );
}