"use client";

import { useEffect, useState, useCallback, useMemo } from 'react';
import ERPShell                                        from '@/components/layout/ERPShell';
import { ERPTable, ERPColumn }                         from '@/components/ui/ERPTable';
import { ERPFilterBar, ERPFilter, useERPFilters, applyERPFilters } from '@/components/ui/ERPFilterBar';
import { itemsApi }                                    from '@/lib/api/items';
import { warehousesApi }                               from '@/lib/api/warehouses';
import { stockTransactionsApi }                        from '@/lib/api/stock-transactions';
import { CreateStockTransactionDto, Item, Warehouse }  from '@/lib/api/types';

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
  referenceDisplay?: string;
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

// ─── Constants ────────────────────────────────────────────────────────────────

const TX_TYPES = [
  { value: 'receipt',    label: 'Receipt',    color: '#4ade80', bg: 'rgba(74,222,128,0.1)',   border: 'rgba(74,222,128,0.2)',   sign: '+' },
  { value: 'issue',      label: 'Issue',      color: '#f87171', bg: 'rgba(248,113,113,0.1)',  border: 'rgba(248,113,113,0.2)',  sign: '−' },
  { value: 'transfer',   label: 'Transfer',   color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',   border: 'rgba(96,165,250,0.2)',   sign: '⇄' },
  { value: 'adjustment', label: 'Adjustment', color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',   border: 'rgba(251,191,36,0.2)',   sign: '±' },
];

const ITEM_TYPE_CFG: Record<string, { color: string; label: string }> = {
  finished_good: { color: '#4ade80', label: 'Finished Good' },
  raw_material:  { color: '#60a5fa', label: 'Raw Material'  },
  consumable:    { color: '#fbbf24', label: 'Consumable'    },
  service:       { color: 'rgba(255,255,255,0.35)', label: 'Service' },
};

const EMPTY_FORM: CreateStockTransactionDto = {
  transactionType: 'adjustment', itemId: '', warehouseId: '',
  quantity: 0, uom: 'PCS', unitCost: undefined,
  referenceId: '', referenceType: '', lotNumber: '', serialNumber: '',
  notes: '', transactionDate: '',
};

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

// Determine the effective sign of a row for display purposes.
// For adjustments: use movementValue sign (negative = shortage/loss).
// For issues: always negative. For receipts/transfers: always positive.
function getEffectiveSign(r: LedgerRow): number {
  if (r.movementType === 'adjustment' && r.movementValue !== undefined && r.movementValue !== null) {
    return r.movementValue < 0 ? -1 : r.movementValue > 0 ? 1 : 0;
  }
  return r.signedQuantity >= 0 ? 1 : -1;
}

function TxBadge({ type }: { type: string }) {
  const c = TX_TYPES.find(t => t.value === type) ?? { color: '#e2dfd8', bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.1)', sign: '·', label: type };
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 500, color: c.color, background: c.bg, border: `0.5px solid ${c.border}`, whiteSpace: 'nowrap' }}>
      <span style={{ fontSize: 11 }}>{c.sign}</span>{c.label}
    </span>
  );
}

// ─── Create Transaction Modal ─────────────────────────────────────────────────

function CreateTxModal({ open, onClose, onSaved, items, warehouses }: {
  open: boolean; onClose: () => void; onSaved: () => void;
  items: Item[]; warehouses: Warehouse[];
}) {
  const [form, setForm] = useState<CreateStockTransactionDto>(EMPTY_FORM);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) { setForm(EMPTY_FORM); setError(''); }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.itemId)      { setError('Item is required.');      return; }
    if (!form.warehouseId) { setError('Warehouse is required.'); return; }
    if (!form.quantity || form.quantity === 0) { setError('Quantity must be non-zero.'); return; }
    setBusy(true); setError('');
    try {
      await stockTransactionsApi.create(form);
      onSaved(); onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Operation failed.');
    } finally { setBusy(false); }
  };

  if (!open) return null;

  const I: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.1)',
    borderRadius: 7, padding: '8px 12px', fontSize: 12,
    fontFamily: "'IBM Plex Sans', sans-serif", color: '#f1ede8',
    outline: 'none', width: '100%',
  };
  const L: React.CSSProperties = {
    fontSize: 10, fontWeight: 500, letterSpacing: '0.08em',
    textTransform: 'uppercase', color: 'rgba(251,146,60,0.6)',
    fontFamily: "'IBM Plex Sans', sans-serif", marginBottom: 4,
  };
  const SEC: React.CSSProperties = {
    fontSize: 9, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.2)', paddingTop: 8,
    borderTop: '0.5px solid rgba(255,255,255,0.06)', marginTop: 2,
  };

  const selectedItem = items.find(i => i.id === form.itemId);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#0e0b1a', border: '0.5px solid rgba(251,146,60,0.2)', borderRadius: 14, width: '100%', maxWidth: 520, maxHeight: '90vh', display: 'flex', flexDirection: 'column', position: 'relative', boxShadow: '0 24px 60px rgba(0,0,0,0.7)' }}>
        <div style={{ position: 'absolute', top: 0, left: 30, right: 30, height: 1, background: 'linear-gradient(90deg,transparent,rgba(251,146,60,0.4),transparent)', pointerEvents: 'none' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 20px 12px', flexShrink: 0, borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: '#f1ede8', fontFamily: "'IBM Plex Sans', sans-serif" }}>Manual Stock Adjustment</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>For PO receipts, use the <span style={{ color: '#60a5fa' }}>Goods Receipts</span> module</div>
          </div>
          <button onClick={onClose} style={{ width: 26, height: 26, borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.45)', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        </div>
        <form onSubmit={handleSubmit} style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
          <div style={{ padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '0.5px solid rgba(239,68,68,0.25)', borderRadius: 7, padding: '8px 12px', fontSize: 12, color: '#fca5a5' }}>{error}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <label style={L}>Transaction Type *</label>
                <select style={{ ...I, cursor: 'pointer' }} value={form.transactionType} onChange={e => setForm(f => ({ ...f, transactionType: e.target.value }))}>
                  {TX_TYPES.map(t => <option key={t.value} value={t.value}>{t.sign} {t.label}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <label style={L}>Date</label>
                <input style={I} type="date" value={form.transactionDate} onChange={e => setForm(f => ({ ...f, transactionDate: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <label style={L}>Item *</label>
              <select style={{ ...I, cursor: 'pointer' }} value={form.itemId} onChange={e => { const it = items.find(i => i.id === e.target.value); setForm(f => ({ ...f, itemId: e.target.value, uom: it?.baseUom ?? f.uom })); }}>
                <option value="">— Select item —</option>
                {items.map(i => <option key={i.id} value={i.id}>{i.code} — {i.name}</option>)}
              </select>
              {selectedItem && (
                <div style={{ display: 'flex', gap: 6, marginTop: 5 }}>
                  <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 8, color: ITEM_TYPE_CFG[selectedItem.itemType]?.color ?? '#e2dfd8', background: `${ITEM_TYPE_CFG[selectedItem.itemType]?.color ?? '#e2dfd8'}15`, border: `0.5px solid ${ITEM_TYPE_CFG[selectedItem.itemType]?.color ?? '#e2dfd8'}30` }}>
                    {ITEM_TYPE_CFG[selectedItem.itemType]?.label ?? selectedItem.itemType}
                  </span>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>Base UOM: {selectedItem.baseUom}</span>
                </div>
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <label style={L}>Warehouse *</label>
              <select style={{ ...I, cursor: 'pointer' }} value={form.warehouseId} onChange={e => setForm(f => ({ ...f, warehouseId: e.target.value }))}>
                <option value="">— Select warehouse —</option>
                {warehouses.map(w => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
              </select>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <label style={L}>Quantity *</label>
                <input style={I} type="number" step="0.001" placeholder="100" value={form.quantity || ''} onChange={e => setForm(f => ({ ...f, quantity: e.target.value === '' ? 0 : Number(e.target.value) }))} required />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <label style={L}>UOM *</label>
                <input style={I} placeholder="PCS" value={form.uom} onChange={e => setForm(f => ({ ...f, uom: e.target.value }))} required />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <label style={L}>Unit Cost</label>
                <input style={I} type="number" step="0.0001" placeholder="0.00" value={form.unitCost ?? ''} onChange={e => setForm(f => ({ ...f, unitCost: e.target.value === '' ? undefined : Number(e.target.value) }))} />
              </div>
            </div>
            {form.transactionType === 'issue' && (
              <div style={{ fontSize: 11, color: 'rgba(248,113,113,0.7)', background: 'rgba(248,113,113,0.06)', border: '0.5px solid rgba(248,113,113,0.2)', borderRadius: 6, padding: '6px 10px' }}>
                Enter a positive number — the system will deduct from stock automatically.
              </div>
            )}
            <div style={SEC}>Reference (Optional)</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <label style={L}>Reference Type</label>
                <input style={I} placeholder="purchase_order" value={form.referenceType} onChange={e => setForm(f => ({ ...f, referenceType: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <label style={L}>Reference ID</label>
                <input style={I} placeholder="PO-2026-001" value={form.referenceId} onChange={e => setForm(f => ({ ...f, referenceId: e.target.value }))} />
              </div>
            </div>
            <div style={SEC}>Lot / Serial (Optional)</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <label style={L}>Lot Number</label>
                <input style={I} placeholder="LOT-2026-001" value={form.lotNumber} onChange={e => setForm(f => ({ ...f, lotNumber: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <label style={L}>Serial Number</label>
                <input style={I} placeholder="SN-123456" value={form.serialNumber} onChange={e => setForm(f => ({ ...f, serialNumber: e.target.value }))} />
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <label style={L}>Notes</label>
              <textarea style={{ ...I, resize: 'vertical', minHeight: 56 } as React.CSSProperties} placeholder="Reason for adjustment, cycle count discrepancy, etc." value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px 16px', borderTop: '0.5px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
            <button type="button" onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '8px 16px', fontSize: 12, fontFamily: "'IBM Plex Sans', sans-serif", color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>Cancel</button>
            <button type="submit" disabled={busy} style={{ background: 'linear-gradient(135deg,#c2410c,#ea580c,#f97316)', border: 'none', borderRadius: 7, padding: '8px 20px', fontSize: 12, fontWeight: 500, fontFamily: "'IBM Plex Sans', sans-serif", color: 'white', cursor: 'pointer', boxShadow: '0 3px 12px rgba(234,88,12,0.35)', opacity: busy ? 0.5 : 1 }}>
              {busy ? 'Posting…' : 'Post Transaction'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Column definitions ───────────────────────────────────────────────────────

const COLUMNS: ERPColumn<LedgerRow>[] = [
  {
    key: 'movementNumber', header: 'Movement #', width: 130, sortable: true,
    value: r => r.movementNumber,
    render: r => <span style={{ ...MONO, fontSize: 11, color: '#fb923c' }}>{r.movementNumber}</span>,
  },
  {
    key: 'movementType', header: 'Type', width: 120, sortable: true,
    value: r => r.movementType,
    render: r => <TxBadge type={r.movementType} />,
  },
  {
    key: 'movementDate', header: 'Date', width: 160, sortable: true,
    value: r => r.movementDate,
    render: r => <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{fmtDate(r.movementDate)}</span>,
  },
  {
    key: 'item', header: 'Item', sortable: true,
    value: r => r.item?.code ?? '',
    render: r => (
      <div>
        <span style={{ ...MONO, fontSize: 11, color: '#f1ede8', fontWeight: 500 }}>{r.item?.code ?? '—'}</span>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>{r.item?.name}</div>
      </div>
    ),
  },
  {
    key: 'itemType', header: 'Category', width: 120, sortable: true,
    value: r => r.item?.itemType ?? '',
    render: r => {
      const cfg = ITEM_TYPE_CFG[r.item?.itemType ?? ''];
      return cfg ? (
        <span style={{ fontSize: 9, padding: '1px 6px', borderRadius: 10, color: cfg.color, background: `${cfg.color}15`, border: `0.5px solid ${cfg.color}30`, whiteSpace: 'nowrap' }}>{cfg.label}</span>
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
    key: 'signedQuantity', header: 'Qty (Storage)', width: 120, align: 'right', sortable: true,
    value: r => r.signedQuantity,
    render: r => {
      const sign  = getEffectiveSign(r);
      const color = sign > 0 ? '#4ade80' : sign < 0 ? '#f87171' : '#fbbf24';
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
    key: 'purchaseQty', header: 'Qty (Purchase)', width: 120, align: 'right', sortable: true,
    value: r => r.purchaseQty ?? r.quantity,
    render: r => {
      const pQty = r.purchaseQty ?? r.quantity;
      const pUom = r.purchaseUom ?? r.uom;
      const sign  = getEffectiveSign(r);
      const color = sign > 0 ? '#4ade80' : sign < 0 ? '#f87171' : '#fbbf24';
      const prefix = sign > 0 ? '+' : sign < 0 ? '−' : '±';
      return (
        <div style={{ textAlign: 'right' }}>
          <span style={{ ...MONO, fontSize: 12, fontWeight: 500, color }}>
            {prefix}{fmtQty(pQty)}
          </span>
          <div style={{ marginTop: 2 }}>
            <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 8, color: '#fb923c', background: 'rgba(251,146,60,0.1)', border: '0.5px solid rgba(251,146,60,0.2)', ...MONO }}>{pUom}</span>
          </div>
        </div>
      );
    },
  },
  {
    key: 'unitCost', header: 'Unit Cost', width: 110, align: 'right', sortable: true,
    value: r => r.unitCost,
    render: r => <span style={{ ...MONO, fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{r.unitCost > 0 ? fmtAmt(r.unitCost) : '—'}</span>,
  },
  {
    key: 'movementValue', header: 'Value', width: 130, align: 'right', sortable: true,
    value: r => r.movementValue ?? r.totalValue,
    render: r => {
      const val   = r.movementValue ?? r.totalValue;
      const isPos = val > 0;
      const isNeg = val < 0;
      const color = isPos ? '#4ade80' : isNeg ? '#f87171' : '#fbbf24';
      return (
        <span style={{ ...MONO, fontSize: 12, fontWeight: 500, color }}>
          {val !== 0 ? (isPos ? '+' : '−') + fmtAmt(Math.abs(val)) : '—'}
        </span>
      );
    },
  },
  {
    key: 'referenceNumber', header: 'Reference', width: 150, sortable: true,
    value: r => r.referenceDisplay ?? r.referenceNumber ?? '',
    render: r => {
      const ref = r.referenceDisplay ?? r.referenceNumber ?? '—';
      return (
        <div>
          {r.referenceType && (
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 1 }}>
              {r.referenceType.replace(/_/g, ' ')}
            </div>
          )}
          <span style={{ ...MONO, fontSize: 11, color: ref !== '—' ? '#fb923c' : 'rgba(255,255,255,0.2)' }}>{ref}</span>
        </div>
      );
    },
  },
];

// ─── Filter definitions ───────────────────────────────────────────────────────

function buildFilters(warehouses: Warehouse[]): ERPFilter<LedgerRow>[] {
  return [
    {
      key: 'movementType', label: 'Type', type: 'multiselect',
      options: TX_TYPES.map(t => ({ value: t.value, label: t.label, color: t.color, bg: t.bg, border: t.border })),
      filterFn: (row, val) => (val as string[]).includes(row.movementType),
    },
    {
      key: 'warehouseId', label: 'Warehouse', type: 'searchselect',
      placeholder: 'All warehouses', selectWidth: 200,
      options: warehouses.map(w => ({ value: w.id, label: w.code, sublabel: w.name })),
      filterFn: (row, val) => row.warehouse?.id === String(val),
    },
    {
      key: 'itemType', label: 'Category', type: 'multiselect',
      options: Object.entries(ITEM_TYPE_CFG).map(([v, c]) => ({ value: v, label: c.label, color: c.color })),
      filterFn: (row, val) => (val as string[]).includes(row.item?.itemType ?? ''),
    },
  ];
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StockTransactionsPage() {
  const [rows,       setRows]       = useState<LedgerRow[]>([]);
  const [items,      setItems]      = useState<Item[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [modalOpen,  setModalOpen]  = useState(false);
  const [typeCard,   setTypeCard]   = useState('');

  const filters = useMemo(() => buildFilters(warehouses), [warehouses]);
  const { values, setValue, reset, activeCount } = useERPFilters(filters);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [ledger, its, whs] = await Promise.all([
        stockTransactionsApi.getLedger(),
        itemsApi.getAll(),
        warehousesApi.getAll(),
      ]);
      const data = ledger as { rows: LedgerRow[]; totals: any; count: number };
      setRows(data.rows ?? []);
      setItems(its as Item[]);
      setWarehouses(whs as Warehouse[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const afterFilters = useMemo(() => applyERPFilters(rows, filters, values), [rows, filters, values]);
  const filtered     = useMemo(() => typeCard ? afterFilters.filter(r => r.movementType === typeCard) : afterFilters, [afterFilters, typeCard]);

  const typeCounts = useMemo(() =>
    TX_TYPES.reduce((acc, t) => { acc[t.value] = rows.filter(r => r.movementType === t.value).length; return acc; }, {} as Record<string, number>),
  [rows]);

  const totals = useMemo(() => ({
    totalIn:       filtered.filter(r => r.signedQuantity > 0).reduce((s, r) => s + r.quantity, 0),
    totalOut:      filtered.filter(r => r.signedQuantity < 0).reduce((s, r) => s + r.quantity, 0),
    totalInValue:  filtered.filter(r => (r.movementValue ?? r.totalValue) > 0).reduce((s, r) => s + (r.movementValue ?? r.totalValue), 0),
    totalOutValue: filtered.filter(r => (r.movementValue ?? r.totalValue) < 0).reduce((s, r) => s + Math.abs(r.movementValue ?? r.totalValue), 0),
    netValue:      filtered.reduce((s, r) => s + (r.movementValue ?? r.totalValue), 0),
  }), [filtered]);

  return (
    <ERPShell breadcrumbs={['Home', 'Inventory', 'Stock Transactions']} title="Stock Transactions">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&display=swap');
        .st-page   { padding: 0 18px 16px; display: flex; flex-direction: column; gap: 10px; height: 100%; overflow: hidden; }
        .st-pills  { display: flex; gap: 6px; flex-wrap: wrap; flex-shrink: 0; }
        .st-pill   { background: rgba(10,7,18,0.7); border-radius: 8px; padding: 6px 12px; display: flex; flex-direction: column; gap: 1px; cursor: pointer; transition: all 0.15s; min-width: 76px; }
        .st-pill-l { font-size: 9px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; }
        .st-pill-v { font-size: 20px; font-weight: 500; font-family: 'IBM Plex Mono', monospace; color: #f1ede8; }
        .st-totals { display: grid; grid-template-columns: repeat(5,1fr); gap: 6px; flex-shrink: 0; }
        .st-total  { background: rgba(10,7,18,0.7); border-radius: 8px; padding: 8px 12px; }
        .st-total-l{ font-size: 9px; font-weight: 500; letter-spacing: 0.08em; text-transform: uppercase; color: rgba(255,255,255,0.3); margin-bottom: 3px; }
        .st-total-v{ font-size: 13px; font-weight: 500; font-family: 'IBM Plex Mono', monospace; }
        .st-filters{ display: flex; align-items: flex-end; gap: 10px; flex-wrap: wrap; flex-shrink: 0; }
        .st-table  { flex: 1; min-height: 0; display: flex; flex-direction: column; }
        .st-error  { background: rgba(239,68,68,0.08); border: 0.5px solid rgba(239,68,68,0.2); border-radius: 8px; padding: 10px 14px; font-size: 13px; color: #fca5a5; flex-shrink: 0; }
        .st-btn-new{ display: inline-flex; align-items: center; gap: 6px; background: linear-gradient(135deg,#c2410c,#ea580c,#f97316); border: none; border-radius: 7px; padding: 7px 14px; font-size: 12px; font-weight: 500; font-family: 'IBM Plex Sans',sans-serif; color: white; cursor: pointer; box-shadow: 0 3px 12px rgba(234,88,12,0.3); }
      `}</style>

      <div className="st-page">
        {rows.length > 0 && (
          <div className="st-pills">
            {TX_TYPES.filter(t => typeCounts[t.value] > 0).map(t => (
              <div key={t.value} className="st-pill"
                style={{ border: `0.5px solid ${typeCard === t.value ? t.border : 'rgba(255,255,255,0.07)'}`, background: typeCard === t.value ? t.bg : 'rgba(10,7,18,0.7)' }}
                onClick={() => setTypeCard(prev => prev === t.value ? '' : t.value)}>
                <span className="st-pill-l" style={{ color: t.color }}>{t.sign} {t.label}</span>
                <span className="st-pill-v">{typeCounts[t.value]}</span>
              </div>
            ))}
            <div className="st-pill" style={{ border: `0.5px solid ${!typeCard ? 'rgba(251,146,60,0.3)' : 'rgba(255,255,255,0.07)'}` }} onClick={() => setTypeCard('')}>
              <span className="st-pill-l" style={{ color: 'rgba(251,146,60,0.6)' }}>All</span>
              <span className="st-pill-v" style={{ color: '#fb923c' }}>{rows.length}</span>
            </div>
          </div>
        )}

        {rows.length > 0 && (
          <div className="st-totals">
            {[
              { label: 'Total IN (qty)',  value: `+${new Intl.NumberFormat('en-US',{maximumFractionDigits:3}).format(totals.totalIn)}`,  color: '#4ade80', border: 'rgba(74,222,128,0.15)'  },
              { label: 'Total OUT (qty)', value: `−${new Intl.NumberFormat('en-US',{maximumFractionDigits:3}).format(totals.totalOut)}`, color: '#f87171', border: 'rgba(248,113,113,0.15)' },
              { label: 'IN Value',        value: fmtAmt(totals.totalInValue),  color: '#4ade80', border: 'rgba(74,222,128,0.1)'   },
              { label: 'OUT Value',       value: fmtAmt(totals.totalOutValue), color: '#f87171', border: 'rgba(248,113,113,0.1)'  },
              { label: 'Net Value',       value: fmtAmt(totals.netValue), color: totals.netValue >= 0 ? '#4ade80' : '#f87171', border: 'rgba(255,255,255,0.06)' },
            ].map(t => (
              <div key={t.label} className="st-total" style={{ border: `0.5px solid ${t.border}` }}>
                <div className="st-total-l">{t.label}</div>
                <div className="st-total-v" style={{ color: t.color }}>{t.value}</div>
              </div>
            ))}
          </div>
        )}

        {error && <div className="st-error">{error}</div>}

        <div className="st-filters">
          <ERPFilterBar filters={filters} values={values} onChange={setValue} onReset={reset} activeCount={activeCount + (typeCard ? 1 : 0)} />
          <button className="st-btn-new" style={{ alignSelf: 'flex-end', marginLeft: 'auto' }} onClick={() => setModalOpen(true)}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
              <line x1="6.5" y1="1" x2="6.5" y2="12"/><line x1="1" y1="6.5" x2="12" y2="6.5"/>
            </svg>
            New Adjustment
          </button>
        </div>

        <div className="st-table">
          <ERPTable<LedgerRow>
            columns={COLUMNS}
            data={filtered}
            rowKey={r => r.id}
            loading={loading}
            exportFilename={`stock-transactions-${new Date().toISOString().split('T')[0]}`}
            emptyMessage="No stock transactions yet."
            defaultPageSize={25}
            maxHeight="calc(100vh - 430px)"
            toolbarLeft={
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: "'IBM Plex Mono', monospace" }}>
                {filtered.length} of {rows.length} movements
              </span>
            }
          />
        </div>
      </div>

      <CreateTxModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={fetchAll} items={items} warehouses={warehouses} />
    </ERPShell>
  );
}