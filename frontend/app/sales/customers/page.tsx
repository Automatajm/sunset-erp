"use client";

import { useEffect, useState, useCallback } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import { customersApi } from '@/lib/api/customers';
import { Customer, CreateCustomerDto, CreditStatus } from '@/lib/api/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const EMPTY_FORM: CreateCustomerDto = {
  code: '',
  name: '',
  legalName: '',
  taxId: '',
  phone: '',
  email: '',
  website: '',
  creditLimit: undefined,
  creditStatus: 'good',
  paymentTerms: '',
  currency: 'USD',
  notes: '',
};

function fmt(v?: string | number | null) {
  if (v === undefined || v === null || v === '') return '—';
  return String(v);
}

function fmtCurrency(v?: number | null) {
  if (v === undefined || v === null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
}

// ─── Credit status badge ──────────────────────────────────────────────────────

const CREDIT_COLORS: Record<CreditStatus, { color: string; bg: string; border: string }> = {
  good:  { color: '#4ade80', bg: 'rgba(74,222,128,0.1)',   border: 'rgba(74,222,128,0.2)' },
  watch: { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',   border: 'rgba(251,191,36,0.2)' },
  hold:  { color: '#f87171', bg: 'rgba(248,113,113,0.1)',  border: 'rgba(248,113,113,0.2)' },
};

function CreditBadge({ status }: { status?: CreditStatus }) {
  if (!status) return <span style={{ color: 'rgba(255,255,255,0.3)' }}>—</span>;
  const c = CREDIT_COLORS[status];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 500,
      color: c.color, background: c.bg, border: `0.5px solid ${c.border}`,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function CustomerModal({
  open, onClose, onSaved, initial,
}: {
  open: boolean; onClose: () => void; onSaved: () => void; initial: Customer | null;
}) {
  const [form, setForm] = useState<CreateCustomerDto>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setError('');
      setForm(initial ? {
        code:          initial.code,
        name:          initial.name,
        legalName:     initial.legalName     ?? '',
        taxId:         initial.taxId         ?? '',
        phone:         initial.phone         ?? '',
        email:         initial.email         ?? '',
        website:       initial.website       ?? '',
        creditLimit:   initial.creditLimit != null ? Number(initial.creditLimit) : undefined,
        creditStatus:  initial.creditStatus  ?? 'good',
        paymentTerms:  initial.paymentTerms  ?? '',
        currency:      initial.currency      ?? 'USD',
        notes:         initial.notes         ?? '',
      } : EMPTY_FORM);
    }
  }, [open, initial]);

  const set = (key: keyof CreateCustomerDto) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }));

  const setNum = (key: keyof CreateCustomerDto) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setForm(f => ({ ...f, [key]: val === '' ? undefined : Number(val) }));
    };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code.trim() || !form.name.trim()) { setError('Code and name are required.'); return; }
    setSubmitting(true); setError('');
    try {
      if (initial) await customersApi.update(initial.id, form);
      else          await customersApi.create(form);
      onSaved(); onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Operation failed.');
    } finally { setSubmitting(false); }
  };

  if (!open) return null;

  return (
    <>
      <style>{`
        .cm-overlay {
          position: fixed; inset: 0; z-index: 400;
          background: rgba(0,0,0,0.65); backdrop-filter: blur(4px);
          display: flex; align-items: center; justify-content: center; padding: 24px;
        }
        .cm-box {
          background: #0e0b1a; border: 0.5px solid rgba(251,146,60,0.2);
          border-radius: 14px; width: 100%; max-width: 540px;
          max-height: 90vh; overflow-y: auto; position: relative;
          box-shadow: 0 24px 60px rgba(0,0,0,0.7);
        }
        .cm-box::before {
          content:''; position: absolute; top:0; left:30px; right:30px; height:1px;
          background: linear-gradient(90deg, transparent, rgba(251,146,60,0.4), transparent);
        }
        .cm-hdr {
          display: flex; align-items: center; justify-content: space-between;
          padding: 16px 20px 12px; border-bottom: 0.5px solid rgba(255,255,255,0.06);
          position: sticky; top:0; background:#0e0b1a; z-index:1;
        }
        .cm-title { font-size:14px; font-weight:500; color:#f1ede8; font-family:'IBM Plex Sans',sans-serif; }
        .cm-close {
          width:24px; height:24px; border-radius:6px; background:rgba(255,255,255,0.06);
          border:none; cursor:pointer; color:rgba(255,255,255,0.45); font-size:16px;
          display:flex; align-items:center; justify-content:center; transition:background 0.15s;
        }
        .cm-close:hover { background:rgba(255,255,255,0.1); color:rgba(255,255,255,0.8); }
        .cm-body { padding:16px 20px; display:flex; flex-direction:column; gap:12px; }
        .cm-row  { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
        .cm-row3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; }
        .cm-field { display:flex; flex-direction:column; gap:5px; }
        .cm-label {
          font-size:11px; font-weight:500; letter-spacing:0.08em; text-transform:uppercase;
          color:rgba(251,146,60,0.6); font-family:'IBM Plex Sans',sans-serif;
        }
        .cm-input, .cm-select, .cm-textarea {
          background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.1);
          border-radius:7px; padding:9px 12px; font-size:13px;
          font-family:'IBM Plex Sans',sans-serif; color:#f1ede8; outline:none; width:100%;
          transition:border-color 0.2s, box-shadow 0.2s;
        }
        .cm-input::placeholder, .cm-textarea::placeholder { color:rgba(255,255,255,0.18); }
        .cm-input:focus, .cm-select:focus, .cm-textarea:focus {
          border-color:rgba(251,146,60,0.45); box-shadow:0 0 0 2px rgba(234,88,12,0.1);
        }
        .cm-select option { background:#0e0b1a; color:#f1ede8; }
        .cm-textarea { resize:vertical; min-height:68px; }
        .cm-error {
          background:rgba(239,68,68,0.1); border:0.5px solid rgba(239,68,68,0.25);
          border-radius:7px; padding:8px 12px; font-size:12px; color:#fca5a5;
          font-family:'IBM Plex Sans',sans-serif;
        }
        .cm-ftr {
          display:flex; justify-content:flex-end; gap:8px;
          padding:12px 20px 18px; border-top:0.5px solid rgba(255,255,255,0.06);
        }
        .cm-btn-cancel {
          background:rgba(255,255,255,0.05); border:0.5px solid rgba(255,255,255,0.1);
          border-radius:7px; padding:8px 16px; font-size:13px;
          font-family:'IBM Plex Sans',sans-serif; color:rgba(255,255,255,0.5); cursor:pointer;
          transition:background 0.15s;
        }
        .cm-btn-cancel:hover { background:rgba(255,255,255,0.08); color:rgba(255,255,255,0.75); }
        .cm-btn-save {
          background:linear-gradient(135deg,#c2410c,#ea580c,#f97316); border:none;
          border-radius:7px; padding:8px 20px; font-size:13px; font-weight:500;
          font-family:'IBM Plex Sans',sans-serif; color:white; cursor:pointer;
          box-shadow:0 3px 12px rgba(234,88,12,0.35); transition:opacity 0.2s;
        }
        .cm-btn-save:disabled { opacity:0.5; cursor:not-allowed; }
        .cm-btn-save:hover:not(:disabled) { opacity:0.88; }
      `}</style>

      <div className="cm-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="cm-box">
          <div className="cm-hdr">
            <span className="cm-title">{initial ? 'Edit Customer' : 'New Customer'}</span>
            <button className="cm-close" onClick={onClose}>×</button>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="cm-body">
              {error && <div className="cm-error">{error}</div>}

              <div className="cm-row">
                <div className="cm-field">
                  <label className="cm-label">Code *</label>
                  <input className="cm-input" placeholder="CUST001" value={form.code} onChange={set('code')} required />
                </div>
                <div className="cm-field">
                  <label className="cm-label">Currency</label>
                  <select className="cm-select" value={form.currency} onChange={set('currency')}>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="DOP">DOP</option>
                    <option value="GBP">GBP</option>
                  </select>
                </div>
              </div>

              <div className="cm-field">
                <label className="cm-label">Name *</label>
                <input className="cm-input" placeholder="ABC Manufacturing Inc." value={form.name} onChange={set('name')} required />
              </div>

              <div className="cm-field">
                <label className="cm-label">Legal Name</label>
                <input className="cm-input" placeholder="ABC Manufacturing Incorporated" value={form.legalName} onChange={set('legalName')} />
              </div>

              <div className="cm-row">
                <div className="cm-field">
                  <label className="cm-label">Tax ID</label>
                  <input className="cm-input" placeholder="987-65-4321" value={form.taxId} onChange={set('taxId')} />
                </div>
                <div className="cm-field">
                  <label className="cm-label">Payment Terms</label>
                  <input className="cm-input" placeholder="Net 30" value={form.paymentTerms} onChange={set('paymentTerms')} />
                </div>
              </div>

              <div className="cm-row">
                <div className="cm-field">
                  <label className="cm-label">Phone</label>
                  <input className="cm-input" placeholder="+1-555-0188" value={form.phone} onChange={set('phone')} />
                </div>
                <div className="cm-field">
                  <label className="cm-label">Email</label>
                  <input className="cm-input" type="email" placeholder="contact@abcmfg.com" value={form.email} onChange={set('email')} />
                </div>
              </div>

              <div className="cm-field">
                <label className="cm-label">Website</label>
                <input className="cm-input" placeholder="https://abcmfg.com" value={form.website} onChange={set('website')} />
              </div>

              <div className="cm-row">
                <div className="cm-field">
                  <label className="cm-label">Credit Limit</label>
                  <input
                    className="cm-input" type="number" min="0" placeholder="50000"
                    value={form.creditLimit ?? ''} onChange={setNum('creditLimit')}
                  />
                </div>
                <div className="cm-field">
                  <label className="cm-label">Credit Status</label>
                  <select className="cm-select" value={form.creditStatus} onChange={set('creditStatus')}>
                    <option value="good">Good</option>
                    <option value="watch">Watch</option>
                    <option value="hold">Hold</option>
                  </select>
                </div>
              </div>

              <div className="cm-field">
                <label className="cm-label">Notes</label>
                <textarea className="cm-textarea" placeholder="Additional notes..." value={form.notes} onChange={set('notes')} />
              </div>
            </div>
            <div className="cm-ftr">
              <button type="button" className="cm-btn-cancel" onClick={onClose}>Cancel</button>
              <button type="submit" className="cm-btn-save" disabled={submitting}>
                {submitting ? 'Saving…' : initial ? 'Save Changes' : 'Create Customer'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

// ─── Delete confirm ───────────────────────────────────────────────────────────

function DeleteConfirm({ customer, onCancel, onConfirm, busy }: {
  customer: Customer; onCancel: () => void; onConfirm: () => void; busy: boolean;
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
        <div style={{ fontSize: 14, fontWeight: 500, color: '#f1ede8', marginBottom: 10 }}>Delete customer?</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 20, lineHeight: 1.5 }}>
          <strong style={{ color: '#f1ede8' }}>{customer.name}</strong> ({customer.code}) will be soft-deleted and removed from active records.
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

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filtered,  setFiltered]  = useState<Customer[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [search,    setSearch]    = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing,   setEditing]   = useState<Customer | null>(null);
  const [deleting,  setDeleting]  = useState<Customer | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const fetchCustomers = useCallback(async () => {
    try {
      setLoading(true);
      const data = await customersApi.getAll();
      setCustomers(data);
      setFiltered(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load customers.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(q ? customers.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.code.toLowerCase().includes(q) ||
      (c.email ?? '').toLowerCase().includes(q) ||
      (c.creditStatus ?? '').toLowerCase().includes(q)
    ) : customers);
  }, [search, customers]);

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await customersApi.remove(deleting.id);
      setDeleting(null);
      fetchCustomers();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Delete failed.');
      setDeleting(null);
    } finally { setDeleteBusy(false); }
  };

  return (
    <ERPShell breadcrumbs={['Home', 'Sales', 'Customers']} title="Customers">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap');
        .cust-page { padding: 0 18px 24px; }
        .cust-toolbar {
          display:flex; align-items:center; justify-content:space-between;
          margin-bottom:14px; gap:12px; flex-wrap:wrap;
        }
        .cust-search {
          background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.09);
          border-radius:7px; padding:7px 12px; font-size:12px;
          font-family:'IBM Plex Sans',sans-serif; color:#e2dfd8; outline:none; width:260px;
          transition:border-color 0.2s, box-shadow 0.2s;
        }
        .cust-search::placeholder { color:rgba(255,255,255,0.2); }
        .cust-search:focus { border-color:rgba(251,146,60,0.4); box-shadow:0 0 0 2px rgba(234,88,12,0.08); }
        .cust-btn-new {
          display:flex; align-items:center; gap:6px;
          background:linear-gradient(135deg,#c2410c,#ea580c,#f97316);
          border:none; border-radius:7px; padding:7px 14px;
          font-size:12px; font-weight:500; font-family:'IBM Plex Sans',sans-serif;
          color:white; cursor:pointer; box-shadow:0 3px 12px rgba(234,88,12,0.3);
          transition:opacity 0.15s, transform 0.15s; flex-shrink:0;
        }
        .cust-btn-new:hover { opacity:0.88; transform:translateY(-1px); }
        .cust-btn-new svg { width:13px; height:13px; display:block; flex-shrink:0; }
        .cust-wrap {
          background:rgba(10,7,18,0.7); border:0.5px solid rgba(251,146,60,0.12);
          border-radius:10px; overflow:hidden;
        }
        .cust-table { width:100%; border-collapse:collapse; }
        .cust-table thead th {
          padding:9px 14px; font-size:10px; font-weight:500;
          letter-spacing:0.1em; text-transform:uppercase; color:rgba(251,146,60,0.55);
          background:rgba(251,146,60,0.05); border-bottom:0.5px solid rgba(255,255,255,0.06);
          text-align:left; white-space:nowrap;
        }
        .cust-table tbody td {
          padding:10px 14px; border-bottom:0.5px solid rgba(255,255,255,0.04);
          vertical-align:middle; font-size:13px;
        }
        .cust-table tbody tr:last-child td { border-bottom:none; }
        .cust-table tbody tr:hover td { background:rgba(251,146,60,0.03); }
        .cust-code { font-family:'IBM Plex Mono',monospace; font-size:12px; color:#fb923c; }
        .cust-name { color:#e2dfd8; font-weight:500; }
        .cust-muted { color:rgba(255,255,255,0.45); }
        .cust-actions { display:flex; gap:6px; }
        .cust-btn-edit, .cust-btn-del {
          padding:5px 10px; border-radius:6px; font-size:11px;
          font-family:'IBM Plex Sans',sans-serif; cursor:pointer;
          border:0.5px solid transparent; transition:background 0.15s; white-space:nowrap;
        }
        .cust-btn-edit {
          background:rgba(255,255,255,0.05); color:rgba(255,255,255,0.55);
          border-color:rgba(255,255,255,0.1);
        }
        .cust-btn-edit:hover { background:rgba(255,255,255,0.09); color:rgba(255,255,255,0.8); }
        .cust-btn-del { background:rgba(239,68,68,0.08); color:#f87171; border-color:rgba(239,68,68,0.2); }
        .cust-btn-del:hover { background:rgba(239,68,68,0.14); }
        .cust-empty, .cust-loading {
          text-align:center; padding:52px 24px; color:rgba(255,255,255,0.25); font-size:13px;
          display:flex; flex-direction:column; align-items:center; gap:10px;
        }
        .cust-spinner {
          width:18px; height:18px; border-radius:50%;
          border:2px solid rgba(251,146,60,0.2); border-top-color:#fb923c;
          animation:cust-spin 0.7s linear infinite; flex-shrink:0;
        }
        @keyframes cust-spin { to { transform:rotate(360deg); } }
        .cust-footer {
          font-size:11px; color:rgba(255,255,255,0.22); padding:8px 14px;
          border-top:0.5px solid rgba(255,255,255,0.04);
        }
        .cust-error {
          background:rgba(239,68,68,0.08); border:0.5px solid rgba(239,68,68,0.2);
          border-radius:8px; padding:10px 14px; margin-bottom:14px;
          font-size:13px; color:#fca5a5;
        }
      `}</style>

      <div className="cust-page">
        <div className="cust-toolbar">
          <input
            className="cust-search"
            placeholder="Search by name, code, email…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <button className="cust-btn-new" onClick={() => { setEditing(null); setModalOpen(true); }}>
            <svg viewBox="0 0 13 13" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
              <line x1="6.5" y1="1" x2="6.5" y2="12" />
              <line x1="1" y1="6.5" x2="12" y2="6.5" />
            </svg>
            New Customer
          </button>
        </div>

        {error && <div className="cust-error">{error}</div>}

        <div className="cust-wrap">
          {loading ? (
            <div className="cust-loading"><div className="cust-spinner" />Loading customers…</div>
          ) : filtered.length === 0 ? (
            <div className="cust-empty">
              {search ? 'No customers match your search.' : 'No customers yet. Create your first one.'}
            </div>
          ) : (
            <>
              <table className="cust-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Credit Status</th>
                    <th>Credit Limit</th>
                    <th>Payment Terms</th>
                    <th>Currency</th>
                    <th>Email</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(c => (
                    <tr key={c.id}>
                      <td><span className="cust-code">{c.code}</span></td>
                      <td><span className="cust-name">{c.name}</span></td>
                      <td><CreditBadge status={c.creditStatus} /></td>
                      <td><span className="cust-muted">{fmtCurrency(c.creditLimit != null ? Number(c.creditLimit) : undefined)}</span></td>
                      <td><span className="cust-muted">{fmt(c.paymentTerms)}</span></td>
                      <td><span className="cust-muted">{fmt(c.currency)}</span></td>
                      <td><span className="cust-muted">{fmt(c.email)}</span></td>
                      <td>
                        <div className="cust-actions">
                          <button className="cust-btn-edit" onClick={() => { setEditing(c); setModalOpen(true); }}>Edit</button>
                          <button className="cust-btn-del"  onClick={() => setDeleting(c)}>Delete</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="cust-footer">
                {filtered.length} of {customers.length} customer{customers.length !== 1 ? 's' : ''}
              </div>
            </>
          )}
        </div>
      </div>

      <CustomerModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={fetchCustomers}
        initial={editing}
      />

      {deleting && (
        <DeleteConfirm
          customer={deleting}
          onCancel={() => setDeleting(null)}
          onConfirm={handleDelete}
          busy={deleteBusy}
        />
      )}
    </ERPShell>
  );
}