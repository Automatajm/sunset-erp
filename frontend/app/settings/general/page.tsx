// ============================================================================
// frontend/app/settings/general/page.tsx
// ============================================================================
"use client";
import { useEffect, useState, useCallback } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import SearchSelect from '@/components/ui/SearchSelect';
import { tenantSettingsApi } from '@/lib/api/tenant-settings';
import { uomApi } from '@/lib/api/uom';

type UomSystem = 'metric' | 'imperial' | 'custom';

interface UomUnit {
  id: string; code: string; name: string;
  type: string; system: string; isBase: boolean;
}

interface SettingsForm {
  defaultUomSystem?: UomSystem;
  volumeBaseUomId?: string;
  massBaseUomId?:   string;
  lengthBaseUomId?: string;
  areaBaseUomId?:   string;
  countBaseUomId?:  string;
  timeBaseUomId?:   string;
}

const UOM_TYPE_COLOR: Record<string, string> = {
  volume: 'var(--accent-blue, #60a5fa)', mass: 'var(--accent-violet, #a78bfa)', count: 'var(--success, #4ade80)',
  length: 'var(--warning, #fbbf24)', area: 'var(--accent-strong, #fb923c)', time: 'var(--danger, #f87171)',
};

const SYSTEM_DEFAULTS: Record<string, Record<string, string>> = {
  metric:   { volume: 'LTR', mass: 'KG',  length: 'M',  count: 'PCS' },
  imperial: { volume: 'GAL', mass: 'LB',  length: 'FT', count: 'PCS' },
};

const UOM_ROWS = [
  { key: 'volumeBaseUomId',  label: 'Volume',  type: 'volume',  example: 'LTR / GAL / ML' },
  { key: 'massBaseUomId',    label: 'Mass',    type: 'mass',    example: 'KG / LB / G' },
  { key: 'lengthBaseUomId',  label: 'Length',  type: 'length',  example: 'M / FT / CM' },
  { key: 'countBaseUomId',   label: 'Count',   type: 'count',   example: 'PCS / BOX / UNIT' },
  { key: 'areaBaseUomId',    label: 'Area',    type: 'area',    example: 'M2 / FT2' },
  { key: 'timeBaseUomId',    label: 'Time',    type: 'time',    example: 'HR / MIN / DAY' },
] as const;

// ─── Warning Modal ────────────────────────────────────────────────────────────

interface WarnPayload {
  type: 'uom' | 'system';
  label: string;
  fromCode: string;
  toCode: string;
  changes: { label: string; fromCode: string; toCode: string }[];
  onConfirm: () => void;
}

function WarningModal({ payload, onCancel }: { payload: WarnPayload; onCancel: () => void }) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: 'var(--surface, #0e0b1a)', border: '0.5px solid rgba(251,191,36,0.3)', borderRadius: 14, width: '100%', maxWidth: 500, boxShadow: '0 24px 60px rgba(0,0,0,0.8)' }}>

        <div style={{ padding: '16px 20px 12px', borderBottom: '0.5px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 20 }}>⚠️</span>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--warning, #fbbf24)' }}>Confirm System UOM Changes</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
              {payload.changes.length} change{payload.changes.length !== 1 ? 's' : ''} will be saved
            </div>
          </div>
        </div>

        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Change summary table */}
          <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, overflow: 'hidden' }}>
            {payload.changes.map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 14px', borderBottom: i < payload.changes.length - 1 ? '0.5px solid rgba(255,255,255,0.05)' : 'none' }}>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', width: 90, flexShrink: 0 }}>{c.label}</span>
                <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, fontWeight: 500, color: 'var(--success, #4ade80)' }}>{c.fromCode}</span>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.25)' }}>→</span>
                <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, fontWeight: 500, color: 'var(--danger, #f87171)' }}>{c.toCode}</span>
              </div>
            ))}
          </div>

          {/* Impact list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { icon: '📦', text: 'Consumption Groups linked to changed system UOMs will need to be updated.' },
              { icon: '🏷️', text: 'Item consumption UOMs pointing to old units will need review.' },
              { icon: '🔄', text: 'MRP will aggregate using the new units — ensure UOM conversions exist in the conversion table.' },
              { icon: '📋', text: 'Historical data is not changed — only future aggregations are affected.' },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>{item.icon}</span>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>{item.text}</span>
              </div>
            ))}
          </div>

          <div style={{ background: 'rgba(251,191,36,0.07)', border: '0.5px solid rgba(251,191,36,0.2)', borderRadius: 7, padding: '8px 12px', fontSize: 11, color: 'rgba(251,191,36,0.7)', lineHeight: 1.5 }}>
            This action will immediately update the system configuration. Proceed only if you have reviewed the impacts above.
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '10px 20px 16px', borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
          <button onClick={onCancel}
            style={{ background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '8px 16px', fontSize: 12, fontFamily: "'IBM Plex Sans',sans-serif", color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>
            Cancel — review changes
          </button>
          <button onClick={() => payload.onConfirm()}
            style={{ background: 'linear-gradient(135deg,#92400e,#b45309,#d97706)', border: 'none', borderRadius: 7, padding: '8px 20px', fontSize: 12, fontWeight: 500, fontFamily: "'IBM Plex Sans',sans-serif", color: 'white', cursor: 'pointer' }}>
            Confirm &amp; Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function GeneralSettingsPage() {
  const [units,   setUnits]   = useState<UomUnit[]>([]);
  const [form,    setForm]    = useState<SettingsForm>({});
  const [saved,   setSaved]   = useState<SettingsForm>({});   // last saved snapshot
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [success, setSuccess] = useState('');
  const [error,   setError]   = useState('');
  const [warn,    setWarn]    = useState<WarnPayload | null>(null);

  const fetch_ = useCallback(async () => {
    try {
      const [s, u] = await Promise.all([tenantSettingsApi.get(), uomApi.getUnits()]);
      setUnits(u as UomUnit[]);
      const snap: SettingsForm = {
        defaultUomSystem: s.defaultUomSystem as UomSystem,
        volumeBaseUomId:  s.volumeBaseUomId  ?? '',
        massBaseUomId:    s.massBaseUomId    ?? '',
        lengthBaseUomId:  s.lengthBaseUomId  ?? '',
        areaBaseUomId:    s.areaBaseUomId    ?? '',
        countBaseUomId:   s.countBaseUomId   ?? '',
        timeBaseUomId:    s.timeBaseUomId    ?? '',
      };
      setForm(snap);
      setSaved(snap);
    } catch { setError('Failed to load settings'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetch_(); }, [fetch_]);

  // ── Change a single UOM field — FREE, no warning on select ──────────────

  const tryChangeUom = (key: keyof SettingsForm, newId: string, _label: string) => {
    setForm(f => ({ ...f, [key]: newId || undefined }));
  };

  // ── Switch preset — FREE, no warning on select ────────────────────────────

  const handleSystemChange = (sys: UomSystem) => {
    setForm(f => {
      if (sys === 'custom') return { ...f, defaultUomSystem: 'custom' };
      const defaults = SYSTEM_DEFAULTS[sys] ?? {};
      const newForm: SettingsForm = { ...f, defaultUomSystem: sys };
      (['volume', 'mass', 'length', 'count'] as const).forEach(type => {
        const match = units.find(u => u.code === defaults[type] && u.type === type);
        if (match) (newForm as any)[`${type}BaseUomId`] = match.id;
      });
      return newForm;
    });
  };

  // ── Save — warn here if any previously-configured UOM is changing ─────────

  const handleSave = async () => {
    // Build list of UOM changes that affect already-configured fields
    const changedRows = UOM_ROWS.filter(row => {
      const savedId = saved[row.key as keyof SettingsForm] ?? '';
      const formId  = form[row.key  as keyof SettingsForm] ?? '';
      return savedId && formId && savedId !== formId; // only warn if was set and is changing
    });

    const systemChanged = saved.defaultUomSystem &&
      form.defaultUomSystem !== saved.defaultUomSystem;

    if (changedRows.length > 0 || systemChanged) {
      // Build a summary for the modal
      const changeLines = [
        ...(systemChanged ? [{
          label:    'System Preset',
          fromCode: systemLabel[saved.defaultUomSystem ?? ''] ?? saved.defaultUomSystem ?? '—',
          toCode:   systemLabel[form.defaultUomSystem  ?? ''] ?? form.defaultUomSystem  ?? '—',
        }] : []),
        ...changedRows.map(row => ({
          label:    row.label,
          fromCode: units.find(u => u.id === saved[row.key as keyof SettingsForm])?.code ?? '—',
          toCode:   units.find(u => u.id === form[row.key  as keyof SettingsForm])?.code ?? '—',
        })),
      ];

      setWarn({
        type:      changedRows.length > 0 ? 'uom' : 'system',
        label:     changeLines.map(c => `${c.label}: ${c.fromCode} → ${c.toCode}`).join(' · '),
        fromCode:  changeLines.map(c => c.fromCode).join(', '),
        toCode:    changeLines.map(c => c.toCode).join(', '),
        changes:   changeLines,
        onConfirm: () => { setWarn(null); doSave(); },
      });
      return;
    }

    doSave();
  };

  const doSave = async () => {
    setSaving(true); setError(''); setSuccess('');
    try {
      const payload: any = { defaultUomSystem: form.defaultUomSystem };
      if (form.volumeBaseUomId)  payload.volumeBaseUomId  = form.volumeBaseUomId;
      if (form.massBaseUomId)    payload.massBaseUomId    = form.massBaseUomId;
      if (form.lengthBaseUomId)  payload.lengthBaseUomId  = form.lengthBaseUomId;
      if (form.areaBaseUomId)    payload.areaBaseUomId    = form.areaBaseUomId;
      if (form.countBaseUomId)   payload.countBaseUomId   = form.countBaseUomId;
      if (form.timeBaseUomId)    payload.timeBaseUomId    = form.timeBaseUomId;
      const updated = await tenantSettingsApi.update(payload);
      const snap: SettingsForm = {
        defaultUomSystem: updated.defaultUomSystem,
        volumeBaseUomId:  updated.volumeBaseUomId  ?? '',
        massBaseUomId:    updated.massBaseUomId    ?? '',
        lengthBaseUomId:  updated.lengthBaseUomId  ?? '',
        areaBaseUomId:    updated.areaBaseUomId    ?? '',
        countBaseUomId:   updated.countBaseUomId   ?? '',
        timeBaseUomId:    updated.timeBaseUomId    ?? '',
      };
      setForm(snap); setSaved(snap);
      setSuccess('Settings saved — system UOMs now available in ConsumptionGroups and Items.');
      setTimeout(() => setSuccess(''), 5000);
    } catch { setError('Failed to save settings'); }
    finally { setSaving(false); }
  };


  // ── Helpers ───────────────────────────────────────────────────────────────

  const byType = (type: string) => {
    const sys = form.defaultUomSystem;
    return units
      .filter(u => {
        if (u.type !== type) return false;
        if (sys === 'custom') return true;
        if (sys === 'metric')   return u.system === 'metric'   || u.system === 'universal';
        if (sys === 'imperial') return u.system === 'imperial' || u.system === 'universal';
        return true;
      })
      .map(u => ({
        value:    u.id,
        label:    `${u.code} — ${u.name}`,
        sublabel: `${u.system}${u.isBase ? ' · base' : ''}`,
      }));
  };

  const isDirty     = (key: keyof SettingsForm) => form[key] !== saved[key];
  const hasAnyDirty = UOM_ROWS.some(r => isDirty(r.key as keyof SettingsForm)) || isDirty('defaultUomSystem');

  const savedSystemUoms = UOM_ROWS.map(row => {
    const u = units.find(x => x.id === saved[row.key as keyof SettingsForm]);
    return { label: row.label, type: row.type, uom: u ?? null };
  }).filter(x => x.uom);

  const systemLabel: Record<string, string> = {
    metric: 'Metric (SI)', imperial: 'Imperial (US)', custom: 'Custom Mix',
  };

  return (
    <ERPShell breadcrumbs={['Home', 'Settings', 'General']} title="General Settings">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap');
        .gs-page{padding:0 18px 16px;display:flex;flex-direction:column;height:100%;overflow:hidden}
        .gs-layout{display:grid;grid-template-columns:340px 1fr;gap:14px;flex:1;min-height:0}
        .gs-col{display:flex;flex-direction:column;gap:12px;min-height:0}
        .gs-section{background:rgba(10,7,18,0.7);border:0.5px solid rgba(251,146,60,0.12);border-radius:10px;overflow:hidden;flex-shrink:0}
        .gs-section-hdr{padding:10px 16px;border-bottom:0.5px solid rgba(255,255,255,0.06);font-size:11px;font-weight:500;letter-spacing:0.07em;text-transform:uppercase;color:rgba(251,146,60,0.6);display:flex;align-items:center;justify-content:space-between}
        .gs-body{padding:14px 16px;display:flex;flex-direction:column;gap:12px}
        .gs-sublabel{font-size:10px;color:rgba(255,255,255,0.28);line-height:1.5}
        .gs-btn-save{background:linear-gradient(135deg,var(--accent-pressed, #c2410c),var(--accent, #ea580c),var(--accent-mid, #f97316));border:none;border-radius:7px;padding:8px 22px;font-size:13px;font-weight:500;font-family:'IBM Plex Sans',sans-serif;color:white;cursor:pointer;box-shadow:0 3px 12px rgba(234,88,12,0.35)}
        .gs-btn-save:disabled{opacity:0.5;cursor:not-allowed}
        .gs-alert{border-radius:8px;padding:8px 12px;font-size:12px;margin-bottom:10px;flex-shrink:0}
        .gs-spinner{width:18px;height:18px;border-radius:50%;border:2px solid rgba(251,146,60,0.2);border-top-color:var(--accent-strong, #fb923c);animation:gs-spin 0.7s linear infinite;margin:52px auto;display:block}
        @keyframes gs-spin{to{transform:rotate(360deg)}}
        .badge-saved{display:inline-flex;align-items:center;gap:3px;font-size:10px;color:rgba(74,222,128,0.75);background:rgba(74,222,128,0.08);border:0.5px solid rgba(74,222,128,0.2);border-radius:10px;padding:1px 7px;font-family:'IBM Plex Sans',sans-serif}
        .badge-pending{display:inline-flex;align-items:center;gap:3px;font-size:10px;color:rgba(251,191,36,0.85);background:rgba(251,191,36,0.08);border:0.5px solid rgba(251,191,36,0.25);border-radius:10px;padding:1px 7px;font-family:'IBM Plex Sans',sans-serif}
      `}</style>

      <div className="gs-page">
        {error   && <div className="gs-alert" style={{ background:'rgba(239,68,68,0.08)', border:'0.5px solid rgba(239,68,68,0.2)', color:'var(--danger-subtle, #fca5a5)' }}>{error}</div>}
        {success && <div className="gs-alert" style={{ background:'rgba(74,222,128,0.08)', border:'0.5px solid rgba(74,222,128,0.2)', color:'var(--success, #4ade80)' }}>✓ {success}</div>}

        {loading ? <div className="gs-spinner" /> : (
          <div className="gs-layout">

            {/* ══ LEFT ══ */}
            <div className="gs-col">

              {/* Active saved config */}
              <div className="gs-section">
                <div className="gs-section-hdr">
                  <span>Active Configuration</span>
                  <span style={{ fontSize: 10, color: 'rgba(74,222,128,0.5)', fontWeight: 400, letterSpacing: 0 }}>● saved</span>
                </div>
                <div className="gs-body">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ background: 'rgba(251,146,60,0.08)', border: '0.5px solid rgba(251,146,60,0.2)', borderRadius: 7, padding: '5px 12px' }}>
                      <span style={{ fontSize: 9, color: 'rgba(251,146,60,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 2 }}>System</span>
                      <span style={{ fontSize: 13, fontWeight: 500, fontFamily: "'IBM Plex Mono',monospace", color: 'var(--accent-strong, #fb923c)' }}>
                        {systemLabel[saved.defaultUomSystem ?? 'metric']}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                    {savedSystemUoms.map(({ label, type, uom }) => {
                      const color = UOM_TYPE_COLOR[type] ?? 'var(--text-primary, #e2dfd8)';
                      return (
                        <div key={label} style={{ background: `color-mix(in srgb, ${color} 5%, transparent)`, border: `0.5px solid color-mix(in srgb, ${color} 16%, transparent)`, borderRadius: 7, padding: '5px 10px' }}>
                          <span style={{ fontSize: 9, color: `color-mix(in srgb, ${color} 40%, transparent)`, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block' }}>{label}</span>
                          <span style={{ fontSize: 13, fontWeight: 500, fontFamily: "'IBM Plex Mono',monospace", color, display: 'block' }}>{uom!.code}</span>
                          <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.28)', display: 'block' }}>{uom!.name}</span>
                        </div>
                      );
                    })}
                    {savedSystemUoms.length === 0 && (
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.22)' }}>No system UOMs saved yet.</span>
                    )}
                  </div>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', lineHeight: 1.5, borderTop: '0.5px solid rgba(255,255,255,0.05)', paddingTop: 8 }}>
                    MRP aggregates all consumption to these units. Purchasing and warehouse are free to use any unit.
                  </div>
                </div>
              </div>

              {/* Preset selector */}
              <div className="gs-section">
                <div className="gs-section-hdr">
                  <span>UOM System Preset</span>
                  {isDirty('defaultUomSystem') && <span className="badge-pending">● pending</span>}
                </div>
                <div className="gs-body">
                  <p className="gs-sublabel">Choose a preset to auto-fill system UOMs, or Custom Mix to pick each individually.</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {(['metric', 'imperial', 'custom'] as UomSystem[]).map(sys => {
                      const active  = form.defaultUomSystem === sys;
                      const isSaved = saved.defaultUomSystem === sys;
                      const sub     = sys === 'metric' ? 'LTR · KG · M · PCS' : sys === 'imperial' ? 'GAL · LB · FT · PCS' : 'Pick each UOM freely →';
                      return (
                        <div key={sys} onClick={() => handleSystemChange(sys)}
                          style={{ padding: '10px 14px', borderRadius: 8, cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif", fontSize: 13, fontWeight: 500, border: `0.5px solid ${active ? 'rgba(251,146,60,0.4)' : 'rgba(255,255,255,0.07)'}`, transition: 'all 0.15s', color: active ? 'var(--accent-strong, #fb923c)' : 'rgba(255,255,255,0.35)', background: active ? 'rgba(251,146,60,0.07)' : 'rgba(255,255,255,0.02)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span>{sys === 'metric' ? 'Metric (SI)' : sys === 'imperial' ? 'Imperial (US)' : '⚙ Custom Mix'}</span>
                            {isSaved && !isDirty('defaultUomSystem') && <span className="badge-saved">✓ saved</span>}
                            {active && !isSaved && <span className="badge-pending">● pending</span>}
                          </div>
                          <span style={{ fontSize: 11, fontWeight: 400, color: active ? 'rgba(251,146,60,0.5)' : 'rgba(255,255,255,0.18)' }}>{sub}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Info */}
              <div style={{ background: 'rgba(96,165,250,0.04)', border: '0.5px solid rgba(96,165,250,0.1)', borderRadius: 10, padding: '10px 14px', fontSize: 11, color: 'rgba(255,255,255,0.28)', lineHeight: 1.7 }}>
                <strong style={{ color: 'var(--accent-blue, #60a5fa)' }}>How it works:</strong> Formulators, buyers and warehouse staff work in any unit.
                MRP converts everything to system UOMs at aggregation time.
                ConsumptionGroups and Item consumption UOMs are restricted to these system units only.
              </div>

              {/* Save row */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10 }}>
                {hasAnyDirty && (
                  <span style={{ fontSize: 11, color: 'var(--warning, #fbbf24)', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--warning, #fbbf24)', boxShadow: '0 0 4px rgba(251,191,36,0.6)', display: 'inline-block' }} />
                    Unsaved changes
                  </span>
                )}
                <button className="gs-btn-save" disabled={saving || !hasAnyDirty} onClick={handleSave}>
                  {saving ? 'Saving…' : 'Save Settings'}
                </button>
              </div>
            </div>

            {/* ══ RIGHT — UOM pickers ══ */}
            <div className="gs-col">
              <div className="gs-section" style={{ flex: 1 }}>
                <div className="gs-section-hdr">
                  <span>System UOMs</span>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.22)', fontWeight: 400, letterSpacing: 0 }}>
                    ConsumptionGroups &amp; Item consumption restricted to these
                  </span>
                </div>
                <div className="gs-body">
                  {UOM_ROWS.map(row => {
                    const color    = UOM_TYPE_COLOR[row.type] ?? 'var(--text-primary, #e2dfd8)';
                    const opts     = byType(row.type);
                    const selId    = form[row.key as keyof SettingsForm] as string ?? '';
                    const savedId  = saved[row.key as keyof SettingsForm] as string ?? '';
                    const selUom   = units.find(u => u.id === selId);
                    const savedUom = units.find(u => u.id === savedId);
                    const dirty    = isDirty(row.key as keyof SettingsForm);

                    return (
                      <div key={row.key} style={{ display: 'grid', gridTemplateColumns: '150px 1fr', gap: 14, alignItems: 'start', paddingBottom: 12, borderBottom: '0.5px solid rgba(255,255,255,0.05)' }}>

                        {/* Left: type label + status */}
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 2 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
                            <span style={{ fontSize: 11, fontWeight: 500, color, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{row.label}</span>
                          </div>
                          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>e.g. {row.example}</span>

                          {/* Saved UOM */}
                          {savedUom ? (
                            <div style={{ marginTop: 3, display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, color: dirty ? 'rgba(74,222,128,0.7)' : color, fontWeight: 500 }}>
                                  {savedUom.code}
                                </span>
                                <span className="badge-saved">✓ saved</span>
                              </div>
                              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>{savedUom.name}</span>
                            </div>
                          ) : (
                            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.18)', marginTop: 3, fontStyle: 'italic' }}>Not configured</span>
                          )}

                          {/* Pending new value */}
                          {dirty && selUom && selUom.id !== savedId && (
                            <div style={{ marginTop: 5, background: 'rgba(251,191,36,0.07)', borderRadius: 6, padding: '5px 8px', border: '0.5px solid rgba(251,191,36,0.2)', display: 'flex', flexDirection: 'column', gap: 2 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                                <span style={{ fontSize: 11, color: 'var(--warning, #fbbf24)' }}>→</span>
                                <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: 'var(--warning, #fbbf24)', fontWeight: 500 }}>{selUom.code}</span>
                                <span className="badge-pending">pending</span>
                              </div>
                              <span style={{ fontSize: 10, color: 'rgba(251,191,36,0.5)' }}>{selUom.name}</span>
                            </div>
                          )}

                          {/* First time - no saved */}
                          {!savedId && !dirty && (
                            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.18)', marginTop: 3 }}>
                              First-time setup — no warning on change
                            </span>
                          )}
                        </div>

                        {/* Right: picker */}
                        <SearchSelect
                          options={opts}
                          value={selId}
                          onChange={v => tryChangeUom(row.key as keyof SettingsForm, v, row.label)}
                          placeholder={`Search ${row.label.toLowerCase()} UOM…`}
                          clearLabel="— Not configured —"
                          minWidth={260}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

          </div>
        )}
      </div>

      {warn && <WarningModal payload={warn} onCancel={() => setWarn(null)} />}
    </ERPShell>
  );
}