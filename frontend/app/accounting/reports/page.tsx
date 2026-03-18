"use client";

import { useState, useCallback } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import { financialReportsApi } from '@/lib/api/financial-reports';

// ─── Real backend types ───────────────────────────────────────────────────────

interface ReportAccount {
  accountNumber: string;
  accountName: string;
  accountCategory?: string;
  accountType?: string;
  amount?: number;
  totalDebits?: number;
  totalCredits?: number;
  netBalance?: number;
}

interface PLReport {
  reportName: string;
  period: { startDate: string; endDate: string };
  revenue: { accounts: ReportAccount[]; total: number };
  expenses: { accounts: ReportAccount[]; total: number };
  netIncome: number;
}

interface BalanceSheetReport {
  reportName: string;
  asOfDate: string;
  assets:      { accounts: ReportAccount[]; total: number };
  liabilities: { accounts: ReportAccount[]; total: number };
  equity:      { accounts: ReportAccount[]; total: number };
  totalLiabilitiesAndEquity: number;
  isBalanced: boolean;
}

interface TrialBalanceReport {
  reportName: string;
  asOfDate: string;
  accounts: ReportAccount[];
  totals: { totalDebits: number; totalCredits: number; difference: number; isBalanced: boolean };
}

interface GLEntry {
  date: string;
  entryNumber: string;
  accountNumber: string;
  accountName: string;
  description: string;
  debit: number;
  credit: number;
}

interface GLReport {
  reportName: string;
  entries: GLEntry[];
}

type ReportTab = 'pl' | 'bs' | 'tb' | 'gl';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtAmt(n: number, showZero = false) {
  if (!showZero && n === 0) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

function fmtDate(d: string) {
  if (d === 'inception') return 'Inception';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── Shared table styles ──────────────────────────────────────────────────────

const TH: React.CSSProperties = {
  padding: '9px 14px', fontSize: 10, fontWeight: 500,
  letterSpacing: '0.1em', textTransform: 'uppercase',
  color: 'rgba(251,146,60,0.55)', background: 'rgba(251,146,60,0.05)',
  borderBottom: '0.5px solid rgba(255,255,255,0.06)',
  textAlign: 'left', whiteSpace: 'nowrap',
};

const TD: React.CSSProperties = {
  padding: '9px 14px',
  borderBottom: '0.5px solid rgba(255,255,255,0.04)',
  verticalAlign: 'middle', fontSize: 13,
};

const MONO: React.CSSProperties = {
  fontFamily: "'IBM Plex Mono', monospace", fontSize: 12,
};

// ─── Section header row ───────────────────────────────────────────────────────

function SectionRow({ label, total, color }: { label: string; total: number; color?: string }) {
  return (
    <tr>
      <td colSpan={2} style={{
        ...TD, padding: '12px 14px 6px',
        fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase',
        color: color ?? 'rgba(255,255,255,0.35)',
        borderBottom: '0.5px solid rgba(255,255,255,0.08)',
      }}>
        {label}
      </td>
      <td style={{
        ...TD, padding: '12px 14px 6px', textAlign: 'right',
        ...MONO, color: color ?? 'rgba(255,255,255,0.6)', fontWeight: 500,
        borderBottom: '0.5px solid rgba(255,255,255,0.08)',
      }}>
        {fmtAmt(total, true)}
      </td>
    </tr>
  );
}

function TotalRow({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <tr style={{ background: highlight ? 'rgba(251,146,60,0.05)' : 'rgba(255,255,255,0.02)' }}>
      <td colSpan={2} style={{
        ...TD, fontWeight: 600, fontSize: 13,
        color: highlight ? '#fb923c' : '#f1ede8',
        borderTop: '0.5px solid rgba(255,255,255,0.1)',
        borderBottom: highlight ? 'none' : '0.5px solid rgba(255,255,255,0.04)',
      }}>
        {label}
      </td>
      <td style={{
        ...TD, textAlign: 'right', fontWeight: 600,
        ...MONO, fontSize: 13,
        color: value >= 0 ? (highlight ? '#fb923c' : '#4ade80') : '#f87171',
        borderTop: '0.5px solid rgba(255,255,255,0.1)',
        borderBottom: highlight ? 'none' : '0.5px solid rgba(255,255,255,0.04)',
      }}>
        {fmtAmt(value, true)}
      </td>
    </tr>
  );
}

// ─── Filters bar ──────────────────────────────────────────────────────────────

function FiltersBar({ filters, onChange, onRun, loading }: {
  filters: Record<string, string>;
  onChange: (key: string, val: string) => void;
  onRun: () => void;
  loading: boolean;
}) {
  return (
    <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
      {[
        { key: 'startDate', label: 'Start Date', type: 'date', placeholder: '2026-01-01' },
        { key: 'endDate',   label: 'End Date',   type: 'date', placeholder: '2026-03-31' },
        { key: 'fiscalPeriod', label: 'Fiscal Period', type: 'text', placeholder: '2026-03' },
      ].map(f => (
        <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={{
            fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase',
            color: 'rgba(251,146,60,0.6)', fontFamily: "'IBM Plex Sans',sans-serif",
          }}>{f.label}</label>
          <input
            type={f.type}
            placeholder={f.placeholder}
            value={filters[f.key] ?? ''}
            onChange={e => onChange(f.key, e.target.value)}
            style={{
              background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.1)',
              borderRadius: 7, padding: '7px 12px', fontSize: 12,
              fontFamily: "'IBM Plex Sans',sans-serif", color: '#e2dfd8',
              outline: 'none', width: 140,
            }}
          />
        </div>
      ))}
      <button
        onClick={onRun}
        disabled={loading}
        style={{
          background: 'linear-gradient(135deg,#c2410c,#ea580c,#f97316)', border: 'none',
          borderRadius: 7, padding: '7px 16px', fontSize: 12, fontWeight: 500,
          fontFamily: "'IBM Plex Sans',sans-serif", color: 'white', cursor: 'pointer',
          boxShadow: '0 3px 12px rgba(234,88,12,0.3)', opacity: loading ? 0.6 : 1,
          alignSelf: 'flex-end',
        }}
      >
        {loading ? 'Loading…' : 'Run Report'}
      </button>
    </div>
  );
}

// ─── P&L Report ───────────────────────────────────────────────────────────────

function PLView({ data }: { data: PLReport }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 12 }}>
        Period: {fmtDate(data.period.startDate)} → {fmtDate(data.period.endDate)}
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...TH, width: 120 }}>Account #</th>
            <th style={TH}>Account Name</th>
            <th style={{ ...TH, textAlign: 'right' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          <SectionRow label="Revenue" total={data.revenue.total} color="#4ade80" />
          {data.revenue.accounts.map(a => (
            <tr key={a.accountNumber}>
              <td style={{ ...TD, ...MONO, color: '#fb923c' }}>{a.accountNumber}</td>
              <td style={{ ...TD, color: '#e2dfd8' }}>{a.accountName}</td>
              <td style={{ ...TD, textAlign: 'right', ...MONO, color: '#4ade80' }}>{fmtAmt(a.amount ?? 0)}</td>
            </tr>
          ))}
          {data.revenue.accounts.length === 0 && (
            <tr><td colSpan={3} style={{ ...TD, color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>No revenue accounts</td></tr>
          )}

          <SectionRow label="Expenses" total={data.expenses.total} color="#f87171" />
          {data.expenses.accounts.map(a => (
            <tr key={a.accountNumber}>
              <td style={{ ...TD, ...MONO, color: '#fb923c' }}>{a.accountNumber}</td>
              <td style={{ ...TD, color: '#e2dfd8' }}>{a.accountName}</td>
              <td style={{ ...TD, textAlign: 'right', ...MONO, color: '#f87171' }}>{fmtAmt(a.amount ?? 0)}</td>
            </tr>
          ))}
          {data.expenses.accounts.length === 0 && (
            <tr><td colSpan={3} style={{ ...TD, color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>No expense accounts</td></tr>
          )}

          <TotalRow
            label="Net Income"
            value={data.netIncome}
            highlight
          />
        </tbody>
      </table>
    </div>
  );
}

// ─── Balance Sheet ────────────────────────────────────────────────────────────

function BSView({ data }: { data: BalanceSheetReport }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>As of {fmtDate(data.asOfDate)}</span>
        <span style={{
          fontSize: 10, padding: '2px 8px', borderRadius: 20,
          color: data.isBalanced ? '#4ade80' : '#f87171',
          background: data.isBalanced ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)',
          border: `0.5px solid ${data.isBalanced ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)'}`,
        }}>
          {data.isBalanced ? '✓ Balanced' : '✗ Not balanced'}
        </span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...TH, width: 120 }}>Account #</th>
            <th style={TH}>Account Name</th>
            <th style={{ ...TH, textAlign: 'right' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          <SectionRow label="Assets" total={data.assets.total} color="#60a5fa" />
          {data.assets.accounts.map(a => (
            <tr key={a.accountNumber}>
              <td style={{ ...TD, ...MONO, color: '#fb923c' }}>{a.accountNumber}</td>
              <td style={{ ...TD, color: '#e2dfd8' }}>{a.accountName}</td>
              <td style={{ ...TD, textAlign: 'right', ...MONO, color: '#60a5fa' }}>{fmtAmt(a.amount ?? 0)}</td>
            </tr>
          ))}

          <SectionRow label="Liabilities" total={data.liabilities.total} color="#f87171" />
          {data.liabilities.accounts.map(a => (
            <tr key={a.accountNumber}>
              <td style={{ ...TD, ...MONO, color: '#fb923c' }}>{a.accountNumber}</td>
              <td style={{ ...TD, color: '#e2dfd8' }}>{a.accountName}</td>
              <td style={{ ...TD, textAlign: 'right', ...MONO, color: '#f87171' }}>{fmtAmt(a.amount ?? 0)}</td>
            </tr>
          ))}
          {data.liabilities.accounts.length === 0 && (
            <tr><td colSpan={3} style={{ ...TD, color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>No liability accounts</td></tr>
          )}

          <SectionRow label="Equity" total={data.equity.total} color="#a78bfa" />
          {data.equity.accounts.map(a => (
            <tr key={a.accountNumber}>
              <td style={{ ...TD, ...MONO, color: '#fb923c' }}>{a.accountNumber}</td>
              <td style={{ ...TD, color: '#e2dfd8' }}>{a.accountName}</td>
              <td style={{ ...TD, textAlign: 'right', ...MONO, color: '#a78bfa' }}>{fmtAmt(a.amount ?? 0)}</td>
            </tr>
          ))}
          {data.equity.accounts.length === 0 && (
            <tr><td colSpan={3} style={{ ...TD, color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>No equity accounts</td></tr>
          )}

          <TotalRow label="Total Liabilities & Equity" value={data.totalLiabilitiesAndEquity} highlight />
        </tbody>
      </table>
    </div>
  );
}

// ─── Trial Balance ────────────────────────────────────────────────────────────

function TBView({ data }: { data: TrialBalanceReport }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>As of {fmtDate(data.asOfDate)}</span>
        <span style={{
          fontSize: 10, padding: '2px 8px', borderRadius: 20,
          color: data.totals.isBalanced ? '#4ade80' : '#f87171',
          background: data.totals.isBalanced ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)',
          border: `0.5px solid ${data.totals.isBalanced ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)'}`,
        }}>
          {data.totals.isBalanced ? '✓ Balanced' : '✗ Not balanced'}
        </span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ ...TH, width: 120 }}>Account #</th>
            <th style={TH}>Account Name</th>
            <th style={{ ...TH, width: 80 }}>Type</th>
            <th style={{ ...TH, textAlign: 'right' }}>Total Debits</th>
            <th style={{ ...TH, textAlign: 'right' }}>Total Credits</th>
            <th style={{ ...TH, textAlign: 'right' }}>Net Balance</th>
          </tr>
        </thead>
        <tbody>
          {data.accounts.map(a => (
            <tr key={a.accountNumber}>
              <td style={{ ...TD, ...MONO, color: '#fb923c' }}>{a.accountNumber}</td>
              <td style={{ ...TD, color: '#e2dfd8' }}>{a.accountName}</td>
              <td style={{ ...TD, color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>
                {a.accountType ? a.accountType.charAt(0).toUpperCase() + a.accountType.slice(1) : '—'}
              </td>
              <td style={{ ...TD, textAlign: 'right', ...MONO, color: '#e2dfd8' }}>
                {fmtAmt(a.totalDebits ?? 0)}
              </td>
              <td style={{ ...TD, textAlign: 'right', ...MONO, color: 'rgba(255,255,255,0.55)' }}>
                {fmtAmt(a.totalCredits ?? 0)}
              </td>
              <td style={{
                ...TD, textAlign: 'right', ...MONO,
                color: (a.netBalance ?? 0) >= 0 ? '#4ade80' : '#f87171',
                fontWeight: 500,
              }}>
                {fmtAmt(a.netBalance ?? 0, true)}
              </td>
            </tr>
          ))}
          {/* Totals */}
          <tr style={{ background: 'rgba(251,146,60,0.05)', borderTop: '0.5px solid rgba(255,255,255,0.1)' }}>
            <td colSpan={3} style={{ ...TD, fontWeight: 600, color: '#fb923c', borderTop: 'none' }}>TOTALS</td>
            <td style={{ ...TD, textAlign: 'right', ...MONO, fontWeight: 600, color: '#e2dfd8', borderTop: 'none' }}>
              {fmtAmt(data.totals.totalDebits, true)}
            </td>
            <td style={{ ...TD, textAlign: 'right', ...MONO, fontWeight: 600, color: 'rgba(255,255,255,0.55)', borderTop: 'none' }}>
              {fmtAmt(data.totals.totalCredits, true)}
            </td>
            <td style={{
              ...TD, textAlign: 'right', ...MONO, fontWeight: 600, borderTop: 'none',
              color: data.totals.difference === 0 ? '#4ade80' : '#f87171',
            }}>
              {fmtAmt(data.totals.difference, true)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ─── General Ledger ───────────────────────────────────────────────────────────

function GLView({ data }: { data: GLReport }) {
  // Group entries by account
  const grouped = data.entries.reduce((acc, entry) => {
    const key = entry.accountNumber;
    if (!acc[key]) acc[key] = { name: entry.accountName, entries: [] };
    acc[key].entries.push(entry);
    return acc;
  }, {} as Record<string, { name: string; entries: GLEntry[] }>);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {Object.entries(grouped).map(([accountNumber, group]) => {
        const totalDebit  = group.entries.reduce((s, e) => s + e.debit,  0);
        const totalCredit = group.entries.reduce((s, e) => s + e.credit, 0);
        return (
          <div key={accountNumber}>
            {/* Account header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6,
              padding: '6px 14px',
              background: 'rgba(251,146,60,0.06)',
              borderRadius: '8px 8px 0 0',
              borderTop: '0.5px solid rgba(251,146,60,0.15)',
              borderLeft: '0.5px solid rgba(251,146,60,0.15)',
              borderRight: '0.5px solid rgba(251,146,60,0.15)',
            }}>
              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, color: '#fb923c', fontWeight: 500 }}>
                {accountNumber}
              </span>
              <span style={{ fontSize: 13, color: '#f1ede8', fontWeight: 500 }}>{group.name}</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={{ ...TH, width: 120 }}>Date</th>
                  <th style={{ ...TH, width: 160 }}>Entry #</th>
                  <th style={TH}>Description</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Debit</th>
                  <th style={{ ...TH, textAlign: 'right' }}>Credit</th>
                </tr>
              </thead>
              <tbody>
                {group.entries.map((entry, idx) => (
                  <tr key={idx}>
                    <td style={{ ...TD, color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>
                      {fmtDate(entry.date)}
                    </td>
                    <td style={{ ...TD, ...MONO, color: '#fb923c', fontSize: 11 }}>
                      {entry.entryNumber}
                    </td>
                    <td style={{ ...TD, color: '#e2dfd8' }}>{entry.description}</td>
                    <td style={{ ...TD, textAlign: 'right', ...MONO, color: entry.debit > 0 ? '#e2dfd8' : 'rgba(255,255,255,0.2)' }}>
                      {fmtAmt(entry.debit)}
                    </td>
                    <td style={{ ...TD, textAlign: 'right', ...MONO, color: entry.credit > 0 ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.2)' }}>
                      {fmtAmt(entry.credit)}
                    </td>
                  </tr>
                ))}
                {/* Account totals */}
                <tr style={{ background: 'rgba(255,255,255,0.02)', borderTop: '0.5px solid rgba(255,255,255,0.08)' }}>
                  <td colSpan={3} style={{ ...TD, fontSize: 11, color: 'rgba(255,255,255,0.3)', fontWeight: 500, borderTop: 'none' }}>
                    Account Total
                  </td>
                  <td style={{ ...TD, textAlign: 'right', ...MONO, fontWeight: 500, color: '#e2dfd8', borderTop: 'none' }}>
                    {fmtAmt(totalDebit, true)}
                  </td>
                  <td style={{ ...TD, textAlign: 'right', ...MONO, fontWeight: 500, color: 'rgba(255,255,255,0.55)', borderTop: 'none' }}>
                    {fmtAmt(totalCredit, true)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

const TAB_CONFIG: { key: ReportTab; label: string; desc: string }[] = [
  { key: 'pl', label: 'P&L Statement',   desc: 'Profit & Loss' },
  { key: 'bs', label: 'Balance Sheet',   desc: 'Financial Position' },
  { key: 'tb', label: 'Trial Balance',   desc: 'Account Balances' },
  { key: 'gl', label: 'General Ledger',  desc: 'Transaction Detail' },
];

export default function FinancialReportsPage() {
  const [tab,      setTab]      = useState<ReportTab>('pl');
  const [filters,  setFilters]  = useState<Record<string, string>>({});
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');
  const [plData,   setPLData]   = useState<PLReport | null>(null);
  const [bsData,   setBSData]   = useState<BalanceSheetReport | null>(null);
  const [tbData,   setTBData]   = useState<TrialBalanceReport | null>(null);
  const [glData,   setGLData]   = useState<GLReport | null>(null);

  const handleFilterChange = (key: string, val: string) =>
    setFilters(f => ({ ...f, [key]: val }));

  const runReport = useCallback(async () => {
    setLoading(true); setError('');
    const params = Object.fromEntries(
      Object.entries(filters).filter(([, v]) => v.trim() !== '')
    );
    try {
      switch (tab) {
        case 'pl': setPLData(await financialReportsApi.getProfitAndLoss(params)); break;
        case 'bs': setBSData(await financialReportsApi.getBalanceSheet(params)); break;
        case 'tb': setTBData(await financialReportsApi.getTrialBalance(params)); break;
        case 'gl': setGLData(await financialReportsApi.getGeneralLedger(params)); break;
      }
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
      setError(msg || 'Failed to load report.');
    } finally { setLoading(false); }
  }, [tab, filters]);

  // Auto-run when tab changes if data not loaded
  const currentData = { pl: plData, bs: bsData, tb: tbData, gl: glData }[tab];

  const hasData = currentData !== null;

  return (
    <ERPShell breadcrumbs={['Home', 'Financial', 'Reports']} title="Financial Reports">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&display=swap');
        .fr-page { padding: 0 18px 24px; }
        .fr-tabs { display:flex; gap:0; margin-bottom:16px; border-bottom:0.5px solid rgba(255,255,255,0.08); }
        .fr-tab {
          padding:8px 16px; font-size:12px; font-weight:500; cursor:pointer;
          color:rgba(255,255,255,0.4); border-bottom:2px solid transparent;
          transition:color 0.15s, border-color 0.15s; user-select:none;
          font-family:'IBM Plex Sans',sans-serif; white-space:nowrap;
        }
        .fr-tab:hover { color:rgba(255,255,255,0.7); }
        .fr-tab-active { color:#fb923c !important; border-bottom-color:#fb923c !important; }
        .fr-wrap {
          background:rgba(10,7,18,0.7); border:0.5px solid rgba(251,146,60,0.12);
          border-radius:10px; overflow:hidden; padding:16px;
        }
        .fr-empty {
          text-align:center; padding:52px 24px; color:rgba(255,255,255,0.25); font-size:13px;
          display:flex; flex-direction:column; align-items:center; gap:10px;
        }
        .fr-spinner {
          width:18px; height:18px; border-radius:50%;
          border:2px solid rgba(251,146,60,0.2); border-top-color:#fb923c;
          animation:fr-spin 0.7s linear infinite; flex-shrink:0;
        }
        @keyframes fr-spin { to { transform:rotate(360deg); } }
        .fr-error {
          background:rgba(239,68,68,0.08); border:0.5px solid rgba(239,68,68,0.2);
          border-radius:8px; padding:10px 14px; margin-bottom:14px; font-size:13px; color:#fca5a5;
        }
      `}</style>

      <div className="fr-page">

        {/* Tabs */}
        <div className="fr-tabs">
          {TAB_CONFIG.map(t => (
            <div
              key={t.key}
              className={`fr-tab${tab === t.key ? ' fr-tab-active' : ''}`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </div>
          ))}
        </div>

        {/* Filters */}
        <FiltersBar
          filters={filters}
          onChange={handleFilterChange}
          onRun={runReport}
          loading={loading}
        />

        {error && <div className="fr-error">{error}</div>}

        {/* Report content */}
        <div className="fr-wrap">
          {loading ? (
            <div className="fr-empty"><div className="fr-spinner" />Loading report…</div>
          ) : !hasData ? (
            <div className="fr-empty">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none" style={{ opacity: 0.3 }}>
                <rect x="6" y="4" width="20" height="24" rx="3" stroke="white" strokeWidth="1.5"/>
                <line x1="10" y1="11" x2="22" y2="11" stroke="white" strokeWidth="1.5"/>
                <line x1="10" y1="16" x2="22" y2="16" stroke="white" strokeWidth="1.5"/>
                <line x1="10" y1="21" x2="16" y2="21" stroke="white" strokeWidth="1.5"/>
              </svg>
              Set filters and click Run Report to generate the {TAB_CONFIG.find(t => t.key === tab)?.desc}
            </div>
          ) : (
            <>
              {tab === 'pl' && plData && <PLView data={plData} />}
              {tab === 'bs' && bsData && <BSView data={bsData} />}
              {tab === 'tb' && tbData && <TBView data={tbData} />}
              {tab === 'gl' && glData && <GLView data={glData} />}
            </>
          )}
        </div>
      </div>
    </ERPShell>
  );
}