"use client";

import { useEffect, useState, useCallback } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import { journalEntriesApi } from '@/lib/api/journal-entries';
import { PrintButton } from '@/components/print/PrintButton';
import { chartOfAccountsApi } from '@/lib/api/chart-of-accounts';
import {
  JournalEntry, CreateJournalEntryDto, CreateJournalEntryLineDto,
  JournalType, EntryStatus, Account,
} from '@/lib/api/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const JOURNAL_TYPES: { value: JournalType; label: string }[] = [
  { value: 'general',    label: 'General' },
  { value: 'adjustment', label: 'Adjustment' },
  { value: 'closing',    label: 'Closing' },
  { value: 'opening',    label: 'Opening' },
];

// No `currency` — the backend line DTO doesn't accept it and the global
// ValidationPipe (forbidNonWhitelisted) would 400 the whole entry.
const EMPTY_LINE: CreateJournalEntryLineDto = {
  accountId: '', debitAmount: 0, creditAmount: 0, description: '',
};

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtAmt(n: number) {
  return n === 0 ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function calcTotals(lines: CreateJournalEntryLineDto[]) {
  const debit  = lines.reduce((s, l) => s + (Number(l.debitAmount)  || 0), 0);
  const credit = lines.reduce((s, l) => s + (Number(l.creditAmount) || 0), 0);
  return { debit, credit, balanced: Math.abs(debit - credit) < 0.001 };
}

// ─── Badges ───────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: EntryStatus }) {
  const posted = status === 'posted';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 500,
      color: posted ? '#4ade80' : '#fbbf24',
      background: posted ? 'rgba(74,222,128,0.1)' : 'rgba(251,191,36,0.1)',
      border: `0.5px solid ${posted ? 'rgba(74,222,128,0.2)' : 'rgba(251,191,36,0.2)'}`,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: posted ? '#4ade80' : '#fbbf24', flexShrink: 0 }} />
      {posted ? 'Posted' : 'Draft'}
    </span>
  );
}

function TypeBadge({ type }: { type: JournalType }) {
  return (
    <span style={{
      display: 'inline-flex', padding: '2px 8px', borderRadius: 20, fontSize: 11,
      color: 'rgba(255,255,255,0.55)', background: 'rgba(255,255,255,0.06)',
      border: '0.5px solid rgba(255,255,255,0.1)', whiteSpace: 'nowrap',
    }}>
      {type.charAt(0).toUpperCase() + type.slice(1)}
    </span>
  );
}

// ─── Expandable entry row ─────────────────────────────────────────────────────

function EntryRow({ entry, onPost, onUnpost, onDelete, actionBusy }: {
  entry: JournalEntry;
  onPost: (id: string) => void;
  onUnpost: (id: string) => void;
  onDelete: (entry: JournalEntry) => void;
  actionBusy: string | null;
}) {
  const [expanded, setExpanded] = useState(false);
  const totalDebit  = entry.lines.reduce((s, l) => s + l.debitAmount,  0);
  const totalCredit = entry.lines.reduce((s, l) => s + l.creditAmount, 0);
  const busy = actionBusy === entry.id;

  return (
    <>
      <tr
        style={{ cursor: 'pointer' }}
        onClick={() => setExpanded(e => !e)}
      >
        <td>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{
              fontSize: 9, color: 'rgba(255,255,255,0.3)',
              transform: expanded ? 'rotate(90deg)' : 'none',
              display: 'inline-block', transition: 'transform 0.15s',
            }}>▶</span>
            <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: '#fb923c' }}>
              {entry.entryNumber}
            </span>
          </span>
        </td>
        <td><span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{fmtDate(entry.entryDate)}</span></td>
        <td><TypeBadge type={entry.journalType} /></td>
        <td>
          <span style={{ color: '#e2dfd8', fontWeight: 500 }}>{entry.description || '—'}</span>
          {entry.reference && (
            <div style={{ fontSize: 11, color: 'rgba(251,146,60,0.6)', marginTop: 1 }}>{entry.reference}</div>
          )}
        </td>
        <td style={{ textAlign: 'right' }}>
          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: '#e2dfd8' }}>
            {fmtAmt(totalDebit)}
          </span>
        </td>
        <td style={{ textAlign: 'right' }}>
          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
            {fmtAmt(totalCredit)}
          </span>
        </td>
        <td><StatusBadge status={entry.status} /></td>
        <td onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', gap: 5 }}>
            {entry.status === 'draft' && (
              <>
                <button
                  onClick={() => onPost(entry.id)}
                  disabled={busy}
                  style={{
                    padding: '4px 9px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
                    background: 'rgba(74,222,128,0.1)', color: '#4ade80',
                    border: '0.5px solid rgba(74,222,128,0.2)', opacity: busy ? 0.5 : 1,
                    fontFamily: "'IBM Plex Sans',sans-serif",
                  }}
                >{busy ? '…' : 'Post'}</button>
                <button
                  onClick={() => onDelete(entry)}
                  style={{
                    padding: '4px 9px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
                    background: 'rgba(239,68,68,0.08)', color: '#f87171',
                    border: '0.5px solid rgba(239,68,68,0.2)',
                    fontFamily: "'IBM Plex Sans',sans-serif",
                  }}
                >Delete</button>
              </>
            )}
            {entry.status === 'posted' && (
              <button
                onClick={() => onUnpost(entry.id)}
                disabled={busy}
                style={{
                  padding: '4px 9px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
                  background: 'rgba(251,191,36,0.08)', color: '#fbbf24',
                  border: '0.5px solid rgba(251,191,36,0.2)', opacity: busy ? 0.5 : 1,
                  fontFamily: "'IBM Plex Sans',sans-serif",
                }}
              >{busy ? '…' : 'Unpost'}</button>
            )}
            <PrintButton doc="journal-entry" id={entry.id} label="" style={{ padding: '4px 8px' }} />
          </div>
        </td>
      </tr>

      {/* Expanded lines */}
      {expanded && (
        <tr>
          <td colSpan={8} style={{ padding: 0, background: 'rgba(251,146,60,0.02)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ padding: '6px 14px 6px 40px', fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: 'left', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>
                    #
                  </th>
                  <th style={{ padding: '6px 14px', fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: 'left', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>Account</th>
                  <th style={{ padding: '6px 14px', fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: 'left', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>Description</th>
                  <th style={{ padding: '6px 14px', fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: 'right', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>Debit</th>
                  <th style={{ padding: '6px 14px', fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: 'right', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>Credit</th>
                </tr>
              </thead>
              <tbody>
                {entry.lines.map(line => (
                  <tr key={line.id}>
                    <td style={{ padding: '7px 14px 7px 40px', fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{line.lineNumber}</td>
                    <td style={{ padding: '7px 14px' }}>
                      <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: '#fb923c' }}>
                        {line.account?.accountNumber}
                      </span>
                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginLeft: 8 }}>
                        {line.account?.name}
                      </span>
                    </td>
                    <td style={{ padding: '7px 14px', fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{line.description || '—'}</td>
                    <td style={{ padding: '7px 14px', textAlign: 'right', fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: line.debitAmount > 0 ? '#e2dfd8' : 'rgba(255,255,255,0.2)' }}>
                      {fmtAmt(line.debitAmount)}
                    </td>
                    <td style={{ padding: '7px 14px', textAlign: 'right', fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: line.creditAmount > 0 ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.2)' }}>
                      {fmtAmt(line.creditAmount)}
                    </td>
                  </tr>
                ))}
                {/* Totals row */}
                <tr style={{ borderTop: '0.5px solid rgba(255,255,255,0.08)' }}>
                  <td colSpan={3} style={{ padding: '7px 14px 7px 40px', fontSize: 11, color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>TOTALS</td>
                  <td style={{ padding: '7px 14px', textAlign: 'right', fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: '#4ade80', fontWeight: 500 }}>
                    {fmtAmt(totalDebit)}
                  </td>
                  <td style={{ padding: '7px 14px', textAlign: 'right', fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: '#4ade80', fontWeight: 500 }}>
                    {fmtAmt(totalCredit)}
                  </td>
                </tr>
              </tbody>
            </table>
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Create modal ─────────────────────────────────────────────────────────────

function CreateModal({ open, onClose, onSaved, accounts }: {
  open: boolean; onClose: () => void; onSaved: () => void; accounts: Account[];
}) {
  // fiscalPeriod is UI-only (not part of CreateJournalEntryDto — backend derives it)
  const [form, setForm] = useState<Omit<CreateJournalEntryDto, 'lines'> & { fiscalPeriod: string }>({
    entryDate: new Date().toISOString().split('T')[0],
    journalType: 'general' as JournalType,
    description: '', fiscalPeriod: '',
  });
  const [lines, setLines] = useState<CreateJournalEntryLineDto[]>([
    { ...EMPTY_LINE }, { ...EMPTY_LINE },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setError('');
      setForm({
        entryDate: new Date().toISOString().split('T')[0],
        journalType: 'general' as JournalType, description: '', fiscalPeriod: '',
      });
      setLines([{ ...EMPTY_LINE }, { ...EMPTY_LINE }]);
    }
  }, [open]);

  const setField = (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }));

  const setLine = (idx: number, key: keyof CreateJournalEntryLineDto, value: string | number) =>
    setLines(ls => ls.map((l, i) => i === idx ? { ...l, [key]: value } : l));

  const addLine = () => setLines(ls => [...ls, { ...EMPTY_LINE }]);
  const removeLine = (idx: number) => setLines(ls => ls.filter((_, i) => i !== idx));

  const { debit, credit, balanced } = calcTotals(lines);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validLines = lines.filter(l => l.accountId);
    if (validLines.length < 2) { setError('At least 2 lines with accounts required.'); return; }
    if (!balanced) { setError(`Entry not balanced — Debit: ${debit.toFixed(2)}, Credit: ${credit.toFixed(2)}`); return; }
    setSubmitting(true); setError('');
    try {
      await journalEntriesApi.create({ entryDate: form.entryDate, journalType: form.journalType as JournalType, description: form.description || undefined, reference: form.reference || undefined, lines: validLines });
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
        .je-overlay { position:fixed; inset:0; z-index:400; background:rgba(0,0,0,0.7); backdrop-filter:blur(4px); display:flex; align-items:flex-start; justify-content:center; padding:20px; overflow-y:auto; }
        .je-box { background:#0e0b1a; border:0.5px solid rgba(251,146,60,0.2); border-radius:14px; width:100%; max-width:760px; margin:auto; position:relative; box-shadow:0 24px 60px rgba(0,0,0,0.7); }
        .je-box::before { content:''; position:absolute; top:0; left:30px; right:30px; height:1px; background:linear-gradient(90deg,transparent,rgba(251,146,60,0.4),transparent); }
        .je-hdr { display:flex; align-items:center; justify-content:space-between; padding:16px 20px 12px; border-bottom:0.5px solid rgba(255,255,255,0.06); position:sticky; top:0; background:#0e0b1a; z-index:1; border-radius:14px 14px 0 0; }
        .je-title { font-size:14px; font-weight:500; color:#f1ede8; font-family:'IBM Plex Sans',sans-serif; }
        .je-close { width:24px; height:24px; border-radius:6px; background:rgba(255,255,255,0.06); border:none; cursor:pointer; color:rgba(255,255,255,0.45); font-size:16px; display:flex; align-items:center; justify-content:center; }
        .je-close:hover { background:rgba(255,255,255,0.1); }
        .je-body { padding:16px 20px; display:flex; flex-direction:column; gap:12px; }
        .je-row { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
        .je-row3 { display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; }
        .je-field { display:flex; flex-direction:column; gap:5px; }
        .je-label { font-size:11px; font-weight:500; letter-spacing:0.08em; text-transform:uppercase; color:rgba(251,146,60,0.6); font-family:'IBM Plex Sans',sans-serif; }
        .je-input, .je-select { background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.1); border-radius:7px; padding:9px 12px; font-size:13px; font-family:'IBM Plex Sans',sans-serif; color:#f1ede8; outline:none; width:100%; transition:border-color 0.2s; }
        .je-input::placeholder { color:rgba(255,255,255,0.18); }
        .je-input:focus, .je-select:focus { border-color:rgba(251,146,60,0.45); box-shadow:0 0 0 2px rgba(234,88,12,0.1); }
        .je-select option { background:#0e0b1a; color:#f1ede8; }
        .je-section { font-size:10px; font-weight:500; letter-spacing:0.12em; text-transform:uppercase; color:rgba(255,255,255,0.25); padding:6px 0 4px; border-bottom:0.5px solid rgba(255,255,255,0.06); margin-top:4px; display:flex; align-items:center; justify-content:space-between; }
        .je-lines-table { width:100%; border-collapse:collapse; }
        .je-lines-table th { font-size:10px; color:rgba(251,146,60,0.5); text-transform:uppercase; letter-spacing:0.08em; padding:5px 8px; text-align:left; border-bottom:0.5px solid rgba(255,255,255,0.06); white-space:nowrap; }
        .je-lines-table td { padding:5px 4px; vertical-align:middle; }
        .je-line-input { background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.1); border-radius:6px; padding:6px 8px; font-size:12px; font-family:'IBM Plex Sans',sans-serif; color:#f1ede8; outline:none; width:100%; }
        .je-line-input:focus { border-color:rgba(251,146,60,0.4); }
        .je-line-select { background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.1); border-radius:6px; padding:6px 8px; font-size:12px; font-family:'IBM Plex Sans',sans-serif; color:#f1ede8; outline:none; width:100%; }
        .je-line-select option { background:#0e0b1a; }
        .je-btn-remove-line { width:22px; height:22px; border-radius:5px; background:rgba(239,68,68,0.1); border:0.5px solid rgba(239,68,68,0.2); color:#f87171; cursor:pointer; font-size:14px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
        .je-btn-add-line { background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.1); border-radius:6px; padding:6px 12px; font-size:11px; color:rgba(255,255,255,0.5); cursor:pointer; font-family:'IBM Plex Sans',sans-serif; transition:background 0.15s; }
        .je-btn-add-line:hover { background:rgba(255,255,255,0.08); color:rgba(255,255,255,0.8); }
        .je-totals { display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
        .je-total-block { display:flex; flex-direction:column; gap:2px; }
        .je-total-label { font-size:10px; color:rgba(255,255,255,0.3); text-transform:uppercase; letter-spacing:0.08em; }
        .je-total-value { font-size:15px; font-weight:500; font-family:'IBM Plex Mono',monospace; }
        .je-balance-ok  { color:#4ade80; font-size:11px; background:rgba(74,222,128,0.1); border:0.5px solid rgba(74,222,128,0.2); border-radius:20px; padding:3px 10px; }
        .je-balance-err { color:#f87171; font-size:11px; background:rgba(239,68,68,0.1); border:0.5px solid rgba(239,68,68,0.2); border-radius:20px; padding:3px 10px; }
        .je-error { background:rgba(239,68,68,0.1); border:0.5px solid rgba(239,68,68,0.25); border-radius:7px; padding:8px 12px; font-size:12px; color:#fca5a5; }
        .je-ftr { display:flex; justify-content:flex-end; gap:8px; padding:12px 20px 18px; border-top:0.5px solid rgba(255,255,255,0.06); }
        .je-btn-cancel { background:rgba(255,255,255,0.05); border:0.5px solid rgba(255,255,255,0.1); border-radius:7px; padding:8px 16px; font-size:13px; font-family:'IBM Plex Sans',sans-serif; color:rgba(255,255,255,0.5); cursor:pointer; }
        .je-btn-cancel:hover { background:rgba(255,255,255,0.08); }
        .je-btn-save { background:linear-gradient(135deg,#c2410c,#ea580c,#f97316); border:none; border-radius:7px; padding:8px 20px; font-size:13px; font-weight:500; font-family:'IBM Plex Sans',sans-serif; color:white; cursor:pointer; box-shadow:0 3px 12px rgba(234,88,12,0.35); transition:opacity 0.2s; }
        .je-btn-save:disabled { opacity:0.5; cursor:not-allowed; }
        .je-btn-save:hover:not(:disabled) { opacity:0.88; }
      `}</style>

      <div className="je-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="je-box">
          <div className="je-hdr">
            <span className="je-title">New Journal Entry</span>
            <button className="je-close" onClick={onClose}>×</button>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="je-body">
              {error && <div className="je-error">{error}</div>}

              {/* Header fields */}
              <div className="je-row3">
                <div className="je-field">
                  <label className="je-label">Entry Date *</label>
                  <input className="je-input" type="date" value={form.entryDate} onChange={setField('entryDate')} required />
                </div>
                <div className="je-field">
                  <label className="je-label">Journal Type *</label>
                  <select className="je-select" value={form.journalType} onChange={setField('journalType')}>
                    {JOURNAL_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div className="je-field">
                  <label className="je-label">Fiscal Period</label>
                  <input className="je-input" placeholder="2026-03" value={form.fiscalPeriod} onChange={setField('fiscalPeriod')} />
                </div>
              </div>

              <div className="je-row">
                <div className="je-field">
                  <label className="je-label">Description</label>
                  <input className="je-input" placeholder="Entry description" value={form.description} onChange={setField('description')} />
                </div>
                <div className="je-field">
                  <label className="je-label">Reference</label>
                  <input className="je-input" placeholder="SO-001 / RCPT-001" value={form.reference} onChange={setField('reference')} />
                </div>
              </div>

              {/* Lines */}
              <div className="je-section">
                <span>Journal Lines</span>
                <button type="button" className="je-btn-add-line" onClick={addLine}>+ Add Line</button>
              </div>

              <table className="je-lines-table">
                <thead>
                  <tr>
                    <th style={{ width: 200 }}>Account *</th>
                    <th>Description</th>
                    <th style={{ width: 110 }}>Debit</th>
                    <th style={{ width: 110 }}>Credit</th>
                    <th style={{ width: 28 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => (
                    <tr key={idx}>
                      <td>
                        <select
                          className="je-line-select"
                          value={line.accountId}
                          onChange={e => setLine(idx, 'accountId', e.target.value)}
                        >
                          <option value="">— Select —</option>
                          {accounts
                            .filter(a => a.allowManualPosting)
                            .map(a => (
                              <option key={a.id} value={a.id}>
                                {a.accountNumber} — {a.name}
                              </option>
                            ))}
                        </select>
                      </td>
                      <td>
                        <input
                          className="je-line-input"
                          placeholder="Description"
                          value={line.description ?? ''}
                          onChange={e => setLine(idx, 'description', e.target.value)}
                        />
                      </td>
                      <td>
                        <input
                          className="je-line-input"
                          type="number" min="0" step="0.01" placeholder="0.00"
                          value={line.debitAmount || ''}
                          onChange={e => {
                            const v = Number(e.target.value) || 0;
                            setLine(idx, 'debitAmount', v);
                            if (v > 0) setLine(idx, 'creditAmount', 0);
                          }}
                          style={{ textAlign: 'right' }}
                        />
                      </td>
                      <td>
                        <input
                          className="je-line-input"
                          type="number" min="0" step="0.01" placeholder="0.00"
                          value={line.creditAmount || ''}
                          onChange={e => {
                            const v = Number(e.target.value) || 0;
                            setLine(idx, 'creditAmount', v);
                            if (v > 0) setLine(idx, 'debitAmount', 0);
                          }}
                          style={{ textAlign: 'right' }}
                        />
                      </td>
                      <td>
                        {lines.length > 2 && (
                          <button type="button" className="je-btn-remove-line" onClick={() => removeLine(idx)}>×</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {/* Balance indicator */}
              <div className="je-totals">
                <div className="je-total-block">
                  <span className="je-total-label">Total Debit</span>
                  <span className="je-total-value" style={{ color: '#e2dfd8' }}>{fmtAmt(debit)}</span>
                </div>
                <div className="je-total-block">
                  <span className="je-total-label">Total Credit</span>
                  <span className="je-total-value" style={{ color: 'rgba(255,255,255,0.55)' }}>{fmtAmt(credit)}</span>
                </div>
                <div className="je-total-block">
                  <span className="je-total-label">Difference</span>
                  <span className="je-total-value" style={{ color: balanced ? '#4ade80' : '#f87171' }}>
                    {fmtAmt(Math.abs(debit - credit))}
                  </span>
                </div>
                {debit > 0 && (
                  <span className={balanced ? 'je-balance-ok' : 'je-balance-err'}>
                    {balanced ? '✓ Balanced' : '✗ Not balanced'}
                  </span>
                )}
              </div>
            </div>

            <div className="je-ftr">
              <button type="button" className="je-btn-cancel" onClick={onClose}>Cancel</button>
              <button type="submit" className="je-btn-save" disabled={submitting || !balanced}>
                {submitting ? 'Posting…' : 'Create Entry'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

// ─── Delete confirm ───────────────────────────────────────────────────────────

function DeleteConfirm({ entry, onCancel, onConfirm, busy }: {
  entry: JournalEntry; onCancel: () => void; onConfirm: () => void; busy: boolean;
}) {
  return (
    <div style={{ position:'fixed', inset:0, zIndex:400, background:'rgba(0,0,0,0.65)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ background:'#0e0b1a', border:'0.5px solid rgba(239,68,68,0.25)', borderRadius:14, width:'100%', maxWidth:420, padding:'24px 24px 20px', boxShadow:'0 24px 60px rgba(0,0,0,0.7)' }}>
        <div style={{ fontSize:14, fontWeight:500, color:'#f1ede8', marginBottom:10 }}>Delete journal entry?</div>
        <div style={{ fontSize:13, color:'rgba(255,255,255,0.5)', marginBottom:20, lineHeight:1.5 }}>
          <strong style={{ color:'#f1ede8' }}>{entry.entryNumber}</strong> — {entry.description || 'No description'}.
          Only draft entries can be deleted.
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

export default function JournalEntriesPage() {
  const [entries,    setEntries]    = useState<JournalEntry[]>([]);
  const [accounts,   setAccounts]   = useState<Account[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [search,     setSearch]     = useState('');
  const [statusFilter, setStatusFilter] = useState<EntryStatus | ''>('');
  const [modalOpen,  setModalOpen]  = useState(false);
  const [deleting,   setDeleting]   = useState<JournalEntry | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [jes, accs] = await Promise.all([
        journalEntriesApi.getAll(),
        chartOfAccountsApi.getAll(),
      ]);
      setEntries(jes);
      setAccounts(accs);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load data.';
      setError(message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filtered = entries.filter(e => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      e.entryNumber.toLowerCase().includes(q) ||
      (e.description ?? '').toLowerCase().includes(q) ||
      (e.reference ?? '').toLowerCase().includes(q) ||
      (e.fiscalPeriod ?? '').toLowerCase().includes(q);
    const matchStatus = !statusFilter || e.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handlePost = async (id: string) => {
    setActionBusy(id);
    try {
      await journalEntriesApi.post(id);
      fetchAll();
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
      setError(msg || 'Post failed.');
    } finally { setActionBusy(null); }
  };

  const handleUnpost = async (id: string) => {
    setActionBusy(id);
    try {
      await journalEntriesApi.unpost(id);
      fetchAll();
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
      setError(msg || 'Unpost failed.');
    } finally { setActionBusy(null); }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await journalEntriesApi.remove(deleting.id);
      setDeleting(null);
      fetchAll();
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
      setError(msg || 'Delete failed.');
      setDeleting(null);
    } finally { setDeleteBusy(false); }
  };

  const postedCount = entries.filter(e => e.status === 'posted').length;
  const draftCount  = entries.filter(e => e.status === 'draft').length;

  return (
    <ERPShell breadcrumbs={['Home', 'Financial', 'Journal Entries']} title="Journal Entries">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap');
        .je-page { padding: 0 18px 24px; }
        .je-stats { display:flex; gap:10px; margin-bottom:14px; }
        .je-stat { background:rgba(10,7,18,0.7); border-radius:8px; padding:8px 14px; display:flex; flex-direction:column; gap:2px; min-width:100px; }
        .je-stat-label { font-size:10px; font-weight:500; letter-spacing:0.08em; text-transform:uppercase; }
        .je-stat-value { font-size:22px; font-weight:500; font-family:'IBM Plex Mono',monospace; color:#f1ede8; }
        .je-toolbar { display:flex; align-items:center; gap:10px; margin-bottom:14px; flex-wrap:wrap; }
        .je-search { background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.09); border-radius:7px; padding:7px 12px; font-size:12px; font-family:'IBM Plex Sans',sans-serif; color:#e2dfd8; outline:none; width:260px; transition:border-color 0.2s; }
        .je-search::placeholder { color:rgba(255,255,255,0.2); }
        .je-search:focus { border-color:rgba(251,146,60,0.4); box-shadow:0 0 0 2px rgba(234,88,12,0.08); }
        .je-filter { background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.09); border-radius:7px; padding:7px 12px; font-size:12px; font-family:'IBM Plex Sans',sans-serif; color:#e2dfd8; outline:none; }
        .je-filter option { background:#0e0b1a; color:#f1ede8; }
        .je-btn-new { display:flex; align-items:center; gap:6px; margin-left:auto; background:linear-gradient(135deg,#c2410c,#ea580c,#f97316); border:none; border-radius:7px; padding:7px 14px; font-size:12px; font-weight:500; font-family:'IBM Plex Sans',sans-serif; color:white; cursor:pointer; box-shadow:0 3px 12px rgba(234,88,12,0.3); transition:opacity 0.15s, transform 0.15s; flex-shrink:0; }
        .je-btn-new:hover { opacity:0.88; transform:translateY(-1px); }
        .je-btn-new svg { width:13px; height:13px; display:block; flex-shrink:0; }
        .je-wrap { background:rgba(10,7,18,0.7); border:0.5px solid rgba(251,146,60,0.12); border-radius:10px; overflow:hidden; }
        .je-table { width:100%; border-collapse:collapse; }
        .je-table thead th { padding:9px 14px; font-size:10px; font-weight:500; letter-spacing:0.1em; text-transform:uppercase; color:rgba(251,146,60,0.55); background:rgba(251,146,60,0.05); border-bottom:0.5px solid rgba(255,255,255,0.06); text-align:left; white-space:nowrap; }
        .je-table tbody td { padding:10px 14px; border-bottom:0.5px solid rgba(255,255,255,0.04); vertical-align:middle; font-size:13px; }
        .je-table tbody tr:last-child td { border-bottom:none; }
        .je-table tbody tr:hover td { background:rgba(251,146,60,0.03); }
        .je-empty, .je-loading { text-align:center; padding:52px 24px; color:rgba(255,255,255,0.25); font-size:13px; display:flex; flex-direction:column; align-items:center; gap:10px; }
        .je-spinner { width:18px; height:18px; border-radius:50%; border:2px solid rgba(251,146,60,0.2); border-top-color:#fb923c; animation:je-spin 0.7s linear infinite; flex-shrink:0; }
        @keyframes je-spin { to { transform:rotate(360deg); } }
        .je-footer { font-size:11px; color:rgba(255,255,255,0.22); padding:8px 14px; border-top:0.5px solid rgba(255,255,255,0.04); }
        .je-page-error { background:rgba(239,68,68,0.08); border:0.5px solid rgba(239,68,68,0.2); border-radius:8px; padding:10px 14px; margin-bottom:14px; font-size:13px; color:#fca5a5; }
      `}</style>

      <div className="je-page">

        {/* Stats */}
        {entries.length > 0 && (
          <div className="je-stats">
            <div className="je-stat" style={{ border: '0.5px solid rgba(74,222,128,0.2)' }}>
              <span className="je-stat-label" style={{ color: '#4ade80' }}>Posted</span>
              <span className="je-stat-value">{postedCount}</span>
            </div>
            <div className="je-stat" style={{ border: '0.5px solid rgba(251,191,36,0.2)' }}>
              <span className="je-stat-label" style={{ color: '#fbbf24' }}>Draft</span>
              <span className="je-stat-value">{draftCount}</span>
            </div>
            <div className="je-stat" style={{ border: '0.5px solid rgba(251,146,60,0.2)' }}>
              <span className="je-stat-label" style={{ color: 'rgba(251,146,60,0.6)' }}>Total</span>
              <span className="je-stat-value" style={{ color: '#fb923c' }}>{entries.length}</span>
            </div>
          </div>
        )}

        {/* Toolbar */}
        <div className="je-toolbar">
          <input className="je-search" placeholder="Search by number, description, reference…" value={search} onChange={e => setSearch(e.target.value)} />
          <select className="je-filter" value={statusFilter} onChange={e => setStatusFilter(e.target.value as EntryStatus | '')}>
            <option value="">All Status</option>
            <option value="draft">Draft</option>
            <option value="posted">Posted</option>
          </select>
          <button className="je-btn-new" onClick={() => setModalOpen(true)}>
            <svg viewBox="0 0 13 13" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
              <line x1="6.5" y1="1" x2="6.5" y2="12" /><line x1="1" y1="6.5" x2="12" y2="6.5" />
            </svg>
            New Entry
          </button>
        </div>

        {error && <div className="je-page-error">{error}</div>}

        <div className="je-wrap">
          {loading ? (
            <div className="je-loading"><div className="je-spinner" />Loading journal entries…</div>
          ) : filtered.length === 0 ? (
            <div className="je-empty">{search || statusFilter ? 'No entries match your filters.' : 'No journal entries yet.'}</div>
          ) : (
            <>
              <table className="je-table">
                <thead>
                  <tr>
                    <th>Entry #</th>
                    <th>Date</th>
                    <th>Type</th>
                    <th>Description / Reference</th>
                    <th style={{ textAlign: 'right' }}>Debit</th>
                    <th style={{ textAlign: 'right' }}>Credit</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(entry => (
                    <EntryRow
                      key={entry.id}
                      entry={entry}
                      onPost={handlePost}
                      onUnpost={handleUnpost}
                      onDelete={setDeleting}
                      actionBusy={actionBusy}
                    />
                  ))}
                </tbody>
              </table>
              <div className="je-footer">
                {filtered.length} of {entries.length} entr{entries.length !== 1 ? 'ies' : 'y'}
              </div>
            </>
          )}
        </div>
      </div>

      <CreateModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={fetchAll}
        accounts={accounts}
      />

      {deleting && (
        <DeleteConfirm
          entry={deleting}
          onCancel={() => setDeleting(null)}
          onConfirm={handleDelete}
          busy={deleteBusy}
        />
      )}
    </ERPShell>
  );
}