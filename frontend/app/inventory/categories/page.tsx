// ============================================================================
// frontend/app/inventory/categories/page.tsx
// spec-ux-t2-master-data T2.3 — ERPTable + ERPFilterBar + FormModal + SearchSelect.
// ============================================================================
"use client";
import { useEffect, useState, useCallback, useMemo } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import SearchSelect from '@/components/ui/SearchSelect';
import { ERPTable, ERPColumn } from '@/components/ui/ERPTable';
import { ERPFilterBar, ERPFilter, useERPFilters, applyERPFilters } from '@/components/ui/ERPFilterBar';
import { FormModal } from '@/components/ui/modal/FormModal';
import { categoriesApi } from '@/lib/api/categories';
import { macroCategoriesApi } from '@/lib/api/macro-categories';
import { Category, MacroCategory, CreateCategoryDto } from '@/lib/api/types';

const EMPTY_FORM: CreateCategoryDto = { macroCategoryId: '', name: '', description: '', isActive: true };

const INP: React.CSSProperties = {
  background: 'var(--l04, rgba(255,255,255,0.04))', border: '0.5px solid var(--w10, rgba(255,255,255,0.1))',
  borderRadius: 7, padding: '9px 12px', fontSize: 13,
  fontFamily: "'IBM Plex Sans',sans-serif", color: 'var(--text-strong, #f1ede8)', outline: 'none', width: '100%',
};
const LBL: React.CSSProperties = {
  fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(251,146,60,0.6)',
};

// ── Create / edit modal (shared FormModal) ───────────────────────────────────
function CategoryModal({ open, onClose, onSaved, initial, macroCategories }: {
  open: boolean; onClose: () => void; onSaved: () => void;
  initial: Category | null; macroCategories: MacroCategory[];
}) {
  const [form, setForm]             = useState<CreateCategoryDto>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setForm(initial ? {
        macroCategoryId: initial.macroCategoryId,
        name: initial.name,
        description: initial.description ?? '', isActive: initial.isActive,
        inventoryAccountId: initial.inventoryAccountId, cogsAccountId: initial.cogsAccountId,
      } : EMPTY_FORM);
    }
  }, [open, initial]);

  const submit = async () => {
    if (!form.macroCategoryId || !form.name.trim()) { setError('Macro category and name are required'); return; }
    setSubmitting(true); setError(null);
    try {
      if (initial) await categoriesApi.update(initial.id, form);
      else         await categoriesApi.create(form);
      onSaved(); onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Operation failed');
    } finally { setSubmitting(false); }
  };

  const macroOpts = macroCategories.map(mc => ({ value: mc.id, label: `${mc.code} — ${mc.name}` }));

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={initial ? `Edit — ${initial.code}` : 'New Category'}
      submitLabel={initial ? 'Save Changes' : 'Create'}
      submitting={submitting}
      isValid={!!form.macroCategoryId && !!form.name.trim()}
      error={error}
      onSubmit={submit}
      width={500}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={LBL}>Macro Category *</label>
          <SearchSelect
            options={macroOpts}
            value={form.macroCategoryId}
            onChange={v => setForm(f => ({ ...f, macroCategoryId: v }))}
            placeholder="Search macro category…"
            clearLabel="— Select macro category —"
            minWidth={320}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={LBL}>Code</label>
            {/* Codes are system-assigned and immutable (spec-012) */}
            <input style={{ ...INP, opacity: 0.6 }} value={initial?.code ?? 'Auto (CAT-YYYY-NNNN)'} disabled readOnly />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <label style={LBL}>Name *</label>
            <input style={INP} placeholder="Finished Furniture" value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={LBL}>Description</label>
          <textarea style={{ ...INP, resize: 'vertical', minHeight: 56 }} placeholder="Optional…" value={form.description ?? ''}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
        </div>
      </div>
    </FormModal>
  );
}

export default function CategoriesPage() {
  const [items,           setItems]           = useState<Category[]>([]);
  const [macroCategories, setMacroCategories] = useState<MacroCategory[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [error,           setError]           = useState('');
  const [modalOpen,       setModalOpen]       = useState(false);
  const [editing,         setEditing]         = useState<Category | null>(null);

  const fetch_ = useCallback(async () => {
    try {
      setLoading(true);
      const [cats, mcs] = await Promise.all([categoriesApi.getAll(), macroCategoriesApi.getAll()]);
      setItems(cats); setMacroCategories(mcs);
    } catch { setError('Failed to load categories'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  // ── Filters ────────────────────────────────────────────────────────────────
  const filterDefs = useMemo<ERPFilter<Category>[]>(() => [
    {
      key: 'search', label: 'Search', type: 'search', placeholder: 'Search code or name…',
      filterFn: (row, val) => {
        const q = String(val).toLowerCase();
        return row.code.toLowerCase().includes(q) || row.name.toLowerCase().includes(q);
      },
    },
    {
      key: 'macroCategoryId', label: 'Macro Category', type: 'searchselect',
      placeholder: 'All macro categories',
      options: macroCategories.map(mc => ({ value: mc.id, label: `${mc.code} — ${mc.name}` })),
    },
  ], [macroCategories]);

  const { values: filterVals, setValue: setFilterVal, reset: resetFilters, activeCount: filterCount } = useERPFilters(filterDefs);
  const filtered = useMemo(() => applyERPFilters(items, filterDefs, filterVals), [items, filterDefs, filterVals]);

  // ── Columns ────────────────────────────────────────────────────────────────
  const columns = useMemo<ERPColumn<Category>[]>(() => [
    {
      key: 'code', header: 'Code', width: 150, sortable: true,
      value: r => r.code,
      render: r => <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: 'var(--accent-strong, #fb923c)', fontWeight: 500 }}>{r.code}</span>,
    },
    {
      key: 'name', header: 'Name', sortable: true,
      value: r => r.name,
      render: r => <span style={{ color: 'var(--text-primary, #e2dfd8)', fontWeight: 500 }}>{r.name}</span>,
    },
    {
      key: 'macroCategory', header: 'Macro Category', width: 160, sortable: true,
      value: r => r.macroCategory?.code ?? '',
      render: r => <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500, color: 'var(--accent-violet, #a78bfa)', background: 'rgba(167,139,250,0.1)', border: '0.5px solid rgba(167,139,250,0.25)' }}>{r.macroCategory?.code ?? '—'}</span>,
    },
    {
      key: 'inventoryAccount', header: 'Inventory Account', width: 160, sortable: false,
      value: r => r.inventoryAccount?.accountNumber ?? '',
      render: r => <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{r.inventoryAccount?.accountNumber ?? '—'}</span>,
    },
    {
      key: 'cogsAccount', header: 'COGS Account', width: 150, sortable: false,
      value: r => r.cogsAccount?.accountNumber ?? '',
      render: r => <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{r.cogsAccount?.accountNumber ?? '—'}</span>,
    },
    {
      key: 'items', header: 'Items', width: 80, align: 'center', sortable: true,
      value: r => r._count?.items ?? 0,
      render: r => <span style={{ fontSize: 12, fontFamily: "'IBM Plex Mono',monospace", color: (r._count?.items ?? 0) > 0 ? 'rgba(251,146,60,0.7)' : 'rgba(255,255,255,0.25)' }}>{r._count?.items ?? 0}</span>,
    },
    {
      key: '_actions', header: '', width: 80, sortable: false,
      render: r => (
        <button onClick={e => { e.stopPropagation(); setEditing(r); setModalOpen(true); }}
          style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'var(--l05, rgba(255,255,255,0.05))', border: '0.5px solid var(--w10, rgba(255,255,255,0.1))', color: 'rgba(255,255,255,0.55)', fontFamily: "'IBM Plex Sans',sans-serif" }}>
          Edit
        </button>
      ),
    },
  ], []);

  return (
    <ERPShell breadcrumbs={['Home', 'Inventory', 'Categories']} title="Categories">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap');
        .catp-page{padding:0 18px 12px;display:flex;flex-direction:column;height:100%;overflow:hidden}
        .catp-error{background:rgba(239,68,68,0.08);border:0.5px solid rgba(239,68,68,0.2);border-radius:8px;padding:9px 14px;margin-bottom:10px;font-size:12px;color:var(--danger-subtle, #fca5a5);flex-shrink:0}
        .catp-btn-new{display:flex;align-items:center;gap:6px;background:linear-gradient(135deg,var(--accent-pressed, #c2410c),var(--accent, #ea580c),var(--accent-mid, #f97316));border:none;border-radius:7px;padding:7px 14px;font-size:12px;font-weight:500;font-family:'IBM Plex Sans',sans-serif;color:white;cursor:pointer;box-shadow:0 3px 12px rgba(234,88,12,0.3);transition:opacity 0.15s;flex-shrink:0;align-self:flex-end}
        .catp-btn-new:hover{opacity:0.88}
      `}</style>

      <div className="catp-page">
        {error && <div className="catp-error">{error}</div>}

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 10, flexShrink: 0, flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}>
            <ERPFilterBar filters={filterDefs} values={filterVals} onChange={setFilterVal} onReset={resetFilters} activeCount={filterCount} />
          </div>
          <button className="catp-btn-new" onClick={() => { setEditing(null); setModalOpen(true); }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><line x1="6" y1="1" x2="6" y2="11"/><line x1="1" y1="6" x2="11" y2="6"/></svg>
            New Category
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <ERPTable<Category>
            columns={columns}
            data={filtered}
            rowKey={r => r.id}
            loading={loading}
            exportFilename="categories"
            emptyMessage={filterCount ? 'No categories match your filters.' : 'No categories yet.'}
            defaultPageSize={25}
            maxHeight="100%"
          />
        </div>
      </div>

      <CategoryModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={fetch_} initial={editing} macroCategories={macroCategories} />
    </ERPShell>
  );
}
