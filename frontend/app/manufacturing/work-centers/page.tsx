"use client";
// ============================================================================
// frontend/app/manufacturing/work-centers/page.tsx
// spec-ux-t2-master-data T2.4 — ERPTable + ERPFilterBar + FormModal + SearchSelect + ConfirmModal.
// ============================================================================
import { useEffect, useState, useCallback, useMemo } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import SearchSelect from '@/components/ui/SearchSelect';
import { ERPTable, ERPColumn } from '@/components/ui/ERPTable';
import { ERPFilterBar, ERPFilter, useERPFilters, applyERPFilters } from '@/components/ui/ERPFilterBar';
import { FormModal } from '@/components/ui/modal/FormModal';
import { ConfirmModal } from '@/components/ui/modal/ConfirmModal';
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

const WC_TYPES = ['machine', 'labor', 'assembly', 'quality'] as const;
const WC_TYPE_COLOR: Record<string, string> = {
  machine: 'var(--accent-blue, #60a5fa)', labor: 'var(--success, #4ade80)', assembly: 'var(--accent-violet, #a78bfa)', quality: 'var(--warning, #fbbf24)',
};
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const INPUT: React.CSSProperties = { background:'var(--l04, rgba(255,255,255,0.04))', border:'0.5px solid var(--w10, rgba(255,255,255,0.1))', borderRadius:7, padding:'9px 12px', fontSize:13, fontFamily:"'IBM Plex Sans',sans-serif", color:'var(--text-strong, #f1ede8)', outline:'none', width:'100%' };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ display:'flex', flexDirection:'column', gap:5 }}><label style={{ fontSize:11, fontWeight:500, letterSpacing:'0.08em', textTransform:'uppercase' as const, color:'rgba(251,146,60,0.6)', fontFamily:"'IBM Plex Sans',sans-serif" }}>{label}</label>{children}</div>;
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display:'flex', alignItems:'center', gap:10, cursor:'pointer', fontSize:12, color: value ? 'var(--text-primary, #e2dfd8)' : 'rgba(255,255,255,0.4)', fontFamily:"'IBM Plex Sans',sans-serif", userSelect:'none', background:'rgba(255,255,255,0.03)', border:'0.5px solid rgba(255,255,255,0.07)', borderRadius:8, padding:'10px 14px' }}>
      <div onClick={() => onChange(!value)} style={{ width:32, height:18, borderRadius:9, flexShrink:0, cursor:'pointer', background: value ? 'rgba(234,88,12,0.8)' : 'rgba(255,255,255,0.1)', border:`0.5px solid ${value ? 'rgba(251,146,60,0.5)' : 'rgba(255,255,255,0.15)'}`, position:'relative', transition:'background 0.2s' }}>
        <div style={{ position:'absolute', top:2, left: value ? 16 : 2, width:13, height:13, borderRadius:'50%', background:'var(--white, #fff)', transition:'left 0.2s', boxShadow:'0 1px 3px rgba(0,0,0,0.3)' }} />
      </div>
      {label}
    </label>
  );
}

// ── Create / edit modal (shared FormModal) ───────────────────────────────────
function WCModal({ open, wc, onClose, onSaved }: { open: boolean; wc: WorkCenter | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ name: '', workCenterType: '' as WorkCenterType | '', capacityPerHour: '', efficiencyPercent: '', costPerHour: '', isActive: true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setForm({
        name: wc?.name ?? '', workCenterType: (wc?.workCenterType ?? '') as WorkCenterType | '',
        capacityPerHour: wc?.capacityPerHour?.toString() ?? '', efficiencyPercent: wc?.efficiencyPercent?.toString() ?? '',
        costPerHour: wc?.costPerHour?.toString() ?? '', isActive: wc?.isActive ?? true,
      });
    }
  }, [open, wc]);

  const submit = async () => {
    if (!form.name.trim()) { setError('Name required.'); return; }
    setBusy(true); setError(null);
    try {
      // Codes are system-assigned and immutable (spec-012) — never sent.
      const payload = { name: form.name, workCenterType: (form.workCenterType as WorkCenterType) || undefined, capacityPerHour: form.capacityPerHour ? Number(form.capacityPerHour) : undefined, efficiencyPercent: form.efficiencyPercent ? Number(form.efficiencyPercent) : undefined, costPerHour: form.costPerHour ? Number(form.costPerHour) : undefined, isActive: form.isActive };
      if (wc) await workCentersApi.update(wc.id, payload); else await workCentersApi.create(payload);
      onSaved(); onClose();
    } catch (err) { setError((err as {response?:{data?:{message?:string}}}).response?.data?.message || 'Failed.'); }
    finally { setBusy(false); }
  };

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={wc ? `Edit — ${wc.code}` : 'New Work Center'}
      submitLabel={wc ? 'Save Changes' : 'Create'}
      submitting={busy}
      isValid={!!form.name.trim()}
      error={error}
      onSubmit={submit}
      width={520}
    >
      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
          <Field label="Code"><input style={{ ...INPUT, opacity: 0.6 }} value={wc?.code ?? 'Auto (WC-YYYY-NNNN)'} disabled readOnly /></Field>
          <Field label="Type">
            <SearchSelect
              options={WC_TYPES.map(t => ({ value: t, label: cap(t) }))}
              value={form.workCenterType}
              onChange={v => setForm(f => ({ ...f, workCenterType: v as WorkCenterType | '' }))}
              placeholder="Select type…"
              clearLabel="— None —"
              minWidth={220}
            />
          </Field>
        </div>
        <Field label="Name *"><input style={INPUT} placeholder="Assembly Line 1" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} autoFocus /></Field>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
          <Field label="Capacity/hr"><input style={INPUT} type="number" min="0" placeholder="50" value={form.capacityPerHour} onChange={e => setForm(f => ({ ...f, capacityPerHour: e.target.value }))} /></Field>
          <Field label="Efficiency %"><input style={INPUT} type="number" min="0" max="100" placeholder="95" value={form.efficiencyPercent} onChange={e => setForm(f => ({ ...f, efficiencyPercent: e.target.value }))} /></Field>
          <Field label="Cost/hr ($)"><input style={INPUT} type="number" min="0" placeholder="75" value={form.costPerHour} onChange={e => setForm(f => ({ ...f, costPerHour: e.target.value }))} /></Field>
        </div>
        <Toggle label="Active" value={form.isActive} onChange={v => setForm(f => ({ ...f, isActive: v }))} />
      </div>
    </FormModal>
  );
}

export default function WorkCentersPage() {
  const [list, setList]       = useState<WorkCenter[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<WorkCenter | null>(null);
  const [deleting, setDeleting] = useState<WorkCenter | null>(null);

  const fetch = useCallback(async () => {
    try { setLoading(true); setList(extractList(await workCentersApi.getAll())); }
    catch (err) { setError(err instanceof Error ? err.message : 'Load failed.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch(); }, [fetch]);

  // ── Filters ────────────────────────────────────────────────────────────────
  const filterDefs = useMemo<ERPFilter<WorkCenter>[]>(() => [
    {
      key: 'search', label: 'Search', type: 'search', placeholder: 'Search code or name…',
      filterFn: (row, val) => {
        const q = String(val).toLowerCase();
        return row.code.toLowerCase().includes(q) || row.name.toLowerCase().includes(q);
      },
    },
    {
      key: 'workCenterType', label: 'Type', type: 'multiselect',
      options: WC_TYPES.map(t => ({ value: t, label: cap(t), color: WC_TYPE_COLOR[t] })),
    },
    { key: 'isActive', label: 'Active only', type: 'boolean', placeholder: 'Active only', filterFn: (row, val) => val === true ? row.isActive : true },
  ], []);

  const { values: filterVals, setValue: setFilterVal, reset: resetFilters, activeCount: filterCount } = useERPFilters(filterDefs);
  const filtered = useMemo(() => applyERPFilters(list, filterDefs, filterVals), [list, filterDefs, filterVals]);

  // ── Columns ────────────────────────────────────────────────────────────────
  const columns = useMemo<ERPColumn<WorkCenter>[]>(() => [
    {
      key: 'code', header: 'Code', width: 150, sortable: true,
      value: r => r.code,
      render: r => <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:12, color:'var(--accent-strong, #fb923c)' }}>{r.code}</span>,
    },
    {
      key: 'name', header: 'Name', sortable: true,
      value: r => r.name,
      render: r => <span style={{ color:'var(--text-primary, #e2dfd8)', fontWeight:500 }}>{r.name}</span>,
    },
    {
      key: 'workCenterType', header: 'Type', width: 120, sortable: true,
      value: r => r.workCenterType ?? '',
      render: r => r.workCenterType
        ? <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, background:'rgba(255,255,255,0.06)', border:'0.5px solid rgba(255,255,255,0.1)', color: WC_TYPE_COLOR[r.workCenterType] ?? 'var(--text-primary, #e2dfd8)' }}>{cap(r.workCenterType)}</span>
        : <span style={{ color:'rgba(255,255,255,0.25)' }}>—</span>,
    },
    {
      key: 'capacityPerHour', header: 'Capacity/hr', width: 120, align: 'right', sortable: true,
      value: r => r.capacityPerHour ?? 0,
      render: r => <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:12, color:'rgba(255,255,255,0.6)' }}>{r.capacityPerHour ?? '—'}</span>,
    },
    {
      key: 'efficiencyPercent', header: 'Efficiency', width: 110, align: 'right', sortable: true,
      value: r => r.efficiencyPercent ?? 0,
      render: r => <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:12, color:'rgba(255,255,255,0.6)' }}>{r.efficiencyPercent != null ? `${r.efficiencyPercent}%` : '—'}</span>,
    },
    {
      key: 'costPerHour', header: 'Cost/hr', width: 110, align: 'right', sortable: true,
      value: r => r.costPerHour ?? 0,
      render: r => <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:12, color:'rgba(255,255,255,0.6)' }}>{r.costPerHour != null ? `$${r.costPerHour}/hr` : '—'}</span>,
    },
    {
      key: 'isActive', header: 'Status', width: 100, sortable: true,
      value: r => r.isActive ? 'Active' : 'Inactive',
      render: r => <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, color: r.isActive ? 'var(--success, #4ade80)' : 'var(--danger, #f87171)', background: r.isActive ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)', border:`0.5px solid ${r.isActive ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)'}` }}>{r.isActive ? 'Active' : 'Inactive'}</span>,
    },
    {
      key: '_actions', header: '', width: 130, sortable: false,
      render: r => (
        <div style={{ display:'flex', gap:5 }}>
          <button onClick={e => { e.stopPropagation(); setEditing(r); setModalOpen(true); }} style={{ padding:'4px 9px', borderRadius:6, fontSize:11, cursor:'pointer', background:'rgba(255,255,255,0.05)', color:'rgba(255,255,255,0.55)', border:'0.5px solid rgba(255,255,255,0.1)', fontFamily:"'IBM Plex Sans',sans-serif" }}>Edit</button>
          <button onClick={e => { e.stopPropagation(); setDeleting(r); }} style={{ padding:'4px 9px', borderRadius:6, fontSize:11, cursor:'pointer', background:'rgba(239,68,68,0.08)', color:'var(--danger, #f87171)', border:'0.5px solid rgba(239,68,68,0.2)', fontFamily:"'IBM Plex Sans',sans-serif" }}>Delete</button>
        </div>
      ),
    },
  ], []);

  return (
    <ERPShell breadcrumbs={['Home', 'Manufacturing', 'Work Centers']} title="Work Centers">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap');
        .wc-page{padding:0 18px 12px;display:flex;flex-direction:column;height:100%;overflow:hidden}
        .wc-error{background:rgba(239,68,68,0.08);border:0.5px solid rgba(239,68,68,0.2);border-radius:8px;padding:10px 14px;margin-bottom:10px;font-size:13px;color:var(--danger-subtle, #fca5a5);flex-shrink:0}
        .wc-btn-new{display:flex;align-items:center;gap:6px;background:linear-gradient(135deg,var(--accent-pressed, #c2410c),var(--accent, #ea580c),var(--accent-mid, #f97316));border:none;border-radius:7px;padding:7px 14px;font-size:12px;font-weight:500;font-family:'IBM Plex Sans',sans-serif;color:white;cursor:pointer;box-shadow:0 3px 12px rgba(234,88,12,0.3);transition:opacity 0.15s;flex-shrink:0;align-self:flex-end}
        .wc-btn-new:hover{opacity:0.88}
        .wc-btn-new svg{width:13px;height:13px;display:block;flex-shrink:0}
      `}</style>

      <div className="wc-page">
        {error && <div className="wc-error">{error}</div>}

        <div style={{ display:'flex', alignItems:'flex-end', gap:10, marginBottom:10, flexShrink:0, flexWrap:'wrap' }}>
          <div style={{ flex: 1 }}>
            <ERPFilterBar filters={filterDefs} values={filterVals} onChange={setFilterVal} onReset={resetFilters} activeCount={filterCount} />
          </div>
          <button className="wc-btn-new" onClick={() => { setEditing(null); setModalOpen(true); }}>
            <svg viewBox="0 0 13 13" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><line x1="6.5" y1="1" x2="6.5" y2="12"/><line x1="1" y1="6.5" x2="12" y2="6.5"/></svg>
            New Work Center
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <ERPTable<WorkCenter>
            columns={columns}
            data={filtered}
            rowKey={r => r.id}
            loading={loading}
            exportFilename="work-centers"
            emptyMessage={filterCount ? 'No work centers match your filters.' : 'No work centers yet.'}
            defaultPageSize={25}
            maxHeight="100%"
          />
        </div>
      </div>

      <WCModal open={modalOpen} wc={editing} onClose={() => setModalOpen(false)} onSaved={fetch} />

      <ConfirmModal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete work center?"
        description={deleting ? `${deleting.name} (${deleting.code}) will be deleted.` : ''}
        variant="destructive"
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!deleting) return;
          await workCentersApi.remove(deleting.id);
          setDeleting(null);
          fetch();
        }}
      />
    </ERPShell>
  );
}
