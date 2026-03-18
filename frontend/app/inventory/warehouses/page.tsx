"use client";

import { useEffect, useState, useCallback } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import { warehousesApi } from '@/lib/api/warehouses';
import { Warehouse, CreateWarehouseDto, WarehouseType } from '@/lib/api/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const WAREHOUSE_TYPES: { value: WarehouseType; label: string; color: string; bg: string; border: string }[] = [
  { value: 'regular',      label: 'Regular',      color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',  border: 'rgba(96,165,250,0.2)' },
  { value: 'consignment',  label: 'Consignment',  color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.2)' },
  { value: 'transit',      label: 'Transit',      color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.2)' },
];

const EMPTY_FORM: CreateWarehouseDto = {
  code: '', name: '', warehouseType: 'regular', address: '', isActive: true,
};

function getTypeConfig(t?: WarehouseType) {
  return WAREHOUSE_TYPES.find(x => x.value === t) ?? WAREHOUSE_TYPES[0];
}

function fmt(v?: string | null) { return v || '—'; }

// ─── Badges ───────────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type?: WarehouseType }) {
  if (!type) return <span style={{ color: 'rgba(255,255,255,0.3)' }}>—</span>;
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

function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 500,
      color: active ? '#4ade80' : 'rgba(255,255,255,0.35)',
      background: active ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.05)',
      border: `0.5px solid ${active ? 'rgba(74,222,128,0.2)' : 'rgba(255,255,255,0.08)'}`,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: active ? '#4ade80' : 'rgba(255,255,255,0.2)', flexShrink: 0 }} />
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function WarehouseModal({ open, onClose, onSaved, initial }: {
  open: boolean; onClose: () => void; onSaved: () => void; initial: Warehouse | null;
}) {
  const [form, setForm] = useState<CreateWarehouseDto>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setError('');
      setForm(initial ? {
        code:          initial.code,
        name:          initial.name,
        warehouseType: initial.warehouseType ?? 'regular',
        address:       initial.address ?? '',
        isActive:      initial.isActive,
      } : EMPTY_FORM);
    }
  }, [open, initial]);

  const set = (key: keyof CreateWarehouseDto) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code.trim() || !form.name.trim()) { setError('Code and name are required.'); return; }
    setSubmitting(true); setError('');
    try {
      if (initial) await warehousesApi.update(initial.id, form);
      else          await warehousesApi.create(form);
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
        .wm-overlay {
          position:fixed; inset:0; z-index:400;
          background:rgba(0,0,0,0.65); backdrop-filter:blur(4px);
          display:flex; align-items:center; justify-content:center; padding:24px;
        }
        .wm-box {
          background:#0e0b1a; border:0.5px solid rgba(251,146,60,0.2);
          border-radius:14px; width:100%; max-width:480px;
          max-height:90vh; overflow-y:auto; position:relative;
          box-shadow:0 24px 60px rgba(0,0,0,0.7);
        }
        .wm-box::before {
          content:''; position:absolute; top:0; left:30px; right:30px; height:1px;
          background:linear-gradient(90deg,transparent,rgba(251,146,60,0.4),transparent);
        }
        .wm-hdr {
          display:flex; align-items:center; justify-content:space-between;
          padding:16px 20px 12px; border-bottom:0.5px solid rgba(255,255,255,0.06);
          position:sticky; top:0; background:#0e0b1a; z-index:1;
        }
        .wm-title { font-size:14px; font-weight:500; color:#f1ede8; font-family:'IBM Plex Sans',sans-serif; }
        .wm-close {
          width:24px; height:24px; border-radius:6px; background:rgba(255,255,255,0.06);
          border:none; cursor:pointer; color:rgba(255,255,255,0.45); font-size:16px;
          display:flex; align-items:center; justify-content:center; transition:background 0.15s;
        }
        .wm-close:hover { background:rgba(255,255,255,0.1); color:rgba(255,255,255,0.8); }
        .wm-body { padding:16px 20px; display:flex; flex-direction:column; gap:12px; }
        .wm-row  { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
        .wm-field { display:flex; flex-direction:column; gap:5px; }
        .wm-label {
          font-size:11px; font-weight:500; letter-spacing:0.08em; text-transform:uppercase;
          color:rgba(251,146,60,0.6); font-family:'IBM Plex Sans',sans-serif;
        }
        .wm-input, .wm-select, .wm-textarea {
          background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.1);
          border-radius:7px; padding:9px 12px; font-size:13px;
          font-family:'IBM Plex Sans',sans-serif; color:#f1ede8; outline:none; width:100%;
          transition:border-color 0.2s, box-shadow 0.2s;
        }
        .wm-input::placeholder, .wm-textarea::placeholder { color:rgba(255,255,255,0.18); }
        .wm-input:focus, .wm-select:focus, .wm-textarea:focus {
          border-color:rgba(251,146,60,0.45); box-shadow:0 0 0 2px rgba(234,88,12,0.1);
        }
        .wm-select option { background:#0e0b1a; color:#f1ede8; }
        .wm-textarea { resize:vertical; min-height:68px; }
        .wm-error {
          background:rgba(239,68,68,0.1); border:0.5px solid rgba(239,68,68,0.25);
          border-radius:7px; padding:8px 12px; font-size:12px; color:#fca5a5;
        }
        .wm-ftr {
          display:flex; justify-content:flex-end; gap:8px;
          padding:12px 20px 18px; border-top:0.5px solid rgba(255,255,255,0.06);
        }
        .wm-btn-cancel {
          background:rgba(255,255,255,0.05); border:0.5px solid rgba(255,255,255,0.1);
          border-radius:7px; padding:8px 16px; font-size:13px;
          font-family:'IBM Plex Sans',sans-serif; color:rgba(255,255,255,0.5); cursor:pointer;
          transition:background 0.15s;
        }
        .wm-btn-cancel:hover { background:rgba(255,255,255,0.08); color:rgba(255,255,255,0.75); }
        .wm-btn-save {
          background:linear-gradient(135deg,#c2410c,#ea580c,#f97316); border:none;
          border-radius:7px; padding:8px 20px; font-size:13px; font-weight:500;
          font-family:'IBM Plex Sans',sans-serif; color:white; cursor:pointer;
          box-shadow:0 3px 12px rgba(234,88,12,0.35); transition:opacity 0.2s;
        }
        .wm-btn-save:disabled { opacity:0.5; cursor:not-allowed; }
        .wm-btn-save:hover:not(:disabled) { opacity:0.88; }
        .wm-toggle-row {
          display:flex; align-items:center; justify-content:space-between;
          background:rgba(255,255,255,0.03); border:0.5px solid rgba(255,255,255,0.07);
          border-radius:8px; padding:10px 14px;
        }
        .wm-toggle-label { font-size:13px; color:rgba(255,255,255,0.6); font-family:'IBM Plex Sans',sans-serif; }
      `}</style>

      <div className="wm-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="wm-box">
          <div className="wm-hdr">
            <span className="wm-title">{initial ? 'Edit Warehouse' : 'New Warehouse'}</span>
            <button className="wm-close" onClick={onClose}>×</button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="wm-body">
              {error && <div className="wm-error">{error}</div>}

              <div className="wm-row">
                <div className="wm-field">
                  <label className="wm-label">Code *</label>
                  <input className="wm-input" placeholder="WH-001" value={form.code} onChange={set('code')} required />
                </div>
                <div className="wm-field">
                  <label className="wm-label">Type</label>
                  <select className="wm-select" value={form.warehouseType} onChange={set('warehouseType')}>
                    {WAREHOUSE_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="wm-field">
                <label className="wm-label">Name *</label>
                <input className="wm-input" placeholder="Main Warehouse" value={form.name} onChange={set('name')} required />
              </div>

              <div className="wm-field">
                <label className="wm-label">Address</label>
                <textarea
                  className="wm-textarea"
                  placeholder="123 Storage St, Industrial Zone"
                  value={form.address}
                  onChange={set('address')}
                />
              </div>

              <div className="wm-toggle-row">
                <span className="wm-toggle-label">Active</span>
                <div
                  onClick={() => setForm(f => ({ ...f, isActive: !f.isActive }))}
                  style={{
                    width: 32, height: 18, borderRadius: 9, flexShrink: 0, cursor: 'pointer',
                    background: form.isActive ? 'rgba(234,88,12,0.8)' : 'rgba(255,255,255,0.1)',
                    border: `0.5px solid ${form.isActive ? 'rgba(251,146,60,0.5)' : 'rgba(255,255,255,0.15)'}`,
                    position: 'relative', transition: 'background 0.2s',
                  }}
                >
                  <div style={{
                    position: 'absolute', top: 2, left: form.isActive ? 16 : 2,
                    width: 13, height: 13, borderRadius: '50%', background: '#fff',
                    transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
                  }} />
                </div>
              </div>
            </div>

            <div className="wm-ftr">
              <button type="button" className="wm-btn-cancel" onClick={onClose}>Cancel</button>
              <button type="submit" className="wm-btn-save" disabled={submitting}>
                {submitting ? 'Saving…' : initial ? 'Save Changes' : 'Create Warehouse'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

// ─── Delete confirm ───────────────────────────────────────────────────────────

function DeleteConfirm({ warehouse, onCancel, onConfirm, busy }: {
  warehouse: Warehouse; onCancel: () => void; onConfirm: () => void; busy: boolean;
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
        <div style={{ fontSize: 14, fontWeight: 500, color: '#f1ede8', marginBottom: 10 }}>Delete warehouse?</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 20, lineHeight: 1.5 }}>
          <strong style={{ color: '#f1ede8' }}>{warehouse.name}</strong> ({warehouse.code}) will be soft-deleted.
          Any existing stock in this warehouse will remain in the system.
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

export default function WarehousesPage() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [filtered,   setFiltered]   = useState<Warehouse[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [search,     setSearch]     = useState('');
  const [modalOpen,  setModalOpen]  = useState(false);
  const [editing,    setEditing]    = useState<Warehouse | null>(null);
  const [deleting,   setDeleting]   = useState<Warehouse | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const fetchWarehouses = useCallback(async () => {
    try {
      setLoading(true);
      const data = await warehousesApi.getAll();
      setWarehouses(data);
      setFiltered(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load warehouses.';
      setError(message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchWarehouses(); }, [fetchWarehouses]);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(q ? warehouses.filter(w =>
      w.name.toLowerCase().includes(q) ||
      w.code.toLowerCase().includes(q) ||
      (w.address ?? '').toLowerCase().includes(q) ||
      (w.warehouseType ?? '').toLowerCase().includes(q)
    ) : warehouses);
  }, [search, warehouses]);

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await warehousesApi.remove(deleting.id);
      setDeleting(null);
      fetchWarehouses();
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
      setError(msg || 'Delete failed.');
      setDeleting(null);
    } finally { setDeleteBusy(false); }
  };

  // Summary counts
  const activeCount = warehouses.filter(w => w.isActive).length;
  const byType = WAREHOUSE_TYPES.map(t => ({
    ...t,
    count: warehouses.filter(w => w.warehouseType === t.value).length,
  }));

  return (
    <ERPShell breadcrumbs={['Home', 'Inventory', 'Warehouses']} title="Warehouses">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap');
        .wh-page { padding: 0 18px 24px; }
        .wh-stats { display:flex; gap:10px; margin-bottom:14px; flex-wrap:wrap; }
        .wh-stat-card {
          background:rgba(10,7,18,0.7); border-radius:8px; padding:8px 14px;
          display:flex; flex-direction:column; gap:2px; min-width:110px;
        }
        .wh-stat-label { font-size:10px; font-weight:500; letter-spacing:0.08em; text-transform:uppercase; }
        .wh-stat-value { font-size:22px; font-weight:500; font-family:'IBM Plex Mono',monospace; color:#f1ede8; }
        .wh-toolbar {
          display:flex; align-items:center; justify-content:space-between;
          margin-bottom:14px; gap:12px; flex-wrap:wrap;
        }
        .wh-search {
          background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.09);
          border-radius:7px; padding:7px 12px; font-size:12px;
          font-family:'IBM Plex Sans',sans-serif; color:#e2dfd8; outline:none; width:260px;
          transition:border-color 0.2s, box-shadow 0.2s;
        }
        .wh-search::placeholder { color:rgba(255,255,255,0.2); }
        .wh-search:focus { border-color:rgba(251,146,60,0.4); box-shadow:0 0 0 2px rgba(234,88,12,0.08); }
        .wh-btn-new {
          display:flex; align-items:center; gap:6px;
          background:linear-gradient(135deg,#c2410c,#ea580c,#f97316);
          border:none; border-radius:7px; padding:7px 14px;
          font-size:12px; font-weight:500; font-family:'IBM Plex Sans',sans-serif;
          color:white; cursor:pointer; box-shadow:0 3px 12px rgba(234,88,12,0.3);
          transition:opacity 0.15s, transform 0.15s; flex-shrink:0;
        }
        .wh-btn-new:hover { opacity:0.88; transform:translateY(-1px); }
        .wh-btn-new svg { width:13px; height:13px; display:block; flex-shrink:0; }
        .wh-wrap {
          background:rgba(10,7,18,0.7); border:0.5px solid rgba(251,146,60,0.12);
          border-radius:10px; overflow:hidden;
        }
        .wh-table { width:100%; border-collapse:collapse; }
        .wh-table thead th {
          padding:9px 14px; font-size:10px; font-weight:500;
          letter-spacing:0.1em; text-transform:uppercase; color:rgba(251,146,60,0.55);
          background:rgba(251,146,60,0.05); border-bottom:0.5px solid rgba(255,255,255,0.06);
          text-align:left; white-space:nowrap;
        }
        .wh-table tbody td {
          padding:10px 14px; border-bottom:0.5px solid rgba(255,255,255,0.04);
          vertical-align:middle; font-size:13px;
        }
        .wh-table tbody tr:last-child td { border-bottom:none; }
        .wh-table tbody tr:hover td { background:rgba(251,146,60,0.03); }
        .wh-code { font-family:'IBM Plex Mono',monospace; font-size:12px; color:#fb923c; }
        .wh-name { color:#e2dfd8; font-weight:500; }
        .wh-muted { color:rgba(255,255,255,0.45); font-size:12px; }
        .wh-actions { display:flex; gap:6px; }
        .wh-btn-edit, .wh-btn-del {
          padding:5px 10px; border-radius:6px; font-size:11px;
          font-family:'IBM Plex Sans',sans-serif; cursor:pointer;
          border:0.5px solid transparent; transition:background 0.15s; white-space:nowrap;
        }
        .wh-btn-edit { background:rgba(255,255,255,0.05); color:rgba(255,255,255,0.55); border-color:rgba(255,255,255,0.1); }
        .wh-btn-edit:hover { background:rgba(255,255,255,0.09); color:rgba(255,255,255,0.8); }
        .wh-btn-del { background:rgba(239,68,68,0.08); color:#f87171; border-color:rgba(239,68,68,0.2); }
        .wh-btn-del:hover { background:rgba(239,68,68,0.14); }
        .wh-empty, .wh-loading {
          text-align:center; padding:52px 24px; color:rgba(255,255,255,0.25); font-size:13px;
          display:flex; flex-direction:column; align-items:center; gap:10px;
        }
        .wh-spinner {
          width:18px; height:18px; border-radius:50%;
          border:2px solid rgba(251,146,60,0.2); border-top-color:#fb923c;
          animation:wh-spin 0.7s linear infinite; flex-shrink:0;
        }
        @keyframes wh-spin { to { transform:rotate(360deg); } }
        .wh-footer {
          font-size:11px; color:rgba(255,255,255,0.22); padding:8px 14px;
          border-top:0.5px solid rgba(255,255,255,0.04);
        }
        .wh-error {
          background:rgba(239,68,68,0.08); border:0.5px solid rgba(239,68,68,0.2);
          border-radius:8px; padding:10px 14px; margin-bottom:14px; font-size:13px; color:#fca5a5;
        }
      `}</style>

      <div className="wh-page">

        {/* Stats */}
        {warehouses.length > 0 && (
          <div className="wh-stats">
            {byType.map(t => (
              <div key={t.value} className="wh-stat-card" style={{ border: `0.5px solid ${t.border}` }}>
                <span className="wh-stat-label" style={{ color: t.color }}>{t.label}</span>
                <span className="wh-stat-value">{t.count}</span>
              </div>
            ))}
            <div className="wh-stat-card" style={{ border: '0.5px solid rgba(74,222,128,0.2)' }}>
              <span className="wh-stat-label" style={{ color: '#4ade80' }}>Active</span>
              <span className="wh-stat-value">{activeCount}</span>
            </div>
            <div className="wh-stat-card" style={{ border: '0.5px solid rgba(251,146,60,0.2)' }}>
              <span className="wh-stat-label" style={{ color: 'rgba(251,146,60,0.7)' }}>Total</span>
              <span className="wh-stat-value" style={{ color: '#fb923c' }}>{warehouses.length}</span>
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div className="wh-toolbar">
          <input
            className="wh-search"
            placeholder="Search by code, name, address…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button className="wh-btn-new" onClick={() => { setEditing(null); setModalOpen(true); }}>
            <svg viewBox="0 0 13 13" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
              <line x1="6.5" y1="1" x2="6.5" y2="12" />
              <line x1="1" y1="6.5" x2="12" y2="6.5" />
            </svg>
            New Warehouse
          </button>
        </div>

        {error && <div className="wh-error">{error}</div>}

        <div className="wh-wrap">
          {loading ? (
            <div className="wh-loading"><div className="wh-spinner" />Loading warehouses…</div>
          ) : filtered.length === 0 ? (
            <div className="wh-empty">
              {search ? 'No warehouses match your search.' : 'No warehouses yet. Create your first one.'}
            </div>
          ) : (
            <>
              <table className="wh-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Address</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(w => (
                    <tr key={w.id}>
                      <td><span className="wh-code">{w.code}</span></td>
                      <td><span className="wh-name">{w.name}</span></td>
                      <td><TypeBadge type={w.warehouseType} /></td>
                      <td><span className="wh-muted">{fmt(w.address)}</span></td>
                      <td><ActiveBadge active={w.isActive} /></td>
                      <td>
                        <div className="wh-actions">
                          <button className="wh-btn-edit" onClick={() => { setEditing(w); setModalOpen(true); }}>Edit</button>
                          <button className="wh-btn-del"  onClick={() => setDeleting(w)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="wh-footer">
                {filtered.length} of {warehouses.length} warehouse{warehouses.length !== 1 ? 's' : ''}
              </div>
            </>
          )}
        </div>
      </div>

      <WarehouseModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={fetchWarehouses}
        initial={editing}
      />

      {deleting && (
        <DeleteConfirm
          warehouse={deleting}
          onCancel={() => setDeleting(null)}
          onConfirm={handleDelete}
          busy={deleteBusy}
        />
      )}
    </ERPShell>
  );
}