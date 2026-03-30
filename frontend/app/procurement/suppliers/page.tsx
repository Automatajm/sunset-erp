"use client";

import { useEffect, useState, useCallback, useMemo } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import { ERPTable, ERPColumn } from '@/components/ui/ERPTable';
import { ERPFilterBar, ERPFilter, useERPFilters, applyERPFilters } from '@/components/ui/ERPFilterBar';
import { suppliersApi } from '@/lib/api/suppliers';
import { Supplier, CreateSupplierDto } from '@/lib/api/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const PAYMENT_TERMS = ['Net 15', 'Net 30', 'Net 45', 'Net 60', 'Net 90', 'Immediate', 'COD'];
const CURRENCIES    = ['USD', 'EUR', 'DOP', 'GBP', 'CAD', 'MXN'];

const EMPTY_FORM: CreateSupplierDto = {
  code: '', name: '', legalName: '', taxId: '',
  phone: '', email: '', website: '',
  paymentTerms: '', currency: 'USD',
  category: '', notes: '',
};

// ─── Badges ───────────────────────────────────────────────────────────────────

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

function SupplierModal({ open, onClose, onSaved, initial }: {
  open: boolean; onClose: () => void; onSaved: () => void; initial: Supplier | null;
}) {
  const [form,       setForm]       = useState<CreateSupplierDto>(EMPTY_FORM);
  const [tab,        setTab]        = useState<'general' | 'commercial'>('general');
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState('');

  useEffect(() => {
    if (open) {
      setError(''); setTab('general');
      setForm(initial ? {
        code: initial.code, name: initial.name,
        legalName: initial.legalName ?? '', taxId: initial.taxId ?? '',
        phone: initial.phone ?? '', email: initial.email ?? '',
        website: initial.website ?? '', paymentTerms: initial.paymentTerms ?? '',
        currency: initial.currency ?? 'USD',
        category: initial.category ?? '', notes: initial.notes ?? '',
      } : EMPTY_FORM);
    }
  }, [open, initial]);

  const set = (key: keyof CreateSupplierDto) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code.trim() || !form.name.trim()) { setError('Code and name are required.'); return; }
    setSubmitting(true); setError('');
    try {
      if (initial) await suppliersApi.update(initial.id, form);
      else          await suppliersApi.create(form);
      onSaved(); onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Operation failed.');
    } finally { setSubmitting(false); }
  };

  if (!open) return null;

  const F: React.CSSProperties = {
    background: '#0e0b1a', border: '0.5px solid rgba(255,255,255,0.1)',
    borderRadius: 7, padding: '9px 12px', fontSize: 13,
    fontFamily: "'IBM Plex Sans',sans-serif", color: '#f1ede8',
    outline: 'none', width: '100%',
  };
  const L: React.CSSProperties = {
    fontSize: 11, fontWeight: 500, letterSpacing: '0.08em',
    textTransform: 'uppercase', color: 'rgba(251,146,60,0.6)',
  };

  return (
    <>
      <style>{`
        .sm-overlay{position:fixed;inset:0;z-index:400;background:rgba(0,0,0,0.65);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:24px}
        .sm-box{background:#0e0b1a;border:0.5px solid rgba(251,146,60,0.2);border-radius:14px;width:100%;max-width:560px;max-height:92vh;display:flex;flex-direction:column;box-shadow:0 24px 60px rgba(0,0,0,0.7);position:relative}
        .sm-box::before{content:'';position:absolute;top:0;left:30px;right:30px;height:1px;background:linear-gradient(90deg,transparent,rgba(251,146,60,0.4),transparent);pointer-events:none}
        .sm-hdr{display:flex;align-items:center;justify-content:space-between;padding:14px 20px 0;flex-shrink:0}
        .sm-tabs{display:flex;padding:0 20px;border-bottom:0.5px solid rgba(255,255,255,0.06);flex-shrink:0}
        .sm-tab{padding:10px 14px;font-size:12px;cursor:pointer;color:rgba(255,255,255,0.4);border:none;border-bottom:2px solid transparent;background:none;font-family:'IBM Plex Sans',sans-serif;transition:color 0.15s;white-space:nowrap}
        .sm-tab:hover{color:rgba(255,255,255,0.7)}
        .sm-tab-on{color:#fb923c !important;border-bottom-color:#fb923c !important}
        .sm-scroll{flex:1;overflow-y:auto;min-height:0}
        .sm-body{padding:16px 20px;display:flex;flex-direction:column;gap:12px}
        .sm-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        .sm-row3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
        .sm-field{display:flex;flex-direction:column;gap:5px}
        .sm-section{font-size:10px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.25);padding:4px 0 2px;border-bottom:0.5px solid rgba(255,255,255,0.06);margin-top:4px}
        .sm-error{background:rgba(239,68,68,0.1);border:0.5px solid rgba(239,68,68,0.25);border-radius:7px;padding:8px 12px;font-size:12px;color:#fca5a5}
        .sm-ftr{display:flex;justify-content:flex-end;gap:8px;padding:12px 20px 18px;border-top:0.5px solid rgba(255,255,255,0.06);flex-shrink:0}
        .sm-btn-cancel{background:rgba(255,255,255,0.05);border:0.5px solid rgba(255,255,255,0.1);border-radius:7px;padding:8px 16px;font-size:13px;font-family:'IBM Plex Sans',sans-serif;color:rgba(255,255,255,0.5);cursor:pointer}
        .sm-btn-save{background:linear-gradient(135deg,#c2410c,#ea580c,#f97316);border:none;border-radius:7px;padding:8px 20px;font-size:13px;font-weight:500;font-family:'IBM Plex Sans',sans-serif;color:white;cursor:pointer;box-shadow:0 3px 12px rgba(234,88,12,0.35)}
        .sm-btn-save:disabled{opacity:0.5;cursor:not-allowed}
      `}</style>

      <div className="sm-overlay">
        <div className="sm-box">
          <div className="sm-hdr">
            <span style={{ fontSize: 14, fontWeight: 500, color: '#f1ede8' }}>
              {initial ? `Edit — ${initial.code}` : 'New Supplier'}
            </span>
            <button onClick={onClose} style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.45)', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
          </div>

          <div className="sm-tabs">
            {(['general', 'commercial'] as const).map(t => (
              <button key={t} type="button" className={`sm-tab${tab === t ? ' sm-tab-on' : ''}`} onClick={() => setTab(t)}>
                {t === 'general' ? 'General' : 'Commercial'}
              </button>
            ))}
          </div>

          <div className="sm-scroll">
            <form onSubmit={handleSubmit}>
              <div className="sm-body">
                {error && <div className="sm-error">{error}</div>}

                {tab === 'general' && (
                  <>
                    <div className="sm-row">
                      <div className="sm-field">
                        <label style={L}>Code *</label>
                        <input style={F} placeholder="SUP-001" value={form.code} onChange={set('code')} required />
                      </div>
                      <div className="sm-field">
                        <label style={L}>Category</label>
                        <input style={F} placeholder="Manufacturing" value={form.category} onChange={set('category')} />
                      </div>
                    </div>
                    <div className="sm-field">
                      <label style={L}>Name *</label>
                      <input style={F} placeholder="Acme Corporation" value={form.name} onChange={set('name')} required />
                    </div>
                    <div className="sm-field">
                      <label style={L}>Legal Name</label>
                      <input style={F} placeholder="Acme Corporation LLC" value={form.legalName} onChange={set('legalName')} />
                    </div>
                    <div className="sm-row">
                      <div className="sm-field">
                        <label style={L}>Tax ID / RNC</label>
                        <input style={F} placeholder="123-45678-9" value={form.taxId} onChange={set('taxId')} />
                      </div>
                      <div className="sm-field">
                        <label style={L}>Phone</label>
                        <input style={F} placeholder="+1-809-555-0123" value={form.phone} onChange={set('phone')} />
                      </div>
                    </div>
                    <div className="sm-row">
                      <div className="sm-field">
                        <label style={L}>Email</label>
                        <input style={F} type="email" placeholder="contact@acme.com" value={form.email} onChange={set('email')} />
                      </div>
                      <div className="sm-field">
                        <label style={L}>Website</label>
                        <input style={F} placeholder="https://acme.com" value={form.website} onChange={set('website')} />
                      </div>
                    </div>
                    <div className="sm-field">
                      <label style={L}>Notes</label>
                      <textarea style={{ ...F, resize: 'vertical', minHeight: 64 } as React.CSSProperties} placeholder="Internal notes…" value={form.notes} onChange={set('notes')} />
                    </div>
                  </>
                )}

                {tab === 'commercial' && (
                  <>
                    <div className="sm-row">
                      <div className="sm-field">
                        <label style={L}>Payment Terms</label>
                        <select style={{ ...F, cursor: 'pointer' }} value={form.paymentTerms} onChange={set('paymentTerms')}>
                          <option value="">— Select —</option>
                          {PAYMENT_TERMS.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div className="sm-field">
                        <label style={L}>Currency</label>
                        <select style={{ ...F, cursor: 'pointer' }} value={form.currency} onChange={set('currency')}>
                          {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>

                    <div style={{ background: 'rgba(251,146,60,0.04)', border: '0.5px solid rgba(251,146,60,0.12)', borderRadius: 8, padding: '10px 14px' }}>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', lineHeight: 1.6 }}>
                        💡 Credit limit, bank details and additional contacts can be configured after saving the supplier.
                      </div>
                    </div>
                  </>
                )}
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
      </div>
    </>
  );
}

// ─── Delete confirm ───────────────────────────────────────────────────────────

function DeleteConfirm({ supplier, onCancel, onConfirm, busy }: {
  supplier: Supplier; onCancel: () => void; onConfirm: () => void; busy: boolean;
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#0e0b1a', border: '0.5px solid rgba(239,68,68,0.25)', borderRadius: 14, width: '100%', maxWidth: 400, padding: '24px 24px 20px', boxShadow: '0 24px 60px rgba(0,0,0,0.7)' }}>
        <div style={{ fontSize: 14, fontWeight: 500, color: '#f1ede8', marginBottom: 10 }}>Delete supplier?</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 20, lineHeight: 1.5 }}>
          <strong style={{ color: '#f1ede8' }}>{supplier.name}</strong> ({supplier.code}) will be soft-deleted.
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button onClick={onCancel} style={{ background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '8px 16px', fontSize: 13, fontFamily: "'IBM Plex Sans',sans-serif", color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>Cancel</button>
          <button onClick={onConfirm} disabled={busy} style={{ background: 'rgba(239,68,68,0.15)', border: '0.5px solid rgba(239,68,68,0.35)', borderRadius: 7, padding: '8px 16px', fontSize: 13, fontWeight: 500, fontFamily: "'IBM Plex Sans',sans-serif", color: '#f87171', cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.5 : 1 }}>
            {busy ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Columns ──────────────────────────────────────────────────────────────────

function SUPPLIER_COLUMNS(
  onEdit: (s: Supplier) => void,
  onDelete: (s: Supplier) => void,
): ERPColumn<Supplier>[] {
  return [
    {
      key: 'code', header: 'Code', width: 110, sortable: true,
      value: r => r.code,
      render: r => <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: '#fb923c' }}>{r.code}</span>,
    },
    {
      key: 'name', header: 'Name', sortable: true,
      value: r => r.name,
      render: r => (
        <div>
          <div style={{ color: '#e2dfd8', fontWeight: 500 }}>{r.name}</div>
          {r.legalName && r.legalName !== r.name && (
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{r.legalName}</div>
          )}
        </div>
      ),
    },
    {
      key: 'category', header: 'Category', width: 120, sortable: true,
      value: r => r.category ?? '',
      render: r => r.category
        ? <span style={{ display: 'inline-flex', padding: '2px 7px', borderRadius: 20, fontSize: 10, fontWeight: 500, color: '#a78bfa', background: 'rgba(167,139,250,0.1)', border: '0.5px solid rgba(167,139,250,0.2)' }}>{r.category}</span>
        : <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>—</span>,
    },
    {
      key: 'paymentTerms', header: 'Terms', width: 90, sortable: true,
      value: r => r.paymentTerms ?? '',
      render: r => <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{r.paymentTerms || '—'}</span>,
    },
    {
      key: 'currency', header: 'Currency', width: 80, align: 'center', sortable: true,
      value: r => r.currency ?? '',
      render: r => <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{r.currency || '—'}</span>,
    },
    {
      key: 'email', header: 'Email', sortable: true,
      value: r => r.email ?? '',
      render: r => <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{r.email || '—'}</span>,
    },
    {
      key: 'phone', header: 'Phone', width: 130, sortable: false,
      render: r => <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{r.phone || '—'}</span>,
    },
    {
      key: 'isActive', header: 'Status', width: 90, sortable: true,
      value: r => r.isActive ? 'active' : 'inactive',
      render: r => <ActiveBadge active={r.isActive} />,
    },
    {
      key: '_actions', header: '', width: 110, sortable: false,
      render: r => (
        <div style={{ display: 'flex', gap: 6 }}>
          <button className="sup-btn-edit" onClick={e => { e.stopPropagation(); onEdit(r); }}>Edit</button>
          <button className="sup-btn-del"  onClick={e => { e.stopPropagation(); onDelete(r); }}>Delete</button>
        </div>
      ),
    },
  ];
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SuppliersPage() {
  const [suppliers,  setSuppliers]  = useState<Supplier[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [modalOpen,  setModalOpen]  = useState(false);
  const [editing,    setEditing]    = useState<Supplier | null>(null);
  const [deleting,   setDeleting]   = useState<Supplier | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  // ── Filters ─────────────────────────────────────────────────────────────────
  const categories = useMemo(() => {
    const cats = [...new Set(suppliers.map(s => s.category).filter(Boolean))];
    return cats.map(c => ({ value: c!, label: c! }));
  }, [suppliers]);

  const filterDefs = useMemo<ERPFilter<Supplier>[]>(() => [
    {
      key: 'category', label: 'Category', type: 'select', placeholder: 'All Categories',
      options: categories,
      filterFn: (row, val) => row.category === val,
    },
    {
      key: 'paymentTerms', label: 'Terms', type: 'select', placeholder: 'All Terms',
      options: PAYMENT_TERMS.map(t => ({ value: t, label: t })),
      filterFn: (row, val) => row.paymentTerms === val,
    },
    {
      key: 'currency', label: 'Currency', type: 'select', placeholder: 'All',
      options: CURRENCIES.map(c => ({ value: c, label: c })),
      filterFn: (row, val) => row.currency === val,
    },
    {
      key: 'isActive', label: 'Active only', type: 'boolean',
      filterFn: (row, val) => val === true ? row.isActive : true,
    },
  ], [categories]);

  const { values: filterVals, setValue: setFilterVal, reset: resetFilters, activeCount: filterCount } = useERPFilters(filterDefs);
  const filtered = useMemo(() => applyERPFilters(suppliers, filterDefs, filterVals), [suppliers, filterDefs, filterVals]);

  // ── Stats ────────────────────────────────────────────────────────────────────
  const stats = useMemo(() => ({
    total:    suppliers.length,
    active:   suppliers.filter(s => s.isActive).length,
    inactive: suppliers.filter(s => !s.isActive).length,
  }), [suppliers]);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const data = await suppliersApi.getAll();
      setSuppliers(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load suppliers.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await suppliersApi.remove(deleting.id);
      setDeleting(null); fetchAll();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Delete failed.');
      setDeleting(null);
    } finally { setDeleteBusy(false); }
  };

  return (
    <ERPShell breadcrumbs={['Home', 'Procurement', 'Suppliers']} title="Suppliers">
      <style>{`
        .sup-page{padding:0 18px 12px;display:flex;flex-direction:column;height:100%;overflow:hidden}
        .sup-btn-edit,.sup-btn-del{padding:5px 10px;border-radius:6px;font-size:11px;font-family:'IBM Plex Sans',sans-serif;cursor:pointer;border:0.5px solid transparent;transition:background 0.15s;white-space:nowrap}
        .sup-btn-edit{background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.55);border-color:rgba(255,255,255,0.1)}
        .sup-btn-edit:hover{background:rgba(255,255,255,0.09)}
        .sup-btn-del{background:rgba(239,68,68,0.08);color:#f87171;border-color:rgba(239,68,68,0.2)}
        .sup-btn-del:hover{background:rgba(239,68,68,0.14)}
        .sup-error{background:rgba(239,68,68,0.08);border:0.5px solid rgba(239,68,68,0.2);border-radius:8px;padding:10px 14px;margin-bottom:10px;font-size:13px;color:#fca5a5;flex-shrink:0}
      `}</style>

      <div className="sup-page">

        {/* Stats cards */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexShrink: 0 }}>
          {[
            { label: 'Total',    value: stats.total,    color: '#fb923c', border: 'rgba(251,146,60,0.2)' },
            { label: 'Active',   value: stats.active,   color: '#4ade80', border: 'rgba(74,222,128,0.2)' },
            { label: 'Inactive', value: stats.inactive, color: '#f87171', border: 'rgba(248,113,113,0.2)' },
          ].map(s => (
            <div key={s.label} style={{ background: 'rgba(10,7,18,0.7)', border: `0.5px solid ${s.border}`, borderRadius: 8, padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 80 }}>
              <span style={{ fontSize: 10, color: s.color, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500 }}>{s.label}</span>
              <span style={{ fontSize: 22, fontWeight: 500, color: '#f1ede8', fontFamily: "'IBM Plex Mono',monospace" }}>{s.value}</span>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 10, flexShrink: 0, flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}>
            <ERPFilterBar
              filters={filterDefs}
              values={filterVals}
              onChange={setFilterVal}
              onReset={resetFilters}
              activeCount={filterCount}
            />
          </div>
          <button
            onClick={() => { setEditing(null); setModalOpen(true); }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'linear-gradient(135deg,#c2410c,#ea580c,#f97316)', border: 'none', borderRadius: 7, padding: '7px 14px', fontSize: 12, fontWeight: 500, fontFamily: "'IBM Plex Sans',sans-serif", color: 'white', cursor: 'pointer', boxShadow: '0 3px 12px rgba(234,88,12,0.3)', flexShrink: 0, alignSelf: 'flex-end' }}
          >
            + New Supplier
          </button>
        </div>

        {error && <div className="sup-error">{error}</div>}

        {/* Table */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <ERPTable<Supplier>
            columns={SUPPLIER_COLUMNS(
              s => { setEditing(s); setModalOpen(true); },
              s => setDeleting(s),
            )}
            data={filtered}
            rowKey={r => r.id}
            loading={loading}
            exportFilename="suppliers"
            emptyMessage={filterCount ? 'No suppliers match your filters.' : 'No suppliers yet.'}
            defaultPageSize={25}
            maxHeight="100%"
          />
        </div>
      </div>

      <SupplierModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={fetchAll}
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