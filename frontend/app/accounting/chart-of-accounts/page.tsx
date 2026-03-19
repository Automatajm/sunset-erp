"use client";

import { useEffect, useState, useCallback } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import { chartOfAccountsApi } from '@/lib/api/chart-of-accounts';
import { Account, CreateAccountDto, AccountType } from '@/lib/api/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCOUNT_TYPES: {
  value: AccountType; label: string; color: string; bg: string; border: string;
}[] = [
  { value: 'asset',     label: 'Asset',     color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',  border: 'rgba(96,165,250,0.2)' },
  { value: 'liability', label: 'Liability', color: '#f87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.2)' },
  { value: 'equity',    label: 'Equity',    color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.2)' },
  { value: 'revenue',   label: 'Revenue',   color: '#4ade80', bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.2)' },
  { value: 'cost',      label: 'Cost',      color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.2)'  },
  { value: 'expense',   label: 'Expense',   color: '#fb923c', bg: 'rgba(251,146,60,0.1)',  border: 'rgba(251,146,60,0.18)' },
];

const EMPTY_FORM: CreateAccountDto = {
  accountNumber: '', name: '', accountType: 'asset',
  accountCategory: '', currency: 'USD', isActive: true, allowManualPosting: true,
};

function getTypeConfig(t: AccountType) {
  return ACCOUNT_TYPES.find(x => x.value === t) ?? ACCOUNT_TYPES[0];
}

function fmt(v?: string | null) {
  return v || '—';
}

// ─── Badges ───────────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: AccountType }) {
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

function HeaderBadge({ category }: { category?: string }) {
  if (category !== 'header') return null;
  return (
    <span style={{
      display: 'inline-flex', padding: '1px 7px', borderRadius: 20, fontSize: 10,
      color: 'rgba(251,191,36,0.8)', background: 'rgba(251,191,36,0.08)',
      border: '0.5px solid rgba(251,191,36,0.2)', fontWeight: 500, whiteSpace: 'nowrap',
    }}>Header</span>
  );
}

function PostingBadge({ allowed }: { allowed: boolean }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 10, color: allowed ? '#4ade80' : 'rgba(255,255,255,0.25)',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: allowed ? '#4ade80' : 'rgba(255,255,255,0.2)', flexShrink: 0 }} />
      {allowed ? 'Posting' : 'No posting'}
    </span>
  );
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function AccountModal({ open, onClose, onSaved, initial, accounts }: {
  open: boolean; onClose: () => void; onSaved: () => void;
  initial: Account | null; accounts: Account[];
}) {
  const [form, setForm] = useState<CreateAccountDto>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setError('');
      setForm(initial ? {
        accountNumber:     initial.accountNumber,
        name:              initial.name,
        accountType:       initial.accountType,
        accountCategory:   initial.accountCategory ?? '',
        parentAccountId:   initial.parentAccountId ?? '',
        currency:          initial.currency ?? 'USD',
        isActive:          initial.isActive,
        allowManualPosting: initial.allowManualPosting,
      } : EMPTY_FORM);
    }
  }, [open, initial]);

  const set = (key: keyof CreateAccountDto) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }));

  const setBool = (key: keyof CreateAccountDto, val: boolean) =>
    setForm(f => ({ ...f, [key]: val }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.accountNumber?.trim() || !form.name?.trim()) {
      setError('Account number and name are required.'); return;
    }
    const payload = {
      ...form,
      accountNumber:   form.accountNumber.trim(),
      name:            form.name.trim(),
      accountCategory: form.accountCategory?.trim() || undefined,
      parentAccountId: form.parentAccountId?.trim() || undefined,
    };
    setSubmitting(true); setError('');
    try {
      if (initial) await chartOfAccountsApi.update(initial.id, payload);
      else          await chartOfAccountsApi.create(payload);
      onSaved(); onClose();
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
      setError(msg || 'Operation failed.');
    } finally { setSubmitting(false); }
  };

  if (!open) return null;

  const toggleStyle = (active: boolean) => ({
    width: 32, height: 18, borderRadius: 9, flexShrink: 0, cursor: 'pointer' as const,
    background: active ? 'rgba(234,88,12,0.8)' : 'rgba(255,255,255,0.1)',
    border: `0.5px solid ${active ? 'rgba(251,146,60,0.5)' : 'rgba(255,255,255,0.15)'}`,
    position: 'relative' as const, transition: 'background 0.2s',
  });

  const knobStyle = (active: boolean) => ({
    position: 'absolute' as const, top: 2, left: active ? 16 : 2,
    width: 13, height: 13, borderRadius: '50%', background: '#fff',
    transition: 'left 0.2s', boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
  });

  return (
    <>
      <style>{`
        .am-overlay { position:fixed; inset:0; z-index:400; background:rgba(0,0,0,0.65); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; padding:24px; }
        .am-box { background:#0e0b1a; border:0.5px solid rgba(251,146,60,0.2); border-radius:14px; width:100%; max-width:540px; max-height:92vh; overflow-y:auto; position:relative; box-shadow:0 24px 60px rgba(0,0,0,0.7); }
        .am-box::before { content:''; position:absolute; top:0; left:30px; right:30px; height:1px; background:linear-gradient(90deg,transparent,rgba(251,146,60,0.4),transparent); }
        .am-hdr { display:flex; align-items:center; justify-content:space-between; padding:16px 20px 12px; border-bottom:0.5px solid rgba(255,255,255,0.06); position:sticky; top:0; background:#0e0b1a; z-index:1; }
        .am-title { font-size:14px; font-weight:500; color:#f1ede8; font-family:'IBM Plex Sans',sans-serif; }
        .am-close { width:24px; height:24px; border-radius:6px; background:rgba(255,255,255,0.06); border:none; cursor:pointer; color:rgba(255,255,255,0.45); font-size:16px; display:flex; align-items:center; justify-content:center; }
        .am-close:hover { background:rgba(255,255,255,0.1); }
        .am-body { padding:16px 20px; display:flex; flex-direction:column; gap:12px; }
        .am-row { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
        .am-field { display:flex; flex-direction:column; gap:5px; }
        .am-label { font-size:11px; font-weight:500; letter-spacing:0.08em; text-transform:uppercase; color:rgba(251,146,60,0.6); font-family:'IBM Plex Sans',sans-serif; }
        .am-input, .am-select { background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.1); border-radius:7px; padding:9px 12px; font-size:13px; font-family:'IBM Plex Sans',sans-serif; color:#f1ede8; outline:none; width:100%; transition:border-color 0.2s, box-shadow 0.2s; }
        .am-input::placeholder { color:rgba(255,255,255,0.18); }
        .am-input:focus, .am-select:focus { border-color:rgba(251,146,60,0.45); box-shadow:0 0 0 2px rgba(234,88,12,0.1); }
        .am-select option { background:#0e0b1a; color:#f1ede8; }
        .am-section { font-size:10px; font-weight:500; letter-spacing:0.12em; text-transform:uppercase; color:rgba(255,255,255,0.25); padding:4px 0 2px; border-bottom:0.5px solid rgba(255,255,255,0.06); margin-top:4px; }
        .am-toggles { display:flex; gap:24px; flex-wrap:wrap; }
        .am-toggle-label { display:flex; align-items:center; gap:8px; cursor:pointer; font-size:12px; font-family:'IBM Plex Sans',sans-serif; user-select:none; }
        .am-error { background:rgba(239,68,68,0.1); border:0.5px solid rgba(239,68,68,0.25); border-radius:7px; padding:8px 12px; font-size:12px; color:#fca5a5; }
        .am-ftr { display:flex; justify-content:flex-end; gap:8px; padding:12px 20px 18px; border-top:0.5px solid rgba(255,255,255,0.06); }
        .am-btn-cancel { background:rgba(255,255,255,0.05); border:0.5px solid rgba(255,255,255,0.1); border-radius:7px; padding:8px 16px; font-size:13px; font-family:'IBM Plex Sans',sans-serif; color:rgba(255,255,255,0.5); cursor:pointer; }
        .am-btn-cancel:hover { background:rgba(255,255,255,0.08); }
        .am-btn-save { background:linear-gradient(135deg,#c2410c,#ea580c,#f97316); border:none; border-radius:7px; padding:8px 20px; font-size:13px; font-weight:500; font-family:'IBM Plex Sans',sans-serif; color:white; cursor:pointer; box-shadow:0 3px 12px rgba(234,88,12,0.35); transition:opacity 0.2s; }
        .am-btn-save:disabled { opacity:0.5; cursor:not-allowed; }
        .am-btn-save:hover:not(:disabled) { opacity:0.88; }
      `}</style>

      <div className="am-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="am-box">
          <div className="am-hdr">
            <span className="am-title">{initial ? 'Edit Account' : 'New Account'}</span>
            <button className="am-close" onClick={onClose}>×</button>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="am-body">
              {error && <div className="am-error">{error}</div>}

              <div className="am-row">
                <div className="am-field">
                  <label className="am-label">Account Number *</label>
                  <input className="am-input" placeholder="1000" value={form.accountNumber ?? ''} onChange={set('accountNumber')} required />
                </div>
                <div className="am-field">
                  <label className="am-label">Account Type *</label>
                  <select className="am-select" value={form.accountType} onChange={set('accountType')}>
                    {ACCOUNT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
              </div>

              <div className="am-field">
                <label className="am-label">Name *</label>
                <input className="am-input" placeholder="Cash in Bank" value={form.name ?? ''} onChange={set('name')} required />
              </div>

              <div className="am-row">
                <div className="am-field">
                  <label className="am-label">Category</label>
                  <input className="am-input" placeholder="current_asset" value={form.accountCategory ?? ''} onChange={set('accountCategory')} />
                </div>
                <div className="am-field">
                  <label className="am-label">Currency</label>
                  <select className="am-select" value={form.currency ?? 'USD'} onChange={set('currency')}>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="DOP">DOP</option>
                    <option value="GBP">GBP</option>
                  </select>
                </div>
              </div>

              <div className="am-field">
                <label className="am-label">Parent Account</label>
                <select className="am-select" value={form.parentAccountId ?? ''} onChange={set('parentAccountId')}>
                  <option value="">— None (root account) —</option>
                  {accounts
                    .filter(a => !initial || a.id !== initial.id)
                    .map(a => (
                      <option key={a.id} value={a.id}>{a.accountNumber} — {a.name}</option>
                    ))}
                </select>
              </div>

              <div className="am-section">Properties</div>
              <div className="am-toggles">
                {([
                  { label: 'Active',               key: 'isActive'              as keyof CreateAccountDto },
                  { label: 'Allow Manual Posting',  key: 'allowManualPosting'    as keyof CreateAccountDto },
                  { label: 'Require Reconciliation',key: 'requireReconciliation' as keyof CreateAccountDto },
                ] as { label: string; key: keyof CreateAccountDto }[]).map(({ label, key }) => (
                  <label key={key} className="am-toggle-label"
                    style={{ color: form[key] ? '#e2dfd8' : 'rgba(255,255,255,0.4)' }}>
                    <div style={toggleStyle(!!form[key])} onClick={() => setBool(key, !form[key])}>
                      <div style={knobStyle(!!form[key])} />
                    </div>
                    {label}
                  </label>
                ))}
              </div>
            </div>
            <div className="am-ftr">
              <button type="button" className="am-btn-cancel" onClick={onClose}>Cancel</button>
              <button type="submit" className="am-btn-save" disabled={submitting}>
                {submitting ? 'Saving…' : initial ? 'Save Changes' : 'Create Account'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

// ─── Delete confirm ───────────────────────────────────────────────────────────

function DeleteConfirm({ account, onCancel, onConfirm, busy }: {
  account: Account; onCancel: () => void; onConfirm: () => void; busy: boolean;
}) {
  return (
    <div style={{ position:'fixed', inset:0, zIndex:400, background:'rgba(0,0,0,0.65)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ background:'#0e0b1a', border:'0.5px solid rgba(239,68,68,0.25)', borderRadius:14, width:'100%', maxWidth:420, padding:'24px 24px 20px', boxShadow:'0 24px 60px rgba(0,0,0,0.7)' }}>
        <div style={{ fontSize:14, fontWeight:500, color:'#f1ede8', marginBottom:10 }}>Delete account?</div>
        <div style={{ fontSize:13, color:'rgba(255,255,255,0.5)', marginBottom:20, lineHeight:1.5 }}>
          <strong style={{ color:'#f1ede8' }}>{account.accountNumber} — {account.name}</strong>{' '}
          will be soft-deleted. System accounts cannot be deleted.
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
          <button onClick={onCancel} style={{ background:'rgba(255,255,255,0.05)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:7, padding:'8px 16px', fontSize:13, fontFamily:"'IBM Plex Sans',sans-serif", color:'rgba(255,255,255,0.5)', cursor:'pointer' }}>Cancel</button>
          <button onClick={onConfirm} disabled={busy} style={{ background:'rgba(239,68,68,0.15)', border:'0.5px solid rgba(239,68,68,0.35)', borderRadius:7, padding:'8px 16px', fontSize:13, fontWeight:500, fontFamily:"'IBM Plex Sans',sans-serif", color:'#f87171', cursor:busy?'not-allowed':'pointer', opacity:busy?0.5:1 }}>{busy ? 'Deleting…' : 'Delete'}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ChartOfAccountsPage() {
  const [accounts,   setAccounts]   = useState<Account[]>([]);
  const [filtered,   setFiltered]   = useState<Account[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [search,     setSearch]     = useState('');
  const [typeFilter, setTypeFilter] = useState<AccountType | ''>('');
  const [modalOpen,  setModalOpen]  = useState(false);
  const [editing,    setEditing]    = useState<Account | null>(null);
  const [deleting,   setDeleting]   = useState<Account | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const fetchAccounts = useCallback(async () => {
    try {
      setLoading(true);
      const data = await chartOfAccountsApi.getAll();
      setAccounts(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load accounts.';
      setError(message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAccounts(); }, [fetchAccounts]);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(accounts.filter(a => {
      const matchSearch = !q ||
        a.accountNumber.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        (a.accountCategory ?? '').toLowerCase().includes(q);
      const matchType = !typeFilter || a.accountType === typeFilter;
      return matchSearch && matchType;
    }));
  }, [search, typeFilter, accounts]);

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await chartOfAccountsApi.remove(deleting.id);
      setDeleting(null);
      fetchAccounts();
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
      setError(msg || 'Delete failed.');
      setDeleting(null);
    } finally { setDeleteBusy(false); }
  };

  const typeCounts = ACCOUNT_TYPES.map(t => ({
    ...t, count: accounts.filter(a => a.accountType === t.value).length,
  }));

  // Build parent lookup for display
  const accountMap = Object.fromEntries(accounts.map(a => [a.id, a]));

  return (
    <ERPShell breadcrumbs={['Home', 'Financial', 'Chart of Accounts']} title="Chart of Accounts">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap');
        .coa-page { padding: 0 18px 24px; }
        .coa-stats { display:flex; gap:10px; margin-bottom:14px; flex-wrap:wrap; }
        .coa-stat { background:rgba(10,7,18,0.7); border-radius:8px; padding:8px 14px; display:flex; flex-direction:column; gap:2px; min-width:90px; cursor:pointer; transition:opacity 0.15s; }
        .coa-stat:hover { opacity:0.8; }
        .coa-stat-label { font-size:10px; font-weight:500; letter-spacing:0.08em; text-transform:uppercase; }
        .coa-stat-value { font-size:22px; font-weight:500; font-family:'IBM Plex Mono',monospace; color:#f1ede8; }
        .coa-toolbar { display:flex; align-items:center; gap:10px; margin-bottom:14px; flex-wrap:wrap; }
        .coa-search { background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.09); border-radius:7px; padding:7px 12px; font-size:12px; font-family:'IBM Plex Sans',sans-serif; color:#e2dfd8; outline:none; width:260px; transition:border-color 0.2s; }
        .coa-search::placeholder { color:rgba(255,255,255,0.2); }
        .coa-search:focus { border-color:rgba(251,146,60,0.4); box-shadow:0 0 0 2px rgba(234,88,12,0.08); }
        .coa-filter { background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.09); border-radius:7px; padding:7px 12px; font-size:12px; font-family:'IBM Plex Sans',sans-serif; color:#e2dfd8; outline:none; }
        .coa-filter option { background:#0e0b1a; color:#f1ede8; }
        .coa-btn-new { display:flex; align-items:center; gap:6px; margin-left:auto; background:linear-gradient(135deg,#c2410c,#ea580c,#f97316); border:none; border-radius:7px; padding:7px 14px; font-size:12px; font-weight:500; font-family:'IBM Plex Sans',sans-serif; color:white; cursor:pointer; box-shadow:0 3px 12px rgba(234,88,12,0.3); transition:opacity 0.15s, transform 0.15s; flex-shrink:0; }
        .coa-btn-new:hover { opacity:0.88; transform:translateY(-1px); }
        .coa-btn-new svg { width:13px; height:13px; display:block; flex-shrink:0; }
        .coa-wrap { background:rgba(10,7,18,0.7); border:0.5px solid rgba(251,146,60,0.12); border-radius:10px; overflow:hidden; }
        .coa-table { width:100%; border-collapse:collapse; }
        .coa-table thead th { padding:9px 14px; font-size:10px; font-weight:500; letter-spacing:0.1em; text-transform:uppercase; color:rgba(251,146,60,0.55); background:rgba(251,146,60,0.05); border-bottom:0.5px solid rgba(255,255,255,0.06); text-align:left; white-space:nowrap; }
        .coa-table tbody td { padding:10px 14px; border-bottom:0.5px solid rgba(255,255,255,0.04); vertical-align:middle; font-size:13px; }
        .coa-table tbody tr:last-child td { border-bottom:none; }
        .coa-table tbody tr:hover td { background:rgba(251,146,60,0.03); }
        .coa-num  { font-family:'IBM Plex Mono',monospace; font-size:13px; color:#fb923c; font-weight:500; }
        .coa-name { color:#e2dfd8; font-weight:500; }
        .coa-muted { color:rgba(255,255,255,0.45); font-size:12px; }
        .coa-actions { display:flex; gap:6px; }
        .coa-btn-edit, .coa-btn-del { padding:5px 10px; border-radius:6px; font-size:11px; font-family:'IBM Plex Sans',sans-serif; cursor:pointer; border:0.5px solid transparent; transition:background 0.15s; white-space:nowrap; }
        .coa-btn-edit { background:rgba(255,255,255,0.05); color:rgba(255,255,255,0.55); border-color:rgba(255,255,255,0.1); }
        .coa-btn-edit:hover { background:rgba(255,255,255,0.09); color:rgba(255,255,255,0.8); }
        .coa-btn-del { background:rgba(239,68,68,0.08); color:#f87171; border-color:rgba(239,68,68,0.2); }
        .coa-btn-del:hover { background:rgba(239,68,68,0.14); }
        .coa-empty, .coa-loading { text-align:center; padding:52px 24px; color:rgba(255,255,255,0.25); font-size:13px; display:flex; flex-direction:column; align-items:center; gap:10px; }
        .coa-spinner { width:18px; height:18px; border-radius:50%; border:2px solid rgba(251,146,60,0.2); border-top-color:#fb923c; animation:coa-spin 0.7s linear infinite; flex-shrink:0; }
        @keyframes coa-spin { to { transform:rotate(360deg); } }
        .coa-footer { font-size:11px; color:rgba(255,255,255,0.22); padding:8px 14px; border-top:0.5px solid rgba(255,255,255,0.04); }
        .coa-error { background:rgba(239,68,68,0.08); border:0.5px solid rgba(239,68,68,0.2); border-radius:8px; padding:10px 14px; margin-bottom:14px; font-size:13px; color:#fca5a5; }
      `}</style>

      <div className="coa-page">

        {/* Clickable type stats */}
        {accounts.length > 0 && (
          <div className="coa-stats">
            {typeCounts.map(t => (
              <div key={t.value} className="coa-stat"
                style={{ border: `0.5px solid ${typeFilter === t.value ? t.border : 'rgba(255,255,255,0.07)'}` }}
                onClick={() => setTypeFilter(prev => prev === t.value ? '' : t.value)}
              >
                <span className="coa-stat-label" style={{ color: t.color }}>{t.label}</span>
                <span className="coa-stat-value">{t.count}</span>
              </div>
            ))}
            <div className="coa-stat"
              style={{ border: `0.5px solid ${!typeFilter ? 'rgba(251,146,60,0.3)' : 'rgba(255,255,255,0.07)'}` }}
              onClick={() => setTypeFilter('')}
            >
              <span className="coa-stat-label" style={{ color: 'rgba(251,146,60,0.6)' }}>Total</span>
              <span className="coa-stat-value" style={{ color: '#fb923c' }}>{accounts.length}</span>
            </div>
          </div>
        )}

        <div className="coa-toolbar">
          <input className="coa-search" placeholder="Search by number, name, category…" value={search} onChange={e => setSearch(e.target.value)} />
          <select className="coa-filter" value={typeFilter} onChange={e => setTypeFilter(e.target.value as AccountType | '')}>
            <option value="">All Types</option>
            {ACCOUNT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <button className="coa-btn-new" onClick={() => { setEditing(null); setModalOpen(true); }}>
            <svg viewBox="0 0 13 13" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
              <line x1="6.5" y1="1" x2="6.5" y2="12" /><line x1="1" y1="6.5" x2="12" y2="6.5" />
            </svg>
            New Account
          </button>
        </div>

        {error && <div className="coa-error">{error}</div>}

        <div className="coa-wrap">
          {loading ? (
            <div className="coa-loading"><div className="coa-spinner" />Loading accounts…</div>
          ) : filtered.length === 0 ? (
            <div className="coa-empty">{search || typeFilter ? 'No accounts match your filters.' : 'No accounts yet.'}</div>
          ) : (
            <>
              <table className="coa-table">
                <thead>
                  <tr>
                    <th>Number</th>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Category</th>
                    <th>Parent</th>
                    <th>Posting</th>
                    <th>Currency</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(a => {
                    const parent = a.parentAccountId ? accountMap[a.parentAccountId] : null;
                    return (
                      <tr key={a.id}>
                        <td><span className="coa-num">{a.accountNumber}</span></td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span className="coa-name">{a.name}</span>
                            <HeaderBadge category={a.accountCategory} />
                          </div>
                        </td>
                        <td><TypeBadge type={a.accountType} /></td>
                        <td><span className="coa-muted">{fmt(a.accountCategory)}</span></td>
                        <td>
                          {parent
                            ? <span className="coa-muted" style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11 }}>
                                {parent.accountNumber} — {parent.name}
                              </span>
                            : <span className="coa-muted">—</span>}
                        </td>
                        <td><PostingBadge allowed={a.allowManualPosting} /></td>
                        <td><span className="coa-muted">{fmt(a.currency)}</span></td>
                        <td>
                          <div className="coa-actions">
                            <button className="coa-btn-edit" onClick={() => { setEditing(a); setModalOpen(true); }}>Edit</button>
                            <button className="coa-btn-del"  onClick={() => setDeleting(a)}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="coa-footer">
                {filtered.length} of {accounts.length} account{accounts.length !== 1 ? 's' : ''}
                {typeFilter && ` · ${ACCOUNT_TYPES.find(t => t.value === typeFilter)?.label}`}
              </div>
            </>
          )}
        </div>
      </div>

      <AccountModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={fetchAccounts}
        initial={editing}
        accounts={accounts}
      />

      {deleting && (
        <DeleteConfirm
          account={deleting}
          onCancel={() => setDeleting(null)}
          onConfirm={handleDelete}
          busy={deleteBusy}
        />
      )}
    </ERPShell>
  );
}
