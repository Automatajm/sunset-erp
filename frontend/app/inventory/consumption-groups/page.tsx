// ============================================================================
// frontend/app/inventory/consumption-groups/page.tsx
// ============================================================================
"use client";
import { useEffect, useState, useCallback } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import { consumptionGroupsApi } from '@/lib/api/consumption-groups';
import { uomApi } from '@/lib/api/uom';
import { ConsumptionGroup, UomUnit, CreateConsumptionGroupDto } from '@/lib/api/types';
 
const EMPTY_CG: CreateConsumptionGroupDto = { code: '', name: '', description: '', consumptionUomId: '', isActive: true };
 
function CgModal({ open, onClose, onSaved, initial, uomUnits }: {
  open: boolean; onClose: () => void; onSaved: () => void;
  initial: ConsumptionGroup | null; uomUnits: UomUnit[];
}) {
  const [form, setForm] = useState(EMPTY_CG);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
 
  useEffect(() => {
    if (open) {
      setError('');
      setForm(initial ? {
        code: initial.code, name: initial.name, description: initial.description ?? '',
        consumptionUomId: initial.consumptionUomId, isActive: initial.isActive,
      } : EMPTY_CG);
    }
  }, [open, initial]);
 
  const set = (k: keyof CreateConsumptionGroupDto) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));
 
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code.trim() || !form.name.trim() || !form.consumptionUomId) { setError('Code, name and UOM are required'); return; }
    setSubmitting(true); setError('');
    try {
      if (initial) await consumptionGroupsApi.update(initial.id, form);
      else          await consumptionGroupsApi.create(form);
      onSaved(); onClose();
    } catch (err: any) { setError(err?.response?.data?.message ?? 'Operation failed'); }
    finally { setSubmitting(false); }
  };
 
  if (!open) return null;
  return (
    <>
      <style>{`.cgm-overlay{position:fixed;inset:0;z-index:400;background:rgba(0,0,0,0.65);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:24px}.cgm-box{background:#0e0b1a;border:0.5px solid rgba(251,146,60,0.2);border-radius:14px;width:100%;max-width:480px;box-shadow:0 24px 60px rgba(0,0,0,0.7)}.cgm-hdr{display:flex;align-items:center;justify-content:space-between;padding:14px 18px 12px;border-bottom:0.5px solid rgba(255,255,255,0.06)}.cgm-title{font-size:13px;font-weight:500;color:#f1ede8}.cgm-close{width:22px;height:22px;border-radius:6px;background:rgba(255,255,255,0.06);border:none;cursor:pointer;color:rgba(255,255,255,0.4);font-size:15px;display:flex;align-items:center;justify-content:center}.cgm-body{padding:14px 18px;display:flex;flex-direction:column;gap:10px}.cgm-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}.cgm-field{display:flex;flex-direction:column;gap:5px}.cgm-label{font-size:11px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;color:rgba(251,146,60,0.55)}.cgm-sublabel{font-size:10px;color:rgba(255,255,255,0.3)}.cgm-input,.cgm-select,.cgm-textarea{background:rgba(255,255,255,0.04);border:0.5px solid rgba(255,255,255,0.1);border-radius:7px;padding:8px 12px;font-size:13px;font-family:'IBM Plex Sans',sans-serif;color:#f1ede8;outline:none;width:100%}.cgm-input:focus,.cgm-select:focus,.cgm-textarea:focus{border-color:rgba(251,146,60,0.45)}.cgm-select option{background:#0e0b1a}.cgm-textarea{resize:vertical;min-height:56px}.cgm-error{background:rgba(239,68,68,0.1);border:0.5px solid rgba(239,68,68,0.25);border-radius:7px;padding:7px 12px;font-size:12px;color:#fca5a5}.cgm-ftr{display:flex;justify-content:flex-end;gap:8px;padding:10px 18px 16px;border-top:0.5px solid rgba(255,255,255,0.06)}.cgm-btn-cancel{background:rgba(255,255,255,0.05);border:0.5px solid rgba(255,255,255,0.1);border-radius:7px;padding:7px 14px;font-size:12px;font-family:'IBM Plex Sans',sans-serif;color:rgba(255,255,255,0.45);cursor:pointer}.cgm-btn-save{background:linear-gradient(135deg,#c2410c,#ea580c,#f97316);border:none;border-radius:7px;padding:7px 18px;font-size:12px;font-weight:500;font-family:'IBM Plex Sans',sans-serif;color:white;cursor:pointer}.cgm-btn-save:disabled{opacity:0.5;cursor:not-allowed}`}</style>
      <div className="cgm-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="cgm-box">
          <div className="cgm-hdr">
            <span className="cgm-title">{initial ? 'Edit Consumption Group' : 'New Consumption Group'}</span>
            <button className="cgm-close" onClick={onClose}>×</button>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="cgm-body">
              {error && <div className="cgm-error">{error}</div>}
              <div className="cgm-row">
                <div className="cgm-field">
                  <label className="cgm-label">Code *</label>
                  <input className="cgm-input" placeholder="ADH-IND" value={form.code} onChange={set('code')} />
                </div>
                <div className="cgm-field">
                  <label className="cgm-label">Name *</label>
                  <input className="cgm-input" placeholder="Industrial Adhesives" value={form.name} onChange={set('name')} />
                </div>
              </div>
              <div className="cgm-field">
                <label className="cgm-label">Consumption UOM *</label>
                <p className="cgm-sublabel">The unit Production uses — all items in the group must be convertible to this unit.</p>
                <select className="cgm-select" value={form.consumptionUomId} onChange={set('consumptionUomId')}>
                  <option value="">— Select UOM —</option>
                  {uomUnits.map(u => <option key={u.id} value={u.id}>{u.code} — {u.name} ({u.type} · {u.system})</option>)}
                </select>
              </div>
              <div className="cgm-field">
                <label className="cgm-label">Description</label>
                <textarea className="cgm-textarea" placeholder="Optional…" value={form.description} onChange={set('description')} />
              </div>
            </div>
            <div className="cgm-ftr">
              <button type="button" className="cgm-btn-cancel" onClick={onClose}>Cancel</button>
              <button type="submit" className="cgm-btn-save" disabled={submitting}>
                {submitting ? 'Saving…' : initial ? 'Save Changes' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
 
export default function ConsumptionGroupsPage() {
  const [items,    setItems]    = useState<ConsumptionGroup[]>([]);
  const [uomUnits, setUomUnits] = useState<UomUnit[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [search,   setSearch]   = useState('');
  const [modal,    setModal]    = useState(false);
  const [editing,  setEditing]  = useState<ConsumptionGroup | null>(null);
 
  const fetch_ = useCallback(async () => {
    try {
      setLoading(true);
      const [cg, u] = await Promise.all([consumptionGroupsApi.getAll(), uomApi.getUnits()]);
      setItems(cg); setUomUnits(u);
    } catch { setError('Failed to load'); }
    finally { setLoading(false); }
  }, []);
 
  useEffect(() => { fetch_(); }, [fetch_]);
 
  const filtered = search
    ? items.filter(i => i.code.toLowerCase().includes(search.toLowerCase()) || i.name.toLowerCase().includes(search.toLowerCase()))
    : items;
 
  const TYPE_COLORS: Record<string, string> = {
    volume: '#60a5fa', mass: '#a78bfa', count: '#4ade80', length: '#fbbf24',
  };
 
  return (
    <ERPShell breadcrumbs={['Home', 'Inventory', 'Consumption Groups']} title="Consumption Groups">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap');
        .cgp-page{padding:0 18px 24px}.cgp-toolbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;gap:12px}.cgp-search{background:rgba(255,255,255,0.04);border:0.5px solid rgba(255,255,255,0.09);border-radius:7px;padding:7px 12px;font-size:12px;font-family:'IBM Plex Sans',sans-serif;color:#e2dfd8;outline:none;width:260px}.cgp-search:focus{border-color:rgba(251,146,60,0.4)}.cgp-btn-new{display:flex;align-items:center;gap:6px;background:linear-gradient(135deg,#c2410c,#ea580c,#f97316);border:none;border-radius:7px;padding:7px 14px;font-size:12px;font-weight:500;font-family:'IBM Plex Sans',sans-serif;color:white;cursor:pointer;box-shadow:0 3px 12px rgba(234,88,12,0.3);transition:opacity 0.15s}.cgp-btn-new:hover{opacity:0.88}.cgp-wrap{background:rgba(10,7,18,0.7);border:0.5px solid rgba(251,146,60,0.12);border-radius:10px;overflow:hidden}.cgp-table{width:100%;border-collapse:collapse}.cgp-table thead th{padding:9px 14px;font-size:10px;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;color:rgba(251,146,60,0.55);background:rgba(251,146,60,0.05);border-bottom:0.5px solid rgba(255,255,255,0.06);text-align:left}.cgp-table tbody td{padding:10px 14px;border-bottom:0.5px solid rgba(255,255,255,0.04);font-size:13px;vertical-align:middle}.cgp-table tbody tr:last-child td{border-bottom:none}.cgp-table tbody tr:hover td{background:rgba(251,146,60,0.03)}.cgp-code{font-family:'IBM Plex Mono',monospace;font-size:12px;color:#fb923c}.cgp-muted{color:rgba(255,255,255,0.4);font-size:12px}.cgp-actions{display:flex;gap:6px}.cgp-btn-edit{padding:4px 10px;border-radius:6px;font-size:11px;font-family:'IBM Plex Sans',sans-serif;cursor:pointer;background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.5);border:0.5px solid rgba(255,255,255,0.1)}.cgp-btn-edit:hover{background:rgba(255,255,255,0.09)}.cgp-empty,.cgp-loading{text-align:center;padding:52px 24px;color:rgba(255,255,255,0.25);font-size:13px}.cgp-footer{font-size:11px;color:rgba(255,255,255,0.22);padding:8px 14px;border-top:0.5px solid rgba(255,255,255,0.04)}.cgp-error{background:rgba(239,68,68,0.08);border:0.5px solid rgba(239,68,68,0.2);border-radius:8px;padding:9px 14px;margin-bottom:14px;font-size:12px;color:#fca5a5}.cgp-uom-badge{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:500}
      `}</style>
      <div className="cgp-page">
        {error && <div className="cgp-error">{error}</div>}
        <div className="cgp-toolbar">
          <input className="cgp-search" placeholder="Search code or name…" value={search} onChange={e => setSearch(e.target.value)} />
          <button className="cgp-btn-new" onClick={() => { setEditing(null); setModal(true); }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><line x1="6" y1="1" x2="6" y2="11"/><line x1="1" y1="6" x2="11" y2="6"/></svg>
            New Group
          </button>
        </div>
        <div className="cgp-wrap">
          {loading ? <div className="cgp-loading">Loading…</div>
          : filtered.length === 0 ? <div className="cgp-empty">{search ? 'No results.' : 'No consumption groups yet.'}</div>
          : (
            <>
              <table className="cgp-table">
                <thead><tr><th>Code</th><th>Name</th><th>Consumption UOM</th><th>Items</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {filtered.map(cg => {
                    const uom = cg.consumptionUom;
                    const color = TYPE_COLORS[uom?.type ?? ''] ?? '#e2dfd8';
                    return (
                      <tr key={cg.id}>
                        <td><span className="cgp-code">{cg.code}</span></td>
                        <td style={{ color: '#e2dfd8', fontWeight: 500 }}>{cg.name}</td>
                        <td>
                          {uom ? (
                            <span className="cgp-uom-badge" style={{ color, background: `${color}15`, border: `0.5px solid ${color}35` }}>
                              <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, flexShrink: 0 }} />
                              {uom.code} — {uom.name}
                            </span>
                          ) : <span className="cgp-muted">—</span>}
                        </td>
                        <td><span style={{ fontSize: 12, color: 'rgba(251,146,60,0.7)' }}>{cg._count?.items ?? 0}</span></td>
                        <td><span style={{ fontSize: 12, color: cg.isActive ? '#4ade80' : 'rgba(255,255,255,0.3)' }}>{cg.isActive ? 'Active' : 'Inactive'}</span></td>
                        <td>
                          <div className="cgp-actions">
                            <button className="cgp-btn-edit" onClick={() => { setEditing(cg); setModal(true); }}>Edit</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="cgp-footer">{filtered.length} of {items.length} consumption groups</div>
            </>
          )}
        </div>
      </div>
      <CgModal open={modal} onClose={() => setModal(false)} onSaved={fetch_} initial={editing} uomUnits={uomUnits} />
    </ERPShell>
  );
}