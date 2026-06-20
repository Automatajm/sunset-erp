// ============================================================================
// frontend/app/inventory/consumption-groups/page.tsx
// ============================================================================
"use client";

import { useEffect, useState, useCallback, useMemo } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import SearchSelect from '@/components/ui/SearchSelect';
import { ERPTable, ERPColumn } from '@/components/ui/ERPTable';
import { ERPFilterBar, ERPFilter, useERPFilters, applyERPFilters } from '@/components/ui/ERPFilterBar';
import { consumptionGroupsApi } from '@/lib/api/consumption-groups';
import { tenantSettingsApi } from '@/lib/api/tenant-settings';
import { ConsumptionGroup, UomUnit } from '@/lib/api/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SystemUoms {
  volume: UomUnit | null;
  mass:   UomUnit | null;
  length: UomUnit | null;
  area:   UomUnit | null;
  count:  UomUnit | null;
  list:   UomUnit[];
}

// ─── UOM type colors ──────────────────────────────────────────────────────────

const UOM_COLOR: Record<string, string> = {
  volume: 'var(--accent-blue, #60a5fa)', mass: 'var(--accent-violet, #a78bfa)', count: 'var(--success, #4ade80)',
  length: 'var(--warning, #fbbf24)', area: 'var(--accent-strong, #fb923c)',
};

function UomBadge({ uom }: { uom?: UomUnit | null }) {
  if (!uom) return <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>—</span>;
  const color = UOM_COLOR[uom.type] ?? 'var(--text-primary, #e2dfd8)';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 500, color, background: `color-mix(in srgb, ${color} 8%, transparent)`, border: `0.5px solid color-mix(in srgb, ${color} 21%, transparent)` }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, flexShrink: 0 }} />
      {uom.code} — {uom.name}
    </span>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

interface CgForm {
  name: string; description: string;
  consumptionUomId: string; isActive: boolean;
}

const EMPTY: CgForm = { name: '', description: '', consumptionUomId: '', isActive: true };

function CgModal({ open, onClose, onSaved, initial, systemUoms }: {
  open: boolean; onClose: () => void; onSaved: () => void;
  initial: ConsumptionGroup | null;
  systemUoms: SystemUoms;
}) {
  const [form,       setForm]       = useState<CgForm>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState('');

  useEffect(() => {
    if (open) {
      setError('');
      setForm(initial ? {
        name:             initial.name,
        description:      initial.description ?? '',
        consumptionUomId: initial.consumptionUomId ?? '',
        isActive:         initial.isActive,
      } : EMPTY);
    }
  }, [open, initial]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim() || !form.consumptionUomId) {
      setError('Name and Consumption UOM are required');
      return;
    }
    setSubmitting(true); setError('');
    try {
      if (initial) await consumptionGroupsApi.update(initial.id, form as any);
      else         await consumptionGroupsApi.create(form as any);
      onSaved(); onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Operation failed');
    } finally { setSubmitting(false); }
  };

  if (!open) return null;

  const selUom   = systemUoms.list.find(u => u.id === form.consumptionUomId);
  const uomOpts  = systemUoms.list.map(u => ({
    value:    u.id,
    label:    `${u.code} — ${u.name}`,
    sublabel: `${u.type} · system unit`,
  }));

  const INP: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.1)',
    borderRadius: 7, padding: '9px 12px', fontSize: 13,
    fontFamily: "'IBM Plex Sans',sans-serif", color: 'var(--text-strong, #f1ede8)', outline: 'none', width: '100%',
  };
  const LBL: React.CSSProperties = {
    fontSize: 11, fontWeight: 500, letterSpacing: '0.08em',
    textTransform: 'uppercase', color: 'rgba(251,146,60,0.6)',
  };

  return (
    <>
      <style>{`
        .cgm-overlay{position:fixed;inset:0;z-index:400;background:rgba(0,0,0,0.65);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:24px}
        .cgm-box{background:var(--surface, #0e0b1a);border:0.5px solid rgba(251,146,60,0.2);border-radius:14px;width:100%;max-width:520px;box-shadow:0 24px 60px rgba(0,0,0,0.7);position:relative}
        .cgm-box::before{content:'';position:absolute;top:0;left:30px;right:30px;height:1px;background:linear-gradient(90deg,transparent,rgba(251,146,60,0.4),transparent);pointer-events:none}
      `}</style>
      <div className="cgm-overlay">
        <div className="cgm-box">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 12px', borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-strong, #f1ede8)' }}>
              {initial ? `Edit — ${initial.code}` : 'New Consumption Group'}
            </span>
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {error && (
                <div style={{ background: 'rgba(239,68,68,0.1)', border: '0.5px solid rgba(239,68,68,0.25)', borderRadius: 7, padding: '8px 12px', fontSize: 12, color: 'var(--danger-subtle, #fca5a5)' }}>{error}</div>
              )}

              {/* Auto-code badge (edit mode only) */}
              {initial && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(251,146,60,0.5)' }}>Code</span>
                  <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, color: 'var(--accent-strong, #fb923c)', fontWeight: 500, background: 'rgba(251,146,60,0.08)', border: '0.5px solid rgba(251,146,60,0.2)', borderRadius: 6, padding: '3px 10px' }}>{initial.code}</span>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>auto-generated</span>
                </div>
              )}

              {/* Name */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={LBL}>Name *</label>
                <input style={INP} placeholder="Industrial Adhesives" value={form.name}
                  onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              </div>

              {/* Consumption UOM — restricted to system UOMs */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={LBL}>Consumption UOM *</label>
                <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', margin: 0, lineHeight: 1.5 }}>
                  Restricted to <strong style={{ color: 'var(--accent-strong, #fb923c)' }}>system UOMs</strong> configured in Settings → General.
                  MRP aggregates all items in this group to this unit.
                </p>

                {systemUoms.list.length === 0 ? (
                  <div style={{ background: 'rgba(251,191,36,0.07)', border: '0.5px solid rgba(251,191,36,0.2)', borderRadius: 7, padding: '10px 14px', fontSize: 12, color: 'rgba(251,191,36,0.8)', display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span>⚠</span>
                    <span>No system UOMs configured. Go to <strong>Settings → General</strong> and set at least one system UOM first.</span>
                  </div>
                ) : (
                  <>
                    <SearchSelect
                      options={uomOpts}
                      value={form.consumptionUomId}
                      onChange={v => setForm(f => ({ ...f, consumptionUomId: v }))}
                      placeholder="Search system UOM…"
                      clearLabel="— Select system UOM —"
                      minWidth={300}
                    />
                    {/* System UOM quick-select pills */}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 4 }}>
                      {systemUoms.list.map(u => {
                        const color   = UOM_COLOR[u.type] ?? 'var(--text-primary, #e2dfd8)';
                        const active  = form.consumptionUomId === u.id;
                        return (
                          <button key={u.id} type="button"
                            onClick={() => setForm(f => ({ ...f, consumptionUomId: u.id }))}
                            style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif", fontWeight: active ? 500 : 400, color: active ? color : 'rgba(255,255,255,0.4)', background: active ? `color-mix(in srgb, ${color} 9%, transparent)` : 'rgba(255,255,255,0.03)', border: `0.5px solid ${active ? `color-mix(in srgb, ${color} 31%, transparent)` : 'rgba(255,255,255,0.09)'}`, transition: 'all 0.15s' }}>
                            {u.code}
                            <span style={{ fontSize: 10, opacity: 0.6, marginLeft: 4 }}>{u.type}</span>
                          </button>
                        );
                      })}
                    </div>
                    {selUom && (
                      <div style={{ fontSize: 11, color: UOM_COLOR[selUom.type] ?? 'var(--text-primary, #e2dfd8)', display: 'flex', gap: 8, alignItems: 'center', marginTop: 2 }}>
                        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontWeight: 500 }}>{selUom.code}</span>
                        <span style={{ color: 'rgba(255,255,255,0.35)' }}>{selUom.name}</span>
                        <span style={{ color: 'rgba(255,255,255,0.2)' }}>{selUom.type} · {selUom.system}</span>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Description */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={LBL}>Description</label>
                <textarea
                  style={{ ...INP, resize: 'vertical', minHeight: 56 }}
                  placeholder="Optional description of this consumption group…"
                  value={form.description}
                  onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                />
              </div>

              {/* Active toggle */}
              {initial && (
                <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 12, color: form.isActive ? 'var(--text-primary, #e2dfd8)' : 'rgba(255,255,255,0.4)', userSelect: 'none' }}>
                  <div onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}
                    style={{ width: 32, height: 18, borderRadius: 9, flexShrink: 0, background: form.isActive ? 'rgba(234,88,12,0.8)' : 'rgba(255,255,255,0.1)', border: `0.5px solid ${form.isActive ? 'rgba(251,146,60,0.5)' : 'rgba(255,255,255,0.15)'}`, position: 'relative', transition: 'background 0.2s', cursor: 'pointer' }}>
                    <div style={{ position: 'absolute', top: 2, left: form.isActive ? 16 : 2, width: 13, height: 13, borderRadius: '50%', background: '#fff', transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
                  </div>
                  Active
                </label>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px 18px', borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
              <button type="button" onClick={onClose}
                style={{ background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '8px 16px', fontSize: 13, fontFamily: "'IBM Plex Sans',sans-serif", color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>
                Cancel
              </button>
              <button type="submit" disabled={submitting || systemUoms.list.length === 0}
                style={{ background: 'linear-gradient(135deg,var(--accent-pressed, #c2410c),var(--accent, #ea580c),var(--accent-mid, #f97316))', border: 'none', borderRadius: 7, padding: '8px 20px', fontSize: 13, fontWeight: 500, fontFamily: "'IBM Plex Sans',sans-serif", color: 'white', cursor: submitting ? 'not-allowed' : 'pointer', opacity: submitting || systemUoms.list.length === 0 ? 0.5 : 1, boxShadow: '0 3px 12px rgba(234,88,12,0.35)' }}>
                {submitting ? 'Saving…' : initial ? 'Save Changes' : 'Create Group'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ConsumptionGroupsPage() {
  const [groups,     setGroups]     = useState<ConsumptionGroup[]>([]);
  const [systemUoms, setSystemUoms] = useState<SystemUoms>({ volume: null, mass: null, length: null, area: null, count: null, list: [] });
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [modal,      setModal]      = useState(false);
  const [editing,    setEditing]    = useState<ConsumptionGroup | null>(null);
  const [activeType, setActiveType] = useState<string | null>(null);

  const fetch_ = useCallback(async () => {
    try {
      setLoading(true);
      const [cg, sys] = await Promise.all([
        consumptionGroupsApi.getAll(),
        tenantSettingsApi.getSystemUoms(),
      ]);
      setGroups(cg);
      setSystemUoms(sys as SystemUoms);
    } catch { setError('Failed to load'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  // ── Filters ────────────────────────────────────────────────────────────────

  const uomTypeOptions = useMemo(() =>
    systemUoms.list.map(u => ({
      value:  u.type,
      label:  `${u.code} (${u.type})`,
      color:  UOM_COLOR[u.type] ?? 'var(--text-primary, #e2dfd8)',
      bg:     `${UOM_COLOR[u.type] ?? 'var(--text-primary, #e2dfd8)'}15`,
      border: `${UOM_COLOR[u.type] ?? 'var(--text-primary, #e2dfd8)'}35`,
    })), [systemUoms.list]);

  const filterDefs = useMemo<ERPFilter<ConsumptionGroup>[]>(() => [
    {
      key: 'uomType', label: 'UOM Type', type: 'multiselect',
      options: uomTypeOptions,
      filterFn: (row, val) => {
        const arr = val as string[];
        return arr.includes((row as any).consumptionUom?.type ?? '');
      },
    },
    {
      key: 'isActive', label: 'Active only', type: 'boolean',
      placeholder: 'Active only',
      filterFn: (row, val) => val === true ? row.isActive : true,
    },
  ], [uomTypeOptions]);

  const { values: filterVals, setValue: setFilterVal, reset: resetFilters, activeCount: filterCount } = useERPFilters(filterDefs);

  const filtered = useMemo(() => {
    const base = applyERPFilters(groups, filterDefs, filterVals);
    return activeType ? base.filter(g => (g as any).consumptionUom?.type === activeType) : base;
  }, [groups, filterDefs, filterVals, activeType]);

  // ── Stats cards ────────────────────────────────────────────────────────────

  const statsByType = useMemo(() => {
    const map: Record<string, number> = {};
    groups.forEach(g => {
      const t = (g as any).consumptionUom?.type ?? 'unconfigured';
      map[t] = (map[t] ?? 0) + 1;
    });
    return map;
  }, [groups]);

  // ── Columns ────────────────────────────────────────────────────────────────

  const columns = useMemo<ERPColumn<ConsumptionGroup>[]>(() => [
    {
      key: 'code', header: 'Code', width: 120, sortable: true,
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
      key: 'consumptionUom', header: 'System UOM', width: 200, sortable: true,
      value: r => (r as any).consumptionUom?.code ?? '',
      render: r => <UomBadge uom={(r as any).consumptionUom} />,
    },
    {
      key: 'items', header: 'Items', width: 70, align: 'center', sortable: true,
      value: r => (r as any)._count?.items ?? 0,
      render: r => {
        const n = (r as any)._count?.items ?? 0;
        return <span style={{ fontSize: 12, fontFamily: "'IBM Plex Mono',monospace", color: n > 0 ? 'rgba(251,146,60,0.7)' : 'rgba(255,255,255,0.25)' }}>{n}</span>;
      },
    },
    {
      key: 'isActive', header: 'Status', width: 90, sortable: true,
      value: r => r.isActive ? 'Active' : 'Inactive',
      render: r => (
        <span style={{ fontSize: 11, color: r.isActive ? 'var(--success, #4ade80)' : 'rgba(255,255,255,0.3)', background: r.isActive ? 'rgba(74,222,128,0.08)' : 'rgba(255,255,255,0.04)', border: `0.5px solid ${r.isActive ? 'rgba(74,222,128,0.2)' : 'rgba(255,255,255,0.08)'}`, padding: '2px 9px', borderRadius: 20 }}>
          {r.isActive ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      key: '_actions', header: '', width: 80, sortable: false,
      render: r => (
        <button onClick={e => { e.stopPropagation(); setEditing(r); setModal(true); }}
          style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.55)', fontFamily: "'IBM Plex Sans',sans-serif" }}>
          Edit
        </button>
      ),
    },
  ], []);

  return (
    <ERPShell breadcrumbs={['Home', 'Inventory', 'Consumption Groups']} title="Consumption Groups">
      <style>{`.cgp-page{padding:0 18px 12px;display:flex;flex-direction:column;height:100%;gap:0;overflow:hidden}`}</style>

      <div className="cgp-page">

        {/* ── Stats cards ── */}
        {groups.length > 0 && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexShrink: 0, flexWrap: 'wrap' }}>
            {/* Total */}
            <div onClick={() => setActiveType(null)}
              style={{ background: !activeType ? 'rgba(251,146,60,0.08)' : 'rgba(10,7,18,0.7)', border: `0.5px solid ${!activeType ? 'rgba(251,146,60,0.3)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 8, padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 80, cursor: 'pointer' }}>
              <span style={{ fontSize: 10, color: 'rgba(251,146,60,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500 }}>Total</span>
              <span style={{ fontSize: 22, fontWeight: 500, color: 'var(--accent-strong, #fb923c)', fontFamily: "'IBM Plex Mono',monospace" }}>{groups.length}</span>
            </div>
            {/* By UOM type */}
            {systemUoms.list.map(u => {
              const count   = statsByType[u.type] ?? 0;
              const color   = UOM_COLOR[u.type] ?? 'var(--text-primary, #e2dfd8)';
              const isActive = activeType === u.type;
              return (
                <div key={u.type} onClick={() => setActiveType(prev => prev === u.type ? null : u.type)}
                  style={{ background: isActive ? `color-mix(in srgb, ${color} 7%, transparent)` : 'rgba(10,7,18,0.7)', border: `0.5px solid ${isActive ? color : 'rgba(255,255,255,0.07)'}`, borderRadius: 8, padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 90, cursor: 'pointer', transition: 'all 0.15s' }}>
                  <span style={{ fontSize: 10, color: isActive ? color : `color-mix(in srgb, ${color} 50%, transparent)`, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500 }}>{u.code}</span>
                  <span style={{ fontSize: 22, fontWeight: 500, color: isActive ? color : 'var(--text-strong, #f1ede8)', fontFamily: "'IBM Plex Mono',monospace" }}>{count}</span>
                </div>
              );
            })}
            {/* Unconfigured */}
            {(statsByType['unconfigured'] ?? 0) > 0 && (
              <div style={{ background: 'rgba(239,68,68,0.07)', border: '0.5px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 90 }}>
                <span style={{ fontSize: 10, color: 'rgba(248,113,113,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500 }}>No UOM</span>
                <span style={{ fontSize: 22, fontWeight: 500, color: 'var(--danger, #f87171)', fontFamily: "'IBM Plex Mono',monospace" }}>{statsByType['unconfigured']}</span>
              </div>
            )}
          </div>
        )}

        {/* ── System UOMs warning if not configured ── */}
        {systemUoms.list.length === 0 && !loading && (
          <div style={{ background: 'rgba(251,191,36,0.07)', border: '0.5px solid rgba(251,191,36,0.2)', borderRadius: 8, padding: '10px 16px', marginBottom: 10, fontSize: 12, color: 'rgba(251,191,36,0.8)', flexShrink: 0, display: 'flex', gap: 10, alignItems: 'center' }}>
            <span>⚠</span>
            <span>No system UOMs configured. Go to <strong>Settings → General</strong> to configure them before creating consumption groups.</span>
          </div>
        )}

        {error && (
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 10, fontSize: 13, color: 'var(--danger-subtle, #fca5a5)', flexShrink: 0 }}>{error}</div>
        )}

        {/* ── Toolbar ── */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 10, flexShrink: 0, flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}>
            <ERPFilterBar
              filters={filterDefs}
              values={filterVals}
              onChange={setFilterVal}
              onReset={() => { resetFilters(); setActiveType(null); }}
              activeCount={filterCount + (activeType ? 1 : 0)}
            />
          </div>
          <button onClick={() => { setEditing(null); setModal(true); }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'linear-gradient(135deg,var(--accent-pressed, #c2410c),var(--accent, #ea580c),var(--accent-mid, #f97316))', border: 'none', borderRadius: 7, padding: '7px 14px', fontSize: 12, fontWeight: 500, fontFamily: "'IBM Plex Sans',sans-serif", color: 'white', cursor: 'pointer', boxShadow: '0 3px 12px rgba(234,88,12,0.3)', flexShrink: 0, alignSelf: 'flex-end' }}>
            + New Group
          </button>
        </div>

        {/* ── Table ── */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <ERPTable<ConsumptionGroup>
            columns={columns}
            data={filtered}
            rowKey={r => r.id}
            loading={loading}
            exportFilename="consumption-groups"
            emptyMessage={filterCount || activeType ? 'No groups match your filters.' : 'No consumption groups yet.'}
            defaultPageSize={25}
            maxHeight="100%"
          />
        </div>
      </div>

      <CgModal
        open={modal}
        onClose={() => setModal(false)}
        onSaved={fetch_}
        initial={editing}
        systemUoms={systemUoms}
      />
    </ERPShell>
  );
}