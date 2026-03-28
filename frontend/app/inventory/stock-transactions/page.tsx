"use client";

import { useEffect, useState, useCallback } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import { itemsApi } from '@/lib/api/items';
import { warehousesApi } from '@/lib/api/warehouses';
import apiClient from '@/lib/api/client';
import { stockTransactionsApi } from '@/lib/api/stock-transactions';
import { CreateStockTransactionDto, Item, Warehouse } from '@/lib/api/types';

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

// ─── Constants ────────────────────────────────────────────────────────────────

const TX_TYPES = [
  { value: 'receipt',         label: 'Receipt',      color: '#4ade80', bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.2)',  sign: '+' },
  { value: 'issue',           label: 'Issue',        color: '#f87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.2)', sign: '−' },
  { value: 'transfer',        label: 'Transfer',     color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',  border: 'rgba(96,165,250,0.2)',  sign: '⇄' },
  { value: 'adjustment',      label: 'Adjustment',   color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.2)',  sign: '±' },
  { value: 'opening_balance', label: 'Opening Bal.', color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.2)', sign: '◎' },
];

const ITEM_TYPE_COLOR: Record<string, string> = {
  finished_good: '#4ade80', raw_material: '#60a5fa',
  consumable: '#fbbf24',    service: 'rgba(255,255,255,0.35)',
};

const EMPTY_FORM: CreateStockTransactionDto = {
  transactionType: 'receipt', itemId: '', warehouseId: '',
  quantity: 0, uom: 'PCS',
  referenceId: '', referenceType: '', lotNumber: '', serialNumber: '',
  notes: '', transactionDate: '',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getTxCfg(t: string) {
  return TX_TYPES.find(x => x.value === t) ?? { value: t, label: t, color: '#e2dfd8', bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.1)', sign: '·' };
}
function fmtAmt(v: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(v);
}
function fmtQty(v: number) {
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: 3 }).format(Math.abs(v));
}
function fmtDate(d: string) {
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const MONO: React.CSSProperties = { fontFamily: "'IBM Plex Mono',monospace" };

// ─── Badge ────────────────────────────────────────────────────────────────────

function TxBadge({ type }: { type: string }) {
  const c = getTxCfg(type);
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'2px 8px', borderRadius:20, fontSize:10, fontWeight:500, color:c.color, background:c.bg, border:`0.5px solid ${c.border}`, whiteSpace:'nowrap' }}>
      <span style={{ fontSize:11 }}>{c.sign}</span>{c.label}
    </span>
  );
}

// ─── Create modal (unchanged logic, same quality) ─────────────────────────────

function CreateTxModal({ open, onClose, onSaved, items, warehouses }: {
  open: boolean; onClose: () => void; onSaved: () => void;
  items: Item[]; warehouses: Warehouse[];
}) {
  const [form, setForm]   = useState<CreateStockTransactionDto>(EMPTY_FORM);
  const [busy, setBusy]   = useState(false);
  const [error, setError] = useState('');

  useEffect(() => { if (open) { setError(''); setForm(EMPTY_FORM); } }, [open]);

  const set = (k: keyof CreateStockTransactionDto) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));

  const setNum = (k: keyof CreateStockTransactionDto) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value === '' ? 0 : Number(e.target.value) }));

  const handleItemChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const itemId = e.target.value;
    const item   = items.find(i => i.id === itemId);
    setForm(f => ({ ...f, itemId, uom: item?.baseUom ?? f.uom }));
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!form.itemId || !form.warehouseId) { setError('Item and warehouse are required.'); return; }
    if (!form.quantity || form.quantity === 0) { setError('Quantity must be non-zero.'); return; }
    setBusy(true); setError('');
    try {
      await stockTransactionsApi.create(form);
      onSaved(); onClose();
    } catch (err) {
      setError((err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Operation failed.');
    } finally { setBusy(false); }
  };

  if (!open) return null;

  const I: React.CSSProperties = { background:'rgba(255,255,255,0.04)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:7, padding:'9px 12px', fontSize:13, fontFamily:"'IBM Plex Sans',sans-serif", color:'#f1ede8', outline:'none', width:'100%' };
  const L = { fontSize:11, fontWeight:500 as const, letterSpacing:'0.08em' as const, textTransform:'uppercase' as const, color:'rgba(251,146,60,0.6)', fontFamily:"'IBM Plex Sans',sans-serif" };
  const S = { fontSize:10, fontWeight:500 as const, letterSpacing:'0.12em' as const, textTransform:'uppercase' as const, color:'rgba(255,255,255,0.22)', paddingTop:8 as const, borderTop:'0.5px solid rgba(255,255,255,0.06)', marginTop:4 as const };

  return (
    <div style={{ position:'fixed', inset:0, zIndex:400, background:'rgba(0,0,0,0.65)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ background:'#0e0b1a', border:'0.5px solid rgba(251,146,60,0.2)', borderRadius:14, width:'100%', maxWidth:540, maxHeight:'92vh', overflowY:'auto', position:'relative', boxShadow:'0 24px 60px rgba(0,0,0,0.7)' }}>
        <div style={{ position:'absolute', top:0, left:30, right:30, height:1, background:'linear-gradient(90deg,transparent,rgba(251,146,60,0.4),transparent)' }} />
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px 12px', borderBottom:'0.5px solid rgba(255,255,255,0.06)', position:'sticky', top:0, background:'#0e0b1a', zIndex:1, borderRadius:'14px 14px 0 0' }}>
          <span style={{ fontSize:14, fontWeight:500, color:'#f1ede8', fontFamily:"'IBM Plex Sans',sans-serif" }}>New Stock Transaction</span>
          <button onClick={onClose} style={{ width:24, height:24, borderRadius:6, background:'rgba(255,255,255,0.06)', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.45)', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ padding:'16px 20px', display:'flex', flexDirection:'column', gap:12 }}>
            {error && <div style={{ background:'rgba(239,68,68,0.1)', border:'0.5px solid rgba(239,68,68,0.25)', borderRadius:7, padding:'8px 12px', fontSize:12, color:'#fca5a5' }}>{error}</div>}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div style={{ display:'flex', flexDirection:'column', gap:5 }}><label style={L}>Type *</label>
                <select style={I} value={form.transactionType} onChange={set('transactionType')}>
                  {TX_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:5 }}><label style={L}>Date</label>
                <input style={I} type="date" value={form.transactionDate} onChange={set('transactionDate')} />
              </div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:5 }}><label style={L}>Item *</label>
              <select style={I} value={form.itemId} onChange={handleItemChange}>
                <option value="">— Select item —</option>
                {items.map(i => <option key={i.id} value={i.id}>{i.code} — {i.name}</option>)}
              </select>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:5 }}><label style={L}>Warehouse *</label>
              <select style={I} value={form.warehouseId} onChange={set('warehouseId')}>
                <option value="">— Select warehouse —</option>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
              </select>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div style={{ display:'flex', flexDirection:'column', gap:5 }}><label style={L}>Quantity *</label>
                <input style={I} type="number" step="0.001" placeholder="100" value={form.quantity || ''} onChange={setNum('quantity')} required />
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:5 }}><label style={L}>UOM *</label>
                <input style={I} placeholder="PCS" value={form.uom} onChange={set('uom')} required />
              </div>
            </div>
            <div style={S}>Reference (Optional)</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div style={{ display:'flex', flexDirection:'column', gap:5 }}><label style={L}>Reference Type</label>
                <input style={I} placeholder="purchase_order" value={form.referenceType} onChange={set('referenceType')} />
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:5 }}><label style={L}>Reference ID</label>
                <input style={I} placeholder="PO-2026-001" value={form.referenceId} onChange={set('referenceId')} />
              </div>
            </div>
            <div style={S}>Lot / Serial (Optional)</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div style={{ display:'flex', flexDirection:'column', gap:5 }}><label style={L}>Lot Number</label>
                <input style={I} placeholder="LOT-2026-001" value={form.lotNumber} onChange={set('lotNumber')} />
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:5 }}><label style={L}>Serial Number</label>
                <input style={I} placeholder="SN-123456" value={form.serialNumber} onChange={set('serialNumber')} />
              </div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:5 }}><label style={L}>Notes</label>
              <textarea style={{ ...I, resize:'vertical', minHeight:56 }} placeholder="Transaction notes…" value={form.notes} onChange={set('notes')} />
            </div>
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8, padding:'12px 20px 18px', borderTop:'0.5px solid rgba(255,255,255,0.06)' }}>
            <button type="button" onClick={onClose} style={{ background:'rgba(255,255,255,0.05)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:7, padding:'8px 16px', fontSize:13, fontFamily:"'IBM Plex Sans',sans-serif", color:'rgba(255,255,255,0.5)', cursor:'pointer' }}>Cancel</button>
            <button type="submit" disabled={busy} style={{ background:'linear-gradient(135deg,#c2410c,#ea580c,#f97316)', border:'none', borderRadius:7, padding:'8px 20px', fontSize:13, fontWeight:500, fontFamily:"'IBM Plex Sans',sans-serif", color:'white', cursor:'pointer', boxShadow:'0 3px 12px rgba(234,88,12,0.35)', opacity:busy?0.5:1 }}>
              {busy ? 'Posting…' : 'Post Transaction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function StockTransactionsPage() {
  const [rows,         setRows]         = useState<LedgerRow[]>([]);
  const [totals,       setTotals]       = useState<LedgerTotals | null>(null);
  const [items,        setItems]        = useState<Item[]>([]);
  const [warehouses,   setWarehouses]   = useState<Warehouse[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [search,       setSearch]       = useState('');
  const [typeFilter,   setTypeFilter]   = useState('');
  const [warehouseFilter, setWHFilter] = useState('');
  const [itemTypeFilter,  setITFilter] = useState('');
  const [modalOpen,    setModalOpen]    = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [ledger, its, whs] = await Promise.all([
        apiClient.get('/stock-transactions/ledger'),
        itemsApi.getAll(),
        warehousesApi.getAll(),
      ]);
      const data = ledger.data as { rows: LedgerRow[]; totals: LedgerTotals; count: number };
      setRows(data.rows ?? []);
      setTotals(data.totals ?? null);
      setItems(its as Item[]);
      setWarehouses(whs as Warehouse[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Client-side filters on top of the full ledger data
  const filtered = rows.filter(row => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      (row.item?.code ?? '').toLowerCase().includes(q) ||
      (row.item?.name ?? '').toLowerCase().includes(q) ||
      (row.warehouse?.name ?? '').toLowerCase().includes(q) ||
      (row.referenceNumber ?? '').toLowerCase().includes(q) ||
      row.movementNumber.toLowerCase().includes(q);
    const matchType      = !typeFilter      || row.movementType === typeFilter;
    const matchWarehouse = !warehouseFilter || row.warehouse?.id === warehouseFilter;
    const matchItemType  = !itemTypeFilter  || row.item?.itemType === itemTypeFilter;
    return matchSearch && matchType && matchWarehouse && matchItemType;
  });

  // Recompute totals from filtered rows
  const filteredTotals = {
    totalIn:       filtered.filter(r => r.signedQuantity > 0).reduce((s, r) => s + r.quantity, 0),
    totalOut:      filtered.filter(r => r.signedQuantity < 0).reduce((s, r) => s + r.quantity, 0),
    totalInValue:  filtered.filter(r => r.signedQuantity > 0).reduce((s, r) => s + r.totalValue, 0),
    totalOutValue: filtered.filter(r => r.signedQuantity < 0).reduce((s, r) => s + Math.abs(r.totalValue), 0),
    netValue:      filtered.reduce((s, r) => s + r.totalValue, 0),
  };

  // Type pill counts from filtered
  const typeCounts = TX_TYPES.reduce((acc, t) => {
    acc[t.value] = rows.filter(r => r.movementType === t.value).length;
    return acc;
  }, {} as Record<string, number>);

  const hasFilters = !!(search || typeFilter || warehouseFilter || itemTypeFilter);

  const SEL: React.CSSProperties = { background:'rgba(255,255,255,0.04)', border:'0.5px solid rgba(255,255,255,0.09)', borderRadius:7, padding:'7px 10px', fontSize:12, fontFamily:"'IBM Plex Sans',sans-serif", color:'#e2dfd8', outline:'none', cursor:'pointer' };

  return (
    <ERPShell breadcrumbs={['Home', 'Inventory', 'Stock Transactions']} title="Stock Transactions">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap');
        .st-page { padding: 0 18px 24px; }

        /* Type pills */
        .st-pills { display:flex; gap:6px; margin-bottom:14px; flex-wrap:wrap; }
        .st-pill { background:rgba(10,7,18,0.7); border-radius:8px; padding:6px 12px; display:flex; flex-direction:column; gap:1px; cursor:pointer; transition:all 0.15s; min-width:76px; }
        .st-pill:hover { opacity:0.8; transform:translateY(-1px); }
        .st-pill-label { font-size:9px; font-weight:500; letter-spacing:0.08em; text-transform:uppercase; }
        .st-pill-value { font-size:20px; font-weight:500; font-family:'IBM Plex Mono',monospace; color:#f1ede8; }

        /* Totals bar */
        .st-totals { display:grid; grid-template-columns:repeat(5,1fr); gap:6px; margin-bottom:14px; }
        .st-total { background:rgba(10,7,18,0.7); border-radius:8px; padding:8px 12px; }
        .st-total-label { font-size:9px; font-weight:500; letter-spacing:0.08em; text-transform:uppercase; color:rgba(255,255,255,0.3); margin-bottom:3px; }
        .st-total-value { font-size:13px; font-weight:500; font-family:'IBM Plex Mono',monospace; }

        /* Toolbar */
        .st-toolbar { display:flex; align-items:center; gap:8px; margin-bottom:14px; flex-wrap:wrap; }
        .st-search { background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.09); border-radius:7px; padding:7px 12px; font-size:12px; font-family:'IBM Plex Sans',sans-serif; color:#e2dfd8; outline:none; width:240px; }
        .st-search::placeholder { color:rgba(255,255,255,0.2); }
        .st-search:focus { border-color:rgba(251,146,60,0.4); box-shadow:0 0 0 2px rgba(234,88,12,0.08); }
        .st-btn-new { display:flex; align-items:center; gap:6px; margin-left:auto; background:linear-gradient(135deg,#c2410c,#ea580c,#f97316); border:none; border-radius:7px; padding:7px 14px; font-size:12px; font-weight:500; font-family:'IBM Plex Sans',sans-serif; color:white; cursor:pointer; box-shadow:0 3px 12px rgba(234,88,12,0.3); transition:opacity 0.15s, transform 0.15s; flex-shrink:0; }
        .st-btn-new:hover { opacity:0.88; transform:translateY(-1px); }
        .st-btn-new svg { width:13px; height:13px; display:block; flex-shrink:0; }
        .st-btn-reset { background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.09); border-radius:7px; padding:7px 10px; font-size:11px; font-family:'IBM Plex Sans',sans-serif; color:rgba(255,255,255,0.4); cursor:pointer; transition:all 0.15s; }
        .st-btn-reset:hover { color:rgba(255,255,255,0.7); background:rgba(255,255,255,0.08); }

        /* Table */
        .st-wrap { background:rgba(10,7,18,0.7); border:0.5px solid rgba(251,146,60,0.12); border-radius:10px; overflow:hidden; }
        .st-table { width:100%; border-collapse:collapse; }
        .st-table thead th { padding:8px 12px; font-size:9px; font-weight:500; letter-spacing:0.1em; text-transform:uppercase; color:rgba(251,146,60,0.55); background:rgba(251,146,60,0.05); border-bottom:0.5px solid rgba(255,255,255,0.06); text-align:left; white-space:nowrap; }
        .st-table thead th.r { text-align:right; }
        .st-table tbody td { padding:9px 12px; border-bottom:0.5px solid rgba(255,255,255,0.03); vertical-align:middle; }
        .st-table tbody tr:last-child td { border-bottom:none; }
        .st-table tbody tr:hover td { background:rgba(251,146,60,0.02); }
        .st-empty, .st-loading { text-align:center; padding:52px 24px; color:rgba(255,255,255,0.25); font-size:13px; display:flex; flex-direction:column; align-items:center; gap:10px; }
        .st-spinner { width:18px; height:18px; border-radius:50%; border:2px solid rgba(251,146,60,0.2); border-top-color:#fb923c; animation:st-spin 0.7s linear infinite; }
        @keyframes st-spin { to { transform:rotate(360deg); } }
        .st-footer { font-size:11px; color:rgba(255,255,255,0.22); padding:8px 12px; border-top:0.5px solid rgba(255,255,255,0.04); display:flex; justify-content:space-between; align-items:center; }
        .st-error { background:rgba(239,68,68,0.08); border:0.5px solid rgba(239,68,68,0.2); border-radius:8px; padding:10px 14px; margin-bottom:14px; font-size:13px; color:#fca5a5; }
      `}</style>

      <div className="st-page">

        {/* Type pills */}
        {rows.length > 0 && (
          <div className="st-pills">
            {TX_TYPES.filter(t => typeCounts[t.value] > 0).map(t => (
              <div key={t.value} className="st-pill"
                style={{ border:`0.5px solid ${typeFilter === t.value ? t.border : 'rgba(255,255,255,0.07)'}`, background: typeFilter === t.value ? t.bg : 'rgba(10,7,18,0.7)' }}
                onClick={() => setTypeFilter(prev => prev === t.value ? '' : t.value)}
              >
                <span className="st-pill-label" style={{ color: t.color }}>{t.sign} {t.label}</span>
                <span className="st-pill-value">{typeCounts[t.value]}</span>
              </div>
            ))}
            <div className="st-pill"
              style={{ border:`0.5px solid ${!typeFilter ? 'rgba(251,146,60,0.3)' : 'rgba(255,255,255,0.07)'}` }}
              onClick={() => setTypeFilter('')}
            >
              <span className="st-pill-label" style={{ color:'rgba(251,146,60,0.6)' }}>All</span>
              <span className="st-pill-value" style={{ color:'#fb923c' }}>{rows.length}</span>
            </div>
          </div>
        )}

        {/* Totals bar — reacts to filters */}
        {rows.length > 0 && (
          <div className="st-totals">
            {[
              { label: 'Total IN (qty)',  value: `+${new Intl.NumberFormat('en-US',{maximumFractionDigits:3}).format(filteredTotals.totalIn)}`,  color: '#4ade80' },
              { label: 'Total OUT (qty)', value: `−${new Intl.NumberFormat('en-US',{maximumFractionDigits:3}).format(filteredTotals.totalOut)}`, color: '#f87171' },
              { label: 'IN Value',        value: fmtAmt(filteredTotals.totalInValue),  color: '#4ade80' },
              { label: 'OUT Value',       value: fmtAmt(filteredTotals.totalOutValue), color: '#f87171' },
              { label: 'Net Value',       value: fmtAmt(filteredTotals.netValue), color: filteredTotals.netValue >= 0 ? '#4ade80' : '#f87171' },
            ].map(t => (
              <div key={t.label} className="st-total" style={{ border:`0.5px solid ${t.color}18` }}>
                <div className="st-total-label">{t.label}</div>
                <div className="st-total-value" style={{ color: t.color }}>{t.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Toolbar */}
        <div className="st-toolbar">
          <input className="st-search" placeholder="Search item, warehouse, reference #…" value={search} onChange={e => setSearch(e.target.value)} />

          <select style={SEL} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
            <option value="">All Types</option>
            {TX_TYPES.map(t => <option key={t.value} value={t.value}>{t.sign} {t.label}</option>)}
          </select>

          <select style={SEL} value={warehouseFilter} onChange={e => setWHFilter(e.target.value)}>
            <option value="">All Warehouses</option>
            {warehouses.map(w => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
          </select>

          <select style={SEL} value={itemTypeFilter} onChange={e => setITFilter(e.target.value)}>
            <option value="">All Categories</option>
            {['finished_good','raw_material','consumable','service'].map(t => (
              <option key={t} value={t}>{t.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}</option>
            ))}
          </select>

          {hasFilters && (
            <button className="st-btn-reset" onClick={() => { setSearch(''); setTypeFilter(''); setWHFilter(''); setITFilter(''); }}>
              ↺ Clear
            </button>
          )}

          <button className="st-btn-new" onClick={() => setModalOpen(true)}>
            <svg viewBox="0 0 13 13" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
              <line x1="6.5" y1="1" x2="6.5" y2="12"/><line x1="1" y1="6.5" x2="12" y2="6.5"/>
            </svg>
            New Transaction
          </button>
        </div>

        {error && <div className="st-error">{error}</div>}

        {/* Table */}
        <div className="st-wrap">
          {loading ? (
            <div className="st-loading"><div className="st-spinner" />Loading transactions…</div>
          ) : filtered.length === 0 ? (
            <div className="st-empty">{hasFilters ? 'No transactions match your filters.' : 'No stock transactions yet.'}</div>
          ) : (
            <>
              <table className="st-table">
                <thead>
                  <tr>
                    <th>Movement #</th>
                    <th>Type</th>
                    <th>Item</th>
                    <th>Category</th>
                    <th>Warehouse</th>
                    <th className="r">Quantity</th>
                    <th>UOM</th>
                    <th className="r">Unit Cost</th>
                    <th className="r">Total Value</th>
                    <th>Reference</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(row => {
                    const isIn   = row.signedQuantity > 0;
                    const isOut  = row.signedQuantity < 0;
                    const itColor = ITEM_TYPE_COLOR[row.item?.itemType ?? ''] ?? 'rgba(255,255,255,0.35)';
                    return (
                      <tr key={row.id}>
                        {/* Movement # */}
                        <td>
                          <span style={{ ...MONO, fontSize:11, color:'#fb923c' }}>{row.movementNumber}</span>
                        </td>

                        {/* Type */}
                        <td><TxBadge type={row.movementType} /></td>

                        {/* Item */}
                        <td>
                          <span style={{ ...MONO, fontSize:11, color:'#f1ede8', fontWeight:500 }}>{row.item?.code ?? '—'}</span>
                          <div style={{ fontSize:10, color:'rgba(255,255,255,0.35)', marginTop:1 }}>{row.item?.name}</div>
                        </td>

                        {/* Category */}
                        <td>
                          {row.item?.itemType && (
                            <span style={{ fontSize:9, padding:'1px 6px', borderRadius:10, color:itColor, background:`${itColor}15`, border:`0.5px solid ${itColor}30`, whiteSpace:'nowrap' }}>
                              {row.item.itemType.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())}
                            </span>
                          )}
                        </td>

                        {/* Warehouse */}
                        <td>
                          <span style={{ fontSize:11, color:'rgba(255,255,255,0.4)' }}>{row.warehouse?.code ?? '—'}</span>
                          <div style={{ fontSize:10, color:'rgba(255,255,255,0.25)', marginTop:1 }}>{row.warehouse?.name}</div>
                        </td>

                        {/* Quantity — signed + colored */}
                        <td style={{ textAlign:'right' }}>
                          <span style={{ ...MONO, fontSize:13, fontWeight:600, color: isIn ? '#4ade80' : isOut ? '#f87171' : '#fbbf24' }}>
                            {isIn ? '+' : isOut ? '−' : '±'}{fmtQty(row.signedQuantity)}
                          </span>
                        </td>

                        {/* UOM */}
                        <td><span style={{ fontSize:10, color:'rgba(255,255,255,0.35)' }}>{row.uom}</span></td>

                        {/* Unit Cost */}
                        <td style={{ textAlign:'right' }}>
                          <span style={{ ...MONO, fontSize:11, color:'rgba(255,255,255,0.45)' }}>
                            {row.unitCost > 0 ? fmtAmt(row.unitCost) : '—'}
                          </span>
                        </td>

                        {/* Total Value — signed + colored */}
                        <td style={{ textAlign:'right' }}>
                          <span style={{ ...MONO, fontSize:12, fontWeight:500, color: isIn ? '#4ade80' : isOut ? '#f87171' : '#fbbf24' }}>
                            {row.totalValue !== 0 ? (isIn ? '+' : '−') + fmtAmt(Math.abs(row.totalValue)) : '—'}
                          </span>
                        </td>

                        {/* Reference — legible number, not UUID */}
                        <td>
                          <div>
                            {row.referenceType && (
                              <div style={{ fontSize:9, color:'rgba(255,255,255,0.25)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:1 }}>
                                {row.referenceType.replace(/_/g,' ')}
                              </div>
                            )}
                            <span style={{ ...MONO, fontSize:11, color: row.referenceNumber !== '—' ? '#fb923c' : 'rgba(255,255,255,0.2)' }}>
                              {row.referenceNumber}
                            </span>
                          </div>
                        </td>

                        {/* Date */}
                        <td>
                          <span style={{ fontSize:11, color:'rgba(255,255,255,0.4)' }}>{fmtDate(row.movementDate)}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="st-footer">
                <span>{filtered.length} of {rows.length} transaction{rows.length !== 1 ? 's' : ''}</span>
                {hasFilters && (
                  <span style={{ fontSize:10, color:'rgba(251,146,60,0.4)' }}>
                    Filtered · IN {fmtAmt(filteredTotals.totalInValue)} / OUT {fmtAmt(filteredTotals.totalOutValue)}
                  </span>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <CreateTxModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={fetchAll} items={items} warehouses={warehouses} />
    </ERPShell>
  );
}