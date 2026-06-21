"use client";
// ============================================================================
// frontend/app/accounting/fiscal-periods/page.tsx
// spec-ux-t6-finance T6.4 — ERPTable + ERPFilterBar + FormModal + SearchSelect + ConfirmModal.
// ============================================================================
import { useEffect, useState, useCallback, useMemo } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import SearchSelect from '@/components/ui/SearchSelect';
import { ERPTable, ERPColumn } from '@/components/ui/ERPTable';
import { ERPFilterBar, ERPFilter, useERPFilters, applyERPFilters } from '@/components/ui/ERPFilterBar';
import { FormModal } from '@/components/ui/modal/FormModal';
import { ConfirmModal } from '@/components/ui/modal';
import { fiscalPeriodsApi } from '@/lib/api/fiscal-periods';
import { FiscalPeriod, CreateFiscalPeriodDto, PeriodStatus } from '@/lib/api/types';

const STATUS_CONFIG: Record<PeriodStatus, { color: string; bg: string; border: string }> = {
  open:   { color: 'var(--success, #4ade80)', bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.2)' },
  closed: { color: 'var(--warning, #fbbf24)', bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.2)' },
  locked: { color: 'var(--danger, #f87171)', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.2)' },
};
const EMPTY_FORM: CreateFiscalPeriodDto = { periodCode: '', periodName: '', startDate: '', endDate: '', fiscalYear: '', fiscalQuarter: '', status: 'open', isCurrent: false };

function extractList(data: unknown): FiscalPeriod[] {
  if (Array.isArray(data)) return data as FiscalPeriod[];
  const d = data as Record<string, unknown>;
  if (d?.value && Array.isArray(d.value)) return d.value as FiscalPeriod[];
  return [];
}
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const fmt = (v?: string | null) => v || '—';

const INP: React.CSSProperties = { background: 'var(--l04, rgba(255,255,255,0.04))', border: '0.5px solid var(--w10, rgba(255,255,255,0.1))', borderRadius: 7, padding: '9px 12px', fontSize: 13, fontFamily: "'IBM Plex Sans',sans-serif", color: 'var(--text-strong, #f1ede8)', outline: 'none', width: '100%' };
const LBL: React.CSSProperties = { fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(251,146,60,0.6)' };

function StatusBadge({ status }: { status: PeriodStatus }) {
  const c = STATUS_CONFIG[status];
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 500, color: c.color, background: c.bg, border: `0.5px solid ${c.border}`, whiteSpace: 'nowrap' }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: c.color, flexShrink: 0 }} />{status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}
function CurrentBadge() {
  return <span style={{ display: 'inline-flex', padding: '1px 7px', borderRadius: 20, fontSize: 10, color: 'var(--accent-blue, #60a5fa)', background: 'rgba(96,165,250,0.1)', border: '0.5px solid rgba(96,165,250,0.2)', fontWeight: 500, whiteSpace: 'nowrap' }}>Current</span>;
}

// ─── Create / edit modal (shared FormModal) ─────────────────────────────────
function PeriodModal({ open, onClose, onSaved, initial }: {
  open: boolean; onClose: () => void; onSaved: () => void; initial: FiscalPeriod | null;
}) {
  const [form, setForm]             = useState<CreateFiscalPeriodDto>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]           = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setForm(initial ? {
        periodCode: initial.periodCode, periodName: initial.periodName,
        startDate: initial.startDate.split('T')[0], endDate: initial.endDate.split('T')[0],
        fiscalYear: initial.fiscalYear, fiscalQuarter: initial.fiscalQuarter ?? '',
        status: initial.status, isCurrent: initial.isCurrent,
      } : EMPTY_FORM);
    }
  }, [open, initial]);

  const set = (key: keyof CreateFiscalPeriodDto) =>
    (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [key]: e.target.value }));

  const submit = async () => {
    if (!form.periodCode.trim() || !form.startDate || !form.endDate || !form.fiscalYear.trim()) { setError('Code, dates and fiscal year are required.'); return; }
    setSubmitting(true); setError(null);
    try {
      if (initial) await fiscalPeriodsApi.update(initial.id, form);
      else         await fiscalPeriodsApi.create(form);
      onSaved(); onClose();
    } catch (err) {
      setError((err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Operation failed.');
    } finally { setSubmitting(false); }
  };

  const valid = !!form.periodCode.trim() && !!form.startDate && !!form.endDate && !!form.fiscalYear.trim();
  const Field = ({ label, children }: { label: string; children: React.ReactNode }) =>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}><label style={LBL}>{label}</label>{children}</div>;

  return (
    <FormModal open={open} onClose={onClose} title={initial ? `Edit — ${initial.periodCode}` : 'New Fiscal Period'} submitLabel={initial ? 'Save Changes' : 'Create Period'} submitting={submitting} isValid={valid} error={error} onSubmit={submit} width={520}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Period Code *"><input style={INP} placeholder="2026-03" value={form.periodCode} onChange={set('periodCode')} autoFocus /></Field>
          <Field label="Fiscal Year *"><input style={INP} placeholder="2026" value={form.fiscalYear} onChange={set('fiscalYear')} /></Field>
        </div>
        <Field label="Period Name *"><input style={INP} placeholder="March 2026" value={form.periodName} onChange={set('periodName')} /></Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Start Date *"><input style={INP} type="date" value={form.startDate} onChange={set('startDate')} /></Field>
          <Field label="End Date *"><input style={INP} type="date" value={form.endDate} onChange={set('endDate')} /></Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Fiscal Quarter">
            <SearchSelect options={['Q1', 'Q2', 'Q3', 'Q4'].map(q => ({ value: q, label: q }))} value={form.fiscalQuarter ?? ''} onChange={v => setForm(f => ({ ...f, fiscalQuarter: v }))} placeholder="Quarter…" clearLabel="— None —" minWidth={160} />
          </Field>
          <Field label="Status">
            <SearchSelect options={[{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Closed' }, { value: 'locked', label: 'Locked' }]} value={form.status ?? 'open'} onChange={v => setForm(f => ({ ...f, status: v as PeriodStatus }))} placeholder="Status…" minWidth={180} />
          </Field>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 12, color: form.isCurrent ? 'var(--text-primary, #e2dfd8)' : 'rgba(255,255,255,0.4)', userSelect: 'none', background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '10px 14px' }}>
          <div onClick={() => setForm(f => ({ ...f, isCurrent: !f.isCurrent }))} style={{ width: 32, height: 18, borderRadius: 9, flexShrink: 0, cursor: 'pointer', background: form.isCurrent ? 'rgba(234,88,12,0.8)' : 'rgba(255,255,255,0.1)', border: `0.5px solid ${form.isCurrent ? 'rgba(251,146,60,0.5)' : 'rgba(255,255,255,0.15)'}`, position: 'relative' }}>
            <div style={{ position: 'absolute', top: 2, left: form.isCurrent ? 16 : 2, width: 13, height: 13, borderRadius: '50%', background: 'var(--white, #fff)', transition: 'left 0.2s' }} />
          </div>
          Set as current period
        </label>
      </div>
    </FormModal>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function FiscalPeriodsPage() {
  const [periods,    setPeriods]    = useState<FiscalPeriod[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [modalOpen,  setModalOpen]  = useState(false);
  const [editing,    setEditing]    = useState<FiscalPeriod | null>(null);
  const [deleting,   setDeleting]   = useState<FiscalPeriod | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [statCard,   setStatCard]   = useState<PeriodStatus | ''>('');
  const [confirmAction, setConfirmAction] = useState<{ id: string; action: string; period: FiscalPeriod } | null>(null);

  const fetchPeriods = useCallback(async () => {
    try {
      setLoading(true);
      const data = extractList(await fiscalPeriodsApi.getAll());
      data.sort((a, b) => b.periodCode.localeCompare(a.periodCode));
      setPeriods(data);
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to load fiscal periods.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchPeriods(); }, [fetchPeriods]);

  const runAction = async (id: string, action: string) => {
    setActionBusy(id); setError('');
    try {
      switch (action) {
        case 'close':  await fiscalPeriodsApi.close(id);  break;
        case 'reopen': await fiscalPeriodsApi.reopen(id); break;
        case 'lock':   await fiscalPeriodsApi.lock(id);   break;
        case 'unlock': await fiscalPeriodsApi.unlock(id); break;
      }
      fetchPeriods();
    } catch (err) {
      setError((err as { response?: { data?: { message?: string } } }).response?.data?.message || `${action} failed.`);
      throw err;
    } finally { setActionBusy(null); }
  };

  const ACTION_COPY: Record<string, { title: string; description: string; variant: 'default' | 'destructive'; label: string }> = {
    close:  { title: 'Close fiscal period',  description: 'Closing prevents new journal entries from posting to this period. It can be reopened later.', variant: 'default',     label: 'Close Period' },
    reopen: { title: 'Reopen fiscal period', description: 'Reopening allows journal entries to post to this period again.',                                  variant: 'default',     label: 'Reopen Period' },
    lock:   { title: 'Lock fiscal period',   description: 'Locking permanently seals the period — no further changes are allowed.',                          variant: 'destructive', label: 'Lock Period' },
    unlock: { title: 'Unlock fiscal period', description: 'Unlocking re-allows changes to this previously locked period.',                                   variant: 'default',     label: 'Unlock Period' },
  };

  const years = useMemo(() => [...new Set(periods.map(p => p.fiscalYear))].sort((a, b) => b.localeCompare(a)), [periods]);
  const counts = { open: periods.filter(p => p.status === 'open').length, closed: periods.filter(p => p.status === 'closed').length, locked: periods.filter(p => p.status === 'locked').length };

  // ── Filters ────────────────────────────────────────────────────────────────
  const filterDefs = useMemo<ERPFilter<FiscalPeriod>[]>(() => [
    { key: 'fiscalYear', label: 'Year', type: 'searchselect', placeholder: 'All years', options: years.map(y => ({ value: y, label: y })) },
    { key: 'status', label: 'Status', type: 'multiselect', options: (['open', 'closed', 'locked'] as PeriodStatus[]).map(s => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1), color: STATUS_CONFIG[s].color })) },
  ], [years]);

  const { values: filterVals, setValue: setFilterVal, reset: resetFilters, activeCount: filterCount } = useERPFilters(filterDefs);
  const filtered = useMemo(() => {
    const base = applyERPFilters(periods, filterDefs, filterVals);
    return statCard ? base.filter(p => p.status === statCard) : base;
  }, [periods, filterDefs, filterVals, statCard]);

  // ── Columns ────────────────────────────────────────────────────────────────
  const columns = useMemo<ERPColumn<FiscalPeriod>[]>(() => [
    { key: 'periodCode', header: 'Code', width: 110, sortable: true, value: r => r.periodCode, render: r => <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: 'var(--accent-strong, #fb923c)', fontWeight: 500 }}>{r.periodCode}</span> },
    { key: 'periodName', header: 'Name', sortable: true, value: r => r.periodName, render: r => <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ color: 'var(--text-primary, #e2dfd8)', fontWeight: 500 }}>{r.periodName}</span>{r.isCurrent && <CurrentBadge />}</div> },
    { key: 'fiscalYear', header: 'Year', width: 80, sortable: true, value: r => r.fiscalYear, render: r => <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>{r.fiscalYear}</span> },
    { key: 'fiscalQuarter', header: 'Quarter', width: 90, sortable: true, value: r => r.fiscalQuarter ?? '', render: r => <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>{fmt(r.fiscalQuarter)}</span> },
    { key: 'startDate', header: 'Start Date', width: 130, sortable: true, value: r => r.startDate, render: r => <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>{fmtDate(r.startDate)}</span> },
    { key: 'endDate', header: 'End Date', width: 130, sortable: true, value: r => r.endDate, render: r => <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>{fmtDate(r.endDate)}</span> },
    { key: 'status', header: 'Status', width: 100, sortable: true, value: r => r.status, render: r => <StatusBadge status={r.status} /> },
    {
      key: '_actions', header: '', width: 220, sortable: false,
      render: r => {
        const isBusy = actionBusy === r.id;
        const btn = (label: string, action: string, color: string, bg: string, border: string) => (
          <button key={action} onClick={() => { const period = periods.find(p => p.id === r.id); if (period) setConfirmAction({ id: r.id, action, period }); }} disabled={isBusy}
            style={{ padding: '4px 9px', borderRadius: 6, fontSize: 11, cursor: 'pointer', color, background: bg, border: `0.5px solid ${border}`, fontFamily: "'IBM Plex Sans',sans-serif", opacity: isBusy ? 0.5 : 1, whiteSpace: 'nowrap' }}>
            {isBusy ? '…' : label}
          </button>
        );
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
            {r.status === 'open' && btn('Close', 'close', 'var(--warning, #fbbf24)', 'rgba(251,191,36,0.08)', 'rgba(251,191,36,0.2)')}
            {r.status === 'closed' && btn('Reopen', 'reopen', 'var(--success, #4ade80)', 'rgba(74,222,128,0.08)', 'rgba(74,222,128,0.2)')}
            {r.status === 'closed' && btn('Lock', 'lock', 'var(--danger, #f87171)', 'rgba(248,113,113,0.08)', 'rgba(248,113,113,0.2)')}
            {r.status === 'locked' && btn('Unlock', 'unlock', 'var(--warning, #fbbf24)', 'rgba(251,191,36,0.08)', 'rgba(251,191,36,0.2)')}
            <button onClick={() => { setEditing(r); setModalOpen(true); }} style={{ padding: '4px 9px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', color: 'rgba(255,255,255,0.55)', border: '0.5px solid rgba(255,255,255,0.1)', fontFamily: "'IBM Plex Sans',sans-serif" }}>Edit</button>
            {r.status === 'open' && <button onClick={() => setDeleting(r)} style={{ padding: '4px 9px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(239,68,68,0.08)', color: 'var(--danger, #f87171)', border: '0.5px solid rgba(239,68,68,0.2)', fontFamily: "'IBM Plex Sans',sans-serif" }}>Delete</button>}
          </div>
        );
      },
    },
  ], [actionBusy, periods]);

  return (
    <ERPShell breadcrumbs={['Home', 'Financial', 'Fiscal Periods']} title="Fiscal Periods">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap');
        .fp-page { padding: 0 18px 12px; display:flex; flex-direction:column; height:100%; overflow:hidden; }
        .fp-stats { display:flex; gap:10px; margin-bottom:12px; flex-wrap:wrap; flex-shrink:0; }
        .fp-stat { background:rgba(10,7,18,0.7); border-radius:8px; padding:8px 14px; display:flex; flex-direction:column; gap:2px; min-width:90px; cursor:pointer; transition:opacity 0.15s; }
        .fp-stat:hover { opacity:0.8; }
        .fp-stat-label { font-size:10px; font-weight:500; letter-spacing:0.08em; text-transform:uppercase; }
        .fp-stat-value { font-size:22px; font-weight:500; font-family:'IBM Plex Mono',monospace; color:var(--text-strong, #f1ede8); }
        .fp-btn-new { display:flex; align-items:center; gap:6px; background:linear-gradient(135deg,var(--accent-pressed, #c2410c),var(--accent, #ea580c),var(--accent-mid, #f97316)); border:none; border-radius:7px; padding:7px 14px; font-size:12px; font-weight:500; font-family:'IBM Plex Sans',sans-serif; color:white; cursor:pointer; box-shadow:0 3px 12px rgba(234,88,12,0.3); flex-shrink:0; align-self:flex-end; }
        .fp-btn-new:hover { opacity:0.88; }
        .fp-btn-new svg { width:13px; height:13px; display:block; flex-shrink:0; }
        .fp-error-bar { background:rgba(239,68,68,0.08); border:0.5px solid rgba(239,68,68,0.2); border-radius:8px; padding:10px 14px; margin-bottom:10px; font-size:13px; color:var(--danger-subtle, #fca5a5); flex-shrink:0; }
      `}</style>

      <div className="fp-page">
        {periods.length > 0 && (
          <div className="fp-stats">
            {(['open', 'closed', 'locked'] as PeriodStatus[]).map(s => {
              const c = STATUS_CONFIG[s];
              return (
                <div key={s} className="fp-stat" style={{ border: `0.5px solid ${statCard === s ? c.border : 'rgba(255,255,255,0.07)'}` }} onClick={() => setStatCard(prev => prev === s ? '' : s)}>
                  <span className="fp-stat-label" style={{ color: c.color }}>{s.charAt(0).toUpperCase() + s.slice(1)}</span>
                  <span className="fp-stat-value">{counts[s]}</span>
                </div>
              );
            })}
            <div className="fp-stat" style={{ border: `0.5px solid ${!statCard ? 'rgba(251,146,60,0.3)' : 'rgba(255,255,255,0.07)'}` }} onClick={() => setStatCard('')}>
              <span className="fp-stat-label" style={{ color: 'rgba(251,146,60,0.6)' }}>Total</span>
              <span className="fp-stat-value" style={{ color: 'var(--accent-strong, #fb923c)' }}>{periods.length}</span>
            </div>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 10, flexShrink: 0, flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}>
            <ERPFilterBar filters={filterDefs} values={filterVals} onChange={setFilterVal} onReset={() => { resetFilters(); setStatCard(''); }} activeCount={filterCount + (statCard ? 1 : 0)} />
          </div>
          <button className="fp-btn-new" onClick={() => { setEditing(null); setModalOpen(true); }}>
            <svg viewBox="0 0 13 13" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><line x1="6.5" y1="1" x2="6.5" y2="12" /><line x1="1" y1="6.5" x2="12" y2="6.5" /></svg>
            New Period
          </button>
        </div>

        {error && <div className="fp-error-bar">{error}</div>}

        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <ERPTable<FiscalPeriod>
            columns={columns}
            data={filtered}
            rowKey={r => r.id}
            loading={loading}
            exportFilename="fiscal-periods"
            emptyMessage={filterCount || statCard ? 'No periods match your filters.' : 'No fiscal periods yet.'}
            defaultPageSize={25}
            maxHeight="100%"
          />
        </div>
      </div>

      <PeriodModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={fetchPeriods} initial={editing} />

      <ConfirmModal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete fiscal period?"
        description={deleting ? `${deleting.periodCode} — ${deleting.periodName} will be deleted. Cannot delete closed/locked periods or periods with journal entries.` : ''}
        variant="destructive"
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!deleting) return;
          await fiscalPeriodsApi.remove(deleting.id);
          setDeleting(null);
          fetchPeriods();
        }}
      />

      <ConfirmModal
        open={confirmAction !== null}
        onClose={() => setConfirmAction(null)}
        title={confirmAction ? `${ACTION_COPY[confirmAction.action].title} ${confirmAction.period.periodCode}?` : ''}
        description={confirmAction ? ACTION_COPY[confirmAction.action].description : undefined}
        variant={confirmAction ? ACTION_COPY[confirmAction.action].variant : 'default'}
        confirmLabel={confirmAction ? ACTION_COPY[confirmAction.action].label : undefined}
        onConfirm={async () => { if (confirmAction) await runAction(confirmAction.id, confirmAction.action); }}
      />
    </ERPShell>
  );
}
