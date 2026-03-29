"use client";

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import ERPShell from '@/components/layout/ERPShell';
import apiClient from '@/lib/api/client';
import { itemsApi } from '@/lib/api/items';
import { warehousesApi } from '@/lib/api/warehouses';
import { ERPDatePicker, DateSelection } from '@/components/ui/ERPDatePicker';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LedgerRow {
  id: string;
  movementNumber: string;
  movementType: string;
  movementDate: string;
  item?: { id: string; code: string; name: string; itemType: string; baseUom: string };
  warehouse?: { id: string; code: string; name: string };
  referenceType?: string;
  referenceNumber: string;
  quantity: number;
  signedQuantity: number;
  uom: string;
  unitCost: number;
  totalValue: number;
  openingBalance: number;
  closingBalance: number;
  notes?: string;
}

interface LedgerTotals {
  totalIn: number; totalOut: number; netMovement: number;
  totalInValue: number; totalOutValue: number; netValue: number;
  openingBalance: number; closingBalance: number;
}

interface LedgerData {
  rows: LedgerRow[]; totals: LedgerTotals; count: number;
}

interface Item      { id: string; code: string; name: string; itemType: string }
interface Warehouse { id: string; code: string; name: string }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtAmt(v: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(v);
}
function fmtQty(v: number, decimals = 3) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: decimals }).format(v);
}
function fmtDate(d: string) {
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}
function isoDate(d: Date) {
  return d.toISOString().split('T')[0];
}

const MONO: React.CSSProperties = { fontFamily: "'IBM Plex Mono',monospace" };

const MOVE_TYPE_CONFIG: Record<string, { color: string; bg: string; border: string; sign: string; label: string }> = {
  receipt:         { color: '#4ade80', bg: 'rgba(74,222,128,0.1)',   border: 'rgba(74,222,128,0.2)',   sign: '+', label: 'Receipt' },
  issue:           { color: '#f87171', bg: 'rgba(248,113,113,0.1)',  border: 'rgba(248,113,113,0.2)',  sign: '−', label: 'Issue' },
  transfer:        { color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',   border: 'rgba(96,165,250,0.2)',   sign: '⇄', label: 'Transfer' },
  adjustment:      { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',   border: 'rgba(251,191,36,0.2)',   sign: '±', label: 'Adjustment' },
  opening_balance: { color: '#a78bfa', bg: 'rgba(167,139,250,0.1)',  border: 'rgba(167,139,250,0.2)',  sign: '◎', label: 'Opening Bal.' },
};

const ITEM_TYPE_COLOR: Record<string, string> = {
  finished_good: '#4ade80', raw_material: '#60a5fa', consumable: '#fbbf24', service: 'rgba(255,255,255,0.35)',
};

function MoveBadge({ type }: { type: string }) {
  const c = MOVE_TYPE_CONFIG[type] ?? { color: '#e2dfd8', bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.1)', sign: '·', label: type };
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'2px 8px', borderRadius:20, fontSize:10, fontWeight:500, color:c.color, background:c.bg, border:`0.5px solid ${c.border}`, whiteSpace:'nowrap' }}>
      <span style={{ fontSize:11 }}>{c.sign}</span>{c.label}
    </span>
  );
}

// ─── Filter bar ───────────────────────────────────────────────────────────────

interface Filters {
  itemId: string; warehouseId: string; itemType: string;
  movementType: string; referenceNumber: string;
  dateFrom: string; dateTo: string;
}

const EMPTY_FILTERS: Filters = {
  itemId: '', warehouseId: '', itemType: '',
  movementType: '', referenceNumber: '',
  dateFrom: '', dateTo: '',
};

// ─── Main page ────────────────────────────────────────────────────────────────

export default function StockLedgerPage() {
  const router = useRouter();
  const [data,       setData]       = useState<LedgerData | null>(null);
  const [items,      setItems]      = useState<Item[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading,    setLoading]    = useState(false);
  const [error,      setError]      = useState('');
  const [filters,    setFilters]    = useState<Filters>(EMPTY_FILTERS);
  const [applied,    setApplied]    = useState<Filters>(EMPTY_FILTERS);
  const [dateSel,    setDateSel]    = useState<DateSelection | null>(null);

  // Load dropdowns on mount
  useEffect(() => {
    Promise.all([itemsApi.getAll(), warehousesApi.getAll()]).then(([its, whs]) => {
      setItems(its as Item[]);
      setWarehouses(whs as Warehouse[]);
    }).catch(() => {});
  }, []);

  const fetchLedger = useCallback(async (f: Filters) => {
    setLoading(true); setError('');
    try {
      const params: Record<string, string> = {};
      if (f.itemId)          params.itemId          = f.itemId;
      if (f.warehouseId)     params.warehouseId     = f.warehouseId;
      if (f.itemType)        params.itemType        = f.itemType;
      if (f.movementType)    params.movementType    = f.movementType;
      if (f.referenceNumber) params.referenceNumber = f.referenceNumber;
      if (f.dateFrom)        params.dateFrom        = f.dateFrom;
      if (f.dateTo)          params.dateTo          = f.dateTo;
      const res = await apiClient.get('/stock-transactions/ledger', { params });
      setData(res.data as LedgerData);
      setApplied(f);
    } catch (err) {
      setError('Failed to load ledger data.');
    } finally { setLoading(false); }
  }, []);

  // Initial load
  useEffect(() => { fetchLedger(EMPTY_FILTERS); }, [fetchLedger]);

  // When dateSel changes, update dateFrom/dateTo in filters
  const handleDateChange = (sel: DateSelection) => {
    setDateSel(sel);
    const from = isoDate(sel.from ?? (sel as any).date);
    const to   = isoDate(sel.to   ?? (sel as any).date);
    setFilters(f => ({ ...f, dateFrom: from, dateTo: to }));
  };

  const setF = (key: keyof Filters) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setFilters(f => ({ ...f, [key]: e.target.value }));

  const hasFilters = Object.values(applied).some(v => v !== '');

  const INPUT: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.09)',
    borderRadius: 7, padding: '6px 10px', fontSize: 12,
    fontFamily: "'IBM Plex Sans',sans-serif", color: '#e2dfd8', outline: 'none',
  };
  const SELECT: React.CSSProperties = { ...INPUT, cursor: 'pointer' };

  return (
    <ERPShell breadcrumbs={['Home', 'Inventory', 'Stock Ledger']} title="Stock Ledger">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap');
        .sl-page { padding: 0 18px 24px; }
        .sl-filter-panel {
          background: rgba(10,7,18,0.7); border: 0.5px solid rgba(255,255,255,0.08);
          border-radius: 10px; padding: 12px 14px; margin-bottom: 14px;
          display: flex; flex-direction: column; gap: 10px;
        }
        .sl-filter-row { display: flex; gap: 8px; flex-wrap: wrap; align-items: flex-end; }
        .sl-filter-field { display: flex; flex-direction: column; gap: 4px; }
        .sl-filter-label { font-size: 10px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(251,146,60,0.5); }
        select.sl-sel option { background: #0e0b1a; color: #f1ede8; }
        .sl-totals { display: grid; grid-template-columns: repeat(8, 1fr); gap: 6px; margin-bottom: 14px; }
        .sl-total-card { background: rgba(10,7,18,0.7); border-radius: 8px; padding: 8px 12px; }
        .sl-total-label { font-size: 9px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255,255,255,0.3); margin-bottom: 3px; }
        .sl-total-value { font-size: 14px; font-weight: 500; font-family: 'IBM Plex Mono', monospace; }
        .sl-wrap { background: rgba(10,7,18,0.7); border: 0.5px solid rgba(251,146,60,0.12); border-radius: 10px; overflow: hidden; }
        .sl-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .sl-table thead th { padding: 8px 10px; font-size: 9px; font-weight: 500; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(251,146,60,0.55); background: rgba(251,146,60,0.05); border-bottom: 0.5px solid rgba(255,255,255,0.06); text-align: left; white-space: nowrap; }
        .sl-table thead th.right { text-align: right; }
        .sl-table tbody td { padding: 9px 10px; border-bottom: 0.5px solid rgba(255,255,255,0.03); vertical-align: middle; }
        .sl-table tbody tr:last-child td { border-bottom: none; }
        .sl-table tbody tr:hover td { background: rgba(251,146,60,0.02); }
        .sl-empty, .sl-loading { text-align: center; padding: 52px 24px; color: rgba(255,255,255,0.25); font-size: 13px; display: flex; flex-direction: column; align-items: center; gap: 10px; }
        .sl-spinner { width: 18px; height: 18px; border-radius: 50%; border: 2px solid rgba(251,146,60,0.2); border-top-color: #fb923c; animation: sl-spin 0.7s linear infinite; }
        @keyframes sl-spin { to { transform: rotate(360deg); } }
        .sl-footer { font-size: 11px; color: rgba(255,255,255,0.22); padding: 8px 12px; border-top: 0.5px solid rgba(255,255,255,0.04); display: flex; justify-content: space-between; align-items: center; }
        .sl-error { background: rgba(239,68,68,0.08); border: 0.5px solid rgba(239,68,68,0.2); border-radius: 8px; padding: 10px 14px; margin-bottom: 14px; font-size: 13px; color: #fca5a5; }
        .sl-btn-apply { background: linear-gradient(135deg,#c2410c,#ea580c,#f97316); border: none; border-radius: 7px; padding: 7px 16px; font-size: 12px; font-weight: 500; font-family: 'IBM Plex Sans',sans-serif; color: white; cursor: pointer; box-shadow: 0 3px 10px rgba(234,88,12,0.3); transition: opacity 0.15s; flex-shrink: 0; align-self: flex-end; }
        .sl-btn-apply:hover { opacity: 0.88; }
        .sl-btn-reset { background: rgba(255,255,255,0.04); border: 0.5px solid rgba(255,255,255,0.1); border-radius: 7px; padding: 7px 12px; font-size: 12px; font-family: 'IBM Plex Sans',sans-serif; color: rgba(255,255,255,0.4); cursor: pointer; transition: all 0.15s; flex-shrink: 0; align-self: flex-end; }
        .sl-btn-reset:hover { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.7); }
      `}</style>

      <div className="sl-page">

        {/* Filter panel */}
        <div className="sl-filter-panel">
          <div className="sl-filter-row">
            <div className="sl-filter-field" style={{ minWidth: 180 }}>
              <label className="sl-filter-label">Item</label>
              <select className="sl-sel" style={SELECT} value={filters.itemId} onChange={setF('itemId')}>
                <option value="">All Items</option>
                {items.map(i => <option key={i.id} value={i.id}>{i.code} — {i.name}</option>)}
              </select>
            </div>
            <div className="sl-filter-field" style={{ minWidth: 160 }}>
              <label className="sl-filter-label">Warehouse</label>
              <select className="sl-sel" style={SELECT} value={filters.warehouseId} onChange={setF('warehouseId')}>
                <option value="">All Warehouses</option>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
              </select>
            </div>
            <div className="sl-filter-field" style={{ minWidth: 140 }}>
              <label className="sl-filter-label">Category</label>
              <select className="sl-sel" style={SELECT} value={filters.itemType} onChange={setF('itemType')}>
                <option value="">All Categories</option>
                {['finished_good','raw_material','consumable','service'].map(t => (
                  <option key={t} value={t}>{t.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</option>
                ))}
              </select>
            </div>
            <div className="sl-filter-field" style={{ minWidth: 140 }}>
              <label className="sl-filter-label">Movement Type</label>
              <select className="sl-sel" style={SELECT} value={filters.movementType} onChange={setF('movementType')}>
                <option value="">All Types</option>
                {Object.entries(MOVE_TYPE_CONFIG).map(([k, v]) => (
                  <option key={k} value={k}>{v.label}</option>
                ))}
              </select>
            </div>
            <div className="sl-filter-field" style={{ minWidth: 150 }}>
              <label className="sl-filter-label">Reference #</label>
              <input style={{ ...INPUT, width: 150 }} placeholder="INV-2026-0001" value={filters.referenceNumber} onChange={setF('referenceNumber')} />
            </div>
          </div>

          <div className="sl-filter-row">
            {/* ERPDatePicker replaces the two date inputs */}
            <div className="sl-filter-field">
              <label className="sl-filter-label">Date Range</label>
              <ERPDatePicker
                value={dateSel}
                onChange={handleDateChange}
                placeholder="Select date or range…"
                width={300}
              />
            </div>

            <button className="sl-btn-apply" onClick={() => fetchLedger(filters)}>Apply Filters</button>
            {hasFilters && (
              <button className="sl-btn-reset" onClick={() => { setFilters(EMPTY_FILTERS); setDateSel(null); fetchLedger(EMPTY_FILTERS); }}>
                ↺ Clear
              </button>
            )}
          </div>

        </div>

        {error && <div className="sl-error">{error}</div>}

        {/* Totals */}
        {data && (
          <div className="sl-totals">
            {[
              { label: 'Opening Balance', value: fmtQty(data.totals.openingBalance), color: '#a78bfa' },
              { label: 'Total IN (qty)',  value: `+${fmtQty(data.totals.totalIn)}`,  color: '#4ade80' },
              { label: 'Total OUT (qty)', value: `−${fmtQty(data.totals.totalOut)}`, color: '#f87171' },
              { label: 'Net Movement',   value: fmtQty(data.totals.netMovement),     color: data.totals.netMovement >= 0 ? '#4ade80' : '#f87171' },
              { label: 'Closing Balance',value: fmtQty(data.totals.closingBalance),  color: '#60a5fa' },
              { label: 'IN Value',       value: fmtAmt(data.totals.totalInValue),    color: '#4ade80' },
              { label: 'OUT Value',      value: fmtAmt(data.totals.totalOutValue),   color: '#f87171' },
              { label: 'Net Value',      value: fmtAmt(data.totals.netValue),        color: data.totals.netValue >= 0 ? '#4ade80' : '#f87171' },
            ].map(t => (
              <div key={t.label} className="sl-total-card" style={{ border:`0.5px solid ${t.color}20` }}>
                <div className="sl-total-label">{t.label}</div>
                <div className="sl-total-value" style={{ color: t.color, fontSize: 13 }}>{t.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Table */}
        <div className="sl-wrap">
          {loading ? (
            <div className="sl-loading"><div className="sl-spinner" />Loading ledger…</div>
          ) : !data || data.rows.length === 0 ? (
            <div className="sl-empty">
              {hasFilters ? 'No movements match your filters.' : 'No stock movements yet.'}
            </div>
          ) : (
            <>
              <table className="sl-table">
                <thead>
                  <tr>
                    <th>Movement #</th><th>Type</th><th>Date</th><th>Item</th>
                    <th>Category</th><th>Warehouse</th><th>Reference</th>
                    <th className="right">Opening Bal.</th><th className="right">Qty Moved</th>
                    <th className="right">Closing Bal.</th><th>UOM</th>
                    <th className="right">Unit Cost</th><th className="right">Total Value</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map(row => {
                    const mc    = MOVE_TYPE_CONFIG[row.movementType] ?? MOVE_TYPE_CONFIG.adjustment;
                    const isIn  = row.signedQuantity > 0;
                    const isOut = row.signedQuantity < 0;
                    const itColor = ITEM_TYPE_COLOR[row.item?.itemType ?? ''] ?? 'rgba(255,255,255,0.4)';
                    return (
                      <tr key={row.id}>
                        <td><span style={{ ...MONO, fontSize:11, color:'#fb923c' }}>{row.movementNumber}</span></td>
                        <td><MoveBadge type={row.movementType} /></td>
                        <td><span style={{ fontSize:11, color:'rgba(255,255,255,0.45)' }}>{fmtDate(row.movementDate)}</span></td>
                        <td>
                          <span style={{ ...MONO, fontSize:11, color:'#f1ede8', fontWeight:500 }}>{row.item?.code ?? '—'}</span>
                          <div style={{ fontSize:10, color:'rgba(255,255,255,0.35)', marginTop:1 }}>{row.item?.name}</div>
                        </td>
                        <td>
                          {row.item?.itemType && (
                            <span style={{ fontSize:10, padding:'1px 6px', borderRadius:10, color:itColor, background:`${itColor}15`, border:`0.5px solid ${itColor}30` }}>
                              {row.item.itemType.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}
                            </span>
                          )}
                        </td>
                        <td><span style={{ fontSize:11, color:'rgba(255,255,255,0.4)' }}>{row.warehouse?.code ?? '—'}</span></td>
                        <td>
                          <div>
                            {row.referenceType && <div style={{ fontSize:9, color:'rgba(255,255,255,0.3)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:1 }}>{row.referenceType.replace(/_/g,' ')}</div>}
                            <span style={{ ...MONO, fontSize:11, color: row.referenceNumber !== '—' ? '#fb923c' : 'rgba(255,255,255,0.2)' }}>{row.referenceNumber}</span>
                          </div>
                        </td>
                        <td style={{ textAlign:'right' }}><span style={{ ...MONO, fontSize:11, color:'rgba(255,255,255,0.4)' }}>{fmtQty(row.openingBalance)}</span></td>
                        <td style={{ textAlign:'right' }}><span style={{ ...MONO, fontSize:13, fontWeight:600, color: isIn ? '#4ade80' : isOut ? '#f87171' : '#fbbf24' }}>{isIn ? '+' : isOut ? '−' : '±'}{fmtQty(Math.abs(row.signedQuantity))}</span></td>
                        <td style={{ textAlign:'right' }}><span style={{ ...MONO, fontSize:11, color:'#60a5fa', fontWeight:500 }}>{fmtQty(row.closingBalance)}</span></td>
                        <td><span style={{ fontSize:10, color:'rgba(255,255,255,0.35)' }}>{row.uom}</span></td>
                        <td style={{ textAlign:'right' }}><span style={{ ...MONO, fontSize:11, color:'rgba(255,255,255,0.45)' }}>{row.unitCost > 0 ? fmtAmt(row.unitCost) : '—'}</span></td>
                        <td style={{ textAlign:'right' }}><span style={{ ...MONO, fontSize:12, fontWeight:500, color: isIn ? '#4ade80' : isOut ? '#f87171' : '#fbbf24' }}>{row.totalValue !== 0 ? (isIn ? '+' : '−') + fmtAmt(Math.abs(row.totalValue)) : '—'}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="sl-footer">
                <span>{data.count} movement{data.count !== 1 ? 's' : ''}</span>
                {hasFilters && <span style={{ fontSize:10, color:'rgba(251,146,60,0.5)' }}>Filtered results — totals reflect current filter</span>}
              </div>
            </>
          )}
        </div>
      </div>
    </ERPShell>
  );
}