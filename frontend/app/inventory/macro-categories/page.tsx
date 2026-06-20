// ============================================================================
// frontend/app/inventory/macro-categories/page.tsx
// ============================================================================
"use client";
import { useEffect, useState, useCallback } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import { macroCategoriesApi } from '@/lib/api/macro-categories';
import { MacroCategory, CreateMacroCategoryDto } from '@/lib/api/types';
 
const EMPTY: CreateMacroCategoryDto = { name: '', description: '', isActive: true };
 
function Modal({ open, onClose, onSaved, initial }: {
  open: boolean; onClose: () => void; onSaved: () => void; initial: MacroCategory | null;
}) {
  const [form, setForm] = useState(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
 
  useEffect(() => {
    if (open) {
      setError('');
      setForm(initial ? { name: initial.name, description: initial.description ?? '', isActive: initial.isActive } : EMPTY);
    }
  }, [open, initial]);
 
  const set = (k: keyof CreateMacroCategoryDto) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));
 
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Name is required'); return; }
    setSubmitting(true); setError('');
    try {
      if (initial) await macroCategoriesApi.update(initial.id, form);
      else          await macroCategoriesApi.create(form);
      onSaved(); onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Operation failed');
    } finally { setSubmitting(false); }
  };
 
  if (!open) return null;
  return (
    <>
      <style>{`.mc-overlay{position:fixed;inset:0;z-index:400;background:rgba(0,0,0,0.65);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:24px}.mc-box{background:var(--surface, #0e0b1a);border:0.5px solid rgba(251,146,60,0.2);border-radius:14px;width:100%;max-width:460px;box-shadow:0 24px 60px rgba(0,0,0,0.7)}.mc-hdr{display:flex;align-items:center;justify-content:space-between;padding:14px 18px 12px;border-bottom:0.5px solid rgba(255,255,255,0.06)}.mc-title{font-size:13px;font-weight:500;color:var(--text-strong, #f1ede8)}.mc-close{width:22px;height:22px;border-radius:6px;background:rgba(255,255,255,0.06);border:none;cursor:pointer;color:rgba(255,255,255,0.4);font-size:15px;display:flex;align-items:center;justify-content:center}.mc-body{padding:14px 18px;display:flex;flex-direction:column;gap:10px}.mc-field{display:flex;flex-direction:column;gap:5px}.mc-label{font-size:11px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;color:rgba(251,146,60,0.55)}.mc-input,.mc-textarea{background:rgba(255,255,255,0.04);border:0.5px solid rgba(255,255,255,0.1);border-radius:7px;padding:8px 12px;font-size:13px;font-family:'IBM Plex Sans',sans-serif;color:var(--text-strong, #f1ede8);outline:none;width:100%}.mc-input:focus,.mc-textarea:focus{border-color:rgba(251,146,60,0.45)}.mc-textarea{resize:vertical;min-height:60px}.mc-error{background:rgba(239,68,68,0.1);border:0.5px solid rgba(239,68,68,0.25);border-radius:7px;padding:7px 12px;font-size:12px;color:var(--danger-subtle, #fca5a5)}.mc-ftr{display:flex;justify-content:flex-end;gap:8px;padding:10px 18px 16px;border-top:0.5px solid rgba(255,255,255,0.06)}.mc-btn-cancel{background:rgba(255,255,255,0.05);border:0.5px solid rgba(255,255,255,0.1);border-radius:7px;padding:7px 14px;font-size:12px;font-family:'IBM Plex Sans',sans-serif;color:rgba(255,255,255,0.45);cursor:pointer}.mc-btn-save{background:linear-gradient(135deg,var(--accent-pressed, #c2410c),var(--accent, #ea580c),var(--accent-mid, #f97316));border:none;border-radius:7px;padding:7px 18px;font-size:12px;font-weight:500;font-family:'IBM Plex Sans',sans-serif;color:white;cursor:pointer}.mc-btn-save:disabled{opacity:0.5;cursor:not-allowed}.mc-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}`}</style>
      <div className="mc-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="mc-box">
          <div className="mc-hdr">
            <span className="mc-title">{initial ? 'Edit Macro Category' : 'New Macro Category'}</span>
            <button className="mc-close" onClick={onClose}>×</button>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="mc-body">
              {error && <div className="mc-error">{error}</div>}
              <div className="mc-row">
                <div className="mc-field">
                  <label className="mc-label">Code</label>
                  {/* Codes are system-assigned and immutable (spec-012) */}
                  <input className="mc-input" value={initial?.code ?? 'Auto (MC-YYYY-NNNN)'} disabled readOnly />
                </div>
                <div className="mc-field">
                  <label className="mc-label">Name *</label>
                  <input className="mc-input" placeholder="Wood & Panels" value={form.name} onChange={set('name')} />
                </div>
              </div>
              <div className="mc-field">
                <label className="mc-label">Description</label>
                <textarea className="mc-textarea" placeholder="Optional description…" value={form.description} onChange={set('description')} />
              </div>
            </div>
            <div className="mc-ftr">
              <button type="button" className="mc-btn-cancel" onClick={onClose}>Cancel</button>
              <button type="submit" className="mc-btn-save" disabled={submitting}>
                {submitting ? 'Saving…' : initial ? 'Save Changes' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
 
export default function MacroCategoriesPage() {
  const [items,      setItems]      = useState<MacroCategory[]>([]);
  const [filtered,   setFiltered]   = useState<MacroCategory[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [search,     setSearch]     = useState('');
  const [modalOpen,  setModalOpen]  = useState(false);
  const [editing,    setEditing]    = useState<MacroCategory | null>(null);
  const [deleting,   setDeleting]   = useState<MacroCategory | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
 
  const fetch_ = useCallback(async () => {
    try { setLoading(true); const d = await macroCategoriesApi.getAll(); setItems(d); setFiltered(d); }
    catch { setError('Failed to load macro categories'); }
    finally { setLoading(false); }
  }, []);
 
  useEffect(() => { fetch_(); }, [fetch_]);
 
  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(q ? items.filter(i => i.code.toLowerCase().includes(q) || i.name.toLowerCase().includes(q)) : items);
  }, [search, items]);
 
  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try { await macroCategoriesApi.remove(deleting.id); setDeleting(null); fetch_(); }
    catch (err: any) { setError(err?.response?.data?.message ?? 'Delete failed'); setDeleting(null); }
    finally { setDeleteBusy(false); }
  };
 
  return (
    <ERPShell breadcrumbs={['Home', 'Inventory', 'Macro Categories']} title="Macro Categories">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap');
        .mcp-page{padding:0 18px 24px}.mcp-toolbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;gap:12px}.mcp-search{background:rgba(255,255,255,0.04);border:0.5px solid rgba(255,255,255,0.09);border-radius:7px;padding:7px 12px;font-size:12px;font-family:'IBM Plex Sans',sans-serif;color:var(--text-primary, #e2dfd8);outline:none;width:260px}.mcp-search:focus{border-color:rgba(251,146,60,0.4)}.mcp-btn-new{display:flex;align-items:center;gap:6px;background:linear-gradient(135deg,var(--accent-pressed, #c2410c),var(--accent, #ea580c),var(--accent-mid, #f97316));border:none;border-radius:7px;padding:7px 14px;font-size:12px;font-weight:500;font-family:'IBM Plex Sans',sans-serif;color:white;cursor:pointer;box-shadow:0 3px 12px rgba(234,88,12,0.3);transition:opacity 0.15s}.mcp-btn-new:hover{opacity:0.88}.mcp-wrap{background:rgba(10,7,18,0.7);border:0.5px solid rgba(251,146,60,0.12);border-radius:10px;overflow:hidden}.mcp-table{width:100%;border-collapse:collapse}.mcp-table thead th{padding:9px 14px;font-size:10px;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;color:rgba(251,146,60,0.55);background:rgba(251,146,60,0.05);border-bottom:0.5px solid rgba(255,255,255,0.06);text-align:left}.mcp-table tbody td{padding:10px 14px;border-bottom:0.5px solid rgba(255,255,255,0.04);font-size:13px;vertical-align:middle}.mcp-table tbody tr:last-child td{border-bottom:none}.mcp-table tbody tr:hover td{background:rgba(251,146,60,0.03)}.mcp-code{font-family:'IBM Plex Mono',monospace;font-size:12px;color:var(--accent-strong, #fb923c)}.mcp-muted{color:rgba(255,255,255,0.4);font-size:12px}.mcp-actions{display:flex;gap:6px}.mcp-btn-edit,.mcp-btn-del{padding:4px 10px;border-radius:6px;font-size:11px;font-family:'IBM Plex Sans',sans-serif;cursor:pointer;border:0.5px solid transparent;transition:background 0.15s}.mcp-btn-edit{background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.5);border-color:rgba(255,255,255,0.1)}.mcp-btn-edit:hover{background:rgba(255,255,255,0.09)}.mcp-btn-del{background:rgba(239,68,68,0.08);color:var(--danger, #f87171);border-color:rgba(239,68,68,0.2)}.mcp-btn-del:hover{background:rgba(239,68,68,0.14)}.mcp-empty,.mcp-loading{text-align:center;padding:52px 24px;color:rgba(255,255,255,0.25);font-size:13px}.mcp-footer{font-size:11px;color:rgba(255,255,255,0.22);padding:8px 14px;border-top:0.5px solid rgba(255,255,255,0.04)}.mcp-error{background:rgba(239,68,68,0.08);border:0.5px solid rgba(239,68,68,0.2);border-radius:8px;padding:9px 14px;margin-bottom:14px;font-size:12px;color:var(--danger-subtle, #fca5a5)}.mcp-count{display:inline-flex;align-items:center;padding:2px 8px;border-radius:20px;font-size:11px;background:rgba(251,146,60,0.08);color:rgba(251,146,60,0.7);border:0.5px solid rgba(251,146,60,0.2)}
      `}</style>
      <div className="mcp-page">
        {error && <div className="mcp-error">{error}</div>}
        <div className="mcp-toolbar">
          <input className="mcp-search" placeholder="Search by code or name…" value={search} onChange={e => setSearch(e.target.value)} />
          <button className="mcp-btn-new" onClick={() => { setEditing(null); setModalOpen(true); }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><line x1="6" y1="1" x2="6" y2="11"/><line x1="1" y1="6" x2="11" y2="6"/></svg>
            New Macro Category
          </button>
        </div>
        <div className="mcp-wrap">
          {loading ? <div className="mcp-loading">Loading…</div>
          : filtered.length === 0 ? <div className="mcp-empty">{search ? 'No results.' : 'No macro categories yet.'}</div>
          : (
            <>
              <table className="mcp-table">
                <thead><tr><th>Code</th><th>Name</th><th>Description</th><th>Categories</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {filtered.map(mc => (
                    <tr key={mc.id}>
                      <td><span className="mcp-code">{mc.code}</span></td>
                      <td style={{ color: 'var(--text-primary, #e2dfd8)', fontWeight: 500 }}>{mc.name}</td>
                      <td><span className="mcp-muted">{mc.description || '—'}</span></td>
                      <td><span className="mcp-count">{mc._count?.categories ?? 0} categories</span></td>
                      <td>
                        <span style={{ color: mc.isActive ? 'var(--success, #4ade80)' : 'rgba(255,255,255,0.3)', fontSize: 12 }}>
                          {mc.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td>
                        <div className="mcp-actions">
                          <button className="mcp-btn-edit" onClick={() => { setEditing(mc); setModalOpen(true); }}>Edit</button>
                          <button className="mcp-btn-del"  onClick={() => setDeleting(mc)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="mcp-footer">{filtered.length} of {items.length} macro categories</div>
            </>
          )}
        </div>
      </div>
 
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={fetch_} initial={editing} />
 
      {deleting && (
        <div style={{ position:'fixed', inset:0, zIndex:400, background:'rgba(0,0,0,0.65)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
          <div style={{ background:'var(--surface, #0e0b1a)', border:'0.5px solid rgba(239,68,68,0.25)', borderRadius:14, width:'100%', maxWidth:380, padding:'22px 22px 18px', boxShadow:'0 24px 60px rgba(0,0,0,0.7)' }}>
            <div style={{ fontSize:14, fontWeight:500, color:'var(--text-strong, #f1ede8)', marginBottom:10 }}>Delete macro category?</div>
            <div style={{ fontSize:13, color:'rgba(255,255,255,0.45)', marginBottom:20, lineHeight:1.5 }}>
              <strong style={{ color:'var(--text-strong, #f1ede8)' }}>{deleting.name}</strong> ({deleting.code}) will be soft-deleted.
              {(deleting._count?.categories ?? 0) > 0 && <span style={{ color:'var(--danger-subtle, #fca5a5)' }}> This macro category has {deleting._count?.categories} categories — delete them first.</span>}
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
              <button onClick={() => setDeleting(null)} style={{ background:'rgba(255,255,255,0.05)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:7, padding:'7px 14px', fontSize:12, fontFamily:"'IBM Plex Sans',sans-serif", color:'rgba(255,255,255,0.45)', cursor:'pointer' }}>Cancel</button>
              <button onClick={handleDelete} disabled={deleteBusy || (deleting._count?.categories ?? 0) > 0} style={{ background:'rgba(239,68,68,0.15)', border:'0.5px solid rgba(239,68,68,0.35)', borderRadius:7, padding:'7px 14px', fontSize:12, fontWeight:500, fontFamily:"'IBM Plex Sans',sans-serif", color:'var(--danger, #f87171)', cursor:'pointer', opacity: deleteBusy || (deleting._count?.categories ?? 0) > 0 ? 0.5 : 1 }}>
                {deleteBusy ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </ERPShell>
  );
}