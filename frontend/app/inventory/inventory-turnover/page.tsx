"use client";

import { useEffect, useState, useCallback, useMemo } from 'react';
import ERPShell                                        from '@/components/layout/ERPShell';
import { ERPTable, ERPColumn }                         from '@/components/ui/ERPTable';
import { ERPFilterBar, ERPFilter, useERPFilters, applyERPFilters, dateSelectionToRange } from '@/components/ui/ERPFilterBar';
import { ERPDatePicker, DateSelection }                from '@/components/ui/ERPDatePicker';
import { warehousesApi }                               from '@/lib/api/warehouses';
import apiClient                                       from '@/lib/api/client';
import { Warehouse }                                   from '@/lib/api/types';

// ─── Types ────────────────────────────────────────────────────────────────────

type Performance = 'excellent' | 'good' | 'fair' | 'poor' | 'no_movement';

interface TurnoverRow {
  itemId:         string;
  itemCode:       string;
  itemName:       string;
  itemType:       string;
  warehouses:     string[];
  openingValue:   number;
  closingValue:   number;
  avgInventory:   number;
  cogs:           number;
  annualizedCogs: number;
  turnoverRatio:  number | null;
  daysOnHand:     number | null;
  performance:    Performance;
}

interface TurnoverSummary {
  totalItems:         number;
  totalCogs:          number;
  totalAvgInventory:  number;
  totalClosingValue:  number;
  overallTurnover:    number | null;
  overallDaysOnHand:  number | null;
  periodDays:         number;
  excellentCount:     number;
  goodCount:          number;
  fairCount:          number;
  poorCount:          number;
  noMovementCount:    number;
}

interface TurnoverData {
  rows:    TurnoverRow[];
  summary: TurnoverSummary;
  period:  { dateFrom: string; dateTo: string; days: number; isAnnualized: boolean };
  asOf:    string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONO: React.CSSProperties = { fontFamily: "'IBM Plex Mono', monospace" };

function fmtAmt(v: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
}
function fmtAmtFull(v: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(v);
}
function fmtRatio(v: number | null) {
  if (v === null) return '—';
  return v.toFixed(2) + '×';
}
function fmtDays(v: number | null) {
  if (v === null) return '—';
  return v.toFixed(1) + 'd';
}
function fmtTimestamp(d: string) {
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const PERF_CFG: Record<Performance, { color: string; bg: string; border: string; label: string; desc: string }> = {
  excellent:   { color: 'var(--success, #4ade80)', bg: 'rgba(74,222,128,0.12)',   border: 'rgba(74,222,128,0.25)',   label: 'Excellent',   desc: '≥ 12× / year' },
  good:        { color: 'var(--accent-blue, #60a5fa)', bg: 'rgba(96,165,250,0.12)',   border: 'rgba(96,165,250,0.25)',   label: 'Good',        desc: '6–12× / year' },
  fair:        { color: 'var(--warning, #fbbf24)', bg: 'rgba(251,191,36,0.12)',   border: 'rgba(251,191,36,0.25)',   label: 'Fair',        desc: '3–6× / year'  },
  poor:        { color: 'var(--danger, #f87171)', bg: 'rgba(248,113,113,0.12)',  border: 'rgba(248,113,113,0.25)',  label: 'Poor',        desc: '< 3× / year'  },
  no_movement: { color: 'var(--w30, rgba(255,255,255,0.3))', bg: 'var(--l04, rgba(255,255,255,0.04))', border: 'var(--w10, rgba(255,255,255,0.1))', label: 'No Movement', desc: 'No issues'    },
};

const ITEM_TYPE_CFG: Record<string, { color: string; label: string }> = {
  finished_good: { color: 'var(--success, #4ade80)', label: 'Finished Good' },
  raw_material:  { color: 'var(--accent-blue, #60a5fa)', label: 'Raw Material'  },
  consumable:    { color: 'var(--warning, #fbbf24)', label: 'Consumable'    },
};

// ─── Turnover gauge ───────────────────────────────────────────────────────────

function TurnoverGauge({ ratio }: { ratio: number | null }) {
  if (ratio === null) return <span style={{ fontSize: 10, color: 'var(--w20, rgba(255,255,255,0.2))' }}>—</span>;
  // Scale: 0–20× mapped to 0–100%
  const pct   = Math.min(100, (ratio / 20) * 100);
  const color = ratio >= 12 ? 'var(--success, #4ade80)' : ratio >= 6 ? 'var(--accent-blue, #60a5fa)' : ratio >= 3 ? 'var(--warning, #fbbf24)' : 'var(--danger, #f87171)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 5, background: 'var(--l06, rgba(255,255,255,0.06))', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 3 }} />
      </div>
      <span style={{ ...MONO, fontSize: 12, fontWeight: 600, color, minWidth: 40, textAlign: 'right' }}>
        {fmtRatio(ratio)}
      </span>
    </div>
  );
}

// ─── Columns ─────────────────────────────────────────────────────────────────

const COLUMNS: ERPColumn<TurnoverRow>[] = [
  {
    key: 'performance', header: 'Performance', width: 130, sortable: true,
    value: r => ({ excellent: 0, good: 1, fair: 2, poor: 3, no_movement: 4 })[r.performance],
    render: r => {
      const c = PERF_CFG[r.performance];
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 500, color: c.color, background: c.bg, border: `0.5px solid ${c.border}`, whiteSpace: 'nowrap' }}>
          {c.label}
        </span>
      );
    },
  },
  {
    key: 'itemCode', header: 'Item', sortable: true,
    value: r => r.itemCode,
    render: r => (
      <div>
        <span style={{ ...MONO, fontSize: 11, color: 'var(--accent-strong, #fb923c)', fontWeight: 500 }}>{r.itemCode}</span>
        <div style={{ fontSize: 10, color: 'var(--w35, rgba(255,255,255,0.35))', marginTop: 1 }}>{r.itemName}</div>
      </div>
    ),
  },
  {
    key: 'itemType', header: 'Type', width: 120, sortable: true,
    value: r => r.itemType,
    render: r => {
      const cfg = ITEM_TYPE_CFG[r.itemType];
      return cfg ? (
        <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 10, color: cfg.color, background: `color-mix(in srgb, ${cfg.color} 8%, transparent)`, border: `0.5px solid color-mix(in srgb, ${cfg.color} 19%, transparent)`, whiteSpace: 'nowrap' }}>
          {cfg.label}
        </span>
      ) : null;
    },
  },
  {
    key: 'avgInventory', header: 'Avg Inventory', width: 130, align: 'right', sortable: true,
    value: r => r.avgInventory,
    render: r => (
      <div style={{ textAlign: 'right' }}>
        <span style={{ ...MONO, fontSize: 12, color: 'var(--text-primary, #e2dfd8)' }}>{fmtAmt(r.avgInventory)}</span>
        <div style={{ fontSize: 9, color: 'var(--w25, rgba(255,255,255,0.25))', marginTop: 1 }}>
          O: {fmtAmt(r.openingValue)} → C: {fmtAmt(r.closingValue)}
        </div>
      </div>
    ),
  },
  {
    key: 'cogs', header: 'COGS (Period)', width: 130, align: 'right', sortable: true,
    value: r => r.cogs,
    render: r => (
      <div style={{ textAlign: 'right' }}>
        <span style={{ ...MONO, fontSize: 12, color: r.cogs > 0 ? 'var(--danger, #f87171)' : 'var(--w25, rgba(255,255,255,0.25))' }}>
          {r.cogs > 0 ? fmtAmt(r.cogs) : '—'}
        </span>
      </div>
    ),
  },
  {
    key: 'annualizedCogs', header: 'COGS (Annual.)', width: 130, align: 'right', sortable: true,
    value: r => r.annualizedCogs,
    render: r => (
      <span style={{ ...MONO, fontSize: 11, color: 'var(--w40, rgba(255,255,255,0.4))' }}>
        {r.annualizedCogs > 0 ? fmtAmt(r.annualizedCogs) : '—'}
      </span>
    ),
  },
  {
    key: 'turnoverRatio', header: 'Turnover Ratio', width: 170, sortable: true,
    value: r => r.turnoverRatio ?? -1,
    render: r => <TurnoverGauge ratio={r.turnoverRatio} />,
  },
  {
    key: 'daysOnHand', header: 'Days on Hand', width: 110, align: 'right', sortable: true,
    value: r => r.daysOnHand ?? 9999,
    render: r => {
      const color = r.daysOnHand === null ? 'var(--w20, rgba(255,255,255,0.2))'
        : r.daysOnHand <= 30  ? 'var(--success, #4ade80)'
        : r.daysOnHand <= 60  ? 'var(--accent-blue, #60a5fa)'
        : r.daysOnHand <= 120 ? 'var(--warning, #fbbf24)'
        : 'var(--danger, #f87171)';
      return (
        <span style={{ ...MONO, fontSize: 13, fontWeight: 600, color }}>
          {fmtDays(r.daysOnHand)}
        </span>
      );
    },
  },
  {
    key: 'warehouses', header: 'Warehouses', width: 100, sortable: false,
    value: r => r.warehouses.join(', '),
    render: r => (
      <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
        {r.warehouses.map(w => (
          <span key={w} style={{ fontSize: 9, padding: '1px 5px', borderRadius: 6, color: 'var(--w40, rgba(255,255,255,0.4))', background: 'var(--l05, rgba(255,255,255,0.05))', border: '0.5px solid var(--w10, rgba(255,255,255,0.1))' }}>{w}</span>
        ))}
      </div>
    ),
  },
];

// ─── Filters ──────────────────────────────────────────────────────────────────

function buildFilters(warehouses: Warehouse[]): ERPFilter<TurnoverRow>[] {
  return [
    {
      key: 'performance', label: 'Performance', type: 'multiselect',
      options: (Object.entries(PERF_CFG) as [Performance, typeof PERF_CFG[Performance]][]).map(([v, c]) => ({
        value: v, label: c.label, color: c.color, bg: c.bg, border: c.border,
      })),
      filterFn: (row, val) => (val as string[]).includes(row.performance),
    },
    {
      key: 'itemType', label: 'Category', type: 'multiselect',
      options: Object.entries(ITEM_TYPE_CFG).map(([v, c]) => ({ value: v, label: c.label, color: c.color })),
      filterFn: (row, val) => (val as string[]).includes(row.itemType),
    },
    {
      key: 'itemSearch', label: 'Item', type: 'search',
      placeholder: 'Code or name…', inputWidth: 180,
      filterFn: (row, val) =>
        row.itemCode.toLowerCase().includes(String(val).toLowerCase()) ||
        row.itemName.toLowerCase().includes(String(val).toLowerCase()),
    },
    {
      key: 'poorOnly', label: 'Poor Only', type: 'boolean',
      placeholder: 'Show poor & no movement',
      filterFn: (row, val) => val === true ? (row.performance === 'poor' || row.performance === 'no_movement') : true,
    },
  ];
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function InventoryTurnoverPage() {
  const currentYear = new Date().getFullYear();
  const [data,       setData]       = useState<TurnoverData | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');

  // Stable default — local midnight dates to avoid UTC timezone shift
  const defaultSel = useMemo<DateSelection>(() => {
    const today = new Date();
    return {
      type: 'range',
      from: new Date(today.getFullYear(), 0, 1),  // Jan 1 local midnight
      to:   new Date(today.getFullYear(), today.getMonth(), today.getDate()), // today local midnight
    };
  }, [currentYear]);

  const [periodSel,  setPeriodSel]  = useState<DateSelection>(defaultSel);
  const [whFilter,   setWhFilter]   = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [cardFilter, setCardFilter] = useState<Performance | null>(null);

  const filters = useMemo(() => buildFilters(warehouses), [warehouses]);
  const { values, setValue, reset, activeCount } = useERPFilters(filters);

  const fetchData = useCallback(async (sel: DateSelection, wh?: string, type?: string) => {
    setLoading(true); setError('');
    try {
      // Strip time component — use local year/month/day only (avoid UTC shift in DR UTC-4)
      const toLocalISO = (d: Date): string => {
        const y   = d.getFullYear();
        const m   = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day}`;
      };

      // dateSelectionToRange handles all 4 picker types: day, range, week, week-range
      const range = dateSelectionToRange(sel);
      const today = new Date();
      const df = range ? toLocalISO(range.from) : `${currentYear}-01-01`;
      const dt = range ? toLocalISO(range.to)   : toLocalISO(today);

      const [turnover, whs] = await Promise.all([
        apiClient.get('/stock-transactions/turnover', {
          params: {
            dateFrom:    df,
            dateTo:      dt,
            warehouseId: wh   || undefined,
            itemType:    type || undefined,
          },
        }),
        warehousesApi.getAll(),
      ]);
      setData(turnover.data as TurnoverData);
      setWarehouses(whs as Warehouse[]);
    } catch { setError('Failed to load inventory turnover.'); }
    finally { setLoading(false); }
  }, [currentYear]);

  useEffect(() => { fetchData(defaultSel); }, []);  // eslint-disable-line

  const handleApply = () => { fetchData(periodSel, whFilter, typeFilter); setCardFilter(null); };

  // Detect if period differs from default (Jan 1 – today) using local dates
  const isPeriodChanged = useMemo(() => {
    const toLocalISO = (d: Date) => {
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${y}-${m}-${day}`;
    };
    if (!periodSel || periodSel.type !== 'range') return true;
    const defFrom = toLocalISO(new Date(currentYear, 0, 1));
    const defTo   = toLocalISO(new Date());
    const selFrom = toLocalISO(periodSel.from);
    const selTo   = toLocalISO(periodSel.to);
    return selFrom !== defFrom || selTo !== defTo;
  }, [periodSel, currentYear]);

  const hasAnyFilter = !!(whFilter || typeFilter || cardFilter || activeCount > 0 || isPeriodChanged);

  const handleResetAll = useCallback(() => {
    const today = new Date();
    const freshSel: DateSelection = {
      type: 'range',
      from: new Date(today.getFullYear(), 0, 1),  // Jan 1 local
      to:   new Date(today.getFullYear(), today.getMonth(), today.getDate()), // today local midnight
    };
    setPeriodSel(freshSel);
    setWhFilter('');
    setTypeFilter('');
    setCardFilter(null);
    reset();
    fetchData(freshSel, '', '');
  }, [currentYear, reset, fetchData]);

  const rows        = data?.rows ?? [];
  const afterFilter = useMemo(() => applyERPFilters(rows, filters, values), [rows, filters, values]);
  const filtered    = useMemo(() => cardFilter ? afterFilter.filter(r => r.performance === cardFilter) : afterFilter, [afterFilter, cardFilter]);

  const SEL: React.CSSProperties = {
    background: 'var(--l04, rgba(255,255,255,0.04))', border: '0.5px solid var(--l09, rgba(255,255,255,0.09))',
    borderRadius: 7, padding: '6px 10px', fontSize: 12,
    fontFamily: "'IBM Plex Sans', sans-serif", color: 'var(--text-primary, #e2dfd8)', outline: 'none', cursor: 'pointer',
  };
  const LBL: React.CSSProperties = { fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(251,146,60,0.5)', marginBottom: 4 };

  return (
    <ERPShell breadcrumbs={['Home', 'Inventory', 'Inventory Turnover']} title="Inventory Turnover">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&display=swap');
        .it-page   { padding: 0 18px 16px; display: flex; flex-direction: column; gap: 10px; height: 100%; overflow: hidden; }
        .it-kpis   { display: grid; grid-template-columns: repeat(5,1fr); gap: 8px; flex-shrink: 0; }
        .it-kpi    { background: rgba(10,7,18,0.7); border-radius: 9px; padding: 10px 14px; }
        .it-kpi-l  { font-size: 9px; font-weight: 500; letter-spacing: 0.1em; text-transform: uppercase; color: var(--w30, rgba(255,255,255,0.3)); margin-bottom: 4px; }
        .it-kpi-v  { font-size: 22px; font-weight: 500; font-family: 'IBM Plex Mono', monospace; }
        .it-kpi-sub{ font-size: 10px; color: var(--w30, rgba(255,255,255,0.3)); margin-top: 2px; }
        .it-cards  { display: grid; grid-template-columns: repeat(5,1fr); gap: 6px; flex-shrink: 0; }
        .it-card   { background: rgba(10,7,18,0.7); border-radius: 8px; padding: 9px 12px; cursor: pointer; transition: all 0.15s; }
        .it-card:hover { opacity: 0.85; }
        .it-card-title { font-size: 9px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 5px; display: flex; align-items: center; gap: 5px; }
        .it-card-count { font-size: 22px; font-weight: 500; font-family: 'IBM Plex Mono', monospace; }
        .it-card-desc  { font-size: 10px; color: var(--w30, rgba(255,255,255,0.3)); margin-top: 2px; }
        .it-period { background: rgba(96,165,250,0.06); border: 0.5px solid rgba(96,165,250,0.15); border-radius: 8px; padding: 10px 16px; display: flex; align-items: flex-end; gap: 12px; flex-wrap: wrap; flex-shrink: 0; }
        .it-filters{ display: flex; align-items: flex-end; gap: 10px; flex-wrap: wrap; flex-shrink: 0; }
        .it-table  { flex: 1; min-height: 0; display: flex; flex-direction: column; }
        .it-error  { background: rgba(239,68,68,0.08); border: 0.5px solid rgba(239,68,68,0.2); border-radius: 8px; padding: 10px 14px; font-size: 13px; color: var(--danger-subtle, #fca5a5); flex-shrink: 0; }
        .it-note   { font-size: 10px; color: var(--w25, rgba(255,255,255,0.25)); flex-shrink: 0; display: flex; align-items: center; gap: 6px; }
        .it-btn-apply { background: linear-gradient(135deg,var(--accent-pressed, #c2410c),var(--accent, #ea580c),var(--accent-mid, #f97316)); border: none; border-radius: 7px; padding: 7px 16px; font-size: 12px; font-weight: 500; font-family: 'IBM Plex Sans',sans-serif; color: white; cursor: pointer; }
      `}</style>

      <div className="it-page">

        {/* KPI bar */}
        <div className="it-kpis">
          {[
            {
              label: 'Overall Turnover',
              value: fmtRatio(data?.summary.overallTurnover ?? null),
              sub:   data?.summary.overallTurnover ? PERF_CFG[
                data.summary.overallTurnover >= 12 ? 'excellent' :
                data.summary.overallTurnover >= 6  ? 'good'      :
                data.summary.overallTurnover >= 3  ? 'fair'      : 'poor'
              ].label : '—',
              color: data?.summary.overallTurnover
                ? data.summary.overallTurnover >= 12 ? 'var(--success, #4ade80)'
                : data.summary.overallTurnover >= 6  ? 'var(--accent-blue, #60a5fa)'
                : data.summary.overallTurnover >= 3  ? 'var(--warning, #fbbf24)' : 'var(--danger, #f87171)'
                : 'var(--w30, rgba(255,255,255,0.3))',
              border: 'rgba(251,146,60,0.2)',
            },
            { label: 'Days on Hand',    value: fmtDays(data?.summary.overallDaysOnHand ?? null), sub: 'avg across items', color: 'var(--accent-violet, #a78bfa)', border: 'rgba(167,139,250,0.15)' },
            { label: 'Total COGS',      value: fmtAmt(data?.summary.totalCogs ?? 0),             sub: 'period issues',   color: 'var(--danger, #f87171)', border: 'rgba(248,113,113,0.15)' },
            { label: 'Avg Inventory',   value: fmtAmt(data?.summary.totalAvgInventory ?? 0),     sub: '(open + close)/2', color: 'var(--accent-blue, #60a5fa)', border: 'rgba(96,165,250,0.15)' },
            { label: 'Closing Value',   value: fmtAmt(data?.summary.totalClosingValue ?? 0),     sub: 'current stock',   color: 'var(--accent-strong, #fb923c)', border: 'rgba(251,146,60,0.15)' },
          ].map(k => (
            <div key={k.label} className="it-kpi" style={{ border: `0.5px solid ${k.border}` }}>
              <div className="it-kpi-l">{k.label}</div>
              <div className="it-kpi-v" style={{ color: k.color, fontSize: k.value.length > 6 ? 16 : 22 }}>{k.value}</div>
              <div className="it-kpi-sub">{k.sub}</div>
            </div>
          ))}
        </div>

        {/* Performance cards */}
        <div className="it-cards">
          {(Object.entries(PERF_CFG) as [Performance, typeof PERF_CFG[Performance]][]).map(([perf, c]) => {
            const countKey = `${perf}Count` as keyof TurnoverSummary;
            const count    = data?.summary[countKey] as number ?? 0;
            const active   = cardFilter === perf;
            return (
              <div key={perf} className="it-card"
                style={{ border: `0.5px solid ${active ? c.border : 'var(--l07, rgba(255,255,255,0.07))'}`, background: active ? c.bg : 'rgba(10,7,18,0.7)' }}
                onClick={() => setCardFilter(prev => prev === perf ? null : perf)}>
                <div className="it-card-title" style={{ color: c.color }}>
                  {c.label}
                </div>
                <div className="it-card-count" style={{ color: c.color }}>{count}</div>
                <div className="it-card-desc">{c.desc}</div>
              </div>
            );
          })}
        </div>

        {error && <div className="it-error">{error}</div>}

        {/* Period selector — triggers backend refetch */}
        <div className="it-period">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={LBL}>Period</span>
            <ERPDatePicker
              value={periodSel}
              onChange={sel => { setPeriodSel(sel); fetchData(sel, whFilter, typeFilter); }}
              placeholder="Select period…"
              width={260}
            />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={LBL}>Warehouse</span>
            <select style={SEL} value={whFilter} onChange={e => setWhFilter(e.target.value)}>
              <option value="">All Warehouses</option>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={LBL}>Category</span>
            <select style={SEL} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
              <option value="">All Categories</option>
              {Object.entries(ITEM_TYPE_CFG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
            </select>
          </div>
          <button className="it-btn-apply" onClick={handleApply} style={{ alignSelf: 'flex-end' }}>
            Apply Period
          </button>
          {hasAnyFilter && (
            <button
              onClick={handleResetAll}
              style={{ alignSelf: 'flex-end', background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.2)', borderRadius: 7, padding: '7px 14px', fontSize: 12, fontFamily: "'IBM Plex Sans',sans-serif", color: 'var(--danger, #f87171)', cursor: 'pointer' }}>
              ↺ Clear All
            </button>
          )}
          {data?.period && (
            <div style={{ alignSelf: 'flex-end', marginLeft: 'auto' }}>
              <span style={{ fontSize: 11, color: 'var(--w30, rgba(255,255,255,0.3))', fontFamily: "'IBM Plex Mono', monospace" }}>
                {data.period.days} days
                {data.period.isAnnualized && (
                  <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--warning, #fbbf24)', background: 'rgba(251,191,36,0.1)', padding: '1px 6px', borderRadius: 4 }}>
                    COGS annualized
                  </span>
                )}
              </span>
            </div>
          )}
        </div>

        {/* Client-side filters */}
        <div className="it-filters">
          <ERPFilterBar
            filters={filters}
            values={values}
            onChange={setValue}
            onReset={reset}
            activeCount={0}
          />
        </div>

        {/* Table */}
        <div className="it-table">
          <ERPTable<TurnoverRow>
            columns={COLUMNS}
            data={filtered}
            rowKey={r => r.itemId}
            loading={loading}
            exportFilename={`inventory-turnover-${data?.period.dateFrom ?? ''}-${data?.period.dateTo ?? ''}`}
            emptyMessage="No data for this period. Post stock movements to calculate turnover."
            defaultPageSize={25}
            maxHeight="calc(100vh - 530px)"
            toolbarLeft={
              data ? (
                <span style={{ fontSize: 11, color: 'var(--w30, rgba(255,255,255,0.3))', fontFamily: "'IBM Plex Mono', monospace" }}>
                  {filtered.length} of {rows.length} items · {fmtTimestamp(data.asOf)}
                </span>
              ) : undefined
            }
          />
        </div>

        {/* Footer note */}
        <div className="it-note">
          <span style={{ color: 'var(--w30, rgba(255,255,255,0.3))', fontSize: 11, fontWeight: 500 }}>Formula:</span>
          <span>
            Turnover = Annualized COGS / Avg Inventory · Days on Hand = 365 / Turnover ·
            Excellent ≥12× · Good 6–12× · Fair 3–6× · Poor &lt;3× ·
            Values use purchaseQty × WAC (ADR-019)
          </span>
        </div>

      </div>
    </ERPShell>
  );
}