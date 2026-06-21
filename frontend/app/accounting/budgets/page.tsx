"use client";

import { useEffect, useState, useCallback, useMemo } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import SearchSelect from '@/components/ui/SearchSelect';
import { ERPTreeTable, ERPTreeColumn } from '@/components/ui/ERPTreeTable';
import { ERPFilterBar, ERPFilter, useERPFilters, applyERPFilters } from '@/components/ui/ERPFilterBar';
import { FormModal } from '@/components/ui/modal/FormModal';
import { budgetsApi } from '@/lib/api/budgets';
import { ConfirmModal, useModal } from '@/components/ui/modal';
import { chartOfAccountsApi } from '@/lib/api/chart-of-accounts';
import { Account, BudgetStatus } from '@/lib/api/types';

interface BudgetLine {
  id: string; accountId: string; fiscalPeriod: string;
  budgetAmount: string; notes?: string;
  account?: { accountNumber: string; name: string; accountType: string };
}
interface Budget {
  id: string; budgetCode: string; budgetName: string; fiscalYear: string;
  description?: string; status: BudgetStatus; approvedAt?: string;
  budgetLines: BudgetLine[]; createdAt: string; updatedAt: string;
}
interface VsActualLine {
  accountNumber: string; accountName: string; accountType: string;
  fiscalPeriod: string; budgetAmount: number; actualAmount: number;
  variance: number; variancePercent: number;
}
interface VsActualReport { budgetCode: string; budgetName: string; fiscalYear: string; lines: VsActualLine[] }

function extractList(data: unknown): Budget[] {
  if (Array.isArray(data)) return data as Budget[];
  const d = data as Record<string, unknown>;
  if (d?.value && Array.isArray(d.value)) return d.value as Budget[];
  return [];
}
function fmtAmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}
function fmtPct(n: number) { return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`; }

const MONO: React.CSSProperties = { fontFamily: "'IBM Plex Mono',monospace", fontSize: 12 };
const INPUT: React.CSSProperties = { background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '9px 12px', fontSize: 13, fontFamily: "'IBM Plex Sans',sans-serif", color: 'var(--text-strong, #f1ede8)', outline: 'none', width: '100%' };
const LABEL: React.CSSProperties = { fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(251,146,60,0.6)', fontFamily: "'IBM Plex Sans',sans-serif" };

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}><label style={LABEL}>{label}</label>{children}</div>;
}

function StatusBadge({ status }: { status: BudgetStatus }) {
  const approved = status === 'approved';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 500, color: approved ? 'var(--success, #4ade80)' : 'var(--warning, #fbbf24)', background: approved ? 'rgba(74,222,128,0.1)' : 'rgba(251,191,36,0.1)', border: `0.5px solid ${approved ? 'rgba(74,222,128,0.2)' : 'rgba(251,191,36,0.2)'}` }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: approved ? 'var(--success, #4ade80)' : 'var(--warning, #fbbf24)', flexShrink: 0 }} />
      {approved ? 'Approved' : 'Draft'}
    </span>
  );
}

function MrpModal({ budget, onClose, onSaved }: { budget: Budget; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    soStatuses:             ['confirmed', 'shipped', 'delivered'],
    overwrite:              false,
    defaultMaterialAccount: '5.1.02',
    defaultLaborAccount:    '5.1.03',
    defaultRevenueAccount:  '4.1.01',
  });
  const [busy,    setBusy]    = useState(false);
  const [error,   setError]   = useState('');
  const [result,  setResult]  = useState<any>(null);

  const toggleStatus = (s: string) => setForm(f => ({
    ...f,
    soStatuses: f.soStatuses.includes(s)
      ? f.soStatuses.filter(x => x !== s)
      : [...f.soStatuses, s],
  }));

  const handleRun = async () => {
    if (form.soStatuses.length === 0) { setError('Select at least one SO status'); return; }
    setBusy(true); setError('');
    try {
      const res = await budgetsApi.generateFromSo(budget.id, form);
      setResult(res);
      onSaved();
    } catch (err) {
      setError((err as any).response?.data?.message || 'MRP generation failed');
    } finally { setBusy(false); }
  };

  const SO_STATUSES = ['draft', 'confirmed', 'shipped', 'delivered'];

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: 'var(--surface, #0e0b1a)', border: '0.5px solid rgba(167,139,250,0.2)', borderRadius: 14, width: '100%', maxWidth: 520, boxShadow: '0 24px 60px rgba(0,0,0,0.7)' }}>
        <div style={{ padding: '14px 18px 10px', borderBottom: '0.5px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-strong, #f1ede8)' }}>Generate from Sales Orders</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{budget.budgetCode} — MRP auto-generation</div>
          </div>
          <button onClick={onClose} style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.45)', fontSize: 16 }}>×</button>
        </div>

        <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '0.5px solid rgba(239,68,68,0.25)', borderRadius: 7, padding: '7px 12px', fontSize: 12, color: 'var(--danger-subtle, #fca5a5)' }}>{error}</div>}

          {result && (
            <div style={{ background: 'rgba(74,222,128,0.06)', border: '0.5px solid rgba(74,222,128,0.2)', borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ fontSize: 12, fontWeight: 500, color: 'var(--success, #4ade80)', marginBottom: 8 }}>{result.message}</div>
              <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                {[
                  { label: 'SOs Processed',  value: result.salesOrdersProcessed },
                  { label: 'Lines Generated', value: result.linesGenerated },
                  { label: 'Lines Skipped',   value: result.linesSkipped },
                ].map(s => (
                  <div key={s.label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{s.label}</span>
                    <span style={{ ...MONO, color: 'var(--success, #4ade80)', fontSize: 14 }}>{s.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <Field label="Include Sales Orders with status">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {SO_STATUSES.map(s => {
                const active = form.soStatuses.includes(s);
                return (
                  <button key={s} onClick={() => toggleStatus(s)}
                    style={{ padding: '5px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif", fontWeight: 500, color: active ? 'var(--accent-violet, #a78bfa)' : 'rgba(255,255,255,0.35)', background: active ? 'rgba(167,139,250,0.15)' : 'rgba(255,255,255,0.04)', border: `0.5px solid ${active ? 'rgba(167,139,250,0.3)' : 'rgba(255,255,255,0.08)'}`, transition: 'all 0.15s' }}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                );
              })}
            </div>
          </Field>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
            <Field label="Revenue Account">
              <input style={{ ...INPUT, fontSize: 12 }} value={form.defaultRevenueAccount} onChange={e => setForm(f => ({ ...f, defaultRevenueAccount: e.target.value }))} placeholder="4.1.01" />
            </Field>
            <Field label="Material Account">
              <input style={{ ...INPUT, fontSize: 12 }} value={form.defaultMaterialAccount} onChange={e => setForm(f => ({ ...f, defaultMaterialAccount: e.target.value }))} placeholder="5.1.02" />
            </Field>
            <Field label="Labor Account">
              <input style={{ ...INPUT, fontSize: 12 }} value={form.defaultLaborAccount} onChange={e => setForm(f => ({ ...f, defaultLaborAccount: e.target.value }))} placeholder="5.1.03" />
            </Field>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => setForm(f => ({ ...f, overwrite: !f.overwrite }))}
              style={{ padding: '5px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif", color: form.overwrite ? 'var(--warning, #fbbf24)' : 'rgba(255,255,255,0.35)', background: form.overwrite ? 'rgba(251,191,36,0.1)' : 'rgba(255,255,255,0.04)', border: `0.5px solid ${form.overwrite ? 'rgba(251,191,36,0.2)' : 'rgba(255,255,255,0.08)'}` }}>
              {form.overwrite ? 'Overwrite existing lines' : 'Skip existing lines'}
            </button>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>
              {form.overwrite ? 'Replaces existing budget lines for same account+period' : 'Keeps existing lines, only adds new ones'}
            </span>
          </div>

          <div style={{ background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.06)', borderRadius: 7, padding: '8px 12px', fontSize: 11, color: 'rgba(255,255,255,0.35)', lineHeight: 1.6 }}>
            <strong style={{ color: 'rgba(255,255,255,0.5)' }}>How it works:</strong> Revenue is budgeted in the delivery period (promisedDate). Materials and labor are budgeted in the production start period (promisedDate minus item leadTime). Quantities use BOM components x scrap% and routing steps x work center rates.
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '10px 18px 16px', borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '7px 14px', fontSize: 12, fontFamily: "'IBM Plex Sans',sans-serif", color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>
            {result ? 'Close' : 'Cancel'}
          </button>
          {!result && (
            <button onClick={handleRun} disabled={busy || form.soStatuses.length === 0}
              style={{ background: 'linear-gradient(135deg,#4c1d95,#6d28d9,#7c3aed)', border: 'none', borderRadius: 7, padding: '7px 18px', fontSize: 12, fontWeight: 500, fontFamily: "'IBM Plex Sans',sans-serif", color: 'white', cursor: 'pointer', opacity: busy || form.soStatuses.length === 0 ? 0.5 : 1 }}>
              {busy ? 'Generating...' : 'Run MRP'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function CreateBudgetModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ budgetCode: '', budgetName: '', fiscalYear: '', description: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) { setError(null); setForm({ budgetCode: '', budgetName: '', fiscalYear: new Date().getFullYear().toString(), description: '' }); }
  }, [open]);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [key]: e.target.value }));
  const valid = !!form.budgetCode.trim() && !!form.budgetName.trim() && !!form.fiscalYear.trim();

  const submit = async () => {
    if (!valid) { setError('Code, name and fiscal year are required.'); return; }
    setSubmitting(true); setError(null);
    try { await budgetsApi.create(form); onSaved(); onClose(); }
    catch (err) { setError((err as any).response?.data?.message || 'Operation failed.'); }
    finally { setSubmitting(false); }
  };

  return (
    <FormModal open={open} onClose={onClose} title="New Budget" submitLabel="Create Budget" submitting={submitting} isValid={valid} error={error} onSubmit={submit} width={460}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[
          { key: 'budgetCode',  label: 'Budget Code *',  placeholder: 'BUDGET-2026' },
          { key: 'budgetName',  label: 'Budget Name *',  placeholder: '2026 Annual Budget' },
          { key: 'fiscalYear',  label: 'Fiscal Year *',  placeholder: '2026' },
          { key: 'description', label: 'Description',     placeholder: 'Annual operating budget' },
        ].map(f => (
          <Field key={f.key} label={f.label}>
            <input placeholder={f.placeholder} value={form[f.key as keyof typeof form]} onChange={set(f.key as keyof typeof form)} style={INPUT} />
          </Field>
        ))}
      </div>
    </FormModal>
  );
}

function AddLineModal({ open, onClose, onSaved, budgetId, accounts }: { open: boolean; onClose: () => void; onSaved: () => void; budgetId: string; accounts: Account[] }) {
  const [form, setForm] = useState({ accountId: '', fiscalPeriod: '', budgetAmount: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (open) { setError(null); setForm({ accountId: '', fiscalPeriod: '', budgetAmount: '', notes: '' }); } }, [open]);

  const valid = !!form.accountId && !!form.fiscalPeriod.trim() && !!form.budgetAmount.trim();
  const submit = async () => {
    if (!valid) { setError('Account, period and amount are required.'); return; }
    setSubmitting(true); setError(null);
    try {
      await budgetsApi.addLine(budgetId, { accountId: form.accountId, fiscalPeriod: form.fiscalPeriod, budgetAmount: Number(form.budgetAmount), notes: form.notes || undefined });
      onSaved(); onClose();
    } catch (err) { setError((err as any).response?.data?.message || 'Operation failed.'); }
    finally { setSubmitting(false); }
  };

  return (
    <FormModal open={open} onClose={onClose} title="Add Budget Line" submitLabel="Add Line" submitting={submitting} isValid={valid} error={error} onSubmit={submit} width={460}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Account *">
          <SearchSelect options={accounts.map(a => ({ value: a.id, label: `${a.accountNumber} — ${a.name}` }))} value={form.accountId} onChange={v => setForm(f => ({ ...f, accountId: v }))} placeholder="Select account…" clearLabel="— Select account —" minWidth={320} />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Fiscal Period *"><input placeholder="2026-03" value={form.fiscalPeriod} onChange={e => setForm(f => ({ ...f, fiscalPeriod: e.target.value }))} style={INPUT} /></Field>
          <Field label="Budget Amount *"><input type="number" min="0" placeholder="50000" value={form.budgetAmount} onChange={e => setForm(f => ({ ...f, budgetAmount: e.target.value }))} style={INPUT} /></Field>
        </div>
        <Field label="Notes"><input placeholder="Optional notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={INPUT} /></Field>
      </div>
    </FormModal>
  );
}

function RollForwardModal({ open, source, onClose, onSaved }: { open: boolean; source: Budget; onClose: () => void; onSaved: () => void }) {
  const nextYear = (() => { const n = Number(source.fiscalYear); return Number.isFinite(n) ? String(n + 1) : ''; })();
  const [form, setForm] = useState({ targetFiscalYear: '', targetBudgetCode: '', targetBudgetName: '', growthPercent: '0', includeNotes: true });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setError(null); setResult(null);
      // Prefill: bump the year; derive a code by swapping the source year, else BUDGET-<year>.
      const code = source.budgetCode.includes(source.fiscalYear) && nextYear
        ? source.budgetCode.replace(source.fiscalYear, nextYear)
        : (nextYear ? `BUDGET-${nextYear}` : '');
      setForm({ targetFiscalYear: nextYear, targetBudgetCode: code, targetBudgetName: '', growthPercent: '0', includeNotes: true });
    }
  }, [open, source, nextYear]);

  const valid = !!form.targetFiscalYear.trim() && !!form.targetBudgetCode.trim();
  const submit = async () => {
    if (!valid) { setError('Target fiscal year and budget code are required.'); return; }
    setSubmitting(true); setError(null);
    try {
      const res = await budgetsApi.rollForward(source.id, {
        targetFiscalYear: form.targetFiscalYear.trim(),
        targetBudgetCode: form.targetBudgetCode.trim(),
        targetBudgetName: form.targetBudgetName.trim() || undefined,
        growthPercent: Number(form.growthPercent) || 0,
        includeNotes: form.includeNotes,
      });
      setResult(res.message);
      onSaved();
    } catch (err) {
      setError((err as any).response?.data?.message || 'Roll-forward failed.');
    } finally { setSubmitting(false); }
  };

  return (
    <FormModal open={open} onClose={onClose} title={`Roll forward — ${source.budgetCode}`}
      submitLabel={result ? 'Done' : 'Roll Forward'} submitting={submitting} isValid={valid && !result}
      error={error} onSubmit={result ? onClose : submit} width={460}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {result
          ? <div style={{ background: 'rgba(74,222,128,0.06)', border: '0.5px solid rgba(74,222,128,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: 'var(--success, #4ade80)' }}>{result}</div>
          : (
            <>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', lineHeight: 1.5 }}>
                Creates a new <strong style={{ color: 'rgba(255,255,255,0.5)' }}>draft</strong> budget by copying {source.budgetLines.length} line{source.budgetLines.length !== 1 ? 's' : ''}, remapping each period to the target year and scaling amounts by the growth %.
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <Field label="Target Fiscal Year *"><input placeholder="2027" value={form.targetFiscalYear} onChange={e => setForm(f => ({ ...f, targetFiscalYear: e.target.value }))} style={INPUT} /></Field>
                <Field label="Growth %"><input type="number" step="0.1" placeholder="0" value={form.growthPercent} onChange={e => setForm(f => ({ ...f, growthPercent: e.target.value }))} style={INPUT} /></Field>
              </div>
              <Field label="New Budget Code *"><input placeholder="BUDGET-2027" value={form.targetBudgetCode} onChange={e => setForm(f => ({ ...f, targetBudgetCode: e.target.value }))} style={INPUT} /></Field>
              <Field label="New Budget Name"><input placeholder={`${source.budgetName} (FY${form.targetFiscalYear || '…'})`} value={form.targetBudgetName} onChange={e => setForm(f => ({ ...f, targetBudgetName: e.target.value }))} style={INPUT} /></Field>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: form.includeNotes ? 'var(--text-primary, #e2dfd8)' : 'rgba(255,255,255,0.4)', userSelect: 'none' }}>
                <div onClick={() => setForm(f => ({ ...f, includeNotes: !f.includeNotes }))} style={{ width: 32, height: 18, borderRadius: 9, flexShrink: 0, cursor: 'pointer', background: form.includeNotes ? 'rgba(234,88,12,0.8)' : 'rgba(255,255,255,0.1)', border: `0.5px solid ${form.includeNotes ? 'rgba(251,146,60,0.5)' : 'rgba(255,255,255,0.15)'}`, position: 'relative' }}>
                  <div style={{ position: 'absolute', top: 2, left: form.includeNotes ? 16 : 2, width: 13, height: 13, borderRadius: '50%', background: 'var(--white, #fff)', transition: 'left 0.2s' }} />
                </div>
                Copy line notes
              </label>
            </>
          )}
      </div>
    </FormModal>
  );
}

function BudgetDetail({ budget, accounts, onRefresh }: { budget: Budget; accounts: Account[]; onRefresh: () => void }) {
  const [view,        setView]        = useState<'lines' | 'vsactual'>('lines');
  const [vsActual,    setVsActual]    = useState<VsActualReport | null>(null);
  const [loadingVA,   setLoadingVA]   = useState(false);
  const [addLineOpen, setAddLineOpen] = useState(false);
  const [mrpOpen,     setMrpOpen]     = useState(false);
  const [rollOpen,    setRollOpen]    = useState(false);
  const [approving,   setApproving]   = useState(false);
  const [error,       setError]       = useState('');
  // spec-frontend-002/003 — approve is irreversible; guard with ConfirmModal.
  const approveModal = useModal();

  const loadVsActual = async () => {
    setLoadingVA(true);
    try { const data = await budgetsApi.getVsActual(budget.id); setVsActual(data); setView('vsactual'); }
    catch (err) { setError((err as any).response?.data?.message || 'Failed to load vs actual.'); }
    finally { setLoadingVA(false); }
  };

  const handleApprove = async () => {
    setApproving(true); setError('');
    try { await budgetsApi.approve(budget.id); onRefresh(); }
    catch (err) {
      setError((err as any).response?.data?.message || 'Approval failed.');
      throw err; // surface inline in ConfirmModal, keep it open
    }
    finally { setApproving(false); }
  };

  const totalBudget = budget.budgetLines.reduce((s, l) => s + Number(l.budgetAmount), 0);

  return (
    <div>
      {error && <div style={{ background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '8px 14px', marginBottom: 10, fontSize: 12, color: 'var(--danger-subtle, #fca5a5)' }}>{error}</div>}

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: 0, background: 'rgba(255,255,255,0.04)', borderRadius: 7, border: '0.5px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
          {(['lines', 'vsactual'] as const).map(v => (
            <button key={v} onClick={() => v === 'vsactual' ? loadVsActual() : setView('lines')}
              style={{ padding: '5px 12px', fontSize: 11, fontFamily: "'IBM Plex Sans',sans-serif", cursor: 'pointer', border: 'none', background: view === v ? 'rgba(251,146,60,0.15)' : 'transparent', color: view === v ? 'var(--accent-strong, #fb923c)' : 'rgba(255,255,255,0.45)', transition: 'background 0.15s, color 0.15s' }}>
              {v === 'lines' ? 'Budget Lines' : loadingVA ? 'Loading...' : 'vs Actual'}
            </button>
          ))}
        </div>

        {budget.status === 'draft' && (
          <>
            <button onClick={() => setMrpOpen(true)}
              style={{ padding: '5px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(167,139,250,0.1)', color: 'var(--accent-violet, #a78bfa)', border: '0.5px solid rgba(167,139,250,0.2)', fontFamily: "'IBM Plex Sans',sans-serif", fontWeight: 500 }}>
              Generate from SO
            </button>
            <button onClick={() => setAddLineOpen(true)}
              style={{ padding: '5px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(96,165,250,0.1)', color: 'var(--accent-blue, #60a5fa)', border: '0.5px solid rgba(96,165,250,0.2)', fontFamily: "'IBM Plex Sans',sans-serif" }}>
              + Add Line
            </button>
            <button onClick={approveModal.openModal} disabled={approving || budget.budgetLines.length === 0}
              style={{ padding: '5px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(74,222,128,0.1)', color: 'var(--success, #4ade80)', border: '0.5px solid rgba(74,222,128,0.2)', fontFamily: "'IBM Plex Sans',sans-serif", opacity: (approving || budget.budgetLines.length === 0) ? 0.5 : 1 }}>
              {approving ? 'Approving...' : 'Approve'}
            </button>
          </>
        )}

        {/* Roll-forward — available for any budget with lines (primary use: from an approved one) */}
        {budget.budgetLines.length > 0 && (
          <button onClick={() => setRollOpen(true)}
            style={{ padding: '5px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(251,146,60,0.1)', color: 'var(--accent-strong, #fb923c)', border: '0.5px solid rgba(251,146,60,0.2)', fontFamily: "'IBM Plex Sans',sans-serif", fontWeight: 500 }}>
            Roll Forward
          </button>
        )}

        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: "'IBM Plex Mono',monospace" }}>
          Total: {fmtAmt(totalBudget)}
        </span>
      </div>

      {view === 'lines' && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>{['Account', 'Period', 'Budget Amount', 'Notes'].map(h => (
              <th key={h} style={{ padding: '7px 12px', fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(251,146,60,0.5)', background: 'rgba(251,146,60,0.04)', borderBottom: '0.5px solid rgba(255,255,255,0.06)', textAlign: h === 'Budget Amount' ? 'right' : 'left' }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {budget.budgetLines.length === 0 ? (
              <tr><td colSpan={4} style={{ padding: '24px 12px', textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>No lines yet. Click Generate from SO or + Add Line.</td></tr>
            ) : budget.budgetLines.map(line => (
              <tr key={line.id}>
                <td style={{ padding: '8px 12px', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ ...MONO, color: 'var(--accent-strong, #fb923c)' }}>{line.account?.accountNumber}</span>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginLeft: 8 }}>{line.account?.name}</span>
                </td>
                <td style={{ padding: '8px 12px', borderBottom: '0.5px solid rgba(255,255,255,0.04)', ...MONO, color: 'rgba(255,255,255,0.55)' }}>{line.fiscalPeriod}</td>
                <td style={{ padding: '8px 12px', borderBottom: '0.5px solid rgba(255,255,255,0.04)', textAlign: 'right', ...MONO, color: 'var(--text-primary, #e2dfd8)' }}>{fmtAmt(Number(line.budgetAmount))}</td>
                <td style={{ padding: '8px 12px', borderBottom: '0.5px solid rgba(255,255,255,0.04)', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{line.notes || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {view === 'vsactual' && vsActual && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr>{['Account', 'Period', 'Budget', 'Actual', 'Variance', '%'].map(h => (
              <th key={h} style={{ padding: '7px 12px', fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(251,146,60,0.5)', background: 'rgba(251,146,60,0.04)', borderBottom: '0.5px solid rgba(255,255,255,0.06)', textAlign: ['Budget', 'Actual', 'Variance', '%'].includes(h) ? 'right' : 'left' }}>{h}</th>
            ))}</tr>
          </thead>
          <tbody>
            {vsActual.lines.map((line, idx) => {
              const favorable = line.variance >= 0;
              return (
                <tr key={idx}>
                  <td style={{ padding: '8px 12px', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ ...MONO, color: 'var(--accent-strong, #fb923c)' }}>{line.accountNumber}</span>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginLeft: 8 }}>{line.accountName}</span>
                  </td>
                  <td style={{ padding: '8px 12px', borderBottom: '0.5px solid rgba(255,255,255,0.04)', ...MONO, color: 'rgba(255,255,255,0.55)' }}>{line.fiscalPeriod}</td>
                  <td style={{ padding: '8px 12px', borderBottom: '0.5px solid rgba(255,255,255,0.04)', textAlign: 'right', ...MONO, color: 'var(--text-primary, #e2dfd8)' }}>{fmtAmt(line.budgetAmount)}</td>
                  <td style={{ padding: '8px 12px', borderBottom: '0.5px solid rgba(255,255,255,0.04)', textAlign: 'right', ...MONO, color: 'rgba(255,255,255,0.6)' }}>{fmtAmt(line.actualAmount)}</td>
                  <td style={{ padding: '8px 12px', borderBottom: '0.5px solid rgba(255,255,255,0.04)', textAlign: 'right', ...MONO, color: favorable ? 'var(--success, #4ade80)' : 'var(--danger, #f87171)', fontWeight: 500 }}>{fmtAmt(line.variance)}</td>
                  <td style={{ padding: '8px 12px', borderBottom: '0.5px solid rgba(255,255,255,0.04)', textAlign: 'right', fontSize: 11, color: favorable ? 'var(--success, #4ade80)' : 'var(--danger, #f87171)' }}>{fmtPct(line.variancePercent)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {mrpOpen && <MrpModal budget={budget} onClose={() => setMrpOpen(false)} onSaved={onRefresh} />}
      <AddLineModal open={addLineOpen} onClose={() => setAddLineOpen(false)} onSaved={onRefresh} budgetId={budget.id} accounts={accounts} />
      <RollForwardModal open={rollOpen} source={budget} onClose={() => setRollOpen(false)} onSaved={onRefresh} />

      <ConfirmModal
        open={approveModal.open}
        onClose={approveModal.closeModal}
        title={`Approve budget ${budget.budgetCode}?`}
        description="Once approved, the budget is locked and its lines can no longer be edited. This cannot be undone."
        confirmLabel="Approve Budget"
        onConfirm={handleApprove}
      />
    </div>
  );
}

export default function BudgetsPage() {
  const [budgets,      setBudgets]      = useState<Budget[]>([]);
  const [accounts,     setAccounts]     = useState<Account[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [createOpen,   setCreateOpen]   = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [raw, accs] = await Promise.all([budgetsApi.getAll(), chartOfAccountsApi.getAll()]);
      setBudgets(extractList(raw as unknown));
      setAccounts(accs);
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to load data.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const years = useMemo(() => [...new Set(budgets.map(b => b.fiscalYear))].sort((a, b) => b.localeCompare(a)), [budgets]);

  const filterDefs = useMemo<ERPFilter<Budget>[]>(() => [
    { key: 'fiscalYear', label: 'Year', type: 'searchselect', placeholder: 'All years', options: years.map(y => ({ value: y, label: y })) },
    { key: 'status', label: 'Status', type: 'multiselect', options: [{ value: 'draft', label: 'Draft', color: 'var(--warning, #fbbf24)' }, { value: 'approved', label: 'Approved', color: 'var(--success, #4ade80)' }] },
  ], [years]);
  const { values: filterVals, setValue: setFilterVal, reset: resetFilters, activeCount: filterCount } = useERPFilters(filterDefs);
  const filtered = useMemo(() => applyERPFilters(budgets, filterDefs, filterVals), [budgets, filterDefs, filterVals]);

  const columns = useMemo<ERPTreeColumn<Budget>[]>(() => [
    { key: 'budgetCode', header: 'Code', width: 150, sortable: true, value: r => r.budgetCode, render: r => <span style={{ ...MONO, color: 'var(--accent-strong, #fb923c)', fontWeight: 500 }}>{r.budgetCode}</span> },
    { key: 'budgetName', header: 'Name', sortable: true, value: r => r.budgetName, render: r => <span style={{ color: 'var(--text-primary, #e2dfd8)', fontWeight: 500 }}>{r.budgetName}</span> },
    { key: 'fiscalYear', header: 'FY', width: 80, sortable: true, value: r => r.fiscalYear, render: r => <span style={{ color: 'rgba(255,255,255,0.45)', fontSize: 12 }}>{r.fiscalYear}</span> },
    { key: 'lines', header: 'Lines', width: 70, align: 'center', sortable: true, value: r => r.budgetLines.length, render: r => <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>{r.budgetLines.length}</span> },
    { key: 'total', header: 'Total', width: 140, align: 'right', sortable: true, value: r => r.budgetLines.reduce((s, l) => s + Number(l.budgetAmount), 0), render: r => <span style={{ ...MONO, color: 'rgba(255,255,255,0.6)' }}>{fmtAmt(r.budgetLines.reduce((s, l) => s + Number(l.budgetAmount), 0))}</span> },
    { key: 'status', header: 'Status', width: 110, sortable: true, value: r => r.status, render: r => <StatusBadge status={r.status} /> },
  ], []);

  return (
    <ERPShell breadcrumbs={['Home', 'Financial', 'Budgets']} title="Budgets">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap');
        .bg-page { padding: 0 18px 12px; display:flex; flex-direction:column; height:100%; overflow:hidden; }
        .bg-toolbar { display:flex; align-items:center; gap:10px; margin-bottom:14px; flex-wrap:nowrap; }
        .bg-filter { background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.09); border-radius:7px; padding:7px 12px; font-size:12px; font-family:'IBM Plex Sans',sans-serif; color:var(--text-primary, #e2dfd8); outline:none; }
        .bg-filter option { background:var(--surface, #0e0b1a); color:var(--text-strong, #f1ede8); }
        .bg-btn-new { display:flex; align-items:center; gap:6px; margin-left:auto; background:linear-gradient(135deg,var(--accent-pressed, #c2410c),var(--accent, #ea580c),var(--accent-mid, #f97316)); border:none; border-radius:7px; padding:7px 14px; font-size:12px; font-weight:500; font-family:'IBM Plex Sans',sans-serif; color:white; cursor:pointer; box-shadow:0 3px 12px rgba(234,88,12,0.3); flex-shrink:0; white-space:nowrap; }
        .bg-list { display:flex; flex-direction:column; gap:10px; }
        .bg-card { background:rgba(10,7,18,0.7); border:0.5px solid rgba(251,146,60,0.12); border-radius:10px; overflow:hidden; }
        .bg-card-hdr { display:flex; align-items:center; gap:12px; padding:14px 16px; cursor:pointer; transition:background 0.15s; }
        .bg-card-hdr:hover { background:rgba(251,146,60,0.03); }
        .bg-card-body { padding:0 16px 14px; border-top:0.5px solid rgba(255,255,255,0.06); }
        .bg-empty, .bg-loading { text-align:center; padding:52px 24px; color:rgba(255,255,255,0.25); font-size:13px; display:flex; flex-direction:column; align-items:center; gap:10px; }
        .bg-spinner { width:18px; height:18px; border-radius:50%; border:2px solid rgba(251,146,60,0.2); border-top-color:var(--accent-strong, #fb923c); animation:bg-spin 0.7s linear infinite; }
        @keyframes bg-spin { to { transform:rotate(360deg); } }
        .bg-error { background:rgba(239,68,68,0.08); border:0.5px solid rgba(239,68,68,0.2); border-radius:8px; padding:10px 14px; margin-bottom:14px; font-size:13px; color:var(--danger-subtle, #fca5a5); }
      `}</style>

      <div className="bg-page">
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 10, flexShrink: 0, flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}>
            <ERPFilterBar filters={filterDefs} values={filterVals} onChange={setFilterVal} onReset={resetFilters} activeCount={filterCount} />
          </div>
          <button className="bg-btn-new" onClick={() => setCreateOpen(true)}>
            <svg viewBox="0 0 13 13" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><line x1="6.5" y1="1" x2="6.5" y2="12" /><line x1="1" y1="6.5" x2="12" y2="6.5" /></svg>
            New Budget
          </button>
        </div>

        {error && <div className="bg-error">{error}</div>}

        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <ERPTreeTable<Budget>
            columns={columns}
            data={filtered}
            rowKey={r => r.id}
            loading={loading}
            exportFilename="budgets"
            emptyMessage={filterCount ? 'No budgets match your filters.' : 'No budgets yet.'}
            defaultPageSize={25}
            canExpand={() => true}
            expandedRow={budget => (
              <div style={{ padding: '12px 16px' }}>
                {budget.description && <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 12, lineHeight: 1.5 }}>{budget.description}</p>}
                <BudgetDetail budget={budget} accounts={accounts} onRefresh={fetchAll} />
              </div>
            )}
          />
        </div>
      </div>

      <CreateBudgetModal open={createOpen} onClose={() => setCreateOpen(false)} onSaved={fetchAll} />
    </ERPShell>
  );
}