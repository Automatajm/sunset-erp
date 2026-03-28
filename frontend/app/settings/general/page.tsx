// ============================================================================
// frontend/app/settings/general/page.tsx
// ============================================================================
"use client";
import { useEffect, useState, useCallback } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import { tenantSettingsApi } from '@/lib/api/tenant-settings';
import { uomApi } from '@/lib/api/uom';
import { TenantSettings, UomUnit, UpdateTenantSettingsDto } from '@/lib/api/types';
 
export default function GeneralSettingsPage() {
  const [settings, setSettings]  = useState<TenantSettings | null>(null);
  const [units,    setUnits]     = useState<UomUnit[]>([]);
  const [form,     setForm]      = useState<UpdateTenantSettingsDto>({});
  const [loading,  setLoading]   = useState(true);
  const [saving,   setSaving]    = useState(false);
  const [success,  setSuccess]   = useState('');
  const [error,    setError]     = useState('');
 
  const fetch_ = useCallback(async () => {
    try {
      const [s, u] = await Promise.all([tenantSettingsApi.get(), uomApi.getUnits()]);
      setSettings(s);
      setUnits(u);
      setForm({
        defaultUomSystem: s.defaultUomSystem,
        volumeBaseUomId:  s.volumeBaseUomId,
        massBaseUomId:    s.massBaseUomId,
        lengthBaseUomId:  s.lengthBaseUomId,
      });
    } catch { setError('Failed to load settings'); }
    finally { setLoading(false); }
  }, []);
 
  useEffect(() => { fetch_(); }, [fetch_]);
 
  const handleSave = async () => {
    setSaving(true); setError(''); setSuccess('');
    try {
      const updated = await tenantSettingsApi.update(form);
      setSettings(updated);
      setSuccess('Settings saved successfully');
      setTimeout(() => setSuccess(''), 3000);
    } catch { setError('Failed to save settings'); }
    finally { setSaving(false); }
  };
 
  const volumeUnits = units.filter(u => u.type === 'volume');
  const massUnits   = units.filter(u => u.type === 'mass');
  const lengthUnits = units.filter(u => u.type === 'length');
 
  const uomsBySystem = (list: UomUnit[], system: string) =>
    list.filter(u => u.system === system || u.system === 'universal');
 
  return (
    <ERPShell breadcrumbs={['Home', 'Settings', 'General']} title="General Settings">
      <style>{`
        .gs-page { padding: 0 18px 24px; max-width: 760px; }
        .gs-section {
          background: rgba(10,7,18,0.7); border: 0.5px solid rgba(251,146,60,0.12);
          border-radius: 10px; margin-bottom: 16px; overflow: hidden;
        }
        .gs-section-hdr {
          padding: 12px 18px; border-bottom: 0.5px solid rgba(255,255,255,0.06);
          font-size: 12px; font-weight: 500; letter-spacing: 0.06em; text-transform: uppercase;
          color: rgba(251,146,60,0.6);
        }
        .gs-body { padding: 16px 18px; display: flex; flex-direction: column; gap: 14px; }
        .gs-row { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .gs-field { display: flex; flex-direction: column; gap: 6px; }
        .gs-label { font-size: 11px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(251,146,60,0.55); }
        .gs-sublabel { font-size: 11px; color: rgba(255,255,255,0.3); margin-top: -2px; }
        .gs-select {
          background: rgba(255,255,255,0.04); border: 0.5px solid rgba(255,255,255,0.1);
          border-radius: 7px; padding: 9px 12px; font-size: 13px;
          font-family: 'IBM Plex Sans', sans-serif; color: #f1ede8; outline: none;
          transition: border-color 0.2s;
        }
        .gs-select:focus { border-color: rgba(251,146,60,0.45); }
        .gs-select option { background: #0e0b1a; }
        .gs-system-toggle { display: flex; gap: 8px; }
        .gs-sys-btn {
          flex: 1; padding: 10px; border-radius: 8px; cursor: pointer; text-align: center;
          font-family: 'IBM Plex Sans', sans-serif; font-size: 13px; font-weight: 500;
          border: 0.5px solid rgba(255,255,255,0.1); transition: all 0.15s;
          color: rgba(255,255,255,0.4); background: rgba(255,255,255,0.03);
        }
        .gs-sys-btn-active {
          color: #fb923c; background: rgba(251,146,60,0.1);
          border-color: rgba(251,146,60,0.4);
          box-shadow: 0 0 12px rgba(251,146,60,0.15);
        }
        .gs-current {
          background: rgba(255,255,255,0.03); border: 0.5px solid rgba(255,255,255,0.07);
          border-radius: 8px; padding: 12px 16px; display: flex; gap: 20px; flex-wrap: wrap;
        }
        .gs-cur-item { display: flex; flex-direction: column; gap: 3px; }
        .gs-cur-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(255,255,255,0.3); }
        .gs-cur-value { font-size: 14px; font-weight: 500; font-family: 'IBM Plex Mono', monospace; color: #fb923c; }
        .gs-footer { display: flex; justify-content: flex-end; gap: 10px; padding-top: 4px; }
        .gs-btn-save {
          background: linear-gradient(135deg,#c2410c,#ea580c,#f97316); border: none;
          border-radius: 7px; padding: 9px 22px; font-size: 13px; font-weight: 500;
          font-family: 'IBM Plex Sans', sans-serif; color: white; cursor: pointer;
          box-shadow: 0 3px 12px rgba(234,88,12,0.35); transition: opacity 0.2s;
        }
        .gs-btn-save:disabled { opacity: 0.5; cursor: not-allowed; }
        .gs-btn-save:hover:not(:disabled) { opacity: 0.88; }
        .gs-alert {
          border-radius: 8px; padding: 9px 14px; font-size: 12px; margin-bottom: 14px;
        }
        .gs-spinner { width: 18px; height: 18px; border-radius: 50%; border: 2px solid rgba(251,146,60,0.2); border-top-color: #fb923c; animation: gs-spin 0.7s linear infinite; margin: 52px auto; display: block; }
        @keyframes gs-spin { to { transform: rotate(360deg); } }
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap');
      `}</style>
 
      <div className="gs-page">
        {error   && <div className="gs-alert" style={{ background:'rgba(239,68,68,0.08)', border:'0.5px solid rgba(239,68,68,0.2)', color:'#fca5a5' }}>{error}</div>}
        {success && <div className="gs-alert" style={{ background:'rgba(74,222,128,0.08)', border:'0.5px solid rgba(74,222,128,0.2)', color:'#4ade80' }}>✓ {success}</div>}
 
        {loading ? <div className="gs-spinner" /> : (
          <>
            {/* Current state */}
            {settings && (
              <div className="gs-section">
                <div className="gs-section-hdr">Current Configuration</div>
                <div className="gs-body">
                  <div className="gs-current">
                    {[
                      { label: 'UOM System',   value: settings.defaultUomSystem?.toUpperCase() },
                      { label: 'Volume Base',  value: settings.volumeBaseUom?.code ?? '—' },
                      { label: 'Mass Base',    value: settings.massBaseUom?.code ?? '—' },
                      { label: 'Length Base',  value: settings.lengthBaseUom?.code ?? '—' },
                    ].map(c => (
                      <div key={c.label} className="gs-cur-item">
                        <span className="gs-cur-label">{c.label}</span>
                        <span className="gs-cur-value">{c.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
 
            {/* UOM System */}
            <div className="gs-section">
              <div className="gs-section-hdr">Unit of Measure System</div>
              <div className="gs-body">
                <div className="gs-field">
                  <label className="gs-label">Default System</label>
                  <p className="gs-sublabel">Production always sees quantities in this system. Purchasing can receive any unit regardless of this setting.</p>
                  <div className="gs-system-toggle" style={{ marginTop: 8 }}>
                    {(['metric', 'imperial'] as const).map(sys => (
                      <div
                        key={sys}
                        className={`gs-sys-btn${form.defaultUomSystem === sys ? ' gs-sys-btn-active' : ''}`}
                        onClick={() => setForm(f => ({ ...f, defaultUomSystem: sys }))}
                      >
                        {sys === 'metric' ? 'Metric (SI)' : 'Imperial (US)'}
                        <div style={{ fontSize: 11, fontWeight: 400, opacity: 0.6, marginTop: 3 }}>
                          {sys === 'metric' ? 'LTR · KG · M' : 'GAL · LB · FT'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
 
                <div className="gs-row">
                  <div className="gs-field">
                    <label className="gs-label">Volume Base Unit</label>
                    <select className="gs-select" value={form.volumeBaseUomId ?? ''} onChange={e => setForm(f => ({ ...f, volumeBaseUomId: e.target.value }))}>
                      <option value="">— Select —</option>
                      {uomsBySystem(volumeUnits, form.defaultUomSystem ?? 'metric').map(u => (
                        <option key={u.id} value={u.id}>{u.code} — {u.name}{u.isBase ? ' (base)' : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div className="gs-field">
                    <label className="gs-label">Mass Base Unit</label>
                    <select className="gs-select" value={form.massBaseUomId ?? ''} onChange={e => setForm(f => ({ ...f, massBaseUomId: e.target.value }))}>
                      <option value="">— Select —</option>
                      {uomsBySystem(massUnits, form.defaultUomSystem ?? 'metric').map(u => (
                        <option key={u.id} value={u.id}>{u.code} — {u.name}{u.isBase ? ' (base)' : ''}</option>
                      ))}
                    </select>
                  </div>
                  <div className="gs-field">
                    <label className="gs-label">Length Base Unit</label>
                    <select className="gs-select" value={form.lengthBaseUomId ?? ''} onChange={e => setForm(f => ({ ...f, lengthBaseUomId: e.target.value }))}>
                      <option value="">— Select —</option>
                      {uomsBySystem(lengthUnits, form.defaultUomSystem ?? 'metric').map(u => (
                        <option key={u.id} value={u.id}>{u.code} — {u.name}{u.isBase ? ' (base)' : ''}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>
 
            <div className="gs-footer">
              <button className="gs-btn-save" disabled={saving} onClick={handleSave}>
                {saving ? 'Saving…' : 'Save Settings'}
              </button>
            </div>
          </>
        )}
      </div>
    </ERPShell>
  );
}