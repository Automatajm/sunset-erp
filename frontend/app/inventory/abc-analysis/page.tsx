"use client";

import { useEffect, useState, useCallback, useMemo } from 'react';
import ERPShell                                        from '@/components/layout/ERPShell';
import { ERPTable, ERPColumn }                         from '@/components/ui/ERPTable';
import { ERPFilterBar, ERPFilter, useERPFilters, applyERPFilters } from '@/components/ui/ERPFilterBar';
import { warehousesApi }                               from '@/lib/api/warehouses';
import apiClient                                       from '@/lib/api/client';
import { Warehouse }                                   from '@/lib/api/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AbcRow {
  rank:             number;
  itemId:           string;
  itemCode:         string;
  itemName:         string;
  itemType:         string;
  totalValue:       number;
  totalPurchaseQty: number;
  unitCost:         number;
  valuePct:         number;
  cumulativePct:    number;
  abcClass:         'A' | 'B' | 'C';
  warehouses:       string[];
}

interface AbcSummary {
  grandTotal:  number;
  totalItems:  number;
  classA: { count: number; value: number };
  classB: { count: number; value: number };
  classC: { count: number; value: number };
}

interface AbcData { rows: AbcRow[]; summary: AbcSummary; asOf: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONO: React.CSSProperties = { fontFamily: "'IBM Plex Mono', monospace" };

function fmtAmt(v: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(v);
}
function fmtQty(v: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(v);
}
function fmtPct(v: number) {
  return v.toFixed(2) + '%';
}
function fmtDate(d: string) {
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const ABC_CFG = {
  A: { color: 'var(--success, #4ade80)', bg: 'rgba(74,222,128,0.12)',  border: 'rgba(74,222,128,0.25)',  label: 'Class A — Critical' },
  B: { color: 'var(--warning, #fbbf24)', bg: 'rgba(251,191,36,0.12)',  border: 'rgba(251,191,36,0.25)',  label: 'Class B — Important' },
  C: { color: 'var(--accent-blue, #60a5fa)', bg: 'rgba(96,165,250,0.12)',  border: 'rgba(96,165,250,0.25)',  label: 'Class C — Low Priority' },
};

const ITEM_TYPE_CFG: Record<string, { color: string; label: string }> = {
  finished_good: { color: 'var(--success, #4ade80)', label: 'Finished Good' },
  raw_material:  { color: 'var(--accent-blue, #60a5fa)', label: 'Raw Material'  },
  consumable:    { color: 'var(--warning, #fbbf24)', label: 'Consumable'    },
};

// ─── Pareto bar ───────────────────────────────────────────────────────────────

function ParetoBar({ row, grandTotal }: { row: AbcRow; grandTotal: number }) {
  const cfg = ABC_CFG[row.abcClass];
  const pct = grandTotal > 0 ? Math.min(100, (row.totalValue / grandTotal) * 100) : 0;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ flex: 1, height: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: cfg.color, borderRadius: 3, opacity: 0.8 }} />
      </div>
      <span style={{ ...MONO, fontSize: 10, color: 'rgba(255,255,255,0.4)', minWidth: 42, textAlign: 'right' }}>
        {fmtPct(row.valuePct)}
      </span>
    </div>
  );
}

// ─── Columns ─────────────────────────────────────────────────────────────────

function buildColumns(grandTotal: number): ERPColumn<AbcRow>[] {
  return [
    {
      key: 'rank', header: '#', width: 50, sortable: true,
      value: r => r.rank,
      render: r => <span style={{ ...MONO, fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>#{r.rank}</span>,
    },
    {
      key: 'abcClass', header: 'Class', width: 90, sortable: true,
      value: r => r.abcClass,
      render: r => {
        const c = ABC_CFG[r.abcClass];
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, color: c.color, background: c.bg, border: `0.5px solid ${c.border}` }}>
            {r.abcClass}
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
      key: 'totalPurchaseQty', header: 'Purchase Qty', width: 120, align: 'right', sortable: true,
      value: r => r.totalPurchaseQty,
      render: r => <span style={{ ...MONO, fontSize: 12, color: 'var(--text-primary, #e2dfd8)' }}>{fmtQty(r.totalPurchaseQty)}</span>,
    },
    {
      key: 'unitCost', header: 'WAC Cost', width: 110, align: 'right', sortable: true,
      value: r => r.unitCost,
      render: r => <span style={{ ...MONO, fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{r.unitCost > 0 ? fmtAmt(r.unitCost) : '—'}</span>,
    },
    {
      key: 'totalValue', header: 'Total Value', width: 140, align: 'right', sortable: true,
      value: r => r.totalValue,
      render: r => {
        const c = ABC_CFG[r.abcClass];
        return <span style={{ ...MONO, fontSize: 13, fontWeight: 600, color: c.color }}>{fmtAmt(r.totalValue)}</span>;
      },
    },
    {
      key: 'valuePct', header: 'Value %', width: 160, sortable: true,
      value: r => r.valuePct,
      render: r => <ParetoBar row={r} grandTotal={grandTotal} />,
    },
    {
      key: 'cumulativePct', header: 'Cumulative %', width: 110, align: 'right', sortable: true,
      value: r => r.cumulativePct,
      render: r => {
        const c = ABC_CFG[r.abcClass];
        return <span style={{ ...MONO, fontSize: 11, color: c.color }}>{fmtPct(r.cumulativePct)}</span>;
      },
    },
    {
      key: 'warehouses', header: 'Warehouses', width: 110, sortable: false,
      value: r => r.warehouses.join(', '),
      render: r => (
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {r.warehouses.map(w => (
            <span key={w} style={{ fontSize: 9, padding: '1px 5px', borderRadius: 6, color: 'rgba(255,255,255,0.4)', background: 'var(--l05, rgba(255,255,255,0.05))', border: '0.5px solid var(--w10, rgba(255,255,255,0.1))' }}>{w}</span>
          ))}
        </div>
      ),
    },
  ];
}

// ─── Filters ──────────────────────────────────────────────────────────────────

function buildFilters(warehouses: Warehouse[]): ERPFilter<AbcRow>[] {
  return [
    {
      key: 'abcClass', label: 'Class', type: 'multiselect',
      options: [
        { value: 'A', label: 'A — Critical',     color: 'var(--success, #4ade80)', bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.2)'  },
        { value: 'B', label: 'B — Important',    color: 'var(--warning, #fbbf24)', bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.2)'  },
        { value: 'C', label: 'C — Low Priority', color: 'var(--accent-blue, #60a5fa)', bg: 'rgba(96,165,250,0.1)',  border: 'rgba(96,165,250,0.2)'  },
      ],
      filterFn: (row, val) => (val as string[]).includes(row.abcClass),
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

export default function AbcAnalysisPage() {
  const [data,       setData]       = useState<AbcData | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [whFilter,   setWhFilter]   = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  // Card filter for ABC class
  const [cardFilter, setCardFilter] = useState<string | null>(null);

  const filters = useMemo(() => buildFilters(warehouses), [warehouses]);
  const { values, setValue, reset, activeCount } = useERPFilters(filters);

  const fetchData = useCallback(async (wh?: string, type?: string) => {
    setLoading(true); setError('');
    try {
      const [abc, whs] = await Promise.all([
        apiClient.get('/stock-transactions/abc', { params: { warehouseId: wh || undefined, itemType: type || undefined } }),
        warehousesApi.getAll(),
      ]);
      setData(abc.data as AbcData);
      setWarehouses(whs as Warehouse[]);
    } catch { setError('Failed to load ABC analysis.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleApply = () => { fetchData(whFilter, typeFilter); setCardFilter(null); };

  const rows        = data?.rows ?? [];
  const afterFilter = useMemo(() => applyERPFilters(rows, filters, values), [rows, filters, values]);
  const filtered    = useMemo(() => cardFilter ? afterFilter.filter(r => r.abcClass === cardFilter) : afterFilter, [afterFilter, cardFilter]);
  const grandTotal  = data?.summary.grandTotal ?? 0;

  const columns = useMemo(() => buildColumns(grandTotal), [grandTotal]);

  const SEL: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.09)',
    borderRadius: 7, padding: '6px 10px', fontSize: 12,
    fontFamily: "'IBM Plex Sans', sans-serif", color: 'var(--text-primary, #e2dfd8)', outline: 'none', cursor: 'pointer',
  };

  return (
    <ERPShell breadcrumbs={['Home', 'Inventory', 'ABC Analysis']} title="ABC Analysis">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&display=swap');
        .abc-page  { padding: 0 18px 16px; display: flex; flex-direction: column; gap: 10px; height: 100%; overflow: hidden; }
        .abc-kpis  { display: grid; grid-template-columns: repeat(4,1fr); gap: 8px; flex-shrink: 0; }
        .abc-kpi   { background: rgba(10,7,18,0.7); border-radius: 9px; padding: 10px 14px; }
        .abc-kpi-l { font-size: 9px; font-weight: 500; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,0.3); margin-bottom: 4px; }
        .abc-kpi-v { font-size: 19px; font-weight: 500; font-family: 'IBM Plex Mono', monospace; }
        .abc-cards { display: grid; grid-template-columns: repeat(3,1fr); gap: 8px; flex-shrink: 0; }
        .abc-card  { background: rgba(10,7,18,0.7); border-radius: 9px; padding: 12px 16px; cursor: pointer; transition: all 0.15s; }
        .abc-card:hover { opacity: 0.85; }
        .abc-card-title { font-size: 10px; font-weight: 600; letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 6px; }
        .abc-card-row   { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 3px; }
        .abc-card-label { font-size: 11px; color: rgba(255,255,255,0.4); }
        .abc-card-value { font-size: 13px; font-weight: 500; font-family: 'IBM Plex Mono', monospace; }
        .abc-bar-wrap   { height: 4px; background: rgba(255,255,255,0.06); border-radius: 2px; margin-top: 8px; overflow: hidden; }
        .abc-filters { display: flex; align-items: flex-end; gap: 10px; flex-wrap: wrap; flex-shrink: 0; }
        .abc-table   { flex: 1; min-height: 0; display: flex; flex-direction: column; }
        .abc-error   { background: rgba(239,68,68,0.08); border: 0.5px solid rgba(239,68,68,0.2); border-radius: 8px; padding: 10px 14px; font-size: 13px; color: var(--danger-subtle, #fca5a5); flex-shrink: 0; }
        .abc-btn-apply { background: linear-gradient(135deg,var(--accent-pressed, #c2410c),var(--accent, #ea580c),var(--accent-mid, #f97316)); border: none; border-radius: 7px; padding: 7px 16px; font-size: 12px; font-weight: 500; font-family: 'IBM Plex Sans',sans-serif; color: white; cursor: pointer; }
        .abc-note { font-size: 10px; color: rgba(255,255,255,0.25); flex-shrink: 0; display: flex; align-items: center; gap: 6px; }
      `}</style>

      <div className="abc-page">

        {/* KPI bar */}
        <div className="abc-kpis">
          {[
            { label: 'Total Value',  value: fmtAmt(data?.summary.grandTotal ?? 0), color: 'var(--accent-strong, #fb923c)', border: 'rgba(251,146,60,0.2)'   },
            { label: 'Total Items',  value: String(data?.summary.totalItems ?? 0),  color: 'var(--text-strong, #f1ede8)', border: 'rgba(255,255,255,0.07)' },
            { label: 'Filtered',     value: String(filtered.length),                 color: 'var(--accent-violet, #a78bfa)', border: 'rgba(167,139,250,0.15)' },
            { label: 'Filtered Value', value: fmtAmt(filtered.reduce((s,r)=>s+r.totalValue,0)), color: 'var(--accent-blue, #60a5fa)', border: 'rgba(96,165,250,0.15)' },
          ].map(k => (
            <div key={k.label} className="abc-kpi" style={{ border: `0.5px solid ${k.border}` }}>
              <div className="abc-kpi-l">{k.label}</div>
              <div className="abc-kpi-v" style={{ color: k.color }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* ABC class cards */}
        {data && (
          <div className="abc-cards">
            {(['A', 'B', 'C'] as const).map(cls => {
              const info = data.summary[`class${cls}` as 'classA' | 'classB' | 'classC'];
              const c    = ABC_CFG[cls];
              const pct  = grandTotal > 0 ? (info.value / grandTotal * 100) : 0;
              const active = cardFilter === cls;
              return (
                <div key={cls} className="abc-card"
                  style={{ border: `0.5px solid ${active ? c.border : 'rgba(255,255,255,0.07)'}`, background: active ? c.bg : 'rgba(10,7,18,0.7)' }}
                  onClick={() => setCardFilter(prev => prev === cls ? null : cls)}>
                  <div className="abc-card-title" style={{ color: c.color }}>{c.label}</div>
                  <div className="abc-card-row">
                    <span className="abc-card-label">Items</span>
                    <span className="abc-card-value" style={{ color: c.color }}>{info.count}</span>
                  </div>
                  <div className="abc-card-row">
                    <span className="abc-card-label">Value</span>
                    <span className="abc-card-value" style={{ color: c.color }}>{fmtAmt(info.value)}</span>
                  </div>
                  <div className="abc-card-row">
                    <span className="abc-card-label">% of Total</span>
                    <span className="abc-card-value" style={{ color: c.color, fontSize: 11 }}>{fmtPct(pct)}</span>
                  </div>
                  <div className="abc-bar-wrap">
                    <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: c.color, borderRadius: 2, opacity: 0.7 }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {error && <div className="abc-error">{error}</div>}

        {/* Warehouse + ItemType filters (trigger backend refetch) */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 8, flexShrink: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(251,146,60,0.5)' }}>Warehouse</span>
            <select style={SEL} value={whFilter} onChange={e => setWhFilter(e.target.value)}>
              <option value="">All Warehouses</option>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
            </select>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(251,146,60,0.5)' }}>Category</span>
            <select style={SEL} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
              <option value="">All Categories</option>
              {Object.entries(ITEM_TYPE_CFG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
            </select>
          </div>
          <button className="abc-btn-apply" onClick={handleApply} style={{ alignSelf: 'flex-end' }}>Apply</button>
        </div>

        {/* Client-side filters */}
        <div className="abc-filters">
          <ERPFilterBar filters={filters} values={values} onChange={setValue} onReset={reset} activeCount={activeCount + (cardFilter ? 1 : 0)} />
          {cardFilter && (
            <button onClick={() => setCardFilter(null)} style={{ alignSelf: 'flex-end', background: 'rgba(248,113,113,0.08)', border: '0.5px solid rgba(248,113,113,0.2)', borderRadius: 6, padding: '6px 12px', fontSize: 11, fontFamily: "'IBM Plex Sans',sans-serif", color: 'var(--danger, #f87171)', cursor: 'pointer' }}>
              ↺ Clear class filter
            </button>
          )}
        </div>

        {/* Table */}
        <div className="abc-table">
          <ERPTable<AbcRow>
            columns={columns}
            data={filtered}
            rowKey={r => r.itemId}
            loading={loading}
            exportFilename={`abc-analysis-${new Date().toISOString().split('T')[0]}`}
            emptyMessage="No inventory data. Post stock receipts to analyze."
            defaultPageSize={25}
            maxHeight="calc(100vh - 510px)"
            toolbarLeft={
              data ? (
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: "'IBM Plex Mono', monospace" }}>
                  {filtered.length} of {rows.length} items · As of {fmtDate(data.asOf)}
                </span>
              ) : undefined
            }
          />
        </div>

        {/* Footer note */}
        <div className="abc-note">
          <span style={{ color: 'rgba(251,146,60,0.5)' }}>💡</span>
          <span>A = top items accounting for ~80% of value · B = next ~15% · C = remaining ~5% — based on purchaseQty × WAC (ADR-019)</span>
        </div>

      </div>
    </ERPShell>
  );
}