"use client";

import { useEffect, useState, useCallback, useMemo } from 'react';
import ERPShell                                        from '@/components/layout/ERPShell';
import { ERPTable, ERPColumn }                         from '@/components/ui/ERPTable';
import { ERPFilterBar, ERPFilter, useERPFilters, applyERPFilters } from '@/components/ui/ERPFilterBar';
import { warehousesApi }                               from '@/lib/api/warehouses';
import apiClient                                       from '@/lib/api/client';
import { Warehouse }                                   from '@/lib/api/types';

// ─── Types ────────────────────────────────────────────────────────────────────

type AgingBucket = '0-30' | '31-60' | '61-90' | '91-180' | '180+' | 'no_movement';
type RiskLevel   = 'dead' | 'critical' | 'slow' | 'watch';

interface AgingRow {
  itemId:                string;
  itemCode:              string;
  itemName:              string;
  itemType:              string;
  warehouseId:           string;
  warehouseCode:         string;
  warehouseName:         string;
  purchaseQty:           number;
  storageQty:            number;
  uom:                   string;
  purchaseUom:           string;
  unitCost:              number;
  totalValue:            number;
  lastMovementDate:      string | null;
  daysSinceLastMovement: number | null;
  agingBucket:           AgingBucket;
  isSlowMoving:          boolean;
  isDead:                boolean;
}

interface AgingSummary {
  totalItems:      number;
  totalValue:      number;
  slowMovingCount: number;
  slowMovingValue: number;
  deadStockCount:  number;
  deadStockValue:  number;
  buckets:         Record<AgingBucket, { count: number; value: number }>;
}

interface AgingData { rows: AgingRow[]; summary: AgingSummary; asOf: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONO: React.CSSProperties = { fontFamily: "'IBM Plex Mono', monospace" };

function fmtAmt(v: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(v);
}
function fmtQty(v: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(v);
}
function fmtDateShort(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtTimestamp(d: string) {
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function getRisk(row: AgingRow): RiskLevel {
  if (row.isDead || row.agingBucket === 'no_movement') return 'dead';
  if (row.agingBucket === '91-180')                    return 'critical';
  if (row.agingBucket === '61-90')                     return 'slow';
  return 'watch';
}

const RISK_CFG: Record<RiskLevel, { color: string; bg: string; border: string; label: string }> = {
  dead:     { color: '#f87171', bg: 'rgba(248,113,113,0.15)', border: 'rgba(248,113,113,0.3)', label: 'Dead Stock'    },
  critical: { color: '#fb923c', bg: 'rgba(251,146,60,0.12)',  border: 'rgba(251,146,60,0.25)', label: 'Critical Slow' },
  slow:     { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  border: 'rgba(251,191,36,0.25)', label: 'Slow Moving'   },
  watch:    { color: '#a78bfa', bg: 'rgba(167,139,250,0.1)',  border: 'rgba(167,139,250,0.2)', label: 'Watch'         },
};

const ITEM_TYPE_CFG: Record<string, { color: string; label: string }> = {
  finished_good: { color: '#4ade80', label: 'Finished Good' },
  raw_material:  { color: '#60a5fa', label: 'Raw Material'  },
  consumable:    { color: '#fbbf24', label: 'Consumable'    },
};

// ─── Columns ─────────────────────────────────────────────────────────────────

const COLUMNS: ERPColumn<AgingRow>[] = [
  {
    key: 'risk', header: 'Risk', width: 130, sortable: true,
    value: r => ({ dead: 0, critical: 1, slow: 2, watch: 3 })[getRisk(r)],
    render: r => {
      const c = RISK_CFG[getRisk(r)];
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 500, color: c.color, background: c.bg, border: `0.5px solid ${c.border}`, whiteSpace: 'nowrap' }}>
          {c.label}
        </span>
      );
    },
  },
  {
    key: 'daysSinceLastMovement', header: 'Days Idle', width: 80, align: 'right', sortable: true,
    value: r => r.daysSinceLastMovement ?? 9999,
    render: r => {
      const c = RISK_CFG[getRisk(r)];
      return r.daysSinceLastMovement !== null
        ? <span style={{ ...MONO, fontSize: 14, fontWeight: 700, color: c.color }}>{r.daysSinceLastMovement}d</span>
        : <span style={{ fontSize: 10, color: '#f87171' }}>Never</span>;
    },
  },
  {
    key: 'itemCode', header: 'Item', sortable: true,
    value: r => r.itemCode,
    render: r => (
      <div>
        <span style={{ ...MONO, fontSize: 11, color: '#fb923c', fontWeight: 500 }}>{r.itemCode}</span>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>{r.itemName}</div>
      </div>
    ),
  },
  {
    key: 'itemType', header: 'Type', width: 120, sortable: true,
    value: r => r.itemType,
    render: r => {
      const cfg = ITEM_TYPE_CFG[r.itemType];
      return cfg ? (
        <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 10, color: cfg.color, background: `${cfg.color}15`, border: `0.5px solid ${cfg.color}30`, whiteSpace: 'nowrap' }}>
          {cfg.label}
        </span>
      ) : null;
    },
  },
  {
    key: 'warehouseCode', header: 'Warehouse', width: 110, sortable: true,
    value: r => r.warehouseCode,
    render: r => (
      <div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{r.warehouseCode}</div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 1 }}>{r.warehouseName}</div>
      </div>
    ),
  },
  {
    key: 'storageQty', header: 'On Hand', width: 100, align: 'right', sortable: true,
    value: r => r.storageQty,
    render: r => (
      <div style={{ textAlign: 'right' }}>
        <span style={{ ...MONO, fontSize: 12, color: '#e2dfd8' }}>{fmtQty(r.storageQty)}</span>
        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', marginTop: 1 }}>{r.uom}</div>
      </div>
    ),
  },
  {
    key: 'purchaseQty', header: 'Purchase Qty', width: 110, align: 'right', sortable: true,
    value: r => r.purchaseQty,
    render: r => (
      <div style={{ textAlign: 'right' }}>
        <span style={{ ...MONO, fontSize: 12, color: '#fb923c' }}>{fmtQty(r.purchaseQty)}</span>
        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', marginTop: 1 }}>{r.purchaseUom}</div>
      </div>
    ),
  },
  {
    key: 'unitCost', header: 'WAC Cost', width: 110, align: 'right', sortable: true,
    value: r => r.unitCost,
    render: r => <span style={{ ...MONO, fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{r.unitCost > 0 ? fmtAmt(r.unitCost) : '—'}</span>,
  },
  {
    key: 'totalValue', header: 'Capital Tied Up', width: 140, align: 'right', sortable: true,
    value: r => r.totalValue,
    render: r => {
      const c = RISK_CFG[getRisk(r)];
      return (
        <div style={{ textAlign: 'right' }}>
          <span style={{ ...MONO, fontSize: 13, fontWeight: 700, color: c.color }}>{fmtAmt(r.totalValue)}</span>
        </div>
      );
    },
  },
  {
    key: 'lastMovementDate', header: 'Last Movement', width: 130, sortable: true,
    value: r => r.lastMovementDate ?? '',
    render: r => r.lastMovementDate
      ? <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{fmtDateShort(r.lastMovementDate)}</span>
      : <span style={{ fontSize: 10, color: '#f87171', fontWeight: 500 }}>Never moved</span>,
  },
];

// ─── Filters ──────────────────────────────────────────────────────────────────

function buildFilters(warehouses: Warehouse[]): ERPFilter<AgingRow>[] {
  return [
    {
      key: 'riskLevel', label: 'Risk', type: 'multiselect',
      options: (Object.entries(RISK_CFG) as [RiskLevel, typeof RISK_CFG[RiskLevel]][]).map(([v, c]) => ({
        value: v, label: c.label, color: c.color, bg: c.bg, border: c.border,
      })),
      filterFn: (row, val) => (val as string[]).includes(getRisk(row)),
    },
    {
      key: 'warehouseId', label: 'Warehouse', type: 'searchselect',
      placeholder: 'All warehouses', selectWidth: 200,
      options: warehouses.map(w => ({ value: w.id, label: w.code, sublabel: w.name })),
      filterFn: (row, val) => row.warehouseId === String(val),
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
  ];
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SlowMovingPage() {
  const [data,       setData]       = useState<AgingData | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [cardFilter, setCardFilter] = useState<RiskLevel | null>(null);

  const filters = useMemo(() => buildFilters(warehouses), [warehouses]);
  const { values, setValue, reset, activeCount } = useERPFilters(filters);

  const fetchData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [aging, whs] = await Promise.all([
        apiClient.get('/stock-transactions/aging'),
        warehousesApi.getAll(),
      ]);
      setData(aging.data as AgingData);
      setWarehouses(whs as Warehouse[]);
    } catch { setError('Failed to load slow moving stock.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const slowRows    = useMemo(() => (data?.rows ?? []).filter(r => r.isSlowMoving || r.isDead || r.agingBucket === 'no_movement'), [data]);
  const afterFilter = useMemo(() => applyERPFilters(slowRows, filters, values), [slowRows, filters, values]);
  const filtered    = useMemo(() => cardFilter ? afterFilter.filter(r => getRisk(r) === cardFilter) : afterFilter, [afterFilter, cardFilter]);

  const slowSummary = useMemo(() => {
    const byRisk = { dead: { count: 0, value: 0 }, critical: { count: 0, value: 0 }, slow: { count: 0, value: 0 }, watch: { count: 0, value: 0 } };
    for (const r of slowRows) {
      const risk = getRisk(r);
      byRisk[risk].count++;
      byRisk[risk].value = Math.round((byRisk[risk].value + r.totalValue) * 100) / 100;
    }
    return byRisk;
  }, [slowRows]);

  const totalAtRisk         = useMemo(() => slowRows.reduce((s, r) => s + r.totalValue, 0), [slowRows]);
  const totalInventoryValue = data?.summary.totalValue ?? 0;
  const atRiskPct           = totalInventoryValue > 0 ? (totalAtRisk / totalInventoryValue * 100).toFixed(1) : '0.0';

  return (
    <ERPShell breadcrumbs={['Home', 'Inventory', 'Slow Moving & Dead Stock']} title="Slow Moving & Dead Stock">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&display=swap');
        .sm-page   { padding: 0 18px 16px; display: flex; flex-direction: column; gap: 10px; height: 100%; overflow: hidden; }
        .sm-kpis   { display: grid; grid-template-columns: repeat(5,1fr); gap: 8px; flex-shrink: 0; }
        .sm-kpi    { background: rgba(10,7,18,0.7); border-radius: 9px; padding: 10px 14px; }
        .sm-kpi-l  { font-size: 9px; font-weight: 500; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,0.3); margin-bottom: 4px; }
        .sm-kpi-v  { font-size: 18px; font-weight: 500; font-family: 'IBM Plex Mono', monospace; }
        .sm-cards  { display: grid; grid-template-columns: repeat(4,1fr); gap: 8px; flex-shrink: 0; }
        .sm-card   { background: rgba(10,7,18,0.7); border-radius: 9px; padding: 12px 16px; cursor: pointer; transition: all 0.15s; }
        .sm-card:hover { opacity: 0.85; }
        .sm-card-title { font-size: 10px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 8px; }
        .sm-card-row   { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 3px; }
        .sm-card-label { font-size: 11px; color: rgba(255,255,255,0.4); }
        .sm-card-value { font-size: 13px; font-weight: 500; font-family: 'IBM Plex Mono', monospace; }
        .sm-card-bar   { height: 3px; background: rgba(255,255,255,0.06); border-radius: 2px; margin-top: 8px; overflow: hidden; }
        .sm-alert-banner { background: rgba(248,113,113,0.08); border: 0.5px solid rgba(248,113,113,0.2); border-radius: 8px; padding: 10px 16px; display: flex; align-items: center; gap: 10px; flex-shrink: 0; }
        .sm-filters { display: flex; align-items: flex-end; gap: 10px; flex-wrap: wrap; flex-shrink: 0; }
        .sm-table   { flex: 1; min-height: 0; display: flex; flex-direction: column; }
        .sm-error   { background: rgba(239,68,68,0.08); border: 0.5px solid rgba(239,68,68,0.2); border-radius: 8px; padding: 10px 14px; font-size: 13px; color: #fca5a5; flex-shrink: 0; }
        .sm-note    { font-size: 10px; color: rgba(255,255,255,0.25); flex-shrink: 0; display: flex; align-items: center; gap: 6px; }
        .sm-refresh { display: inline-flex; align-items: center; gap: 5px; background: rgba(255,255,255,0.04); border: 0.5px solid rgba(255,255,255,0.09); border-radius: 7px; padding: 6px 12px; font-size: 12px; font-family: 'IBM Plex Sans',sans-serif; color: rgba(255,255,255,0.45); cursor: pointer; }
        .sm-refresh:hover { color: rgba(255,255,255,0.7); background: rgba(255,255,255,0.08); }
      `}</style>

      <div className="sm-page">

        {/* KPI bar */}
        <div className="sm-kpis">
          {[
            { label: 'Items at Risk',   value: String(slowRows.length),                   color: '#f87171', border: 'rgba(248,113,113,0.2)'  },
            { label: 'Capital Tied Up', value: fmtAmt(totalAtRisk),                       color: '#f87171', border: 'rgba(248,113,113,0.2)'  },
            { label: '% of Inventory',  value: atRiskPct + '%',                           color: '#fb923c', border: 'rgba(251,146,60,0.2)'   },
            { label: 'Dead Stock Items',value: String(data?.summary.deadStockCount ?? 0), color: '#f87171', border: 'rgba(248,113,113,0.15)' },
            { label: 'Dead Stock Value',value: fmtAmt(data?.summary.deadStockValue ?? 0), color: '#f87171', border: 'rgba(248,113,113,0.15)' },
          ].map(k => (
            <div key={k.label} className="sm-kpi" style={{ border: `0.5px solid ${k.border}` }}>
              <div className="sm-kpi-l">{k.label}</div>
              <div className="sm-kpi-v" style={{ color: k.color, fontSize: k.value.length > 8 ? 14 : 18 }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Risk cards */}
        <div className="sm-cards">
          {(Object.entries(RISK_CFG) as [RiskLevel, typeof RISK_CFG[RiskLevel]][]).map(([risk, c]) => {
            const info   = slowSummary[risk];
            const active = cardFilter === risk;
            const pct    = totalAtRisk > 0 ? (info.value / totalAtRisk * 100) : 0;
            return (
              <div key={risk} className="sm-card"
                style={{ border: `0.5px solid ${active ? c.border : 'rgba(255,255,255,0.07)'}`, background: active ? c.bg : 'rgba(10,7,18,0.7)' }}
                onClick={() => setCardFilter(prev => prev === risk ? null : risk)}>
                <div className="sm-card-title" style={{ color: c.color }}>{c.label}</div>
                <div className="sm-card-row">
                  <span className="sm-card-label">Items</span>
                  <span className="sm-card-value" style={{ color: c.color }}>{info.count}</span>
                </div>
                <div className="sm-card-row">
                  <span className="sm-card-label">Value</span>
                  <span className="sm-card-value" style={{ color: c.color, fontSize: 12 }}>{fmtAmt(info.value)}</span>
                </div>
                <div className="sm-card-bar">
                  <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: c.color, borderRadius: 2, opacity: 0.7 }} />
                </div>
              </div>
            );
          })}
        </div>

        {/* Alert banner */}
        {(data?.summary.deadStockCount ?? 0) > 0 && !cardFilter && (
          <div className="sm-alert-banner">
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f87171', flexShrink: 0 }} />
            <div>
              <div style={{ fontSize: 12, fontWeight: 500, color: '#f87171' }}>
                {data!.summary.deadStockCount} item{data!.summary.deadStockCount !== 1 ? 's' : ''} with no movement in 180+ days
              </div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                {fmtAmt(data!.summary.deadStockValue)} in capital at risk — consider write-down or liquidation
              </div>
            </div>
          </div>
        )}

        {error && <div className="sm-error">{error}</div>}

        {/* Filters */}
        <div className="sm-filters">
          <ERPFilterBar filters={filters} values={values} onChange={setValue} onReset={reset} activeCount={activeCount + (cardFilter ? 1 : 0)} />
          <button className="sm-refresh" onClick={fetchData} style={{ alignSelf: 'flex-end' }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M10 2A5 5 0 1 0 11 6"/><polyline points="8.5,0.5 11,2 9.5,4.5"/>
            </svg>
            Refresh
          </button>
          {cardFilter && (
            <button onClick={() => setCardFilter(null)} style={{ alignSelf: 'flex-end', background: 'rgba(248,113,113,0.08)', border: '0.5px solid rgba(248,113,113,0.2)', borderRadius: 6, padding: '6px 12px', fontSize: 11, fontFamily: "'IBM Plex Sans',sans-serif", color: '#f87171', cursor: 'pointer' }}>
              ↺ Clear risk filter
            </button>
          )}
        </div>

        {/* Table */}
        <div className="sm-table">
          <ERPTable<AgingRow>
            columns={COLUMNS}
            data={filtered}
            rowKey={r => `${r.itemId}-${r.warehouseId}`}
            loading={loading}
            exportFilename={`slow-moving-${new Date().toISOString().split('T')[0]}`}
            emptyMessage="No slow moving or dead stock. Inventory is healthy."
            defaultPageSize={25}
            maxHeight="calc(100vh - 500px)"
            toolbarLeft={
              data ? (
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: "'IBM Plex Mono', monospace" }}>
                  {filtered.length} of {slowRows.length} problematic items · {fmtTimestamp(data.asOf)}
                </span>
              ) : undefined
            }
          />
        </div>

        {/* Footer note */}
        <div className="sm-note">
          <span style={{ color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>Definitions:</span>
          <span>
            Watch = 31–60d · Slow = 61–90d · Critical = 91–180d · Dead = 180+d or never moved ·
            Capital Tied Up = purchaseQty × WAC (ADR-019)
          </span>
        </div>

      </div>
    </ERPShell>
  );
}