"use client";

import { useEffect, useState, useCallback } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import { budgetsApi } from '@/lib/api/budgets';
import { chartOfAccountsApi } from '@/lib/api/chart-of-accounts';
import { Account, BudgetStatus } from '@/lib/api/types';

// ─── Real backend types ───────────────────────────────────────────────────────

interface BudgetLine {
  id: string;
  accountId: string;
  fiscalPeriod: string;
  budgetAmount: string; // comes as string from backend
  notes?: string;
  account?: { accountNumber: string; name: string; accountType: string };
}

interface Budget {
  id: string;
  budgetCode: string;
  budgetName: string;
  fiscalYear: string;
  description?: string;
  status: BudgetStatus;
  approvedAt?: string;
  approvedBy?: string;
  budgetLines: BudgetLine[]; // real field name
  createdAt: string;
  updatedAt: string;
}

interface VsActualLine {
  accountNumber: string;
  accountName: string;
  accountType: string;
  fiscalPeriod: string;
  budgetAmount: number;
  actualAmount: number;
  variance: number;
  variancePercent: number;
}

interface VsActualReport {
  budgetCode: string;
  budgetName: string;
  fiscalYear: string;
  lines: VsActualLine[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractList(data: unknown): Budget[] {
  if (Array.isArray(data)) return data as Budget[];
  const d = data as Record<string, unknown>;
  if (d?.value && Array.isArray(d.value)) return d.value as Budget[];
  return [];
}

function fmtAmt(n: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

function fmtPct(n: number) {
  return `${n >= 0 ? '+' : ''}${n.toFixed(1)}%`;
}

// ─── Badges ───────────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: BudgetStatus }) {
  const approved = status === 'approved';
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 500,
      color: approved ? '#4ade80' : '#fbbf24',
      background: approved ? 'rgba(74,222,128,0.1)' : 'rgba(251,191,36,0.1)',
      border: `0.5px solid ${approved ? 'rgba(74,222,128,0.2)' : 'rgba(251,191,36,0.2)'}`,
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: approved ? '#4ade80' : '#fbbf24', flexShrink: 0 }} />
      {approved ? 'Approved' : 'Draft'}
    </span>
  );
}

// ─── Create Budget Modal ──────────────────────────────────────────────────────

function CreateBudgetModal({ open, onClose, onSaved }: {
  open: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({ budgetCode: '', budgetName: '', fiscalYear: '', description: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) { setError(''); setForm({ budgetCode: '', budgetName: '', fiscalYear: new Date().getFullYear().toString(), description: '' }); }
  }, [open]);

  const set = (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.budgetCode.trim() || !form.budgetName.trim() || !form.fiscalYear.trim()) {
      setError('Code, name and fiscal year are required.'); return;
    }
    setSubmitting(true); setError('');
    try {
      await budgetsApi.create(form);
      onSaved(); onClose();
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
      setError(msg || 'Operation failed.');
    } finally { setSubmitting(false); }
  };

  if (!open) return null;

  return (
    <div style={{ position:'fixed', inset:0, zIndex:400, background:'rgba(0,0,0,0.65)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ background:'#0e0b1a', border:'0.5px solid rgba(251,146,60,0.2)', borderRadius:14, width:'100%', maxWidth:460, position:'relative', boxShadow:'0 24px 60px rgba(0,0,0,0.7)' }}>
        <div style={{ position:'absolute', top:0, left:30, right:30, height:1, background:'linear-gradient(90deg,transparent,rgba(251,146,60,0.4),transparent)' }} />
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px 12px', borderBottom:'0.5px solid rgba(255,255,255,0.06)' }}>
          <span style={{ fontSize:14, fontWeight:500, color:'#f1ede8', fontFamily:"'IBM Plex Sans',sans-serif" }}>New Budget</span>
          <button onClick={onClose} style={{ width:24, height:24, borderRadius:6, background:'rgba(255,255,255,0.06)', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.45)', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ padding:'16px 20px', display:'flex', flexDirection:'column', gap:12 }}>
            {error && <div style={{ background:'rgba(239,68,68,0.1)', border:'0.5px solid rgba(239,68,68,0.25)', borderRadius:7, padding:'8px 12px', fontSize:12, color:'#fca5a5' }}>{error}</div>}
            {[
              { key: 'budgetCode', label: 'Budget Code *', placeholder: 'BUDGET-2026' },
              { key: 'budgetName', label: 'Budget Name *', placeholder: '2026 Annual Budget' },
              { key: 'fiscalYear', label: 'Fiscal Year *', placeholder: '2026' },
              { key: 'description', label: 'Description', placeholder: 'Annual operating budget…' },
            ].map(f => (
              <div key={f.key} style={{ display:'flex', flexDirection:'column', gap:5 }}>
                <label style={{ fontSize:11, fontWeight:500, letterSpacing:'0.08em', textTransform:'uppercase', color:'rgba(251,146,60,0.6)', fontFamily:"'IBM Plex Sans',sans-serif" }}>{f.label}</label>
                <input
                  placeholder={f.placeholder}
                  value={form[f.key as keyof typeof form]}
                  onChange={set(f.key as keyof typeof form)}
                  style={{ background:'rgba(255,255,255,0.04)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:7, padding:'9px 12px', fontSize:13, fontFamily:"'IBM Plex Sans',sans-serif", color:'#f1ede8', outline:'none', width:'100%' }}
                />
              </div>
            ))}
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8, padding:'12px 20px 18px', borderTop:'0.5px solid rgba(255,255,255,0.06)' }}>
            <button type="button" onClick={onClose} style={{ background:'rgba(255,255,255,0.05)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:7, padding:'8px 16px', fontSize:13, fontFamily:"'IBM Plex Sans',sans-serif", color:'rgba(255,255,255,0.5)', cursor:'pointer' }}>Cancel</button>
            <button type="submit" disabled={submitting} style={{ background:'linear-gradient(135deg,#c2410c,#ea580c,#f97316)', border:'none', borderRadius:7, padding:'8px 20px', fontSize:13, fontWeight:500, fontFamily:"'IBM Plex Sans',sans-serif", color:'white', cursor:'pointer', opacity:submitting?0.5:1 }}>
              {submitting ? 'Creating…' : 'Create Budget'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Add Line Modal ───────────────────────────────────────────────────────────

function AddLineModal({ open, onClose, onSaved, budgetId, accounts }: {
  open: boolean; onClose: () => void; onSaved: () => void;
  budgetId: string; accounts: Account[];
}) {
  const [form, setForm] = useState({ accountId: '', fiscalPeriod: '', budgetAmount: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) { setError(''); setForm({ accountId: '', fiscalPeriod: '', budgetAmount: '', notes: '' }); }
  }, [open]);

  const set = (key: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.accountId || !form.fiscalPeriod.trim() || !form.budgetAmount.trim()) {
      setError('Account, period and amount are required.'); return;
    }
    setSubmitting(true); setError('');
    try {
      await budgetsApi.addLine(budgetId, {
        accountId: form.accountId,
        fiscalPeriod: form.fiscalPeriod,
        budgetAmount: Number(form.budgetAmount),
        notes: form.notes || undefined,
      });
      onSaved(); onClose();
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
      setError(msg || 'Operation failed.');
    } finally { setSubmitting(false); }
  };

  if (!open) return null;

  const inputStyle = { background:'rgba(255,255,255,0.04)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:7, padding:'9px 12px', fontSize:13, fontFamily:"'IBM Plex Sans',sans-serif", color:'#f1ede8', outline:'none', width:'100%' } as React.CSSProperties;
  const labelStyle = { fontSize:11, fontWeight:500, letterSpacing:'0.08em' as const, textTransform:'uppercase' as const, color:'rgba(251,146,60,0.6)', fontFamily:"'IBM Plex Sans',sans-serif" };

  return (
    <div style={{ position:'fixed', inset:0, zIndex:400, background:'rgba(0,0,0,0.65)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ background:'#0e0b1a', border:'0.5px solid rgba(251,146,60,0.2)', borderRadius:14, width:'100%', maxWidth:460, position:'relative', boxShadow:'0 24px 60px rgba(0,0,0,0.7)' }}>
        <div style={{ position:'absolute', top:0, left:30, right:30, height:1, background:'linear-gradient(90deg,transparent,rgba(251,146,60,0.4),transparent)' }} />
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px 12px', borderBottom:'0.5px solid rgba(255,255,255,0.06)' }}>
          <span style={{ fontSize:14, fontWeight:500, color:'#f1ede8', fontFamily:"'IBM Plex Sans',sans-serif" }}>Add Budget Line</span>
          <button onClick={onClose} style={{ width:24, height:24, borderRadius:6, background:'rgba(255,255,255,0.06)', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.45)', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ padding:'16px 20px', display:'flex', flexDirection:'column', gap:12 }}>
            {error && <div style={{ background:'rgba(239,68,68,0.1)', border:'0.5px solid rgba(239,68,68,0.25)', borderRadius:7, padding:'8px 12px', fontSize:12, color:'#fca5a5' }}>{error}</div>}
            <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
              <label style={labelStyle}>Account *</label>
              <select value={form.accountId} onChange={set('accountId')} style={{ ...inputStyle, cursor:'pointer' }}>
                <option value="">— Select account —</option>
                {accounts.map(a => <option key={a.id} value={a.id}>{a.accountNumber} — {a.name}</option>)}
              </select>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                <label style={labelStyle}>Fiscal Period *</label>
                <input placeholder="2026-03" value={form.fiscalPeriod} onChange={set('fiscalPeriod')} style={inputStyle} />
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                <label style={labelStyle}>Budget Amount *</label>
                <input type="number" min="0" placeholder="50000" value={form.budgetAmount} onChange={set('budgetAmount')} style={inputStyle} />
              </div>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
              <label style={labelStyle}>Notes</label>
              <input placeholder="Optional notes" value={form.notes} onChange={set('notes')} style={inputStyle} />
            </div>
          </div>
          <div style={{ display:'flex', justifyContent:'flex-end', gap:8, padding:'12px 20px 18px', borderTop:'0.5px solid rgba(255,255,255,0.06)' }}>
            <button type="button" onClick={onClose} style={{ background:'rgba(255,255,255,0.05)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:7, padding:'8px 16px', fontSize:13, fontFamily:"'IBM Plex Sans',sans-serif", color:'rgba(255,255,255,0.5)', cursor:'pointer' }}>Cancel</button>
            <button type="submit" disabled={submitting} style={{ background:'linear-gradient(135deg,#c2410c,#ea580c,#f97316)', border:'none', borderRadius:7, padding:'8px 20px', fontSize:13, fontWeight:500, fontFamily:"'IBM Plex Sans',sans-serif", color:'white', cursor:'pointer', opacity:submitting?0.5:1 }}>
              {submitting ? 'Adding…' : 'Add Line'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Budget detail panel ──────────────────────────────────────────────────────

function BudgetDetail({ budget, accounts, onRefresh }: {
  budget: Budget; accounts: Account[]; onRefresh: () => void;
}) {
  const [view, setView] = useState<'lines' | 'vsactual'>('lines');
  const [vsActual, setVsActual] = useState<VsActualReport | null>(null);
  const [loadingVA, setLoadingVA] = useState(false);
  const [addLineOpen, setAddLineOpen] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState('');

  const loadVsActual = async () => {
    setLoadingVA(true);
    try {
      const data = await budgetsApi.getVsActual(budget.id);
      setVsActual(data);
      setView('vsactual');
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
      setError(msg || 'Failed to load vs actual.');
    } finally { setLoadingVA(false); }
  };

  const handleApprove = async () => {
    setApproving(true);
    try {
      await budgetsApi.approve(budget.id);
      onRefresh();
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
      setError(msg || 'Approval failed.');
    } finally { setApproving(false); }
  };

  const totalBudget = budget.budgetLines.reduce((s, l) => s + Number(l.budgetAmount), 0);

  const MONO = { fontFamily: "'IBM Plex Mono',monospace", fontSize: 12 } as React.CSSProperties;

  return (
    <div style={{ marginTop: 0 }}>
      {error && <div style={{ background:'rgba(239,68,68,0.08)', border:'0.5px solid rgba(239,68,68,0.2)', borderRadius:8, padding:'8px 14px', marginBottom:10, fontSize:12, color:'#fca5a5' }}>{error}</div>}

      {/* Detail toolbar */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:10, flexWrap:'wrap' }}>
        <div style={{ display:'flex', gap:0, background:'rgba(255,255,255,0.04)', borderRadius:7, border:'0.5px solid rgba(255,255,255,0.08)', overflow:'hidden' }}>
          {(['lines', 'vsactual'] as const).map(v => (
            <button key={v} onClick={() => v === 'vsactual' ? loadVsActual() : setView('lines')} style={{
              padding:'5px 12px', fontSize:11, fontFamily:"'IBM Plex Sans',sans-serif", cursor:'pointer', border:'none',
              background: view === v ? 'rgba(251,146,60,0.15)' : 'transparent',
              color: view === v ? '#fb923c' : 'rgba(255,255,255,0.45)',
              transition:'background 0.15s, color 0.15s',
            }}>
              {v === 'lines' ? 'Budget Lines' : loadingVA ? 'Loading…' : 'vs Actual'}
            </button>
          ))}
        </div>

        {budget.status === 'draft' && (
          <>
            <button onClick={() => setAddLineOpen(true)} style={{
              padding:'5px 12px', borderRadius:6, fontSize:11, cursor:'pointer',
              background:'rgba(96,165,250,0.1)', color:'#60a5fa',
              border:'0.5px solid rgba(96,165,250,0.2)',
              fontFamily:"'IBM Plex Sans',sans-serif",
            }}>+ Add Line</button>
            <button onClick={handleApprove} disabled={approving || budget.budgetLines.length === 0} style={{
              padding:'5px 12px', borderRadius:6, fontSize:11, cursor:'pointer',
              background:'rgba(74,222,128,0.1)', color:'#4ade80',
              border:'0.5px solid rgba(74,222,128,0.2)',
              fontFamily:"'IBM Plex Sans',sans-serif",
              opacity: (approving || budget.budgetLines.length === 0) ? 0.5 : 1,
            }}>
              {approving ? 'Approving…' : 'Approve Budget'}
            </button>
          </>
        )}

        <span style={{ marginLeft:'auto', fontSize:11, color:'rgba(255,255,255,0.3)', fontFamily:"'IBM Plex Mono',monospace" }}>
          Total: {fmtAmt(totalBudget)}
        </span>
      </div>

      {/* Lines view */}
      {view === 'lines' && (
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr>
              {['Account', 'Period', 'Budget Amount', 'Notes'].map(h => (
                <th key={h} style={{ padding:'7px 12px', fontSize:10, fontWeight:500, letterSpacing:'0.08em', textTransform:'uppercase', color:'rgba(251,146,60,0.5)', background:'rgba(251,146,60,0.04)', borderBottom:'0.5px solid rgba(255,255,255,0.06)', textAlign: h === 'Budget Amount' ? 'right' : 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {budget.budgetLines.length === 0 ? (
              <tr><td colSpan={4} style={{ padding:'24px 12px', textAlign:'center', color:'rgba(255,255,255,0.25)', fontSize:12 }}>No lines yet. Add budget lines to get started.</td></tr>
            ) : budget.budgetLines.map(line => (
              <tr key={line.id}>
                <td style={{ padding:'8px 12px', borderBottom:'0.5px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ ...MONO, color:'#fb923c' }}>{line.account?.accountNumber}</span>
                  <span style={{ fontSize:12, color:'rgba(255,255,255,0.6)', marginLeft:8 }}>{line.account?.name}</span>
                </td>
                <td style={{ padding:'8px 12px', borderBottom:'0.5px solid rgba(255,255,255,0.04)', ...MONO, color:'rgba(255,255,255,0.55)' }}>{line.fiscalPeriod}</td>
                <td style={{ padding:'8px 12px', borderBottom:'0.5px solid rgba(255,255,255,0.04)', textAlign:'right', ...MONO, color:'#e2dfd8' }}>{fmtAmt(Number(line.budgetAmount))}</td>
                <td style={{ padding:'8px 12px', borderBottom:'0.5px solid rgba(255,255,255,0.04)', fontSize:12, color:'rgba(255,255,255,0.4)' }}>{line.notes || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* vs Actual view */}
      {view === 'vsactual' && vsActual && (
        <table style={{ width:'100%', borderCollapse:'collapse' }}>
          <thead>
            <tr>
              {['Account', 'Period', 'Budget', 'Actual', 'Variance', '%'].map(h => (
                <th key={h} style={{ padding:'7px 12px', fontSize:10, fontWeight:500, letterSpacing:'0.08em', textTransform:'uppercase', color:'rgba(251,146,60,0.5)', background:'rgba(251,146,60,0.04)', borderBottom:'0.5px solid rgba(255,255,255,0.06)', textAlign: ['Budget','Actual','Variance','%'].includes(h) ? 'right' : 'left' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {vsActual.lines.map((line, idx) => {
              const favorable = line.variance >= 0;
              return (
                <tr key={idx}>
                  <td style={{ padding:'8px 12px', borderBottom:'0.5px solid rgba(255,255,255,0.04)' }}>
                    <span style={{ ...MONO, color:'#fb923c' }}>{line.accountNumber}</span>
                    <span style={{ fontSize:12, color:'rgba(255,255,255,0.6)', marginLeft:8 }}>{line.accountName}</span>
                  </td>
                  <td style={{ padding:'8px 12px', borderBottom:'0.5px solid rgba(255,255,255,0.04)', ...MONO, color:'rgba(255,255,255,0.55)' }}>{line.fiscalPeriod}</td>
                  <td style={{ padding:'8px 12px', borderBottom:'0.5px solid rgba(255,255,255,0.04)', textAlign:'right', ...MONO, color:'#e2dfd8' }}>{fmtAmt(line.budgetAmount)}</td>
                  <td style={{ padding:'8px 12px', borderBottom:'0.5px solid rgba(255,255,255,0.04)', textAlign:'right', ...MONO, color:'rgba(255,255,255,0.6)' }}>{fmtAmt(line.actualAmount)}</td>
                  <td style={{ padding:'8px 12px', borderBottom:'0.5px solid rgba(255,255,255,0.04)', textAlign:'right', ...MONO, color: favorable ? '#4ade80' : '#f87171', fontWeight:500 }}>
                    {fmtAmt(line.variance)}
                  </td>
                  <td style={{ padding:'8px 12px', borderBottom:'0.5px solid rgba(255,255,255,0.04)', textAlign:'right', fontSize:11, color: favorable ? '#4ade80' : '#f87171' }}>
                    {fmtPct(line.variancePercent)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <AddLineModal
        open={addLineOpen}
        onClose={() => setAddLineOpen(false)}
        onSaved={onRefresh}
        budgetId={budget.id}
        accounts={accounts}
      />
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function BudgetsPage() {
  const [budgets,    setBudgets]    = useState<Budget[]>([]);
  const [accounts,   setAccounts]   = useState<Account[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [yearFilter, setYearFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<BudgetStatus | ''>('');
  const [createOpen, setCreateOpen] = useState(false);
  const [expanded,   setExpanded]   = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [raw, accs] = await Promise.all([
        budgetsApi.getAll(),
        chartOfAccountsApi.getAll(),
      ]);
      setBudgets(extractList(raw as unknown));
      setAccounts(accs);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load data.';
      setError(message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filtered = budgets.filter(b => {
    const matchYear   = !yearFilter   || b.fiscalYear === yearFilter;
    const matchStatus = !statusFilter || b.status     === statusFilter;
    return matchYear && matchStatus;
  });

  const years = [...new Set(budgets.map(b => b.fiscalYear))].sort((a, b) => b.localeCompare(a));

  return (
    <ERPShell breadcrumbs={['Home', 'Financial', 'Budgets']} title="Budgets">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap');
        .bg-page { padding: 0 18px 24px; }
        .bg-toolbar { display:flex; align-items:center; gap:10px; margin-bottom:14px; flex-wrap:wrap; }
        .bg-filter { background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.09); border-radius:7px; padding:7px 12px; font-size:12px; font-family:'IBM Plex Sans',sans-serif; color:#e2dfd8; outline:none; }
        .bg-filter option { background:#0e0b1a; color:#f1ede8; }
        .bg-btn-new { display:flex; align-items:center; gap:6px; margin-left:auto; background:linear-gradient(135deg,#c2410c,#ea580c,#f97316); border:none; border-radius:7px; padding:7px 14px; font-size:12px; font-weight:500; font-family:'IBM Plex Sans',sans-serif; color:white; cursor:pointer; box-shadow:0 3px 12px rgba(234,88,12,0.3); transition:opacity 0.15s, transform 0.15s; flex-shrink:0; }
        .bg-btn-new:hover { opacity:0.88; transform:translateY(-1px); }
        .bg-btn-new svg { width:13px; height:13px; display:block; flex-shrink:0; }
        .bg-list { display:flex; flex-direction:column; gap:10px; }
        .bg-card { background:rgba(10,7,18,0.7); border:0.5px solid rgba(251,146,60,0.12); border-radius:10px; overflow:hidden; }
        .bg-card-hdr { display:flex; align-items:center; gap:12px; padding:14px 16px; cursor:pointer; transition:background 0.15s; }
        .bg-card-hdr:hover { background:rgba(251,146,60,0.03); }
        .bg-card-body { padding:0 16px 14px; border-top:0.5px solid rgba(255,255,255,0.06); }
        .bg-empty, .bg-loading { text-align:center; padding:52px 24px; color:rgba(255,255,255,0.25); font-size:13px; display:flex; flex-direction:column; align-items:center; gap:10px; }
        .bg-spinner { width:18px; height:18px; border-radius:50%; border:2px solid rgba(251,146,60,0.2); border-top-color:#fb923c; animation:bg-spin 0.7s linear infinite; flex-shrink:0; }
        @keyframes bg-spin { to { transform:rotate(360deg); } }
        .bg-error { background:rgba(239,68,68,0.08); border:0.5px solid rgba(239,68,68,0.2); border-radius:8px; padding:10px 14px; margin-bottom:14px; font-size:13px; color:#fca5a5; }
      `}</style>

      <div className="bg-page">
        <div className="bg-toolbar">
          <select className="bg-filter" value={yearFilter} onChange={e => setYearFilter(e.target.value)}>
            <option value="">All Years</option>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          <select className="bg-filter" value={statusFilter} onChange={e => setStatusFilter(e.target.value as BudgetStatus | '')}>
            <option value="">All Status</option>
            <option value="draft">Draft</option>
            <option value="approved">Approved</option>
          </select>
          <button className="bg-btn-new" onClick={() => setCreateOpen(true)}>
            <svg viewBox="0 0 13 13" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
              <line x1="6.5" y1="1" x2="6.5" y2="12" /><line x1="1" y1="6.5" x2="12" y2="6.5" />
            </svg>
            New Budget
          </button>
        </div>

        {error && <div className="bg-error">{error}</div>}

        {loading ? (
          <div className="bg-loading"><div className="bg-spinner" />Loading budgets…</div>
        ) : filtered.length === 0 ? (
          <div className="bg-empty">{yearFilter || statusFilter ? 'No budgets match your filters.' : 'No budgets yet.'}</div>
        ) : (
          <div className="bg-list">
            {filtered.map(budget => {
              const isOpen = expanded === budget.id;
              const totalBudget = budget.budgetLines.reduce((s, l) => s + Number(l.budgetAmount), 0);
              return (
                <div key={budget.id} className="bg-card">
                  <div className="bg-card-hdr" onClick={() => setExpanded(isOpen ? null : budget.id)}>
                    {/* Chevron */}
                    <span style={{ fontSize:10, color:'rgba(255,255,255,0.3)', transform: isOpen ? 'rotate(90deg)' : 'none', display:'inline-block', transition:'transform 0.15s', flexShrink:0 }}>▶</span>

                    {/* Code */}
                    <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:12, color:'#fb923c', fontWeight:500, flexShrink:0 }}>{budget.budgetCode}</span>

                    {/* Name + year */}
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:13, fontWeight:500, color:'#e2dfd8' }}>{budget.budgetName}</div>
                      <div style={{ fontSize:11, color:'rgba(255,255,255,0.35)' }}>FY {budget.fiscalYear} · {budget.budgetLines.length} line{budget.budgetLines.length !== 1 ? 's' : ''}</div>
                    </div>

                    {/* Total */}
                    <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:13, color:'rgba(255,255,255,0.6)', flexShrink:0 }}>
                      {fmtAmt(totalBudget)}
                    </span>

                    <StatusBadge status={budget.status} />
                  </div>

                  {isOpen && (
                    <div className="bg-card-body" style={{ paddingTop:12 }}>
                      {budget.description && (
                        <p style={{ fontSize:12, color:'rgba(255,255,255,0.4)', marginBottom:12, lineHeight:1.5 }}>{budget.description}</p>
                      )}
                      <BudgetDetail budget={budget} accounts={accounts} onRefresh={fetchAll} />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <CreateBudgetModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={fetchAll}
      />
    </ERPShell>
  );
}