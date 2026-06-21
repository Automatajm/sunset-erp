"use client";
// ============================================================================
// frontend/app/sales/customers/page.tsx
// spec-ux-t5-sales T5.1 — ERPTable + ERPFilterBar + FormModal + SearchSelect + ConfirmModal.
// ============================================================================
import { useEffect, useState, useCallback, useMemo } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import SearchSelect from '@/components/ui/SearchSelect';
import { ERPTable, ERPColumn } from '@/components/ui/ERPTable';
import { ERPFilterBar, ERPFilter, useERPFilters, applyERPFilters } from '@/components/ui/ERPFilterBar';
import { FormModal } from '@/components/ui/modal/FormModal';
import { ConfirmModal } from '@/components/ui/modal/ConfirmModal';
import { PrintButton } from '@/components/print/PrintButton';
import { customersApi } from '@/lib/api/customers';
import { Customer, CreateCustomerDto, CreditStatus } from '@/lib/api/types';

const EMPTY_FORM: CreateCustomerDto = {
  name: '', legalName: '', taxId: '', phone: '', email: '', website: '',
  creditLimit: undefined, creditStatus: 'good', paymentTerms: '', currency: 'USD', notes: '',
};
const CURRENCIES = ['USD', 'EUR', 'DOP', 'GBP'];

function fmt(v?: string | number | null) {
  if (v === undefined || v === null || v === '') return '—';
  return String(v);
}
function fmtCurrency(v?: number | null) {
  if (v === undefined || v === null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(v);
}

const INP: React.CSSProperties = {
  background: 'var(--l04, rgba(255,255,255,0.04))', border: '0.5px solid var(--w10, rgba(255,255,255,0.1))',
  borderRadius: 7, padding: '9px 12px', fontSize: 13,
  fontFamily: "'IBM Plex Sans',sans-serif", color: 'var(--text-strong, #f1ede8)', outline: 'none', width: '100%',
};
const LBL: React.CSSProperties = {
  fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(251,146,60,0.6)',
};

// ─── Credit status badge ──────────────────────────────────────────────────────
const CREDIT_COLORS: Record<CreditStatus, { color: string; bg: string; border: string }> = {
  good:  { color: 'var(--success, #4ade80)', bg: 'rgba(74,222,128,0.1)',   border: 'rgba(74,222,128,0.2)' },
  watch: { color: 'var(--warning, #fbbf24)', bg: 'rgba(251,191,36,0.1)',   border: 'rgba(251,191,36,0.2)' },
  hold:  { color: 'var(--danger, #f87171)', bg: 'rgba(248,113,113,0.1)',  border: 'rgba(248,113,113,0.2)' },
};

function CreditBadge({ status }: { status?: CreditStatus }) {
  if (!status) return <span style={{ color: 'var(--w30, rgba(255,255,255,0.3))' }}>—</span>;
  const c = CREDIT_COLORS[status];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 500, color: c.color, background: c.bg, border: `0.5px solid ${c.border}` }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: c.color, flexShrink: 0 }} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// ─── Create / edit modal (shared FormModal) ─────────────────────────────────
function CustomerModal({ open, onClose, onSaved, initial }: {
  open: boolean; onClose: () => void; onSaved: () => void; initial: Customer | null;
}) {
  const [form, setForm]             = useState<CreateCustomerDto>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setForm(initial ? {
        name: initial.name, legalName: initial.legalName ?? '', taxId: initial.taxId ?? '',
        phone: initial.phone ?? '', email: initial.email ?? '', website: initial.website ?? '',
        creditLimit: initial.creditLimit != null ? Number(initial.creditLimit) : undefined,
        creditStatus: initial.creditStatus ?? 'good', paymentTerms: initial.paymentTerms ?? '',
        currency: initial.currency ?? 'USD', notes: initial.notes ?? '',
      } : EMPTY_FORM);
    }
  }, [open, initial]);

  const set = (key: keyof CreateCustomerDto) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm(f => ({ ...f, [key]: e.target.value }));
  const setNum = (key: keyof CreateCustomerDto) =>
    (e: React.ChangeEvent<HTMLInputElement>) => { const v = e.target.value; setForm(f => ({ ...f, [key]: v === '' ? undefined : Number(v) })); };

  const submit = async () => {
    if (!form.name.trim()) { setError('Name is required.'); return; }
    setSubmitting(true); setError(null);
    try {
      if (initial) await customersApi.update(initial.id, form);
      else         await customersApi.create(form);
      onSaved(); onClose();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Operation failed.');
    } finally { setSubmitting(false); }
  };

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) =>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}><label style={LBL}>{label}</label>{children}</div>;
  const Row = ({ children }: { children: React.ReactNode }) =>
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>{children}</div>;

  return (
    <FormModal
      open={open}
      onClose={onClose}
      title={initial ? `Edit — ${initial.code}` : 'New Customer'}
      submitLabel={initial ? 'Save Changes' : 'Create Customer'}
      submitting={submitting}
      isValid={!!form.name.trim()}
      error={error}
      onSubmit={submit}
      width={540}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Row>
          <Field label="Code"><input style={{ ...INP, opacity: 0.6 }} value={initial?.code ?? 'Auto (CL-YYYY-NNNN)'} disabled readOnly /></Field>
          <Field label="Currency">
            <SearchSelect options={CURRENCIES.map(c => ({ value: c, label: c }))} value={form.currency ?? 'USD'} onChange={v => setForm(f => ({ ...f, currency: v }))} placeholder="Currency…" minWidth={160} />
          </Field>
        </Row>
        <Field label="Name *"><input style={INP} placeholder="ABC Manufacturing Inc." value={form.name} onChange={set('name')} autoFocus /></Field>
        <Field label="Legal Name"><input style={INP} placeholder="ABC Manufacturing Incorporated" value={form.legalName} onChange={set('legalName')} /></Field>
        <Row>
          <Field label="Tax ID"><input style={INP} placeholder="987-65-4321" value={form.taxId} onChange={set('taxId')} /></Field>
          <Field label="Payment Terms"><input style={INP} placeholder="Net 30" value={form.paymentTerms} onChange={set('paymentTerms')} /></Field>
        </Row>
        <Row>
          <Field label="Phone"><input style={INP} placeholder="+1-555-0188" value={form.phone} onChange={set('phone')} /></Field>
          <Field label="Email"><input style={INP} type="email" placeholder="contact@abcmfg.com" value={form.email} onChange={set('email')} /></Field>
        </Row>
        <Field label="Website"><input style={INP} placeholder="https://abcmfg.com" value={form.website} onChange={set('website')} /></Field>
        <Row>
          <Field label="Credit Limit"><input style={INP} type="number" min="0" placeholder="50000" value={form.creditLimit ?? ''} onChange={setNum('creditLimit')} /></Field>
          <Field label="Credit Status">
            <SearchSelect options={[{ value: 'good', label: 'Good' }, { value: 'watch', label: 'Watch' }, { value: 'hold', label: 'Hold' }]} value={form.creditStatus ?? 'good'} onChange={v => setForm(f => ({ ...f, creditStatus: v as CreditStatus }))} placeholder="Status…" minWidth={180} />
          </Field>
        </Row>
        <Field label="Notes"><textarea style={{ ...INP, resize: 'vertical', minHeight: 68 }} placeholder="Additional notes..." value={form.notes ?? ''} onChange={set('notes')} /></Field>
      </div>
    </FormModal>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing,   setEditing]   = useState<Customer | null>(null);
  const [deleting,  setDeleting]  = useState<Customer | null>(null);

  const fetchCustomers = useCallback(async () => {
    try { setLoading(true); setCustomers(await customersApi.getAll()); }
    catch (err: any) { setError(err.message || 'Failed to load customers.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  // ── Filters ────────────────────────────────────────────────────────────────
  const filterDefs = useMemo<ERPFilter<Customer>[]>(() => [
    {
      key: 'search', label: 'Search', type: 'search', placeholder: 'Search name, code, email…',
      filterFn: (row, val) => {
        const q = String(val).toLowerCase();
        return row.name.toLowerCase().includes(q) || row.code.toLowerCase().includes(q) || (row.email ?? '').toLowerCase().includes(q);
      },
    },
    {
      key: 'creditStatus', label: 'Credit Status', type: 'multiselect',
      options: [
        { value: 'good',  label: 'Good',  color: 'var(--success, #4ade80)' },
        { value: 'watch', label: 'Watch', color: 'var(--warning, #fbbf24)' },
        { value: 'hold',  label: 'Hold',  color: 'var(--danger, #f87171)' },
      ],
    },
  ], []);

  const { values: filterVals, setValue: setFilterVal, reset: resetFilters, activeCount: filterCount } = useERPFilters(filterDefs);
  const filtered = useMemo(() => applyERPFilters(customers, filterDefs, filterVals), [customers, filterDefs, filterVals]);

  // ── Columns ────────────────────────────────────────────────────────────────
  const columns = useMemo<ERPColumn<Customer>[]>(() => [
    {
      key: 'code', header: 'Code', width: 150, sortable: true,
      value: r => r.code,
      render: r => <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: 'var(--accent-strong, #fb923c)' }}>{r.code}</span>,
    },
    {
      key: 'name', header: 'Name', sortable: true,
      value: r => r.name,
      render: r => <span style={{ color: 'var(--text-primary, #e2dfd8)', fontWeight: 500 }}>{r.name}</span>,
    },
    {
      key: 'creditStatus', header: 'Credit Status', width: 130, sortable: true,
      value: r => r.creditStatus ?? '',
      render: r => <CreditBadge status={r.creditStatus} />,
    },
    {
      key: 'creditLimit', header: 'Credit Limit', width: 120, align: 'right', sortable: true,
      value: r => r.creditLimit != null ? Number(r.creditLimit) : 0,
      render: r => <span style={{ color: 'var(--w45, rgba(255,255,255,0.45))' }}>{fmtCurrency(r.creditLimit != null ? Number(r.creditLimit) : undefined)}</span>,
    },
    {
      key: 'paymentTerms', header: 'Payment Terms', width: 130, sortable: true,
      value: r => r.paymentTerms ?? '',
      render: r => <span style={{ color: 'var(--w45, rgba(255,255,255,0.45))' }}>{fmt(r.paymentTerms)}</span>,
    },
    {
      key: 'currency', header: 'Currency', width: 90, sortable: true,
      value: r => r.currency ?? '',
      render: r => <span style={{ color: 'var(--w45, rgba(255,255,255,0.45))' }}>{fmt(r.currency)}</span>,
    },
    {
      key: 'email', header: 'Email', sortable: true,
      value: r => r.email ?? '',
      render: r => <span style={{ color: 'var(--w45, rgba(255,255,255,0.45))' }}>{fmt(r.email)}</span>,
    },
    {
      key: '_actions', header: '', width: 190, sortable: false,
      render: r => (
        <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
          <button onClick={() => { setEditing(r); setModalOpen(true); }}
            style={{ padding: '5px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'var(--l05, rgba(255,255,255,0.05))', border: '0.5px solid var(--w10, rgba(255,255,255,0.1))', color: 'var(--w55, rgba(255,255,255,0.55))', fontFamily: "'IBM Plex Sans',sans-serif" }}>Edit</button>
          <button onClick={() => setDeleting(r)}
            style={{ padding: '5px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.2)', color: 'var(--danger, #f87171)', fontFamily: "'IBM Plex Sans',sans-serif" }}>Delete</button>
          <PrintButton doc="customer-statement" id={r.id} label="Statement" style={{ padding: '3px 9px', fontSize: 11 }} />
        </div>
      ),
    },
  ], []);

  return (
    <ERPShell breadcrumbs={['Home', 'Sales', 'Customers']} title="Customers">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap');
        .cust-page{padding:0 18px 12px;display:flex;flex-direction:column;height:100%;overflow:hidden}
        .cust-error{background:rgba(239,68,68,0.08);border:0.5px solid rgba(239,68,68,0.2);border-radius:8px;padding:10px 14px;margin-bottom:10px;font-size:13px;color:var(--danger-subtle, #fca5a5);flex-shrink:0}
        .cust-btn-new{display:flex;align-items:center;gap:6px;background:linear-gradient(135deg,var(--accent-pressed, #c2410c),var(--accent, #ea580c),var(--accent-mid, #f97316));border:none;border-radius:7px;padding:7px 14px;font-size:12px;font-weight:500;font-family:'IBM Plex Sans',sans-serif;color:white;cursor:pointer;box-shadow:0 3px 12px rgba(234,88,12,0.3);transition:opacity 0.15s;flex-shrink:0;align-self:flex-end}
        .cust-btn-new:hover{opacity:0.88}
        .cust-btn-new svg{width:13px;height:13px;display:block;flex-shrink:0}
      `}</style>

      <div className="cust-page">
        {error && <div className="cust-error">{error}</div>}

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 10, flexShrink: 0, flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}>
            <ERPFilterBar filters={filterDefs} values={filterVals} onChange={setFilterVal} onReset={resetFilters} activeCount={filterCount} />
          </div>
          <button className="cust-btn-new" onClick={() => { setEditing(null); setModalOpen(true); }}>
            <svg viewBox="0 0 13 13" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><line x1="6.5" y1="1" x2="6.5" y2="12" /><line x1="1" y1="6.5" x2="12" y2="6.5" /></svg>
            New Customer
          </button>
        </div>

        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <ERPTable<Customer>
            columns={columns}
            data={filtered}
            rowKey={r => r.id}
            loading={loading}
            exportFilename="customers"
            emptyMessage={filterCount ? 'No customers match your filters.' : 'No customers yet. Create your first one.'}
            defaultPageSize={25}
            maxHeight="100%"
          />
        </div>
      </div>

      <CustomerModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={fetchCustomers} initial={editing} />

      <ConfirmModal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete customer?"
        description={deleting ? `${deleting.name} (${deleting.code}) will be soft-deleted and removed from active records.` : ''}
        variant="destructive"
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!deleting) return;
          await customersApi.remove(deleting.id);
          setDeleting(null);
          fetchCustomers();
        }}
      />
    </ERPShell>
  );
}
