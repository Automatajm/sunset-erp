"use client";

import { useEffect, useState, useCallback } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import { stockTransactionsApi } from '@/lib/api/stock-transactions';
import { warehousesApi } from '@/lib/api/warehouses';
import { StockBalance, Warehouse } from '@/lib/api/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONO: React.CSSProperties = { fontFamily: "'IBM Plex Mono', monospace" };

function fmtQty(v: number, decimals = 3) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: decimals, minimumFractionDigits: 0 }).format(v);
}
function fmtAmt(v: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(v);
}

const ITEM_TYPE_CFG: Record<string, { color: string; label: string }> = {
  finished_good: { color: 'var(--success, #4ade80)', label: 'Finished Good' },
  raw_material:  { color: 'var(--accent-blue, #60a5fa)', label: 'Raw Material'  },
  consumable:    { color: 'var(--warning, #fbbf24)', label: 'Consumable'    },
  service:       { color: 'var(--accent-violet, #a78bfa)', label: 'Service'       },
};

type UomView = 'purchase' | 'storage' | 'consumption';

const UOM_VIEWS: { value: UomView; label: string; icon: string; desc: string }[] = [
  { value: 'purchase',    label: 'Purchase UOM',    icon: '💰', desc: 'Financial unit of record — WAC, valuation, JE amounts' },
  { value: 'storage',     label: 'Storage UOM',     icon: '🏭', desc: 'Warehouse operational unit — physical counting' },
  { value: 'consumption', label: 'Consumption UOM', icon: '⚙️', desc: 'Production unit — BOM quantities, MRP' },
];

// ─── UOM Tab Switcher ─────────────────────────────────────────────────────────

function UomToggle({ active, onChange }: { active: UomView; onChange: (v: UomView) => void }) {
  return (
    <div style={{ display: 'flex', gap: 0, background: 'var(--l03, rgba(255,255,255,0.03))', border: '0.5px solid var(--l08, rgba(255,255,255,0.08))', borderRadius: 8, overflow: 'hidden', flexShrink: 0 }}>
      {UOM_VIEWS.map((v, i) => (
        <button key={v.value} type="button" onClick={() => onChange(v.value)}
          title={v.desc}
          style={{
            padding: '6px 14px', fontSize: 11, fontWeight: 500,
            fontFamily: "'IBM Plex Sans', sans-serif",
            cursor: 'pointer', border: 'none',
            borderLeft: i > 0 ? '0.5px solid var(--l08, rgba(255,255,255,0.08))' : 'none',
            background: active === v.value ? 'rgba(251,146,60,0.15)' : 'transparent',
            color: active === v.value ? 'var(--accent-strong, #fb923c)' : 'var(--w35, rgba(255,255,255,0.35))',
            transition: 'all 0.15s', whiteSpace: 'nowrap',
          }}>
          {v.icon} {v.label}
        </button>
      ))}
    </div>
  );
}

// ─── Stock Detail Drawer ──────────────────────────────────────────────────────

function StockDrawer({ row, onClose }: { row: StockBalance | null; onClose: () => void }) {
  if (!row) return null;
  const itCfg = ITEM_TYPE_CFG[row.item?.itemType ?? ''] ?? { color: 'var(--w35, rgba(255,255,255,0.35))', label: row.item?.itemType ?? '' };

  const sections = [
    {
      title: '💰 Purchase UOM — Financial',
      subtitle: 'Unit of record for WAC, valuation, JE amounts',
      color: 'var(--accent-strong, #fb923c)',
      rows: [
        { label: 'Purchase Qty',   value: `${fmtQty(row.purchaseQty)} ${row.purchaseUom}`, mono: true },
        { label: 'Unit Cost (WAC)',  value: fmtAmt(row.unitCost),                           mono: true },
        { label: 'Total Value',     value: fmtAmt(row.totalValue),                          mono: true, highlight: true },
      ],
    },
    {
      title: '🏭 Storage UOM — Warehouse',
      subtitle: 'Physical counting, bin management',
      color: 'var(--accent-blue, #60a5fa)',
      rows: [
        { label: 'On Hand',          value: `${fmtQty(row.storageQty)} ${row.storageUom}`,          mono: true },
        { label: 'Reserved',         value: `${fmtQty(row.reservedQuantity)} ${row.storageUom}`,    mono: true },
        { label: 'Available',        value: `${fmtQty(row.availableQty)} ${row.storageUom}`,         mono: true, highlight: true },
        { label: 'Unit Cost Storage', value: fmtAmt(row.unitCostStorage),                           mono: true },
      ],
    },
    {
      title: '⚙️ Consumption UOM — Production',
      subtitle: 'BOM quantities, MRP explosion',
      color: 'var(--success, #4ade80)',
      rows: [
        { label: 'Consumption Qty',     value: `${fmtQty(row.consumptionQty)} ${row.consumptionUom}`,   mono: true },
        { label: 'Unit Cost Consumption', value: fmtAmt(row.unitCostConsumption),                        mono: true },
      ],
    },
  ];

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex' }}
      onClick={onClose}>
      <div style={{ flex: 1, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(3px)' }} />
      <div style={{ width: 380, background: 'var(--surface, #0e0b1a)', borderLeft: '0.5px solid rgba(251,146,60,0.2)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding: '18px 20px 14px', borderBottom: '0.5px solid var(--l06, rgba(255,255,255,0.06))', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ ...MONO, fontSize: 15, fontWeight: 500, color: 'var(--accent-strong, #fb923c)' }}>{row.item?.code}</div>
              <div style={{ fontSize: 12, color: 'var(--w50, rgba(255,255,255,0.5))', marginTop: 3 }}>{row.item?.name}</div>
            </div>
            <button onClick={onClose} style={{ width: 26, height: 26, borderRadius: 6, background: 'var(--l06, rgba(255,255,255,0.06))', border: 'none', cursor: 'pointer', color: 'var(--w40, rgba(255,255,255,0.4))', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
          </div>
          <div style={{ display: 'flex', gap: 6, marginTop: 10, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 10, color: itCfg.color, background: `color-mix(in srgb, ${itCfg.color} 8%, transparent)`, border: `0.5px solid color-mix(in srgb, ${itCfg.color} 19%, transparent)` }}>
              {itCfg.label}
            </span>
            <span style={{ fontSize: 9, padding: '2px 8px', borderRadius: 10, color: 'var(--w35, rgba(255,255,255,0.35))', background: 'var(--l05, rgba(255,255,255,0.05))', border: '0.5px solid var(--w10, rgba(255,255,255,0.1))' }}>
              {row.warehouse?.code} — {row.warehouse?.name}
            </span>
          </div>
        </div>

        {/* UOM Sections */}
        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {sections.map(sec => (
            <div key={sec.title} style={{ background: 'var(--l02, rgba(255,255,255,0.02))', border: `0.5px solid color-mix(in srgb, ${sec.color} 13%, transparent)`, borderRadius: 10, overflow: 'hidden' }}>
              <div style={{ padding: '10px 14px 8px', borderBottom: `0.5px solid color-mix(in srgb, ${sec.color} 8%, transparent)` }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: sec.color }}>{sec.title}</div>
                <div style={{ fontSize: 10, color: 'var(--w30, rgba(255,255,255,0.3))', marginTop: 2 }}>{sec.subtitle}</div>
              </div>
              <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 7 }}>
                {sec.rows.map(r => (
                  <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: 'var(--w40, rgba(255,255,255,0.4))' }}>{r.label}</span>
                    <span style={{ ...MONO, fontSize: 12, fontWeight: r.highlight ? 600 : 400, color: r.highlight ? sec.color : 'var(--text-strong, #f1ede8)' }}>{r.value}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Lot/Serial */}
          {(row.lotNumber || row.serialNumber) && (
            <div style={{ background: 'var(--l02, rgba(255,255,255,0.02))', border: '0.5px solid var(--l08, rgba(255,255,255,0.08))', borderRadius: 10, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div style={{ fontSize: 10, fontWeight: 500, color: 'var(--w30, rgba(255,255,255,0.3))', letterSpacing: '0.08em', textTransform: 'uppercase' }}>Tracking</div>
              {row.lotNumber    && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 11, color: 'var(--w40, rgba(255,255,255,0.4))' }}>Lot</span><span style={{ ...MONO, fontSize: 12, color: 'var(--warning, #fbbf24)' }}>{row.lotNumber}</span></div>}
              {row.serialNumber && <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 11, color: 'var(--w40, rgba(255,255,255,0.4))' }}>Serial</span><span style={{ ...MONO, fontSize: 12, color: 'var(--warning, #fbbf24)' }}>{row.serialNumber}</span></div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StockBalancePage() {
  const [rows,      setRows]      = useState<StockBalance[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [search,    setSearch]    = useState('');
  const [whFilter,  setWhFilter]  = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [uomView,   setUomView]   = useState<UomView>('purchase');
  const [selected,  setSelected]  = useState<StockBalance | null>(null);
  const [zeroStock, setZeroStock] = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [balance, whs] = await Promise.all([
        stockTransactionsApi.getBalance(),
        warehousesApi.getAll(),
      ]);
      setRows(balance as StockBalance[]);
      setWarehouses(whs as Warehouse[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load stock balance.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Filtering ──────────────────────────────────────────────────────────────
  const filtered = rows.filter(r => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      (r.item?.code ?? '').toLowerCase().includes(q) ||
      (r.item?.name ?? '').toLowerCase().includes(q) ||
      (r.warehouse?.code ?? '').toLowerCase().includes(q) ||
      (r.warehouse?.name ?? '').toLowerCase().includes(q) ||
      (r.lotNumber ?? '').toLowerCase().includes(q);
    const matchWH   = !whFilter   || r.warehouseId === whFilter;
    const matchType = !typeFilter || r.item?.itemType === typeFilter;
    const matchZero = zeroStock   || r.storageQty > 0;
    return matchSearch && matchWH && matchType && matchZero;
  });

  // ── Summary stats ──────────────────────────────────────────────────────────
  const totalValue    = filtered.reduce((s, r) => s + r.totalValue, 0);
  const totalItems    = new Set(filtered.map(r => r.itemId)).size;
  const totalWH       = new Set(filtered.map(r => r.warehouseId)).size;
  const zeroCount     = rows.filter(r => r.storageQty === 0).length;
  const lowStockCount = filtered.filter(r => r.availableQty > 0 && r.availableQty < 10).length;

  const hasFilters = !!(search || whFilter || typeFilter || zeroStock);
  const SEL: React.CSSProperties = {
    background: 'var(--l04, rgba(255,255,255,0.04))', border: '0.5px solid var(--l09, rgba(255,255,255,0.09))',
    borderRadius: 7, padding: '7px 10px', fontSize: 12,
    fontFamily: "'IBM Plex Sans', sans-serif", color: 'var(--text-primary, #e2dfd8)',
    outline: 'none', cursor: 'pointer',
  };

  // ── UOM view helpers ───────────────────────────────────────────────────────
  function getQty(r: StockBalance) {
    if (uomView === 'purchase')    return { qty: r.purchaseQty,    uom: r.purchaseUom,    cost: r.unitCost,            avail: null };
    if (uomView === 'storage')     return { qty: r.storageQty,     uom: r.storageUom,     cost: r.unitCostStorage,     avail: r.availableQty };
    return                                { qty: r.consumptionQty, uom: r.consumptionUom, cost: r.unitCostConsumption, avail: null };
  }

  return (
    <ERPShell breadcrumbs={['Home', 'Inventory', 'Stock Balance']} title="Stock Balance">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&display=swap');
        .sb-page{padding:0 18px 12px;display:flex;flex-direction:column;height:100%;overflow:hidden}
        .sb-kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:6px;margin-bottom:10px;flex-shrink:0}
        .sb-kpi{background:rgba(10,7,18,0.7);border-radius:9px;padding:10px 14px;display:flex;flex-direction:column;gap:3px}
        .sb-kpi-label{font-size:9px;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;color:var(--w30, rgba(255,255,255,0.3))}
        .sb-kpi-value{font-size:18px;font-weight:500;font-family:'IBM Plex Mono',monospace}
        .sb-toolbar{display:flex;align-items:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;flex-shrink:0}
        .sb-search{background:var(--l04, rgba(255,255,255,0.04));border:0.5px solid var(--l09, rgba(255,255,255,0.09));border-radius:7px;padding:7px 12px;font-size:12px;font-family:'IBM Plex Sans',sans-serif;color:var(--text-primary, #e2dfd8);outline:none;width:220px}
        .sb-search::placeholder{color:var(--w20, rgba(255,255,255,0.2))}
        .sb-search:focus{border-color:rgba(251,146,60,0.4)}
        .sb-wrap{background:rgba(10,7,18,0.7);border:0.5px solid rgba(251,146,60,0.12);border-radius:10px;overflow:hidden;flex:1;min-height:0;display:flex;flex-direction:column}
        .sb-scroll{flex:1;overflow-y:auto;min-height:0}
        .sb-table{width:100%;border-collapse:collapse}
        .sb-table thead th{padding:8px 12px;font-size:9px;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;color:rgba(251,146,60,0.55);background:rgba(251,146,60,0.05);border-bottom:0.5px solid var(--l06, rgba(255,255,255,0.06));text-align:left;white-space:nowrap;position:sticky;top:0;z-index:2}
        .sb-table thead th.r{text-align:right}
        .sb-table thead th.purchase{color:rgba(251,146,60,0.7)}
        .sb-table thead th.storage{color:rgba(96,165,250,0.7)}
        .sb-table thead th.consumption{color:rgba(74,222,128,0.7)}
        .sb-table tbody td{padding:10px 12px;border-bottom:0.5px solid var(--l03, rgba(255,255,255,0.03));vertical-align:middle}
        .sb-table tbody tr:last-child td{border-bottom:none}
        .sb-table tbody tr{cursor:pointer;transition:background 0.1s}
        .sb-table tbody tr:hover td{background:rgba(251,146,60,0.03)}
        .sb-empty,.sb-loading{text-align:center;padding:52px 24px;color:var(--w25, rgba(255,255,255,0.25));font-size:13px;display:flex;flex-direction:column;align-items:center;gap:10px}
        .sb-spinner{width:18px;height:18px;border-radius:50%;border:2px solid rgba(251,146,60,0.2);border-top-color:var(--accent-strong, #fb923c);animation:sb-spin 0.7s linear infinite}
        @keyframes sb-spin{to{transform:rotate(360deg)}}
        .sb-footer{font-size:11px;color:var(--w22, rgba(255,255,255,0.22));padding:8px 12px;border-top:0.5px solid var(--l04, rgba(255,255,255,0.04));display:flex;justify-content:space-between;align-items:center;flex-shrink:0}
        .sb-error{background:rgba(239,68,68,0.08);border:0.5px solid rgba(239,68,68,0.2);border-radius:8px;padding:10px 14px;margin-bottom:10px;font-size:13px;color:var(--danger-subtle, #fca5a5);flex-shrink:0}
        .sb-btn-reset{background:var(--l04, rgba(255,255,255,0.04));border:0.5px solid var(--l09, rgba(255,255,255,0.09));border-radius:7px;padding:7px 10px;font-size:11px;font-family:'IBM Plex Sans',sans-serif;color:var(--w40, rgba(255,255,255,0.4));cursor:pointer}
        .sb-zero-toggle{display:flex;align-items:center;gap:6px;font-size:11px;color:var(--w35, rgba(255,255,255,0.35));font-family:'IBM Plex Sans',sans-serif;cursor:pointer;user-select:none}
        .sb-uom-badge{display:inline-flex;align-items:center;padding:1px 6px;border-radius:10px;font-size:10px;font-family:'IBM Plex Mono',monospace;white-space:nowrap}
      `}</style>

      <div className="sb-page">

        {/* KPI bar */}
        <div className="sb-kpis">
          {[
            { label: 'Total Value',   value: fmtAmt(totalValue),           color: 'var(--accent-strong, #fb923c)', border: 'rgba(251,146,60,0.2)'   },
            { label: 'Unique Items',  value: String(totalItems),            color: 'var(--accent-blue, #60a5fa)', border: 'rgba(96,165,250,0.15)'  },
            { label: 'Warehouses',    value: String(totalWH),               color: 'var(--accent-violet, #a78bfa)', border: 'rgba(167,139,250,0.15)' },
            { label: 'Low Stock',     value: String(lowStockCount),         color: lowStockCount > 0 ? 'var(--warning, #fbbf24)' : 'var(--w30, rgba(255,255,255,0.3))', border: lowStockCount > 0 ? 'rgba(251,191,36,0.2)' : 'var(--l06, rgba(255,255,255,0.06))' },
            { label: 'Zero Stock',    value: String(zeroCount),             color: zeroCount  > 0 ? 'var(--danger, #f87171)' : 'var(--w30, rgba(255,255,255,0.3))',   border: zeroCount  > 0 ? 'rgba(248,113,113,0.2)' : 'var(--l06, rgba(255,255,255,0.06))' },
          ].map(k => (
            <div key={k.label} className="sb-kpi" style={{ border: `0.5px solid ${k.border}` }}>
              <div className="sb-kpi-label">{k.label}</div>
              <div className="sb-kpi-value" style={{ color: k.color }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div className="sb-toolbar">
          <input className="sb-search" placeholder="Search item, warehouse, lot…" value={search} onChange={e => setSearch(e.target.value)} />
          <select style={SEL} value={whFilter} onChange={e => setWhFilter(e.target.value)}>
            <option value="">All Warehouses</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
          </select>
          <select style={SEL} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="">All Types</option>
            {Object.entries(ITEM_TYPE_CFG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
          </select>
          <label className="sb-zero-toggle">
            <input type="checkbox" checked={zeroStock} onChange={e => setZeroStock(e.target.checked)}
              style={{ accentColor: 'var(--accent-strong, #fb923c)' }} />
            Show zero stock
          </label>
          {hasFilters && (
            <button className="sb-btn-reset" onClick={() => { setSearch(''); setWhFilter(''); setTypeFilter(''); setZeroStock(false); }}>↺ Clear</button>
          )}

          {/* UOM view switcher — right side */}
          <div style={{ marginLeft: 'auto' }}>
            <UomToggle active={uomView} onChange={setUomView} />
          </div>
        </div>

        {/* UOM view description */}
        <div style={{ marginBottom: 8, flexShrink: 0 }}>
          {UOM_VIEWS.filter(v => v.value === uomView).map(v => (
            <div key={v.value} style={{ fontSize: 11, color: 'var(--w30, rgba(255,255,255,0.3))', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: uomView === 'purchase' ? 'var(--accent-strong, #fb923c)' : uomView === 'storage' ? 'var(--accent-blue, #60a5fa)' : 'var(--success, #4ade80)' }}>
                {v.icon} {v.label}
              </span>
              <span>—</span>
              <span>{v.desc}</span>
            </div>
          ))}
        </div>

        {error && <div className="sb-error">{error}</div>}

        {/* Table */}
        <div className="sb-wrap">
          {loading ? (
            <div className="sb-loading"><div className="sb-spinner" />Loading stock balance…</div>
          ) : filtered.length === 0 ? (
            <div className="sb-empty">
              {hasFilters ? 'No items match your filters.' : 'No stock on hand.'}
            </div>
          ) : (
            <>
              <div className="sb-scroll">
                <table className="sb-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Type</th>
                      <th>Warehouse</th>

                      {/* Dynamic UOM columns */}
                      {uomView === 'purchase' && <>
                        <th className="r purchase">Purchase Qty</th>
                        <th className="purchase">Purch. UOM</th>
                        <th className="r purchase">Unit Cost (WAC)</th>
                        <th className="r purchase">Total Value</th>
                      </>}
                      {uomView === 'storage' && <>
                        <th className="r storage">On Hand</th>
                        <th className="r storage">Reserved</th>
                        <th className="r storage">Available</th>
                        <th className="storage">Storage UOM</th>
                        <th className="r storage">Cost/Storage</th>
                      </>}
                      {uomView === 'consumption' && <>
                        <th className="r consumption">Consumption Qty</th>
                        <th className="consumption">Consump. UOM</th>
                        <th className="r consumption">Cost/Consump.</th>
                        <th className="r purchase">Total Value</th>
                      </>}

                      <th>Lot</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(row => {
                      const itCfg = ITEM_TYPE_CFG[row.item?.itemType ?? ''] ?? { color: 'var(--w35, rgba(255,255,255,0.35))', label: '' };
                      const isZero = row.storageQty === 0;
                      const isLow  = row.availableQty > 0 && row.availableQty < 10;

                      return (
                        <tr key={row.id} onClick={() => setSelected(row)}
                          style={{ opacity: isZero ? 0.45 : 1 }}>

                          {/* Item */}
                          <td>
                            <div style={{ ...MONO, fontSize: 12, color: 'var(--accent-strong, #fb923c)', fontWeight: 500 }}>{row.item?.code ?? '—'}</div>
                            <div style={{ fontSize: 10, color: 'var(--w35, rgba(255,255,255,0.35))', marginTop: 2, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.item?.name}</div>
                          </td>

                          {/* Type badge */}
                          <td>
                            {row.item?.itemType && (
                              <span style={{ fontSize: 9, padding: '2px 7px', borderRadius: 10, color: itCfg.color, background: `color-mix(in srgb, ${itCfg.color} 8%, transparent)`, border: `0.5px solid color-mix(in srgb, ${itCfg.color} 19%, transparent)`, whiteSpace: 'nowrap' }}>
                                {itCfg.label}
                              </span>
                            )}
                          </td>

                          {/* Warehouse */}
                          <td>
                            <div style={{ fontSize: 11, color: 'var(--w50, rgba(255,255,255,0.5))' }}>{row.warehouse?.code}</div>
                            <div style={{ fontSize: 10, color: 'var(--w25, rgba(255,255,255,0.25))', marginTop: 1 }}>{row.warehouse?.name}</div>
                          </td>

                          {/* Purchase view */}
                          {uomView === 'purchase' && <>
                            <td style={{ textAlign: 'right' }}>
                              <span style={{ ...MONO, fontSize: 13, fontWeight: 500, color: isZero ? 'var(--w20, rgba(255,255,255,0.2))' : 'var(--accent-strong, #fb923c)' }}>
                                {fmtQty(row.purchaseQty)}
                              </span>
                            </td>
                            <td>
                              <span className="sb-uom-badge" style={{ color: 'var(--accent-strong, #fb923c)', background: 'rgba(251,146,60,0.1)', border: '0.5px solid rgba(251,146,60,0.2)' }}>
                                {row.purchaseUom}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <span style={{ ...MONO, fontSize: 12, color: 'var(--w50, rgba(255,255,255,0.5))' }}>{row.unitCost > 0 ? fmtAmt(row.unitCost) : '—'}</span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <span style={{ ...MONO, fontSize: 13, fontWeight: 600, color: isZero ? 'var(--w20, rgba(255,255,255,0.2))' : 'var(--success, #4ade80)' }}>
                                {row.totalValue > 0 ? fmtAmt(row.totalValue) : '—'}
                              </span>
                            </td>
                          </>}

                          {/* Storage view */}
                          {uomView === 'storage' && <>
                            <td style={{ textAlign: 'right' }}>
                              <span style={{ ...MONO, fontSize: 13, fontWeight: 500, color: isZero ? 'var(--w20, rgba(255,255,255,0.2))' : 'var(--accent-blue, #60a5fa)' }}>
                                {fmtQty(row.storageQty)}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <span style={{ ...MONO, fontSize: 12, color: row.reservedQuantity > 0 ? 'var(--warning, #fbbf24)' : 'var(--w30, rgba(255,255,255,0.3))' }}>
                                {fmtQty(row.reservedQuantity)}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <span style={{ ...MONO, fontSize: 13, fontWeight: 600, color: isZero ? 'var(--danger, #f87171)' : isLow ? 'var(--warning, #fbbf24)' : 'var(--success, #4ade80)' }}>
                                {fmtQty(row.availableQty)}
                              </span>
                              {isLow && !isZero && <div style={{ fontSize: 9, color: 'var(--warning, #fbbf24)', marginTop: 1 }}>⚠ low</div>}
                            </td>
                            <td>
                              <span className="sb-uom-badge" style={{ color: 'var(--accent-blue, #60a5fa)', background: 'rgba(96,165,250,0.1)', border: '0.5px solid rgba(96,165,250,0.2)' }}>
                                {row.storageUom}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <span style={{ ...MONO, fontSize: 12, color: 'var(--w50, rgba(255,255,255,0.5))' }}>{row.unitCostStorage > 0 ? fmtAmt(row.unitCostStorage) : '—'}</span>
                            </td>
                          </>}

                          {/* Consumption view */}
                          {uomView === 'consumption' && <>
                            <td style={{ textAlign: 'right' }}>
                              <span style={{ ...MONO, fontSize: 13, fontWeight: 500, color: isZero ? 'var(--w20, rgba(255,255,255,0.2))' : 'var(--success, #4ade80)' }}>
                                {fmtQty(row.consumptionQty)}
                              </span>
                            </td>
                            <td>
                              <span className="sb-uom-badge" style={{ color: 'var(--success, #4ade80)', background: 'rgba(74,222,128,0.1)', border: '0.5px solid rgba(74,222,128,0.2)' }}>
                                {row.consumptionUom}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <span style={{ ...MONO, fontSize: 12, color: 'var(--w50, rgba(255,255,255,0.5))' }}>{row.unitCostConsumption > 0 ? fmtAmt(row.unitCostConsumption) : '—'}</span>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              <span style={{ ...MONO, fontSize: 13, fontWeight: 600, color: isZero ? 'var(--w20, rgba(255,255,255,0.2))' : 'var(--success, #4ade80)' }}>
                                {row.totalValue > 0 ? fmtAmt(row.totalValue) : '—'}
                              </span>
                            </td>
                          </>}

                          {/* Lot */}
                          <td>
                            {row.lotNumber
                              ? <span style={{ ...MONO, fontSize: 10, color: 'var(--warning, #fbbf24)' }}>{row.lotNumber}</span>
                              : <span style={{ fontSize: 10, color: 'var(--w15, rgba(255,255,255,0.15))' }}>—</span>
                            }
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Footer */}
              <div className="sb-footer">
                <span>{filtered.length} of {rows.length} record{rows.length !== 1 ? 's' : ''}</span>
                <span style={{ ...MONO, color: 'var(--accent-strong, #fb923c)', fontSize: 12 }}>{fmtAmt(totalValue)} total inventory value</span>
                {hasFilters && <span style={{ fontSize: 10, color: 'rgba(251,146,60,0.4)' }}>Filtered</span>}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Detail drawer */}
      <StockDrawer row={selected} onClose={() => setSelected(null)} />
    </ERPShell>
  );
}