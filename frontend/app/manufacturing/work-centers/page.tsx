"use client";

import { useEffect, useState, useCallback } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import { workCentersApi } from '@/lib/api/work-centers';
import { WorkCenterType } from '@/lib/api/types';

interface WorkCenter {
  id: string; code: string; name: string;
  workCenterType?: WorkCenterType;
  capacityPerHour?: number; efficiencyPercent?: number; costPerHour?: number;
  isActive: boolean; createdAt: string;
}

// /work-centers returns an envelope { workCenters, count } (spec-010)
function extractList(data: unknown): WorkCenter[] {
  if (Array.isArray(data)) return data as WorkCenter[];
  const d = data as Record<string, unknown>;
  if (d?.workCenters && Array.isArray(d.workCenters)) return d.workCenters as WorkCenter[];
  if (d?.value && Array.isArray(d.value)) return d.value as WorkCenter[];
  return [];
}

const WC_TYPE_COLOR: Record<string, string> = {
  machine: '#60a5fa', labor: '#4ade80', assembly: '#a78bfa', quality: '#fbbf24',
};

const INPUT: React.CSSProperties = { background:'rgba(255,255,255,0.04)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:7, padding:'9px 12px', fontSize:13, fontFamily:"'IBM Plex Sans',sans-serif", color:'#f1ede8', outline:'none', width:'100%' };
const TD: React.CSSProperties = { padding:'10px 14px', borderBottom:'0.5px solid rgba(255,255,255,0.04)', verticalAlign:'middle', fontSize:13 };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ display:'flex', flexDirection:'column', gap:5 }}><label style={{ fontSize:11, fontWeight:500, letterSpacing:'0.08em', textTransform:'uppercase' as const, color:'rgba(251,146,60,0.6)', fontFamily:"'IBM Plex Sans',sans-serif" }}>{label}</label>{children}</div>;
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', fontSize:12, color: value ? '#e2dfd8' : 'rgba(255,255,255,0.4)', fontFamily:"'IBM Plex Sans',sans-serif", userSelect:'none', background:'rgba(255,255,255,0.03)', border:'0.5px solid rgba(255,255,255,0.07)', borderRadius:8, padding:'10px 14px' }}>
      <div onClick={() => onChange(!value)} style={{ width:32, height:18, borderRadius:9, flexShrink:0, cursor:'pointer', background: value ? 'rgba(234,88,12,0.8)' : 'rgba(255,255,255,0.1)', border:`0.5px solid ${value ? 'rgba(251,146,60,0.5)' : 'rgba(255,255,255,0.15)'}`, position:'relative', transition:'background 0.2s' }}>
        <div style={{ position:'absolute', top:2, left: value ? 16 : 2, width:13, height:13, borderRadius:'50%', background:'#fff', transition:'left 0.2s', boxShadow:'0 1px 3px rgba(0,0,0,0.3)' }} />
      </div>
      {label}
    </label>
  );
}

function WCModal({ wc, onClose, onSaved }: { wc: WorkCenter | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ code: wc?.code ?? '', name: wc?.name ?? '', workCenterType: (wc?.workCenterType ?? '') as WorkCenterType | '', capacityPerHour: wc?.capacityPerHour?.toString() ?? '', efficiencyPercent: wc?.efficiencyPercent?.toString() ?? '', costPerHour: wc?.costPerHour?.toString() ?? '', isActive: wc?.isActive ?? true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code.trim() || !form.name.trim()) { setError('Code and name required.'); return; }
    setBusy(true); setError('');
    try {
      const payload = { code: form.code, name: form.name, workCenterType: form.workCenterType as WorkCenterType || undefined, capacityPerHour: form.capacityPerHour ? Number(form.capacityPerHour) : undefined, efficiencyPercent: form.efficiencyPercent ? Number(form.efficiencyPercent) : undefined, costPerHour: form.costPerHour ? Number(form.costPerHour) : undefined, isActive: form.isActive };
      if (wc) await workCentersApi.update(wc.id, payload); else await workCentersApi.create(payload);
      onSaved(); onClose();
    } catch (err) { setError((err as {response?:{data?:{message?:string}}}).response?.data?.message || 'Failed.'); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ position:'fixed', inset:0, zIndex:400, background:'rgba(0,0,0,0.65)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ background:'#0e0b1a', border:'0.5px solid rgba(251,146,60,0.2)', borderRadius:14, width:'100%', maxWidth:520, maxHeight:'92vh', overflowY:'auto', position:'relative', boxShadow:'0 24px 60px rgba(0,0,0,0.7)' }}>
        <div style={{ position:'absolute', top:0, left:30, right:30, height:1, background:'linear-gradient(90deg,transparent,rgba(251,146,60,0.4),transparent)' }} />
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px 12px', borderBottom:'0.5px solid rgba(255,255,255,0.06)', position:'sticky', top:0, background:'#0e0b1a', zIndex:1 }}>
          <span style={{ fontSize:14, fontWeight:500, color:'#f1ede8', fontFamily:"'IBM Plex Sans',sans-serif" }}>{wc ? 'Edit Work Center' : 'New Work Center'}</span>
          <button onClick={onClose} style={{ width:24, height:24, borderRadius:6, background:'rgba(255,255,255,0.06)', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.45)', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ padding:'16px 20px', display:'flex', flexDirection:'column', gap:12 }}>
            {error && <div style={{ background:'rgba(239,68,68,0.1)', border:'0.5px solid rgba(239,68,68,0.25)', borderRadius:7, padding:'8px 12px', fontSize:12, color:'#fca5a5' }}>{error}</div>}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <Field label="Code *"><input style={INPUT} placeholder="WC-001" value={form.code} onChange={set('code')} required /></Field>
              <Field label="Type">
                <select style={INPUT} value={form.workCenterType} onChange={set('workCenterType')}>
                  <option value="">— None —</option>
                  {['machine','labor','assembly','quality'].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Name *"><input style={INPUT} placeholder="Assembly Line 1" value={form.name} onChange={set('name')} required /></Field>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
              <Field label="Capacity/hr"><input style={INPUT} type="number" min="0" placeholder="50" value={form.capacityPerHour} onChange={set('capacityPerHour')} /></Field>
              <Field label="Efficiency %"><input style={INPUT} type="number" min="0" max="100" placeholder="95" value={form.efficiencyPercent} onChange={set('efficiencyPercent')} /></Field>
              <Field label="Cost/hr ($)"><input style={INPUT} type="number" min="0" placeholder="75" value={form.costPerHour} onChange={set('costPerHour')} /></Field>
            </div>
            <Toggle label="Active" value={form.isActive} onChange={v => setForm(f => ({ ...f, isActive: v }))} />
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8, padding:'12px 20px 18px', borderTop:'0.5px solid rgba(255,255,255,0.06)' }}>
            <button type="button" onClick={onClose} style={{ background:'rgba(255,255,255,0.05)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:7, padding:'8px 16px', fontSize:13, fontFamily:"'IBM Plex Sans',sans-serif", color:'rgba(255,255,255,0.5)', cursor:'pointer' }}>Cancel</button>
            <button type="submit" disabled={busy} style={{ background:'linear-gradient(135deg,#c2410c,#ea580c,#f97316)', border:'none', borderRadius:7, padding:'8px 20px', fontSize:13, fontWeight:500, fontFamily:"'IBM Plex Sans',sans-serif", color:'white', cursor:'pointer', boxShadow:'0 3px 12px rgba(234,88,12,0.35)', opacity:busy?0.5:1 }}>
              {busy ? 'Saving…' : wc ? 'Save Changes' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function WorkCentersPage() {
  const [list, setList] = useState<WorkCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<WorkCenter | null>(null);
  const [deleting, setDeleting] = useState<WorkCenter | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const fetch = useCallback(async () => {
    try { setLoading(true); setList(extractList(await workCentersApi.getAll())); }
    catch (err) { setError(err instanceof Error ? err.message : 'Load failed.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  const filtered = list.filter(wc => {
    const q = search.toLowerCase();
    return !q || wc.code.toLowerCase().includes(q) || wc.name.toLowerCase().includes(q);
  });

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try { await workCentersApi.remove(deleting.id); setDeleting(null); fetch(); }
    catch (err) { setError((err as {response?:{data?:{message?:string}}}).response?.data?.message || 'Delete failed.'); setDeleting(null); }
    finally { setDeleteBusy(false); }
  };

  return (
    <ERPShell breadcrumbs={['Home', 'Manufacturing', 'Work Centers']} title="Work Centers">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap');
        .wc-page { padding: 0 18px 24px; }
        .wc-toolbar { display:flex; align-items:center; gap:10px; margin-bottom:14px; }
        .wc-search { background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.09); border-radius:7px; padding:7px 12px; font-size:12px; font-family:'IBM Plex Sans',sans-serif; color:#e2dfd8; outline:none; width:240px; }
        .wc-search::placeholder { color:rgba(255,255,255,0.2); }
        .wc-search:focus { border-color:rgba(251,146,60,0.4); }
        .wc-btn-new { display:flex; align-items:center; gap:6px; margin-left:auto; background:linear-gradient(135deg,#c2410c,#ea580c,#f97316); border:none; border-radius:7px; padding:7px 14px; font-size:12px; font-weight:500; font-family:'IBM Plex Sans',sans-serif; color:white; cursor:pointer; box-shadow:0 3px 12px rgba(234,88,12,0.3); transition:opacity 0.15s; flex-shrink:0; }
        .wc-btn-new:hover { opacity:0.88; }
        .wc-btn-new svg { width:13px; height:13px; display:block; flex-shrink:0; }
        .wc-wrap { background:rgba(10,7,18,0.7); border:0.5px solid rgba(251,146,60,0.12); border-radius:10px; overflow:hidden; }
        .wc-table { width:100%; border-collapse:collapse; }
        .wc-table thead th { padding:9px 14px; font-size:10px; font-weight:500; letter-spacing:0.1em; text-transform:uppercase; color:rgba(251,146,60,0.55); background:rgba(251,146,60,0.05); border-bottom:0.5px solid rgba(255,255,255,0.06); text-align:left; white-space:nowrap; }
        .wc-table tbody td { padding:10px 14px; border-bottom:0.5px solid rgba(255,255,255,0.04); vertical-align:middle; font-size:13px; }
        .wc-table tbody tr:last-child td { border-bottom:none; }
        .wc-table tbody tr:hover td { background:rgba(251,146,60,0.03); }
        .wc-empty, .wc-loading { text-align:center; padding:52px 24px; color:rgba(255,255,255,0.25); font-size:13px; }
        .wc-footer { font-size:11px; color:rgba(255,255,255,0.22); padding:8px 14px; border-top:0.5px solid rgba(255,255,255,0.04); }
        .wc-error { background:rgba(239,68,68,0.08); border:0.5px solid rgba(239,68,68,0.2); border-radius:8px; padding:10px 14px; margin-bottom:14px; font-size:13px; color:#fca5a5; }
      `}</style>
      <div className="wc-page">
        <div className="wc-toolbar">
          <input className="wc-search" placeholder="Search by code or name…" value={search} onChange={e => setSearch(e.target.value)} />
          <button className="wc-btn-new" onClick={() => { setEditing(null); setModalOpen(true); }}>
            <svg viewBox="0 0 13 13" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><line x1="6.5" y1="1" x2="6.5" y2="12"/><line x1="1" y1="6.5" x2="12" y2="6.5"/></svg>
            New Work Center
          </button>
        </div>
        {error && <div className="wc-error">{error}</div>}
        <div className="wc-wrap">
          {loading ? <div className="wc-loading">Loading…</div>
          : filtered.length === 0 ? <div className="wc-empty">{search ? 'No results.' : 'No work centers yet.'}</div>
          : (<>
            <table className="wc-table">
              <thead><tr>
                {['Code','Name','Type','Capacity/hr','Efficiency','Cost/hr','Status',''].map(h => <th key={h}>{h}</th>)}
              </tr></thead>
              <tbody>
                {filtered.map(wc => (
                  <tr key={wc.id}>
                    <td><span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:12, color:'#fb923c' }}>{wc.code}</span></td>
                    <td><span style={{ color:'#e2dfd8', fontWeight:500 }}>{wc.name}</span></td>
                    <td>{wc.workCenterType && <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, background:'rgba(255,255,255,0.06)', border:'0.5px solid rgba(255,255,255,0.1)', color: WC_TYPE_COLOR[wc.workCenterType] ?? '#e2dfd8' }}>{wc.workCenterType.charAt(0).toUpperCase()+wc.workCenterType.slice(1)}</span>}</td>
                    <td><span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:12, color:'rgba(255,255,255,0.6)' }}>{wc.capacityPerHour ?? '—'}</span></td>
                    <td><span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:12, color:'rgba(255,255,255,0.6)' }}>{wc.efficiencyPercent != null ? `${wc.efficiencyPercent}%` : '—'}</span></td>
                    <td><span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:12, color:'rgba(255,255,255,0.6)' }}>{wc.costPerHour != null ? `$${wc.costPerHour}/hr` : '—'}</span></td>
                    <td><span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, color: wc.isActive ? '#4ade80' : '#f87171', background: wc.isActive ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)', border:`0.5px solid ${wc.isActive ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)'}` }}>{wc.isActive ? 'Active' : 'Inactive'}</span></td>
                    <td><div style={{ display:'flex', gap:5 }}>
                      <button onClick={() => { setEditing(wc); setModalOpen(true); }} style={{ padding:'4px 9px', borderRadius:6, fontSize:11, cursor:'pointer', background:'rgba(255,255,255,0.05)', color:'rgba(255,255,255,0.55)', border:'0.5px solid rgba(255,255,255,0.1)', fontFamily:"'IBM Plex Sans',sans-serif" }}>Edit</button>
                      <button onClick={() => setDeleting(wc)} style={{ padding:'4px 9px', borderRadius:6, fontSize:11, cursor:'pointer', background:'rgba(239,68,68,0.08)', color:'#f87171', border:'0.5px solid rgba(239,68,68,0.2)', fontFamily:"'IBM Plex Sans',sans-serif" }}>Delete</button>
                    </div></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="wc-footer">{filtered.length} of {list.length} work center{list.length !== 1 ? 's' : ''}</div>
          </>)}
        </div>
      </div>
      {modalOpen && <WCModal wc={editing} onClose={() => setModalOpen(false)} onSaved={fetch} />}
      {deleting && (
        <div style={{ position:'fixed', inset:0, zIndex:400, background:'rgba(0,0,0,0.65)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
          <div style={{ background:'#0e0b1a', border:'0.5px solid rgba(239,68,68,0.25)', borderRadius:14, width:'100%', maxWidth:400, padding:'24px', boxShadow:'0 24px 60px rgba(0,0,0,0.7)' }}>
            <div style={{ fontSize:14, fontWeight:500, color:'#f1ede8', marginBottom:10 }}>Delete work center?</div>
            <div style={{ fontSize:13, color:'rgba(255,255,255,0.5)', marginBottom:20 }}><strong style={{ color:'#f1ede8' }}>{deleting.name}</strong> will be deleted.</div>
            <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
              <button onClick={() => setDeleting(null)} style={{ background:'rgba(255,255,255,0.05)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:7, padding:'8px 16px', fontSize:13, fontFamily:"'IBM Plex Sans',sans-serif", color:'rgba(255,255,255,0.5)', cursor:'pointer' }}>Cancel</button>
              <button onClick={handleDelete} disabled={deleteBusy} style={{ background:'rgba(239,68,68,0.15)', border:'0.5px solid rgba(239,68,68,0.35)', borderRadius:7, padding:'8px 16px', fontSize:13, fontWeight:500, fontFamily:"'IBM Plex Sans',sans-serif", color:'#f87171', cursor:deleteBusy?'not-allowed':'pointer', opacity:deleteBusy?0.5:1 }}>{deleteBusy?'Deleting…':'Delete'}</button>
            </div>
          </div>
        </div>
      )}
    </ERPShell>
  );
}