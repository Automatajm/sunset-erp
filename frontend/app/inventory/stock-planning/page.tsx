"use client";

import { useEffect, useState, useCallback, useMemo } from 'react';
import ERPShell                                        from '@/components/layout/ERPShell';
import { ERPTreeTable, ERPTreeColumn }                 from '@/components/ui/ERPTreeTable';
import { ERPFilterBar, ERPFilter, useERPFilters, applyERPFilters } from '@/components/ui/ERPFilterBar';
import { stockTransactionsApi }                        from '@/lib/api/stock-transactions';
import { warehousesApi }                               from '@/lib/api/warehouses';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlanningRow {
  itemId: string; itemCode: string; itemName: string; itemType: string;
  warehouseId: string; warehouseCode: string; warehouseName: string;
  uom: string;
  onHandQty: number; reservedQty: number; availableQty: number;
  purchaseQty: number; purchaseUom: string;
  unitCost: number; stockValue: number;
  poSupplyQty: number; soDemandQty: number;
  atpQty: number; projectedStockQty: number;
  reorderPoint: number; safetyStock: number; reorderQty: number;
  leadTimeDays: number; suggestedOrderQty: number;
  coverageDays: number | null; dailyDemand: number; daysUntilReorder: number | null;
  alertLevel: 'ok' | 'warning' | 'critical' | 'overstock';
  hasOpenPO: boolean; doubleOrderRisk: boolean; nextReceiptDate: string | null;
  openPOs: Array<{ poNumber: string; pending: number; expectedDate: string | null }>;
  openSOs: Array<{ soNumber: string; demand: number; promisedDate: string | null }>;
}

interface Summary {
  total: number; critical: number; warning: number; overstock: number;
  ok: number; doubleOrderRisk: number; totalStockValue: number;
}

interface Warehouse { id: string; code: string; name: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONO: React.CSSProperties = { fontFamily: "'IBM Plex Mono', monospace" };

function fmtAmt(v: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
}
function fmtQty(v: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 1 }).format(v);
}
function fmtDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const ALERT_CONFIG = {
  critical:  { color: 'var(--danger, #f87171)', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.25)', label: 'Critical',  icon: '⚠' },
  warning:   { color: 'var(--warning, #fbbf24)', bg: 'rgba(251,191,36,0.12)',  border: 'rgba(251,191,36,0.25)',  label: 'Warning',   icon: '△' },
  overstock: { color: 'var(--accent-blue, #60a5fa)', bg: 'rgba(96,165,250,0.12)',  border: 'rgba(96,165,250,0.25)',  label: 'Overstock', icon: '▲' },
  ok:        { color: 'var(--success, #4ade80)', bg: 'rgba(74,222,128,0.08)',  border: 'rgba(74,222,128,0.2)',   label: 'OK',        icon: '✓' },
};

const ITEM_TYPE_COLOR: Record<string, string> = {
  finished_good: 'var(--success, #4ade80)', raw_material: 'var(--accent-blue, #60a5fa)', consumable: 'var(--warning, #fbbf24)',
};

// ─── Gauge bar ────────────────────────────────────────────────────────────────

function GaugeBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div style={{ width: '100%', height: 4, background: 'var(--l06, rgba(255,255,255,0.06))', borderRadius: 2, overflow: 'hidden', marginTop: 3 }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.3s' }} />
    </div>
  );
}

// ─── Expanded row content ─────────────────────────────────────────────────────

function ExpandedDetail({ row }: { row: PlanningRow }) {
  const alert    = ALERT_CONFIG[row.alertLevel];
  const maxStock = Math.max(row.onHandQty + row.poSupplyQty, row.reorderPoint * 2, 1);

  return (
    <div style={{ padding: '14px 20px 18px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 18 }}>

      {/* Stock breakdown */}
      <div>
        <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(251,146,60,0.5)', marginBottom: 8 }}>
          Stock Position
        </div>
        {[
          { label: 'On Hand (storage)',      value: `${fmtQty(row.onHandQty)} ${row.uom}`,           color: 'var(--text-strong, #f1ede8)' },
          { label: 'Purchase Qty (financial)', value: `${fmtQty(row.purchaseQty)} ${row.purchaseUom}`, color: 'var(--accent-strong, #fb923c)' },
          { label: 'Reserved',               value: `${fmtQty(row.reservedQty)} ${row.uom}`,         color: 'var(--warning, #fbbf24)' },
          { label: 'Available',              value: `${fmtQty(row.availableQty)} ${row.uom}`,        color: 'var(--success, #4ade80)' },
          { label: 'WAC Unit Cost',          value: `$${row.unitCost.toFixed(4)} / ${row.purchaseUom}`, color: 'var(--w50, rgba(255,255,255,0.5))' },
          { label: 'Stock Value',            value: fmtAmt(row.stockValue),                          color: 'var(--accent-blue, #60a5fa)' },
        ].map(r => (
          <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '0.5px solid var(--l04, rgba(255,255,255,0.04))' }}>
            <span style={{ fontSize: 11, color: 'var(--w40, rgba(255,255,255,0.4))' }}>{r.label}</span>
            <span style={{ ...MONO, fontSize: 11, color: r.color }}>{r.value}</span>
          </div>
        ))}

        {/* Visual gauge */}
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--w30, rgba(255,255,255,0.3))', marginBottom: 4 }}>
            <span>SS ({fmtQty(row.safetyStock)})</span>
            <span>ROP ({fmtQty(row.reorderPoint)})</span>
          </div>
          <div style={{ position: 'relative', height: 8, background: 'var(--l06, rgba(255,255,255,0.06))', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ position: 'absolute', left: `${Math.min(100, (row.safetyStock / maxStock) * 100)}%`, top: 0, bottom: 0, width: 1, background: 'var(--danger, #f87171)', opacity: 0.6 }} />
            <div style={{ position: 'absolute', left: `${Math.min(100, (row.reorderPoint / maxStock) * 100)}%`, top: 0, bottom: 0, width: 1, background: 'var(--warning, #fbbf24)', opacity: 0.6 }} />
            <div style={{ width: `${Math.min(100, Math.max(0, (row.atpQty / maxStock) * 100))}%`, height: '100%', background: alert.color, opacity: 0.7, borderRadius: 4 }} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: 9, color: 'var(--w30, rgba(255,255,255,0.3))', marginTop: 3 }}>
            ATP: {fmtQty(row.atpQty)} {row.uom}
          </div>
        </div>
      </div>

      {/* Open POs */}
      <div>
        <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(74,222,128,0.5)', marginBottom: 8 }}>
          Incoming Supply — {row.openPOs.length} PO{row.openPOs.length !== 1 ? 's' : ''} ({fmtQty(row.poSupplyQty)} {row.uom})
        </div>
        {row.openPOs.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--w20, rgba(255,255,255,0.2))' }}>No pending purchase orders</div>
        ) : row.openPOs.slice(0, 8).map((po, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', borderBottom: '0.5px solid var(--l04, rgba(255,255,255,0.04))' }}>
            <span style={{ ...MONO, fontSize: 11, color: 'var(--success, #4ade80)' }}>{po.poNumber}</span>
            <div style={{ textAlign: 'right' }}>
              <span style={{ ...MONO, fontSize: 11, color: 'var(--text-strong, #f1ede8)' }}>+{fmtQty(po.pending)}</span>
              <div style={{ fontSize: 9, color: 'var(--w30, rgba(255,255,255,0.3))' }}>{fmtDate(po.expectedDate)}</div>
            </div>
          </div>
        ))}
        {row.openPOs.length > 8 && (
          <div style={{ fontSize: 10, color: 'var(--w25, rgba(255,255,255,0.25))', marginTop: 4 }}>+{row.openPOs.length - 8} more…</div>
        )}
      </div>

      {/* Open SOs + Planning params */}
      <div>
        <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(248,113,113,0.5)', marginBottom: 8 }}>
          Committed Demand — {row.openSOs.length} SO{row.openSOs.length !== 1 ? 's' : ''} ({fmtQty(row.soDemandQty)} {row.uom})
        </div>
        {row.openSOs.length === 0 ? (
          <div style={{ fontSize: 11, color: 'var(--w20, rgba(255,255,255,0.2))', marginBottom: 12 }}>No open sales orders</div>
        ) : row.openSOs.slice(0, 5).map((so, i) => (
          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', borderBottom: '0.5px solid var(--l04, rgba(255,255,255,0.04))' }}>
            <span style={{ ...MONO, fontSize: 11, color: 'var(--danger, #f87171)' }}>{so.soNumber}</span>
            <div style={{ textAlign: 'right' }}>
              <span style={{ ...MONO, fontSize: 11, color: 'var(--text-strong, #f1ede8)' }}>−{fmtQty(so.demand)}</span>
              <div style={{ fontSize: 9, color: 'var(--w30, rgba(255,255,255,0.3))' }}>{fmtDate(so.promisedDate)}</div>
            </div>
          </div>
        ))}

        <div style={{ marginTop: 12, fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(251,146,60,0.5)', marginBottom: 6 }}>
          Planning Parameters
        </div>
        {[
          { label: 'Lead Time',    value: `${row.leadTimeDays} days`                                                    },
          { label: 'Reorder Qty',  value: `${fmtQty(row.reorderQty)} ${row.uom}`                                       },
          { label: 'Coverage',     value: row.coverageDays !== null ? `${row.coverageDays} days` : '∞'                  },
          { label: 'Daily Demand', value: row.dailyDemand > 0 ? `${row.dailyDemand.toFixed(2)} ${row.uom}/day` : 'No demand' },
          { label: 'Suggested PO', value: row.suggestedOrderQty > 0 ? `${fmtQty(row.suggestedOrderQty)} ${row.uom}` : 'Not needed' },
        ].map(r => (
          <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
            <span style={{ fontSize: 10, color: 'var(--w35, rgba(255,255,255,0.35))' }}>{r.label}</span>
            <span style={{ ...MONO, fontSize: 10, color: 'var(--w60, rgba(255,255,255,0.6))' }}>{r.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Column definitions ───────────────────────────────────────────────────────

const COLUMNS: ERPTreeColumn<PlanningRow>[] = [
  {
    key: 'alertLevel', header: 'Alert', width: 90, sortable: true,
    value: r => r.alertLevel,
    render: r => {
      const a = ALERT_CONFIG[r.alertLevel];
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{ fontSize: 11, color: a.color, fontWeight: 600 }}>{a.icon}</span>
          <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, color: a.color, background: a.bg, border: `0.5px solid ${a.border}`, whiteSpace: 'nowrap' }}>
            {a.label}
          </span>
          {r.doubleOrderRisk && (
            <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 8, background: 'rgba(251,191,36,0.15)', border: '0.5px solid rgba(251,191,36,0.3)', color: 'var(--warning, #fbbf24)', whiteSpace: 'nowrap' }}>
              2×
            </span>
          )}
        </div>
      );
    },
  },
  {
    key: 'itemCode', header: 'Item', sortable: true,
    value: r => r.itemCode,
    render: r => (
      <div>
        <span style={{ ...MONO, fontSize: 11, color: 'var(--text-strong, #f1ede8)', fontWeight: 500 }}>{r.itemCode}</span>
        <div style={{ fontSize: 10, color: 'var(--w35, rgba(255,255,255,0.35))', marginTop: 1 }}>{r.itemName}</div>
      </div>
    ),
  },
  {
    key: 'itemType', header: 'Category', width: 120, sortable: true,
    value: r => r.itemType,
    render: r => {
      const color = ITEM_TYPE_COLOR[r.itemType] ?? 'var(--w40, rgba(255,255,255,0.4))';
      return (
        <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 10, color, background: `color-mix(in srgb, ${color} 8%, transparent)`, border: `0.5px solid color-mix(in srgb, ${color} 19%, transparent)`, whiteSpace: 'nowrap' }}>
          {r.itemType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
        </span>
      );
    },
  },
  {
    key: 'onHandQty', header: 'On Hand', width: 110, align: 'right', sortable: true,
    value: r => r.onHandQty,
    render: r => {
      const a = ALERT_CONFIG[r.alertLevel];
      const maxStock = Math.max(r.onHandQty + r.poSupplyQty, r.reorderPoint * 2, 1);
      return (
        <div style={{ textAlign: 'right' }}>
          <span style={{ ...MONO, fontSize: 12, color: 'var(--text-strong, #f1ede8)', fontWeight: 500 }}>{fmtQty(r.onHandQty)}</span>
          <GaugeBar value={r.onHandQty} max={maxStock} color={a.color} />
          <div style={{ fontSize: 9, color: 'var(--w25, rgba(255,255,255,0.25))', marginTop: 1 }}>{r.uom}</div>
        </div>
      );
    },
  },
  {
    key: 'poSupplyQty', header: 'PO Supply', width: 110, align: 'right', sortable: true,
    value: r => r.poSupplyQty,
    render: r => r.poSupplyQty > 0 ? (
      <div style={{ textAlign: 'right' }}>
        <span style={{ ...MONO, fontSize: 11, color: 'var(--success, #4ade80)' }}>+{fmtQty(r.poSupplyQty)}</span>
        {r.nextReceiptDate && (
          <div style={{ fontSize: 9, color: 'var(--w30, rgba(255,255,255,0.3))', marginTop: 1 }}>by {fmtDate(r.nextReceiptDate)}</div>
        )}
      </div>
    ) : <span style={{ fontSize: 11, color: 'var(--w20, rgba(255,255,255,0.2))' }}>—</span>,
  },
  {
    key: 'soDemandQty', header: 'SO Demand', width: 110, align: 'right', sortable: true,
    value: r => r.soDemandQty,
    render: r => r.soDemandQty > 0
      ? <span style={{ ...MONO, fontSize: 11, color: 'var(--danger, #f87171)' }}>−{fmtQty(r.soDemandQty)}</span>
      : <span style={{ fontSize: 11, color: 'var(--w20, rgba(255,255,255,0.2))' }}>—</span>,
  },
  {
    key: 'atpQty', header: 'ATP ↗', width: 100, align: 'right', sortable: true,
    value: r => r.atpQty,
    render: r => (
      <span style={{ ...MONO, fontSize: 13, fontWeight: 700, color: r.atpQty < 0 ? 'var(--danger, #f87171)' : r.atpQty <= r.safetyStock ? 'var(--warning, #fbbf24)' : 'var(--success, #4ade80)' }}>
        {fmtQty(r.atpQty)}
      </span>
    ),
  },
  {
    key: 'coverageDays', header: 'Coverage', width: 90, align: 'right', sortable: true,
    value: r => r.coverageDays ?? 9999,
    render: r => r.coverageDays !== null
      ? <span style={{ ...MONO, fontSize: 11, color: r.coverageDays <= r.leadTimeDays ? 'var(--danger, #f87171)' : r.coverageDays <= 30 ? 'var(--warning, #fbbf24)' : 'var(--success, #4ade80)' }}>{r.coverageDays}d</span>
      : <span style={{ fontSize: 10, color: 'var(--w25, rgba(255,255,255,0.25))' }}>∞</span>,
  },
  {
    key: 'reorderPoint', header: 'ROP / SS', width: 100, sortable: true,
    value: r => r.reorderPoint,
    render: r => (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
        {[['ROP', r.reorderPoint], ['SS', r.safetyStock]].map(([label, val]) => (
          <div key={label as string} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ fontSize: 9, color: 'var(--w30, rgba(255,255,255,0.3))', minWidth: 22 }}>{label}</span>
            <span style={{ ...MONO, fontSize: 10, color: 'var(--w50, rgba(255,255,255,0.5))' }}>{fmtQty(Number(val))}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    key: 'suggestedOrderQty', header: 'Suggested PO', width: 120, align: 'right', sortable: true,
    value: r => r.suggestedOrderQty,
    render: r => r.suggestedOrderQty > 0 ? (
      <div style={{ textAlign: 'right' }}>
        <span style={{ ...MONO, fontSize: 12, fontWeight: 600, color: 'var(--accent-strong, #fb923c)' }}>{fmtQty(r.suggestedOrderQty)}</span>
        <div style={{ fontSize: 9, color: 'var(--w25, rgba(255,255,255,0.25))', marginTop: 1 }}>{r.uom} · LT {r.leadTimeDays}d</div>
      </div>
    ) : <span style={{ fontSize: 10, color: 'rgba(74,222,128,0.5)' }}>✓ Covered</span>,
  },
  {
    key: 'stockValue', header: 'Stock Value', width: 120, align: 'right', sortable: true,
    value: r => r.stockValue,
    render: r => (
      <div style={{ textAlign: 'right' }}>
        <span style={{ ...MONO, fontSize: 11, color: 'var(--w50, rgba(255,255,255,0.5))' }}>{fmtAmt(r.stockValue)}</span>
        {r.purchaseUom && r.purchaseUom !== r.uom && (
          <div style={{ fontSize: 9, color: 'rgba(251,146,60,0.45)', marginTop: 1 }}>
            {fmtQty(r.purchaseQty)} {r.purchaseUom}
          </div>
        )}
      </div>
    ),
  },
];

// ─── Filter definitions ───────────────────────────────────────────────────────

function buildFilters(warehouses: Warehouse[]): ERPFilter<PlanningRow>[] {
  return [
    {
      key: 'itemSearch', label: 'Item', type: 'search',
      placeholder: 'Code or name…', inputWidth: 180,
      filterFn: (row, val) =>
        row.itemCode.toLowerCase().includes(String(val).toLowerCase()) ||
        row.itemName.toLowerCase().includes(String(val).toLowerCase()),
    },
    {
      key: 'warehouseId', label: 'Warehouse', type: 'searchselect',
      placeholder: 'All warehouses', selectWidth: 200,
      options: warehouses.map(w => ({ value: w.id, label: w.code, sublabel: w.name })),
      filterFn: (row, val) => row.warehouseId === String(val),
    },
    {
      key: 'itemType', label: 'Category', type: 'multiselect',
      options: [
        { value: 'finished_good', label: 'Finished Good', color: 'var(--success, #4ade80)', bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.2)'  },
        { value: 'raw_material',  label: 'Raw Material',  color: 'var(--accent-blue, #60a5fa)', bg: 'rgba(96,165,250,0.1)',  border: 'rgba(96,165,250,0.2)'  },
        { value: 'consumable',    label: 'Consumable',    color: 'var(--warning, #fbbf24)', bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.2)'  },
      ],
      filterFn: (row, val) => (val as string[]).includes(row.itemType),
    },
    {
      key: 'alertLevel', label: 'Alert', type: 'multiselect',
      options: [
        { value: 'critical',  label: '⚠ Critical',  color: 'var(--danger, #f87171)', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.2)' },
        { value: 'warning',   label: '△ Warning',   color: 'var(--warning, #fbbf24)', bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.2)'  },
        { value: 'overstock', label: '▲ Overstock', color: 'var(--accent-blue, #60a5fa)', bg: 'rgba(96,165,250,0.1)',  border: 'rgba(96,165,250,0.2)'  },
        { value: 'ok',        label: '✓ OK',        color: 'var(--success, #4ade80)', bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.2)'  },
      ],
      filterFn: (row, val) => (val as string[]).includes(row.alertLevel),
    },
    {
      key: 'alertOnly', label: 'Alerts Only', type: 'boolean',
      placeholder: 'Show alerts only',
      filterFn: (row, val) => val === true ? row.alertLevel !== 'ok' : true,
    },
  ];
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StockPlanningPage() {
  const [rows,       setRows]       = useState<PlanningRow[]>([]);
  const [summary,    setSummary]    = useState<Summary | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [cardFilter, setCardFilter] = useState<string | null>(null);

  const filters = useMemo(() => buildFilters(warehouses), [warehouses]);
  const { values, setValue, reset, activeCount } = useERPFilters(filters);

  const fetchData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [planning, whs] = await Promise.all([
        stockTransactionsApi.getPlanning(),
        warehousesApi.getAll(),
      ]);
      const data = planning as { rows: PlanningRow[]; summary: Summary };
      setRows(data.rows ?? []);
      setSummary(data.summary ?? null);
      setWarehouses(whs as Warehouse[]);
    } catch { setError('Failed to load stock planning data.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Apply ERPFilterBar + card filter
  const afterFilters = useMemo(
    () => applyERPFilters(rows, filters, values),
    [rows, filters, values],
  );
  const filtered = useMemo(
    () => cardFilter ? afterFilters.filter(r => r.alertLevel === cardFilter) : afterFilters,
    [afterFilters, cardFilter],
  );

  return (
    <ERPShell breadcrumbs={['Home', 'Inventory', 'Stock Planning']} title="Stock Planning & ATP">
      <style>{`
        .sp-page    { padding: 0 18px 16px; display: flex; flex-direction: column; gap: 10px; height: 100%; overflow: hidden; }
        .sp-summary { display: grid; grid-template-columns: repeat(7,1fr); gap: 6px; flex-shrink: 0; }
        .sp-sum     { background: rgba(10,7,18,0.7); border-radius: 9px; padding: 9px 12px; cursor: pointer; transition: all 0.15s; }
        .sp-sum:hover { opacity: 0.85; }
        .sp-sum-label { font-size: 9px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; margin-bottom: 3px; }
        .sp-sum-value { font-size: 20px; font-weight: 500; font-family: 'IBM Plex Mono', monospace; }
        .sp-legend  { display: flex; gap: 16px; flex-wrap: wrap; align-items: center; flex-shrink: 0; font-size: 11px; }
        .sp-filters { flex-shrink: 0; display: flex; align-items: flex-end; gap: 10; flex-wrap: wrap; }
        .sp-error   { background: rgba(239,68,68,0.08); border: 0.5px solid rgba(239,68,68,0.2); border-radius: 8px; padding: 10px 14px; font-size: 13px; color: var(--danger-subtle, #fca5a5); flex-shrink: 0; }
        .sp-refresh { display: inline-flex; align-items: center; gap: 5px; background: var(--l04, rgba(255,255,255,0.04)); border: 0.5px solid var(--l09, rgba(255,255,255,0.09)); border-radius: 7px; padding: 6px 12px; font-size: 12px; font-family: 'IBM Plex Sans',sans-serif; color: var(--w45, rgba(255,255,255,0.45)); cursor: pointer; }
        .sp-refresh:hover { color: var(--w70, rgba(255,255,255,0.7)); background: var(--l08, rgba(255,255,255,0.08)); }
        .sp-table-wrap { flex: 1; min-height: 0; display: flex; flex-direction: column; }
      `}</style>

      <div className="sp-page">

        {/* ── Summary cards ── */}
        {summary && (
          <div className="sp-summary">
            {[
              { label: 'Critical',    value: summary.critical,        color: 'var(--danger, #f87171)', border: 'rgba(248,113,113,0.2)', filter: 'critical'  },
              { label: 'Warning',     value: summary.warning,         color: 'var(--warning, #fbbf24)', border: 'rgba(251,191,36,0.2)',  filter: 'warning'   },
              { label: '2× Risk',     value: summary.doubleOrderRisk, color: 'var(--accent-strong, #fb923c)', border: 'rgba(251,146,60,0.2)',  filter: null        },
              { label: 'Overstock',   value: summary.overstock,       color: 'var(--accent-blue, #60a5fa)', border: 'rgba(96,165,250,0.2)',  filter: 'overstock' },
              { label: 'OK',          value: summary.ok,              color: 'var(--success, #4ade80)', border: 'rgba(74,222,128,0.2)',  filter: 'ok'        },
              { label: 'Total Items', value: summary.total,           color: 'var(--text-strong, #f1ede8)', border: 'var(--w10, rgba(255,255,255,0.1))', filter: null        },
              { label: 'Stock Value', value: fmtAmt(summary.totalStockValue), color: 'var(--accent-violet, #a78bfa)', border: 'rgba(167,139,250,0.2)', filter: null, isAmt: true },
            ].map(c => (
              <div key={c.label} className="sp-sum"
                style={{ border: `0.5px solid ${cardFilter === c.filter && c.filter ? c.border : 'var(--l08, rgba(255,255,255,0.08))'}`, background: cardFilter === c.filter && c.filter ? `color-mix(in srgb, ${c.color} 3%, transparent)` : 'rgba(10,7,18,0.7)' }}
                onClick={() => c.filter && setCardFilter(prev => prev === c.filter ? null : c.filter)}>
                <div className="sp-sum-label" style={{ color: c.color }}>{c.label}</div>
                <div className="sp-sum-value" style={{ color: c.color, fontSize: c.isAmt ? 14 : 22 }}>{c.value}</div>
              </div>
            ))}
          </div>
        )}

        {error && <div className="sp-error">{error}</div>}

        {/* ── Legend ── */}
        <div className="sp-legend">
          <span style={{ color: 'var(--w30, rgba(255,255,255,0.3))', fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Legend:</span>
          {Object.entries(ALERT_CONFIG).map(([k, v]) => (
            <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ color: v.color, fontWeight: 600 }}>{v.icon}</span>
              <span style={{ color: 'var(--w50, rgba(255,255,255,0.5))' }}>{v.label}</span>
            </span>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'rgba(251,191,36,0.7)', background: 'rgba(251,191,36,0.08)', padding: '2px 8px', borderRadius: 8, border: '0.5px solid rgba(251,191,36,0.2)' }}>
            ⚠ 2× risk = ROP breached but PO already placed
          </span>
        </div>

        {/* ── Filters + Refresh ── */}
        <div className="sp-filters">
          <ERPFilterBar
            filters={filters}
            values={values}
            onChange={setValue}
            onReset={reset}
            activeCount={activeCount + (cardFilter ? 1 : 0)}
          />
          <button className="sp-refresh" onClick={fetchData} style={{ alignSelf: 'flex-end' }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M10 2A5 5 0 1 0 11 6"/><polyline points="8.5,0.5 11,2 9.5,4.5"/>
            </svg>
            Refresh
          </button>
        </div>

        {/* ── ERPTreeTable ── */}
        <div className="sp-table-wrap">
          <ERPTreeTable<PlanningRow>
            columns={COLUMNS}
            data={filtered}
            rowKey={r => `${r.itemId}-${r.warehouseId}`}
            loading={loading}
            exportFilename={`stock-planning-${new Date().toISOString().split('T')[0]}`}
            emptyMessage="No stock data. Adjust filters or refresh."
            defaultPageSize={25}
            canExpand={() => true}
            expandedRow={row => <ExpandedDetail row={row} />}
            expandIndent={40}
            toolbarLeft={
              summary ? (
                <span style={{ fontSize: 11, color: 'var(--w30, rgba(255,255,255,0.3))', fontFamily: "'IBM Plex Mono', monospace" }}>
                  {filtered.length} of {rows.length} items
                  <span style={{ marginLeft: 10, color: 'rgba(167,139,250,0.5)' }}>
                    {fmtAmt(filtered.reduce((s, r) => s + r.stockValue, 0))}
                  </span>
                </span>
              ) : undefined
            }
          />
        </div>

      </div>
    </ERPShell>
  );
}