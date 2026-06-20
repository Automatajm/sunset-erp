"use client";
// ============================================================================
// frontend/app/accounting/journal-entries/page.tsx
// spec-ux-t6-finance T6.2 — ERPTable + ERPFilterBar + FormModal + SearchSelect + ConfirmModal.
// Expandable-row line detail → row-click ModalShell.
// ============================================================================
import { useEffect, useState, useCallback, useMemo } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import SearchSelect from '@/components/ui/SearchSelect';
import { ERPTable, ERPColumn } from '@/components/ui/ERPTable';
import { ERPFilterBar, ERPFilter, useERPFilters, applyERPFilters } from '@/components/ui/ERPFilterBar';
import { FormModal } from '@/components/ui/modal/FormModal';
import { ModalShell } from '@/components/ui/modal/ModalShell';
import { PrintButton } from '@/components/print/PrintButton';
import { ConfirmModal } from '@/components/ui/modal';
import { journalEntriesApi } from '@/lib/api/journal-entries';
import { chartOfAccountsApi } from '@/lib/api/chart-of-accounts';
import { JournalEntry, CreateJournalEntryDto, CreateJournalEntryLineDto, JournalType, EntryStatus, Account } from '@/lib/api/types';

const JOURNAL_TYPES: { value: JournalType; label: string }[] = [
  { value: 'general', label: 'General' }, { value: 'adjustment', label: 'Adjustment' },
  { value: 'closing', label: 'Closing' }, { value: 'opening', label: 'Opening' },
];
const EMPTY_LINE: CreateJournalEntryLineDto = { accountId: '', debitAmount: 0, creditAmount: 0, description: '' };
const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
const fmtAmt = (n: number) => n === 0 ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
function calcTotals(lines: CreateJournalEntryLineDto[]) {
  const debit = lines.reduce((s, l) => s + (Number(l.debitAmount) || 0), 0);
  const credit = lines.reduce((s, l) => s + (Number(l.creditAmount) || 0), 0);
  return { debit, credit, balanced: Math.abs(debit - credit) < 0.001 };
}

const MONO = { fontFamily: "'IBM Plex Mono',monospace", fontSize: 12 } as React.CSSProperties;
const INP: React.CSSProperties = { background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '9px 12px', fontSize: 13, fontFamily: "'IBM Plex Sans',sans-serif", color: 'var(--text-strong, #f1ede8)', outline: 'none', width: '100%' };
const LBL: React.CSSProperties = { fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(251,146,60,0.6)' };

function StatusBadge({ status }: { status: EntryStatus }) {
  const posted = status === 'posted';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 500, color: posted ? 'var(--success, #4ade80)' : 'var(--warning, #fbbf24)', background: posted ? 'rgba(74,222,128,0.1)' : 'rgba(251,191,36,0.1)', border: `0.5px solid ${posted ? 'rgba(74,222,128,0.2)' : 'rgba(251,191,36,0.2)'}` }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: posted ? 'var(--success, #4ade80)' : 'var(--warning, #fbbf24)', flexShrink: 0 }} />{posted ? 'Posted' : 'Draft'}
    </span>
  );
}
function TypeBadge({ type }: { type: JournalType }) {
  return <span style={{ display: 'inline-flex', padding: '2px 8px', borderRadius: 20, fontSize: 11, color: 'rgba(255,255,255,0.55)', background: 'rgba(255,255,255,0.06)', border: '0.5px solid rgba(255,255,255,0.1)', whiteSpace: 'nowrap' }}>{type.charAt(0).toUpperCase() + type.slice(1)}</span>;
}

// ─── Detail modal (lines) ─────────────────────────────────────────────────────
function JEDetailModal({ entry, onClose }: { entry: JournalEntry | null; onClose: () => void }) {
  const totalDebit = entry ? entry.lines.reduce((s, l) => s + l.debitAmount, 0) : 0;
  const totalCredit = entry ? entry.lines.reduce((s, l) => s + l.creditAmount, 0) : 0;
  const TH = (h: string, right = false) =>
    <th key={h} style={{ padding: '6px 10px', fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: right ? 'right' : 'left', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>{h}</th>;
  return (
    <ModalShell open={!!entry} onClose={onClose} title={entry ? `${entry.entryNumber} — Lines` : ''} width={760}>
      {entry && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr>{TH('#')}{TH('Account')}{TH('Description')}{TH('Debit', true)}{TH('Credit', true)}</tr></thead>
          <tbody>
            {entry.lines.map(line => (
              <tr key={line.id}>
                <td style={{ padding: '7px 10px', fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{line.lineNumber}</td>
                <td style={{ padding: '7px 10px' }}><span style={{ ...MONO, fontSize: 11, color: 'var(--accent-strong, #fb923c)' }}>{line.account?.accountNumber}</span> <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{line.account?.name}</span></td>
                <td style={{ padding: '7px 10px', fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{line.description || '—'}</td>
                <td style={{ padding: '7px 10px', textAlign: 'right', ...MONO, color: line.debitAmount > 0 ? 'var(--text-primary, #e2dfd8)' : 'rgba(255,255,255,0.2)' }}>{fmtAmt(line.debitAmount)}</td>
                <td style={{ padding: '7px 10px', textAlign: 'right', ...MONO, color: line.creditAmount > 0 ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.2)' }}>{fmtAmt(line.creditAmount)}</td>
              </tr>
            ))}
            <tr style={{ borderTop: '0.5px solid rgba(255,255,255,0.08)' }}>
              <td colSpan={3} style={{ padding: '7px 10px', fontSize: 11, color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>TOTALS</td>
              <td style={{ padding: '7px 10px', textAlign: 'right', ...MONO, color: 'var(--success, #4ade80)', fontWeight: 500 }}>{fmtAmt(totalDebit)}</td>
              <td style={{ padding: '7px 10px', textAlign: 'right', ...MONO, color: 'var(--success, #4ade80)', fontWeight: 500 }}>{fmtAmt(totalCredit)}</td>
            </tr>
          </tbody>
        </table>
      )}
    </ModalShell>
  );
}

// ─── Create modal (shared FormModal) ──────────────────────────────────────────
function CreateModal({ open, onClose, onSaved, accounts }: {
  open: boolean; onClose: () => void; onSaved: () => void; accounts: Account[];
}) {
  const [form, setForm] = useState<Omit<CreateJournalEntryDto, 'lines'> & { fiscalPeriod: string }>({ entryDate: new Date().toISOString().split('T')[0], journalType: 'general' as JournalType, description: '', fiscalPeriod: '' });
  const [lines, setLines] = useState<CreateJournalEntryLineDto[]>([{ ...EMPTY_LINE }, { ...EMPTY_LINE }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setForm({ entryDate: new Date().toISOString().split('T')[0], journalType: 'general' as JournalType, description: '', fiscalPeriod: '' });
      setLines([{ ...EMPTY_LINE }, { ...EMPTY_LINE }]);
    }
  }, [open]);

  const setLine = (idx: number, key: keyof CreateJournalEntryLineDto, value: string | number) =>
    setLines(ls => ls.map((l, i) => i === idx ? { ...l, [key]: value } : l));

  const { debit, credit, balanced } = calcTotals(lines);
  const validLines = lines.filter(l => l.accountId);
  const isValid = validLines.length >= 2 && balanced;

  const submit = async () => {
    if (validLines.length < 2) { setError('At least 2 lines with accounts required.'); return; }
    if (!balanced) { setError(`Entry not balanced — Debit: ${debit.toFixed(2)}, Credit: ${credit.toFixed(2)}`); return; }
    setSubmitting(true); setError(null);
    try {
      await journalEntriesApi.create({ entryDate: form.entryDate, journalType: form.journalType as JournalType, description: form.description || undefined, reference: form.reference || undefined, lines: validLines });
      onSaved(); onClose();
    } catch (err) {
      setError((err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Operation failed.');
    } finally { setSubmitting(false); }
  };

  const acctOpts = accounts.filter(a => a.allowManualPosting).map(a => ({ value: a.id, label: `${a.accountNumber} — ${a.name}` }));
  const Field = ({ label, children }: { label: string; children: React.ReactNode }) =>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}><label style={LBL}>{label}</label>{children}</div>;

  return (
    <FormModal open={open} onClose={onClose} title="New Journal Entry" submitLabel="Create Entry" submitting={submitting} isValid={isValid} error={error} onSubmit={submit} width={760}>
      <style>{`
        .jel-table{width:100%;border-collapse:collapse}
        .jel-table th{font-size:10px;color:rgba(251,146,60,0.5);text-transform:uppercase;letter-spacing:0.08em;padding:5px 8px;text-align:left;border-bottom:0.5px solid rgba(255,255,255,0.06);white-space:nowrap}
        .jel-table td{padding:5px 4px;vertical-align:middle}
        .jel-inp{background:rgba(255,255,255,0.04);border:0.5px solid rgba(255,255,255,0.1);border-radius:6px;padding:6px 8px;font-size:12px;font-family:'IBM Plex Sans',sans-serif;color:var(--text-strong, #f1ede8);outline:none;width:100%}
        .jel-btn-rm{width:22px;height:22px;border-radius:5px;background:rgba(239,68,68,0.1);border:0.5px solid rgba(239,68,68,0.2);color:var(--danger, #f87171);cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
        .jel-section{font-size:10px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.25);padding:6px 0 4px;border-bottom:0.5px solid rgba(255,255,255,0.06);margin-top:4px;display:flex;align-items:center;justify-content:space-between}
        .jel-btn-add{background:rgba(255,255,255,0.04);border:0.5px solid rgba(255,255,255,0.1);border-radius:6px;padding:6px 12px;font-size:11px;color:rgba(255,255,255,0.5);cursor:pointer;font-family:'IBM Plex Sans',sans-serif}
      `}</style>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
          <Field label="Entry Date *"><input style={INP} type="date" value={form.entryDate} onChange={e => setForm(f => ({ ...f, entryDate: e.target.value }))} /></Field>
          <Field label="Journal Type *">
            <SearchSelect options={JOURNAL_TYPES.map(t => ({ value: t.value, label: t.label }))} value={form.journalType} onChange={v => setForm(f => ({ ...f, journalType: v as JournalType }))} placeholder="Type…" minWidth={200} />
          </Field>
          <Field label="Fiscal Period"><input style={INP} placeholder="2026-03" value={form.fiscalPeriod} onChange={e => setForm(f => ({ ...f, fiscalPeriod: e.target.value }))} /></Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Description"><input style={INP} placeholder="Entry description" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></Field>
          <Field label="Reference"><input style={INP} placeholder="SO-001 / RCPT-001" value={form.reference ?? ''} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} /></Field>
        </div>

        <div className="jel-section">
          <span>Journal Lines</span>
          <button type="button" className="jel-btn-add" onClick={() => setLines(ls => [...ls, { ...EMPTY_LINE }])}>+ Add Line</button>
        </div>
        <table className="jel-table">
          <thead><tr><th style={{ width: 230 }}>Account *</th><th>Description</th><th style={{ width: 110 }}>Debit</th><th style={{ width: 110 }}>Credit</th><th style={{ width: 28 }}></th></tr></thead>
          <tbody>
            {lines.map((line, idx) => (
              <tr key={idx}>
                <td>
                  <SearchSelect options={acctOpts} value={line.accountId} onChange={v => setLine(idx, 'accountId', v)} placeholder="Select account…" clearLabel="— Select —" minWidth={280} />
                </td>
                <td><input className="jel-inp" placeholder="Description" value={line.description ?? ''} onChange={e => setLine(idx, 'description', e.target.value)} /></td>
                <td><input className="jel-inp" type="number" min="0" step="0.01" placeholder="0.00" value={line.debitAmount || ''} onChange={e => { const v = Number(e.target.value) || 0; setLine(idx, 'debitAmount', v); if (v > 0) setLine(idx, 'creditAmount', 0); }} style={{ textAlign: 'right' }} /></td>
                <td><input className="jel-inp" type="number" min="0" step="0.01" placeholder="0.00" value={line.creditAmount || ''} onChange={e => { const v = Number(e.target.value) || 0; setLine(idx, 'creditAmount', v); if (v > 0) setLine(idx, 'debitAmount', 0); }} style={{ textAlign: 'right' }} /></td>
                <td>{lines.length > 2 && <button type="button" className="jel-btn-rm" onClick={() => setLines(ls => ls.filter((_, i) => i !== idx))}>×</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Total Debit</span>
            <span style={{ ...MONO, fontSize: 15, fontWeight: 500, color: 'var(--text-primary, #e2dfd8)' }}>{fmtAmt(debit)}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Total Credit</span>
            <span style={{ ...MONO, fontSize: 15, fontWeight: 500, color: 'rgba(255,255,255,0.55)' }}>{fmtAmt(credit)}</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Difference</span>
            <span style={{ ...MONO, fontSize: 15, fontWeight: 500, color: balanced ? 'var(--success, #4ade80)' : 'var(--danger, #f87171)' }}>{fmtAmt(Math.abs(debit - credit))}</span>
          </div>
          {debit > 0 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, padding: '3px 10px', borderRadius: 20, color: balanced ? 'var(--success, #4ade80)' : 'var(--danger, #f87171)', background: balanced ? 'rgba(74,222,128,0.1)' : 'rgba(239,68,68,0.1)', border: `0.5px solid ${balanced ? 'rgba(74,222,128,0.2)' : 'rgba(239,68,68,0.2)'}` }}>
              {balanced
                ? <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>Balanced</>
                : <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>Not balanced</>}
            </span>
          )}
        </div>
      </div>
    </FormModal>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────
export default function JournalEntriesPage() {
  const [entries,    setEntries]    = useState<JournalEntry[]>([]);
  const [accounts,   setAccounts]   = useState<Account[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [modalOpen,  setModalOpen]  = useState(false);
  const [detailEntry, setDetailEntry] = useState<JournalEntry | null>(null);
  const [deleting,   setDeleting]   = useState<JournalEntry | null>(null);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ run: () => Promise<void>; title: string; description: string; variant: 'default' | 'destructive'; label: string } | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [jes, accs] = await Promise.all([journalEntriesApi.getAll(), chartOfAccountsApi.getAll()]);
      setEntries(jes); setAccounts(accs);
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to load data.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handlePost = async (id: string) => {
    setActionBusy(id);
    try { await journalEntriesApi.post(id); fetchAll(); }
    catch (err) { setError((err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Post failed.'); }
    finally { setActionBusy(null); }
  };
  const handleUnpost = async (id: string) => {
    setActionBusy(id);
    try { await journalEntriesApi.unpost(id); fetchAll(); }
    catch (err) { setError((err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Unpost failed.'); }
    finally { setActionBusy(null); }
  };

  const postedCount = entries.filter(e => e.status === 'posted').length;
  const draftCount = entries.filter(e => e.status === 'draft').length;

  // ── Filters ────────────────────────────────────────────────────────────────
  const filterDefs = useMemo<ERPFilter<JournalEntry>[]>(() => [
    {
      key: 'search', label: 'Search', type: 'search', placeholder: 'Search number, description, reference…',
      filterFn: (row, val) => {
        const q = String(val).toLowerCase();
        return row.entryNumber.toLowerCase().includes(q) || (row.description ?? '').toLowerCase().includes(q) || (row.reference ?? '').toLowerCase().includes(q);
      },
    },
    { key: 'status', label: 'Status', type: 'multiselect', options: [{ value: 'draft', label: 'Draft', color: 'var(--warning, #fbbf24)' }, { value: 'posted', label: 'Posted', color: 'var(--success, #4ade80)' }] },
    { key: 'journalType', label: 'Type', type: 'multiselect', options: JOURNAL_TYPES.map(t => ({ value: t.value, label: t.label })) },
  ], []);

  const { values: filterVals, setValue: setFilterVal, reset: resetFilters, activeCount: filterCount } = useERPFilters(filterDefs);
  const filtered = useMemo(() => applyERPFilters(entries, filterDefs, filterVals), [entries, filterDefs, filterVals]);

  // ── Columns ────────────────────────────────────────────────────────────────
  const columns = useMemo<ERPColumn<JournalEntry>[]>(() => [
    { key: 'entryNumber', header: 'Entry #', width: 130, sortable: true, value: r => r.entryNumber, render: r => <span style={{ ...MONO, color: 'var(--accent-strong, #fb923c)' }}>{r.entryNumber}</span> },
    { key: 'entryDate', header: 'Date', width: 120, sortable: true, value: r => r.entryDate, render: r => <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{fmtDate(r.entryDate)}</span> },
    { key: 'journalType', header: 'Type', width: 110, sortable: true, value: r => r.journalType, render: r => <TypeBadge type={r.journalType} /> },
    {
      key: 'description', header: 'Description / Reference', sortable: true, value: r => r.description ?? '',
      render: r => <div><span style={{ color: 'var(--text-primary, #e2dfd8)', fontWeight: 500 }}>{r.description || '—'}</span>{r.reference && <div style={{ fontSize: 11, color: 'rgba(251,146,60,0.6)', marginTop: 1 }}>{r.reference}</div>}</div>,
    },
    { key: 'debit', header: 'Debit', width: 120, align: 'right', sortable: true, value: r => r.lines.reduce((s, l) => s + l.debitAmount, 0), render: r => <span style={{ ...MONO, color: 'var(--text-primary, #e2dfd8)' }}>{fmtAmt(r.lines.reduce((s, l) => s + l.debitAmount, 0))}</span> },
    { key: 'credit', header: 'Credit', width: 120, align: 'right', sortable: true, value: r => r.lines.reduce((s, l) => s + l.creditAmount, 0), render: r => <span style={{ ...MONO, color: 'rgba(255,255,255,0.5)' }}>{fmtAmt(r.lines.reduce((s, l) => s + l.creditAmount, 0))}</span> },
    { key: 'status', header: 'Status', width: 100, sortable: true, value: r => r.status, render: r => <StatusBadge status={r.status} /> },
    {
      key: '_actions', header: '', width: 170, sortable: false,
      render: r => {
        const busy = actionBusy === r.id;
        return (
          <div style={{ display: 'flex', gap: 5 }} onClick={e => e.stopPropagation()}>
            {r.status === 'draft' && (
              <>
                <button onClick={() => setConfirmAction({ run: () => handlePost(r.id), title: 'Post journal entry?', description: 'Posting locks the entry into the general ledger.', variant: 'default', label: 'Post' })} disabled={busy}
                  style={{ padding: '4px 9px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(74,222,128,0.1)', color: 'var(--success, #4ade80)', border: '0.5px solid rgba(74,222,128,0.2)', opacity: busy ? 0.5 : 1, fontFamily: "'IBM Plex Sans',sans-serif" }}>{busy ? '…' : 'Post'}</button>
                <button onClick={() => setDeleting(r)} style={{ padding: '4px 9px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(239,68,68,0.08)', color: 'var(--danger, #f87171)', border: '0.5px solid rgba(239,68,68,0.2)', fontFamily: "'IBM Plex Sans',sans-serif" }}>Delete</button>
              </>
            )}
            {r.status === 'posted' && (
              <button onClick={() => setConfirmAction({ run: () => handleUnpost(r.id), title: 'Unpost journal entry?', description: 'This returns the entry to draft and reverses its ledger effect.', variant: 'destructive', label: 'Unpost' })} disabled={busy}
                style={{ padding: '4px 9px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(251,191,36,0.08)', color: 'var(--warning, #fbbf24)', border: '0.5px solid rgba(251,191,36,0.2)', opacity: busy ? 0.5 : 1, fontFamily: "'IBM Plex Sans',sans-serif" }}>{busy ? '…' : 'Unpost'}</button>
            )}
            <PrintButton doc="journal-entry" id={r.id} label="" style={{ padding: '4px 8px' }} />
          </div>
        );
      },
    },
  ], [actionBusy]);

  return (
    <ERPShell breadcrumbs={['Home', 'Financial', 'Journal Entries']} title="Journal Entries">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap');
        .je-page { padding: 0 18px 12px; display:flex; flex-direction:column; height:100%; overflow:hidden; }
        .je-stats { display:flex; gap:10px; margin-bottom:12px; flex-shrink:0; }
        .je-stat { background:rgba(10,7,18,0.7); border-radius:8px; padding:8px 14px; display:flex; flex-direction:column; gap:2px; min-width:100px; }
        .je-stat-label { font-size:10px; font-weight:500; letter-spacing:0.08em; text-transform:uppercase; }
        .je-stat-value { font-size:22px; font-weight:500; font-family:'IBM Plex Mono',monospace; color:var(--text-strong, #f1ede8); }
        .je-btn-new { display:flex; align-items:center; gap:6px; background:linear-gradient(135deg,var(--accent-pressed, #c2410c),var(--accent, #ea580c),var(--accent-mid, #f97316)); border:none; border-radius:7px; padding:7px 14px; font-size:12px; font-weight:500; font-family:'IBM Plex Sans',sans-serif; color:white; cursor:pointer; box-shadow:0 3px 12px rgba(234,88,12,0.3); flex-shrink:0; align-self:flex-end; }
        .je-btn-new:hover { opacity:0.88; }
        .je-btn-new svg { width:13px; height:13px; display:block; flex-shrink:0; }
        .je-page-error { background:rgba(239,68,68,0.08); border:0.5px solid rgba(239,68,68,0.2); border-radius:8px; padding:10px 14px; margin-bottom:10px; font-size:13px; color:var(--danger-subtle, #fca5a5); flex-shrink:0; }
      `}</style>

      <div className="je-page">
        {entries.length > 0 && (
          <div className="je-stats">
            <div className="je-stat" style={{ border: '0.5px solid rgba(74,222,128,0.2)' }}><span className="je-stat-label" style={{ color: 'var(--success, #4ade80)' }}>Posted</span><span className="je-stat-value">{postedCount}</span></div>
            <div className="je-stat" style={{ border: '0.5px solid rgba(251,191,36,0.2)' }}><span className="je-stat-label" style={{ color: 'var(--warning, #fbbf24)' }}>Draft</span><span className="je-stat-value">{draftCount}</span></div>
            <div className="je-stat" style={{ border: '0.5px solid rgba(251,146,60,0.2)' }}><span className="je-stat-label" style={{ color: 'rgba(251,146,60,0.6)' }}>Total</span><span className="je-stat-value" style={{ color: 'var(--accent-strong, #fb923c)' }}>{entries.length}</span></div>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 10, flexShrink: 0, flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}>
            <ERPFilterBar filters={filterDefs} values={filterVals} onChange={setFilterVal} onReset={resetFilters} activeCount={filterCount} />
          </div>
          <button className="je-btn-new" onClick={() => setModalOpen(true)}>
            <svg viewBox="0 0 13 13" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><line x1="6.5" y1="1" x2="6.5" y2="12" /><line x1="1" y1="6.5" x2="12" y2="6.5" /></svg>
            New Entry
          </button>
        </div>

        {error && <div className="je-page-error">{error}</div>}

        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <ERPTable<JournalEntry>
            columns={columns}
            data={filtered}
            rowKey={r => r.id}
            loading={loading}
            exportFilename="journal-entries"
            emptyMessage={filterCount ? 'No entries match your filters.' : 'No journal entries yet.'}
            defaultPageSize={25}
            maxHeight="100%"
            onRowClick={r => setDetailEntry(r)}
          />
        </div>
      </div>

      <CreateModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={fetchAll} accounts={accounts} />
      <JEDetailModal entry={detailEntry} onClose={() => setDetailEntry(null)} />

      <ConfirmModal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete journal entry?"
        description={deleting ? `${deleting.entryNumber} — ${deleting.description || 'No description'}. Only draft entries can be deleted.` : ''}
        variant="destructive"
        confirmLabel="Delete"
        onConfirm={async () => {
          if (!deleting) return;
          await journalEntriesApi.remove(deleting.id);
          setDeleting(null);
          fetchAll();
        }}
      />

      <ConfirmModal
        open={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        title={confirmAction?.title ?? ''}
        description={confirmAction?.description}
        variant={confirmAction?.variant}
        confirmLabel={confirmAction?.label}
        onConfirm={async () => { if (confirmAction) await confirmAction.run(); }}
      />
    </ERPShell>
  );
}
