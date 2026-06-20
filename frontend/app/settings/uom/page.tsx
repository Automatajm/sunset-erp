// ============================================================================
// frontend/app/settings/uom/page.tsx
// ============================================================================
"use client";
import { useEffect, useState, useCallback } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import { uomApi } from '@/lib/api/uom';
import { UomUnit, UomConversion } from '@/lib/api/types';
 
const TYPE_COLORS: Record<string, string> = {
  volume: 'var(--accent-blue, #60a5fa)', mass: 'var(--accent-violet, #a78bfa)', count: 'var(--success, #4ade80)',
  length: 'var(--warning, #fbbf24)', area: 'var(--accent-strong, #fb923c)', time: 'var(--danger, #f87171)',
};
const SYS_COLORS: Record<string, string> = {
  metric: 'var(--success, #4ade80)', imperial: 'var(--warning, #fbbf24)', universal: 'var(--accent-blue, #60a5fa)',
};
 
function Badge({ label, color }: { label: string; color: string }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px',
      borderRadius: 20, fontSize: 11, fontWeight: 500,
      color, background: `color-mix(in srgb, ${color} 8%, transparent)`, border: `0.5px solid color-mix(in srgb, ${color} 21%, transparent)`,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: color, flexShrink: 0 }} />
      {label}
    </span>
  );
}
 
export default function UomCatalogPage() {
  const [units,       setUnits]       = useState<UomUnit[]>([]);
  const [conversions, setConversions] = useState<UomConversion[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [tab,         setTab]         = useState<'units' | 'conversions'>('units');
  const [typeFilter,  setTypeFilter]  = useState('');
  const [sysFilter,   setSysFilter]   = useState('');
  const [search,      setSearch]      = useState('');
  const [from,        setFrom]        = useState('GAL');
  const [to,          setTo]          = useState('LTR');
  const [qty,         setQty]         = useState('50');
  const [result,      setResult]      = useState<string>('');
  const [converting,  setConverting]  = useState(false);
 
  const fetch_ = useCallback(async () => {
    try {
      const [u, c] = await Promise.all([uomApi.getUnits(), uomApi.getConversions()]);
      setUnits(u); setConversions(c);
    } catch {} finally { setLoading(false); }
  }, []);
 
  useEffect(() => { fetch_(); }, [fetch_]);
 
  const handleConvert = async () => {
    setConverting(true); setResult('');
    try {
      const r = await uomApi.convert(from, to, Number(qty));
      setResult(`${qty} ${r.fromUom} = ${r.outputQty} ${r.toUom} (factor: ${r.factor})`);
    } catch (e: any) {
      setResult(e?.response?.data?.message ?? 'Conversion not found in catalog');
    } finally { setConverting(false); }
  };
 
  const filteredUnits = units.filter(u => {
    if (typeFilter && u.type !== typeFilter) return false;
    if (sysFilter  && u.system !== sysFilter) return false;
    if (search && !u.code.toLowerCase().includes(search.toLowerCase()) && !u.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });
 
  const types   = [...new Set(units.map(u => u.type))].sort();
  const systems = [...new Set(units.map(u => u.system))].sort();
  const codes   = units.map(u => u.code);
 
  return (
    <ERPShell breadcrumbs={['Home', 'Settings', 'Units of Measure']} title="UOM Catalog">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap');
        .uom-page { padding: 0 18px 24px; }
        .uom-tabs { display:flex; gap:4px; margin-bottom:14px; }
        .uom-tab { padding:6px 14px; border-radius:7px; font-size:12px; cursor:pointer; font-family:'IBM Plex Sans',sans-serif; border:0.5px solid transparent; transition:all 0.15s; color:rgba(255,255,255,0.4); background:rgba(255,255,255,0.04); }
        .uom-tab-active { color:var(--accent-strong, #fb923c); background:rgba(251,146,60,0.1); border-color:rgba(251,146,60,0.3); }
        .uom-toolbar { display:flex; gap:8px; margin-bottom:12px; flex-wrap:wrap; align-items:center; }
        .uom-input { background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.09); border-radius:7px; padding:7px 12px; font-size:12px; font-family:'IBM Plex Sans',sans-serif; color:var(--text-primary, #e2dfd8); outline:none; }
        .uom-input:focus { border-color:rgba(251,146,60,0.4); }
        .uom-select { background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.09); border-radius:7px; padding:7px 12px; font-size:12px; font-family:'IBM Plex Sans',sans-serif; color:var(--text-primary, #e2dfd8); outline:none; cursor:pointer; }
        .uom-select option { background:var(--surface, #0e0b1a); }
        .uom-wrap { background:rgba(10,7,18,0.7); border:0.5px solid rgba(251,146,60,0.12); border-radius:10px; overflow:hidden; }
        .uom-table { width:100%; border-collapse:collapse; }
        .uom-table thead th { padding:9px 14px; font-size:10px; font-weight:500; letter-spacing:0.1em; text-transform:uppercase; color:rgba(251,146,60,0.55); background:rgba(251,146,60,0.05); border-bottom:0.5px solid rgba(255,255,255,0.06); text-align:left; }
        .uom-table tbody td { padding:10px 14px; border-bottom:0.5px solid rgba(255,255,255,0.04); font-size:13px; }
        .uom-table tbody tr:last-child td { border-bottom:none; }
        .uom-table tbody tr:hover td { background:rgba(251,146,60,0.03); }
        .uom-code { font-family:'IBM Plex Mono',monospace; font-size:12px; color:var(--accent-strong, #fb923c); }
        .uom-muted { color:rgba(255,255,255,0.4); font-size:12px; }
        .uom-converter { background:rgba(10,7,18,0.7); border:0.5px solid rgba(251,146,60,0.12); border-radius:10px; padding:16px 18px; margin-bottom:14px; }
        .uom-conv-hdr { font-size:11px; font-weight:500; letter-spacing:0.08em; text-transform:uppercase; color:rgba(251,146,60,0.55); margin-bottom:12px; }
        .uom-conv-row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
        .uom-conv-result { margin-top:10px; font-size:13px; color:var(--success, #4ade80); font-family:'IBM Plex Mono',monospace; background:rgba(74,222,128,0.06); border:0.5px solid rgba(74,222,128,0.2); border-radius:7px; padding:8px 12px; }
        .uom-btn { background:linear-gradient(135deg,var(--accent-pressed, #c2410c),var(--accent, #ea580c),var(--accent-mid, #f97316)); border:none; border-radius:7px; padding:7px 14px; font-size:12px; font-weight:500; font-family:'IBM Plex Sans',sans-serif; color:white; cursor:pointer; transition:opacity 0.2s; }
        .uom-btn:disabled { opacity:0.5; cursor:not-allowed; }
        .uom-footer { font-size:11px; color:rgba(255,255,255,0.22); padding:8px 14px; border-top:0.5px solid rgba(255,255,255,0.04); }
        .uom-loading { text-align:center; padding:52px; color:rgba(255,255,255,0.25); font-size:13px; }
      `}</style>
 
      <div className="uom-page">
        <div className="uom-tabs">
          {(['units', 'conversions'] as const).map(t => (
            <button key={t} className={`uom-tab${tab === t ? ' uom-tab-active' : ''}`} onClick={() => setTab(t)}>
              {t === 'units' ? `Units (${units.length})` : `Conversions (${conversions.length})`}
            </button>
          ))}
        </div>
 
        {/* Converter widget */}
        <div className="uom-converter">
          <div className="uom-conv-hdr">Quick Converter</div>
          <div className="uom-conv-row">
            <input className="uom-input" style={{ width: 80 }} type="number" value={qty} onChange={e => setQty(e.target.value)} />
            <select className="uom-select" value={from} onChange={e => setFrom(e.target.value)}>
              {codes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>→</span>
            <select className="uom-select" value={to} onChange={e => setTo(e.target.value)}>
              {codes.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <button className="uom-btn" onClick={handleConvert} disabled={converting}>
              {converting ? '…' : 'Convert'}
            </button>
          </div>
          {result && <div className="uom-conv-result">{result}</div>}
        </div>
 
        {tab === 'units' && (
          <>
            <div className="uom-toolbar">
              <input className="uom-input" style={{ width: 220 }} placeholder="Search code or name…" value={search} onChange={e => setSearch(e.target.value)} />
              <select className="uom-select" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
                <option value="">All types</option>
                {types.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select className="uom-select" value={sysFilter} onChange={e => setSysFilter(e.target.value)}>
                <option value="">All systems</option>
                {systems.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div className="uom-wrap">
              {loading ? <div className="uom-loading">Loading…</div> : (
                <>
                  <table className="uom-table">
                    <thead>
                      <tr>
                        <th>Code</th><th>Name</th><th>Symbol</th><th>Type</th><th>System</th><th>Base</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredUnits.map(u => (
                        <tr key={u.id}>
                          <td><span className="uom-code">{u.code}</span></td>
                          <td style={{ color: 'var(--text-primary, #e2dfd8)' }}>{u.name}</td>
                          <td><span className="uom-muted">{u.symbol ?? '—'}</span></td>
                          <td><Badge label={u.type} color={TYPE_COLORS[u.type] ?? 'var(--text-primary, #e2dfd8)'} /></td>
                          <td><Badge label={u.system} color={SYS_COLORS[u.system] ?? 'var(--text-primary, #e2dfd8)'} /></td>
                          <td>{u.isBase ? <span style={{ color: 'var(--success, #4ade80)', fontSize: 12 }}>✓ base</span> : <span className="uom-muted">—</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="uom-footer">{filteredUnits.length} of {units.length} units</div>
                </>
              )}
            </div>
          </>
        )}
 
        {tab === 'conversions' && (
          <div className="uom-wrap">
            {loading ? <div className="uom-loading">Loading…</div> : (
              <>
                <table className="uom-table">
                  <thead>
                    <tr><th>From</th><th>To</th><th>Factor</th><th>Type</th></tr>
                  </thead>
                  <tbody>
                    {conversions.map(c => (
                      <tr key={c.id}>
                        <td><span className="uom-code">{c.fromUom.code}</span> <span className="uom-muted">({c.fromUom.name})</span></td>
                        <td><span className="uom-code">{c.toUom.code}</span> <span className="uom-muted">({c.toUom.name})</span></td>
                        <td style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: 'var(--accent-strong, #fb923c)' }}>{Number(c.factor).toFixed(6)}</td>
                        <td><Badge label={c.fromUom.type} color={TYPE_COLORS[c.fromUom.type] ?? 'var(--text-primary, #e2dfd8)'} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="uom-footer">{conversions.length} conversions</div>
              </>
            )}
          </div>
        )}
      </div>
    </ERPShell>
  );
}