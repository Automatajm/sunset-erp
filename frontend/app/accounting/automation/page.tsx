"use client";
import { useEffect, useState, useCallback } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import { automationApi } from '@/lib/api/automation';

interface AutomationConfig {
  id: string; module: string; mode: string; isEnabled: boolean; notes?: string; updatedAt: string;
}

// ─── Module registry with parent grouping ─────────────────────────────────────

const MODULE_REGISTRY: Record<string, {
  label: string; description: string; color: string; group: string; groupColor: string;
}> = {
  ar_invoice:          { label: 'AR Invoice',          description: 'JE when invoice is sent to customer',                   color: 'var(--accent-blue)', group: 'Accounts Receivable', groupColor: 'var(--accent-blue)' },
  ar_payment:          { label: 'AR Payment',          description: 'JE when payment is received on invoice',                color: 'var(--accent-blue)', group: 'Accounts Receivable', groupColor: 'var(--accent-blue)' },
  ar_reversal:         { label: 'AR Reversal',         description: 'JE when invoice is voided',                             color: 'var(--danger)', group: 'Accounts Receivable', groupColor: 'var(--accent-blue)' },
  ap_invoice:          { label: 'AP Invoice',          description: 'JE when AP invoice is posted (Inventory DR / AP CR)',   color: 'var(--accent-violet)', group: 'Accounts Payable',    groupColor: 'var(--accent-violet)' },
  ap_payment:          { label: 'AP Payment',          description: 'JE when supplier payment is applied (AP DR / Cash CR)', color: 'var(--accent-violet)', group: 'Accounts Payable',    groupColor: 'var(--accent-violet)' },
  ap_reversal:         { label: 'AP Reversal',         description: 'JE when AP invoice is voided',                         color: 'var(--danger)', group: 'Accounts Payable',    groupColor: 'var(--accent-violet)' },
  fg_delivery:         { label: 'FG Delivery',         description: 'JE when finished goods are delivered from MO',         color: 'var(--success)', group: 'Manufacturing',        groupColor: 'var(--success)' },
  production_variance: { label: 'Production Variance', description: 'JE when merma or surplus variance is posted',          color: 'var(--warning)', group: 'Manufacturing',        groupColor: 'var(--success)' },
  po_receipt:          { label: 'PO Receipt',          description: 'JE when purchase order is received',                   color: 'var(--accent-strong)', group: 'Procurement',          groupColor: 'var(--accent-strong)' },
  mo_issue:            { label: 'MO Material Issue',   description: 'JE when materials are issued to production',           color: 'var(--accent-strong)', group: 'Procurement',          groupColor: 'var(--accent-strong)' },
};

const GROUP_ORDER = ['Accounts Receivable', 'Accounts Payable', 'Procurement', 'Manufacturing'];

const MODE_OPTIONS = [
  { value: 'full_auto',       label: 'Full Auto',       desc: 'Post JE immediately',        color: 'var(--success)' },
  { value: 'review_required', label: 'Review Required', desc: 'Draft + finance queue',      color: 'var(--warning)' },
  { value: 'manual',          label: 'Manual',          desc: 'No auto-JE — finance posts', color: 'var(--danger)' },
];

const MONO: React.CSSProperties = { fontFamily: "'IBM Plex Mono',monospace", fontSize: 11 };

function modeStyle(mode: string): React.CSSProperties {
  const opt = MODE_OPTIONS.find(o => o.value === mode);
  return {
    color: opt?.color ?? 'var(--text-primary)',
    background: `${opt?.color ?? 'var(--text-primary)'}15`,
    border: `0.5px solid ${opt?.color ?? 'var(--text-primary)'}35`,
    padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500,
    display: 'inline-flex', alignItems: 'center', gap: 4,
  };
}

// ─── Group tree node ──────────────────────────────────────────────────────────

function GroupNode({
  groupName, groupColor, configs, saving,
  onModeChange, onToggle, searchQuery,
}: {
  groupName: string; groupColor: string;
  configs: AutomationConfig[];
  saving: string | null;
  onModeChange: (module: string, mode: string) => void;
  onToggle: (module: string, enabled: boolean) => void;
  searchQuery: string;
}) {
  const [expanded, setExpanded] = useState(true);

  // Filter modules within this group
  const visible = configs.filter(cfg => {
    if (!searchQuery) return true;
    const meta = MODULE_REGISTRY[cfg.module];
    const q = searchQuery.toLowerCase();
    return (
      cfg.module.toLowerCase().includes(q) ||
      (meta?.label ?? '').toLowerCase().includes(q) ||
      (meta?.description ?? '').toLowerCase().includes(q)
    );
  });

  if (visible.length === 0) return null;

  const allAuto    = visible.every(c => c.mode === 'full_auto');
  const allEnabled = visible.every(c => c.isEnabled);
  const anyBusy    = visible.some(c => saving === c.module);

  return (
    <div style={{ marginBottom: 6 }}>
      {/* Group header */}
      <div
        onClick={() => setExpanded(e => !e)}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '8px 14px', cursor: 'pointer',
          background: `color-mix(in srgb, ${groupColor} 3%, transparent)`,
          borderTop: `0.5px solid color-mix(in srgb, ${groupColor} 13%, transparent)`,
          borderBottom: expanded ? `0.5px solid color-mix(in srgb, ${groupColor} 8%, transparent)` : `0.5px solid color-mix(in srgb, ${groupColor} 13%, transparent)`,
          transition: 'background 0.15s',
          userSelect: 'none',
        }}
      >
        {/* Chevron */}
        <svg
          width="10" height="10" viewBox="0 0 10 10" fill="none"
          style={{ flexShrink: 0, transition: 'transform 0.2s', transform: expanded ? 'rotate(90deg)' : 'none' }}
        >
          <path d="M3 2L7 5L3 8" stroke={groupColor} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>

        {/* Dot */}
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: groupColor, flexShrink: 0, boxShadow: `0 0 6px color-mix(in srgb, ${groupColor} 50%, transparent)` }} />

        {/* Name */}
        <span style={{ fontSize: 12, fontWeight: 600, color: groupColor, letterSpacing: '0.04em', flex: 1 }}>
          {groupName}
        </span>

        {/* Count badge */}
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.06)', padding: '1px 7px', borderRadius: 10 }}>
          {visible.length} module{visible.length !== 1 ? 's' : ''}
        </span>

        {/* Group status summary */}
        <span style={{ fontSize: 10, color: allEnabled ? 'var(--success)' : 'rgba(255,255,255,0.25)', background: allEnabled ? 'rgba(74,222,128,0.08)' : 'rgba(255,255,255,0.04)', padding: '1px 7px', borderRadius: 10, border: `0.5px solid ${allEnabled ? 'rgba(74,222,128,0.2)' : 'rgba(255,255,255,0.08)'}` }}>
          {allEnabled ? 'All enabled' : 'Partially enabled'}
        </span>
      </div>

      {/* Module rows */}
      {expanded && (
        <div>
          {visible.map((cfg, i) => {
            const meta    = MODULE_REGISTRY[cfg.module];
            const isBusy  = saving === cfg.module;
            const isLast  = i === visible.length - 1;
            return (
              <div
                key={cfg.module}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '28px 200px 1fr auto auto auto',
                  alignItems: 'center', gap: 0,
                  padding: '10px 14px',
                  borderBottom: isLast ? 'none' : '0.5px solid rgba(255,255,255,0.03)',
                  background: 'rgba(0,0,0,0.15)',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'rgba(0,0,0,0.15)')}
              >
                {/* Tree line */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%' }}>
                  <div style={{ width: 1, height: '50%', background: `color-mix(in srgb, ${groupColor} 13%, transparent)`, position: 'absolute', transform: 'translateX(-50%)' }} />
                  <div style={{ width: 10, height: 1, background: `color-mix(in srgb, ${groupColor} 13%, transparent)`, marginLeft: 10 }} />
                </div>

                {/* Module label + code */}
                <div style={{ paddingLeft: 4 }}>
                  <div style={{ fontSize: 12, fontWeight: 500, color: meta?.color ?? 'var(--text-primary)' }}>
                    {meta?.label ?? cfg.module}
                  </div>
                  <div style={{ ...MONO, color: 'rgba(255,255,255,0.2)', marginTop: 2 }}>{cfg.module}</div>
                </div>

                {/* Description */}
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', paddingRight: 16 }}>
                  {meta?.description ?? '—'}
                </div>

                {/* Current mode badge */}
                <div style={{ marginRight: 12 }}>
                  <span style={modeStyle(cfg.mode)}>
                    <span style={{ width: 5, height: 5, borderRadius: '50%', background: MODE_OPTIONS.find(o => o.value === cfg.mode)?.color ?? 'var(--text-primary)', flexShrink: 0 }} />
                    {MODE_OPTIONS.find(o => o.value === cfg.mode)?.label ?? cfg.mode}
                  </span>
                </div>

                {/* Mode buttons */}
                <div style={{ display: 'flex', gap: 3, marginRight: 12 }}>
                  {MODE_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      disabled={isBusy}
                      onClick={() => onModeChange(cfg.module, opt.value)}
                      style={{
                        padding: '4px 8px', borderRadius: 5, fontSize: 10, cursor: 'pointer',
                        fontFamily: "'IBM Plex Sans',sans-serif",
                        color:       cfg.mode === opt.value ? opt.color : 'rgba(255,255,255,0.3)',
                        background:  cfg.mode === opt.value ? `color-mix(in srgb, ${opt.color} 9%, transparent)` : 'rgba(255,255,255,0.03)',
                        border:      `0.5px solid ${cfg.mode === opt.value ? opt.color + '40' : 'rgba(255,255,255,0.07)'}`,
                        opacity:     isBusy ? 0.5 : 1,
                        transition:  'all 0.15s',
                        whiteSpace:  'nowrap',
                      }}
                    >
                      {isBusy ? '…' : opt.label}
                    </button>
                  ))}
                </div>

                {/* Enable toggle */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button
                    onClick={() => onToggle(cfg.module, !cfg.isEnabled)}
                    disabled={isBusy}
                    style={{
                      padding: '4px 10px', borderRadius: 20, fontSize: 10, cursor: 'pointer',
                      fontFamily: "'IBM Plex Sans',sans-serif", fontWeight: 500,
                      color:      cfg.isEnabled ? 'var(--success)' : 'rgba(255,255,255,0.25)',
                      background: cfg.isEnabled ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.04)',
                      border:     `0.5px solid ${cfg.isEnabled ? 'rgba(74,222,128,0.2)' : 'rgba(255,255,255,0.08)'}`,
                      opacity:    isBusy ? 0.5 : 1,
                      transition: 'all 0.2s',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {cfg.isEnabled ? '● On' : '○ Off'}
                  </button>
                  <span style={{ ...MONO, fontSize: 10, color: 'rgba(255,255,255,0.18)', minWidth: 60 }}>
                    {new Date(cfg.updatedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function AutomationConfigPage() {
  const [configs,  setConfigs]  = useState<AutomationConfig[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState<string | null>(null);
  const [error,    setError]    = useState('');
  const [success,  setSuccess]  = useState('');
  const [search,   setSearch]   = useState('');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const fetchConfigs = useCallback(async () => {
    try {
      setLoading(true);
      const data = await automationApi.getConfigs();
      setConfigs(Array.isArray(data) ? data : []);
    } catch { setError('Failed to load configs'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchConfigs(); }, [fetchConfigs]);

  const handleModeChange = async (module: string, mode: string) => {
    setSaving(module); setError(''); setSuccess('');
    try {
      await automationApi.updateConfig(module, { mode });
      setConfigs(prev => prev.map(c => c.module === module ? { ...c, mode } : c));
      const label = MODULE_REGISTRY[module]?.label ?? module;
      setSuccess(`${label} → ${MODE_OPTIONS.find(o => o.value === mode)?.label}`);
      setTimeout(() => setSuccess(''), 3000);
    } catch { setError('Failed to update config'); }
    finally { setSaving(null); }
  };

  const handleToggle = async (module: string, isEnabled: boolean) => {
    const config = configs.find(c => c.module === module);
    if (!config) return;
    setSaving(module); setError('');
    try {
      await automationApi.updateConfig(module, { mode: config.mode, isEnabled });
      setConfigs(prev => prev.map(c => c.module === module ? { ...c, isEnabled } : c));
    } catch { setError('Failed to update'); }
    finally { setSaving(null); }
  };

  // Group configs by parent group
  const grouped = GROUP_ORDER.reduce((acc, groupName) => {
    acc[groupName] = configs.filter(cfg => MODULE_REGISTRY[cfg.module]?.group === groupName);
    return acc;
  }, {} as Record<string, AutomationConfig[]>);

  // Ungrouped fallback
  const ungrouped = configs.filter(cfg => !MODULE_REGISTRY[cfg.module]?.group);

  // Stats
  const totalEnabled = configs.filter(c => c.isEnabled).length;
  const totalAuto    = configs.filter(c => c.mode === 'full_auto').length;
  const totalReview  = configs.filter(c => c.mode === 'review_required').length;

  return (
    <ERPShell breadcrumbs={['Home', 'Financial', 'Automation Config']} title="Automation Engine">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap');
        .auto-page { padding: 0 18px 24px; }
        .auto-stats { display:flex; gap:8px; margin-bottom:14px; flex-wrap:wrap; }
        .auto-stat { background:rgba(10,7,18,0.7); border:0.5px solid rgba(255,255,255,0.08); border-radius:8px; padding:8px 14px; }
        .auto-stat-label { font-size:10px; font-weight:500; letter-spacing:0.08em; text-transform:uppercase; color:rgba(255,255,255,0.3); margin-bottom:3px; }
        .auto-stat-value { font-size:18px; font-weight:500; font-family:'IBM Plex Mono',monospace; }
        .auto-toolbar { display:flex; align-items:center; gap:10px; margin-bottom:14px; flex-wrap:wrap; }
        .auto-search { background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.09); border-radius:7px; padding:7px 12px; font-size:12px; font-family:'IBM Plex Sans',sans-serif; color:var(--text-primary); outline:none; width:260px; }
        .auto-search::placeholder { color:rgba(255,255,255,0.2); }
        .auto-search:focus { border-color:rgba(251,146,60,0.4); box-shadow:0 0 0 2px rgba(234,88,12,0.08); }
        .auto-toggle-all { background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.09); border-radius:7px; padding:6px 12px; font-size:11px; font-family:'IBM Plex Sans',sans-serif; color:rgba(255,255,255,0.45); cursor:pointer; transition:all 0.15s; }
        .auto-toggle-all:hover { background:rgba(255,255,255,0.08); color:rgba(255,255,255,0.7); }
        .auto-legend { display:flex; gap:14px; margin-bottom:14px; flex-wrap:wrap; }
        .auto-wrap { background:rgba(10,7,18,0.75); border:0.5px solid rgba(251,146,60,0.12); border-radius:10px; overflow:hidden; }
        .auto-tree-hdr { display:grid; grid-template-columns:28px 200px 1fr auto auto auto; gap:0; padding:7px 14px; font-size:10px; font-weight:500; letter-spacing:0.1em; text-transform:uppercase; color:rgba(251,146,60,0.45); background:rgba(251,146,60,0.04); border-bottom:0.5px solid rgba(255,255,255,0.06); }
        .auto-loading { text-align:center; padding:52px; color:rgba(255,255,255,0.25); font-size:13px; display:flex; align-items:center; justify-content:center; gap:10px; }
        .auto-spinner { width:16px; height:16px; border-radius:50%; border:2px solid rgba(251,146,60,0.2); border-top-color:var(--accent-strong); animation:auto-spin 0.7s linear infinite; }
        @keyframes auto-spin { to { transform:rotate(360deg); } }
      `}</style>

      <div className="auto-page">

        {/* Stats row */}
        {!loading && (
          <div className="auto-stats">
            {[
              { label: 'Total Modules',    value: configs.length,  color: 'var(--text-strong)' },
              { label: 'Enabled',          value: totalEnabled,    color: 'var(--success)' },
              { label: 'Full Auto',        value: totalAuto,       color: 'var(--success)' },
              { label: 'Review Required',  value: totalReview,     color: 'var(--warning)' },
              { label: 'Manual',           value: configs.length - totalAuto - totalReview, color: 'var(--danger)' },
            ].map(s => (
              <div key={s.label} className="auto-stat">
                <div className="auto-stat-label">{s.label}</div>
                <div className="auto-stat-value" style={{ color: s.color }}>{s.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Alerts */}
        {error   && <div style={{ background:'rgba(239,68,68,0.08)', border:'0.5px solid rgba(239,68,68,0.2)', borderRadius:8, padding:'8px 14px', marginBottom:12, fontSize:12, color:'var(--danger-subtle)' }}>{error}</div>}
        {success && <div style={{ background:'rgba(74,222,128,0.08)', border:'0.5px solid rgba(74,222,128,0.2)', borderRadius:8, padding:'8px 14px', marginBottom:12, fontSize:12, color:'var(--success)' }}>✓ {success}</div>}

        {/* Toolbar */}
        <div className="auto-toolbar">
          <input className="auto-search" placeholder="Search modules, descriptions…" value={search} onChange={e => setSearch(e.target.value)} />

          {/* Legend */}
          <div className="auto-legend" style={{ margin: 0 }}>
            {MODE_OPTIONS.map(opt => (
              <div key={opt.value} style={{ display:'flex', alignItems:'center', gap:5, fontSize:11 }}>
                <span style={modeStyle(opt.value)}>{opt.label}</span>
                <span style={{ color:'rgba(255,255,255,0.25)', fontSize:10 }}>{opt.desc}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Tree */}
        <div className="auto-wrap">
          {loading ? (
            <div className="auto-loading"><div className="auto-spinner" />Loading automation config…</div>
          ) : (
            <>
              {/* Column headers */}
              <div className="auto-tree-hdr">
                <div />
                <div>Module</div>
                <div>Description</div>
                <div style={{ paddingRight: 12 }}>Current</div>
                <div style={{ paddingRight: 12 }}>Change Mode</div>
                <div>Status / Updated</div>
              </div>

              {/* Groups */}
              {GROUP_ORDER.map(groupName => {
                const meta = MODULE_REGISTRY[configs.find(c => MODULE_REGISTRY[c.module]?.group === groupName)?.module ?? ''];
                const groupColor = meta?.groupColor ?? 'var(--accent-strong)';
                return (
                  <GroupNode
                    key={groupName}
                    groupName={groupName}
                    groupColor={groupColor}
                    configs={grouped[groupName] ?? []}
                    saving={saving}
                    onModeChange={handleModeChange}
                    onToggle={handleToggle}
                    searchQuery={search}
                  />
                );
              })}

              {/* Ungrouped fallback */}
              {ungrouped.length > 0 && (
                <GroupNode
                  groupName="Other"
                  groupColor="var(--text-secondary)"
                  configs={ungrouped}
                  saving={saving}
                  onModeChange={handleModeChange}
                  onToggle={handleToggle}
                  searchQuery={search}
                />
              )}
            </>
          )}
        </div>
      </div>
    </ERPShell>
  );
}