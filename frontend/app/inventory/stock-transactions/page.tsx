"use client";

import { useEffect, useState, useCallback } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import { stockTransactionsApi } from '@/lib/api/stock-transactions';
import { itemsApi } from '@/lib/api/items';
import { warehousesApi } from '@/lib/api/warehouses';
import {
  StockTransaction, CreateStockTransactionDto,
  TransactionType, Item, Warehouse,
} from '@/lib/api/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const TX_TYPES: { value: TransactionType; label: string; color: string; bg: string; border: string; sign: string }[] = [
  { value: 'receipt',       label: 'Receipt',         color: '#4ade80', bg: 'rgba(74,222,128,0.1)',   border: 'rgba(74,222,128,0.2)',   sign: '+' },
  { value: 'issue',         label: 'Issue',           color: '#f87171', bg: 'rgba(248,113,113,0.1)',  border: 'rgba(248,113,113,0.2)',  sign: '−' },
  { value: 'transfer',      label: 'Transfer',        color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',   border: 'rgba(96,165,250,0.2)',   sign: '⇄' },
  { value: 'adjustment',    label: 'Adjustment',      color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',   border: 'rgba(251,191,36,0.2)',   sign: '±' },
  { value: 'opening_balance', label: 'Opening Bal.', color: '#a78bfa', bg: 'rgba(167,139,250,0.1)',  border: 'rgba(167,139,250,0.2)',  sign: '◎' },
];

const EMPTY_FORM: CreateStockTransactionDto = {
  transactionType: 'receipt', itemId: '', warehouseId: '',
  quantity: 0, uom: 'PCS',
  referenceId: '', referenceType: '', lotNumber: '', serialNumber: '',
  notes: '', transactionDate: '',
};

function getTxConfig(t: string) {
  return TX_TYPES.find(x => x.value === t) ?? {
    value: t, label: t, color: '#e2dfd8', bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.1)', sign: '·',
  };
}

function fmtDateTime(d: string) {
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ─── Type badge ───────────────────────────────────────────────────────────────

function TxBadge({ type }: { type: string }) {
  const c = getTxConfig(type);
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'2px 9px', borderRadius:20, fontSize:11, fontWeight:500, color:c.color, background:c.bg, border:`0.5px solid ${c.border}`, whiteSpace:'nowrap' }}>
      <span style={{ fontSize:12, lineHeight:1 }}>{c.sign}</span>
      {c.label}
    </span>
  );
}

// ─── Create modal ─────────────────────────────────────────────────────────────

function CreateTxModal({ open, onClose, onSaved, items, warehouses }: {
  open: boolean; onClose: () => void; onSaved: () => void;
  items: Item[]; warehouses: Warehouse[];
}) {
  const [form, setForm]       = useState<CreateStockTransactionDto>(EMPTY_FORM);
  const [submitting, setSubm] = useState(false);
  const [error, setError]     = useState('');

  useEffect(() => { if (open) { setError(''); setForm(EMPTY_FORM); } }, [open]);

  const set = (key: keyof CreateStockTransactionDto) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }));

  const setNum = (key: keyof CreateStockTransactionDto) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value === '' ? 0 : Number(e.target.value) }));

  const handleItemChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const itemId = e.target.value;
    const item   = items.find(i => i.id === itemId);
    setForm(f => ({ ...f, itemId, uom: item?.baseUom ?? f.uom }));
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!form.itemId || !form.warehouseId) { setError('Item and warehouse are required.'); return; }
    if (!form.quantity || form.quantity === 0) { setError('Quantity must be non-zero.'); return; }
    setSubm(true); setError('');
    try {
      await stockTransactionsApi.create(form);
      onSaved(); onClose();
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
      setError(msg || 'Operation failed.');
    } finally { setSubm(false); }
  };

  if (!open) return null;

  const INPUT: React.CSSProperties = { background:'rgba(255,255,255,0.04)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:7, padding:'9px 12px', fontSize:13, fontFamily:"'IBM Plex Sans',sans-serif", color:'#f1ede8', outline:'none', width:'100%' };
  const LABEL = { fontSize:11, fontWeight:500 as const, letterSpacing:'0.08em' as const, textTransform:'uppercase' as const, color:'rgba(251,146,60,0.6)', fontFamily:"'IBM Plex Sans',sans-serif" };
  const SECTION = { fontSize:10, fontWeight:500 as const, letterSpacing:'0.12em' as const, textTransform:'uppercase' as const, color:'rgba(255,255,255,0.22)', paddingTop:4, borderTop:'0.5px solid rgba(255,255,255,0.06)', marginTop:4 };

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
              <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                <label style={LABEL}>Transaction Type *</label>
                <select style={INPUT} value={form.transactionType} onChange={set('transactionType')}>
                  {TX_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                <label style={LABEL}>Transaction Date</label>
                <input style={INPUT} type="date" value={form.transactionDate} onChange={set('transactionDate')} />
              </div>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
              <label style={LABEL}>Item *</label>
              <select style={INPUT} value={form.itemId} onChange={handleItemChange}>
                <option value="">— Select item —</option>
                {items.map(i => <option key={i.id} value={i.id}>{i.code} — {i.name}</option>)}
              </select>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
              <label style={LABEL}>Warehouse *</label>
              <select style={INPUT} value={form.warehouseId} onChange={set('warehouseId')}>
                <option value="">— Select warehouse —</option>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
              </select>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                <label style={LABEL}>Quantity *</label>
                <input style={INPUT} type="number" step="0.001" placeholder="100" value={form.quantity || ''} onChange={setNum('quantity')} required />
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                <label style={LABEL}>UOM *</label>
                <input style={INPUT} placeholder="PCS" value={form.uom} onChange={set('uom')} required />
              </div>
            </div>

            <div style={SECTION}>Reference (Optional)</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                <label style={LABEL}>Reference Type</label>
                <input style={INPUT} placeholder="purchase_order" value={form.referenceType} onChange={set('referenceType')} />
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                <label style={LABEL}>Reference ID</label>
                <input style={INPUT} placeholder="PO-2026-001" value={form.referenceId} onChange={set('referenceId')} />
              </div>
            </div>

            <div style={SECTION}>Lot / Serial Tracking (Optional)</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                <label style={LABEL}>Lot Number</label>
                <input style={INPUT} placeholder="LOT-2026-001" value={form.lotNumber} onChange={set('lotNumber')} />
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                <label style={LABEL}>Serial Number</label>
                <input style={INPUT} placeholder="SN-123456" value={form.serialNumber} onChange={set('serialNumber')} />
              </div>
            </div>

            <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
              <label style={LABEL}>Notes</label>
              <textarea style={{ ...INPUT, resize:'vertical', minHeight:56 }} placeholder="Transaction notes…" value={form.notes} onChange={set('notes')} />
            </div>
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8, padding:'12px 20px 18px', borderTop:'0.5px solid rgba(255,255,255,0.06)' }}>
            <button type="button" onClick={onClose} style={{ background:'rgba(255,255,255,0.05)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:7, padding:'8px 16px', fontSize:13, fontFamily:"'IBM Plex Sans',sans-serif", color:'rgba(255,255,255,0.5)', cursor:'pointer' }}>Cancel</button>
            <button type="submit" disabled={submitting} style={{ background:'linear-gradient(135deg,#c2410c,#ea580c,#f97316)', border:'none', borderRadius:7, padding:'8px 20px', fontSize:13, fontWeight:500, fontFamily:"'IBM Plex Sans',sans-serif", color:'white', cursor:'pointer', boxShadow:'0 3px 12px rgba(234,88,12,0.35)', opacity:submitting?0.5:1 }}>
              {submitting ? 'Posting…' : 'Post Transaction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function StockTransactionsPage() {
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [items,        setItems]        = useState<Item[]>([]);
  const [warehouses,   setWarehouses]   = useState<Warehouse[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [search,       setSearch]       = useState('');
  const [txTypeFilter, setTxTypeFilter] = useState<TransactionType | ''>('');
  const [modalOpen,    setModalOpen]    = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [txs, its, whs] = await Promise.all([
        stockTransactionsApi.getAll(),
        itemsApi.getAll(),
        warehousesApi.getAll(),
      ]);
      setTransactions(txs);
      setItems(its);
      setWarehouses(whs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filtered = transactions.filter(tx => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      (tx.item?.name ?? '').toLowerCase().includes(q) ||
      (tx.item?.code ?? '').toLowerCase().includes(q) ||
      (tx.warehouse?.name ?? '').toLowerCase().includes(q) ||
      (tx.referenceType ?? '').toLowerCase().includes(q) ||
      (tx.referenceId ?? '').toLowerCase().includes(q);
    const matchType = !txTypeFilter || tx.transactionType === txTypeFilter;
    return matchSearch && matchType;
  });

  // Stats by type
  const typeCounts = TX_TYPES.reduce((acc, t) => {
    acc[t.value] = transactions.filter(tx => tx.transactionType === t.value).length;
    return acc;
  }, {} as Record<string, number>);

  return (
    <ERPShell breadcrumbs={['Home', 'Inventory', 'Stock Transactions']} title="Stock Transactions">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap');
        .st-page { padding: 0 18px 24px; }
        .st-stats { display:flex; gap:8px; margin-bottom:14px; flex-wrap:wrap; }
        .st-stat { background:rgba(10,7,18,0.7); border-radius:8px; padding:6px 12px; display:flex; flex-direction:column; gap:2px; cursor:pointer; transition:opacity 0.15s; }
        .st-stat:hover { opacity:0.8; }
        .st-stat-label { font-size:10px; font-weight:500; letter-spacing:0.08em; text-transform:uppercase; }
        .st-stat-value { font-size:18px; font-weight:500; font-family:'IBM Plex Mono',monospace; color:#f1ede8; }
        .st-toolbar { display:flex; align-items:center; gap:10px; margin-bottom:14px; flex-wrap:wrap; }
        .st-search { background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.09); border-radius:7px; padding:7px 12px; font-size:12px; font-family:'IBM Plex Sans',sans-serif; color:#e2dfd8; outline:none; width:260px; }
        .st-search::placeholder { color:rgba(255,255,255,0.2); }
        .st-search:focus { border-color:rgba(251,146,60,0.4); box-shadow:0 0 0 2px rgba(234,88,12,0.08); }
        .st-filter { background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.09); border-radius:7px; padding:7px 12px; font-size:12px; font-family:'IBM Plex Sans',sans-serif; color:#e2dfd8; outline:none; }
        .st-filter option { background:#0e0b1a; }
        .st-btn-new { display:flex; align-items:center; gap:6px; margin-left:auto; background:linear-gradient(135deg,#c2410c,#ea580c,#f97316); border:none; border-radius:7px; padding:7px 14px; font-size:12px; font-weight:500; font-family:'IBM Plex Sans',sans-serif; color:white; cursor:pointer; box-shadow:0 3px 12px rgba(234,88,12,0.3); transition:opacity 0.15s, transform 0.15s; flex-shrink:0; }
        .st-btn-new:hover { opacity:0.88; transform:translateY(-1px); }
        .st-btn-new svg { width:13px; height:13px; display:block; flex-shrink:0; }
        .st-wrap { background:rgba(10,7,18,0.7); border:0.5px solid rgba(251,146,60,0.12); border-radius:10px; overflow:hidden; }
        .st-table { width:100%; border-collapse:collapse; }
        .st-table thead th { padding:9px 14px; font-size:10px; font-weight:500; letter-spacing:0.1em; text-transform:uppercase; color:rgba(251,146,60,0.55); background:rgba(251,146,60,0.05); border-bottom:0.5px solid rgba(255,255,255,0.06); text-align:left; white-space:nowrap; }
        .st-table tbody td { padding:10px 14px; border-bottom:0.5px solid rgba(255,255,255,0.04); vertical-align:middle; font-size:13px; }
        .st-table tbody tr:last-child td { border-bottom:none; }
        .st-table tbody tr:hover td { background:rgba(251,146,60,0.03); }
        .st-empty, .st-loading { text-align:center; padding:52px 24px; color:rgba(255,255,255,0.25); font-size:13px; display:flex; flex-direction:column; align-items:center; gap:10px; }
        .st-spinner { width:18px; height:18px; border-radius:50%; border:2px solid rgba(251,146,60,0.2); border-top-color:#fb923c; animation:st-spin 0.7s linear infinite; }
        @keyframes st-spin { to { transform:rotate(360deg); } }
        .st-footer { font-size:11px; color:rgba(255,255,255,0.22); padding:8px 14px; border-top:0.5px solid rgba(255,255,255,0.04); display:flex; justify-content:space-between; }
        .st-error { background:rgba(239,68,68,0.08); border:0.5px solid rgba(239,68,68,0.2); border-radius:8px; padding:10px 14px; margin-bottom:14px; font-size:13px; color:#fca5a5; }
      `}</style>

      <div className="st-page">

        {/* Type stats — clickable filters */}
        {transactions.length > 0 && (
          <div className="st-stats">
            {TX_TYPES.filter(t => typeCounts[t.value] > 0).map(t => (
              <div key={t.value} className="st-stat"
                style={{ border:`0.5px solid ${txTypeFilter === t.value ? t.border : 'rgba(255,255,255,0.07)'}` }}
                onClick={() => setTxTypeFilter(prev => prev === t.value ? '' : t.value as TransactionType)}
              >
                <span className="st-stat-label" style={{ color: t.color }}>{t.label}</span>
                <span className="st-stat-value">{typeCounts[t.value]}</span>
              </div>
            ))}
            <div className="st-stat"
              style={{ border:`0.5px solid ${!txTypeFilter ? 'rgba(251,146,60,0.3)' : 'rgba(255,255,255,0.07)'}` }}
              onClick={() => setTxTypeFilter('')}
            >
              <span className="st-stat-label" style={{ color:'rgba(251,146,60,0.6)' }}>Total</span>
              <span className="st-stat-value" style={{ color:'#fb923c' }}>{transactions.length}</span>
            </div>
          </div>
        )}

        <div className="st-toolbar">
          <input className="st-search" placeholder="Search item code, name, warehouse, reference…" value={search} onChange={e => setSearch(e.target.value)} />
          <select className="st-filter" value={txTypeFilter} onChange={e => setTxTypeFilter(e.target.value as TransactionType | '')}>
            <option value="">All Types</option>
            {TX_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <button className="st-btn-new" onClick={() => setModalOpen(true)}>
            <svg viewBox="0 0 13 13" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
              <line x1="6.5" y1="1" x2="6.5" y2="12"/><line x1="1" y1="6.5" x2="12" y2="6.5"/>
            </svg>
            New Transaction
          </button>
        </div>

        {error && <div className="st-error">{error}</div>}

        <div className="st-wrap">
          {loading ? (
            <div className="st-loading"><div className="st-spinner" />Loading transactions…</div>
          ) : filtered.length === 0 ? (
            <div className="st-empty">
              {search || txTypeFilter ? 'No transactions match your filters.' : 'No stock transactions yet.'}
            </div>
          ) : (
            <>
              <table className="st-table">
                <thead>
                  <tr>
                    <th>Type</th>
                    <th>Item</th>
                    <th>Warehouse</th>
                    <th style={{ textAlign:'right' }}>Quantity</th>
                    <th>UOM</th>
                    <th>Unit Cost</th>
                    <th>Reference</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(tx => {
                    const c = getTxConfig(tx.transactionType);
                    const isIn = ['receipt','opening_balance'].includes(tx.transactionType);
                    const isOut = tx.transactionType === 'issue';
                    return (
                      <tr key={tx.id}>
                        <td><TxBadge type={tx.transactionType} /></td>
                        <td>
                          <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:12, color:'#fb923c' }}>{tx.item?.code ?? '—'}</span>
                          <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', marginTop:1 }}>{tx.item?.name}</div>
                        </td>
                        <td><span style={{ fontSize:12, color:'rgba(255,255,255,0.45)' }}>{tx.warehouse?.name ?? '—'}</span></td>
                        <td style={{ textAlign:'right' }}>
                          <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:13, fontWeight:500, color: isIn ? '#4ade80' : isOut ? '#f87171' : '#fbbf24' }}>
                            {isIn ? '+' : isOut ? '−' : '±'}{Math.abs(tx.quantity)}
                          </span>
                        </td>
                        <td><span style={{ fontSize:12, color:'rgba(255,255,255,0.4)' }}>{tx.uom}</span></td>
                        <td>
                          <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:12, color:'rgba(255,255,255,0.45)' }}>
                            {tx.unitCost ? `$${Number(tx.unitCost).toFixed(4)}` : '—'}
                          </span>
                        </td>
                        <td>
                          {tx.referenceType ? (
                            <div>
                              <div style={{ fontSize:10, color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:'0.06em' }}>{tx.referenceType}</div>
                              <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color:'#fb923c' }}>{tx.referenceId}</div>
                            </div>
                          ) : <span style={{ fontSize:12, color:'rgba(255,255,255,0.2)' }}>—</span>}
                        </td>
                        <td><span style={{ fontSize:12, color:'rgba(255,255,255,0.4)' }}>{fmtDateTime(tx.transactionDate ?? tx.createdAt)}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="st-footer">
                <span>{filtered.length} of {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}</span>
                {txTypeFilter && <span style={{ color:'rgba(255,255,255,0.3)' }}>Filtered by: {getTxConfig(txTypeFilter).label}</span>}
              </div>
            </>
          )}
        </div>
      </div>

      <CreateTxModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={fetchAll} items={items} warehouses={warehouses} />
    </ERPShell>
  );
}