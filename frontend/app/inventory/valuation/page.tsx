"use client";

import { useEffect, useState, useCallback } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import apiClient from '@/lib/api/client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ValuationRow {
  itemId: string; itemCode: string; itemName: string; itemType: string;
  warehouseId: string; warehouseCode: string; warehouseName: string;
  onHandQuantity: number; unitCost: number; totalValue: number; uom: string;
}

interface ValuationData {
  asOf: string;
  rows: ValuationRow[];
  totalInventoryValue: number;
  totalItems: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtAmt(v: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v);
}
function fmtQty(v: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(v);
}
function fmtDate(d: string) {
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const MONO: React.CSSProperties = { fontFamily: "'IBM Plex Mono',monospace", fontSize: 12 };

const ITEM_TYPE_STYLE: Record<string, { color: string; bg: string; border: string }> = {
  finished_good:  { color: '#4ade80', bg: 'rgba(74,222,128,0.1)',   border: 'rgba(74,222,128,0.2)' },
  raw_material:   { color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',   border: 'rgba(96,165,250,0.2)' },
  consumable:     { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',   border: 'rgba(251,191,36,0.2)' },
  service:        { color: 'rgba(255,255,255,0.4)', bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.1)' },
};

function TypeBadge({ type }: { type: string }) {
  const s = ITEM_TYPE_STYLE[type] ?? ITEM_TYPE_STYLE.service;
  const label = type.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  return (
    <span style={{ display:'inline-flex', alignItems:'center', padding:'2px 8px', borderRadius:20, fontSize:10, fontWeight:500, color:s.color, background:s.bg, border:`0.5px solid ${s.border}`, whiteSpace:'nowrap' }}>
      {label}
    </span>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function InventoryValuationPage() {
  const [data,        setData]        = useState<ValuationData | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [search,      setSearch]      = useState('');
  const [typeFilter,  setTypeFilter]  = useState('');
  const [sortBy,      setSortBy]      = useState<'value' | 'qty' | 'code'>('value');
  const [sortDir,     setSortDir]     = useState<'desc' | 'asc'>('desc');

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string> = {};
      if (typeFilter) params.itemType = typeFilter;
      const res = await apiClient.get('/stock-transactions/valuation', { params });
      setData(res.data as ValuationData);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load valuation data.');
    } finally { setLoading(false); }
  }, [typeFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSort = (col: 'value' | 'qty' | 'code') => {
    if (sortBy === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortBy(col); setSortDir('desc'); }
  };

  const filtered = (data?.rows ?? []).filter(row => {
    const q = search.toLowerCase();
    return !q || row.itemCode.toLowerCase().includes(q) || row.itemName.toLowerCase().includes(q) || row.warehouseCode.toLowerCase().includes(q);
  }).sort((a, b) => {
    let diff = 0;
    if (sortBy === 'value') diff = a.totalValue - b.totalValue;
    if (sortBy === 'qty')   diff = a.onHandQuantity - b.onHandQuantity;
    if (sortBy === 'code')  diff = a.itemCode.localeCompare(b.itemCode);
    return sortDir === 'asc' ? diff : -diff;
  });

  // Group by type for summary
  const byType = filtered.reduce((acc, row) => {
    if (!acc[row.itemType]) acc[row.itemType] = { count: 0, value: 0 };
    acc[row.itemType].count++;
    acc[row.itemType].value += row.totalValue;
    return acc;
  }, {} as Record<string, { count: number; value: number }>);

  const SortIcon = ({ col }: { col: 'value' | 'qty' | 'code' }) => (
    <span style={{ fontSize:9, marginLeft:4, color: sortBy === col ? '#a78bfa' : 'rgba(255,255,255,0.2)' }}>
      {sortBy === col ? (sortDir === 'asc' ? '▲' : '▼') : '⇅'}
    </span>
  );

  return (
    <ERPShell breadcrumbs={['Home', 'Inventory', 'Valuation']} title="Inventory Valuation">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap');
        .iv-page { padding: 0 18px 24px; }
        .iv-summary { display:grid; grid-template-columns:repeat(4,1fr); gap:8px; margin-bottom:16px; }
        .iv-sum-card { background:rgba(10,7,18,0.7); border:0.5px solid rgba(96,165,250,0.12); border-radius:9px; padding:10px 14px; }
        .iv-sum-label { font-size:10px; font-weight:500; letter-spacing:0.08em; text-transform:uppercase; color:rgba(96,165,250,0.5); margin-bottom:4px; }
        .iv-sum-value { font-size:20px; font-weight:500; font-family:'IBM Plex Mono',monospace; }
        .iv-by-type { display:flex; gap:8px; margin-bottom:16px; flex-wrap:wrap; }
        .iv-type-card { background:rgba(10,7,18,0.7); border-radius:8px; padding:8px 12px; display:flex; flex-direction:column; gap:2px; min-width:140px; }
        .iv-type-label { font-size:10px; font-weight:500; letter-spacing:0.08em; text-transform:uppercase; }
        .iv-type-value { font-size:16px; font-weight:500; font-family:'IBM Plex Mono',monospace; color:#f1ede8; }
        .iv-type-count { font-size:10px; color:rgba(255,255,255,0.3); }
        .iv-toolbar { display:flex; align-items:center; gap:10px; margin-bottom:14px; flex-wrap:wrap; }
        .iv-search { background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.09); border-radius:7px; padding:7px 12px; font-size:12px; font-family:'IBM Plex Sans',sans-serif; color:#e2dfd8; outline:none; width:240px; }
        .iv-search::placeholder { color:rgba(255,255,255,0.2); }
        .iv-search:focus { border-color:rgba(96,165,250,0.4); }
        .iv-filter { background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.09); border-radius:7px; padding:7px 12px; font-size:12px; font-family:'IBM Plex Sans',sans-serif; color:#e2dfd8; outline:none; }
        .iv-filter option { background:#0e0b1a; }
        .iv-refresh { display:flex; align-items:center; gap:6px; margin-left:auto; background:rgba(96,165,250,0.1); border:0.5px solid rgba(96,165,250,0.25); border-radius:7px; padding:7px 14px; font-size:12px; font-weight:500; font-family:'IBM Plex Sans',sans-serif; color:#60a5fa; cursor:pointer; transition:opacity 0.15s; flex-shrink:0; }
        .iv-refresh:hover { opacity:0.8; }
        .iv-wrap { background:rgba(10,7,18,0.7); border:0.5px solid rgba(96,165,250,0.12); border-radius:10px; overflow:hidden; }
        .iv-table { width:100%; border-collapse:collapse; }
        .iv-table thead th { padding:9px 14px; font-size:10px; font-weight:500; letter-spacing:0.1em; text-transform:uppercase; color:rgba(96,165,250,0.55); background:rgba(96,165,250,0.05); border-bottom:0.5px solid rgba(255,255,255,0.06); text-align:left; white-space:nowrap; }
        .iv-table thead th.sortable { cursor:pointer; user-select:none; }
        .iv-table thead th.sortable:hover { color:rgba(96,165,250,0.85); }
        .iv-table tbody td { padding:10px 14px; border-bottom:0.5px solid rgba(255,255,255,0.04); vertical-align:middle; font-size:13px; }
        .iv-table tbody tr:last-child td { border-bottom:none; }
        .iv-table tbody tr:hover td { background:rgba(96,165,250,0.02); }
        .iv-empty, .iv-loading { text-align:center; padding:52px 24px; color:rgba(255,255,255,0.25); font-size:13px; display:flex; flex-direction:column; align-items:center; gap:10px; }
        .iv-spinner { width:18px; height:18px; border-radius:50%; border:2px solid rgba(96,165,250,0.2); border-top-color:#60a5fa; animation:iv-spin 0.7s linear infinite; }
        @keyframes iv-spin { to { transform:rotate(360deg); } }
        .iv-footer { font-size:11px; color:rgba(255,255,255,0.22); padding:8px 14px; border-top:0.5px solid rgba(255,255,255,0.04); display:flex; justify-content:space-between; align-items:center; }
        .iv-error { background:rgba(239,68,68,0.08); border:0.5px solid rgba(239,68,68,0.2); border-radius:8px; padding:10px 14px; margin-bottom:14px; font-size:13px; color:#fca5a5; }
        .iv-bar-wrap { width:100%; height:4px; background:rgba(255,255,255,0.06); border-radius:2px; overflow:hidden; }
        .iv-bar { height:100%; border-radius:2px; }
      `}</style>

      <div className="iv-page">

        {/* Summary cards */}
        {data && (
          <div className="iv-summary">
            <div className="iv-sum-card">
              <div className="iv-sum-label">Total Value</div>
              <div className="iv-sum-value" style={{ color:'#60a5fa' }}>{fmtAmt(data.totalInventoryValue)}</div>
            </div>
            <div className="iv-sum-card">
              <div className="iv-sum-label">Items Tracked</div>
              <div className="iv-sum-value" style={{ color:'#f1ede8' }}>{data.totalItems}</div>
            </div>
            <div className="iv-sum-card">
              <div className="iv-sum-label">Avg Value / Item</div>
              <div className="iv-sum-value" style={{ color:'#a78bfa' }}>
                {data.totalItems > 0 ? fmtAmt(data.totalInventoryValue / data.totalItems) : '—'}
              </div>
            </div>
            <div className="iv-sum-card">
              <div className="iv-sum-label">As Of</div>
              <div style={{ fontSize:13, fontFamily:"'IBM Plex Mono',monospace", color:'rgba(255,255,255,0.5)', marginTop:4 }}>{fmtDate(data.asOf)}</div>
            </div>
          </div>
        )}

        {/* By type breakdown */}
        {Object.keys(byType).length > 0 && (
          <div className="iv-by-type">
            {Object.entries(byType).sort((a, b) => b[1].value - a[1].value).map(([type, info]) => {
              const s = ITEM_TYPE_STYLE[type] ?? ITEM_TYPE_STYLE.service;
              const pct = data ? (info.value / data.totalInventoryValue * 100).toFixed(1) : '0';
              return (
                <div key={type} className="iv-type-card" style={{ border:`0.5px solid ${s.border}`, cursor:'pointer' }}
                  onClick={() => setTypeFilter(prev => prev === type ? '' : type)}>
                  <span className="iv-type-label" style={{ color: s.color }}>{type.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</span>
                  <span className="iv-type-value">{fmtAmt(info.value)}</span>
                  <span className="iv-type-count">{info.count} item{info.count !== 1 ? 's' : ''} · {pct}% of total</span>
                  <div className="iv-bar-wrap" style={{ marginTop:4 }}>
                    <div className="iv-bar" style={{ width:`${pct}%`, background: s.color, opacity:0.6 }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="iv-toolbar">
          <input className="iv-search" placeholder="Search by item code, name, warehouse…" value={search} onChange={e => setSearch(e.target.value)} />
          <select className="iv-filter" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="">All Types</option>
            {['finished_good','raw_material','consumable','service'].map(t => (
              <option key={t} value={t}>{t.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</option>
            ))}
          </select>
          <button className="iv-refresh" onClick={fetchData}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ display:'block' }}>
              <path d="M11 2.5A5 5 0 1 0 12 7"/>
              <polyline points="9,1 12,2.5 10.5,5.5"/>
            </svg>
            Refresh
          </button>
        </div>

        {error && <div className="iv-error">{error}</div>}

        <div className="iv-wrap">
          {loading ? (
            <div className="iv-loading"><div className="iv-spinner" />Loading inventory valuation…</div>
          ) : filtered.length === 0 ? (
            <div className="iv-empty">
              {search || typeFilter
                ? 'No items match your filters.'
                : 'No inventory data yet. Post AP invoices to receive stock.'}
            </div>
          ) : (
            <>
              <table className="iv-table">
                <thead>
                  <tr>
                    <th className="sortable" onClick={() => handleSort('code')}>Item Code <SortIcon col="code" /></th>
                    <th>Item Name</th>
                    <th>Type</th>
                    <th>Warehouse</th>
                    <th className="sortable" style={{ textAlign:'right', cursor:'pointer' }} onClick={() => handleSort('qty')}>
                      On Hand <SortIcon col="qty" />
                    </th>
                    <th>UOM</th>
                    <th style={{ textAlign:'right' }}>WAC Unit Cost</th>
                    <th className="sortable" style={{ textAlign:'right', cursor:'pointer' }} onClick={() => handleSort('value')}>
                      Total Value <SortIcon col="value" />
                    </th>
                    <th style={{ width:120 }}>Share</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row, i) => {
                    const sharePct = data && data.totalInventoryValue > 0
                      ? (row.totalValue / data.totalInventoryValue * 100)
                      : 0;
                    const s = ITEM_TYPE_STYLE[row.itemType] ?? ITEM_TYPE_STYLE.service;
                    return (
                      <tr key={`${row.itemId}-${row.warehouseId}-${i}`}>
                        <td><span style={{ ...MONO, color:'#60a5fa', fontWeight:500 }}>{row.itemCode}</span></td>
                        <td><span style={{ color:'#e2dfd8' }}>{row.itemName}</span></td>
                        <td><TypeBadge type={row.itemType} /></td>
                        <td>
                          <span style={{ fontSize:12, color:'rgba(255,255,255,0.5)' }}>{row.warehouseCode}</span>
                          <span style={{ fontSize:11, color:'rgba(255,255,255,0.25)', marginLeft:6 }}>{row.warehouseName}</span>
                        </td>
                        <td style={{ textAlign:'right' }}>
                          <span style={{ ...MONO, color: row.onHandQuantity > 0 ? '#e2dfd8' : '#f87171' }}>
                            {fmtQty(row.onHandQuantity)}
                          </span>
                        </td>
                        <td><span style={{ fontSize:11, color:'rgba(255,255,255,0.4)' }}>{row.uom}</span></td>
                        <td style={{ textAlign:'right' }}>
                          <span style={{ ...MONO, color:'rgba(255,255,255,0.6)' }}>
                            {row.unitCost > 0 ? fmtAmt(row.unitCost) : '—'}
                          </span>
                        </td>
                        <td style={{ textAlign:'right' }}>
                          <span style={{ ...MONO, color:'#60a5fa', fontWeight:500, fontSize:13 }}>
                            {fmtAmt(row.totalValue)}
                          </span>
                        </td>
                        <td>
                          <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                            <div className="iv-bar-wrap" style={{ flex:1 }}>
                              <div className="iv-bar" style={{ width:`${Math.min(sharePct,100)}%`, background:s.color }} />
                            </div>
                            <span style={{ fontSize:10, color:'rgba(255,255,255,0.3)', fontFamily:"'IBM Plex Mono',monospace", minWidth:32, textAlign:'right' }}>
                              {sharePct.toFixed(1)}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="iv-footer">
                <span>{filtered.length} of {data?.totalItems ?? 0} items</span>
                <span style={{ color:'rgba(96,165,250,0.6)', fontFamily:"'IBM Plex Mono',monospace" }}>
                  Filtered Total: {fmtAmt(filtered.reduce((s, r) => s + r.totalValue, 0))}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </ERPShell>
  );
}