"use client";

import { useEffect, useState, useCallback } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import { suppliersApi } from '@/lib/api/suppliers';
import { Supplier, CreateSupplierDto } from '@/lib/api/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const EMPTY_FORM: CreateSupplierDto = {
  code: '',
  name: '',
  legalName: '',
  taxId: '',
  phone: '',
  email: '',
  website: '',
  paymentTerms: '',
  currency: 'USD',
  category: '',
  notes: '',
};

function fmt(v?: string | null) {
  return v || '—';
}

// ─── Status badge ─────────────────────────────────────────────────────────────

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

function SupplierModal({
  open,
  onClose,
  onSaved,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
  initial: Supplier | null;
}) {
  const [form, setForm] = useState<CreateSupplierDto>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setError('');
      setForm(initial ? {
        code: initial.code,
        name: initial.name,
        legalName: initial.legalName ?? '',
        taxId: initial.taxId ?? '',
        phone: initial.phone ?? '',
        email: initial.email ?? '',
        website: initial.website ?? '',
        paymentTerms: initial.paymentTerms ?? '',
        currency: initial.currency ?? 'USD',
        category: initial.category ?? '',
        notes: initial.notes ?? '',
      } : EMPTY_FORM);
    }
  }, [open, initial]);

  const set = (key: keyof CreateSupplierDto) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code.trim() || !form.name.trim()) {
      setError('Code and name are required.');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      if (initial) {
        await suppliersApi.update(initial.id, form);
      } else {
        await suppliersApi.create(form);
      }
      onSaved();
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Operation failed.');
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <>
      <style>{`
        .sm-overlay {
          position: fixed; inset: 0; z-index: 200;
          background: rgba(0,0,0,0.65);
          display: flex; align-items: center; justify-content: center;
          padding: 24px;
          backdrop-filter: blur(4px);
        }
        .sm-box {
          background: #0e0b1a;
          border: 0.5px solid rgba(251,146,60,0.2);
          border-radius: 14px;
          width: 100%; max-width: 520px;
          max-height: 90vh; overflow-y: auto;
          position: relative;
          box-shadow: 0 24px 60px rgba(0,0,0,0.7);
        }
        .sm-box::before {
          content: '';
          position: absolute; top: 0; left: 30px; right: 30px; height: 1px;
          background: linear-gradient(90deg, transparent, rgba(251,146,60,0.4), transparent);
        }
        .sm-hdr {
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 20px 12px;
          border-bottom: 0.5px solid rgba(255,255,255,0.06);
          position: sticky; top: 0; background: #0e0b1a; z-index: 1;
        }
        .sm-title { font-size: 14px; font-weight: 500; color: #f1ede8; font-family: 'IBM Plex Sans', sans-serif; }
        .sm-close {
          width: 24px; height: 24px; border-radius: 6px;
          background: rgba(255,255,255,0.06); border: none; cursor: pointer;
          color: rgba(255,255,255,0.45); font-size: 16px;
          display: flex; align-items: center; justify-content: center;
          transition: background 0.15s;
        }
        .sm-close:hover { background: rgba(255,255,255,0.1); color: rgba(255,255,255,0.8); }
        .sm-body { padding: 16px 20px; display: flex; flex-direction: column; gap: 12px; }
        .sm-row { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
        .sm-field { display: flex; flex-direction: column; gap: 5px; }
        .sm-label {
          font-size: 11px; font-weight: 500; letter-spacing: 0.08em;
          text-transform: uppercase; color: rgba(251,146,60,0.6);
          font-family: 'IBM Plex Sans', sans-serif;
        }
        .sm-input, .sm-select, .sm-textarea {
          background: rgba(255,255,255,0.04);
          border: 0.5px solid rgba(255,255,255,0.1);
          border-radius: 7px; padding: 9px 12px;
          font-size: 13px; font-family: 'IBM Plex Sans', sans-serif;
          color: #f1ede8; outline: none; width: 100%;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .sm-input::placeholder, .sm-textarea::placeholder { color: rgba(255,255,255,0.18); }
        .sm-input:focus, .sm-select:focus, .sm-textarea:focus {
          border-color: rgba(251,146,60,0.45);
          box-shadow: 0 0 0 2px rgba(234,88,12,0.1);
        }
        .sm-select option { background: #0e0b1a; color: #f1ede8; }
        .sm-textarea { resize: vertical; min-height: 72px; }
        .sm-error {
          background: rgba(239,68,68,0.1); border: 0.5px solid rgba(239,68,68,0.25);
          border-radius: 7px; padding: 8px 12px;
          font-size: 12px; color: #fca5a5; font-family: 'IBM Plex Sans', sans-serif;
        }
        .sm-ftr {
          display: flex; justify-content: flex-end; gap: 8px;
          padding: 12px 20px 18px;
          border-top: 0.5px solid rgba(255,255,255,0.06);
        }
        .sm-btn-cancel {
          background: rgba(255,255,255,0.05); border: 0.5px solid rgba(255,255,255,0.1);
          border-radius: 7px; padding: 8px 16px;
          font-size: 13px; font-family: 'IBM Plex Sans', sans-serif;
          color: rgba(255,255,255,0.5); cursor: pointer;
          transition: background 0.15s;
        }
        .sm-btn-cancel:hover { background: rgba(255,255,255,0.08); color: rgba(255,255,255,0.75); }
        .sm-btn-save {
          background: linear-gradient(135deg, #c2410c, #ea580c, #f97316);
          border: none; border-radius: 7px; padding: 8px 20px;
          font-size: 13px; font-weight: 500; font-family: 'IBM Plex Sans', sans-serif;
          color: white; cursor: pointer;
          box-shadow: 0 3px 12px rgba(234,88,12,0.35);
          transition: opacity 0.2s;
        }
        .sm-btn-save:disabled { opacity: 0.5; cursor: not-allowed; }
        .sm-btn-save:hover:not(:disabled) { opacity: 0.88; }
      `}</style>

      <div className="sm-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="sm-box">
          <div className="sm-hdr">
            <span className="sm-title">{initial ? 'Edit Supplier' : 'New Supplier'}</span>
            <button className="sm-close" onClick={onClose}>×</button>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="sm-body">
              {error && <div className="sm-error">{error}</div>}

              <div className="sm-row">
                <div className="sm-field">
                  <label className="sm-label">Code *</label>
                  <input className="sm-input" placeholder="SUP001" value={form.code} onChange={set('code')} required />
                </div>
                <div className="sm-field">
                  <label className="sm-label">Category</label>
                  <input className="sm-input" placeholder="Manufacturing" value={form.category} onChange={set('category')} />
                </div>
              </div>

              <div className="sm-field">
                <label className="sm-label">Name *</label>
                <input className="sm-input" placeholder="Acme Corporation" value={form.name} onChange={set('name')} required />
              </div>

              <div className="sm-field">
                <label className="sm-label">Legal Name</label>
                <input className="sm-input" placeholder="Acme Corporation LLC" value={form.legalName} onChange={set('legalName')} />
              </div>

              <div className="sm-row">
                <div className="sm-field">
                  <label className="sm-label">Tax ID</label>
                  <input className="sm-input" placeholder="123-45-6789" value={form.taxId} onChange={set('taxId')} />
                </div>
                <div className="sm-field">
                  <label className="sm-label">Currency</label>
                  <select className="sm-select" value={form.currency} onChange={set('currency')}>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="DOP">DOP</option>
                    <option value="GBP">GBP</option>
                  </select>
                </div>
              </div>

              <div className="sm-row">
                <div className="sm-field">
                  <label className="sm-label">Phone</label>
                  <input className="sm-input" placeholder="+1-555-0123" value={form.phone} onChange={set('phone')} />
                </div>
                <div className="sm-field">
                  <label className="sm-label">Email</label>
                  <input className="sm-input" type="email" placeholder="contact@acme.com" value={form.email} onChange={set('email')} />
                </div>
              </div>

              <div className="sm-row">
                <div className="sm-field">
                  <label className="sm-label">Website</label>
                  <input className="sm-input" placeholder="https://acme.com" value={form.website} onChange={set('website')} />
                </div>
                <div className="sm-field">
                  <label className="sm-label">Payment Terms</label>
                  <input className="sm-input" placeholder="Net 30" value={form.paymentTerms} onChange={set('paymentTerms')} />
                </div>
              </div>

              <div className="sm-field">
                <label className="sm-label">Notes</label>
                <textarea className="sm-textarea" placeholder="Additional notes..." value={form.notes} onChange={set('notes')} />
              </div>
            </div>

            <div className="sm-ftr">
              <button type="button" className="sm-btn-cancel" onClick={onClose}>Cancel</button>
              <button type="submit" className="sm-btn-save" disabled={submitting}>
                {submitting ? 'Saving…' : initial ? 'Save Changes' : 'Create Supplier'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

// ─── Delete confirm ───────────────────────────────────────────────────────────

function DeleteConfirm({
  supplier,
  onCancel,
  onConfirm,
  busy,
}: {
  supplier: Supplier;
  onCancel: () => void;
  onConfirm: () => void;
  busy: boolean;
}) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.65)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24, backdropFilter: 'blur(4px)',
    }}>
      <div style={{
        background: '#0e0b1a', border: '0.5px solid rgba(239,68,68,0.25)',
        borderRadius: 14, width: '100%', maxWidth: 400,
        padding: '24px 24px 20px',
        boxShadow: '0 24px 60px rgba(0,0,0,0.7)',
      }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: '#f1ede8', marginBottom: 10 }}>
          Delete supplier?
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 20, lineHeight: 1.5 }}>
          <strong style={{ color: '#f1ede8' }}>{supplier.name}</strong> ({supplier.code}) will be soft-deleted and removed from active records.
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onCancel} style={{
            background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)',
            borderRadius: 7, padding: '8px 16px', fontSize: 13,
            fontFamily: "'IBM Plex Sans', sans-serif",
            color: 'rgba(255,255,255,0.5)', cursor: 'pointer',
          }}>Cancel</button>
          <button onClick={onConfirm} disabled={busy} style={{
            background: 'rgba(239,68,68,0.15)', border: '0.5px solid rgba(239,68,68,0.35)',
            borderRadius: 7, padding: '8px 16px', fontSize: 13, fontWeight: 500,
            fontFamily: "'IBM Plex Sans', sans-serif",
            color: '#f87171', cursor: busy ? 'not-allowed' : 'pointer',
            opacity: busy ? 0.5 : 1,
          }}>
            {busy ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [filtered, setFiltered] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Supplier | null>(null);
  const [deleting, setDeleting] = useState<Supplier | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const fetchSuppliers = useCallback(async () => {
    try {
      setLoading(true);
      const data = await suppliersApi.getAll();
      setSuppliers(data);
      setFiltered(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load suppliers.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchSuppliers(); }, [fetchSuppliers]);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(
      q
        ? suppliers.filter(s =>
            s.name.toLowerCase().includes(q) ||
            s.code.toLowerCase().includes(q) ||
            (s.category ?? '').toLowerCase().includes(q) ||
            (s.email ?? '').toLowerCase().includes(q)
          )
        : suppliers
    );
  }, [search, suppliers]);

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await suppliersApi.remove(deleting.id);
      setDeleting(null);
      fetchSuppliers();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Delete failed.');
      setDeleting(null);
    } finally {
      setDeleteBusy(false);
    }
  };

  const openCreate = () => { setEditing(null); setModalOpen(true); };
  const openEdit = (s: Supplier) => { setEditing(s); setModalOpen(true); };

  return (
    <ERPShell breadcrumbs={['Home', 'Procurement', 'Suppliers']} title="Suppliers">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap');

        .sup-page { padding: 0 18px 24px; }

        .sup-toolbar {
          display: flex; align-items: center; justify-content: space-between;
          margin-bottom: 14px; gap: 12px; flex-wrap: wrap;
        }

        .sup-search {
          background: rgba(255,255,255,0.04);
          border: 0.5px solid rgba(255,255,255,0.09);
          border-radius: 7px; padding: 7px 12px;
          font-size: 12px; font-family: 'IBM Plex Sans', sans-serif;
          color: #e2dfd8; outline: none; width: 260px;
          transition: border-color 0.2s, box-shadow 0.2s;
        }
        .sup-search::placeholder { color: rgba(255,255,255,0.2); }
        .sup-search:focus {
          border-color: rgba(251,146,60,0.4);
          box-shadow: 0 0 0 2px rgba(234,88,12,0.08);
        }

        .sup-btn-new {
          display: flex; align-items: center; gap: 6px;
          background: linear-gradient(135deg, #c2410c, #ea580c, #f97316);
          border: none; border-radius: 7px; padding: 7px 14px;
          font-size: 12px; font-weight: 500; font-family: 'IBM Plex Sans', sans-serif;
          color: white; cursor: pointer;
          box-shadow: 0 3px 12px rgba(234,88,12,0.3);
          transition: opacity 0.15s, transform 0.15s; flex-shrink: 0;
        }
        .sup-btn-new:hover { opacity: 0.88; transform: translateY(-1px); }
        .sup-btn-new svg { width: 13px; height: 13px; display: block; flex-shrink: 0; }

        .sup-wrap {
          background: rgba(10,7,18,0.7);
          border: 0.5px solid rgba(251,146,60,0.12);
          border-radius: 10px; overflow: hidden;
        }

        .sup-table { width: 100%; border-collapse: collapse; }

        .sup-table thead th {
          padding: 9px 14px;
          font-size: 10px; font-weight: 500;
          letter-spacing: 0.1em; text-transform: uppercase;
          color: rgba(251,146,60,0.55);
          background: rgba(251,146,60,0.05);
          border-bottom: 0.5px solid rgba(255,255,255,0.06);
          text-align: left; white-space: nowrap;
        }

        .sup-table tbody td {
          padding: 10px 14px;
          border-bottom: 0.5px solid rgba(255,255,255,0.04);
          vertical-align: middle; font-size: 13px;
        }
        .sup-table tbody tr:last-child td { border-bottom: none; }
        .sup-table tbody tr:hover td { background: rgba(251,146,60,0.03); }

        .sup-code {
          font-family: 'IBM Plex Mono', monospace;
          font-size: 12px; color: #fb923c;
        }
        .sup-name { color: #e2dfd8; font-weight: 500; }
        .sup-muted { color: rgba(255,255,255,0.45); }

        .sup-actions { display: flex; gap: 6px; }

        .sup-btn-edit, .sup-btn-del {
          padding: 5px 10px; border-radius: 6px; font-size: 11px;
          font-family: 'IBM Plex Sans', sans-serif; cursor: pointer;
          border: 0.5px solid transparent; transition: background 0.15s, border-color 0.15s;
          white-space: nowrap;
        }
        .sup-btn-edit {
          background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.55);
          border-color: rgba(255,255,255,0.1);
        }
        .sup-btn-edit:hover { background: rgba(255,255,255,0.09); color: rgba(255,255,255,0.8); }
        .sup-btn-del {
          background: rgba(239,68,68,0.08); color: #f87171;
          border-color: rgba(239,68,68,0.2);
        }
        .sup-btn-del:hover { background: rgba(239,68,68,0.14); }

        .sup-empty, .sup-loading {
          text-align: center; padding: 52px 24px;
          color: rgba(255,255,255,0.25); font-size: 13px;
          display: flex; flex-direction: column; align-items: center; gap: 10px;
        }
        .sup-spinner {
          width: 18px; height: 18px; border-radius: 50%;
          border: 2px solid rgba(251,146,60,0.2);
          border-top-color: #fb923c;
          animation: sup-spin 0.7s linear infinite; flex-shrink: 0;
        }
        @keyframes sup-spin { to { transform: rotate(360deg); } }

        .sup-footer {
          font-size: 11px; color: rgba(255,255,255,0.22);
          padding: 8px 14px;
          border-top: 0.5px solid rgba(255,255,255,0.04);
        }

        .sup-error {
          background: rgba(239,68,68,0.08); border: 0.5px solid rgba(239,68,68,0.2);
          border-radius: 8px; padding: 10px 14px; margin-bottom: 14px;
          font-size: 13px; color: #fca5a5;
        }
      `}</style>

      <div className="sup-page">

        <div className="sup-toolbar">
          <input
            className="sup-search"
            placeholder="Search by name, code, category…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button className="sup-btn-new" onClick={openCreate}>
            <svg viewBox="0 0 13 13" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
              <line x1="6.5" y1="1" x2="6.5" y2="12" />
              <line x1="1" y1="6.5" x2="12" y2="6.5" />
            </svg>
            New Supplier
          </button>
        </div>

        {error && <div className="sup-error">{error}</div>}

        <div className="sup-wrap">
          {loading ? (
            <div className="sup-loading">
              <div className="sup-spinner" />
              Loading suppliers…
            </div>
          ) : filtered.length === 0 ? (
            <div className="sup-empty">
              {search ? 'No suppliers match your search.' : 'No suppliers yet. Create your first one.'}
            </div>
          ) : (
            <>
              <table className="sup-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Category</th>
                    <th>Payment Terms</th>
                    <th>Currency</th>
                    <th>Email</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(s => (
                    <tr key={s.id}>
                      <td><span className="sup-code">{s.code}</span></td>
                      <td><span className="sup-name">{s.name}</span></td>
                      <td><span className="sup-muted">{fmt(s.category)}</span></td>
                      <td><span className="sup-muted">{fmt(s.paymentTerms)}</span></td>
                      <td><span className="sup-muted">{fmt(s.currency)}</span></td>
                      <td><span className="sup-muted">{fmt(s.email)}</span></td>
                      <td><ActiveBadge active={s.isActive} /></td>
                      <td>
                        <div className="sup-actions">
                          <button className="sup-btn-edit" onClick={() => openEdit(s)}>Edit</button>
                          <button className="sup-btn-del" onClick={() => setDeleting(s)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="sup-footer">
                {filtered.length} of {suppliers.length} supplier{suppliers.length !== 1 ? 's' : ''}
              </div>
            </>
          )}
        </div>
      </div>

      <SupplierModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={fetchSuppliers}
        initial={editing}
      />

      {deleting && (
        <DeleteConfirm
          supplier={deleting}
          onCancel={() => setDeleting(null)}
          onConfirm={handleDelete}
          busy={deleteBusy}
        />
      )}
    </ERPShell>
  );
}