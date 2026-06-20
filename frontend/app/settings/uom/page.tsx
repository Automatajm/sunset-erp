// ============================================================================
// frontend/app/settings/uom/page.tsx
// Read-only global UOM catalog (units + conversions are seeded, no CRUD).
// spec-ux-t2-master-data T2.1 — ERPTable + ERPFilterBar + SearchSelect.
// ============================================================================
"use client";
import { useEffect, useState, useCallback, useMemo } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import SearchSelect from '@/components/ui/SearchSelect';
import { ERPTable, ERPColumn } from '@/components/ui/ERPTable';
import { ERPFilterBar, ERPFilter, useERPFilters, applyERPFilters } from '@/components/ui/ERPFilterBar';
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

  // ── Converter dropdown options ─────────────────────────────────────────────
  const codeOpts = useMemo(
    () => units.map(u => ({ value: u.code, label: u.code, sublabel: u.name })),
    [units],
  );

  // ── Units: filters ─────────────────────────────────────────────────────────
  const types   = useMemo(() => [...new Set(units.map(u => u.type))].sort(),   [units]);
  const systems = useMemo(() => [...new Set(units.map(u => u.system))].sort(), [units]);

  const unitFilters = useMemo<ERPFilter<UomUnit>[]>(() => [
    {
      key: 'search', label: 'Search', type: 'search', placeholder: 'Search code or name…',
      filterFn: (row, val) => {
        const q = String(val).toLowerCase();
        return row.code.toLowerCase().includes(q) || row.name.toLowerCase().includes(q);
      },
    },
    { key: 'type',   label: 'Type',   type: 'multiselect', options: types.map(t => ({ value: t, label: t, color: TYPE_COLORS[t] })) },
    { key: 'system', label: 'System', type: 'multiselect', options: systems.map(s => ({ value: s, label: s, color: SYS_COLORS[s] })) },
  ], [types, systems]);

  const { values: unitVals, setValue: setUnitVal, reset: resetUnits, activeCount: unitCount } = useERPFilters(unitFilters);
  const filteredUnits = useMemo(() => applyERPFilters(units, unitFilters, unitVals), [units, unitFilters, unitVals]);

  // ── Units: columns ─────────────────────────────────────────────────────────
  const unitColumns = useMemo<ERPColumn<UomUnit>[]>(() => [
    {
      key: 'code', header: 'Code', width: 120, sortable: true,
      value: r => r.code,
      render: r => <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: 'var(--accent-strong, #fb923c)', fontWeight: 500 }}>{r.code}</span>,
    },
    {
      key: 'name', header: 'Name', sortable: true,
      value: r => r.name,
      render: r => <span style={{ color: 'var(--text-primary, #e2dfd8)' }}>{r.name}</span>,
    },
    {
      key: 'symbol', header: 'Symbol', width: 100, sortable: true,
      value: r => r.symbol ?? '',
      render: r => <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>{r.symbol ?? '—'}</span>,
    },
    {
      key: 'type', header: 'Type', width: 130, sortable: true,
      value: r => r.type,
      render: r => <Badge label={r.type} color={TYPE_COLORS[r.type] ?? 'var(--text-primary, #e2dfd8)'} />,
    },
    {
      key: 'system', header: 'System', width: 130, sortable: true,
      value: r => r.system,
      render: r => <Badge label={r.system} color={SYS_COLORS[r.system] ?? 'var(--text-primary, #e2dfd8)'} />,
    },
    {
      key: 'isBase', header: 'Base', width: 90, align: 'center', sortable: true,
      value: r => r.isBase ? 'Base' : '',
      render: r => r.isBase
        ? <span style={{ fontSize: 11, color: 'var(--success, #4ade80)', background: 'rgba(74,222,128,0.08)', border: '0.5px solid rgba(74,222,128,0.2)', padding: '2px 9px', borderRadius: 20 }}>Base</span>
        : <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>—</span>,
    },
  ], []);

  // ── Conversions: columns ───────────────────────────────────────────────────
  const convColumns = useMemo<ERPColumn<UomConversion>[]>(() => [
    {
      key: 'from', header: 'From', sortable: true,
      value: r => r.fromUom.code,
      render: r => <span><span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: 'var(--accent-strong, #fb923c)' }}>{r.fromUom.code}</span> <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>({r.fromUom.name})</span></span>,
    },
    {
      key: 'to', header: 'To', sortable: true,
      value: r => r.toUom.code,
      render: r => <span><span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: 'var(--accent-strong, #fb923c)' }}>{r.toUom.code}</span> <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12 }}>({r.toUom.name})</span></span>,
    },
    {
      key: 'factor', header: 'Factor', width: 160, align: 'right', sortable: true,
      value: r => Number(r.factor),
      render: r => <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: 'var(--accent-strong, #fb923c)' }}>{Number(r.factor).toFixed(6)}</span>,
    },
    {
      key: 'type', header: 'Type', width: 130, sortable: true,
      value: r => r.fromUom.type,
      render: r => <Badge label={r.fromUom.type} color={TYPE_COLORS[r.fromUom.type] ?? 'var(--text-primary, #e2dfd8)'} />,
    },
  ], []);

  return (
    <ERPShell breadcrumbs={['Home', 'Settings', 'Units of Measure']} title="UOM Catalog">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap');
        .uom-page { padding: 0 18px 12px; display:flex; flex-direction:column; height:100%; overflow:hidden; }
        .uom-tabs { display:flex; gap:4px; margin-bottom:14px; flex-shrink:0; }
        .uom-tab { padding:6px 14px; border-radius:7px; font-size:12px; cursor:pointer; font-family:'IBM Plex Sans',sans-serif; border:0.5px solid transparent; transition:all 0.15s; color:rgba(255,255,255,0.4); background:rgba(255,255,255,0.04); }
        .uom-tab-active { color:var(--accent-strong, #fb923c); background:rgba(251,146,60,0.1); border-color:rgba(251,146,60,0.3); }
        .uom-input { background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.09); border-radius:7px; padding:7px 12px; font-size:12px; font-family:'IBM Plex Sans',sans-serif; color:var(--text-primary, #e2dfd8); outline:none; }
        .uom-input:focus { border-color:rgba(251,146,60,0.4); }
        .uom-converter { background:rgba(10,7,18,0.7); border:0.5px solid rgba(251,146,60,0.12); border-radius:10px; padding:16px 18px; margin-bottom:14px; flex-shrink:0; }
        .uom-conv-hdr { font-size:11px; font-weight:500; letter-spacing:0.08em; text-transform:uppercase; color:rgba(251,146,60,0.55); margin-bottom:12px; }
        .uom-conv-row { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
        .uom-conv-result { margin-top:10px; font-size:13px; color:var(--success, #4ade80); font-family:'IBM Plex Mono',monospace; background:rgba(74,222,128,0.06); border:0.5px solid rgba(74,222,128,0.2); border-radius:7px; padding:8px 12px; }
        .uom-btn { background:linear-gradient(135deg,var(--accent-pressed, #c2410c),var(--accent, #ea580c),var(--accent-mid, #f97316)); border:none; border-radius:7px; padding:7px 14px; font-size:12px; font-weight:500; font-family:'IBM Plex Sans',sans-serif; color:white; cursor:pointer; transition:opacity 0.2s; }
        .uom-btn:disabled { opacity:0.5; cursor:not-allowed; }
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
            <div style={{ width: 150 }}>
              <SearchSelect options={codeOpts} value={from} onChange={setFrom} placeholder="From…" minWidth={220} />
            </div>
            <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>→</span>
            <div style={{ width: 150 }}>
              <SearchSelect options={codeOpts} value={to} onChange={setTo} placeholder="To…" minWidth={220} />
            </div>
            <button className="uom-btn" onClick={handleConvert} disabled={converting}>
              {converting ? '…' : 'Convert'}
            </button>
          </div>
          {result && <div className="uom-conv-result">{result}</div>}
        </div>

        {tab === 'units' && (
          <>
            <div style={{ marginBottom: 10, flexShrink: 0 }}>
              <ERPFilterBar
                filters={unitFilters}
                values={unitVals}
                onChange={setUnitVal}
                onReset={resetUnits}
                activeCount={unitCount}
              />
            </div>
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <ERPTable<UomUnit>
                columns={unitColumns}
                data={filteredUnits}
                rowKey={r => r.id}
                loading={loading}
                exportFilename="uom-units"
                emptyMessage={unitCount ? 'No units match your filters.' : 'No units in catalog.'}
                defaultPageSize={25}
                maxHeight="100%"
              />
            </div>
          </>
        )}

        {tab === 'conversions' && (
          <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <ERPTable<UomConversion>
              columns={convColumns}
              data={conversions}
              rowKey={r => r.id}
              loading={loading}
              exportFilename="uom-conversions"
              emptyMessage="No conversions in catalog."
              defaultPageSize={25}
              maxHeight="100%"
            />
          </div>
        )}
      </div>
    </ERPShell>
  );
}
