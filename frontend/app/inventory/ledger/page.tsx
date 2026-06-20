"use client";

import { useEffect, useState, useCallback, useMemo }  from 'react';
import ERPShell                                         from '@/components/layout/ERPShell';
import { ERPTable, ERPColumn }                         from '@/components/ui/ERPTable';
import { ERPFilterBar, ERPFilter, useERPFilters }      from '@/components/ui/ERPFilterBar';
import { itemsApi }                                    from '@/lib/api/items';
import { warehousesApi }                               from '@/lib/api/warehouses';
import { stockTransactionsApi }                        from '@/lib/api/stock-transactions';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LedgerRow {
  id:              string;
  movementNumber:  string;
  movementType:    string;
  movementDate:    string;
  item?:           { id: string; code: string; name: string; itemType: string; baseUom: string };
  warehouse?:      { id: string; code: string; name: string };
  referenceType?:  string;
  referenceNumber: string;
  quantity:        number;
  signedQuantity:  number;
  uom:             string;
  purchaseQty?:    number;
  purchaseUom?:    string;
  unitCost:        number;
  movementValue?:  number;
  totalValue:      number;
  openingBalance:  number;
  closingBalance:  number;
  notes?:          string;
}

interface LedgerTotals {
  totalIn: number; totalOut: number; netMovement: number;
  totalInValue: number; totalOutValue: number; netValue: number;
  openingBalance: number; closingBalance: number;
}

interface LedgerData { rows: LedgerRow[]; totals: LedgerTotals; count: number }
interface Item        { id: string; code: string; name: string; itemType: string }
interface Warehouse   { id: string; code: string; name: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONO: React.CSSProperties = { fontFamily: "'IBM Plex Mono', monospace" };

function fmtAmt(v: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(v);
}
function fmtQty(v: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(Math.abs(v));
}
function fmtDate(d: string) {
  return new Date(d).toLocaleString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

const MOVE_CFG: Record<string, { color: string; bg: string; border: string; sign: string; label: string }> = {
  receipt:         { color: 'var(--success)', bg: 'rgba(74,222,128,0.1)',   border: 'rgba(74,222,128,0.2)',   sign: '+', label: 'Receipt'      },
  issue:           { color: 'var(--danger)', bg: 'rgba(248,113,113,0.1)',  border: 'rgba(248,113,113,0.2)',  sign: '−', label: 'Issue'        },
  transfer:        { color: 'var(--accent-blue)', bg: 'rgba(96,165,250,0.1)',   border: 'rgba(96,165,250,0.2)',   sign: '⇄', label: 'Transfer'     },
  adjustment:      { color: 'var(--warning)', bg: 'rgba(251,191,36,0.1)',   border: 'rgba(251,191,36,0.2)',   sign: '±', label: 'Adjustment'   },
  opening_balance: { color: 'var(--accent-violet)', bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.2)',  sign: '◎', label: 'Opening Bal.' },
};

const ITEM_TYPE_CFG: Record<string, string> = {
  finished_good: 'var(--success)', raw_material: 'var(--accent-blue)',
  consumable: 'var(--warning)', service: 'rgba(255,255,255,0.35)',
};

function MoveBadge({ type }: { type: string }) {
  const c = MOVE_CFG[type] ?? { color: 'var(--text-primary)', bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.1)', sign: '·', label: type };
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 500,
      color: c.color, background: c.bg, border: `0.5px solid ${c.border}`,
      whiteSpace: 'nowrap',
    }}>
      <span style={{ fontSize: 11 }}>{c.sign}</span>{c.label}
    </span>
  );
}

// ─── Sign helper ─────────────────────────────────────────────────────────────
// For adjustments: use movementValue sign (negative = shortage/loss)
// For other types: use signedQuantity direction
function getEffectiveSign(r: LedgerRow): number {
  if (r.movementType === 'adjustment' && r.movementValue !== undefined && r.movementValue !== null) {
    return r.movementValue < 0 ? -1 : r.movementValue > 0 ? 1 : 0;
  }
  return r.signedQuantity >= 0 ? 1 : -1;
}

// ─── Columns ─────────────────────────────────────────────────────────────────

const COLUMNS: ERPColumn<LedgerRow>[] = [
  {
    key: 'movementNumber', header: 'Movement #', width: 130, sortable: true,
    value: r => r.movementNumber,
    render: r => <span style={{ ...MONO, fontSize: 11, color: 'var(--accent-strong)' }}>{r.movementNumber}</span>,
  },
  {
    key: 'movementType', header: 'Type', width: 120, sortable: true,
    value: r => r.movementType,
    render: r => <MoveBadge type={r.movementType} />,
  },
  {
    key: 'movementDate', header: 'Date', width: 155, sortable: true,
    value: r => r.movementDate,
    render: r => <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{fmtDate(r.movementDate)}</span>,
  },
  {
    key: 'item', header: 'Item', sortable: true,
    value: r => r.item?.code ?? '',
    render: r => (
      <div>
        <span style={{ ...MONO, fontSize: 11, color: 'var(--text-strong)', fontWeight: 500 }}>{r.item?.code ?? '—'}</span>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>{r.item?.name}</div>
      </div>
    ),
  },
  {
    key: 'itemType', header: 'Category', width: 120, sortable: true,
    value: r => r.item?.itemType ?? '',
    render: r => {
      const color = ITEM_TYPE_CFG[r.item?.itemType ?? ''] ?? 'rgba(255,255,255,0.35)';
      return r.item?.itemType ? (
        <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 10, color, background: `color-mix(in srgb, ${color} 8%, transparent)`, border: `0.5px solid color-mix(in srgb, ${color} 19%, transparent)`, whiteSpace: 'nowrap' }}>
          {r.item.itemType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
        </span>
      ) : null;
    },
  },
  {
    key: 'warehouse', header: 'Warehouse', width: 110, sortable: true,
    value: r => r.warehouse?.code ?? '',
    render: r => (
      <div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{r.warehouse?.code ?? '—'}</div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 1 }}>{r.warehouse?.name}</div>
      </div>
    ),
  },
  {
    key: 'referenceNumber', header: 'Reference', width: 140, sortable: true,
    value: r => r.referenceNumber,
    render: r => (
      <div>
        {r.referenceType && (
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 1 }}>
            {r.referenceType.replace(/_/g, ' ')}
          </div>
        )}
        <span style={{ ...MONO, fontSize: 11, color: r.referenceNumber !== '—' ? 'var(--accent-strong)' : 'rgba(255,255,255,0.2)' }}>
          {r.referenceNumber}
        </span>
      </div>
    ),
  },
  {
    key: 'openingBalance', header: 'Opening Bal.', width: 110, align: 'right', sortable: true,
    value: r => r.openingBalance,
    render: r => <span style={{ ...MONO, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{fmtQty(r.openingBalance)}</span>,
  },
  {
    key: 'signedQuantity', header: 'Qty Moved', width: 110, align: 'right', sortable: true,
    value: r => r.signedQuantity,
    render: r => {
      const sign   = getEffectiveSign(r);
      const color  = sign > 0 ? 'var(--success)' : sign < 0 ? 'var(--danger)' : 'var(--warning)';
      const prefix = sign > 0 ? '+' : sign < 0 ? '−' : '±';
      return (
        <div style={{ textAlign: 'right' }}>
          <span style={{ ...MONO, fontSize: 13, fontWeight: 600, color }}>
            {prefix}{fmtQty(r.signedQuantity)}
          </span>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', marginTop: 1 }}>{r.uom}</div>
        </div>
      );
    },
  },
  {
    key: 'purchaseQty', header: 'Purchase Qty', width: 120, align: 'right', sortable: true,
    value: r => r.purchaseQty ?? r.quantity,
    render: r => {
      const pQty   = r.purchaseQty ?? r.quantity;
      const pUom   = r.purchaseUom ?? r.uom;
      const sign   = getEffectiveSign(r);
      const color  = sign > 0 ? 'var(--success)' : sign < 0 ? 'var(--danger)' : 'var(--warning)';
      const prefix = sign > 0 ? '+' : sign < 0 ? '−' : '±';
      return (
        <div style={{ textAlign: 'right' }}>
          <span style={{ ...MONO, fontSize: 12, fontWeight: 500, color }}>
            {prefix}{fmtQty(pQty)}
          </span>
          <div style={{ marginTop: 2 }}>
            <span style={{
              fontSize: 9, padding: '1px 5px', borderRadius: 8,
              color: 'var(--accent-strong)', background: 'rgba(251,146,60,0.1)',
              border: '0.5px solid rgba(251,146,60,0.2)', ...MONO,
            }}>{pUom}</span>
          </div>
        </div>
      );
    },
  },
  {
    key: 'closingBalance', header: 'Closing Bal.', width: 110, align: 'right', sortable: true,
    value: r => r.closingBalance,
    render: r => <span style={{ ...MONO, fontSize: 11, color: 'var(--accent-blue)', fontWeight: 500 }}>{fmtQty(r.closingBalance)}</span>,
  },
  {
    key: 'unitCost', header: 'Unit Cost', width: 110, align: 'right', sortable: true,
    value: r => r.unitCost,
    render: r => (
      <span style={{ ...MONO, fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
        {r.unitCost > 0 ? fmtAmt(r.unitCost) : '—'}
      </span>
    ),
  },
  {
    // FIX: use the actual sign of movementValue from DB — not signedQuantity
    // Cycle count adjustments have signed movementValue (negative=loss) but
    // signedQuantity reflects the absolute physical movement direction
    key: 'movementValue', header: 'Movement Value', width: 130, align: 'right', sortable: true,
    value: r => r.movementValue ?? r.totalValue,
    render: r => {
      const val  = r.movementValue ?? r.totalValue;
      const isPos = val > 0;
      const isNeg = val < 0;
      const color = isPos ? 'var(--success)' : isNeg ? 'var(--danger)' : 'var(--warning)';
      return (
        <span style={{ ...MONO, fontSize: 12, fontWeight: 500, color }}>
          {val !== 0 ? (isPos ? '+' : '−') + fmtAmt(Math.abs(val)) : '—'}
        </span>
      );
    },
  },
];

// ─── Filter definitions ───────────────────────────────────────────────────────

function buildFilters(items: Item[], warehouses: Warehouse[]): ERPFilter<LedgerRow>[] {
  return [
    {
      key: 'itemSearch', label: 'Item', type: 'searchselect',
      placeholder: 'Search item…', selectWidth: 210,
      options: items.map(i => ({ value: i.id, label: i.code, sublabel: i.name })),
      filterFn: (row, val) => row.item?.id === String(val),
    },
    {
      key: 'warehouseId', label: 'Warehouse', type: 'searchselect',
      placeholder: 'All warehouses', selectWidth: 190,
      options: warehouses.map(w => ({ value: w.id, label: w.code, sublabel: w.name })),
      filterFn: (row, val) => row.warehouse?.id === String(val),
    },
    {
      key: 'movementType', label: 'Type', type: 'multiselect',
      options: Object.entries(MOVE_CFG).map(([v, c]) => ({
        value: v, label: c.label,
        color: c.color, bg: c.bg, border: c.border,
      })),
      filterFn: (row, val) => (val as string[]).includes(row.movementType),
    },
    {
      key: 'itemType', label: 'Category', type: 'multiselect',
      options: [
        { value: 'finished_good', label: 'Finished Good', color: 'var(--success)', bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.2)'  },
        { value: 'raw_material',  label: 'Raw Material',  color: 'var(--accent-blue)', bg: 'rgba(96,165,250,0.1)',  border: 'rgba(96,165,250,0.2)'  },
        { value: 'consumable',    label: 'Consumable',    color: 'var(--warning)', bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.2)'  },
      ],
      filterFn: (row, val) => (val as string[]).includes(row.item?.itemType ?? ''),
    },
    {
      key: 'referenceNumber', label: 'Reference #', type: 'search',
      placeholder: 'GRN-2026-001…', inputWidth: 160,
      filterFn: (row, val) => row.referenceNumber.toLowerCase().includes(String(val).toLowerCase()),
    },
    {
      key: 'movementDate', label: 'Date', type: 'daterange',
      dateWidth: 210,
      filterFn: () => true, // backend filters by date
    },
  ];
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StockLedgerPage() {
  const [data,       setData]       = useState<LedgerData | null>(null);
  const [items,      setItems]      = useState<Item[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');

  const filters = useMemo(() => buildFilters(items, warehouses), [items, warehouses]);
  const { values, setValue, reset, activeCount } = useERPFilters(filters);

  useEffect(() => {
    Promise.all([itemsApi.getAll(), warehousesApi.getAll()]).then(([its, whs]) => {
      setItems(its as Item[]);
      setWarehouses(whs as Warehouse[]);
    }).catch(() => {});
  }, []);

  const fetchLedger = useCallback(async (filterValues: typeof values) => {
    setLoading(true); setError('');
    try {
      const params: Record<string, string> = {};
      const itemSel = filterValues['itemSearch'] as string;
      const whSel   = filterValues['warehouseId'] as string;
      const movType = filterValues['movementType'] as string[];
      const refNum  = filterValues['referenceNumber'] as string;

      if (itemSel) params.itemId          = itemSel;
      if (whSel)   params.warehouseId     = whSel;
      if (movType?.length === 1) params.movementType = movType[0];
      if (refNum)  params.referenceNumber = refNum;

      const dateSel = filterValues['movementDate'] as any;
      if (dateSel) {
        const from = dateSel.from ?? dateSel.date;
        const to   = dateSel.to   ?? dateSel.date;
        if (from) params.dateFrom = new Date(from).toISOString().split('T')[0];
        if (to)   params.dateTo   = new Date(to).toISOString().split('T')[0];
      }

      const res = await stockTransactionsApi.getLedger(params);
      setData(res as LedgerData);
    } catch {
      setError('Failed to load ledger data.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchLedger({}); }, [fetchLedger]);

  const handleApply = () => fetchLedger(values);
  const handleReset = () => { reset(); fetchLedger({}); };

  const rows = data?.rows ?? [];

  return (
    <ERPShell breadcrumbs={['Home', 'Inventory', 'Stock Ledger']} title="Stock Ledger">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&display=swap');
        .sl-page    { padding: 0 18px 16px; display: flex; flex-direction: column; gap: 10px; height: 100%; overflow: hidden; }
        .sl-filters { background: rgba(10,7,18,0.7); border: 0.5px solid rgba(255,255,255,0.08); border-radius: 10px; padding: 12px 16px; flex-shrink: 0; display: flex; flex-direction: column; gap: 12px; }
        .sl-filter-actions { display: flex; align-items: center; gap: 8px; }
        .sl-btn-apply { background: linear-gradient(135deg,var(--accent-pressed),var(--accent),var(--accent-mid)); border: none; border-radius: 7px; padding: 7px 18px; font-size: 12px; font-weight: 500; font-family: 'IBM Plex Sans',sans-serif; color: white; cursor: pointer; box-shadow: 0 3px 10px rgba(234,88,12,0.3); }
        .sl-btn-apply:hover { opacity: 0.88; }
        .sl-btn-reset { background: rgba(255,255,255,0.04); border: 0.5px solid rgba(255,255,255,0.1); border-radius: 7px; padding: 7px 14px; font-size: 12px; font-family: 'IBM Plex Sans',sans-serif; color: rgba(255,255,255,0.4); cursor: pointer; }
        .sl-totals  { display: grid; grid-template-columns: repeat(8,1fr); gap: 6px; flex-shrink: 0; }
        .sl-total   { background: rgba(10,7,18,0.7); border-radius: 8px; padding: 8px 10px; }
        .sl-total-l { font-size: 9px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255,255,255,0.3); margin-bottom: 3px; }
        .sl-total-v { font-size: 13px; font-weight: 500; font-family: 'IBM Plex Mono', monospace; }
        .sl-table-wrap { flex: 1; min-height: 0; display: flex; flex-direction: column; }
        .sl-error   { background: rgba(239,68,68,0.08); border: 0.5px solid rgba(239,68,68,0.2); border-radius: 8px; padding: 10px 14px; font-size: 13px; color: var(--danger-subtle); flex-shrink: 0; }
      `}</style>

      <div className="sl-page">
        <div className="sl-filters">
          <ERPFilterBar
            filters={filters}
            values={values}
            onChange={setValue}
            onReset={handleReset}
            activeCount={activeCount}
          />
          <div className="sl-filter-actions">
            <button className="sl-btn-apply" onClick={handleApply}>Apply Filters</button>
            {activeCount > 0 && (
              <button className="sl-btn-reset" onClick={handleReset}>↺ Clear</button>
            )}
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginLeft: 4 }}>
              Date filter requires Apply — other filters work in real-time
            </span>
          </div>
        </div>

        {error && <div className="sl-error">{error}</div>}

        {data && (
          <div className="sl-totals">
            {[
              { label: 'Opening Bal.',   value: fmtQty(data.totals.openingBalance), color: 'var(--accent-violet)', border: 'rgba(167,139,250,0.15)' },
              { label: 'Total IN (qty)', value: `+${fmtQty(data.totals.totalIn)}`,  color: 'var(--success)', border: 'rgba(74,222,128,0.15)'  },
              { label: 'Total OUT (qty)',value: `−${fmtQty(data.totals.totalOut)}`,  color: 'var(--danger)', border: 'rgba(248,113,113,0.15)' },
              { label: 'Net Movement',   value: fmtQty(data.totals.netMovement),    color: data.totals.netMovement >= 0 ? 'var(--success)' : 'var(--danger)', border: 'rgba(255,255,255,0.06)' },
              { label: 'Closing Bal.',   value: fmtQty(data.totals.closingBalance), color: 'var(--accent-blue)', border: 'rgba(96,165,250,0.15)'  },
              { label: 'IN Value',       value: fmtAmt(data.totals.totalInValue),   color: 'var(--success)', border: 'rgba(74,222,128,0.1)'   },
              { label: 'OUT Value',      value: fmtAmt(data.totals.totalOutValue),  color: 'var(--danger)', border: 'rgba(248,113,113,0.1)'  },
              { label: 'Net Value',      value: fmtAmt(data.totals.netValue),       color: data.totals.netValue >= 0 ? 'var(--success)' : 'var(--danger)', border: 'rgba(255,255,255,0.06)' },
            ].map(t => (
              <div key={t.label} className="sl-total" style={{ border: `0.5px solid ${t.border}` }}>
                <div className="sl-total-l">{t.label}</div>
                <div className="sl-total-v" style={{ color: t.color }}>{t.value}</div>
              </div>
            ))}
          </div>
        )}

        <div className="sl-table-wrap">
          <ERPTable<LedgerRow>
            columns={COLUMNS}
            data={rows}
            rowKey={r => r.id}
            loading={loading}
            exportFilename={`stock-ledger-${new Date().toISOString().split('T')[0]}`}
            emptyMessage="No stock movements. Apply filters or post transactions."
            defaultPageSize={25}
            maxHeight="calc(100vh - 420px)"
            toolbarLeft={
              data ? (
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: "'IBM Plex Mono', monospace" }}>
                  {data.count} movement{data.count !== 1 ? 's' : ''}
                  {data.totals && (
                    <span style={{ marginLeft: 10, color: 'rgba(251,146,60,0.5)' }}>
                      Net: {fmtAmt(data.totals.netValue)}
                    </span>
                  )}
                </span>
              ) : undefined
            }
          />
        </div>
      </div>
    </ERPShell>
  );
}