// ============================================================================
// frontend/app/inventory/macro-categories/page.tsx
// spec-ux-t2-master-data T2.2 — ERPTable + ERPFilterBar + FormModal + ConfirmModal.
// ============================================================================
"use client";
import { useEffect, useState, useCallback, useMemo } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import { ERPTable, ERPColumn } from '@/components/ui/ERPTable';
import { ERPFilterBar, ERPFilter, useERPFilters, applyERPFilters } from '@/components/ui/ERPFilterBar';
import { FormModal } from '@/components/ui/modal/FormModal';
import { ConfirmModal } from '@/components/ui/modal/ConfirmModal';
import { macroCategoriesApi } from '@/lib/api/macro-categories';
import { MacroCategory, CreateMacroCategoryDto } from '@/lib/api/types';

const EMPTY: CreateMacroCategoryDto = { name: '', description: '', isActive: true };

const INP: React.CSSProperties = {
  background: 'var(--l04, rgba(255,255,255,0.04))', border: '0.5px solid var(--w10, rgba(255,255,255,0.1))',
  borderRadius: 7, padding: '9px 12px', fontSize: 13,
  fontFamily: "'IBM Plex Sans',sans-serif", color: 'var(--text-strong, #f1ede8)', outline: 'none', width: '100%',
};
const LBL: React.CSSProperties = {
  fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(251,146,60,0.6)',
};

// ── Create / edit modal (shared FormModal) ───────────────────────────────────
function MacroModal({ open, onClose, onSaved, initial }: {
  open: boolean; onClose: () => void; onSaved: () => void; initial: MacroCategory | null;
}) {
  const [form, setForm]             = useState<CreateMacroCategoryDto>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setForm(initial ? { name: initial.name, description: initial.description ?? '', isActive: initial.isActive } : EMPTY);
    }
  }, [open, initial]);

  const submit = async () => {
    if (!form.name.trim()) { setError('Name is required'); return; }
    setSubmitting(true); setError(null);
    try {
      if (initial) await macroCategoriesApi.update(initial.id, form);
      else         await macroCategoriesApi.create(form);
      onSaved(); onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Operation failed');
    } finally { setSubmitting(false); }
  };

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={initial ? `Edit — ${initial.code}` : 'New Macro Category'}
      submitLabel={initial ? 'Save Changes' : 'Create'}
      submitting={submitting}
      isValid={!!form.name.trim()}
      error={error}
      onSubmit={submit}
      width={460}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Code — system-assigned & immutable (spec-012) */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ ...LBL, color: 'rgba(251,146,60,0.5)' }}>Code</span>
          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, color: 'var(--accent-strong, #fb923c)', fontWeight: 500, background: 'rgba(251,146,60,0.08)', border: '0.5px solid rgba(251,146,60,0.2)', borderRadius: 6, padding: '3px 10px' }}>
            {initial?.code ?? 'Auto (MC-YYYY-NNNN)'}
          </span>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>auto-generated</span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={LBL}>Name *</label>
          <input style={INP} placeholder="Wood & Panels" value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={LBL}>Description</label>
          <textarea style={{ ...INP, resize: 'vertical', minHeight: 60 }} placeholder="Optional description…" value={form.description ?? ''}
            onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
        </div>
      </div>
    </FormModal>
  );
}

export default function MacroCategoriesPage() {
  const [items,    setItems]    = useState<MacroCategory[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing,  setEditing]  = useState<MacroCategory | null>(null);
  const [deleting, setDeleting] = useState<MacroCategory | null>(null);

  const fetch_ = useCallback(async () => {
    try { setLoading(true); setItems(await macroCategoriesApi.getAll()); }
    catch { setError('Failed to load macro categories'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  // ── Filters ────────────────────────────────────────────────────────────────
  const filterDefs = useMemo<ERPFilter<MacroCategory>[]>(() => [
    {
      key: 'search', label: 'Search', type: 'search', placeholder: 'Search code or name…',
      filterFn: (row, val) => {
        const q = String(val).toLowerCase();
        return row.code.toLowerCase().includes(q) || row.name.toLowerCase().includes(q);
      },
    },
    { key: 'isActive', label: 'Active only', type: 'boolean', placeholder: 'Active only', filterFn: (row, val) => val === true ? row.isActive : true },
  ], []);

  const { values: filterVals, setValue: setFilterVal, reset: resetFilters, activeCount: filterCount } = useERPFilters(filterDefs);
  const filtered = useMemo(() => applyERPFilters(items, filterDefs, filterVals), [items, filterDefs, filterVals]);

  // ── Columns ────────────────────────────────────────────────────────────────
  const columns = useMemo<ERPColumn<MacroCategory>[]>(() => [
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
      key: 'description', header: 'Description', sortable: false,
      value: r => r.description ?? '',
      render: r => <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{r.description || '—'}</span>,
    },
    {
      key: 'categories', header: 'Categories', width: 130, align: 'center', sortable: true,
      value: r => r._count?.categories ?? 0,
      render: r => <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 20, fontSize: 11, background: 'rgba(251,146,60,0.08)', color: 'rgba(251,146,60,0.7)', border: '0.5px solid rgba(251,146,60,0.2)' }}>{r._count?.categories ?? 0} categories</span>,
    },
    {
      key: 'isActive', header: 'Status', width: 100, sortable: true,
      value: r => r.isActive ? 'Active' : 'Inactive',
      render: r => (
        <span style={{ fontSize: 11, color: r.isActive ? 'var(--success, #4ade80)' : 'rgba(255,255,255,0.3)', background: r.isActive ? 'rgba(74,222,128,0.08)' : 'rgba(255,255,255,0.04)', border: `0.5px solid ${r.isActive ? 'rgba(74,222,128,0.2)' : 'rgba(255,255,255,0.08)'}`, padding: '2px 9px', borderRadius: 20 }}>
          {r.isActive ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      key: '_actions', header: '', width: 130, sortable: false,
      render: r => (
        <div style={{ display: 'flex', gap: 6 }}>
          <button onClick={e => { e.stopPropagation(); setEditing(r); setModalOpen(true); }}
            style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'var(--l05, rgba(255,255,255,0.05))', border: '0.5px solid var(--w10, rgba(255,255,255,0.1))', color: 'rgba(255,255,255,0.55)', fontFamily: "'IBM Plex Sans',sans-serif" }}>
            Edit
          </button>
          <button onClick={e => { e.stopPropagation(); setDeleting(r); }}
            style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.2)', color: 'var(--danger, #f87171)', fontFamily: "'IBM Plex Sans',sans-serif" }}>
            Delete
          </button>
        </div>
      ),
    },
  ], []);

  return (
    <ERPShell breadcrumbs={['Home', 'Inventory', 'Macro Categories']} title="Macro Categories">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap');
        .mcp-page{padding:0 18px 12px;display:flex;flex-direction:column;height:100%;overflow:hidden}
        .mcp-error{background:rgba(239,68,68,0.08);border:0.5px solid rgba(239,68,68,0.2);border-radius:8px;padding:9px 14px;margin-bottom:10px;font-size:12px;color:var(--danger-subtle, #fca5a5);flex-shrink:0}
        .mcp-btn-new{display:flex;align-items:center;gap:6px;background:linear-gradient(135deg,var(--accent-pressed, #c2410c),var(--accent, #ea580c),var(--accent-mid, #f97316));border:none;border-radius:7px;padding:7px 14px;font-size:12px;font-weight:500;font-family:'IBM Plex Sans',sans-serif;color:white;cursor:pointer;box-shadow:0 3px 12px rgba(234,88,12,0.3);transition:opacity 0.15s;flex-shrink:0;align-self:flex-end}
        .mcp-btn-new:hover{opacity:0.88}
      `}</style>

      <div className="mcp-page">
        {error && <div className="mcp-error">{error}</div>}

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 10, flexShrink: 0, flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}>
            <ERPFilterBar filters={filterDefs} values={filterVals} onChange={setFilterVal} onReset={resetFilters} activeCount={filterCount} />
          </div>
          <button className="mcp-btn-new" onClick={() => { setEditing(null); setModalOpen(true); }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><line x1="6" y1="1" x2="6" y2="11"/><line x1="1" y1="6" x2="11" y2="6"/></svg>
            New Macro Category
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <ERPTable<MacroCategory>
            columns={columns}
            data={filtered}
            rowKey={r => r.id}
            loading={loading}
            exportFilename="macro-categories"
            emptyMessage={filterCount ? 'No macro categories match your filters.' : 'No macro categories yet.'}
            defaultPageSize={25}
            maxHeight="100%"
          />
        </div>
      </div>

      <MacroModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={fetch_} initial={editing} />

      <ConfirmModal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete macro category?"
        description={deleting ? `${deleting.name} (${deleting.code}) will be soft-deleted.` : ''}
        variant="destructive"
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!deleting) return;
          if ((deleting._count?.categories ?? 0) > 0) {
            throw new Error(`This macro category has ${deleting._count?.categories} categories — delete them first.`);
          }
          await macroCategoriesApi.remove(deleting.id);
          setDeleting(null);
          fetch_();
        }}
      />
    </ERPShell>
  );
}
