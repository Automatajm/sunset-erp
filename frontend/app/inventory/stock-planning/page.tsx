"use client";

import { useEffect, useState, useCallback } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import apiClient from '@/lib/api/client';
import { warehousesApi } from '@/lib/api/warehouses';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PlanningRow {
  itemId: string; itemCode: string; itemName: string; itemType: string;
  warehouseId: string; warehouseCode: string; warehouseName: string; uom: string;
  onHandQty: number; reservedQty: number; availableQty: number;
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

const MONO: React.CSSProperties = { fontFamily: "'IBM Plex Mono',monospace" };

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
  critical:  { color: '#f87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.25)', label: 'Critical',  icon: '⚠' },
  warning:   { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)',  border: 'rgba(251,191,36,0.25)',  label: 'Warning',   icon: '△' },
  overstock: { color: '#60a5fa', bg: 'rgba(96,165,250,0.12)',  border: 'rgba(96,165,250,0.25)',  label: 'Overstock', icon: '▲' },
  ok:        { color: '#4ade80', bg: 'rgba(74,222,128,0.08)',  border: 'rgba(74,222,128,0.2)',   label: 'OK',        icon: '✓' },
};

const ITEM_TYPE_COLOR: Record<string, string> = {
  finished_good: '#4ade80', raw_material: '#60a5fa', consumable: '#fbbf24',
};

// ─── Mini gauge bar ───────────────────────────────────────────────────────────

function GaugeBar({ value, max, color, bg }: { value: number; max: number; color: string; bg?: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div style={{ width: '100%', height: 4, background: bg ?? 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: 2, transition: 'width 0.3s' }} />
    </div>
  );
}

// ─── Expandable row ───────────────────────────────────────────────────────────

function PlanningRow({ row }: { row: PlanningRow }) {
  const [expanded, setExpanded] = useState(false);
  const alert    = ALERT_CONFIG[row.alertLevel];
  const itColor  = ITEM_TYPE_COLOR[row.itemType] ?? 'rgba(255,255,255,0.4)';
  const maxStock = Math.max(row.onHandQty + row.poSupplyQty, row.reorderPoint * 2, 1);

  return (
    <>
      <tr
        onClick={() => setExpanded(e => !e)}
        style={{ cursor: 'pointer', background: row.alertLevel === 'critical' ? 'rgba(248,113,113,0.03)' : row.alertLevel === 'warning' ? 'rgba(251,191,36,0.02)' : 'transparent' }}
      >
        {/* Expand chevron + Alert */}
        <td>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', transform: expanded ? 'rotate(90deg)' : 'none', display: 'inline-block', transition: 'transform 0.15s' }}>▶</span>
            <span style={{ fontSize: 11, color: alert.color, fontWeight: 600 }}>{alert.icon}</span>
            {row.doubleOrderRisk && (
              <span title="PO already placed — check before reordering!" style={{ fontSize: 9, padding: '1px 5px', borderRadius: 8, background: 'rgba(251,191,36,0.15)', border: '0.5px solid rgba(251,191,36,0.3)', color: '#fbbf24', whiteSpace: 'nowrap' }}>
                2× risk
              </span>
            )}
          </div>
        </td>

        {/* Item */}
        <td>
          <span style={{ ...MONO, fontSize: 11, color: '#f1ede8', fontWeight: 500 }}>{row.itemCode}</span>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>{row.itemName}</div>
        </td>

        {/* Category */}
        <td>
          <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 10, color: itColor, background: `${itColor}15`, border: `0.5px solid ${itColor}30`, whiteSpace: 'nowrap' }}>
            {row.itemType.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())}
          </span>
        </td>

        {/* On Hand */}
        <td style={{ textAlign: 'right' }}>
          <span style={{ ...MONO, fontSize: 12, color: '#f1ede8', fontWeight: 500 }}>{fmtQty(row.onHandQty)}</span>
          <div style={{ marginTop: 3 }}>
            <GaugeBar value={row.onHandQty} max={maxStock} color={alert.color} />
          </div>
        </td>

        {/* PO Supply (incoming) */}
        <td style={{ textAlign: 'right' }}>
          {row.poSupplyQty > 0 ? (
            <div>
              <span style={{ ...MONO, fontSize: 11, color: '#4ade80' }}>+{fmtQty(row.poSupplyQty)}</span>
              {row.nextReceiptDate && (
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>by {fmtDate(row.nextReceiptDate)}</div>
              )}
            </div>
          ) : <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>—</span>}
        </td>

        {/* SO Demand (committed) */}
        <td style={{ textAlign: 'right' }}>
          {row.soDemandQty > 0 ? (
            <span style={{ ...MONO, fontSize: 11, color: '#f87171' }}>−{fmtQty(row.soDemandQty)}</span>
          ) : <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>—</span>}
        </td>

        {/* ATP */}
        <td style={{ textAlign: 'right' }}>
          <span style={{ ...MONO, fontSize: 13, fontWeight: 700, color: row.atpQty < 0 ? '#f87171' : row.atpQty <= row.safetyStock ? '#fbbf24' : '#4ade80' }}>
            {row.atpQty < 0 ? '' : ''}{fmtQty(row.atpQty)}
          </span>
        </td>

        {/* Coverage */}
        <td style={{ textAlign: 'right' }}>
          {row.coverageDays !== null ? (
            <span style={{ ...MONO, fontSize: 11, color: row.coverageDays <= row.leadTimeDays ? '#f87171' : row.coverageDays <= 30 ? '#fbbf24' : '#4ade80' }}>
              {row.coverageDays}d
            </span>
          ) : (
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>∞</span>
          )}
        </td>

        {/* Reorder Point / Safety Stock */}
        <td>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', minWidth: 22 }}>ROP</span>
              <span style={{ ...MONO, fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>{fmtQty(row.reorderPoint)}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', minWidth: 22 }}>SS</span>
              <span style={{ ...MONO, fontSize: 10, color: 'rgba(255,255,255,0.5)' }}>{fmtQty(row.safetyStock)}</span>
            </div>
          </div>
        </td>

        {/* Suggested Order */}
        <td style={{ textAlign: 'right' }}>
          {row.suggestedOrderQty > 0 ? (
            <div>
              <span style={{ ...MONO, fontSize: 12, fontWeight: 600, color: '#fb923c' }}>{fmtQty(row.suggestedOrderQty)}</span>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', marginTop: 1 }}>{row.uom} · LT {row.leadTimeDays}d</div>
            </div>
          ) : (
            <span style={{ fontSize: 10, color: 'rgba(74,222,128,0.5)' }}>✓ Covered</span>
          )}
        </td>

        {/* Stock Value */}
        <td style={{ textAlign: 'right' }}>
          <span style={{ ...MONO, fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{fmtAmt(row.stockValue)}</span>
        </td>
      </tr>

      {/* Expanded detail */}
      {expanded && (
        <tr>
          <td colSpan={11} style={{ padding: 0, background: 'rgba(255,255,255,0.01)' }}>
            <div style={{ padding: '12px 20px 16px 44px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>

              {/* Stock breakdown */}
              <div>
                <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(251,146,60,0.5)', marginBottom: 8 }}>Stock Position</div>
                {[
                  { label: 'On Hand',    value: fmtQty(row.onHandQty),    color: '#f1ede8' },
                  { label: 'Reserved',   value: fmtQty(row.reservedQty),  color: '#fbbf24' },
                  { label: 'Available',  value: fmtQty(row.availableQty), color: '#4ade80' },
                  { label: 'Unit Cost',  value: `$${row.unitCost.toFixed(4)}`, color: 'rgba(255,255,255,0.5)' },
                  { label: 'Stock Value', value: fmtAmt(row.stockValue),   color: '#60a5fa' },
                ].map(r => (
                  <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '3px 0', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{r.label}</span>
                    <span style={{ ...MONO, fontSize: 11, color: r.color }}>{r.value}</span>
                  </div>
                ))}
                {/* Visual gauge: on hand vs reorder point vs safety stock */}
                <div style={{ marginTop: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'rgba(255,255,255,0.3)', marginBottom: 4 }}>
                    <span>Safety Stock ({fmtQty(row.safetyStock)})</span>
                    <span>Reorder Point ({fmtQty(row.reorderPoint)})</span>
                  </div>
                  <div style={{ position: 'relative', height: 8, background: 'rgba(255,255,255,0.06)', borderRadius: 4, overflow: 'hidden' }}>
                    {/* Safety stock marker */}
                    <div style={{ position: 'absolute', left: `${Math.min(100, (row.safetyStock / maxStock) * 100)}%`, top: 0, bottom: 0, width: 1, background: '#f87171', opacity: 0.6 }} />
                    {/* Reorder point marker */}
                    <div style={{ position: 'absolute', left: `${Math.min(100, (row.reorderPoint / maxStock) * 100)}%`, top: 0, bottom: 0, width: 1, background: '#fbbf24', opacity: 0.6 }} />
                    {/* ATP bar */}
                    <div style={{ width: `${Math.min(100, Math.max(0, (row.atpQty / maxStock) * 100))}%`, height: '100%', background: alert.color, opacity: 0.7, borderRadius: 4 }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 3 }}>
                    <span>ATP: {fmtQty(row.atpQty)} {row.uom}</span>
                  </div>
                </div>
              </div>

              {/* Open POs */}
              <div>
                <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(74,222,128,0.5)', marginBottom: 8 }}>
                  Incoming Supply — {row.openPOs.length} PO{row.openPOs.length !== 1 ? 's' : ''} ({fmtQty(row.poSupplyQty)} {row.uom})
                </div>
                {row.openPOs.length === 0 ? (
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>No pending purchase orders</div>
                ) : (
                  row.openPOs.slice(0, 8).map((po, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>
                      <span style={{ ...MONO, fontSize: 11, color: '#4ade80' }}>{po.poNumber}</span>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ ...MONO, fontSize: 11, color: '#f1ede8' }}>+{fmtQty(po.pending)}</span>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>{fmtDate(po.expectedDate)}</div>
                      </div>
                    </div>
                  ))
                )}
                {row.openPOs.length > 8 && (
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 4 }}>+{row.openPOs.length - 8} more POs…</div>
                )}
              </div>

              {/* Open SOs + Planning params */}
              <div>
                <div style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(248,113,113,0.5)', marginBottom: 8 }}>
                  Committed Demand — {row.openSOs.length} SO{row.openSOs.length !== 1 ? 's' : ''} ({fmtQty(row.soDemandQty)} {row.uom})
                </div>
                {row.openSOs.length === 0 ? (
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)', marginBottom: 12 }}>No open sales orders</div>
                ) : (
                  row.openSOs.slice(0, 5).map((so, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '3px 0', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>
                      <span style={{ ...MONO, fontSize: 11, color: '#f87171' }}>{so.soNumber}</span>
                      <div style={{ textAlign: 'right' }}>
                        <span style={{ ...MONO, fontSize: 11, color: '#f1ede8' }}>−{fmtQty(so.demand)}</span>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)' }}>{fmtDate(so.promisedDate)}</div>
                      </div>
                    </div>
                  ))
                )}

                <div style={{ marginTop: 10, fontSize: 9, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(251,146,60,0.5)', marginBottom: 6 }}>Planning Parameters</div>
                {[
                  { label: 'Lead Time',      value: `${row.leadTimeDays} days` },
                  { label: 'Reorder Qty',    value: `${fmtQty(row.reorderQty)} ${row.uom}` },
                  { label: 'Coverage',       value: row.coverageDays !== null ? `${row.coverageDays} days` : '∞' },
                  { label: 'Daily Demand',   value: row.dailyDemand > 0 ? `${row.dailyDemand.toFixed(2)} ${row.uom}/day` : 'No demand' },
                  { label: 'Suggested PO',   value: row.suggestedOrderQty > 0 ? `${fmtQty(row.suggestedOrderQty)} ${row.uom}` : 'Not needed' },
                ].map(r => (
                  <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', padding: '2px 0' }}>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)' }}>{r.label}</span>
                    <span style={{ ...MONO, fontSize: 10, color: 'rgba(255,255,255,0.6)' }}>{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function StockPlanningPage() {
  const [rows,        setRows]       = useState<PlanningRow[]>([]);
  const [summary,     setSummary]    = useState<Summary | null>(null);
  const [warehouses,  setWarehouses] = useState<Warehouse[]>([]);
  const [loading,     setLoading]    = useState(true);
  const [error,       setError]      = useState('');
  const [search,      setSearch]     = useState('');
  const [alertFilter, setAlertFilter]= useState('');
  const [warehouseF,  setWarehouseF] = useState('');
  const [itemTypeF,   setItemTypeF]  = useState('');
  const [alertOnly,   setAlertOnly]  = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [planning, whs] = await Promise.all([
        apiClient.get('/stock-transactions/planning', { params: { alertOnly: alertOnly ? 'true' : undefined } }),
        warehousesApi.getAll(),
      ]);
      const data = planning.data as { rows: PlanningRow[]; summary: Summary };
      setRows(data.rows ?? []);
      setSummary(data.summary ?? null);
      setWarehouses(whs as Warehouse[]);
    } catch { setError('Failed to load stock planning data.'); }
    finally { setLoading(false); }
  }, [alertOnly]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filtered = rows.filter(row => {
    const q = search.toLowerCase();
    const matchSearch = !q || row.itemCode.toLowerCase().includes(q) || row.itemName.toLowerCase().includes(q);
    const matchAlert  = !alertFilter  || row.alertLevel === alertFilter;
    const matchWH     = !warehouseF   || row.warehouseId === warehouseF;
    const matchType   = !itemTypeF    || row.itemType === itemTypeF;
    return matchSearch && matchAlert && matchWH && matchType;
  });

  const SEL: React.CSSProperties = { background:'rgba(255,255,255,0.04)', border:'0.5px solid rgba(255,255,255,0.09)', borderRadius:7, padding:'7px 10px', fontSize:12, fontFamily:"'IBM Plex Sans',sans-serif", color:'#e2dfd8', outline:'none', cursor:'pointer' };
  const hasFilters = !!(search || alertFilter || warehouseF || itemTypeF);

  return (
    <ERPShell breadcrumbs={['Home', 'Inventory', 'Stock Planning']} title="Stock Planning & ATP">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap');
        .sp-page { padding: 0 18px 24px; }

        /* Summary cards */
        .sp-summary { display:grid; grid-template-columns:repeat(7,1fr); gap:6px; margin-bottom:16px; }
        .sp-sum { background:rgba(10,7,18,0.7); border-radius:9px; padding:9px 12px; cursor:pointer; transition:all 0.15s; }
        .sp-sum:hover { transform:translateY(-1px); opacity:0.85; }
        .sp-sum-label { font-size:9px; font-weight:500; letter-spacing:0.08em; text-transform:uppercase; margin-bottom:3px; }
        .sp-sum-value { font-size:20px; font-weight:500; font-family:'IBM Plex Mono',monospace; }

        /* Toolbar */
        .sp-toolbar { display:flex; align-items:center; gap:8px; margin-bottom:14px; flex-wrap:wrap; }
        .sp-search { background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.09); border-radius:7px; padding:7px 12px; font-size:12px; font-family:'IBM Plex Sans',sans-serif; color:#e2dfd8; outline:none; width:220px; }
        .sp-search::placeholder { color:rgba(255,255,255,0.2); }
        .sp-search:focus { border-color:rgba(251,146,60,0.4); box-shadow:0 0 0 2px rgba(234,88,12,0.08); }
        .sp-toggle { display:flex; align-items:center; gap:6px; padding:7px 12px; border-radius:7px; font-size:12px; font-family:'IBM Plex Sans',sans-serif; cursor:pointer; transition:all 0.15s; border:0.5px solid; }
        .sp-refresh { display:flex; align-items:center; gap:5px; margin-left:auto; background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.09); border-radius:7px; padding:7px 12px; font-size:12px; font-family:'IBM Plex Sans',sans-serif; color:rgba(255,255,255,0.45); cursor:pointer; transition:all 0.15s; }
        .sp-refresh:hover { background:rgba(255,255,255,0.08); color:rgba(255,255,255,0.7); }
        .sp-refresh svg { width:12px; height:12px; display:block; }
        .sp-btn-reset { background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.09); border-radius:7px; padding:7px 10px; font-size:11px; font-family:'IBM Plex Sans',sans-serif; color:rgba(255,255,255,0.4); cursor:pointer; }
        .sp-btn-reset:hover { color:rgba(255,255,255,0.7); background:rgba(255,255,255,0.08); }

        /* Table */
        .sp-wrap { background:rgba(10,7,18,0.7); border:0.5px solid rgba(251,146,60,0.12); border-radius:10px; overflow:hidden; }
        .sp-table { width:100%; border-collapse:collapse; }
        .sp-table thead th { padding:8px 10px; font-size:9px; font-weight:500; letter-spacing:0.1em; text-transform:uppercase; color:rgba(251,146,60,0.55); background:rgba(251,146,60,0.05); border-bottom:0.5px solid rgba(255,255,255,0.06); text-align:left; white-space:nowrap; }
        .sp-table thead th.r { text-align:right; }
        .sp-table tbody td { padding:9px 10px; border-bottom:0.5px solid rgba(255,255,255,0.04); vertical-align:middle; }
        .sp-table tbody tr:last-child td { border-bottom:none; }
        .sp-empty, .sp-loading { text-align:center; padding:52px 24px; color:rgba(255,255,255,0.25); font-size:13px; display:flex; flex-direction:column; align-items:center; gap:10px; }
        .sp-spinner { width:18px; height:18px; border-radius:50%; border:2px solid rgba(251,146,60,0.2); border-top-color:#fb923c; animation:sp-spin 0.7s linear infinite; }
        @keyframes sp-spin { to { transform:rotate(360deg); } }
        .sp-footer { font-size:11px; color:rgba(255,255,255,0.22); padding:8px 12px; border-top:0.5px solid rgba(255,255,255,0.04); display:flex; justify-content:space-between; }
        .sp-error { background:rgba(239,68,68,0.08); border:0.5px solid rgba(239,68,68,0.2); border-radius:8px; padding:10px 14px; margin-bottom:14px; font-size:13px; color:#fca5a5; }

        /* Legend */
        .sp-legend { display:flex; gap:16px; margin-bottom:14px; font-size:11px; flex-wrap:wrap; align-items:center; }
        select.sp-sel option { background:#0e0b1a; color:#f1ede8; }
      `}</style>

      <div className="sp-page">

        {/* Summary cards */}
        {summary && (
          <div className="sp-summary">
            {[
              { label: 'Critical',          value: summary.critical,         color: '#f87171', border: 'rgba(248,113,113,0.2)', filter: 'critical' },
              { label: 'Warning',           value: summary.warning,          color: '#fbbf24', border: 'rgba(251,191,36,0.2)',  filter: 'warning'  },
              { label: 'Double Order Risk', value: summary.doubleOrderRisk,  color: '#fb923c', border: 'rgba(251,146,60,0.2)',  filter: ''          },
              { label: 'Overstock',         value: summary.overstock,        color: '#60a5fa', border: 'rgba(96,165,250,0.2)',  filter: 'overstock' },
              { label: 'OK',                value: summary.ok,               color: '#4ade80', border: 'rgba(74,222,128,0.2)',  filter: 'ok'        },
              { label: 'Total Items',       value: summary.total,            color: '#f1ede8', border: 'rgba(255,255,255,0.1)', filter: ''          },
              { label: 'Stock Value',       value: fmtAmt(summary.totalStockValue), color: '#a78bfa', border: 'rgba(167,139,250,0.2)', filter: '', isAmt: true },
            ].map(c => (
              <div key={c.label} className="sp-sum"
                style={{ border: `0.5px solid ${alertFilter === c.filter && c.filter ? c.border : 'rgba(255,255,255,0.08)'}`, background: alertFilter === c.filter && c.filter ? `${c.color}08` : 'rgba(10,7,18,0.7)' }}
                onClick={() => c.filter && setAlertFilter(prev => prev === c.filter ? '' : c.filter)}
              >
                <div className="sp-sum-label" style={{ color: c.color }}>{c.label}</div>
                <div className="sp-sum-value" style={{ color: c.color, fontSize: c.isAmt ? 14 : 22 }}>{c.value}</div>
              </div>
            ))}
          </div>
        )}

        {error && <div className="sp-error">{error}</div>}

        {/* Legend */}
        <div className="sp-legend">
          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase' }}>Alert Legend:</span>
          {Object.entries(ALERT_CONFIG).map(([k, v]) => (
            <span key={k} style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              <span style={{ color: v.color, fontWeight: 600 }}>{v.icon}</span>
              <span style={{ color: 'rgba(255,255,255,0.5)' }}>{v.label}</span>
            </span>
          ))}
          <span style={{ marginLeft: 'auto', fontSize: 10, color: 'rgba(251,191,36,0.7)', background: 'rgba(251,191,36,0.08)', padding: '2px 8px', borderRadius: 8, border: '0.5px solid rgba(251,191,36,0.2)' }}>
            ⚠ 2× risk = reorder point breached but PO already placed
          </span>
        </div>

        {/* Toolbar */}
        <div className="sp-toolbar">
          <input className="sp-search" placeholder="Search item code or name…" value={search} onChange={e => setSearch(e.target.value)} />

          <select className="sp-sel" style={SEL} value={alertFilter} onChange={e => setAlertFilter(e.target.value)}>
            <option value="">All Alerts</option>
            <option value="critical">⚠ Critical</option>
            <option value="warning">△ Warning</option>
            <option value="overstock">▲ Overstock</option>
            <option value="ok">✓ OK</option>
          </select>

          <select className="sp-sel" style={SEL} value={warehouseF} onChange={e => setWarehouseF(e.target.value)}>
            <option value="">All Warehouses</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
          </select>

          <select className="sp-sel" style={SEL} value={itemTypeF} onChange={e => setItemTypeF(e.target.value)}>
            <option value="">All Categories</option>
            {['finished_good','raw_material','consumable'].map(t => (
              <option key={t} value={t}>{t.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</option>
            ))}
          </select>

          <div className="sp-toggle"
            style={{ color: alertOnly ? '#f87171' : 'rgba(255,255,255,0.4)', background: alertOnly ? 'rgba(248,113,113,0.1)' : 'rgba(255,255,255,0.04)', borderColor: alertOnly ? 'rgba(248,113,113,0.3)' : 'rgba(255,255,255,0.09)' }}
            onClick={() => setAlertOnly(v => !v)}
          >
            <span style={{ fontSize: 11 }}>⚠</span> Alerts only
          </div>

          {hasFilters && (
            <button className="sp-btn-reset" onClick={() => { setSearch(''); setAlertFilter(''); setWarehouseF(''); setItemTypeF(''); }}>
              ↺ Clear
            </button>
          )}

          <button className="sp-refresh" onClick={fetchData}>
            <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <path d="M10 2A5 5 0 1 0 11 6"/>
              <polyline points="8.5,0.5 11,2 9.5,4.5"/>
            </svg>
            Refresh
          </button>
        </div>

        {/* Table */}
        <div className="sp-wrap">
          {loading ? (
            <div className="sp-loading"><div className="sp-spinner" />Loading stock planning…</div>
          ) : filtered.length === 0 ? (
            <div className="sp-empty">{hasFilters || alertOnly ? 'No items match your filters.' : 'No stock data yet.'}</div>
          ) : (
            <>
              <table className="sp-table">
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>Alert</th>
                    <th>Item</th>
                    <th>Category</th>
                    <th className="r">On Hand</th>
                    <th className="r">PO Supply</th>
                    <th className="r">SO Demand</th>
                    <th className="r" title="Available to Promise = Available + PO Supply − SO Demand">ATP ↗</th>
                    <th className="r">Coverage</th>
                    <th>ROP / SS</th>
                    <th className="r">Suggested PO</th>
                    <th className="r">Stock Value</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(row => (
                    <PlanningRow key={`${row.itemId}-${row.warehouseId}`} row={row} />
                  ))}
                </tbody>
              </table>
              <div className="sp-footer">
                <span>{filtered.length} of {rows.length} items</span>
                <span style={{ ...MONO, fontSize: 10, color: 'rgba(167,139,250,0.5)' }}>
                  Total visible value: {fmtAmt(filtered.reduce((s, r) => s + r.stockValue, 0))}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </ERPShell>
  );
}