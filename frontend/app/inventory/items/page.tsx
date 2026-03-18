"use client";

import { useEffect, useState, useCallback } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import { itemsApi } from '@/lib/api/items';
import { Item, CreateItemDto, ItemType, ValuationMethod } from '@/lib/api/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const ITEM_TYPES: { value: ItemType; label: string; color: string; bg: string; border: string }[] = [
  { value: 'raw_material',    label: 'Raw Material',    color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',   border: 'rgba(96,165,250,0.2)' },
  { value: 'finished_good',   label: 'Finished Good',   color: '#4ade80', bg: 'rgba(74,222,128,0.1)',   border: 'rgba(74,222,128,0.2)' },
  { value: 'work_in_progress',label: 'Work in Progress',color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',   border: 'rgba(251,191,36,0.2)' },
  { value: 'service',         label: 'Service',         color: '#a78bfa', bg: 'rgba(167,139,250,0.1)',  border: 'rgba(167,139,250,0.2)' },
];

const EMPTY_FORM: CreateItemDto = {
  code: '', name: '', itemType: 'raw_material', baseUom: 'PCS',
  description: '', valuationMethod: 'average',
  standardCost: undefined, leadTimeDays: undefined,
  safetyStock: undefined, reorderPoint: undefined, reorderQuantity: undefined,
  isStockable: true, isPurchasable: true, isSaleable: true,
  isManufacturable: false, isLotTracked: false, isSerialTracked: false,
};

function getTypeConfig(t: ItemType) {
  return ITEM_TYPES.find(x => x.value === t) ?? ITEM_TYPES[0];
}

function fmt(v?: string | number | null) {
  if (v === undefined || v === null || v === '') return '—';
  return String(v);
}

// ─── Badges ───────────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: ItemType }) {
  const c = getTypeConfig(type);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 500,
      color: c.color, background: c.bg, border: `0.5px solid ${c.border}`,
      whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
      {c.label}
    </span>
  );
}

function BoolDot({ value }: { value: boolean }) {
  return (
    <span style={{
      width: 7, height: 7, borderRadius: '50%', display: 'inline-block',
      background: value ? '#4ade80' : 'rgba(255,255,255,0.15)',
      boxShadow: value ? '0 0 4px rgba(74,222,128,0.4)' : 'none',
    }} />
  );
}

// ─── Toggle checkbox ──────────────────────────────────────────────────────────

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer',
      fontSize: 12, color: checked ? '#e2dfd8' : 'rgba(255,255,255,0.4)',
      transition: 'color 0.15s', userSelect: 'none',
    }}>
      <div
        onClick={() => onChange(!checked)}
        style={{
          width: 32, height: 18, borderRadius: 9, flexShrink: 0,
          background: checked ? 'rgba(234,88,12,0.8)' : 'rgba(255,255,255,0.1)',
          border: `0.5px solid ${checked ? 'rgba(251,146,60,0.5)' : 'rgba(255,255,255,0.15)'}`,
          position: 'relative', transition: 'background 0.2s, border-color 0.2s', cursor: 'pointer',
        }}
      >
        <div style={{
          position: 'absolute', top: 2, left: checked ? 16 : 2,
          width: 13, height: 13, borderRadius: '50%',
          background: '#fff', transition: 'left 0.2s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }} />
      </div>
      {label}
    </label>
  );
}

// ─── Statistics bar ───────────────────────────────────────────────────────────

interface ItemStatistics {
  total: number;
  byType: { type: ItemType; count: number }[];
  stockable: number;
  purchasable: number;
  saleable: number;
}

function StatsBar({ stats }: { stats: ItemStatistics }) {
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
      {ITEM_TYPES.map(t => {
        const count = stats.byType.find(b => b.type === t.value)?.count ?? 0;
        return (
          <div key={t.value} style={{
            background: 'rgba(10,7,18,0.7)',
            border: `0.5px solid ${t.border}`,
            borderRadius: 8, padding: '8px 14px',
            display: 'flex', flexDirection: 'column', gap: 2, minWidth: 120,
          }}>
            <span style={{ fontSize: 10, color: t.color, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500 }}>{t.label}</span>
            <span style={{ fontSize: 22, fontWeight: 500, color: '#f1ede8', fontFamily: "'IBM Plex Mono', monospace" }}>{count}</span>
          </div>
        );
      })}
      <div style={{
        background: 'rgba(10,7,18,0.7)',
        border: '0.5px solid rgba(251,146,60,0.2)',
        borderRadius: 8, padding: '8px 14px',
        display: 'flex', flexDirection: 'column', gap: 2, minWidth: 80,
      }}>
        <span style={{ fontSize: 10, color: 'rgba(251,146,60,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500 }}>Total</span>
        <span style={{ fontSize: 22, fontWeight: 500, color: '#fb923c', fontFamily: "'IBM Plex Mono', monospace" }}>{stats.total}</span>
      </div>
      <div style={{
        background: 'rgba(10,7,18,0.7)',
        border: '0.5px solid rgba(255,255,255,0.08)',
        borderRadius: 8, padding: '8px 14px',
        display: 'flex', flexDirection: 'column', gap: 6, minWidth: 160,
      }}>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500 }}>Properties</span>
        <div style={{ display: 'flex', gap: 10, fontSize: 11 }}>
          <span style={{ color: '#4ade80' }}>S {stats.stockable}</span>
          <span style={{ color: '#60a5fa' }}>P {stats.purchasable}</span>
          <span style={{ color: '#a78bfa' }}>Sa {stats.saleable}</span>
        </div>
      </div>
    </div>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function ItemModal({ open, onClose, onSaved, initial }: {
  open: boolean; onClose: () => void; onSaved: () => void; initial: Item | null;
}) {
  const [form, setForm] = useState<CreateItemDto>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setError('');
      setForm(initial ? {
        code:              initial.code,
        name:              initial.name,
        itemType:          initial.itemType,
        baseUom:           initial.baseUom,
        description:       initial.description       ?? '',
        valuationMethod:   initial.valuationMethod,
        standardCost:      initial.standardCost,
        leadTimeDays:      initial.leadTimeDays,
        safetyStock:       initial.safetyStock,
        reorderPoint:      initial.reorderPoint,
        reorderQuantity:   initial.reorderQuantity,
        isStockable:       initial.isStockable,
        isPurchasable:     initial.isPurchasable,
        isSaleable:        initial.isSaleable,
        isManufacturable:  initial.isManufacturable,
        isLotTracked:      initial.isLotTracked,
        isSerialTracked:   initial.isSerialTracked,
      } : EMPTY_FORM);
    }
  }, [open, initial]);

  const set = (key: keyof CreateItemDto) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }));

  const setNum = (key: keyof CreateItemDto) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value === '' ? undefined : Number(e.target.value) }));

  const setBool = (key: keyof CreateItemDto) => (v: boolean) =>
    setForm(f => ({ ...f, [key]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code.trim() || !form.name.trim()) { setError('Code and name are required.'); return; }
    setSubmitting(true); setError('');
    try {
      if (initial) await itemsApi.update(initial.id, form);
      else          await itemsApi.create(form);
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
        .im-overlay {
          position:fixed; inset:0; z-index:400;
          background:rgba(0,0,0,0.65); backdrop-filter:blur(4px);
          display:flex; align-items:center; justify-content:center; padding:24px;
        }
        .im-box {
          background:#0e0b1a; border:0.5px solid rgba(251,146,60,0.2);
          border-radius:14px; width:100%; max-width:580px;
          max-height:92vh; overflow-y:auto; position:relative;
          box-shadow:0 24px 60px rgba(0,0,0,0.7);
        }
        .im-box::before {
          content:''; position:absolute; top:0; left:30px; right:30px; height:1px;
          background:linear-gradient(90deg,transparent,rgba(251,146,60,0.4),transparent);
        }
        .im-hdr {
          display:flex; align-items:center; justify-content:space-between;
          padding:16px 20px 12px; border-bottom:0.5px solid rgba(255,255,255,0.06);
          position:sticky; top:0; background:#0e0b1a; z-index:1;
        }
        .im-title { font-size:14px; font-weight:500; color:#f1ede8; font-family:'IBM Plex Sans',sans-serif; }
        .im-close {
          width:24px; height:24px; border-radius:6px; background:rgba(255,255,255,0.06);
          border:none; cursor:pointer; color:rgba(255,255,255,0.45); font-size:16px;
          display:flex; align-items:center; justify-content:center; transition:background 0.15s;
        }
        .im-close:hover { background:rgba(255,255,255,0.1); color:rgba(255,255,255,0.8); }
        .im-body { padding:16px 20px; display:flex; flex-direction:column; gap:12px; }
        .im-row  { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
        .im-row3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; }
        .im-field { display:flex; flex-direction:column; gap:5px; }
        .im-label {
          font-size:11px; font-weight:500; letter-spacing:0.08em; text-transform:uppercase;
          color:rgba(251,146,60,0.6); font-family:'IBM Plex Sans',sans-serif;
        }
        .im-input, .im-select, .im-textarea {
          background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.1);
          border-radius:7px; padding:9px 12px; font-size:13px;
          font-family:'IBM Plex Sans',sans-serif; color:#f1ede8; outline:none; width:100%;
          transition:border-color 0.2s, box-shadow 0.2s;
        }
        .im-input::placeholder, .im-textarea::placeholder { color:rgba(255,255,255,0.18); }
        .im-input:focus, .im-select:focus, .im-textarea:focus {
          border-color:rgba(251,146,60,0.45); box-shadow:0 0 0 2px rgba(234,88,12,0.1);
        }
        .im-select option { background:#0e0b1a; color:#f1ede8; }
        .im-textarea { resize:vertical; min-height:60px; }
        .im-section-label {
          font-size:10px; font-weight:500; letter-spacing:0.12em; text-transform:uppercase;
          color:rgba(255,255,255,0.25); padding:4px 0 2px;
          border-bottom:0.5px solid rgba(255,255,255,0.06); margin-top:4px;
        }
        .im-toggles { display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; }
        .im-error {
          background:rgba(239,68,68,0.1); border:0.5px solid rgba(239,68,68,0.25);
          border-radius:7px; padding:8px 12px; font-size:12px; color:#fca5a5;
        }
        .im-ftr {
          display:flex; justify-content:flex-end; gap:8px;
          padding:12px 20px 18px; border-top:0.5px solid rgba(255,255,255,0.06);
        }
        .im-btn-cancel {
          background:rgba(255,255,255,0.05); border:0.5px solid rgba(255,255,255,0.1);
          border-radius:7px; padding:8px 16px; font-size:13px;
          font-family:'IBM Plex Sans',sans-serif; color:rgba(255,255,255,0.5); cursor:pointer;
        }
        .im-btn-cancel:hover { background:rgba(255,255,255,0.08); color:rgba(255,255,255,0.75); }
        .im-btn-save {
          background:linear-gradient(135deg,#c2410c,#ea580c,#f97316); border:none;
          border-radius:7px; padding:8px 20px; font-size:13px; font-weight:500;
          font-family:'IBM Plex Sans',sans-serif; color:white; cursor:pointer;
          box-shadow:0 3px 12px rgba(234,88,12,0.35); transition:opacity 0.2s;
        }
        .im-btn-save:disabled { opacity:0.5; cursor:not-allowed; }
        .im-btn-save:hover:not(:disabled) { opacity:0.88; }
      `}</style>

      <div className="im-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="im-box">
          <div className="im-hdr">
            <span className="im-title">{initial ? 'Edit Item' : 'New Item'}</span>
            <button className="im-close" onClick={onClose}>×</button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="im-body">
              {error && <div className="im-error">{error}</div>}

              {/* Identity */}
              <div className="im-row">
                <div className="im-field">
                  <label className="im-label">Code *</label>
                  <input className="im-input" placeholder="ITEM001" value={form.code} onChange={set('code')} required />
                </div>
                <div className="im-field">
                  <label className="im-label">Base UOM *</label>
                  <input className="im-input" placeholder="PCS" value={form.baseUom} onChange={set('baseUom')} required />
                </div>
              </div>

              <div className="im-field">
                <label className="im-label">Name *</label>
                <input className="im-input" placeholder="Steel Bolt M8x50" value={form.name} onChange={set('name')} required />
              </div>

              <div className="im-field">
                <label className="im-label">Description</label>
                <textarea className="im-textarea" placeholder="Item description…" value={form.description} onChange={set('description')} />
              </div>

              <div className="im-row">
                <div className="im-field">
                  <label className="im-label">Item Type *</label>
                  <select className="im-select" value={form.itemType} onChange={set('itemType')}>
                    {ITEM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className="im-field">
                  <label className="im-label">Valuation Method</label>
                  <select className="im-select" value={form.valuationMethod ?? 'average'} onChange={set('valuationMethod')}>
                    <option value="average">Average</option>
                    <option value="fifo">FIFO</option>
                    <option value="standard">Standard</option>
                  </select>
                </div>
              </div>

              {/* Costs & Planning */}
              <div className="im-section-label">Costs & Planning</div>
              <div className="im-row3">
                <div className="im-field">
                  <label className="im-label">Standard Cost</label>
                  <input className="im-input" type="number" min="0" step="0.01" placeholder="0.00"
                    value={form.standardCost ?? ''} onChange={setNum('standardCost')} />
                </div>
                <div className="im-field">
                  <label className="im-label">Lead Time (days)</label>
                  <input className="im-input" type="number" min="0" placeholder="7"
                    value={form.leadTimeDays ?? ''} onChange={setNum('leadTimeDays')} />
                </div>
                <div className="im-field">
                  <label className="im-label">Safety Stock</label>
                  <input className="im-input" type="number" min="0" placeholder="100"
                    value={form.safetyStock ?? ''} onChange={setNum('safetyStock')} />
                </div>
              </div>

              <div className="im-row">
                <div className="im-field">
                  <label className="im-label">Reorder Point</label>
                  <input className="im-input" type="number" min="0" placeholder="50"
                    value={form.reorderPoint ?? ''} onChange={setNum('reorderPoint')} />
                </div>
                <div className="im-field">
                  <label className="im-label">Reorder Quantity</label>
                  <input className="im-input" type="number" min="0" placeholder="200"
                    value={form.reorderQuantity ?? ''} onChange={setNum('reorderQuantity')} />
                </div>
              </div>

              {/* Flags */}
              <div className="im-section-label">Properties</div>
              <div className="im-toggles">
                <Toggle label="Stockable"      checked={form.isStockable      ?? true}  onChange={setBool('isStockable')} />
                <Toggle label="Purchasable"    checked={form.isPurchasable    ?? true}  onChange={setBool('isPurchasable')} />
                <Toggle label="Saleable"       checked={form.isSaleable       ?? true}  onChange={setBool('isSaleable')} />
                <Toggle label="Manufacturable" checked={form.isManufacturable ?? false} onChange={setBool('isManufacturable')} />
                <Toggle label="Lot Tracked"    checked={form.isLotTracked     ?? false} onChange={setBool('isLotTracked')} />
                <Toggle label="Serial Tracked" checked={form.isSerialTracked  ?? false} onChange={setBool('isSerialTracked')} />
              </div>
            </div>

            <div className="im-ftr">
              <button type="button" className="im-btn-cancel" onClick={onClose}>Cancel</button>
              <button type="submit" className="im-btn-save" disabled={submitting}>
                {submitting ? 'Saving…' : initial ? 'Save Changes' : 'Create Item'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

// ─── Delete confirm ───────────────────────────────────────────────────────────

function DeleteConfirm({ item, onCancel, onConfirm, busy }: {
  item: Item; onCancel: () => void; onConfirm: () => void; busy: boolean;
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 400,
      background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24,
    }}>
      <div style={{
        background: '#0e0b1a', border: '0.5px solid rgba(239,68,68,0.25)',
        borderRadius: 14, width: '100%', maxWidth: 400, padding: '24px 24px 20px',
        boxShadow: '0 24px 60px rgba(0,0,0,0.7)',
      }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: '#f1ede8', marginBottom: 10 }}>Delete item?</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 20, lineHeight: 1.5 }}>
          <strong style={{ color: '#f1ede8' }}>{item.name}</strong> ({item.code}) will be soft-deleted.
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onCancel} style={{
            background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)',
            borderRadius: 7, padding: '8px 16px', fontSize: 13,
            fontFamily: "'IBM Plex Sans',sans-serif", color: 'rgba(255,255,255,0.5)', cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={onConfirm} disabled={busy} style={{
            background: 'rgba(239,68,68,0.15)', border: '0.5px solid rgba(239,68,68,0.35)',
            borderRadius: 7, padding: '8px 16px', fontSize: 13, fontWeight: 500,
            fontFamily: "'IBM Plex Sans',sans-serif", color: '#f87171',
            cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.5 : 1,
          }}>{busy ? 'Deleting…' : 'Delete'}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ItemsPage() {
  const [items,      setItems]      = useState<Item[]>([]);
  const [filtered,   setFiltered]   = useState<Item[]>([]);
  const [stats,      setStats]      = useState<ItemStatistics | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [search,     setSearch]     = useState('');
  const [typeFilter, setTypeFilter] = useState<ItemType | ''>('');
  const [modalOpen,  setModalOpen]  = useState(false);
  const [editing,    setEditing]    = useState<Item | null>(null);
  const [deleting,   setDeleting]   = useState<Item | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true);
      const [data, statsData] = await Promise.all([
        itemsApi.getAll(),
        itemsApi.getStatistics(),
      ]);
      setItems(data);
      setStats(statsData);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load items.';
      setError(message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(items.filter(i => {
      const matchSearch = !q ||
        i.name.toLowerCase().includes(q) ||
        i.code.toLowerCase().includes(q) ||
        (i.description ?? '').toLowerCase().includes(q);
      const matchType = !typeFilter || i.itemType === typeFilter;
      return matchSearch && matchType;
    }));
  }, [search, typeFilter, items]);

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await itemsApi.remove(deleting.id);
      setDeleting(null);
      fetchItems();
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
      setError(msg || 'Delete failed.');
      setDeleting(null);
    } finally { setDeleteBusy(false); }
  };

  return (
    <ERPShell breadcrumbs={['Home', 'Inventory', 'Items']} title="Items">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap');
        .itm-page { padding: 0 18px 24px; }
        .itm-toolbar {
          display:flex; align-items:center; gap:10px;
          margin-bottom:14px; flex-wrap:wrap;
        }
        .itm-search {
          background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.09);
          border-radius:7px; padding:7px 12px; font-size:12px;
          font-family:'IBM Plex Sans',sans-serif; color:#e2dfd8; outline:none; width:240px;
          transition:border-color 0.2s, box-shadow 0.2s;
        }
        .itm-search::placeholder { color:rgba(255,255,255,0.2); }
        .itm-search:focus { border-color:rgba(251,146,60,0.4); box-shadow:0 0 0 2px rgba(234,88,12,0.08); }
        .itm-filter {
          background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.09);
          border-radius:7px; padding:7px 12px; font-size:12px;
          font-family:'IBM Plex Sans',sans-serif; color:#e2dfd8; outline:none;
          transition:border-color 0.2s;
        }
        .itm-filter:focus { border-color:rgba(251,146,60,0.4); }
        .itm-filter option { background:#0e0b1a; color:#f1ede8; }
        .itm-btn-new {
          display:flex; align-items:center; gap:6px; margin-left:auto;
          background:linear-gradient(135deg,#c2410c,#ea580c,#f97316);
          border:none; border-radius:7px; padding:7px 14px;
          font-size:12px; font-weight:500; font-family:'IBM Plex Sans',sans-serif;
          color:white; cursor:pointer; box-shadow:0 3px 12px rgba(234,88,12,0.3);
          transition:opacity 0.15s, transform 0.15s; flex-shrink:0;
        }
        .itm-btn-new:hover { opacity:0.88; transform:translateY(-1px); }
        .itm-btn-new svg { width:13px; height:13px; display:block; flex-shrink:0; }
        .itm-wrap {
          background:rgba(10,7,18,0.7); border:0.5px solid rgba(251,146,60,0.12);
          border-radius:10px; overflow:hidden;
        }
        .itm-table { width:100%; border-collapse:collapse; }
        .itm-table thead th {
          padding:9px 14px; font-size:10px; font-weight:500;
          letter-spacing:0.1em; text-transform:uppercase; color:rgba(251,146,60,0.55);
          background:rgba(251,146,60,0.05); border-bottom:0.5px solid rgba(255,255,255,0.06);
          text-align:left; white-space:nowrap;
        }
        .itm-table tbody td {
          padding:10px 14px; border-bottom:0.5px solid rgba(255,255,255,0.04);
          vertical-align:middle; font-size:13px;
        }
        .itm-table tbody tr:last-child td { border-bottom:none; }
        .itm-table tbody tr:hover td { background:rgba(251,146,60,0.03); }
        .itm-code { font-family:'IBM Plex Mono',monospace; font-size:12px; color:#fb923c; }
        .itm-name { color:#e2dfd8; font-weight:500; }
        .itm-muted { color:rgba(255,255,255,0.45); }
        .itm-cost  { font-family:'IBM Plex Mono',monospace; font-size:12px; color:rgba(255,255,255,0.65); }
        .itm-flags { display:flex; align-items:center; gap:6px; }
        .itm-flag-label { font-size:10px; color:rgba(255,255,255,0.3); }
        .itm-actions { display:flex; gap:6px; }
        .itm-btn-edit, .itm-btn-del {
          padding:5px 10px; border-radius:6px; font-size:11px;
          font-family:'IBM Plex Sans',sans-serif; cursor:pointer;
          border:0.5px solid transparent; transition:background 0.15s; white-space:nowrap;
        }
        .itm-btn-edit { background:rgba(255,255,255,0.05); color:rgba(255,255,255,0.55); border-color:rgba(255,255,255,0.1); }
        .itm-btn-edit:hover { background:rgba(255,255,255,0.09); color:rgba(255,255,255,0.8); }
        .itm-btn-del  { background:rgba(239,68,68,0.08); color:#f87171; border-color:rgba(239,68,68,0.2); }
        .itm-btn-del:hover { background:rgba(239,68,68,0.14); }
        .itm-empty, .itm-loading {
          text-align:center; padding:52px 24px; color:rgba(255,255,255,0.25); font-size:13px;
          display:flex; flex-direction:column; align-items:center; gap:10px;
        }
        .itm-spinner {
          width:18px; height:18px; border-radius:50%;
          border:2px solid rgba(251,146,60,0.2); border-top-color:#fb923c;
          animation:itm-spin 0.7s linear infinite; flex-shrink:0;
        }
        @keyframes itm-spin { to { transform:rotate(360deg); } }
        .itm-footer {
          font-size:11px; color:rgba(255,255,255,0.22); padding:8px 14px;
          border-top:0.5px solid rgba(255,255,255,0.04);
        }
        .itm-error {
          background:rgba(239,68,68,0.08); border:0.5px solid rgba(239,68,68,0.2);
          border-radius:8px; padding:10px 14px; margin-bottom:14px; font-size:13px; color:#fca5a5;
        }
      `}</style>

      <div className="itm-page">

        {/* Statistics */}
        {stats && <StatsBar stats={stats} />}

        {/* Toolbar */}
        <div className="itm-toolbar">
          <input
            className="itm-search"
            placeholder="Search by code or name…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <select
            className="itm-filter"
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as ItemType | '')}
          >
            <option value="">All Types</option>
            {ITEM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <button className="itm-btn-new" onClick={() => { setEditing(null); setModalOpen(true); }}>
            <svg viewBox="0 0 13 13" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
              <line x1="6.5" y1="1" x2="6.5" y2="12" />
              <line x1="1" y1="6.5" x2="12" y2="6.5" />
            </svg>
            New Item
          </button>
        </div>

        {error && <div className="itm-error">{error}</div>}

        <div className="itm-wrap">
          {loading ? (
            <div className="itm-loading"><div className="itm-spinner" />Loading items…</div>
          ) : filtered.length === 0 ? (
            <div className="itm-empty">
              {search || typeFilter ? 'No items match your filters.' : 'No items yet. Create your first one.'}
            </div>
          ) : (
            <>
              <table className="itm-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Type</th>
                    <th>UOM</th>
                    <th>Std Cost</th>
                    <th>Lead Time</th>
                    <th style={{ textAlign: 'center' }}>S</th>
                    <th style={{ textAlign: 'center' }}>P</th>
                    <th style={{ textAlign: 'center' }}>Sa</th>
                    <th style={{ textAlign: 'center' }}>M</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(item => (
                    <tr key={item.id}>
                      <td><span className="itm-code">{item.code}</span></td>
                      <td>
                        <span className="itm-name">{item.name}</span>
                        {item.description && (
                          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{item.description}</div>
                        )}
                      </td>
                      <td><TypeBadge type={item.itemType} /></td>
                      <td><span className="itm-muted">{item.baseUom}</span></td>
                      <td>
                        <span className="itm-cost">
                          {item.standardCost !== undefined && item.standardCost !== null
                            ? `$${Number(item.standardCost).toFixed(2)}`
                            : '—'}
                        </span>
                      </td>
                      <td><span className="itm-muted">{item.leadTimeDays ? `${item.leadTimeDays}d` : '—'}</span></td>
                      <td style={{ textAlign: 'center' }}><BoolDot value={item.isStockable} /></td>
                      <td style={{ textAlign: 'center' }}><BoolDot value={item.isPurchasable} /></td>
                      <td style={{ textAlign: 'center' }}><BoolDot value={item.isSaleable} /></td>
                      <td style={{ textAlign: 'center' }}><BoolDot value={item.isManufacturable} /></td>
                      <td>
                        <div className="itm-actions">
                          <button className="itm-btn-edit" onClick={() => { setEditing(item); setModalOpen(true); }}>Edit</button>
                          <button className="itm-btn-del"  onClick={() => setDeleting(item)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="itm-footer">
                {filtered.length} of {items.length} item{items.length !== 1 ? 's' : ''}
                {typeFilter && ` · filtered by ${getTypeConfig(typeFilter as ItemType).label}`}
              </div>
            </>
          )}
        </div>

        {/* Column legend */}
        <div style={{ marginTop: 8, display: 'flex', gap: 14, fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>
          <span>S = Stockable</span>
          <span>P = Purchasable</span>
          <span>Sa = Saleable</span>
          <span>M = Manufacturable</span>
        </div>
      </div>

      <ItemModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={fetchItems}
        initial={editing}
      />

      {deleting && (
        <DeleteConfirm
          item={deleting}
          onCancel={() => setDeleting(null)}
          onConfirm={handleDelete}
          busy={deleteBusy}
        />
      )}
    </ERPShell>
  );
}