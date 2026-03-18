"use client";

import { useEffect, useState, useCallback } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import { stockTransactionsApi } from '@/lib/api/stock-transactions';
import { itemsApi } from '@/lib/api/items';
import { warehousesApi } from '@/lib/api/warehouses';
import {
  StockTransaction, StockBalance, CreateStockTransactionDto,
  TransactionType, Item, Warehouse,
} from '@/lib/api/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const TX_TYPES: { value: TransactionType; label: string; color: string; bg: string; border: string; sign: string }[] = [
  { value: 'receipt',    label: 'Receipt',    color: '#4ade80', bg: 'rgba(74,222,128,0.1)',   border: 'rgba(74,222,128,0.2)',   sign: '+' },
  { value: 'issue',      label: 'Issue',      color: '#f87171', bg: 'rgba(248,113,113,0.1)',  border: 'rgba(248,113,113,0.2)',  sign: '−' },
  { value: 'transfer',   label: 'Transfer',   color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',   border: 'rgba(96,165,250,0.2)',   sign: '⇄' },
  { value: 'adjustment', label: 'Adjustment', color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',   border: 'rgba(251,191,36,0.2)',   sign: '±' },
];

const EMPTY_FORM: CreateStockTransactionDto = {
  transactionType: 'receipt', itemId: '', warehouseId: '',
  quantity: 0, uom: 'PCS',
  referenceId: '', referenceType: '', lotNumber: '', serialNumber: '',
  notes: '', transactionDate: '',
};

function getTxConfig(t: TransactionType) {
  return TX_TYPES.find(x => x.value === t) ?? TX_TYPES[0];
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateTime(d: string) {
  return new Date(d).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

// ─── Badges ───────────────────────────────────────────────────────────────────

function TxBadge({ type }: { type: TransactionType }) {
  const c = getTxConfig(type);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 500,
      color: c.color, background: c.bg, border: `0.5px solid ${c.border}`,
      whiteSpace: 'nowrap',
    }}>
      <span style={{ fontSize: 12, lineHeight: 1 }}>{c.sign}</span>
      {c.label}
    </span>
  );
}

// ─── Create modal ─────────────────────────────────────────────────────────────

function CreateTxModal({ open, onClose, onSaved, items, warehouses }: {
  open: boolean; onClose: () => void; onSaved: () => void;
  items: Item[]; warehouses: Warehouse[];
}) {
  const [form, setForm] = useState<CreateStockTransactionDto>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) { setError(''); setForm(EMPTY_FORM); }
  }, [open]);

  const set = (key: keyof CreateStockTransactionDto) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }));

  const setNum = (key: keyof CreateStockTransactionDto) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value === '' ? 0 : Number(e.target.value) }));

  // Auto-fill UOM from selected item
  const handleItemChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const itemId = e.target.value;
    const item = items.find(i => i.id === itemId);
    setForm(f => ({ ...f, itemId, uom: item?.baseUom ?? f.uom }));
  };

  const handleSubmit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    if (!form.itemId || !form.warehouseId) { setError('Item and warehouse are required.'); return; }
    if (!form.quantity || form.quantity === 0) { setError('Quantity must be non-zero.'); return; }
    setSubmitting(true); setError('');
    try {
      await stockTransactionsApi.create(form);
      onSaved(); onClose();
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
      setError(msg || 'Operation failed.');
    } finally { setSubmitting(false); }
  };

  if (!open) return null;

  return (
    <>
      <style>{`
        .stm-overlay {
          position:fixed; inset:0; z-index:400;
          background:rgba(0,0,0,0.65); backdrop-filter:blur(4px);
          display:flex; align-items:center; justify-content:center; padding:24px;
        }
        .stm-box {
          background:#0e0b1a; border:0.5px solid rgba(251,146,60,0.2);
          border-radius:14px; width:100%; max-width:540px;
          max-height:92vh; overflow-y:auto; position:relative;
          box-shadow:0 24px 60px rgba(0,0,0,0.7);
        }
        .stm-box::before {
          content:''; position:absolute; top:0; left:30px; right:30px; height:1px;
          background:linear-gradient(90deg,transparent,rgba(251,146,60,0.4),transparent);
        }
        .stm-hdr {
          display:flex; align-items:center; justify-content:space-between;
          padding:16px 20px 12px; border-bottom:0.5px solid rgba(255,255,255,0.06);
          position:sticky; top:0; background:#0e0b1a; z-index:1;
        }
        .stm-title { font-size:14px; font-weight:500; color:#f1ede8; font-family:'IBM Plex Sans',sans-serif; }
        .stm-close {
          width:24px; height:24px; border-radius:6px; background:rgba(255,255,255,0.06);
          border:none; cursor:pointer; color:rgba(255,255,255,0.45); font-size:16px;
          display:flex; align-items:center; justify-content:center;
        }
        .stm-close:hover { background:rgba(255,255,255,0.1); color:rgba(255,255,255,0.8); }
        .stm-body { padding:16px 20px; display:flex; flex-direction:column; gap:12px; }
        .stm-row  { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
        .stm-row3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; }
        .stm-field { display:flex; flex-direction:column; gap:5px; }
        .stm-label {
          font-size:11px; font-weight:500; letter-spacing:0.08em; text-transform:uppercase;
          color:rgba(251,146,60,0.6); font-family:'IBM Plex Sans',sans-serif;
        }
        .stm-input, .stm-select, .stm-textarea {
          background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.1);
          border-radius:7px; padding:9px 12px; font-size:13px;
          font-family:'IBM Plex Sans',sans-serif; color:#f1ede8; outline:none; width:100%;
          transition:border-color 0.2s, box-shadow 0.2s;
        }
        .stm-input::placeholder, .stm-textarea::placeholder { color:rgba(255,255,255,0.18); }
        .stm-input:focus, .stm-select:focus, .stm-textarea:focus {
          border-color:rgba(251,146,60,0.45); box-shadow:0 0 0 2px rgba(234,88,12,0.1);
        }
        .stm-select option { background:#0e0b1a; color:#f1ede8; }
        .stm-textarea { resize:vertical; min-height:60px; }
        .stm-section {
          font-size:10px; font-weight:500; letter-spacing:0.12em; text-transform:uppercase;
          color:rgba(255,255,255,0.25); padding:4px 0 2px;
          border-bottom:0.5px solid rgba(255,255,255,0.06); margin-top:4px;
        }
        .stm-error {
          background:rgba(239,68,68,0.1); border:0.5px solid rgba(239,68,68,0.25);
          border-radius:7px; padding:8px 12px; font-size:12px; color:#fca5a5;
        }
        .stm-ftr {
          display:flex; justify-content:flex-end; gap:8px;
          padding:12px 20px 18px; border-top:0.5px solid rgba(255,255,255,0.06);
        }
        .stm-btn-cancel {
          background:rgba(255,255,255,0.05); border:0.5px solid rgba(255,255,255,0.1);
          border-radius:7px; padding:8px 16px; font-size:13px;
          font-family:'IBM Plex Sans',sans-serif; color:rgba(255,255,255,0.5); cursor:pointer;
        }
        .stm-btn-cancel:hover { background:rgba(255,255,255,0.08); }
        .stm-btn-save {
          background:linear-gradient(135deg,#c2410c,#ea580c,#f97316); border:none;
          border-radius:7px; padding:8px 20px; font-size:13px; font-weight:500;
          font-family:'IBM Plex Sans',sans-serif; color:white; cursor:pointer;
          box-shadow:0 3px 12px rgba(234,88,12,0.35); transition:opacity 0.2s;
        }
        .stm-btn-save:disabled { opacity:0.5; cursor:not-allowed; }
        .stm-btn-save:hover:not(:disabled) { opacity:0.88; }
      `}</style>

      <div className="stm-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="stm-box">
          <div className="stm-hdr">
            <span className="stm-title">New Stock Transaction</span>
            <button className="stm-close" onClick={onClose}>×</button>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="stm-body">
              {error && <div className="stm-error">{error}</div>}

              {/* Type + Date */}
              <div className="stm-row">
                <div className="stm-field">
                  <label className="stm-label">Transaction Type *</label>
                  <select className="stm-select" value={form.transactionType} onChange={set('transactionType')}>
                    {TX_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className="stm-field">
                  <label className="stm-label">Transaction Date</label>
                  <input className="stm-input" type="date" value={form.transactionDate} onChange={set('transactionDate')} />
                </div>
              </div>

              {/* Item + Warehouse */}
              <div className="stm-field">
                <label className="stm-label">Item *</label>
                <select className="stm-select" value={form.itemId} onChange={handleItemChange}>
                  <option value="">— Select item —</option>
                  {items.map(i => (
                    <option key={i.id} value={i.id}>{i.code} — {i.name}</option>
                  ))}
                </select>
              </div>

              <div className="stm-field">
                <label className="stm-label">Warehouse *</label>
                <select className="stm-select" value={form.warehouseId} onChange={set('warehouseId')}>
                  <option value="">— Select warehouse —</option>
                  {warehouses.map(w => (
                    <option key={w.id} value={w.id}>{w.code} — {w.name}</option>
                  ))}
                </select>
              </div>

              {/* Quantity + UOM */}
              <div className="stm-row">
                <div className="stm-field">
                  <label className="stm-label">Quantity *</label>
                  <input
                    className="stm-input" type="number" step="0.001" placeholder="100"
                    value={form.quantity || ''} onChange={setNum('quantity')} required
                  />
                </div>
                <div className="stm-field">
                  <label className="stm-label">UOM *</label>
                  <input className="stm-input" placeholder="PCS" value={form.uom} onChange={set('uom')} required />
                </div>
              </div>

              {/* Reference */}
              <div className="stm-section">Reference (Optional)</div>
              <div className="stm-row">
                <div className="stm-field">
                  <label className="stm-label">Reference Type</label>
                  <input className="stm-input" placeholder="purchase_order" value={form.referenceType} onChange={set('referenceType')} />
                </div>
                <div className="stm-field">
                  <label className="stm-label">Reference ID</label>
                  <input className="stm-input" placeholder="PO-001" value={form.referenceId} onChange={set('referenceId')} />
                </div>
              </div>

              {/* Tracking */}
              <div className="stm-section">Tracking (Optional)</div>
              <div className="stm-row">
                <div className="stm-field">
                  <label className="stm-label">Lot Number</label>
                  <input className="stm-input" placeholder="LOT-2026-001" value={form.lotNumber} onChange={set('lotNumber')} />
                </div>
                <div className="stm-field">
                  <label className="stm-label">Serial Number</label>
                  <input className="stm-input" placeholder="SN-123456" value={form.serialNumber} onChange={set('serialNumber')} />
                </div>
              </div>

              <div className="stm-field">
                <label className="stm-label">Notes</label>
                <textarea className="stm-textarea" placeholder="Transaction notes…" value={form.notes} onChange={set('notes')} />
              </div>
            </div>
            <div className="stm-ftr">
              <button type="button" className="stm-btn-cancel" onClick={onClose}>Cancel</button>
              <button type="submit" className="stm-btn-save" disabled={submitting}>
                {submitting ? 'Posting…' : 'Post Transaction'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

type TabType = 'transactions' | 'balance';

export default function StockTransactionsPage() {
  const [tab,          setTab]          = useState<TabType>('transactions');
  const [transactions, setTransactions] = useState<StockTransaction[]>([]);
  const [balance,      setBalance]      = useState<StockBalance[]>([]);
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
      const [txs, bal, its, whs] = await Promise.all([
        stockTransactionsApi.getAll(),
        stockTransactionsApi.getBalance(),
        itemsApi.getAll(),
        warehousesApi.getAll(),
      ]);
      setTransactions(txs);
      setBalance(bal);
      setItems(its);
      setWarehouses(whs);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load data.';
      setError(message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filteredTx = transactions.filter(tx => {
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

  const filteredBalance = balance.filter(b => {
    const q = search.toLowerCase();
    return !q ||
      (b.item?.name ?? '').toLowerCase().includes(q) ||
      (b.item?.code ?? '').toLowerCase().includes(q) ||
      (b.warehouse?.name ?? '').toLowerCase().includes(q);
  });

  return (
    <ERPShell breadcrumbs={['Home', 'Inventory', 'Stock Transactions']} title="Stock">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap');
        .st-page { padding: 0 18px 24px; }

        /* Tabs */
        .st-tabs { display:flex; gap:0; margin-bottom:14px; border-bottom:0.5px solid rgba(255,255,255,0.08); }
        .st-tab {
          padding:8px 16px; font-size:12px; font-weight:500; cursor:pointer;
          color:rgba(255,255,255,0.4); border-bottom:2px solid transparent;
          transition:color 0.15s, border-color 0.15s; user-select:none;
          font-family:'IBM Plex Sans',sans-serif;
        }
        .st-tab:hover { color:rgba(255,255,255,0.7); }
        .st-tab-active { color:#fb923c !important; border-bottom-color:#fb923c !important; }

        /* Toolbar */
        .st-toolbar { display:flex; align-items:center; gap:10px; margin-bottom:14px; flex-wrap:wrap; }
        .st-search {
          background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.09);
          border-radius:7px; padding:7px 12px; font-size:12px;
          font-family:'IBM Plex Sans',sans-serif; color:#e2dfd8; outline:none; width:240px;
          transition:border-color 0.2s;
        }
        .st-search::placeholder { color:rgba(255,255,255,0.2); }
        .st-search:focus { border-color:rgba(251,146,60,0.4); box-shadow:0 0 0 2px rgba(234,88,12,0.08); }
        .st-filter {
          background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.09);
          border-radius:7px; padding:7px 12px; font-size:12px;
          font-family:'IBM Plex Sans',sans-serif; color:#e2dfd8; outline:none;
        }
        .st-filter option { background:#0e0b1a; color:#f1ede8; }
        .st-btn-new {
          display:flex; align-items:center; gap:6px; margin-left:auto;
          background:linear-gradient(135deg,#c2410c,#ea580c,#f97316);
          border:none; border-radius:7px; padding:7px 14px;
          font-size:12px; font-weight:500; font-family:'IBM Plex Sans',sans-serif;
          color:white; cursor:pointer; box-shadow:0 3px 12px rgba(234,88,12,0.3);
          transition:opacity 0.15s, transform 0.15s; flex-shrink:0;
        }
        .st-btn-new:hover { opacity:0.88; transform:translateY(-1px); }
        .st-btn-new svg { width:13px; height:13px; display:block; flex-shrink:0; }

        /* Table */
        .st-wrap { background:rgba(10,7,18,0.7); border:0.5px solid rgba(251,146,60,0.12); border-radius:10px; overflow:hidden; }
        .st-table { width:100%; border-collapse:collapse; }
        .st-table thead th {
          padding:9px 14px; font-size:10px; font-weight:500;
          letter-spacing:0.1em; text-transform:uppercase; color:rgba(251,146,60,0.55);
          background:rgba(251,146,60,0.05); border-bottom:0.5px solid rgba(255,255,255,0.06);
          text-align:left; white-space:nowrap;
        }
        .st-table tbody td {
          padding:10px 14px; border-bottom:0.5px solid rgba(255,255,255,0.04);
          vertical-align:middle; font-size:13px;
        }
        .st-table tbody tr:last-child td { border-bottom:none; }
        .st-table tbody tr:hover td { background:rgba(251,146,60,0.03); }
        .st-code  { font-family:'IBM Plex Mono',monospace; font-size:12px; color:#fb923c; }
        .st-name  { color:#e2dfd8; font-weight:500; }
        .st-muted { color:rgba(255,255,255,0.45); font-size:12px; }
        .st-qty-pos { font-family:'IBM Plex Mono',monospace; font-size:13px; color:#4ade80; font-weight:500; }
        .st-qty-neg { font-family:'IBM Plex Mono',monospace; font-size:13px; color:#f87171; font-weight:500; }
        .st-qty-neu { font-family:'IBM Plex Mono',monospace; font-size:13px; color:#fbbf24; font-weight:500; }
        .st-empty, .st-loading {
          text-align:center; padding:52px 24px; color:rgba(255,255,255,0.25); font-size:13px;
          display:flex; flex-direction:column; align-items:center; gap:10px;
        }
        .st-spinner {
          width:18px; height:18px; border-radius:50%;
          border:2px solid rgba(251,146,60,0.2); border-top-color:#fb923c;
          animation:st-spin 0.7s linear infinite; flex-shrink:0;
        }
        @keyframes st-spin { to { transform:rotate(360deg); } }
        .st-footer { font-size:11px; color:rgba(255,255,255,0.22); padding:8px 14px; border-top:0.5px solid rgba(255,255,255,0.04); }
        .st-error { background:rgba(239,68,68,0.08); border:0.5px solid rgba(239,68,68,0.2); border-radius:8px; padding:10px 14px; margin-bottom:14px; font-size:13px; color:#fca5a5; }

        /* Balance table qty */
        .st-bal-qty { font-family:'IBM Plex Mono',monospace; font-size:14px; font-weight:500; color:#f1ede8; }
        .st-bal-low { color:#f87171; }
      `}</style>

      <div className="st-page">

        {/* Tabs */}
        <div className="st-tabs">
          <div className={`st-tab${tab === 'transactions' ? ' st-tab-active' : ''}`} onClick={() => setTab('transactions')}>
            Transactions {transactions.length > 0 && <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.6 }}>({transactions.length})</span>}
          </div>
          <div className={`st-tab${tab === 'balance' ? ' st-tab-active' : ''}`} onClick={() => setTab('balance')}>
            Stock Balance {balance.length > 0 && <span style={{ marginLeft: 6, fontSize: 10, opacity: 0.6 }}>({balance.length})</span>}
          </div>
        </div>

        {/* Toolbar */}
        <div className="st-toolbar">
          <input
            className="st-search"
            placeholder={tab === 'transactions' ? 'Search item, warehouse, reference…' : 'Search item or warehouse…'}
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {tab === 'transactions' && (
            <select className="st-filter" value={txTypeFilter} onChange={e => setTxTypeFilter(e.target.value as TransactionType | '')}>
              <option value="">All Types</option>
              {TX_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          )}
          <button className="st-btn-new" onClick={() => setModalOpen(true)}>
            <svg viewBox="0 0 13 13" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
              <line x1="6.5" y1="1" x2="6.5" y2="12" />
              <line x1="1" y1="6.5" x2="12" y2="6.5" />
            </svg>
            New Transaction
          </button>
        </div>

        {error && <div className="st-error">{error}</div>}

        {/* Transactions tab */}
        {tab === 'transactions' && (
          <div className="st-wrap">
            {loading ? (
              <div className="st-loading"><div className="st-spinner" />Loading transactions…</div>
            ) : filteredTx.length === 0 ? (
              <div className="st-empty">
                {search || txTypeFilter ? 'No transactions match your filters.' : 'No transactions yet. Post your first one.'}
              </div>
            ) : (
              <>
                <table className="st-table">
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Item</th>
                      <th>Warehouse</th>
                      <th>Qty</th>
                      <th>UOM</th>
                      <th>Reference</th>
                      <th>Date</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTx.map(tx => {
                      const c = getTxConfig(tx.transactionType);
                      const qtyClass = tx.quantity > 0 ? 'st-qty-pos' : tx.quantity < 0 ? 'st-qty-neg' : 'st-qty-neu';
                      return (
                        <tr key={tx.id}>
                          <td><TxBadge type={tx.transactionType} /></td>
                          <td>
                            <span className="st-code">{tx.item?.code ?? '—'}</span>
                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>{tx.item?.name}</div>
                          </td>
                          <td><span className="st-muted">{tx.warehouse?.name ?? '—'}</span></td>
                          <td>
                            <span className={qtyClass}>
                              {tx.quantity > 0 ? `+${tx.quantity}` : tx.quantity}
                            </span>
                          </td>
                          <td><span className="st-muted">{tx.uom}</span></td>
                          <td>
                            {tx.referenceType ? (
                              <div>
                                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{tx.referenceType}</div>
                                <div style={{ fontSize: 11, color: '#fb923c', fontFamily: 'IBM Plex Mono, monospace' }}>{tx.referenceId}</div>
                              </div>
                            ) : <span className="st-muted">—</span>}
                          </td>
                          <td><span className="st-muted">{fmtDateTime(tx.transactionDate)}</span></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="st-footer">
                  {filteredTx.length} of {transactions.length} transaction{transactions.length !== 1 ? 's' : ''}
                </div>
              </>
            )}
          </div>
        )}

        {/* Balance tab */}
        {tab === 'balance' && (
          <div className="st-wrap">
            {loading ? (
              <div className="st-loading"><div className="st-spinner" />Loading stock balance…</div>
            ) : filteredBalance.length === 0 ? (
              <div className="st-empty">No stock balance data yet.</div>
            ) : (
              <>
                <table className="st-table">
                  <thead>
                    <tr>
                      <th>Item</th>
                      <th>Warehouse</th>
                      <th style={{ textAlign: 'right' }}>Qty on Hand</th>
                      <th>UOM</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredBalance.map((b, idx) => (
                      <tr key={idx}>
                        <td>
                          <span className="st-code">{b.item?.code ?? '—'}</span>
                          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 1 }}>{b.item?.name}</div>
                        </td>
                        <td><span className="st-muted">{b.warehouse?.name ?? '—'}</span></td>
                        <td style={{ textAlign: 'right' }}>
                          <span className={`st-bal-qty${b.quantity <= 0 ? ' st-bal-low' : ''}`}>
                            {b.quantity}
                          </span>
                        </td>
                        <td><span className="st-muted">{b.uom}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="st-footer">
                  {filteredBalance.length} position{filteredBalance.length !== 1 ? 's' : ''}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      <CreateTxModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={fetchAll}
        items={items}
        warehouses={warehouses}
      />
    </ERPShell>
  );
}