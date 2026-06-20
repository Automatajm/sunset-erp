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

interface AgingRow {
  itemId:               string;
  itemCode:             string;
  itemName:             string;
  itemType:             string;
  warehouseId:          string;
  warehouseCode:        string;
  warehouseName:        string;
  purchaseQty:          number;
  storageQty:           number;
  uom:                  string;
  purchaseUom:          string;
  unitCost:             number;
  totalValue:           number;
  lastMovementDate:     string | null;
  daysSinceLastMovement: number | null;
  agingBucket:          AgingBucket;
  isSlowMoving:         boolean;
  isDead:               boolean;
}

interface BucketInfo { count: number; value: number }

interface AgingSummary {
  totalItems:      number;
  totalValue:      number;
  slowMovingCount: number;
  slowMovingValue: number;
  deadStockCount:  number;
  deadStockValue:  number;
  buckets: Record<AgingBucket, BucketInfo>;
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

const BUCKET_CFG: Record<AgingBucket, { color: string; bg: string; border: string; label: string; risk: string }> = {
  'no_movement': { color: 'var(--danger)', bg: 'rgba(248,113,113,0.15)', border: 'rgba(248,113,113,0.3)', label: 'No Movement', risk: 'Dead'  },
  '180+':        { color: 'var(--danger)', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.25)', label: '180+ days',  risk: 'Dead'  },
  '91-180':      { color: 'var(--accent-strong)', bg: 'rgba(251,146,60,0.12)',  border: 'rgba(251,146,60,0.25)',  label: '91–180 days', risk: 'Slow' },
  '61-90':       { color: 'var(--warning)', bg: 'rgba(251,191,36,0.12)',  border: 'rgba(251,191,36,0.25)',  label: '61–90 days',  risk: 'Watch' },
  '31-60':       { color: 'var(--accent-violet)', bg: 'rgba(167,139,250,0.1)',  border: 'rgba(167,139,250,0.2)',  label: '31–60 days',  risk: 'Watch' },
  '0-30':        { color: 'var(--success)', bg: 'rgba(74,222,128,0.08)',  border: 'rgba(74,222,128,0.2)',   label: '0–30 days',   risk: 'Fresh' },
};

const BUCKET_ORDER: AgingBucket[] = ['no_movement', '180+', '91-180', '61-90', '31-60', '0-30'];

const ITEM_TYPE_CFG: Record<string, { color: string; label: string }> = {
  finished_good: { color: 'var(--success)', label: 'Finished Good' },
  raw_material:  { color: 'var(--accent-blue)', label: 'Raw Material'  },
  consumable:    { color: 'var(--warning)', label: 'Consumable'    },
};

// ─── Columns ─────────────────────────────────────────────────────────────────

const COLUMNS: ERPColumn<AgingRow>[] = [
  {
    key: 'agingBucket', header: 'Age', width: 120, sortable: true,
    value: r => r.daysSinceLastMovement ?? 9999,
    render: r => {
      const c = BUCKET_CFG[r.agingBucket];
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 500, color: c.color, background: c.bg, border: `0.5px solid ${c.border}`, whiteSpace: 'nowrap' }}>
          {c.label}
        </span>
      );
    },
  },
  {
    key: 'daysSinceLastMovement', header: 'Days', width: 70, align: 'right', sortable: true,
    value: r => r.daysSinceLastMovement ?? 9999,
    render: r => {
      const c = BUCKET_CFG[r.agingBucket];
      return r.daysSinceLastMovement !== null
        ? <span style={{ ...MONO, fontSize: 13, fontWeight: 600, color: c.color }}>{r.daysSinceLastMovement}</span>
        : <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>—</span>;
    },
  },
  {
    key: 'itemCode', header: 'Item', sortable: true,
    value: r => r.itemCode,
    render: r => (
      <div>
        <span style={{ ...MONO, fontSize: 11, color: 'var(--accent-strong)', fontWeight: 500 }}>{r.itemCode}</span>
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
        <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 10, color: cfg.color, background: `color-mix(in srgb, ${cfg.color} 8%, transparent)`, border: `0.5px solid color-mix(in srgb, ${cfg.color} 19%, transparent)`, whiteSpace: 'nowrap' }}>
          {cfg.label}
        </span>
      ) : null;
    },
  },
  {
    key: 'warehouseCode', header: 'Warehouse', width: 120, sortable: true,
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
        <span style={{ ...MONO, fontSize: 12, color: r.storageQty > 0 ? 'var(--text-primary)' : 'var(--danger)' }}>{fmtQty(r.storageQty)}</span>
        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', marginTop: 1 }}>{r.uom}</div>
      </div>
    ),
  },
  {
    key: 'purchaseQty', header: 'Purchase Qty', width: 110, align: 'right', sortable: true,
    value: r => r.purchaseQty,
    render: r => (
      <div style={{ textAlign: 'right' }}>
        <span style={{ ...MONO, fontSize: 12, color: 'var(--accent-strong)' }}>{fmtQty(r.purchaseQty)}</span>
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
    key: 'totalValue', header: 'Value at Risk', width: 130, align: 'right', sortable: true,
    value: r => r.totalValue,
    render: r => {
      const c = BUCKET_CFG[r.agingBucket];
      return <span style={{ ...MONO, fontSize: 13, fontWeight: 600, color: r.isSlowMoving ? c.color : 'rgba(255,255,255,0.5)' }}>{fmtAmt(r.totalValue)}</span>;
    },
  },
  {
    key: 'lastMovementDate', header: 'Last Movement', width: 140, sortable: true,
    value: r => r.lastMovementDate ?? '',
    render: r => r.lastMovementDate
      ? <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{fmtDateShort(r.lastMovementDate)}</span>
      : <span style={{ fontSize: 10, color: 'var(--danger)' }}>Never moved</span>,
  },
];

// ─── Filters ──────────────────────────────────────────────────────────────────

function buildFilters(warehouses: Warehouse[]): ERPFilter<AgingRow>[] {
  return [
    {
      key: 'agingBucket', label: 'Age Bucket', type: 'multiselect',
      options: BUCKET_ORDER.map(b => {
        const c = BUCKET_CFG[b];
        return { value: b, label: c.label, color: c.color, bg: c.bg, border: c.border };
      }),
      filterFn: (row, val) => (val as string[]).includes(row.agingBucket),
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
    {
      key: 'slowOnly', label: 'Slow / Dead Only', type: 'boolean',
      placeholder: 'Show slow moving & dead stock',
      filterFn: (row, val) => val === true ? row.isSlowMoving || row.isDead : true,
    },
  ];
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StockAgingPage() {
  const [data,       setData]       = useState<AgingData | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [cardFilter, setCardFilter] = useState<AgingBucket | null>(null);

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
    } catch { setError('Failed to load stock aging.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const rows        = data?.rows ?? [];
  const afterFilter = useMemo(() => applyERPFilters(rows, filters, values), [rows, filters, values]);
  const filtered    = useMemo(() => cardFilter ? afterFilter.filter(r => r.agingBucket === cardFilter) : afterFilter, [afterFilter, cardFilter]);

  return (
    <ERPShell breadcrumbs={['Home', 'Inventory', 'Stock Aging']} title="Stock Aging">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&display=swap');
        .ag-page   { padding: 0 18px 16px; display: flex; flex-direction: column; gap: 10px; height: 100%; overflow: hidden; }
        .ag-kpis   { display: grid; grid-template-columns: repeat(5,1fr); gap: 8px; flex-shrink: 0; }
        .ag-kpi    { background: rgba(10,7,18,0.7); border-radius: 9px; padding: 10px 14px; }
        .ag-kpi-l  { font-size: 9px; font-weight: 500; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,0.3); margin-bottom: 4px; }
        .ag-kpi-v  { font-size: 18px; font-weight: 500; font-family: 'IBM Plex Mono', monospace; }
        .ag-buckets { display: grid; grid-template-columns: repeat(6,1fr); gap: 6px; flex-shrink: 0; }
        .ag-bucket  { background: rgba(10,7,18,0.7); border-radius: 8px; padding: 9px 12px; cursor: pointer; transition: all 0.15s; }
        .ag-bucket:hover { opacity: 0.85; }
        .ag-bucket-label { font-size: 9px; font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 4px; }
        .ag-bucket-count { font-size: 20px; font-weight: 500; font-family: 'IBM Plex Mono', monospace; }
        .ag-bucket-value { font-size: 11px; color: rgba(255,255,255,0.4); font-family: 'IBM Plex Mono', monospace; margin-top: 2px; }
        .ag-filters { display: flex; align-items: flex-end; gap: 10px; flex-wrap: wrap; flex-shrink: 0; }
        .ag-table   { flex: 1; min-height: 0; display: flex; flex-direction: column; }
        .ag-error   { background: rgba(239,68,68,0.08); border: 0.5px solid rgba(239,68,68,0.2); border-radius: 8px; padding: 10px 14px; font-size: 13px; color: var(--danger-subtle); flex-shrink: 0; }
        .ag-note    { font-size: 10px; color: rgba(255,255,255,0.25); flex-shrink: 0; display: flex; align-items: center; gap: 6px; }
        .ag-refresh { display: inline-flex; align-items: center; gap: 5px; background: rgba(255,255,255,0.04); border: 0.5px solid rgba(255,255,255,0.09); border-radius: 7px; padding: 6px 12px; font-size: 12px; font-family: 'IBM Plex Sans',sans-serif; color: rgba(255,255,255,0.45); cursor: pointer; }
        .ag-refresh:hover { color: rgba(255,255,255,0.7); background: rgba(255,255,255,0.08); }
      `}</style>

      <div className="ag-page">

        {/* KPI bar */}
        <div className="ag-kpis">
          {[
            { label: 'Total Items',    value: String(data?.summary.totalItems ?? 0),           color: 'var(--text-strong)', border: 'rgba(255,255,255,0.07)' },
            { label: 'Total Value',    value: fmtAmt(data?.summary.totalValue ?? 0),            color: 'var(--accent-strong)', border: 'rgba(251,146,60,0.2)'   },
            { label: 'Slow Moving',    value: String(data?.summary.slowMovingCount ?? 0),       color: 'var(--accent-strong)', border: 'rgba(251,146,60,0.15)'   },
            { label: 'Slow Mov. Value', value: fmtAmt(data?.summary.slowMovingValue ?? 0),     color: 'var(--accent-strong)', border: 'rgba(251,146,60,0.15)'   },
            { label: 'Dead Stock',     value: fmtAmt(data?.summary.deadStockValue ?? 0),       color: 'var(--danger)', border: 'rgba(248,113,113,0.2)'   },
          ].map(k => (
            <div key={k.label} className="ag-kpi" style={{ border: `0.5px solid ${k.border}` }}>
              <div className="ag-kpi-l">{k.label}</div>
              <div className="ag-kpi-v" style={{ color: k.color, fontSize: k.value.length > 8 ? 14 : 18 }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Bucket cards */}
        {data && (
          <div className="ag-buckets">
            {BUCKET_ORDER.map(bucket => {
              const info   = data.summary.buckets[bucket];
              const c      = BUCKET_CFG[bucket];
              const active = cardFilter === bucket;
              return (
                <div key={bucket} className="ag-bucket"
                  style={{ border: `0.5px solid ${active ? c.border : 'rgba(255,255,255,0.07)'}`, background: active ? c.bg : 'rgba(10,7,18,0.7)' }}
                  onClick={() => setCardFilter(prev => prev === bucket ? null : bucket)}>
                  <div className="ag-bucket-label" style={{ color: c.color }}>{c.label}</div>
                  <div className="ag-bucket-count" style={{ color: c.color }}>{info.count}</div>
                  <div className="ag-bucket-value">{fmtAmt(info.value)}</div>
                </div>
              );
            })}
          </div>
        )}

        {error && <div className="ag-error">{error}</div>}

        {/* Filters */}
        <div className="ag-filters">
          <ERPFilterBar filters={filters} values={values} onChange={setValue} onReset={reset} activeCount={activeCount + (cardFilter ? 1 : 0)} />
          <button className="ag-refresh" onClick={fetchData} style={{ alignSelf: 'flex-end' }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M10 2A5 5 0 1 0 11 6"/><polyline points="8.5,0.5 11,2 9.5,4.5"/>
            </svg>
            Refresh
          </button>
          {cardFilter && (
            <button onClick={() => setCardFilter(null)} style={{ alignSelf: 'flex-end', background: 'rgba(248,113,113,0.08)', border: '0.5px solid rgba(248,113,113,0.2)', borderRadius: 6, padding: '6px 12px', fontSize: 11, fontFamily: "'IBM Plex Sans',sans-serif", color: 'var(--danger)', cursor: 'pointer' }}>
              ↺ Clear bucket filter
            </button>
          )}
        </div>

        {/* Table */}
        <div className="ag-table">
          <ERPTable<AgingRow>
            columns={COLUMNS}
            data={filtered}
            rowKey={r => `${r.itemId}-${r.warehouseId}`}
            loading={loading}
            exportFilename={`stock-aging-${new Date().toISOString().split('T')[0]}`}
            emptyMessage="No stock data. Post receipts to track inventory age."
            defaultPageSize={25}
            maxHeight="calc(100vh - 480px)"
            toolbarLeft={
              data ? (
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: "'IBM Plex Mono', monospace" }}>
                  {filtered.length} of {rows.length} positions · As of {fmtTimestamp(data.asOf)}
                </span>
              ) : undefined
            }
          />
        </div>

        {/* Footer note */}
        <div className="ag-note">
          <span style={{ color: 'var(--danger)' }}>⚠</span>
          <span>Slow Moving = no movement in 60+ days · Dead Stock = 180+ days · Value at Risk = purchaseQty × WAC (ADR-019)</span>
        </div>

      </div>
    </ERPShell>
  );
}