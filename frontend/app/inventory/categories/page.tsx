// ============================================================================
// frontend/app/inventory/categories/page.tsx
// ============================================================================
"use client";
import { useEffect, useState, useCallback } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import { categoriesApi } from '@/lib/api/categories';
import { macroCategoriesApi } from '@/lib/api/macro-categories';
import { Category, MacroCategory, CreateCategoryDto } from '@/lib/api/types';
 
const EMPTY_FORM: CreateCategoryDto = { macroCategoryId: '', code: '', name: '', description: '', isActive: true };
 
function CategoryModal({ open, onClose, onSaved, initial, macroCategories }: {
  open: boolean; onClose: () => void; onSaved: () => void;
  initial: Category | null; macroCategories: MacroCategory[];
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
 
  useEffect(() => {
    if (open) {
      setError('');
      setForm(initial ? {
        macroCategoryId: initial.macroCategoryId,
        code: initial.code, name: initial.name,
        description: initial.description ?? '', isActive: initial.isActive,
        inventoryAccountId: initial.inventoryAccountId, cogsAccountId: initial.cogsAccountId,
      } : EMPTY_FORM);
    }
  }, [open, initial]);
 
  const set = (k: keyof CreateCategoryDto) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));
 
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.macroCategoryId || !form.code.trim() || !form.name.trim()) { setError('Macro category, code and name are required'); return; }
    setSubmitting(true); setError('');
    try {
      if (initial) await categoriesApi.update(initial.id, form);
      else          await categoriesApi.create(form);
      onSaved(); onClose();
    } catch (err: any) { setError(err?.response?.data?.message ?? 'Operation failed'); }
    finally { setSubmitting(false); }
  };
 
  if (!open) return null;
  return (
    <>
      <style>{`.catm-overlay{position:fixed;inset:0;z-index:400;background:rgba(0,0,0,0.65);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:24px}.catm-box{background:#0e0b1a;border:0.5px solid rgba(251,146,60,0.2);border-radius:14px;width:100%;max-width:500px;box-shadow:0 24px 60px rgba(0,0,0,0.7)}.catm-hdr{display:flex;align-items:center;justify-content:space-between;padding:14px 18px 12px;border-bottom:0.5px solid rgba(255,255,255,0.06)}.catm-title{font-size:13px;font-weight:500;color:#f1ede8}.catm-close{width:22px;height:22px;border-radius:6px;background:rgba(255,255,255,0.06);border:none;cursor:pointer;color:rgba(255,255,255,0.4);font-size:15px;display:flex;align-items:center;justify-content:center}.catm-body{padding:14px 18px;display:flex;flex-direction:column;gap:10px}.catm-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}.catm-field{display:flex;flex-direction:column;gap:5px}.catm-label{font-size:11px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;color:rgba(251,146,60,0.55)}.catm-input,.catm-select,.catm-textarea{background:rgba(255,255,255,0.04);border:0.5px solid rgba(255,255,255,0.1);border-radius:7px;padding:8px 12px;font-size:13px;font-family:'IBM Plex Sans',sans-serif;color:#f1ede8;outline:none;width:100%}.catm-input:focus,.catm-select:focus,.catm-textarea:focus{border-color:rgba(251,146,60,0.45)}.catm-select option{background:#0e0b1a}.catm-textarea{resize:vertical;min-height:56px}.catm-error{background:rgba(239,68,68,0.1);border:0.5px solid rgba(239,68,68,0.25);border-radius:7px;padding:7px 12px;font-size:12px;color:#fca5a5}.catm-ftr{display:flex;justify-content:flex-end;gap:8px;padding:10px 18px 16px;border-top:0.5px solid rgba(255,255,255,0.06)}.catm-btn-cancel{background:rgba(255,255,255,0.05);border:0.5px solid rgba(255,255,255,0.1);border-radius:7px;padding:7px 14px;font-size:12px;font-family:'IBM Plex Sans',sans-serif;color:rgba(255,255,255,0.45);cursor:pointer}.catm-btn-save{background:linear-gradient(135deg,#c2410c,#ea580c,#f97316);border:none;border-radius:7px;padding:7px 18px;font-size:12px;font-weight:500;font-family:'IBM Plex Sans',sans-serif;color:white;cursor:pointer}.catm-btn-save:disabled{opacity:0.5;cursor:not-allowed}`}</style>
      <div className="catm-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="catm-box">
          <div className="catm-hdr">
            <span className="catm-title">{initial ? 'Edit Category' : 'New Category'}</span>
            <button className="catm-close" onClick={onClose}>×</button>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="catm-body">
              {error && <div className="catm-error">{error}</div>}
              <div className="catm-field">
                <label className="catm-label">Macro Category *</label>
                <select className="catm-select" value={form.macroCategoryId} onChange={set('macroCategoryId')}>
                  <option value="">— Select macro category —</option>
                  {macroCategories.map(mc => <option key={mc.id} value={mc.id}>{mc.code} — {mc.name}</option>)}
                </select>
              </div>
              <div className="catm-row">
                <div className="catm-field">
                  <label className="catm-label">Code *</label>
                  <input className="catm-input" placeholder="FG-FURN" value={form.code} onChange={set('code')} />
                </div>
                <div className="catm-field">
                  <label className="catm-label">Name *</label>
                  <input className="catm-input" placeholder="Finished Furniture" value={form.name} onChange={set('name')} />
                </div>
              </div>
              <div className="catm-field">
                <label className="catm-label">Description</label>
                <textarea className="catm-textarea" placeholder="Optional…" value={form.description} onChange={set('description')} />
              </div>
            </div>
            <div className="catm-ftr">
              <button type="button" className="catm-btn-cancel" onClick={onClose}>Cancel</button>
              <button type="submit" className="catm-btn-save" disabled={submitting}>
                {submitting ? 'Saving…' : initial ? 'Save Changes' : 'Create'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
 
export default function CategoriesPage() {
  const [items,          setItems]          = useState<Category[]>([]);
  const [macroCategories, setMacroCategories] = useState<MacroCategory[]>([]);
  const [loading,        setLoading]        = useState(true);
  const [error,          setError]          = useState('');
  const [search,         setSearch]         = useState('');
  const [filterMacro,    setFilterMacro]    = useState('');
  const [modalOpen,      setModalOpen]      = useState(false);
  const [editing,        setEditing]        = useState<Category | null>(null);
 
  const fetch_ = useCallback(async () => {
    try {
      setLoading(true);
      const [cats, mcs] = await Promise.all([categoriesApi.getAll(), macroCategoriesApi.getAll()]);
      setItems(cats); setMacroCategories(mcs);
    } catch { setError('Failed to load categories'); }
    finally { setLoading(false); }
  }, []);
 
  useEffect(() => { fetch_(); }, [fetch_]);
 
  const filtered = items.filter(c => {
    if (filterMacro && c.macroCategoryId !== filterMacro) return false;
    if (search) {
      const q = search.toLowerCase();
      return c.code.toLowerCase().includes(q) || c.name.toLowerCase().includes(q);
    }
    return true;
  });
 
  return (
    <ERPShell breadcrumbs={['Home', 'Inventory', 'Categories']} title="Categories">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap');
        .catp-page{padding:0 18px 24px}.catp-toolbar{display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap}.catp-search{background:rgba(255,255,255,0.04);border:0.5px solid rgba(255,255,255,0.09);border-radius:7px;padding:7px 12px;font-size:12px;font-family:'IBM Plex Sans',sans-serif;color:#e2dfd8;outline:none;width:220px}.catp-search:focus{border-color:rgba(251,146,60,0.4)}.catp-select{background:rgba(255,255,255,0.04);border:0.5px solid rgba(255,255,255,0.09);border-radius:7px;padding:7px 12px;font-size:12px;font-family:'IBM Plex Sans',sans-serif;color:#e2dfd8;outline:none;cursor:pointer}.catp-select option{background:#0e0b1a}.catp-btn-new{margin-left:auto;display:flex;align-items:center;gap:6px;background:linear-gradient(135deg,#c2410c,#ea580c,#f97316);border:none;border-radius:7px;padding:7px 14px;font-size:12px;font-weight:500;font-family:'IBM Plex Sans',sans-serif;color:white;cursor:pointer;box-shadow:0 3px 12px rgba(234,88,12,0.3);transition:opacity 0.15s}.catp-btn-new:hover{opacity:0.88}.catp-wrap{background:rgba(10,7,18,0.7);border:0.5px solid rgba(251,146,60,0.12);border-radius:10px;overflow:hidden}.catp-table{width:100%;border-collapse:collapse}.catp-table thead th{padding:9px 14px;font-size:10px;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;color:rgba(251,146,60,0.55);background:rgba(251,146,60,0.05);border-bottom:0.5px solid rgba(255,255,255,0.06);text-align:left}.catp-table tbody td{padding:10px 14px;border-bottom:0.5px solid rgba(255,255,255,0.04);font-size:13px;vertical-align:middle}.catp-table tbody tr:last-child td{border-bottom:none}.catp-table tbody tr:hover td{background:rgba(251,146,60,0.03)}.catp-code{font-family:'IBM Plex Mono',monospace;font-size:12px;color:#fb923c}.catp-muted{color:rgba(255,255,255,0.4);font-size:12px}.catp-macro{display:inline-flex;align-items:center;padding:2px 8px;border-radius:20px;font-size:11px;font-weight:500;color:#a78bfa;background:rgba(167,139,250,0.1);border:0.5px solid rgba(167,139,250,0.25)}.catp-actions{display:flex;gap:6px}.catp-btn-edit{padding:4px 10px;border-radius:6px;font-size:11px;font-family:'IBM Plex Sans',sans-serif;cursor:pointer;background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.5);border:0.5px solid rgba(255,255,255,0.1)}.catp-btn-edit:hover{background:rgba(255,255,255,0.09)}.catp-empty,.catp-loading{text-align:center;padding:52px 24px;color:rgba(255,255,255,0.25);font-size:13px}.catp-footer{font-size:11px;color:rgba(255,255,255,0.22);padding:8px 14px;border-top:0.5px solid rgba(255,255,255,0.04)}.catp-error{background:rgba(239,68,68,0.08);border:0.5px solid rgba(239,68,68,0.2);border-radius:8px;padding:9px 14px;margin-bottom:14px;font-size:12px;color:#fca5a5}
      `}</style>
      <div className="catp-page">
        {error && <div className="catp-error">{error}</div>}
        <div className="catp-toolbar">
          <input className="catp-search" placeholder="Search code or name…" value={search} onChange={e => setSearch(e.target.value)} />
          <select className="catp-select" value={filterMacro} onChange={e => setFilterMacro(e.target.value)}>
            <option value="">All macro categories</option>
            {macroCategories.map(mc => <option key={mc.id} value={mc.id}>{mc.code} — {mc.name}</option>)}
          </select>
          <button className="catp-btn-new" onClick={() => { setEditing(null); setModalOpen(true); }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><line x1="6" y1="1" x2="6" y2="11"/><line x1="1" y1="6" x2="11" y2="6"/></svg>
            New Category
          </button>
        </div>
        <div className="catp-wrap">
          {loading ? <div className="catp-loading">Loading…</div>
          : filtered.length === 0 ? <div className="catp-empty">{search || filterMacro ? 'No results.' : 'No categories yet.'}</div>
          : (
            <>
              <table className="catp-table">
                <thead><tr><th>Code</th><th>Name</th><th>Macro Category</th><th>Inventory Account</th><th>COGS Account</th><th>Items</th><th></th></tr></thead>
                <tbody>
                  {filtered.map(cat => (
                    <tr key={cat.id}>
                      <td><span className="catp-code">{cat.code}</span></td>
                      <td style={{ color: '#e2dfd8', fontWeight: 500 }}>{cat.name}</td>
                      <td><span className="catp-macro">{cat.macroCategory?.code}</span></td>
                      <td><span className="catp-muted">{cat.inventoryAccount?.accountNumber ?? '—'}</span></td>
                      <td><span className="catp-muted">{cat.cogsAccount?.accountNumber ?? '—'}</span></td>
                      <td><span style={{ fontSize: 12, color: 'rgba(251,146,60,0.7)' }}>{cat._count?.items ?? 0}</span></td>
                      <td>
                        <div className="catp-actions">
                          <button className="catp-btn-edit" onClick={() => { setEditing(cat); setModalOpen(true); }}>Edit</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="catp-footer">{filtered.length} of {items.length} categories</div>
            </>
          )}
        </div>
      </div>
      <CategoryModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={fetch_} initial={editing} macroCategories={macroCategories} />
    </ERPShell>
  );
}