"use client";
// ============================================================================
// frontend/app/accounting/chart-of-accounts/page.tsx
// spec-ux-t6-finance T6.1 — ERPTreeTable (account hierarchy) + FormModal +
// SearchSelect + ConfirmModal.
// ============================================================================
import { useEffect, useState, useCallback, useMemo } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import SearchSelect from '@/components/ui/SearchSelect';
import { ERPTreeTable, ERPTreeColumn } from '@/components/ui/ERPTreeTable';
import { FormModal } from '@/components/ui/modal/FormModal';
import { ConfirmModal } from '@/components/ui/modal/ConfirmModal';
import { chartOfAccountsApi } from '@/lib/api/chart-of-accounts';
import { Account, CreateAccountDto, AccountType } from '@/lib/api/types';

const ACCOUNT_TYPES: { value: AccountType; label: string; color: string; bg: string; border: string }[] = [
  { value: 'asset',     label: 'Asset',     color: 'var(--accent-blue, #60a5fa)', bg: 'rgba(96,165,250,0.1)',  border: 'rgba(96,165,250,0.2)' },
  { value: 'liability', label: 'Liability', color: 'var(--danger, #f87171)', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.2)' },
  { value: 'equity',    label: 'Equity',    color: 'var(--accent-violet, #a78bfa)', bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.2)' },
  { value: 'revenue',   label: 'Revenue',   color: 'var(--success, #4ade80)', bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.2)' },
  { value: 'cost',      label: 'Cost',      color: 'var(--warning, #fbbf24)', bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.2)'  },
  { value: 'expense',   label: 'Expense',   color: 'var(--accent-strong, #fb923c)', bg: 'rgba(251,146,60,0.1)',  border: 'rgba(251,146,60,0.18)' },
];
const EMPTY_FORM: CreateAccountDto = { accountNumber: '', name: '', accountType: 'asset', accountCategory: '', currency: 'USD', isActive: true, allowManualPosting: true };
const CURRENCIES = ['USD', 'EUR', 'DOP', 'GBP'];
const getTypeConfig = (t: AccountType) => ACCOUNT_TYPES.find(x => x.value === t) ?? ACCOUNT_TYPES[0];
const fmt = (v?: string | null) => v || '—';

const INP: React.CSSProperties = { background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '9px 12px', fontSize: 13, fontFamily: "'IBM Plex Sans',sans-serif", color: 'var(--text-strong, #f1ede8)', outline: 'none', width: '100%' };
const LBL: React.CSSProperties = { fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(251,146,60,0.6)' };

function TypeBadge({ type }: { type: AccountType }) {
  const c = getTypeConfig(type);
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 500, color: c.color, background: c.bg, border: `0.5px solid ${c.border}`, whiteSpace: 'nowrap' }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: c.color, flexShrink: 0 }} />{c.label}
    </span>
  );
}
function HeaderBadge({ category }: { category?: string }) {
  if (category !== 'header') return null;
  return <span style={{ display: 'inline-flex', padding: '1px 7px', borderRadius: 20, fontSize: 10, color: 'rgba(251,191,36,0.8)', background: 'rgba(251,191,36,0.08)', border: '0.5px solid rgba(251,191,36,0.2)', fontWeight: 500, whiteSpace: 'nowrap' }}>Header</span>;
}
function PostingBadge({ allowed }: { allowed: boolean }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10, color: allowed ? 'var(--success, #4ade80)' : 'rgba(255,255,255,0.25)' }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: allowed ? 'var(--success, #4ade80)' : 'rgba(255,255,255,0.2)', flexShrink: 0 }} />{allowed ? 'Posting' : 'No posting'}
    </span>
  );
}

// ─── Create / edit modal (shared FormModal) ─────────────────────────────────
function AccountModal({ open, onClose, onSaved, initial, accounts }: {
  open: boolean; onClose: () => void; onSaved: () => void; initial: Account | null; accounts: Account[];
}) {
  const [form, setForm]             = useState<CreateAccountDto>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setForm(initial ? {
        accountNumber: initial.accountNumber, name: initial.name, accountType: initial.accountType,
        accountCategory: initial.accountCategory ?? '', parentAccountId: initial.parentAccountId ?? '',
        currency: initial.currency ?? 'USD', isActive: initial.isActive, allowManualPosting: initial.allowManualPosting,
      } : EMPTY_FORM);
    }
  }, [open, initial]);

  const set = (key: keyof CreateAccountDto) =>
    (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [key]: e.target.value }));

  const submit = async () => {
    if (!form.accountNumber?.trim() || !form.name?.trim()) { setError('Account number and name are required.'); return; }
    const payload = { ...form, accountNumber: form.accountNumber.trim(), name: form.name.trim(), accountCategory: form.accountCategory?.trim() || undefined, parentAccountId: form.parentAccountId?.trim() || undefined };
    setSubmitting(true); setError(null);
    try {
      if (initial) await chartOfAccountsApi.update(initial.id, payload);
      else         await chartOfAccountsApi.create(payload);
      onSaved(); onClose();
    } catch (err) {
      setError((err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Operation failed.');
    } finally { setSubmitting(false); }
  };

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) =>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}><label style={LBL}>{label}</label>{children}</div>;
  const Toggle = ({ k, label }: { k: string; label: string }) => {
    const on = !!(form as unknown as Record<string, unknown>)[k];
    return (
      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: on ? 'var(--text-primary, #e2dfd8)' : 'rgba(255,255,255,0.4)', userSelect: 'none' }}>
        <div onClick={() => setForm(f => ({ ...f, [k]: !(f as unknown as Record<string, unknown>)[k] }))} style={{ width: 32, height: 18, borderRadius: 9, flexShrink: 0, cursor: 'pointer', background: on ? 'rgba(234,88,12,0.8)' : 'rgba(255,255,255,0.1)', border: `0.5px solid ${on ? 'rgba(251,146,60,0.5)' : 'rgba(255,255,255,0.15)'}`, position: 'relative' }}>
          <div style={{ position: 'absolute', top: 2, left: on ? 16 : 2, width: 13, height: 13, borderRadius: '50%', background: '#fff', transition: 'left 0.2s' }} />
        </div>{label}
      </label>
    );
  };

  return (
    <FormModal open={open} onClose={onClose} title={initial ? `Edit — ${initial.accountNumber}` : 'New Account'} submitLabel={initial ? 'Save Changes' : 'Create Account'} submitting={submitting} isValid={!!form.accountNumber?.trim() && !!form.name?.trim()} error={error} onSubmit={submit} width={540}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Account Number *"><input style={INP} placeholder="1000" value={form.accountNumber ?? ''} onChange={set('accountNumber')} autoFocus /></Field>
          <Field label="Account Type *">
            <SearchSelect options={ACCOUNT_TYPES.map(t => ({ value: t.value, label: t.label }))} value={form.accountType} onChange={v => setForm(f => ({ ...f, accountType: v as AccountType }))} placeholder="Type…" minWidth={200} />
          </Field>
        </div>
        <Field label="Name *"><input style={INP} placeholder="Cash in Bank" value={form.name ?? ''} onChange={set('name')} /></Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Category"><input style={INP} placeholder="current_asset" value={form.accountCategory ?? ''} onChange={set('accountCategory')} /></Field>
          <Field label="Currency">
            <SearchSelect options={CURRENCIES.map(c => ({ value: c, label: c }))} value={form.currency ?? 'USD'} onChange={v => setForm(f => ({ ...f, currency: v }))} placeholder="Currency…" minWidth={160} />
          </Field>
        </div>
        <Field label="Parent Account">
          <SearchSelect
            options={accounts.filter(a => !initial || a.id !== initial.id).map(a => ({ value: a.id, label: `${a.accountNumber} — ${a.name}` }))}
            value={form.parentAccountId ?? ''}
            onChange={v => setForm(f => ({ ...f, parentAccountId: v }))}
            placeholder="Search parent…"
            clearLabel="— None (root account) —"
            minWidth={320}
          />
        </Field>
        <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', padding: '4px 0 2px', borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>Properties</div>
        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
          <Toggle k="isActive" label="Active" />
          <Toggle k="allowManualPosting" label="Allow Manual Posting" />
          <Toggle k="requireReconciliation" label="Require Reconciliation" />
        </div>
      </div>
    </FormModal>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function ChartOfAccountsPage() {
  const [accounts,   setAccounts]   = useState<Account[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [search,     setSearch]     = useState('');
  const [typeFilter, setTypeFilter] = useState<AccountType | ''>('');
  const [modalOpen,  setModalOpen]  = useState(false);
  const [editing,    setEditing]    = useState<Account | null>(null);
  const [deleting,   setDeleting]   = useState<Account | null>(null);

  const fetchAccounts = useCallback(async () => {
    try { setLoading(true); setAccounts(await chartOfAccountsApi.getAll()); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed to load accounts.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  // ── Tree structure + filter-aware visibility ─────────────────────────────────
  const childrenOf = useCallback((id: string | null) => accounts.filter(a => (a.parentAccountId ?? null) === id), [accounts]);
  const matches = useCallback((a: Account) => {
    const q = search.toLowerCase();
    const matchSearch = !q || a.accountNumber.toLowerCase().includes(q) || a.name.toLowerCase().includes(q) || (a.accountCategory ?? '').toLowerCase().includes(q);
    const matchType = !typeFilter || a.accountType === typeFilter;
    return matchSearch && matchType;
  }, [search, typeFilter]);
  const subtreeMatches = useCallback((a: Account): boolean => matches(a) || childrenOf(a.id).some(subtreeMatches), [matches, childrenOf]);

  // Roots = accounts whose parent isn't present in the set (true roots + orphans)
  const ids = useMemo(() => new Set(accounts.map(a => a.id)), [accounts]);
  const roots = useMemo(
    () => accounts.filter(a => !a.parentAccountId || !ids.has(a.parentAccountId)).filter(subtreeMatches),
    [accounts, ids, subtreeMatches],
  );

  const typeCounts = ACCOUNT_TYPES.map(t => ({ ...t, count: accounts.filter(a => a.accountType === t.value).length }));

  // Recursive child rows for the expand panel
  function ChildRows({ parentId, depth }: { parentId: string; depth: number }) {
    const kids = childrenOf(parentId).filter(subtreeMatches);
    if (kids.length === 0) return null;
    return (
      <div style={{ display: 'flex', flexDirection: 'column' }}>
        {kids.map(a => (
          <div key={a.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 14px', paddingLeft: 14 + depth * 22, borderBottom: '0.5px solid rgba(255,255,255,0.03)' }}>
              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: 'var(--accent-strong, #fb923c)', fontWeight: 500, minWidth: 70 }}>{a.accountNumber}</span>
              <span style={{ color: 'var(--text-primary, #e2dfd8)', fontSize: 12 }}>{a.name}</span>
              <HeaderBadge category={a.accountCategory} />
              <TypeBadge type={a.accountType} />
              <PostingBadge allowed={a.allowManualPosting} />
              <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                <button onClick={() => { setEditing(a); setModalOpen(true); }} style={{ padding: '3px 9px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.55)', fontFamily: "'IBM Plex Sans',sans-serif" }}>Edit</button>
                <button onClick={() => setDeleting(a)} style={{ padding: '3px 9px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.2)', color: 'var(--danger, #f87171)', fontFamily: "'IBM Plex Sans',sans-serif" }}>Delete</button>
              </div>
            </div>
            <ChildRows parentId={a.id} depth={depth + 1} />
          </div>
        ))}
      </div>
    );
  }

  const columns = useMemo<ERPTreeColumn<Account>[]>(() => [
    { key: 'accountNumber', header: 'Number', width: 130, sortable: true, value: r => r.accountNumber, render: r => <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, color: 'var(--accent-strong, #fb923c)', fontWeight: 500 }}>{r.accountNumber}</span> },
    { key: 'name', header: 'Name', sortable: true, value: r => r.name, render: r => <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ color: 'var(--text-primary, #e2dfd8)', fontWeight: 500 }}>{r.name}</span><HeaderBadge category={r.accountCategory} /></div> },
    { key: 'accountType', header: 'Type', width: 120, sortable: true, value: r => r.accountType, render: r => <TypeBadge type={r.accountType} /> },
    { key: 'accountCategory', header: 'Category', width: 150, sortable: true, value: r => r.accountCategory ?? '', render: r => <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>{fmt(r.accountCategory)}</span> },
    { key: 'allowManualPosting', header: 'Posting', width: 110, sortable: true, value: r => r.allowManualPosting ? 'Posting' : '', render: r => <PostingBadge allowed={r.allowManualPosting} /> },
    { key: 'currency', header: 'Currency', width: 90, sortable: true, value: r => r.currency ?? '', render: r => <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>{fmt(r.currency)}</span> },
    {
      key: '_actions', header: '', width: 130, sortable: false,
      render: r => (
        <div style={{ display: 'flex', gap: 6 }} onClick={e => e.stopPropagation()}>
          <button onClick={() => { setEditing(r); setModalOpen(true); }} style={{ padding: '5px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.55)', fontFamily: "'IBM Plex Sans',sans-serif" }}>Edit</button>
          <button onClick={() => setDeleting(r)} style={{ padding: '5px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.2)', color: 'var(--danger, #f87171)', fontFamily: "'IBM Plex Sans',sans-serif" }}>Delete</button>
        </div>
      ),
    },
  ], []);

  return (
    <ERPShell breadcrumbs={['Home', 'Financial', 'Chart of Accounts']} title="Chart of Accounts">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap');
        .coa-page { padding: 0 18px 12px; display:flex; flex-direction:column; height:100%; overflow:hidden; }
        .coa-stats { display:flex; gap:10px; margin-bottom:12px; flex-wrap:wrap; flex-shrink:0; }
        .coa-stat { background:rgba(10,7,18,0.7); border-radius:8px; padding:8px 14px; display:flex; flex-direction:column; gap:2px; min-width:90px; cursor:pointer; transition:opacity 0.15s; }
        .coa-stat:hover { opacity:0.8; }
        .coa-stat-label { font-size:10px; font-weight:500; letter-spacing:0.08em; text-transform:uppercase; }
        .coa-stat-value { font-size:22px; font-weight:500; font-family:'IBM Plex Mono',monospace; color:var(--text-strong, #f1ede8); }
        .coa-btn-new { display:flex; align-items:center; gap:6px; background:linear-gradient(135deg,var(--accent-pressed, #c2410c),var(--accent, #ea580c),var(--accent-mid, #f97316)); border:none; border-radius:7px; padding:7px 14px; font-size:12px; font-weight:500; font-family:'IBM Plex Sans',sans-serif; color:white; cursor:pointer; box-shadow:0 3px 12px rgba(234,88,12,0.3); flex-shrink:0; align-self:flex-end; }
        .coa-btn-new:hover { opacity:0.88; }
        .coa-btn-new svg { width:13px; height:13px; display:block; flex-shrink:0; }
        .coa-error { background:rgba(239,68,68,0.08); border:0.5px solid rgba(239,68,68,0.2); border-radius:8px; padding:10px 14px; margin-bottom:10px; font-size:13px; color:var(--danger-subtle, #fca5a5); flex-shrink:0; }
        .coa-search { background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.09); border-radius:7px; padding:7px 12px; font-size:12px; font-family:'IBM Plex Sans',sans-serif; color:var(--text-primary, #e2dfd8); outline:none; width:260px; }
        .coa-search:focus { border-color:rgba(251,146,60,0.4); }
      `}</style>

      <div className="coa-page">
        {accounts.length > 0 && (
          <div className="coa-stats">
            {typeCounts.map(t => (
              <div key={t.value} className="coa-stat" style={{ border: `0.5px solid ${typeFilter === t.value ? t.border : 'rgba(255,255,255,0.07)'}` }} onClick={() => setTypeFilter(prev => prev === t.value ? '' : t.value)}>
                <span className="coa-stat-label" style={{ color: t.color }}>{t.label}</span>
                <span className="coa-stat-value">{t.count}</span>
              </div>
            ))}
            <div className="coa-stat" style={{ border: `0.5px solid ${!typeFilter ? 'rgba(251,146,60,0.3)' : 'rgba(255,255,255,0.07)'}` }} onClick={() => setTypeFilter('')}>
              <span className="coa-stat-label" style={{ color: 'rgba(251,146,60,0.6)' }}>Total</span>
              <span className="coa-stat-value" style={{ color: 'var(--accent-strong, #fb923c)' }}>{accounts.length}</span>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 10, flexShrink: 0, flexWrap: 'wrap' }}>
          <input className="coa-search" placeholder="Search by number, name, category…" value={search} onChange={e => setSearch(e.target.value)} />
          <div style={{ width: 200 }}>
            <SearchSelect options={ACCOUNT_TYPES.map(t => ({ value: t.value, label: t.label }))} value={typeFilter} onChange={v => setTypeFilter(v as AccountType | '')} placeholder="All Types" clearLabel="All Types" minWidth={200} />
          </div>
          <button className="coa-btn-new" onClick={() => { setEditing(null); setModalOpen(true); }}>
            <svg viewBox="0 0 13 13" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><line x1="6.5" y1="1" x2="6.5" y2="12" /><line x1="1" y1="6.5" x2="12" y2="6.5" /></svg>
            New Account
          </button>
        </div>

        {error && <div className="coa-error">{error}</div>}

        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <ERPTreeTable<Account>
            columns={columns}
            data={roots}
            rowKey={r => r.id}
            loading={loading}
            exportFilename="chart-of-accounts"
            emptyMessage={search || typeFilter ? 'No accounts match your filters.' : 'No accounts yet.'}
            defaultPageSize={50}
            canExpand={r => childrenOf(r.id).filter(subtreeMatches).length > 0}
            expandedRow={r => <ChildRows parentId={r.id} depth={1} />}
          />
        </div>
      </div>

      <AccountModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={fetchAccounts} initial={editing} accounts={accounts} />

      <ConfirmModal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete account?"
        description={deleting ? `${deleting.accountNumber} — ${deleting.name} will be soft-deleted. System accounts cannot be deleted.` : ''}
        variant="destructive"
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!deleting) return;
          await chartOfAccountsApi.remove(deleting.id);
          setDeleting(null);
          fetchAccounts();
        }}
      />
    </ERPShell>
  );
}
