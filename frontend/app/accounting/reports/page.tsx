"use client";

import { useState, useCallback, useEffect } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import { financialReportsApi } from '@/lib/api/financial-reports';

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

interface AccountGroup { accounts: ReportAccount[]; total: number; }

interface PLReport {
  reportName:  string;
  period:      { startDate: string; endDate: string };
  revenue:     AccountGroup;
  costOfSales: AccountGroup & { foodCost?: AccountGroup; laborCost?: AccountGroup };
  grossProfit: number;
  grossMarginPct?: number;
  sga?: AccountGroup & { selling?: AccountGroup; admin?: AccountGroup };
  ebit?: number;
  ebitMarginPct?: number;
  depreciation?: AccountGroup;
  ebitda?: number;
  ebitdaMarginPct?: number;
  financial?: AccountGroup;
  ebt?: number;
  tax?: AccountGroup;
  netIncome: number;
  netMarginPct?: number;
  expenses: AccountGroup;
}

interface BalanceSheetReport {
  reportName: string; asOfDate: string;
  assets:      AccountGroup;
  liabilities: AccountGroup;
  equity:      AccountGroup;
  totalLiabilitiesAndEquity: number;
  isBalanced: boolean;
}

interface TrialBalanceReport {
  reportName: string; asOfDate: string;
  accounts: ReportAccount[];
  totals: { totalDebits: number; totalCredits: number; difference: number; isBalanced: boolean };
}

interface GLEntry {
  date: string; entryNumber: string; accountNumber: string;
  accountName: string; description: string; debit: number; credit: number;
}
interface GLReport { reportName: string; entries: GLEntry[]; }

type ReportTab = 'pl' | 'bs' | 'tb' | 'gl';

function fmtAmt(n: number, showZero = false) {
  if (!showZero && n === 0) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}
function fmtPct(n?: number) { return n !== undefined ? ` (${n.toFixed(1)}%)` : ''; }
function fmtDate(d: string) {
  if (d === 'inception') return 'Inception';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const TH: React.CSSProperties = {
  padding: '9px 14px', fontSize: 10, fontWeight: 500, letterSpacing: '0.1em',
  textTransform: 'uppercase', color: 'rgba(251,146,60,0.55)',
  background: 'rgba(251,146,60,0.05)', borderBottom: '0.5px solid rgba(255,255,255,0.06)',
  textAlign: 'left', whiteSpace: 'nowrap',
};
const TD: React.CSSProperties = {
  padding: '9px 14px', borderBottom: '0.5px solid rgba(255,255,255,0.04)',
  verticalAlign: 'middle', fontSize: 13,
};
const MONO: React.CSSProperties = { fontFamily: "'IBM Plex Mono', monospace", fontSize: 12 };

function SectionRow({ label, total, color, indent }: { label: string; total: number; color?: string; indent?: boolean }) {
  return (
    <tr>
      <td colSpan={2} style={{ ...TD, padding: indent ? '8px 14px 4px 28px' : '12px 14px 6px', fontSize: 10,
        fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase',
        color: color ?? 'rgba(255,255,255,0.35)', borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>
        {label}
      </td>
      <td style={{ ...TD, padding: '12px 14px 6px', textAlign: 'right', ...MONO,
        color: color ?? 'rgba(255,255,255,0.6)', fontWeight: 500,
        borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>
        {fmtAmt(total, true)}
      </td>
    </tr>
  );
}

function AcctRow({ a, color, indent }: { a: ReportAccount; color: string; indent?: boolean }) {
  return (
    <tr>
      <td style={{ ...TD, ...MONO, color: 'var(--accent-strong)', paddingLeft: indent ? 28 : 14 }}>{a.accountNumber}</td>
      <td style={{ ...TD, color: 'var(--text-primary)', paddingLeft: indent ? 28 : 14 }}>{a.accountName}</td>
      <td style={{ ...TD, textAlign: 'right', ...MONO, color }}>{fmtAmt(a.amount ?? 0)}</td>
    </tr>
  );
}

function DividerRow({ label }: { label: string }) {
  return (
    <tr>
      <td colSpan={3} style={{ padding: '4px 14px 4px 28px', fontSize: 9, letterSpacing: '0.1em',
        color: 'rgba(255,255,255,0.25)', textTransform: 'uppercase',
        borderBottom: '0.5px solid rgba(255,255,255,0.04)', background: 'rgba(255,255,255,0.01)' }}>
        {label}
      </td>
    </tr>
  );
}

function SubtotalRow({ label, value, color, pct }: { label: string; value: number; color?: string; pct?: string }) {
  return (
    <tr style={{ background: 'rgba(255,255,255,0.02)' }}>
      <td colSpan={2} style={{ ...TD, fontWeight: 700, fontSize: 13, color: color ?? 'var(--text-strong)',
        borderTop: '0.5px solid rgba(255,255,255,0.1)' }}>
        {label}{pct && <span style={{ fontSize: 10, fontWeight: 400, color: 'rgba(255,255,255,0.35)', marginLeft: 8 }}>{pct}</span>}
      </td>
      <td style={{ ...TD, textAlign: 'right', fontWeight: 700, ...MONO, fontSize: 13,
        color: color ?? (value >= 0 ? 'var(--success)' : 'var(--danger)'),
        borderTop: '0.5px solid rgba(255,255,255,0.1)' }}>
        {fmtAmt(value, true)}
      </td>
    </tr>
  );
}

function TotalRow({ label, value, highlight, pct }: { label: string; value: number; highlight?: boolean; pct?: string }) {
  return (
    <tr style={{ background: highlight ? 'rgba(251,146,60,0.05)' : 'rgba(255,255,255,0.02)' }}>
      <td colSpan={2} style={{ ...TD, fontWeight: 700, fontSize: 14,
        color: highlight ? 'var(--accent-strong)' : 'var(--text-strong)',
        borderTop: '0.5px solid rgba(255,255,255,0.15)',
        borderBottom: highlight ? 'none' : '0.5px solid rgba(255,255,255,0.04)' }}>
        {label}{pct && <span style={{ fontSize: 10, fontWeight: 400, color: 'rgba(255,255,255,0.35)', marginLeft: 8 }}>{pct}</span>}
      </td>
      <td style={{ ...TD, textAlign: 'right', fontWeight: 700, ...MONO, fontSize: 14,
        color: value >= 0 ? (highlight ? 'var(--accent-strong)' : 'var(--success)') : 'var(--danger)',
        borderTop: '0.5px solid rgba(255,255,255,0.15)',
        borderBottom: highlight ? 'none' : '0.5px solid rgba(255,255,255,0.04)' }}>
        {fmtAmt(value, true)}
      </td>
    </tr>
  );
}

function PLView({ data }: { data: PLReport }) {
  const structured = data.sga !== undefined;
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
            <th style={{ ...TH, textAlign: 'right', width: 200 }}>Amount</th>
          </tr>
        </thead>
        <tbody>

          {/* REVENUE */}
          <SectionRow label="Revenue" total={data.revenue.total} color="var(--success)" />
          {data.revenue.accounts.map(a => <AcctRow key={a.accountNumber} a={a} color="var(--success)" />)}

          {/* COST OF SALES */}
          <SectionRow label="Cost of Sales" total={data.costOfSales.total} color="var(--warning)" />
          {structured ? (
            <>
              {(data.costOfSales.foodCost?.accounts.length ?? 0) > 0 && (
                <><DividerRow label="Food Costs" />
                {data.costOfSales.foodCost!.accounts.map(a => <AcctRow key={a.accountNumber} a={a} color="var(--warning)" indent />)}</>
              )}
              {(data.costOfSales.laborCost?.accounts.length ?? 0) > 0 && (
                <><DividerRow label="Direct Labor" />
                {data.costOfSales.laborCost!.accounts.map(a => <AcctRow key={a.accountNumber} a={a} color="var(--accent-strong)" indent />)}</>
              )}
            </>
          ) : (
            data.costOfSales.accounts.map(a => <AcctRow key={a.accountNumber} a={a} color="var(--warning)" />)
          )}

          <SubtotalRow label="Gross Profit" value={data.grossProfit} color="var(--success)" pct={fmtPct(data.grossMarginPct)} />

          {/* SG&A */}
          {structured ? (
            <>
              <SectionRow label="SG&A — Selling, General & Administrative" total={data.sga!.total} color="var(--danger)" />
              {(data.sga!.selling?.accounts.length ?? 0) > 0 && (
                <><DividerRow label="Selling Expenses" />
                {data.sga!.selling!.accounts.map(a => <AcctRow key={a.accountNumber} a={a} color="var(--danger)" indent />)}</>
              )}
              {(data.sga!.admin?.accounts.length ?? 0) > 0 && (
                <><DividerRow label="General & Administrative" />
                {data.sga!.admin!.accounts.map(a => <AcctRow key={a.accountNumber} a={a} color="var(--danger)" indent />)}</>
              )}
              <SubtotalRow label="EBIT — Operating Income" value={data.ebit ?? 0} color="var(--accent-blue)" pct={fmtPct(data.ebitMarginPct)} />

              {(data.depreciation?.total ?? 0) > 0 && (
                <>
                  <SectionRow label="Depreciation & Amortization" total={data.depreciation!.total} color="rgba(255,255,255,0.35)" />
                  {data.depreciation!.accounts.map(a => <AcctRow key={a.accountNumber} a={a} color="rgba(255,255,255,0.5)" />)}
                </>
              )}
              <SubtotalRow label="EBITDA" value={data.ebitda ?? 0} color="var(--accent-violet)" pct={fmtPct(data.ebitdaMarginPct)} />

              {(data.financial?.total ?? 0) > 0 && (
                <>
                  <SectionRow label="Financial Expenses" total={data.financial!.total} color="var(--danger)" />
                  {data.financial!.accounts.map(a => <AcctRow key={a.accountNumber} a={a} color="var(--danger)" />)}
                </>
              )}
              <SubtotalRow label="EBT — Earnings Before Tax" value={data.ebt ?? 0} color="var(--accent-blue)" />

              {(data.tax?.total ?? 0) > 0 && (
                <>
                  <SectionRow label="Income Tax" total={data.tax!.total} color="var(--danger)" />
                  {data.tax!.accounts.map(a => <AcctRow key={a.accountNumber} a={a} color="var(--danger)" />)}
                </>
              )}
            </>
          ) : (
            <>
              <SectionRow label="Operating Expenses" total={data.expenses.total} color="var(--danger)" />
              {data.expenses.accounts.map(a => <AcctRow key={a.accountNumber} a={a} color="var(--danger)" />)}
            </>
          )}

          <TotalRow label="Net Income" value={data.netIncome} pct={fmtPct(data.netMarginPct)} highlight />
        </tbody>
      </table>
    </div>
  );
}

function BSView({ data }: { data: BalanceSheetReport }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>As of {fmtDate(data.asOfDate)}</span>
        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20,
          color: data.isBalanced ? 'var(--success)' : 'var(--danger)',
          background: data.isBalanced ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)',
          border: `0.5px solid ${data.isBalanced ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)'}` }}>
          {data.isBalanced ? '✓ Balanced' : '✗ Not balanced'}
        </span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>
          <th style={{ ...TH, width: 120 }}>Account #</th>
          <th style={TH}>Account Name</th>
          <th style={{ ...TH, textAlign: 'right' }}>Amount</th>
        </tr></thead>
        <tbody>
          <SectionRow label="Assets" total={data.assets.total} color="var(--accent-blue)" />
          {data.assets.accounts.map(a => (
            <tr key={a.accountNumber}>
              <td style={{ ...TD, ...MONO, color: 'var(--accent-strong)' }}>{a.accountNumber}</td>
              <td style={{ ...TD, color: 'var(--text-primary)' }}>{a.accountName}</td>
              <td style={{ ...TD, textAlign: 'right', ...MONO, color: 'var(--accent-blue)' }}>{fmtAmt(a.amount ?? 0)}</td>
            </tr>
          ))}
          <SectionRow label="Liabilities" total={data.liabilities.total} color="var(--danger)" />
          {data.liabilities.accounts.length === 0
            ? <tr><td colSpan={3} style={{ ...TD, color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>No liability accounts</td></tr>
            : data.liabilities.accounts.map(a => (
              <tr key={a.accountNumber}>
                <td style={{ ...TD, ...MONO, color: 'var(--accent-strong)' }}>{a.accountNumber}</td>
                <td style={{ ...TD, color: 'var(--text-primary)' }}>{a.accountName}</td>
                <td style={{ ...TD, textAlign: 'right', ...MONO, color: 'var(--danger)' }}>{fmtAmt(a.amount ?? 0)}</td>
              </tr>
            ))
          }
          <SectionRow label="Equity" total={data.equity.total} color="var(--accent-violet)" />
          {data.equity.accounts.length === 0
            ? <tr><td colSpan={3} style={{ ...TD, color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>No equity accounts</td></tr>
            : data.equity.accounts.map(a => (
              <tr key={`${a.accountNumber}-${a.accountName}`}>
                <td style={{ ...TD, ...MONO, color: 'var(--accent-strong)' }}>{a.accountNumber}</td>
                <td style={{ ...TD, color: 'var(--text-primary)' }}>{a.accountName}</td>
                <td style={{ ...TD, textAlign: 'right', ...MONO, color: 'var(--accent-violet)' }}>{fmtAmt(a.amount ?? 0)}</td>
              </tr>
            ))
          }
          <TotalRow label="Total Liabilities & Equity" value={data.totalLiabilitiesAndEquity} highlight />
        </tbody>
      </table>
    </div>
  );
}

function TBView({ data }: { data: TrialBalanceReport }) {
  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>As of {fmtDate(data.asOfDate)}</span>
        <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20,
          color: data.totals.isBalanced ? 'var(--success)' : 'var(--danger)',
          background: data.totals.isBalanced ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)',
          border: `0.5px solid ${data.totals.isBalanced ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)'}` }}>
          {data.totals.isBalanced ? '✓ Balanced' : '✗ Not balanced'}
        </span>
      </div>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead><tr>
          <th style={{ ...TH, width: 120 }}>Account #</th>
          <th style={TH}>Account Name</th>
          <th style={{ ...TH, width: 80 }}>Type</th>
          <th style={{ ...TH, textAlign: 'right' }}>Total Debits</th>
          <th style={{ ...TH, textAlign: 'right' }}>Total Credits</th>
          <th style={{ ...TH, textAlign: 'right' }}>Net Balance</th>
        </tr></thead>
        <tbody>
          {data.accounts.map(a => (
            <tr key={a.accountNumber}>
              <td style={{ ...TD, ...MONO, color: 'var(--accent-strong)' }}>{a.accountNumber}</td>
              <td style={{ ...TD, color: 'var(--text-primary)' }}>{a.accountName}</td>
              <td style={{ ...TD, color: 'rgba(255,255,255,0.4)', fontSize: 11 }}>
                {a.accountType ? a.accountType.charAt(0).toUpperCase() + a.accountType.slice(1) : '—'}
              </td>
              <td style={{ ...TD, textAlign: 'right', ...MONO, color: 'var(--text-primary)' }}>{fmtAmt(a.totalDebits ?? 0)}</td>
              <td style={{ ...TD, textAlign: 'right', ...MONO, color: 'rgba(255,255,255,0.55)' }}>{fmtAmt(a.totalCredits ?? 0)}</td>
              <td style={{ ...TD, textAlign: 'right', ...MONO, fontWeight: 500,
                color: (a.netBalance ?? 0) >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                {fmtAmt(a.netBalance ?? 0, true)}
              </td>
            </tr>
          ))}
          <tr style={{ background: 'rgba(251,146,60,0.05)', borderTop: '0.5px solid rgba(255,255,255,0.1)' }}>
            <td colSpan={3} style={{ ...TD, fontWeight: 600, color: 'var(--accent-strong)', borderTop: 'none' }}>TOTALS</td>
            <td style={{ ...TD, textAlign: 'right', ...MONO, fontWeight: 600, color: 'var(--text-primary)', borderTop: 'none' }}>{fmtAmt(data.totals.totalDebits, true)}</td>
            <td style={{ ...TD, textAlign: 'right', ...MONO, fontWeight: 600, color: 'rgba(255,255,255,0.55)', borderTop: 'none' }}>{fmtAmt(data.totals.totalCredits, true)}</td>
            <td style={{ ...TD, textAlign: 'right', ...MONO, fontWeight: 600, borderTop: 'none',
              color: data.totals.difference === 0 ? 'var(--success)' : 'var(--danger)' }}>
              {fmtAmt(data.totals.difference, true)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function GLView({ data }: { data: GLReport }) {
  const grouped = data.entries.reduce((acc, e) => {
    if (!acc[e.accountNumber]) acc[e.accountNumber] = { name: e.accountName, entries: [] };
    acc[e.accountNumber].entries.push(e);
    return acc;
  }, {} as Record<string, { name: string; entries: GLEntry[] }>);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {Object.entries(grouped).map(([acctNum, group]) => {
        const totalDebit  = group.entries.reduce((s, e) => s + e.debit,  0);
        const totalCredit = group.entries.reduce((s, e) => s + e.credit, 0);
        return (
          <div key={acctNum}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, padding: '6px 14px',
              background: 'rgba(251,146,60,0.06)', borderRadius: '8px 8px 0 0',
              border: '0.5px solid rgba(251,146,60,0.15)', borderBottom: 'none' }}>
              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, color: 'var(--accent-strong)', fontWeight: 500 }}>{acctNum}</span>
              <span style={{ fontSize: 13, color: 'var(--text-strong)', fontWeight: 500 }}>{group.name}</span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr>
                <th style={{ ...TH, width: 120 }}>Date</th>
                <th style={{ ...TH, width: 160 }}>Entry #</th>
                <th style={TH}>Description</th>
                <th style={{ ...TH, textAlign: 'right', width: 160 }}>Debit</th>
                <th style={{ ...TH, textAlign: 'right', width: 160 }}>Credit</th>
              </tr></thead>
              <tbody>
                {group.entries.map((e, idx) => (
                  <tr key={idx}>
                    <td style={{ ...TD, color: 'rgba(255,255,255,0.5)', fontSize: 12 }}>{fmtDate(e.date)}</td>
                    <td style={{ ...TD, ...MONO, color: 'var(--accent-strong)', fontSize: 11 }}>{e.entryNumber}</td>
                    <td style={{ ...TD, color: 'var(--text-primary)' }}>{e.description}</td>
                    <td style={{ ...TD, textAlign: 'right', ...MONO, color: e.debit > 0 ? 'var(--text-primary)' : 'rgba(255,255,255,0.2)' }}>{fmtAmt(e.debit)}</td>
                    <td style={{ ...TD, textAlign: 'right', ...MONO, color: e.credit > 0 ? 'rgba(255,255,255,0.55)' : 'rgba(255,255,255,0.2)' }}>{fmtAmt(e.credit)}</td>
                  </tr>
                ))}
                <tr style={{ background: 'rgba(255,255,255,0.02)', borderTop: '0.5px solid rgba(255,255,255,0.08)' }}>
                  <td colSpan={3} style={{ ...TD, fontSize: 11, color: 'rgba(255,255,255,0.3)', fontWeight: 500, borderTop: 'none' }}>Account Total</td>
                  <td style={{ ...TD, textAlign: 'right', ...MONO, fontWeight: 500, color: 'var(--text-primary)', borderTop: 'none' }}>{fmtAmt(totalDebit, true)}</td>
                  <td style={{ ...TD, textAlign: 'right', ...MONO, fontWeight: 500, color: 'rgba(255,255,255,0.55)', borderTop: 'none' }}>{fmtAmt(totalCredit, true)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        );
      })}
    </div>
  );
}

const TAB_CONFIG: { key: ReportTab; label: string; desc: string }[] = [
  { key: 'pl', label: 'P&L Statement',  desc: 'Profit & Loss'      },
  { key: 'bs', label: 'Balance Sheet',  desc: 'Financial Position' },
  { key: 'tb', label: 'Trial Balance',  desc: 'Account Balances'   },
  { key: 'gl', label: 'General Ledger', desc: 'Transaction Detail' },
];

export default function FinancialReportsPage() {
  const [tab, setTab] = useState<ReportTab>('pl');
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const t = new URLSearchParams(window.location.search).get('tab') as ReportTab | null;
      if (t && ['pl','bs','tb','gl'].includes(t)) setTab(t);
    }
  }, []);

  const [filters, setFilters] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [plData,  setPLData]  = useState<PLReport | null>(null);
  const [bsData,  setBSData]  = useState<BalanceSheetReport | null>(null);
  const [tbData,  setTBData]  = useState<TrialBalanceReport | null>(null);
  const [glData,  setGLData]  = useState<GLReport | null>(null);

  const runReport = useCallback(async () => {
    setLoading(true); setError('');
    const params = Object.fromEntries(Object.entries(filters).filter(([,v]) => v.trim() !== ''));
    try {
      if (tab === 'pl') setPLData(await financialReportsApi.getProfitAndLoss(params) as PLReport);
      else if (tab === 'bs') setBSData(await financialReportsApi.getBalanceSheet(params));
      else if (tab === 'tb') setTBData(await financialReportsApi.getTrialBalance(params));
      else if (tab === 'gl') setGLData(await financialReportsApi.getGeneralLedger(params));
    } catch (err) {
      setError((err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Failed to load report.');
    } finally { setLoading(false); }
  }, [tab, filters]);

  const hasData = { pl: plData, bs: bsData, tb: tbData, gl: glData }[tab] !== null;

  return (
    <ERPShell breadcrumbs={['Home', 'Financial', 'Reports']} title="Financial Reports">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&display=swap');
        .fr-page { padding: 0 18px 24px; }
        .fr-tabs { display:flex; gap:0; margin-bottom:16px; border-bottom:0.5px solid rgba(255,255,255,0.08); }
        .fr-tab { padding:8px 16px; font-size:12px; font-weight:500; cursor:pointer; color:rgba(255,255,255,0.4);
          border-bottom:2px solid transparent; transition:color 0.15s,border-color 0.15s; user-select:none;
          font-family:'IBM Plex Sans',sans-serif; white-space:nowrap; }
        .fr-tab:hover { color:rgba(255,255,255,0.7); }
        .fr-tab-active { color:var(--accent-strong) !important; border-bottom-color:var(--accent-strong) !important; }
        .fr-wrap { background:rgba(10,7,18,0.7); border:0.5px solid rgba(251,146,60,0.12);
          border-radius:10px; overflow:hidden; padding:16px; width:100%; box-sizing:border-box; }
        .fr-empty { text-align:center; padding:52px 24px; color:rgba(255,255,255,0.25); font-size:13px;
          display:flex; flex-direction:column; align-items:center; gap:10px; }
        .fr-spinner { width:18px; height:18px; border-radius:50%;
          border:2px solid rgba(251,146,60,0.2); border-top-color:var(--accent-strong);
          animation:fr-spin 0.7s linear infinite; }
        @keyframes fr-spin { to { transform:rotate(360deg); } }
        .fr-error { background:rgba(239,68,68,0.08); border:0.5px solid rgba(239,68,68,0.2);
          border-radius:8px; padding:10px 14px; margin-bottom:14px; font-size:13px; color:var(--danger-subtle); }
        tbody tr:hover td { background: rgba(251,146,60,0.025); }
      `}</style>

      <div className="fr-page">
        <div className="fr-tabs">
          {TAB_CONFIG.map(t => (
            <div key={t.key} className={`fr-tab${tab === t.key ? ' fr-tab-active' : ''}`} onClick={() => setTab(t.key)}>
              {t.label}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          {[
            { key: 'startDate', label: 'Start Date', type: 'date' },
            { key: 'endDate',   label: 'End Date',   type: 'date' },
            { key: 'fiscalPeriod', label: 'Fiscal Period', type: 'text', placeholder: '2026-03' },
          ].map(f => (
            <div key={f.key} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase',
                color: 'rgba(251,146,60,0.6)', fontFamily: "'IBM Plex Sans',sans-serif" }}>{f.label}</label>
              <input type={f.type} placeholder={f.placeholder} value={filters[f.key] ?? ''}
                onChange={e => setFilters(p => ({ ...p, [f.key]: e.target.value }))}
                style={{ background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.1)',
                  borderRadius: 7, padding: '7px 12px', fontSize: 12,
                  fontFamily: "'IBM Plex Sans',sans-serif", color: 'var(--text-primary)', outline: 'none', width: 140 }} />
            </div>
          ))}
          <button onClick={runReport} disabled={loading} style={{
            background: 'linear-gradient(135deg,var(--accent-pressed),var(--accent),var(--accent-mid))', border: 'none',
            borderRadius: 7, padding: '7px 16px', fontSize: 12, fontWeight: 500,
            fontFamily: "'IBM Plex Sans',sans-serif", color: 'white', cursor: 'pointer',
            boxShadow: '0 3px 12px rgba(234,88,12,0.3)', opacity: loading ? 0.6 : 1, alignSelf: 'flex-end' }}>
            {loading ? 'Loading…' : 'Run Report'}
          </button>
        </div>

        {error && <div className="fr-error">{error}</div>}

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