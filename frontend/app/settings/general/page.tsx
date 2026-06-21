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
type Theme     = 'dark' | 'light' | 'system';
type Density   = 'compact' | 'normal' | 'comfortable';

interface UomUnit {
  id: string; code: string; name: string;
  type: string; system: string; isBase: boolean;
}

interface SettingsForm {
  defaultUomSystem?: UomSystem;
  baseCurrency?:    string;
  volumeBaseUomId?: string;
  massBaseUomId?:   string;
  lengthBaseUomId?: string;
  areaBaseUomId?:   string;
  countBaseUomId?:  string;
  timeBaseUomId?:   string;
}

// Client-only regional preferences (no column in TenantSettings — persisted to
// localStorage on Save; only `baseCurrency` round-trips to the server).
interface Regional {
  companyName:  string;
  language:     string;
  timezone:     string;
  dateFormat:   string;
  numberFormat: string;
}

const REGIONAL_DEFAULTS: Regional = {
  companyName:  '',
  language:     'en-US',
  timezone:     'America/Santo_Domingo',
  dateFormat:   'MM/DD/YYYY',
  numberFormat: '1,234.56',
};

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

// ─── Regional option catalogs (mirror the seeded mc_currencies / i18n_languages) ─

const CURRENCIES = [
  { code: 'DOP', name: 'Dominican Peso',   symbol: 'RD$' },
  { code: 'USD', name: 'US Dollar',        symbol: '$' },
  { code: 'EUR', name: 'Euro',             symbol: '€' },
  { code: 'GBP', name: 'British Pound',    symbol: '£' },
  { code: 'CAD', name: 'Canadian Dollar',  symbol: 'C$' },
  { code: 'MXN', name: 'Mexican Peso',     symbol: 'MX$' },
];

const LANGUAGES = [
  { code: 'en-US', name: 'English (US)',                  native: 'English' },
  { code: 'es-ES', name: 'Spanish (Spain)',               native: 'Español' },
  { code: 'es-DO', name: 'Spanish (Dominican Republic)',  native: 'Español (RD)' },
  { code: 'fr-FR', name: 'French',                        native: 'Français' },
];

const TIMEZONES = [
  'America/Santo_Domingo', 'America/New_York', 'America/Chicago',
  'America/Los_Angeles', 'Europe/London', 'Europe/Madrid', 'UTC',
];

const DATE_FORMATS   = ['MM/DD/YYYY', 'DD/MM/YYYY', 'YYYY-MM-DD'];
const NUMBER_FORMATS = [
  { value: '1,234.56', label: '1,234.56', sub: 'Comma thousands · dot decimal' },
  { value: '1.234,56', label: '1.234,56', sub: 'Dot thousands · comma decimal' },
];

const ccyOpts  = CURRENCIES.map(c => ({ value: c.code, label: `${c.code} — ${c.name}`, sublabel: c.symbol }));
const langOpts = LANGUAGES.map(l => ({ value: l.code, label: `${l.code} — ${l.name}`, sublabel: l.native }));
const tzOpts   = TIMEZONES.map(t => ({ value: t, label: t.replace(/_/g, ' '), sublabel: t === 'UTC' ? 'Coordinated Universal Time' : '' }));
const dfOpts   = DATE_FORMATS.map(d => ({ value: d, label: d }));
const nfOpts   = NUMBER_FORMATS.map(n => ({ value: n.value, label: n.label, sublabel: n.sub }));

// ─── Appearance presets ─────────────────────────────────────────────────────

interface AccentPreset { key: string; name: string; accent: string; mid: string; strong: string; pressed: string; }

const ACCENTS: AccentPreset[] = [
  { key: 'orange', name: 'Orange', accent: '#ea580c', mid: '#f97316', strong: '#fb923c', pressed: '#c2410c' },
  { key: 'blue',   name: 'Blue',   accent: '#3b82f6', mid: '#60a5fa', strong: '#93c5fd', pressed: '#2563eb' },
  { key: 'green',  name: 'Green',  accent: '#16a34a', mid: '#22c55e', strong: '#4ade80', pressed: '#15803d' },
  { key: 'purple', name: 'Purple', accent: '#7c3aed', mid: '#8b5cf6', strong: '#a78bfa', pressed: '#6d28d9' },
  { key: 'red',    name: 'Red',    accent: '#dc2626', mid: '#ef4444', strong: '#f87171', pressed: '#b91c1c' },
];

const THEMES:    { value: Theme;   label: string; sub: string }[] = [
  { value: 'dark',   label: 'Dark',   sub: 'Default' },
  { value: 'light',  label: 'Light',  sub: 'Bright surfaces' },
  { value: 'system', label: 'System', sub: 'Match OS' },
];
const DENSITIES: { value: Density; label: string; sub: string }[] = [
  { value: 'compact',     label: 'Compact',     sub: 'Tighter rows' },
  { value: 'normal',      label: 'Normal',      sub: 'Default' },
  { value: 'comfortable', label: 'Comfortable', sub: 'More breathing room' },
];

const LS = {
  theme:   'sunset-theme',
  accent:  'sunset-accent',
  density: 'sunset-density',
  company: 'sunset-company',
  language:'sunset-language',
  timezone:'sunset-timezone',
  dateFmt: 'sunset-dateformat',
  numFmt:  'sunset-numberformat',
};

// ─── DOM appliers (client-only, safe inside effects/handlers) ────────────────

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
  const effectiveLight = theme === 'light' || (theme === 'system' && prefersLight);
  root.classList.toggle('light', effectiveLight);
}

function applyAccent(p: AccentPreset) {
  const root = document.documentElement;
  root.style.setProperty('--accent', p.accent);
  root.style.setProperty('--accent-mid', p.mid);
  root.style.setProperty('--accent-strong', p.strong);
  root.style.setProperty('--accent-pressed', p.pressed);
}

function applyDensity(d: Density) {
  document.documentElement.setAttribute('data-density', d);
}

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

        <div style={{ padding: '16px 20px 12px', borderBottom: '0.5px solid var(--l06)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--warning, #fbbf24)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--warning, #fbbf24)' }}>Confirm System UOM Changes</div>
            <div style={{ fontSize: 11, color: 'var(--w30)', marginTop: 2 }}>
              {payload.changes.length} change{payload.changes.length !== 1 ? 's' : ''} will be saved
            </div>
          </div>
        </div>

        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Change summary table */}
          <div style={{ background: 'var(--l03)', borderRadius: 8, overflow: 'hidden' }}>
            {payload.changes.map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 14px', borderBottom: i < payload.changes.length - 1 ? '0.5px solid var(--l05)' : 'none' }}>
                <span style={{ fontSize: 11, color: 'var(--w35)', width: 90, flexShrink: 0 }}>{c.label}</span>
                <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, fontWeight: 500, color: 'var(--success, #4ade80)' }}>{c.fromCode}</span>
                <span style={{ fontSize: 13, color: 'var(--w25)' }}>→</span>
                <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, fontWeight: 500, color: 'var(--danger, #f87171)' }}>{c.toCode}</span>
              </div>
            ))}
          </div>

          {/* Impact list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {[
              { icon: '•', text: 'Consumption Groups linked to changed system UOMs will need to be updated.' },
              { icon: '•', text: 'Item consumption UOMs pointing to old units will need review.' },
              { icon: '•', text: 'MRP will aggregate using the new units — ensure UOM conversions exist in the conversion table.' },
              { icon: '•', text: 'Historical data is not changed — only future aggregations are affected.' },
            ].map((item, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                <span style={{ fontSize: 13, flexShrink: 0, marginTop: 1 }}>{item.icon}</span>
                <span style={{ fontSize: 11, color: 'var(--w40)', lineHeight: 1.5 }}>{item.text}</span>
              </div>
            ))}
          </div>

          <div style={{ background: 'rgba(251,191,36,0.07)', border: '0.5px solid rgba(251,191,36,0.2)', borderRadius: 7, padding: '8px 12px', fontSize: 11, color: 'rgba(251,191,36,0.7)', lineHeight: 1.5 }}>
            This action will immediately update the system configuration. Proceed only if you have reviewed the impacts above.
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '10px 20px 16px', borderTop: '0.5px solid var(--l06)' }}>
          <button onClick={onCancel}
            style={{ background: 'var(--l05)', border: '0.5px solid var(--w10)', borderRadius: 7, padding: '8px 16px', fontSize: 12, fontFamily: "'IBM Plex Sans',sans-serif", color: 'var(--w50)', cursor: 'pointer' }}>
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

// ─── Small presentational helpers ────────────────────────────────────────────

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="gs-flabel">
        {label}
        {hint && <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0, color: 'var(--w25)', marginLeft: 6 }}>{hint}</span>}
      </label>
      {children}
    </div>
  );
}

function SegGroup<T extends string>({ options, value, onChange }: {
  options: { value: T; label: string; sub: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${options.length}, 1fr)`, gap: 6 }}>
      {options.map(o => {
        const active = value === o.value;
        return (
          <button key={o.value} type="button" onClick={() => onChange(o.value)}
            style={{
              display: 'flex', flexDirection: 'column', gap: 2, padding: '9px 8px', borderRadius: 8, cursor: 'pointer',
              fontFamily: "'IBM Plex Sans',sans-serif", textAlign: 'center', transition: 'all 0.15s',
              border: `0.5px solid ${active ? 'var(--accent-strong, #fb923c)' : 'var(--l08)'}`,
              background: active ? 'color-mix(in srgb, var(--accent, #ea580c) 9%, transparent)' : 'var(--l02)',
            }}>
            <span style={{ fontSize: 12, fontWeight: 500, color: active ? 'var(--accent-strong, #fb923c)' : 'var(--w55)' }}>{o.label}</span>
            <span style={{ fontSize: 9, color: active ? 'color-mix(in srgb, var(--accent-strong, #fb923c) 55%, transparent)' : 'var(--w22)' }}>{o.sub}</span>
          </button>
        );
      })}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function GeneralSettingsPage() {
  const [units,   setUnits]   = useState<UomUnit[]>([]);
  const [form,    setForm]    = useState<SettingsForm>({});
  const [saved,   setSaved]   = useState<SettingsForm>({});   // last saved server snapshot
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [success, setSuccess] = useState('');
  const [error,   setError]   = useState('');
  const [warn,    setWarn]    = useState<WarnPayload | null>(null);

  // Client-only regional prefs + their saved snapshot
  const [regional,      setRegional]      = useState<Regional>(REGIONAL_DEFAULTS);
  const [savedRegional, setSavedRegional] = useState<Regional>(REGIONAL_DEFAULTS);

  // Appearance (purely client-side)
  const [theme,   setTheme]   = useState<Theme>('dark');
  const [accent,  setAccent]  = useState<string>(ACCENTS[0].accent);
  const [density, setDensity] = useState<Density>('normal');

  // ── Load server settings + UOM units ──────────────────────────────────────
  const fetch_ = useCallback(async () => {
    try {
      const [s, u] = await Promise.all([tenantSettingsApi.get(), uomApi.getUnits()]);
      setUnits(u as UomUnit[]);
      const snap: SettingsForm = {
        defaultUomSystem: s.defaultUomSystem as UomSystem,
        baseCurrency:     s.baseCurrency     ?? 'DOP',
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

  // ── Hydrate client-only prefs + appearance on mount ───────────────────────
  useEffect(() => {
    // Regional prefs
    const reg: Regional = {
      companyName:  localStorage.getItem(LS.company)  ?? REGIONAL_DEFAULTS.companyName,
      language:     localStorage.getItem(LS.language) ?? REGIONAL_DEFAULTS.language,
      timezone:     localStorage.getItem(LS.timezone) ?? REGIONAL_DEFAULTS.timezone,
      dateFormat:   localStorage.getItem(LS.dateFmt)  ?? REGIONAL_DEFAULTS.dateFormat,
      numberFormat: localStorage.getItem(LS.numFmt)   ?? REGIONAL_DEFAULTS.numberFormat,
    };
    setRegional(reg);
    setSavedRegional(reg);

    // Appearance
    const t = (localStorage.getItem(LS.theme) as Theme) ?? 'dark';
    setTheme(t);

    const accentHex = localStorage.getItem(LS.accent) ?? ACCENTS[0].accent;
    const preset    = ACCENTS.find(p => p.accent === accentHex) ?? ACCENTS[0];
    setAccent(preset.accent);
    applyAccent(preset);

    const d = (localStorage.getItem(LS.density) as Density) ?? 'normal';
    setDensity(d);
    applyDensity(d);
  }, []);

  // ── Apply theme + keep the OS listener live while in System mode ──────────
  useEffect(() => {
    applyTheme(theme);
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    const handler = () => applyTheme('system');
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  // ── Appearance handlers (persist + apply immediately, no Save needed) ─────
  const chooseTheme = (t: Theme) => {
    setTheme(t);
    localStorage.setItem(LS.theme, t);   // effect applies it
  };
  const chooseAccent = (p: AccentPreset) => {
    setAccent(p.accent);
    applyAccent(p);
    localStorage.setItem(LS.accent, p.accent);
  };
  const chooseDensity = (d: Density) => {
    setDensity(d);
    applyDensity(d);
    localStorage.setItem(LS.density, d);
  };

  // ── Regional field setter ─────────────────────────────────────────────────
  const setReg = (key: keyof Regional, value: string) =>
    setRegional(r => ({ ...r, [key]: value }));

  // ── Change a single UOM field — FREE, no warning on select ───────────────
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
    const changedRows = UOM_ROWS.filter(row => {
      const savedId = saved[row.key as keyof SettingsForm] ?? '';
      const formId  = form[row.key  as keyof SettingsForm] ?? '';
      return savedId && formId && savedId !== formId; // only warn if was set and is changing
    });

    const systemChanged = saved.defaultUomSystem &&
      form.defaultUomSystem !== saved.defaultUomSystem;

    if (changedRows.length > 0 || systemChanged) {
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
      if (form.baseCurrency)     payload.baseCurrency     = form.baseCurrency;
      if (form.volumeBaseUomId)  payload.volumeBaseUomId  = form.volumeBaseUomId;
      if (form.massBaseUomId)    payload.massBaseUomId    = form.massBaseUomId;
      if (form.lengthBaseUomId)  payload.lengthBaseUomId  = form.lengthBaseUomId;
      if (form.areaBaseUomId)    payload.areaBaseUomId    = form.areaBaseUomId;
      if (form.countBaseUomId)   payload.countBaseUomId   = form.countBaseUomId;
      if (form.timeBaseUomId)    payload.timeBaseUomId    = form.timeBaseUomId;
      const updated = await tenantSettingsApi.update(payload);
      const snap: SettingsForm = {
        defaultUomSystem: updated.defaultUomSystem,
        baseCurrency:     updated.baseCurrency     ?? form.baseCurrency ?? 'DOP',
        volumeBaseUomId:  updated.volumeBaseUomId  ?? '',
        massBaseUomId:    updated.massBaseUomId    ?? '',
        lengthBaseUomId:  updated.lengthBaseUomId  ?? '',
        areaBaseUomId:    updated.areaBaseUomId    ?? '',
        countBaseUomId:   updated.countBaseUomId   ?? '',
        timeBaseUomId:    updated.timeBaseUomId    ?? '',
      };
      setForm(snap); setSaved(snap);

      // Persist client-only regional prefs (no server column for these)
      localStorage.setItem(LS.company,  regional.companyName);
      localStorage.setItem(LS.language, regional.language);
      localStorage.setItem(LS.timezone, regional.timezone);
      localStorage.setItem(LS.dateFmt,  regional.dateFormat);
      localStorage.setItem(LS.numFmt,   regional.numberFormat);
      setSavedRegional(regional);

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
  const regionalDirty = (Object.keys(regional) as (keyof Regional)[]).some(k => regional[k] !== savedRegional[k]);
  const hasAnyDirty = UOM_ROWS.some(r => isDirty(r.key as keyof SettingsForm))
    || isDirty('defaultUomSystem') || isDirty('baseCurrency') || regionalDirty;

  const savedSystemUoms = UOM_ROWS.map(row => {
    const u = units.find(x => x.id === saved[row.key as keyof SettingsForm]);
    return { label: row.label, type: row.type, uom: u ?? null };
  }).filter(x => x.uom);

  const systemLabel: Record<string, string> = {
    metric: 'Metric (SI)', imperial: 'Imperial (US)', custom: 'Custom Mix',
  };

  const activeAccent = ACCENTS.find(p => p.accent === accent) ?? ACCENTS[0];

  return (
    <ERPShell breadcrumbs={['Home', 'Settings', 'General']} title="General Settings">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap');
        .gs-page{padding:0 18px 24px;display:flex;flex-direction:column;height:100%;overflow-y:auto}
        .gs-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;align-items:start}
        @media (max-width:1280px){.gs-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
        @media (max-width:820px){.gs-grid{grid-template-columns:1fr}}
        .gs-card{background:var(--surface,#0e0b1a);border:0.5px solid var(--border,#2a2535);border-radius:12px;padding:20px;display:flex;flex-direction:column;gap:16px;min-width:0}
        .gs-card-title{font-size:11px;font-weight:500;letter-spacing:0.07em;text-transform:uppercase;color:var(--accent-strong,#fb923c);display:flex;align-items:center;gap:8px;margin:0}
        .gs-card-sub{font-size:10px;color:var(--w28);line-height:1.5;margin:-8px 0 0}
        .gs-flabel{font-size:11px;font-weight:500;color:var(--w55);text-transform:uppercase;letter-spacing:0.05em;margin-bottom:6px;display:block}
        .gs-input{width:100%;background:var(--l03);border:0.5px solid var(--border-strong,#3a3447);border-radius:8px;padding:9px 12px;font-size:13px;color:var(--text-primary,#e2dfd8);font-family:'IBM Plex Sans',sans-serif;outline:none;box-sizing:border-box}
        .gs-input:focus{border-color:var(--accent-strong,#fb923c)}
        .gs-divider{height:0.5px;background:var(--l06);margin:2px 0}
        .gs-sublabel{font-size:10px;color:var(--w28);line-height:1.5}
        .gs-btn-save{background:linear-gradient(135deg,var(--accent-pressed,#c2410c),var(--accent,#ea580c),var(--accent-mid,#f97316));border:none;border-radius:7px;padding:9px 24px;font-size:13px;font-weight:500;font-family:'IBM Plex Sans',sans-serif;color:#fff;cursor:pointer;box-shadow:0 3px 12px rgba(234,88,12,0.35)}
        .gs-btn-save:disabled{opacity:0.5;cursor:not-allowed}
        .gs-alert{border-radius:8px;padding:8px 12px;font-size:12px;margin-bottom:12px;flex-shrink:0}
        .gs-spinner{width:18px;height:18px;border-radius:50%;border:2px solid rgba(251,146,60,0.2);border-top-color:var(--accent-strong,#fb923c);animation:gs-spin 0.7s linear infinite;margin:52px auto;display:block}
        @keyframes gs-spin{to{transform:rotate(360deg)}}
        .badge-saved{display:inline-flex;align-items:center;gap:3px;font-size:10px;color:rgba(74,222,128,0.75);background:rgba(74,222,128,0.08);border:0.5px solid rgba(74,222,128,0.2);border-radius:10px;padding:1px 7px;font-family:'IBM Plex Sans',sans-serif}
        .badge-pending{display:inline-flex;align-items:center;gap:3px;font-size:10px;color:rgba(251,191,36,0.85);background:rgba(251,191,36,0.08);border:0.5px solid rgba(251,191,36,0.25);border-radius:10px;padding:1px 7px;font-family:'IBM Plex Sans',sans-serif}
        .gs-swatch{width:34px;height:34px;border-radius:9px;cursor:pointer;position:relative;transition:transform 0.12s}
        .gs-swatch:hover{transform:scale(1.06)}
      `}</style>

      <div className="gs-page">
        {error   && <div className="gs-alert" style={{ background:'rgba(239,68,68,0.08)', border:'0.5px solid rgba(239,68,68,0.2)', color:'var(--danger-subtle, #fca5a5)' }}>{error}</div>}
        {success && <div className="gs-alert" style={{ background:'rgba(74,222,128,0.08)', border:'0.5px solid rgba(74,222,128,0.2)', color:'var(--success, #4ade80)' }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ display:'inline', verticalAlign:'-2px', marginRight:6 }}><polyline points="20 6 9 17 4 12"/></svg>{success}</div>}

        {loading ? <div className="gs-spinner" /> : (
          <>
          <div className="gs-grid">

            {/* ══════════════ COLUMN 1 — Company & Regional ══════════════ */}
            <div className="gs-card">
              <div>
                <h3 className="gs-card-title">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/></svg>
                  Company &amp; Regional
                </h3>
              </div>

              <Field label="Company name">
                <input className="gs-input" value={regional.companyName}
                  onChange={e => setReg('companyName', e.target.value)}
                  placeholder="e.g. Burger Borinquen S.R.L." />
              </Field>

              <Field label="Base currency" hint="server-side">
                <SearchSelect options={ccyOpts} value={form.baseCurrency ?? ''}
                  onChange={v => setForm(f => ({ ...f, baseCurrency: v || undefined }))}
                  placeholder="Search currency…" clearLabel="— Select currency —" minWidth={260} />
              </Field>

              <Field label="Language">
                <SearchSelect options={langOpts} value={regional.language}
                  onChange={v => setReg('language', v)}
                  placeholder="Search language…" clearLabel="— Select language —" minWidth={260} />
              </Field>

              <Field label="Timezone">
                <SearchSelect options={tzOpts} value={regional.timezone}
                  onChange={v => setReg('timezone', v)}
                  placeholder="Search timezone…" clearLabel="— Select timezone —" minWidth={260} />
              </Field>

              <Field label="Date format">
                <SearchSelect options={dfOpts} value={regional.dateFormat}
                  onChange={v => setReg('dateFormat', v)}
                  placeholder="Select date format…" clearLabel="— Select —" minWidth={220} />
              </Field>

              <Field label="Number format">
                <SearchSelect options={nfOpts} value={regional.numberFormat}
                  onChange={v => setReg('numberFormat', v)}
                  placeholder="Select number format…" clearLabel="— Select —" minWidth={240} />
              </Field>

              <div style={{ background: 'rgba(96,165,250,0.04)', border: '0.5px solid rgba(96,165,250,0.1)', borderRadius: 9, padding: '9px 12px', fontSize: 10, color: 'var(--w30)', lineHeight: 1.6 }}>
                <strong style={{ color: 'var(--accent-blue, #60a5fa)' }}>Base currency</strong> is stored on the tenant and drives the frozen-rate pattern. Company, language, timezone and formats are stored as local preferences.
              </div>
            </div>

            {/* ══════════════ COLUMN 2 — System UOMs ══════════════ */}
            <div className="gs-card">
              <div>
                <h3 className="gs-card-title">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="m2 17 10 5 10-5"/><path d="m2 12 10 5 10-5"/></svg>
                  System UOMs
                </h3>
                <p className="gs-card-sub" style={{ marginTop: 6 }}>ConsumptionGroups &amp; Item consumption are restricted to these units.</p>
              </div>

              {/* Active saved configuration */}
              <div>
                <div className="gs-flabel" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>Active Configuration</span>
                  <span style={{ fontSize: 9, color: 'rgba(74,222,128,0.55)', fontWeight: 400, letterSpacing: 0, textTransform: 'none' }}>● saved</span>
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'stretch' }}>
                  <div style={{ background: 'color-mix(in srgb, var(--accent, #ea580c) 8%, transparent)', border: '0.5px solid color-mix(in srgb, var(--accent, #ea580c) 22%, transparent)', borderRadius: 7, padding: '5px 12px' }}>
                    <span style={{ fontSize: 9, color: 'color-mix(in srgb, var(--accent-strong, #fb923c) 55%, transparent)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 2 }}>System</span>
                    <span style={{ fontSize: 13, fontWeight: 500, fontFamily: "'IBM Plex Mono',monospace", color: 'var(--accent-strong, #fb923c)' }}>
                      {systemLabel[saved.defaultUomSystem ?? 'metric']}
                    </span>
                  </div>
                  {savedSystemUoms.map(({ label, type, uom }) => {
                    const color = UOM_TYPE_COLOR[type] ?? 'var(--text-primary, #e2dfd8)';
                    return (
                      <div key={label} style={{ background: `color-mix(in srgb, ${color} 5%, transparent)`, border: `0.5px solid color-mix(in srgb, ${color} 16%, transparent)`, borderRadius: 7, padding: '5px 10px' }}>
                        <span style={{ fontSize: 9, color: `color-mix(in srgb, ${color} 40%, transparent)`, textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block' }}>{label}</span>
                        <span style={{ fontSize: 13, fontWeight: 500, fontFamily: "'IBM Plex Mono',monospace", color, display: 'block' }}>{uom!.code}</span>
                      </div>
                    );
                  })}
                  {savedSystemUoms.length === 0 && (
                    <span style={{ fontSize: 11, color: 'var(--w22)' }}>No system UOMs saved yet.</span>
                  )}
                </div>
              </div>

              <div className="gs-divider" />

              {/* Preset selector */}
              <Field label="System Preset" hint={isDirty('defaultUomSystem') ? '● pending' : undefined}>
                <p className="gs-sublabel" style={{ marginBottom: 8 }}>Choose a preset to auto-fill, or Custom Mix to pick each individually.</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {(['metric', 'imperial', 'custom'] as UomSystem[]).map(sys => {
                    const active  = form.defaultUomSystem === sys;
                    const isSaved = saved.defaultUomSystem === sys;
                    const sub     = sys === 'metric' ? 'LTR · KG · M · PCS' : sys === 'imperial' ? 'GAL · LB · FT · PCS' : 'Pick each UOM freely →';
                    return (
                      <div key={sys} onClick={() => handleSystemChange(sys)}
                        style={{ padding: '9px 13px', borderRadius: 8, cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif", fontSize: 13, fontWeight: 500, border: `0.5px solid ${active ? 'var(--accent-strong, #fb923c)' : 'var(--l07)'}`, transition: 'all 0.15s', color: active ? 'var(--accent-strong, #fb923c)' : 'var(--w40)', background: active ? 'color-mix(in srgb, var(--accent, #ea580c) 8%, transparent)' : 'var(--l02)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span>{systemLabel[sys]}</span>
                          {isSaved && !isDirty('defaultUomSystem') && <span className="badge-saved">saved</span>}
                          {active && !isSaved && <span className="badge-pending">● pending</span>}
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 400, color: active ? 'color-mix(in srgb, var(--accent-strong, #fb923c) 55%, transparent)' : 'var(--w18)' }}>{sub}</span>
                      </div>
                    );
                  })}
                </div>
              </Field>

              <div className="gs-divider" />

              {/* The 6 UOM pickers */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {UOM_ROWS.map(row => {
                  const color    = UOM_TYPE_COLOR[row.type] ?? 'var(--text-primary, #e2dfd8)';
                  const opts     = byType(row.type);
                  const selId    = form[row.key as keyof SettingsForm] as string ?? '';
                  const savedId  = saved[row.key as keyof SettingsForm] as string ?? '';
                  const selUom   = units.find(u => u.id === selId);
                  const savedUom = units.find(u => u.id === savedId);
                  const dirty    = isDirty(row.key as keyof SettingsForm);

                  return (
                    <div key={row.key} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap' }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
                        <span style={{ fontSize: 11, fontWeight: 500, color, textTransform: 'uppercase', letterSpacing: '0.08em' }}>{row.label}</span>
                        <span style={{ fontSize: 10, color: 'var(--w20)' }}>e.g. {row.example}</span>
                        <span style={{ flex: 1 }} />
                        {savedUom
                          ? <span className="badge-saved" style={{ fontFamily: "'IBM Plex Mono',monospace" }}>{savedUom.code}</span>
                          : <span style={{ fontSize: 10, color: 'var(--w18)', fontStyle: 'italic' }}>not set</span>}
                        {dirty && selUom && selUom.id !== savedId && (
                          <span className="badge-pending" style={{ fontFamily: "'IBM Plex Mono',monospace" }}>→ {selUom.code}</span>
                        )}
                      </div>
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

              {/* How it works */}
              <div style={{ background: 'rgba(96,165,250,0.04)', border: '0.5px solid rgba(96,165,250,0.1)', borderRadius: 9, padding: '10px 13px', fontSize: 10, color: 'var(--w30)', lineHeight: 1.7 }}>
                <strong style={{ color: 'var(--accent-blue, #60a5fa)' }}>How it works:</strong> Formulators, buyers and warehouse staff work in any unit. MRP converts everything to system UOMs at aggregation time. ConsumptionGroups and Item consumption UOMs are restricted to these system units only.
              </div>
            </div>

            {/* ══════════════ COLUMN 3 — Appearance & Theme ══════════════ */}
            <div className="gs-card">
              <div>
                <h3 className="gs-card-title">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/><circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/><path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.555C21.965 6.012 17.461 2 12 2z"/></svg>
                  Appearance &amp; Theme
                </h3>
                <p className="gs-card-sub" style={{ marginTop: 6 }}>Applies instantly and is saved automatically — no Save needed.</p>
              </div>

              <Field label="Theme">
                <SegGroup options={THEMES} value={theme} onChange={chooseTheme} />
              </Field>

              <Field label="Accent color">
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  {ACCENTS.map(p => {
                    const active = p.accent === accent;
                    return (
                      <button key={p.key} type="button" title={p.name} onClick={() => chooseAccent(p)}
                        className="gs-swatch"
                        style={{ background: p.accent, border: active ? '2px solid #fff' : '0.5px solid var(--w15)', boxShadow: active ? `0 0 0 2px ${p.accent}` : 'none' }}>
                        {active && (
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" style={{ position: 'absolute', inset: 0, margin: 'auto' }}><polyline points="20 6 9 17 4 12"/></svg>
                        )}
                      </button>
                    );
                  })}
                </div>
              </Field>

              <Field label="UI density">
                <SegGroup options={DENSITIES} value={density} onChange={chooseDensity} />
                <p className="gs-sublabel" style={{ marginTop: 6 }}>Stored now; row spacing tokens applied in a follow-up.</p>
              </Field>

              <div className="gs-divider" />

              {/* Preview strip */}
              <div>
                <div className="gs-flabel">Preview</div>
                <div style={{ background: 'var(--surface-raised, #15101f)', border: '0.5px solid var(--border, #2a2535)', borderRadius: 10, padding: 14, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                    <button type="button" style={{ background: `linear-gradient(135deg, ${activeAccent.pressed}, ${activeAccent.accent}, ${activeAccent.mid})`, border: 'none', borderRadius: 7, padding: '7px 16px', fontSize: 12, fontWeight: 500, color: '#fff', fontFamily: "'IBM Plex Sans',sans-serif", cursor: 'default' }}>
                      Primary
                    </button>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11, fontWeight: 500, color: activeAccent.strong, background: `color-mix(in srgb, ${activeAccent.accent} 12%, transparent)`, border: `0.5px solid color-mix(in srgb, ${activeAccent.accent} 30%, transparent)`, borderRadius: 20, padding: '2px 10px' }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: activeAccent.accent }} />
                      Badge
                    </span>
                  </div>
                  <div style={{ border: '0.5px solid var(--border, #2a2535)', borderRadius: 8, overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', fontSize: 11, color: 'var(--w45)', background: 'var(--l02)', borderBottom: '0.5px solid var(--border, #2a2535)' }}>
                      <span style={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 9 }}>Sample row</span>
                      <span style={{ textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 9 }}>Value</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', fontSize: 12, color: 'var(--text-primary, #e2dfd8)' }}>
                      <span>Active accent</span>
                      <span style={{ fontFamily: "'IBM Plex Mono',monospace", color: activeAccent.strong }}>{activeAccent.accent}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

          </div>

          {/* ══════════════ FOOTER — Save server-side settings ══════════════ */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 12, marginTop: 18 }}>
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
          </>
        )}
      </div>

      {warn && <WarningModal payload={warn} onCancel={() => setWarn(null)} />}
    </ERPShell>
  );
}
