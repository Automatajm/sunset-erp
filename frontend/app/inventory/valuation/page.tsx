"use client";

import { useEffect, useState, useCallback, useMemo } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import { ERPTable, ERPColumn }                        from '@/components/ui/ERPTable';
import { ERPFilterBar, ERPFilter, useERPFilters, applyERPFilters } from '@/components/ui/ERPFilterBar';
import { stockTransactionsApi }                       from '@/lib/api/stock-transactions';
import { warehousesApi }                              from '@/lib/api/warehouses';
import { Warehouse }                                  from '@/lib/api/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ValuationRow {
  itemId:        string;
  itemCode:      string;
  itemName:      string;
  itemType:      string;
  warehouseId:   string;
  warehouseCode: string;
  warehouseName: string;
  // Sprint 14A (ADR-019) — purchaseQty × unitCost is the financial source of truth
  purchaseQty:   number;
  purchaseUom:   string;
  unitCost:      number;
  totalValue:    number;
  // Display (backward compat)
  onHandQuantity: number;
  uom:           string;
}

interface ValuationData {
  asOf:                string;
  rows:                ValuationRow[];
  totalInventoryValue: number;
  totalItems:          number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONO: React.CSSProperties = { fontFamily: "'IBM Plex Mono', monospace" };

function fmtAmt(v: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(v);
}
function fmtQty(v: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(v);
}
function fmtDate(d: string) {
  return new Date(d).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const ITEM_TYPE_CFG: Record<string, { color: string; bg: string; border: string; label: string }> = {
  finished_good: { color: 'var(--success, #4ade80)', bg: 'rgba(74,222,128,0.1)',   border: 'rgba(74,222,128,0.2)',   label: 'Finished Good' },
  raw_material:  { color: 'var(--accent-blue, #60a5fa)', bg: 'rgba(96,165,250,0.1)',   border: 'rgba(96,165,250,0.2)',   label: 'Raw Material'  },
  consumable:    { color: 'var(--warning, #fbbf24)', bg: 'rgba(251,191,36,0.1)',   border: 'rgba(251,191,36,0.2)',   label: 'Consumable'    },
  service:       { color: 'rgba(255,255,255,0.4)', bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.1)', label: 'Service' },
};

function TypeBadge({ type }: { type: string }) {
  const s = ITEM_TYPE_CFG[type] ?? ITEM_TYPE_CFG.service;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', borderRadius: 20,
      fontSize: 10, fontWeight: 500, whiteSpace: 'nowrap',
      color: s.color, background: s.bg, border: `0.5px solid ${s.border}`,
    }}>
      {s.label}
    </span>
  );
}

// ─── Filter definitions ───────────────────────────────────────────────────────

function buildFilters(warehouses: Warehouse[]): ERPFilter<ValuationRow>[] {
  return [
    {
      key: 'itemCode',
      label: 'Item Code',
      type: 'search',
      placeholder: 'e.g. MESA-BLK…',
      inputWidth: 150,
      filterFn: (row, val) =>
        row.itemCode.toLowerCase().includes(String(val).toLowerCase()) ||
        row.itemName.toLowerCase().includes(String(val).toLowerCase()),
    },
    {
      key: 'itemType',
      label: 'Type',
      type: 'multiselect',
      options: Object.entries(ITEM_TYPE_CFG).map(([v, c]) => ({
        value: v, label: c.label,
        color: c.color, bg: c.bg, border: c.border,
      })),
      filterFn: (row, val) => (val as string[]).includes(row.itemType),
    },
    {
      key: 'warehouseId',
      label: 'Warehouse',
      type: 'searchselect',
      placeholder: 'All warehouses',
      selectWidth: 200,
      options: warehouses.map(w => ({
        value: w.id, label: w.code,
        sublabel: w.name,
      })),
      filterFn: (row, val) => row.warehouseId === String(val),
    },
    {
      key: 'hasValue',
      label: 'Has Value',
      type: 'boolean',
      placeholder: 'Only valued items',
      filterFn: (row, val) => val === true ? row.totalValue > 0 : true,
    },
  ];
}

// ─── Column definitions ───────────────────────────────────────────────────────

function buildColumns(totalValue: number): ERPColumn<ValuationRow>[] {
  return [
    {
      key:    'itemCode',
      header: 'Item Code',
      width:  130,
      sortable: true,
      value:  r => r.itemCode,
      render: r => (
        <span style={{ ...MONO, fontSize: 12, color: 'var(--accent-blue, #60a5fa)', fontWeight: 500 }}>
          {r.itemCode}
        </span>
      ),
    },
    {
      key:    'itemName',
      header: 'Item Name',
      sortable: true,
      value:  r => r.itemName,
      render: r => (
        <span style={{ fontSize: 12, color: 'var(--text-primary, #e2dfd8)' }}>{r.itemName}</span>
      ),
    },
    {
      key:    'itemType',
      header: 'Type',
      width:  130,
      sortable: true,
      value:  r => r.itemType,
      render: r => <TypeBadge type={r.itemType} />,
    },
    {
      key:    'warehouseCode',
      header: 'Warehouse',
      width:  150,
      sortable: true,
      value:  r => r.warehouseCode,
      render: r => (
        <div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{r.warehouseCode}</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 1 }}>{r.warehouseName}</div>
        </div>
      ),
    },
    {
      key:    'purchaseQty',
      header: 'Purchase Qty',
      width:  130,
      align:  'right',
      sortable: true,
      value:  r => r.purchaseQty,
      render: r => (
        <div style={{ textAlign: 'right' }}>
          <span style={{ ...MONO, fontSize: 13, fontWeight: 500, color: r.purchaseQty > 0 ? 'var(--text-primary, #e2dfd8)' : 'var(--danger, #f87171)' }}>
            {fmtQty(r.purchaseQty)}
          </span>
        </div>
      ),
    },
    {
      key:    'purchaseUom',
      header: 'UOM',
      width:  80,
      sortable: false,
      value:  r => r.purchaseUom,
      render: r => (
        <span style={{
          display: 'inline-flex', alignItems: 'center',
          padding: '1px 6px', borderRadius: 10,
          fontSize: 10, ...MONO,
          color: 'var(--accent-strong, #fb923c)',
          background: 'rgba(251,146,60,0.1)',
          border: '0.5px solid rgba(251,146,60,0.2)',
        }}>
          {r.purchaseUom || r.uom}
        </span>
      ),
    },
    {
      key:    'unitCost',
      header: 'WAC Unit Cost',
      width:  140,
      align:  'right',
      sortable: true,
      value:  r => r.unitCost,
      render: r => (
        <span style={{ ...MONO, fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
          {r.unitCost > 0 ? fmtAmt(r.unitCost) : '—'}
        </span>
      ),
    },
    {
      key:    'totalValue',
      header: 'Total Value',
      width:  150,
      align:  'right',
      sortable: true,
      value:  r => r.totalValue,
      render: r => (
        <span style={{ ...MONO, fontSize: 13, fontWeight: 600, color: 'var(--accent-blue, #60a5fa)' }}>
          {fmtAmt(r.totalValue)}
        </span>
      ),
    },
    {
      key:    'sharePct',
      header: '% Share',
      width:  130,
      align:  'right',
      sortable: true,
      value:  r => totalValue > 0 ? r.totalValue / totalValue * 100 : 0,
      render: r => {
        const pct    = totalValue > 0 ? (r.totalValue / totalValue * 100) : 0;
        const s      = ITEM_TYPE_CFG[r.itemType] ?? ITEM_TYPE_CFG.service;
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <div style={{ flex: 1, height: 4, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
              <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', background: s.color, borderRadius: 2, opacity: 0.7 }} />
            </div>
            <span style={{ ...MONO, fontSize: 10, color: 'rgba(255,255,255,0.4)', minWidth: 36, textAlign: 'right' }}>
              {pct.toFixed(1)}%
            </span>
          </div>
        );
      },
    },
  ];
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function InventoryValuationPage() {
  const [data,       setData]       = useState<ValuationData | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  // External filter from type breakdown cards
  const [typeCardFilter, setTypeCardFilter] = useState<string | null>(null);

  const filters = useMemo(() => buildFilters(warehouses), [warehouses]);
  const { values, setValue, reset, activeCount } = useERPFilters(filters);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [val, whs] = await Promise.all([
        stockTransactionsApi.getValuation(),
        warehousesApi.getAll(),
      ]);
      setData(val as ValuationData);
      setWarehouses(whs as Warehouse[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load valuation data.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Apply filter bar + type card filter
  const baseRows = data?.rows ?? [];
  const afterFilters = useMemo(
    () => applyERPFilters(baseRows, filters, values),
    [baseRows, filters, values],
  );
  const filteredRows = useMemo(
    () => typeCardFilter ? afterFilters.filter(r => r.itemType === typeCardFilter) : afterFilters,
    [afterFilters, typeCardFilter],
  );

  // Summary derived from filteredRows
  const filteredTotal = filteredRows.reduce((s, r) => s + r.totalValue, 0);

  // By-type breakdown (always from full data for the cards)
  const byType = useMemo(() =>
    baseRows.reduce((acc, r) => {
      if (!acc[r.itemType]) acc[r.itemType] = { count: 0, value: 0 };
      acc[r.itemType].count++;
      acc[r.itemType].value += r.totalValue;
      return acc;
    }, {} as Record<string, { count: number; value: number }>),
  [baseRows]);

  const columns = useMemo(
    () => buildColumns(data?.totalInventoryValue ?? 0),
    [data?.totalInventoryValue],
  );

  return (
    <ERPShell breadcrumbs={['Home', 'Inventory', 'Valuation']} title="Inventory Valuation">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&display=swap');
        .iv-page  { padding: 0 18px 16px; display: flex; flex-direction: column; gap: 12px; height: 100%; overflow: hidden; }
        .iv-kpis  { display: grid; grid-template-columns: repeat(4,1fr); gap: 8px; flex-shrink: 0; }
        .iv-kpi   { background: rgba(10,7,18,0.7); border-radius: 9px; padding: 10px 14px; }
        .iv-kpi-l { font-size: 9px; font-weight: 500; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(96,165,250,0.5); margin-bottom: 4px; }
        .iv-kpi-v { font-size: 19px; font-weight: 500; font-family: 'IBM Plex Mono', monospace; }
        .iv-cards { display: flex; gap: 8px; flex-wrap: wrap; flex-shrink: 0; }
        .iv-card  { background: rgba(10,7,18,0.7); border-radius: 8px; padding: 9px 13px; min-width: 150px; cursor: pointer; transition: all 0.15s; display: flex; flex-direction: column; gap: 3px; }
        .iv-card-label { font-size: 10px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; }
        .iv-card-value { font-size: 15px; font-weight: 500; font-family: 'IBM Plex Mono', monospace; color: var(--text-strong, #f1ede8); }
        .iv-card-sub   { font-size: 10px; color: rgba(255,255,255,0.3); }
        .iv-bar-wrap   { width: 100%; height: 3px; background: rgba(255,255,255,0.06); border-radius: 2px; margin-top: 3px; overflow: hidden; }
        .iv-bar        { height: 100%; border-radius: 2px; opacity: 0.65; }
        .iv-filters    { flex-shrink: 0; }
        .iv-table-wrap { flex: 1; min-height: 0; display: flex; flex-direction: column; }
        .iv-footer-note { font-size: 11px; color: rgba(255,255,255,0.25); padding: 6px 2px; flex-shrink: 0; display: flex; align-items: center; gap: 8px; }
        .iv-error { background: rgba(239,68,68,0.08); border: 0.5px solid rgba(239,68,68,0.2); border-radius: 8px; padding: 10px 14px; font-size: 13px; color: var(--danger-subtle, #fca5a5); flex-shrink: 0; }
      `}</style>

      <div className="iv-page">

        {/* ── KPI bar ── */}
        <div className="iv-kpis">
          {[
            { label: 'Total Inv. Value', value: fmtAmt(data?.totalInventoryValue ?? 0), color: 'var(--accent-blue, #60a5fa)', border: 'rgba(96,165,250,0.18)' },
            { label: 'Items Tracked',   value: String(data?.totalItems ?? 0),            color: 'var(--text-strong, #f1ede8)', border: 'rgba(255,255,255,0.06)' },
            { label: 'Avg Value / Item', value: (data?.totalItems ?? 0) > 0 ? fmtAmt((data!.totalInventoryValue) / data!.totalItems) : '—', color: 'var(--accent-violet, #a78bfa)', border: 'rgba(167,139,250,0.15)' },
            { label: 'Filtered Total',  value: fmtAmt(filteredTotal),                  color: 'var(--accent-strong, #fb923c)', border: 'rgba(251,146,60,0.18)' },
          ].map(k => (
            <div key={k.label} className="iv-kpi" style={{ border: `0.5px solid ${k.border}` }}>
              <div className="iv-kpi-l">{k.label}</div>
              <div className="iv-kpi-v" style={{ color: k.color }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* ── Type breakdown cards ── */}
        {Object.keys(byType).length > 0 && (
          <div className="iv-cards">
            {Object.entries(byType)
              .sort((a, b) => b[1].value - a[1].value)
              .map(([type, info]) => {
                const s   = ITEM_TYPE_CFG[type] ?? ITEM_TYPE_CFG.service;
                const pct = data ? (info.value / data.totalInventoryValue * 100).toFixed(1) : '0';
                const active = typeCardFilter === type;
                return (
                  <div key={type} className="iv-card"
                    style={{ border: `0.5px solid ${active ? s.border : 'rgba(255,255,255,0.06)'}`, background: active ? s.bg : 'rgba(10,7,18,0.7)' }}
                    onClick={() => setTypeCardFilter(prev => prev === type ? null : type)}>
                    <span className="iv-card-label" style={{ color: s.color }}>
                      {s.label}
                    </span>
                    <span className="iv-card-value">{fmtAmt(info.value)}</span>
                    <span className="iv-card-sub">{info.count} item{info.count !== 1 ? 's' : ''} · {pct}% of total</span>
                    <div className="iv-bar-wrap">
                      <div className="iv-bar" style={{ width: `${pct}%`, background: s.color }} />
                    </div>
                  </div>
                );
              })}
            {typeCardFilter && (
              <div className="iv-card"
                style={{ border: '0.5px solid rgba(248,113,113,0.2)', background: 'rgba(248,113,113,0.05)', minWidth: 'auto', justifyContent: 'center', alignItems: 'center' }}
                onClick={() => setTypeCardFilter(null)}>
                <span style={{ fontSize: 11, color: 'var(--danger, #f87171)', fontFamily: "'IBM Plex Sans', sans-serif" }}>↺ Clear filter</span>
              </div>
            )}
          </div>
        )}

        {error && <div className="iv-error">{error}</div>}

        {/* ── Filter bar ── */}
        <div className="iv-filters">
          <ERPFilterBar
            filters={filters}
            values={values}
            onChange={setValue}
            onReset={reset}
            activeCount={activeCount + (typeCardFilter ? 1 : 0)}
          />
        </div>

        {/* ── ERPTable ── */}
        <div className="iv-table-wrap">
          <ERPTable<ValuationRow>
            columns={columns}
            data={filteredRows}
            rowKey={r => `${r.itemId}-${r.warehouseId}`}
            loading={loading}
            exportFilename={`inventory-valuation-${new Date().toISOString().split('T')[0]}`}
            emptyMessage="No inventory data. Post AP invoices or GRNs to receive stock."
            defaultPageSize={25}
            maxHeight="calc(100vh - 480px)"
            toolbarLeft={
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {data && (
                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: "'IBM Plex Mono', monospace" }}>
                    As of {fmtDate(data.asOf)}
                  </span>
                )}
                <button
                  onClick={fetchData}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 5,
                    padding: '4px 10px', borderRadius: 6, fontSize: 11,
                    fontFamily: "'IBM Plex Sans', sans-serif",
                    background: 'rgba(96,165,250,0.08)',
                    border: '0.5px solid rgba(96,165,250,0.2)',
                    color: 'var(--accent-blue, #60a5fa)', cursor: 'pointer',
                  }}>
                  <svg width="11" height="11" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M11 2.5A5 5 0 1 0 12 7"/><polyline points="9,1 12,2.5 10.5,5.5"/>
                  </svg>
                  Refresh
                </button>
              </div>
            }
          />
        </div>

        {/* ── Footer note ── */}
        <div className="iv-footer-note">
          <span style={{ color: 'rgba(251,146,60,0.5)', fontSize: 10 }}>💰</span>
          <span>Total Value = <strong style={{ color: 'rgba(255,255,255,0.5)' }}>purchaseQty × WAC</strong> — purchaseUom is the financial unit of record (ADR-019)</span>
        </div>

      </div>
    </ERPShell>
  );
}