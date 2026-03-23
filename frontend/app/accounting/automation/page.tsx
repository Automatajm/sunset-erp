"use client";
import { useEffect, useState, useCallback } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import { automationApi } from '@/lib/api/automation';

interface AutomationConfig {
  id: string; module: string; mode: string; isEnabled: boolean; notes?: string; updatedAt: string;
}

const MODULE_LABELS: Record<string, { label: string; description: string; color: string }> = {
  ar_invoice:           { label: 'AR Invoice',           description: 'JE when invoice is sent to customer',             color: '#60a5fa' },
  ar_payment:           { label: 'AR Payment',           description: 'JE when payment is received on invoice',          color: '#60a5fa' },
  ar_reversal:          { label: 'AR Reversal',          description: 'JE when invoice is voided',                       color: '#f87171' },
  fg_delivery:          { label: 'FG Delivery',          description: 'JE when finished goods are delivered from MO',    color: '#4ade80' },
  production_variance:  { label: 'Production Variance',  description: 'JE when merma or surplus variance is posted',     color: '#fbbf24' },
  po_receipt:           { label: 'PO Receipt',           description: 'JE when purchase order is received (future)',     color: '#a78bfa' },
  mo_issue:             { label: 'MO Material Issue',    description: 'JE when materials are issued to production (future)', color: '#a78bfa' },
};

const MODE_OPTIONS = [
  { value: 'full_auto',       label: 'Full Auto',       desc: 'Post JE immediately',          color: '#4ade80' },
  { value: 'review_required', label: 'Review Required', desc: 'Draft + finance queue',        color: '#fbbf24' },
  { value: 'manual',          label: 'Manual',          desc: 'No auto-JE — finance posts',   color: '#f87171' },
];

const MONO: React.CSSProperties = { fontFamily: "'IBM Plex Mono',monospace", fontSize: 12 };
const INPUT: React.CSSProperties = { background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '7px 10px', fontSize: 12, fontFamily: "'IBM Plex Sans',sans-serif", color: '#f1ede8', outline: 'none', width: '100%' };

export default function AutomationConfigPage() {
  const [configs, setConfigs]   = useState<AutomationConfig[]>([]);
  const [loading, setLoading]   = useState(true);
  const [saving,  setSaving]    = useState<string | null>(null);
  const [error,   setError]     = useState('');
  const [success, setSuccess]   = useState('');

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
      setSuccess(`${MODULE_LABELS[module]?.label ?? module} updated to ${mode.replace('_', ' ')}`);
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

  const modeStyle = (mode: string): React.CSSProperties => {
    const opt = MODE_OPTIONS.find(o => o.value === mode);
    return { color: opt?.color ?? '#e2dfd8', background: `${opt?.color ?? '#e2dfd8'}15`, border: `0.5px solid ${opt?.color ?? '#e2dfd8'}30`, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500 };
  };

  return (
    <ERPShell breadcrumbs={['Home', 'Financial', 'Automation Config']} title="Automation Engine Config">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap');
        .auto-page { padding: 0 18px 24px; }
        .auto-desc { font-size: 12px; color: rgba(255,255,255,0.35); margin-bottom: 16px; line-height: 1.6; }
        .auto-wrap { background:rgba(10,7,18,0.7); border:0.5px solid rgba(251,146,60,0.12); border-radius:10px; overflow:hidden; }
        .auto-table { width:100%; border-collapse:collapse; }
        .auto-table thead th { padding:9px 16px; font-size:10px; font-weight:500; letter-spacing:0.1em; text-transform:uppercase; color:rgba(251,146,60,0.55); background:rgba(251,146,60,0.05); border-bottom:0.5px solid rgba(255,255,255,0.06); text-align:left; white-space:nowrap; }
        .auto-table tbody td { padding:12px 16px; border-bottom:0.5px solid rgba(255,255,255,0.04); vertical-align:middle; }
        .auto-table tbody tr:last-child td { border-bottom:none; }
        .auto-table tbody tr:hover td { background:rgba(251,146,60,0.02); }
        .auto-loading { text-align:center; padding:52px; color:rgba(255,255,255,0.25); font-size:13px; }
        .mode-btn { padding:5px 10px; border-radius:6px; font-size:11px; font-family:'IBM Plex Sans',sans-serif; cursor:pointer; transition:all 0.15s; border:0.5px solid transparent; }
      `}</style>

      <div className="auto-page">
        <p className="auto-desc">
          Configure how each module creates Journal Entries automatically. Changes apply immediately to new events — existing JEs are not affected.
        </p>

        {error   && <div style={{ background:'rgba(239,68,68,0.08)', border:'0.5px solid rgba(239,68,68,0.2)', borderRadius:8, padding:'8px 14px', marginBottom:12, fontSize:12, color:'#fca5a5' }}>{error}</div>}
        {success && <div style={{ background:'rgba(74,222,128,0.08)', border:'0.5px solid rgba(74,222,128,0.2)', borderRadius:8, padding:'8px 14px', marginBottom:12, fontSize:12, color:'#4ade80' }}>✓ {success}</div>}

        {/* Legend */}
        <div style={{ display:'flex', gap:16, marginBottom:14, flexWrap:'wrap' }}>
          {MODE_OPTIONS.map(opt => (
            <div key={opt.value} style={{ display:'flex', alignItems:'center', gap:6, fontSize:11 }}>
              <span style={{ ...modeStyle(opt.value) }}>{opt.label}</span>
              <span style={{ color:'rgba(255,255,255,0.3)' }}>{opt.desc}</span>
            </div>
          ))}
        </div>

        <div className="auto-wrap">
          {loading ? <div className="auto-loading">Loading…</div> : (
            <table className="auto-table">
              <thead>
                <tr>{['Module', 'Description', 'Mode', 'Change Mode', 'Enabled', 'Last Updated'].map(h => <th key={h}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {configs.map(cfg => {
                  const meta   = MODULE_LABELS[cfg.module];
                  const isBusy = saving === cfg.module;
                  return (
                    <tr key={cfg.module}>
                      <td>
                        <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
                          <span style={{ fontSize:13, fontWeight:500, color: meta?.color ?? '#e2dfd8' }}>{meta?.label ?? cfg.module}</span>
                          <span style={{ ...MONO, fontSize:10, color:'rgba(255,255,255,0.25)' }}>{cfg.module}</span>
                        </div>
                      </td>
                      <td><span style={{ fontSize:12, color:'rgba(255,255,255,0.4)' }}>{meta?.description ?? '—'}</span></td>
                      <td><span style={modeStyle(cfg.mode)}>{MODE_OPTIONS.find(o => o.value === cfg.mode)?.label ?? cfg.mode}</span></td>
                      <td>
                        <div style={{ display:'flex', gap:4 }}>
                          {MODE_OPTIONS.map(opt => (
                            <button
                              key={opt.value}
                              className="mode-btn"
                              disabled={isBusy}
                              onClick={() => handleModeChange(cfg.module, opt.value)}
                              style={{
                                color:       cfg.mode === opt.value ? opt.color : 'rgba(255,255,255,0.35)',
                                background:  cfg.mode === opt.value ? `${opt.color}18` : 'rgba(255,255,255,0.03)',
                                borderColor: cfg.mode === opt.value ? `${opt.color}40` : 'rgba(255,255,255,0.08)',
                                opacity:     isBusy ? 0.5 : 1,
                              }}
                            >
                              {isBusy && cfg.mode !== opt.value ? '…' : opt.label}
                            </button>
                          ))}
                        </div>
                      </td>
                      <td>
                        <button
                          onClick={() => handleToggle(cfg.module, !cfg.isEnabled)}
                          disabled={isBusy}
                          style={{
                            padding:'4px 10px', borderRadius:20, fontSize:11, cursor:'pointer',
                            fontFamily:"'IBM Plex Sans',sans-serif", fontWeight:500,
                            color:       cfg.isEnabled ? '#4ade80' : 'rgba(255,255,255,0.3)',
                            background:  cfg.isEnabled ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.05)',
                            border:      `0.5px solid ${cfg.isEnabled ? 'rgba(74,222,128,0.2)' : 'rgba(255,255,255,0.1)'}`,
                            opacity: isBusy ? 0.5 : 1,
                          }}
                        >
                          {cfg.isEnabled ? 'Enabled' : 'Disabled'}
                        </button>
                      </td>
                      <td>
                        <span style={{ fontSize:11, color:'rgba(255,255,255,0.25)' }}>
                          {new Date(cfg.updatedAt).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' })}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </ERPShell>
  );
}