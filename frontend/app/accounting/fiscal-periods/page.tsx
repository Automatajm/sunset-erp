"use client";

import { useEffect, useState, useCallback } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import { fiscalPeriodsApi } from '@/lib/api/fiscal-periods';
import { FiscalPeriod, CreateFiscalPeriodDto, PeriodStatus } from '@/lib/api/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<PeriodStatus, { color: string; bg: string; border: string; dot: string }> = {
  open:   { color: '#4ade80', bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.2)',  dot: '#4ade80' },
  closed: { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.2)',  dot: '#fbbf24' },
  locked: { color: '#f87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.2)', dot: '#f87171' },
};

const EMPTY_FORM: CreateFiscalPeriodDto = {
  periodCode: '', periodName: '', startDate: '', endDate: '',
  fiscalYear: '', fiscalQuarter: '', status: 'open', isCurrent: false,
};

function extractList(data: unknown): FiscalPeriod[] {
  if (Array.isArray(data)) return data as FiscalPeriod[];
  const d = data as Record<string, unknown>;
  if (d?.value && Array.isArray(d.value)) return d.value as FiscalPeriod[];
  return [];
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmt(v?: string | null) { return v || '—'; }

// ─── Badges ───────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: PeriodStatus }) {
  const c = STATUS_CONFIG[status];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 500,
      color: c.color, background: c.bg, border: `0.5px solid ${c.border}`,
      whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: c.dot, flexShrink: 0 }} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

function CurrentBadge() {
  return (
    <span style={{
      display: 'inline-flex', padding: '1px 7px', borderRadius: 20, fontSize: 10,
      color: '#60a5fa', background: 'rgba(96,165,250,0.1)',
      border: '0.5px solid rgba(96,165,250,0.2)', fontWeight: 500, whiteSpace: 'nowrap',
    }}>Current</span>
  );
}

// ─── Action buttons per status ────────────────────────────────────────────────

function PeriodActions({ period, onAction, busy }: {
  period: FiscalPeriod;
  onAction: (id: string, action: string) => void;
  busy: string | null;
}) {
  const isBusy = busy === period.id;

  const btn = (label: string, action: string, color: string, bg: string, border: string) => (
    <button
      key={action}
      onClick={() => onAction(period.id, action)}
      disabled={isBusy}
      style={{
        padding: '4px 9px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
        color, background: bg, border: `0.5px solid ${border}`,
        fontFamily: "'IBM Plex Sans',sans-serif",
        opacity: isBusy ? 0.5 : 1, whiteSpace: 'nowrap',
      }}
    >
      {isBusy ? '…' : label}
    </button>
  );

  const actions: React.ReactNode[] = [];

  if (period.status === 'open') {
    actions.push(btn('Close', 'close', '#fbbf24', 'rgba(251,191,36,0.08)', 'rgba(251,191,36,0.2)'));
  }
  if (period.status === 'closed') {
    actions.push(btn('Reopen', 'reopen', '#4ade80', 'rgba(74,222,128,0.08)', 'rgba(74,222,128,0.2)'));
    actions.push(btn('Lock', 'lock', '#f87171', 'rgba(248,113,113,0.08)', 'rgba(248,113,113,0.2)'));
  }
  if (period.status === 'locked') {
    actions.push(btn('Unlock', 'unlock', '#fbbf24', 'rgba(251,191,36,0.08)', 'rgba(251,191,36,0.2)'));
  }

  return <div style={{ display: 'flex', gap: 5 }}>{actions}</div>;
}

// ─── Modal ────────────────────────────────────────────────────────────────────

function PeriodModal({ open, onClose, onSaved, initial }: {
  open: boolean; onClose: () => void; onSaved: () => void; initial: FiscalPeriod | null;
}) {
  const [form, setForm] = useState<CreateFiscalPeriodDto>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setError('');
      setForm(initial ? {
        periodCode:    initial.periodCode,
        periodName:    initial.periodName,
        startDate:     initial.startDate.split('T')[0],
        endDate:       initial.endDate.split('T')[0],
        fiscalYear:    initial.fiscalYear,
        fiscalQuarter: initial.fiscalQuarter ?? '',
        status:        initial.status,
        isCurrent:     initial.isCurrent,
      } : EMPTY_FORM);
    }
  }, [open, initial]);

  const set = (key: keyof CreateFiscalPeriodDto) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.periodCode.trim() || !form.startDate || !form.endDate || !form.fiscalYear.trim()) {
      setError('Code, dates and fiscal year are required.'); return;
    }
    setSubmitting(true); setError('');
    try {
      if (initial) await fiscalPeriodsApi.update(initial.id, form);
      else          await fiscalPeriodsApi.create(form);
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
        .fp-overlay { position:fixed; inset:0; z-index:400; background:rgba(0,0,0,0.65); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; padding:24px; }
        .fp-box { background:#0e0b1a; border:0.5px solid rgba(251,146,60,0.2); border-radius:14px; width:100%; max-width:520px; max-height:92vh; overflow-y:auto; position:relative; box-shadow:0 24px 60px rgba(0,0,0,0.7); }
        .fp-box::before { content:''; position:absolute; top:0; left:30px; right:30px; height:1px; background:linear-gradient(90deg,transparent,rgba(251,146,60,0.4),transparent); }
        .fp-hdr { display:flex; align-items:center; justify-content:space-between; padding:16px 20px 12px; border-bottom:0.5px solid rgba(255,255,255,0.06); position:sticky; top:0; background:#0e0b1a; z-index:1; }
        .fp-title { font-size:14px; font-weight:500; color:#f1ede8; font-family:'IBM Plex Sans',sans-serif; }
        .fp-close { width:24px; height:24px; border-radius:6px; background:rgba(255,255,255,0.06); border:none; cursor:pointer; color:rgba(255,255,255,0.45); font-size:16px; display:flex; align-items:center; justify-content:center; }
        .fp-close:hover { background:rgba(255,255,255,0.1); }
        .fp-body { padding:16px 20px; display:flex; flex-direction:column; gap:12px; }
        .fp-row { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
        .fp-row3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; }
        .fp-field { display:flex; flex-direction:column; gap:5px; }
        .fp-label { font-size:11px; font-weight:500; letter-spacing:0.08em; text-transform:uppercase; color:rgba(251,146,60,0.6); font-family:'IBM Plex Sans',sans-serif; }
        .fp-input, .fp-select { background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.1); border-radius:7px; padding:9px 12px; font-size:13px; font-family:'IBM Plex Sans',sans-serif; color:#f1ede8; outline:none; width:100%; transition:border-color 0.2s; }
        .fp-input::placeholder { color:rgba(255,255,255,0.18); }
        .fp-input:focus, .fp-select:focus { border-color:rgba(251,146,60,0.45); box-shadow:0 0 0 2px rgba(234,88,12,0.1); }
        .fp-select option { background:#0e0b1a; color:#f1ede8; }
        .fp-error { background:rgba(239,68,68,0.1); border:0.5px solid rgba(239,68,68,0.25); border-radius:7px; padding:8px 12px; font-size:12px; color:#fca5a5; }
        .fp-ftr { display:flex; justify-content:flex-end; gap:8px; padding:12px 20px 18px; border-top:0.5px solid rgba(255,255,255,0.06); }
        .fp-btn-cancel { background:rgba(255,255,255,0.05); border:0.5px solid rgba(255,255,255,0.1); border-radius:7px; padding:8px 16px; font-size:13px; font-family:'IBM Plex Sans',sans-serif; color:rgba(255,255,255,0.5); cursor:pointer; }
        .fp-btn-cancel:hover { background:rgba(255,255,255,0.08); }
        .fp-btn-save { background:linear-gradient(135deg,#c2410c,#ea580c,#f97316); border:none; border-radius:7px; padding:8px 20px; font-size:13px; font-weight:500; font-family:'IBM Plex Sans',sans-serif; color:white; cursor:pointer; box-shadow:0 3px 12px rgba(234,88,12,0.35); transition:opacity 0.2s; }
        .fp-btn-save:disabled { opacity:0.5; cursor:not-allowed; }
        .fp-btn-save:hover:not(:disabled) { opacity:0.88; }
      `}</style>

      <div className="fp-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="fp-box">
          <div className="fp-hdr">
            <span className="fp-title">{initial ? 'Edit Period' : 'New Fiscal Period'}</span>
            <button className="fp-close" onClick={onClose}>×</button>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="fp-body">
              {error && <div className="fp-error">{error}</div>}

              <div className="fp-row">
                <div className="fp-field">
                  <label className="fp-label">Period Code *</label>
                  <input className="fp-input" placeholder="2026-03" value={form.periodCode} onChange={set('periodCode')} required />
                </div>
                <div className="fp-field">
                  <label className="fp-label">Fiscal Year *</label>
                  <input className="fp-input" placeholder="2026" value={form.fiscalYear} onChange={set('fiscalYear')} required />
                </div>
              </div>

              <div className="fp-field">
                <label className="fp-label">Period Name *</label>
                <input className="fp-input" placeholder="March 2026" value={form.periodName} onChange={set('periodName')} required />
              </div>

              <div className="fp-row">
                <div className="fp-field">
                  <label className="fp-label">Start Date *</label>
                  <input className="fp-input" type="date" value={form.startDate} onChange={set('startDate')} required />
                </div>
                <div className="fp-field">
                  <label className="fp-label">End Date *</label>
                  <input className="fp-input" type="date" value={form.endDate} onChange={set('endDate')} required />
                </div>
              </div>

              <div className="fp-row">
                <div className="fp-field">
                  <label className="fp-label">Fiscal Quarter</label>
                  <select className="fp-select" value={form.fiscalQuarter ?? ''} onChange={set('fiscalQuarter')}>
                    <option value="">— None —</option>
                    <option value="Q1">Q1</option>
                    <option value="Q2">Q2</option>
                    <option value="Q3">Q3</option>
                    <option value="Q4">Q4</option>
                  </select>
                </div>
                <div className="fp-field">
                  <label className="fp-label">Status</label>
                  <select className="fp-select" value={form.status ?? 'open'} onChange={set('status')}>
                    <option value="open">Open</option>
                    <option value="closed">Closed</option>
                    <option value="locked">Locked</option>
                  </select>
                </div>
              </div>

              <label style={{
                display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                fontSize: 12, color: form.isCurrent ? '#e2dfd8' : 'rgba(255,255,255,0.4)',
                fontFamily: "'IBM Plex Sans',sans-serif", userSelect: 'none',
                background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.07)',
                borderRadius: 8, padding: '10px 14px',
              }}>
                <div style={toggleStyle(!!form.isCurrent)} onClick={() => setForm(f => ({ ...f, isCurrent: !f.isCurrent }))}>
                  <div style={knobStyle(!!form.isCurrent)} />
                </div>
                Set as current period
              </label>
            </div>
            <div className="fp-ftr">
              <button type="button" className="fp-btn-cancel" onClick={onClose}>Cancel</button>
              <button type="submit" className="fp-btn-save" disabled={submitting}>
                {submitting ? 'Saving…' : initial ? 'Save Changes' : 'Create Period'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

// ─── Delete confirm ───────────────────────────────────────────────────────────

function DeleteConfirm({ period, onCancel, onConfirm, busy }: {
  period: FiscalPeriod; onCancel: () => void; onConfirm: () => void; busy: boolean;
}) {
  return (
    <div style={{ position:'fixed', inset:0, zIndex:400, background:'rgba(0,0,0,0.65)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ background:'#0e0b1a', border:'0.5px solid rgba(239,68,68,0.25)', borderRadius:14, width:'100%', maxWidth:420, padding:'24px 24px 20px', boxShadow:'0 24px 60px rgba(0,0,0,0.7)' }}>
        <div style={{ fontSize:14, fontWeight:500, color:'#f1ede8', marginBottom:10 }}>Delete fiscal period?</div>
        <div style={{ fontSize:13, color:'rgba(255,255,255,0.5)', marginBottom:20, lineHeight:1.5 }}>
          <strong style={{ color:'#f1ede8' }}>{period.periodCode} — {period.periodName}</strong> will be deleted.
          Cannot delete closed/locked periods or periods with journal entries.
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
          <button onClick={onCancel} style={{ background:'rgba(255,255,255,0.05)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:7, padding:'8px 16px', fontSize:13, fontFamily:"'IBM Plex Sans',sans-serif", color:'rgba(255,255,255,0.5)', cursor:'pointer' }}>Cancel</button>
          <button onClick={onConfirm} disabled={busy} style={{ background:'rgba(239,68,68,0.15)', border:'0.5px solid rgba(239,68,68,0.35)', borderRadius:7, padding:'8px 16px', fontSize:13, fontWeight:500, fontFamily:"'IBM Plex Sans',sans-serif", color:'#f87171', cursor:busy?'not-allowed':'pointer', opacity:busy?0.5:1 }}>{busy?'Deleting…':'Delete'}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function FiscalPeriodsPage() {
  const [periods,    setPeriods]    = useState<FiscalPeriod[]>([]);
  const [filtered,   setFiltered]   = useState<FiscalPeriod[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<PeriodStatus | ''>('');
  const [modalOpen,  setModalOpen]  = useState(false);
  const [editing,    setEditing]    = useState<FiscalPeriod | null>(null);
  const [deleting,   setDeleting]   = useState<FiscalPeriod | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const fetchPeriods = useCallback(async () => {
    try {
      setLoading(true);
      const raw = await fiscalPeriodsApi.getAll();
      const data = extractList(raw);
      // Sort by periodCode desc
      data.sort((a, b) => b.periodCode.localeCompare(a.periodCode));
      setPeriods(data);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load fiscal periods.';
      setError(message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchPeriods(); }, [fetchPeriods]);

  useEffect(() => {
    setFiltered(periods.filter(p => {
      const matchYear   = !yearFilter   || p.fiscalYear === yearFilter;
      const matchStatus = !statusFilter || p.status     === statusFilter;
      return matchYear && matchStatus;
    }));
  }, [yearFilter, statusFilter, periods]);

  const handleAction = async (id: string, action: string) => {
    setActionBusy(id);
    try {
      switch (action) {
        case 'close':  await fiscalPeriodsApi.close(id);  break;
        case 'reopen': await fiscalPeriodsApi.reopen(id); break;
        case 'lock':   await fiscalPeriodsApi.lock(id);   break;
        case 'unlock': await fiscalPeriodsApi.unlock(id); break;
      }
      fetchPeriods();
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
      setError(msg || `${action} failed.`);
    } finally { setActionBusy(null); }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await fiscalPeriodsApi.remove(deleting.id);
      setDeleting(null);
      fetchPeriods();
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
      setError(msg || 'Delete failed.');
      setDeleting(null);
    } finally { setDeleteBusy(false); }
  };

  // Unique fiscal years for filter
  const years = [...new Set(periods.map(p => p.fiscalYear))].sort((a, b) => b.localeCompare(a));

  // Status counts
  const counts = {
    open:   periods.filter(p => p.status === 'open').length,
    closed: periods.filter(p => p.status === 'closed').length,
    locked: periods.filter(p => p.status === 'locked').length,
  };

  return (
    <ERPShell breadcrumbs={['Home', 'Financial', 'Fiscal Periods']} title="Fiscal Periods">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap');
        .fp-page { padding: 0 18px 24px; }
        .fp-stats { display:flex; gap:10px; margin-bottom:14px; flex-wrap:wrap; }
        .fp-stat { background:rgba(10,7,18,0.7); border-radius:8px; padding:8px 14px; display:flex; flex-direction:column; gap:2px; min-width:90px; cursor:pointer; transition:opacity 0.15s; }
        .fp-stat:hover { opacity:0.8; }
        .fp-stat-label { font-size:10px; font-weight:500; letter-spacing:0.08em; text-transform:uppercase; }
        .fp-stat-value { font-size:22px; font-weight:500; font-family:'IBM Plex Mono',monospace; color:#f1ede8; }
        .fp-toolbar { display:flex; align-items:center; gap:10px; margin-bottom:14px; flex-wrap:wrap; }
        .fp-filter { background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.09); border-radius:7px; padding:7px 12px; font-size:12px; font-family:'IBM Plex Sans',sans-serif; color:#e2dfd8; outline:none; }
        .fp-filter option { background:#0e0b1a; color:#f1ede8; }
        .fp-btn-new { display:flex; align-items:center; gap:6px; margin-left:auto; background:linear-gradient(135deg,#c2410c,#ea580c,#f97316); border:none; border-radius:7px; padding:7px 14px; font-size:12px; font-weight:500; font-family:'IBM Plex Sans',sans-serif; color:white; cursor:pointer; box-shadow:0 3px 12px rgba(234,88,12,0.3); transition:opacity 0.15s, transform 0.15s; flex-shrink:0; }
        .fp-btn-new:hover { opacity:0.88; transform:translateY(-1px); }
        .fp-btn-new svg { width:13px; height:13px; display:block; flex-shrink:0; }
        .fp-wrap { background:rgba(10,7,18,0.7); border:0.5px solid rgba(251,146,60,0.12); border-radius:10px; overflow:hidden; }
        .fp-table { width:100%; border-collapse:collapse; }
        .fp-table thead th { padding:9px 14px; font-size:10px; font-weight:500; letter-spacing:0.1em; text-transform:uppercase; color:rgba(251,146,60,0.55); background:rgba(251,146,60,0.05); border-bottom:0.5px solid rgba(255,255,255,0.06); text-align:left; white-space:nowrap; }
        .fp-table tbody td { padding:10px 14px; border-bottom:0.5px solid rgba(255,255,255,0.04); vertical-align:middle; font-size:13px; }
        .fp-table tbody tr:last-child td { border-bottom:none; }
        .fp-table tbody tr:hover td { background:rgba(251,146,60,0.03); }
        .fp-code { font-family:'IBM Plex Mono',monospace; font-size:12px; color:#fb923c; font-weight:500; }
        .fp-name { color:#e2dfd8; font-weight:500; }
        .fp-muted { color:rgba(255,255,255,0.45); font-size:12px; }
        .fp-empty, .fp-loading { text-align:center; padding:52px 24px; color:rgba(255,255,255,0.25); font-size:13px; display:flex; flex-direction:column; align-items:center; gap:10px; }
        .fp-spinner { width:18px; height:18px; border-radius:50%; border:2px solid rgba(251,146,60,0.2); border-top-color:#fb923c; animation:fp-spin 0.7s linear infinite; flex-shrink:0; }
        @keyframes fp-spin { to { transform:rotate(360deg); } }
        .fp-footer { font-size:11px; color:rgba(255,255,255,0.22); padding:8px 14px; border-top:0.5px solid rgba(255,255,255,0.04); }
        .fp-error-bar { background:rgba(239,68,68,0.08); border:0.5px solid rgba(239,68,68,0.2); border-radius:8px; padding:10px 14px; margin-bottom:14px; font-size:13px; color:#fca5a5; }
        .fp-row-actions { display:flex; align-items:center; gap:5px; flex-wrap:wrap; }
        .fp-btn-edit { padding:4px 9px; border-radius:6px; font-size:11px; font-family:'IBM Plex Sans',sans-serif; cursor:pointer; background:rgba(255,255,255,0.05); color:rgba(255,255,255,0.55); border:0.5px solid rgba(255,255,255,0.1); }
        .fp-btn-edit:hover { background:rgba(255,255,255,0.09); color:rgba(255,255,255,0.8); }
        .fp-btn-del { padding:4px 9px; border-radius:6px; font-size:11px; font-family:'IBM Plex Sans',sans-serif; cursor:pointer; background:rgba(239,68,68,0.08); color:#f87171; border:0.5px solid rgba(239,68,68,0.2); }
        .fp-btn-del:hover { background:rgba(239,68,68,0.14); }
      `}</style>

      <div className="fp-page">

        {/* Stats — clickable filters */}
        {periods.length > 0 && (
          <div className="fp-stats">
            {(['open', 'closed', 'locked'] as PeriodStatus[]).map(s => {
              const c = STATUS_CONFIG[s];
              return (
                <div
                  key={s}
                  className="fp-stat"
                  style={{ border: `0.5px solid ${statusFilter === s ? c.border : 'rgba(255,255,255,0.07)'}` }}
                  onClick={() => setStatusFilter(prev => prev === s ? '' : s)}
                >
                  <span className="fp-stat-label" style={{ color: c.color }}>{s.charAt(0).toUpperCase() + s.slice(1)}</span>
                  <span className="fp-stat-value">{counts[s]}</span>
                </div>
              );
            })}
            <div
              className="fp-stat"
              style={{ border: `0.5px solid ${!statusFilter ? 'rgba(251,146,60,0.3)' : 'rgba(255,255,255,0.07)'}` }}
              onClick={() => setStatusFilter('')}
            >
              <span className="fp-stat-label" style={{ color: 'rgba(251,146,60,0.6)' }}>Total</span>
              <span className="fp-stat-value" style={{ color: '#fb923c' }}>{periods.length}</span>
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div className="fp-toolbar">
          <select className="fp-filter" value={yearFilter} onChange={e => setYearFilter(e.target.value)}>
            <option value="">All Years</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select className="fp-filter" value={statusFilter} onChange={e => setStatusFilter(e.target.value as PeriodStatus | '')}>
            <option value="">All Status</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
            <option value="locked">Locked</option>
          </select>
          <button className="fp-btn-new" onClick={() => { setEditing(null); setModalOpen(true); }}>
            <svg viewBox="0 0 13 13" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
              <line x1="6.5" y1="1" x2="6.5" y2="12" /><line x1="1" y1="6.5" x2="12" y2="6.5" />
            </svg>
            New Period
          </button>
        </div>

        {error && <div className="fp-error-bar">{error}</div>}

        <div className="fp-wrap">
          {loading ? (
            <div className="fp-loading"><div className="fp-spinner" />Loading fiscal periods…</div>
          ) : filtered.length === 0 ? (
            <div className="fp-empty">
              {yearFilter || statusFilter ? 'No periods match your filters.' : 'No fiscal periods yet.'}
            </div>
          ) : (
            <>
              <table className="fp-table">
                <thead>
                  <tr>
                    <th>Code</th>
                    <th>Name</th>
                    <th>Year</th>
                    <th>Quarter</th>
                    <th>Start Date</th>
                    <th>End Date</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(p => (
                    <tr key={p.id}>
                      <td><span className="fp-code">{p.periodCode}</span></td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <span className="fp-name">{p.periodName}</span>
                          {p.isCurrent && <CurrentBadge />}
                        </div>
                      </td>
                      <td><span className="fp-muted">{p.fiscalYear}</span></td>
                      <td><span className="fp-muted">{fmt(p.fiscalQuarter)}</span></td>
                      <td><span className="fp-muted">{fmtDate(p.startDate)}</span></td>
                      <td><span className="fp-muted">{fmtDate(p.endDate)}</span></td>
                      <td><StatusBadge status={p.status} /></td>
                      <td>
                        <div className="fp-row-actions">
                          <PeriodActions period={p} onAction={handleAction} busy={actionBusy} />
                          <button className="fp-btn-edit" onClick={() => { setEditing(p); setModalOpen(true); }}>Edit</button>
                          {p.status === 'open' && (
                            <button className="fp-btn-del" onClick={() => setDeleting(p)}>Delete</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="fp-footer">
                {filtered.length} of {periods.length} period{periods.length !== 1 ? 's' : ''}
              </div>
            </>
          )}
        </div>
      </div>

      <PeriodModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={fetchPeriods}
        initial={editing}
      />

      {deleting && (
        <DeleteConfirm
          period={deleting}
          onCancel={() => setDeleting(null)}
          onConfirm={handleDelete}
          busy={deleteBusy}
        />
      )}
    </ERPShell>
  );
}