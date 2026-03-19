"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ERPShell from '@/components/layout/ERPShell';
import { financialReportsApi } from '@/lib/api/financial-reports';
import { salesOrdersApi }      from '@/lib/api/sales-orders';
import { purchaseOrdersApi }   from '@/lib/api/purchase-orders';
import { cashFlowApi }         from '@/lib/api/cash-flow';

// ─── Chart data types ─────────────────────────────────────────────────────────

interface WeekPoint { label: string; revenue: number; expenses: number; income: number }

// ─── Types ────────────────────────────────────────────────────────────────────

interface KpiRow {
  indicator: string;
  period: string;
  current: string;
  previous: string;
  change: string;
  positive: boolean;
}

interface FinRow {
  indicator: string;
  today: string;
  thisWeek: string;
  thisMonth: string;
  lastMonth: string;
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtK(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

// ─── Static fin rows (period comparison unavailable without history) ───────────

const FIN_ROWS_STATIC: FinRow[] = [
  { indicator: 'Bank Balance',   today: '—', thisWeek: '—', thisMonth: '—', lastMonth: '—' },
  { indicator: 'Revenue',        today: '—', thisWeek: '—', thisMonth: '—', lastMonth: '—' },
  { indicator: 'Cost of Goods',  today: '—', thisWeek: '—', thisMonth: '—', lastMonth: '—' },
  { indicator: 'Gross Margin',   today: '—', thisWeek: '—', thisMonth: '—', lastMonth: '—' },
  { indicator: 'Gross Margin %', today: '—', thisWeek: '—', thisMonth: '—', lastMonth: '—' },
  { indicator: 'Expenses',       today: '—', thisWeek: '—', thisMonth: '—', lastMonth: '—' },
];

// ─── Quick Access — with correct tab deep links ────────────────────────────────

const QUICK_ACCESS = [
  { label: 'Balance Sheet',    color: '#fb923c', bg: 'rgba(251,146,60,0.12)',  border: 'rgba(251,146,60,0.2)',   href: '/accounting/reports?tab=bs' },
  { label: 'Trial Balance',    color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',   border: 'rgba(96,165,250,0.18)', href: '/accounting/reports?tab=tb' },
  { label: 'Income Statement', color: '#4ade80', bg: 'rgba(74,222,128,0.1)',   border: 'rgba(74,222,128,0.18)', href: '/accounting/reports?tab=pl' },
  { label: 'Budget vs Actual', color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.18)',href: '/accounting/budgets' },
];

// ─── Mini charts — data driven ───────────────────────────────────────────────

function MiniBarChart({ values, color = '#fb923c' }: { values?: number[]; color?: string }) {
  // Fallback static data while loading
  const pts = values && values.length > 0 ? values : [52,48,55,50,58,54,60,56,62,59,65,61,70,68,74,72,78,75,80,76,82,79,85];
  const max = Math.max(...pts, 1);
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 60 }}>
      {pts.map((v, i) => (
        <div key={i} style={{
          width: 6, height: `${Math.max((v / max) * 100, 3)}%`,
          background: i === pts.length - 1 ? color : `${color}66`,
          borderRadius: '2px 2px 0 0', flex: '0 0 auto',
          transition: 'height 0.3s ease',
        }} />
      ))}
    </div>
  );
}

function MiniLineChart({ values, color = '#4ade80' }: { values?: number[]; color?: string }) {
  const pts = values && values.length > 1 ? values : [40,38,42,36,44,40,46,42,50,46,52,48,56,50,58,52,60,54,64,58,68,62,72];
  const w = 220, h = 60;
  const max = Math.max(...pts, 1);
  const min = Math.min(...pts, 0);
  const range = max - min || 1;
  const xs = pts.map((_, i) => (i / (pts.length - 1)) * w);
  const ys = pts.map(v => h - ((v - min) / range) * (h * 0.85) - h * 0.05);
  const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
  const area = d + ` L${w},${h} L0,${h} Z`;
  const gradId = `lg-${color.replace('#','')}`;
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ height: 60 }}>
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${gradId})`} />
      <path d={d} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Portlet ──────────────────────────────────────────────────────────────────

function Portlet({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'rgba(10,7,18,0.85)',
      border: '0.5px solid rgba(251,146,60,0.14)',
      borderRadius: 12, overflow: 'hidden',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{
        background: 'rgba(251,146,60,0.08)',
        borderBottom: '0.5px solid rgba(251,146,60,0.12)',
        padding: '8px 14px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontSize: 12, fontWeight: 500, color: '#fb923c', letterSpacing: '0.04em', fontFamily: "'IBM Plex Sans', sans-serif" }}>
          {title}
        </span>
        <div style={{ display: 'flex', gap: 6 }}>
          {['+','≡'].map(s => (
            <div key={s} style={{
              width: 16, height: 16, borderRadius: 4,
              background: 'rgba(255,255,255,0.06)', cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 10, color: 'rgba(255,255,255,0.4)',
            }}>{s}</div>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, padding: '12px 14px' }}>{children}</div>
    </div>
  );
}

// ─── Delta badge ──────────────────────────────────────────────────────────────

function Delta({ value, positive }: { value: string; positive: boolean }) {
  if (value === 'N/A') return (
    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.06)', padding: '2px 7px', borderRadius: 20 }}>N/A</span>
  );
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      fontSize: 11, fontWeight: 500,
      color: positive ? '#4ade80' : '#f87171',
      background: positive ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)',
      border: `0.5px solid ${positive ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)'}`,
      padding: '2px 7px', borderRadius: 20,
    }}>
      {positive ? '▲' : '▼'} {value}
    </span>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function Sk({ w = 70 }: { w?: number }) {
  return <span style={{ display: 'inline-block', width: w, height: 10, borderRadius: 4, background: 'rgba(255,255,255,0.08)', animation: 'db-pulse 1.2s ease-in-out infinite' }} />;
}

// ─── Dashboard content ────────────────────────────────────────────────────────

function DashboardContent() {
  const router = useRouter();

  // ── Period config ──
  // selYear: 2026 | 2025
  // selMonth: 0 = all year, 1-12 = specific month
  // ytd: if true, from Jan to current month of selYear
  const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const _now        = new Date();
  const TODAY_YEAR  = _now.getFullYear();
  const TODAY_MONTH = _now.getMonth() + 1; // 1-based

  function buildDates(year: number, month: number, ytd: boolean) {
    const py = year - 1;
    if (ytd) {
      // Jan 1 → Mar 31 of selected year vs same period prev year
      const endM   = TODAY_MONTH;
      const endDay = new Date(year, endM, 0).getDate();
      const pEndDay = new Date(py, endM, 0).getDate();
      return {
        start:     `${year}-01-01`,
        end:       `${year}-${String(endM).padStart(2,'0')}-${String(endDay).padStart(2,'0')}`,
        prevStart: `${py}-01-01`,
        prevEnd:   `${py}-${String(endM).padStart(2,'0')}-${String(pEndDay).padStart(2,'0')}`,
        label:     `YTD ${year} vs YTD ${py}`,
      };
    }
    if (month === 0) {
      return {
        start: `${year}-01-01`, end: `${year}-12-31`,
        prevStart: `${py}-01-01`, prevEnd: `${py}-12-31`,
        label: `${year} vs ${py}`,
      };
    }
    const mm       = String(month).padStart(2,'0');
    const lastDay  = new Date(year, month, 0).getDate();
    const pLastDay = new Date(py, month, 0).getDate();
    return {
      start:     `${year}-${mm}-01`,
      end:       `${year}-${mm}-${String(lastDay).padStart(2,'0')}`,
      prevStart: `${py}-${mm}-01`,
      prevEnd:   `${py}-${mm}-${String(pLastDay).padStart(2,'0')}`,
      label:     `${MONTH_NAMES[month-1]} ${year} vs ${MONTH_NAMES[month-1]} ${py}`,
    };
  }

  // ── Live data state ──
  const [selYear,  setSelYear]  = useState(() => new Date().getFullYear());
  const [selMonth, setSelMonth] = useState(0);   // 0 = full year
  const [ytd,      setYtd]      = useState(false);
  const [loading,    setLoading]    = useState(true);
  const [kpiRows,    setKpiRows]    = useState<KpiRow[]>([]);
  const [heroes,     setHeroes]     = useState<{ label: string; value: string; color: string; up: boolean }[]>([]);
  const [finHeroes,  setFinHeroes]  = useState<{ label: string; value: string }[]>([]);
  const [finRows,    setFinRows]    = useState<FinRow[]>(FIN_ROWS_STATIC);
  const [revPoints,  setRevPoints]  = useState<number[]>([]);
  const [expPoints,  setExpPoints]  = useState<number[]>([]);
  const [incPoints,  setIncPoints]  = useState<number[]>([]);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const pd = buildDates(selYear, selMonth, ytd);
      // period label derived from pd.label
      const params = `?startDate=${pd.start}&endDate=${pd.end}`;
      const prevParams = pd.prevStart ? `?startDate=${pd.prevStart}&endDate=${pd.prevEnd}` : params;
      try {
        const [pl, plPrev, tb, soRaw, poRaw, cfRaw, gl] = await Promise.all([
          financialReportsApi.getProfitAndLoss({ startDate: pd.start, endDate: pd.end }),
          financialReportsApi.getProfitAndLoss({ startDate: pd.prevStart || pd.start, endDate: pd.prevEnd || pd.end }),
          financialReportsApi.getTrialBalance(),
          salesOrdersApi.getAll(),
          purchaseOrdersApi.getAll(),
          cashFlowApi.getAll(),
          financialReportsApi.getGeneralLedger({ startDate: pd.start, endDate: pd.end }),
        ]);

        // Trial balance
        type TBAccount = { accountNumber: string; netBalance: number; accountType: string };
        const tbAccounts = (tb as { accounts: TBAccount[] }).accounts ?? [];
        const cashInBank = tbAccounts.find(a => a.accountNumber === '1.1.02')?.netBalance ?? 0;
        const ar         = Math.abs(tbAccounts.find(a => a.accountNumber === '1.1.03')?.netBalance ?? 0);

        // P&L current and previous
        type PLData = { revenue: { total: number }; costOfSales: { total: number }; grossProfit: number; expenses: { total: number }; netIncome: number };
        const plData     = pl     as PLData;
        const plPrevData = plPrev as PLData;
        const revenue    = plData.revenue?.total   ?? 0;
        const expenses   = plData.expenses?.total  ?? 0;
        const netIncome  = plData.netIncome        ?? 0;
        const cosTotal   = plData.costOfSales?.total ?? 0;
        const prevRev    = plPrevData.revenue?.total   ?? 0;
        const prevExp    = plPrevData.expenses?.total  ?? 0;
        const prevNI     = plPrevData.netIncome        ?? 0;
        const prevCoS    = plPrevData.costOfSales?.total ?? 0;
        const pctChg = (cur: number, prev: number) => prev > 0 ? ((cur-prev)/prev*100).toFixed(1)+'%' : '—';

        // Orders
        type OItem = { total: string; status: string };
        const sos = soRaw as OItem[];
        const pos = poRaw as OItem[];
        const openSOValue  = sos.filter(o => o.status !== 'closed').reduce((s, o) => s + Number(o.total), 0);
        const pendingPOVal = pos.filter(o => o.status === 'approved').reduce((s, o) => s + Number(o.total), 0);

        // Cash flow
        type CFLine = { lineType: string; amount: string };
        type CFProj = { cashFlowLines?: CFLine[] };
        const allLines     = (cfRaw as CFProj[]).flatMap(p => p.cashFlowLines ?? []);
        const projInflow   = allLines.filter(l => l.lineType === 'inflow').reduce((s, l)  => s + Number(l.amount), 0);
        const projOutflow  = allLines.filter(l => l.lineType === 'outflow').reduce((s, l) => s + Number(l.amount), 0);
        const projNet      = projInflow - projOutflow;

        // ── Weekly chart points from General Ledger ──
        type GLEntry = { date: string; accountNumber: string; debit: number; credit: number };
        const glData = gl as { entries?: GLEntry[] };
        const glEntries = glData.entries ?? [];

        // Group by ISO week (Mon-Sun), collect revenue credits (4xxx) and expense debits (5xxx)
        const weekMap: Record<string, { revenue: number; expenses: number }> = {};
        glEntries.forEach(e => {
          const d = new Date(e.date);
          // Get Monday of that week
          const day = d.getDay();
          const diff = (day === 0 ? -6 : 1 - day);
          const mon = new Date(d);
          mon.setDate(d.getDate() + diff);
          const key = mon.toISOString().split('T')[0];
          if (!weekMap[key]) weekMap[key] = { revenue: 0, expenses: 0 };
          if (e.accountNumber.startsWith('4')) weekMap[key].revenue  += e.credit;
          if (e.accountNumber.startsWith('5')) weekMap[key].expenses += e.debit;
        });

        const weeks = Object.keys(weekMap).sort();
        const revPts = weeks.map(w => weekMap[w].revenue);
        const expPts = weeks.map(w => weekMap[w].expenses);
        const incPts = weeks.map(w => weekMap[w].revenue - weekMap[w].expenses);

        if (revPts.length > 0) {
          setRevPoints(revPts);
          setExpPoints(expPts);
          setIncPoints(incPts);
        }

        // ── KPI heroes with YoY ──
        setHeroes([
          { label: 'Revenue',      value: fmtK(revenue),   color: '#4ade80',   up: revenue >= prevRev  },
          { label: 'Expenses',     value: fmtK(expenses),  color: '#f87171',   up: false               },
          { label: 'Net Income',   value: fmtK(netIncome), color: netIncome >= 0 ? '#4ade80' : '#f87171', up: netIncome >= prevNI },
          { label: 'Bank Balance', value: fmtK(cashInBank),color: '#60a5fa',   up: cashInBank > 0      },
        ]);

        // ── KPI rows with YoY comparison ──
        setKpiRows([
          { indicator: 'Revenue',             period: pd.label, current: fmtK(revenue),     previous: fmtK(prevRev),  change: pctChg(revenue,prevRev),   positive: revenue >= prevRev   },
          { indicator: 'Cost of Sales',       period: pd.label, current: fmtK(cosTotal),    previous: fmtK(prevCoS),  change: pctChg(cosTotal,prevCoS),  positive: cosTotal <= prevCoS  },
          { indicator: 'Gross Profit',        period: pd.label, current: fmtK(revenue-cosTotal), previous: fmtK(prevRev-prevCoS), change: pctChg(revenue-cosTotal,prevRev-prevCoS), positive: (revenue-cosTotal)>=(prevRev-prevCoS) },
          { indicator: 'Net Income',          period: pd.label, current: fmtK(netIncome),   previous: fmtK(prevNI),   change: pctChg(netIncome,prevNI),  positive: netIncome >= prevNI  },
          { indicator: 'Expenses',            period: pd.label, current: fmtK(expenses),    previous: fmtK(prevExp),  change: pctChg(expenses,prevExp),  positive: expenses <= prevExp  },
          { indicator: 'Bank Balance',        period: 'Account 1.1.02', current: fmtK(cashInBank), previous: '—', change: cashInBank > 0 ? 'LIVE' : 'N/A', positive: cashInBank > 0 },
        ]);

        // ── Fin heroes ──
        const grossMarginPct = revenue > 0 ? ((revenue - (plData.costOfSales?.total ?? 0)) / revenue * 100).toFixed(1) + '%' : 'N/A';
        const netPct         = revenue > 0 ? (netIncome / revenue * 100).toFixed(1) + '%' : 'N/A';
        setFinHeroes([
          { label: 'Gross Margin %',        value: grossMarginPct },
          { label: 'Net Income % of Sales', value: netPct },
          { label: 'Bank Balance',          value: fmtK(cashInBank) },
          { label: 'Proj. CF Net',          value: fmtK(projNet) },
        ]);

        // ── Fin rows — current period vs previous period ──
        const prevGM     = prevRev > 0 ? ((prevRev-prevCoS)/prevRev*100).toFixed(1)+'%' : '—';
        setFinRows([
          { indicator: 'Bank Balance',   today: '—', thisWeek: '—', thisMonth: fmtK(cashInBank),       lastMonth: '—'          },
          { indicator: 'Revenue',        today: '—', thisWeek: '—', thisMonth: fmtK(revenue),          lastMonth: fmtK(prevRev) },
          { indicator: 'Cost of Goods',  today: '—', thisWeek: '—', thisMonth: fmtK(cosTotal),         lastMonth: fmtK(prevCoS) },
          { indicator: 'Gross Margin',   today: '—', thisWeek: '—', thisMonth: fmtK(revenue-cosTotal), lastMonth: fmtK(prevRev-prevCoS) },
          { indicator: 'Gross Margin %', today: '—', thisWeek: '—', thisMonth: grossMarginPct,         lastMonth: prevGM        },
          { indicator: 'Expenses',       today: '—', thisWeek: '—', thisMonth: fmtK(expenses),         lastMonth: fmtK(prevExp) },
        ]);

      } catch { /* non-blocking — keeps placeholders */ }
      finally { setLoading(false); }
    };
    load();
  }, [selYear, selMonth, ytd]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap');
        @keyframes db-pulse { 0%,100%{opacity:0.35} 50%{opacity:0.75} }

        .db-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 10px 18px 8px;
        }
        .db-title  { font-size: 15px; font-weight: 500; color: #f1ede8; }
        .db-actions { display: flex; align-items: center; gap: 6px; font-size: 12px; }
        .db-action-link { color: rgba(251,146,60,0.55); cursor: pointer; transition: color 0.15s; }
        .db-action-link:hover { color: #fb923c; }
        .db-sep { color: rgba(255,255,255,0.15); }

        .portlet-grid {
          display: grid;
          grid-template-columns: 280px 1fr 280px;
          gap: 10px;
          padding: 0 18px 18px;
          align-items: start;
        }

        .quick-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .quick-item {
          display: flex; flex-direction: column; align-items: center;
          justify-content: center; gap: 6px; padding: 14px 8px;
          border-radius: 8px; cursor: pointer;
          transition: opacity 0.15s, transform 0.15s;
          text-align: center; border: 0.5px solid transparent;
        }
        .quick-item:hover { opacity: 0.85; transform: translateY(-1px); }
        .quick-icon {
          width: 32px; height: 32px; border-radius: 8px;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .quick-icon svg { width: 16px; height: 16px; display: block; flex-shrink: 0; }
        .quick-label { font-size: 11px; font-weight: 500; line-height: 1.3; }

        .kpi-heroes {
          display: grid; grid-template-columns: repeat(4,1fr);
          gap: 1px; background: rgba(255,255,255,0.05);
          border-radius: 6px; overflow: hidden; margin-bottom: 12px;
        }
        .kpi-hero { background: rgba(10,7,18,0.6); padding: 10px 14px; }
        .kpi-hero-label { font-size: 10px; color: rgba(255,255,255,0.4); letter-spacing: 0.06em; text-transform: uppercase; }
        .kpi-hero-value { font-size: 22px; font-weight: 500; line-height: 1; display: flex; align-items: center; gap: 6px; margin-top: 2px; }

        .kpi-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .kpi-table thead th {
          font-size: 10px; font-weight: 500; letter-spacing: 0.08em;
          text-transform: uppercase; color: rgba(251,146,60,0.5);
          padding: 5px 8px; border-bottom: 0.5px solid rgba(255,255,255,0.07); text-align: left; white-space: nowrap;
        }
        .kpi-table tbody td { padding: 7px 8px; border-bottom: 0.5px solid rgba(255,255,255,0.04); color: rgba(255,255,255,0.7); vertical-align: middle; white-space: nowrap; }
        .kpi-table tbody td.indicator { font-weight: 500; color: #e2dfd8; }
        .kpi-table tbody td.period    { color: rgba(251,146,60,0.55); font-size: 11px; }
        .kpi-table tbody td.mono      { font-family: 'IBM Plex Mono', monospace; font-size: 11px; }
        .kpi-table tbody tr:last-child td { border-bottom: none; }
        .kpi-table tbody tr:hover td { background: rgba(251,146,60,0.04); }

        .fin-heroes {
          display: grid; grid-template-columns: repeat(4,1fr);
          gap: 1px; background: rgba(255,255,255,0.05);
          border-radius: 6px; overflow: hidden; margin-bottom: 12px;
        }
        .fin-hero { background: rgba(10,7,18,0.6); padding: 10px 12px; }
        .fin-hero-label { font-size: 10px; color: rgba(255,255,255,0.35); letter-spacing: 0.05em; margin-bottom: 3px; }
        .fin-hero-value { font-size: 18px; font-weight: 500; color: #f1ede8; font-family: 'IBM Plex Mono', monospace; }

        .fin-table { width: 100%; border-collapse: collapse; font-size: 11px; }
        .fin-table thead th {
          font-size: 10px; font-weight: 500; letter-spacing: 0.08em;
          text-transform: uppercase; color: rgba(251,146,60,0.5);
          padding: 5px 8px; border-bottom: 0.5px solid rgba(255,255,255,0.07);
          text-align: right;
        }
        .fin-table thead th:first-child { text-align: left; }
        .fin-table tbody td {
          padding: 6px 8px; border-bottom: 0.5px solid rgba(255,255,255,0.04);
          color: rgba(255,255,255,0.65); text-align: right;
          font-family: 'IBM Plex Mono', monospace; font-size: 11px;
        }
        .fin-table tbody td:first-child { font-family: 'IBM Plex Sans', sans-serif; font-size: 12px; color: #e2dfd8; text-align: left; }
        .fin-table tbody tr:last-child td { border-bottom: none; }
        .fin-table tbody tr:hover td { background: rgba(251,146,60,0.04); }

        .period-select {
          background: rgba(255,255,255,0.05); border: 0.5px solid rgba(255,255,255,0.1);
          border-radius: 5px; color: rgba(255,255,255,0.6);
          font-size: 11px; font-family: 'IBM Plex Sans', sans-serif;
          padding: 3px 6px; outline: none; cursor: pointer;
        }
        .chart-title    { font-size: 12px; font-weight: 500; color: rgba(255,255,255,0.7); text-align: center; margin-bottom: 2px; }
        .chart-subtitle { font-size: 10px; color: rgba(255,255,255,0.3); text-align: center; margin-bottom: 8px; }
      `}</style>

      {/* Page header */}
      <div className="db-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="db-title">Home</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>

            {/* ── Year selector ── */}
            {[TODAY_YEAR, TODAY_YEAR - 1].map(y => (
              <button key={y} onClick={() => { setSelYear(y); setYtd(false); }} style={{
                padding: '3px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
                fontFamily: "'IBM Plex Sans',sans-serif",
                background: selYear === y && !ytd ? 'rgba(251,146,60,0.18)' : 'rgba(255,255,255,0.04)',
                border: `0.5px solid ${selYear === y && !ytd ? 'rgba(251,146,60,0.45)' : 'rgba(255,255,255,0.1)'}`,
                color: selYear === y && !ytd ? '#fb923c' : 'rgba(255,255,255,0.45)',
                fontWeight: selYear === y && !ytd ? 600 : 400,
                transition: 'all 0.15s',
              }}>{y}</button>
            ))}

            {/* ── Divider ── */}
            <span style={{ color: 'rgba(255,255,255,0.1)', fontSize: 16, margin: '0 2px' }}>│</span>

            {/* ── Month buttons ── */}
            {MONTH_NAMES.map((name, i) => {
              const m = i + 1;
              const active = selMonth === m && !ytd;
              return (
                <button key={m} onClick={() => { setSelMonth(selMonth === m ? 0 : m); setYtd(false); }} style={{
                  padding: '3px 7px', borderRadius: 5, fontSize: 11, cursor: 'pointer',
                  fontFamily: "'IBM Plex Sans',sans-serif",
                  background: active ? 'rgba(96,165,250,0.15)' : 'rgba(255,255,255,0.03)',
                  border: `0.5px solid ${active ? 'rgba(96,165,250,0.4)' : 'rgba(255,255,255,0.08)'}`,
                  color: active ? '#60a5fa' : 'rgba(255,255,255,0.38)',
                  transition: 'all 0.15s',
                }}>{name}</button>
              );
            })}

            {/* ── Divider ── */}
            <span style={{ color: 'rgba(255,255,255,0.1)', fontSize: 16, margin: '0 2px' }}>│</span>

            {/* ── YTD button ── */}
            <button onClick={() => { setYtd(y => !y); setSelMonth(0); }} style={{
              padding: '3px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
              fontFamily: "'IBM Plex Sans',sans-serif",
              background: ytd ? 'rgba(167,139,250,0.15)' : 'rgba(255,255,255,0.04)',
              border: `0.5px solid ${ytd ? 'rgba(167,139,250,0.45)' : 'rgba(255,255,255,0.1)'}`,
              color: ytd ? '#a78bfa' : 'rgba(255,255,255,0.45)',
              fontWeight: ytd ? 600 : 400,
              transition: 'all 0.15s',
            }}>YTD</button>

            {/* ── Reset ── */}
            <button onClick={() => { setSelYear(new Date().getFullYear()); setSelMonth(0); setYtd(false); }} style={{
              padding: '3px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
              fontFamily: "'IBM Plex Sans',sans-serif",
              background: 'rgba(255,255,255,0.03)',
              border: '0.5px solid rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.3)',
              transition: 'all 0.15s',
            }}>↺ Reset</button>

          </div>
        </div>
        <div className="db-actions">
          <span className="db-action-link">Portlet settings</span>
          <span className="db-sep">·</span>
          <span className="db-action-link">Personalize</span>
          <span className="db-sep">·</span>
          <span className="db-action-link">Layout</span>
        </div>
      </div>

      {/* 3-column portlet grid */}
      <div className="portlet-grid">

        {/* LEFT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Portlet title="Income By Period Trend">
            <div style={{ marginBottom: 8 }}>
              <select className="period-select"><option>By Period</option></select>
            </div>
            <MiniBarChart values={incPoints} color="#fb923c" />
            <div className="chart-title" style={{ marginTop: 8 }}>Income By Period</div>
            <div className="chart-subtitle">In Thousands</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', marginTop: 4 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
                <span style={{ width: 8, height: 8, background: '#fb923c', borderRadius: 2, display: 'inline-block' }} /> Income
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
                <span style={{ width: 14, height: 2, background: 'rgba(255,255,255,0.3)', display: 'inline-block', borderRadius: 1 }} /> Moving Avg
              </span>
            </div>
          </Portlet>

          <Portlet title="Weekly New Business Trend">
            <div style={{ marginBottom: 8 }}>
              <select className="period-select"><option>Weekly</option></select>
            </div>
            <MiniBarChart values={revPoints} color="#60a5fa" />
            <div className="chart-title" style={{ marginTop: 8 }}>Weekly New Business</div>
            <div className="chart-subtitle">In Thousands</div>
          </Portlet>
        </div>

        {/* MIDDLE */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Quick Access — deep links to report tabs */}
          <Portlet title="Quick Access">
            <div className="quick-grid">
              {QUICK_ACCESS.map(qa => (
                <div
                  key={qa.label}
                  className="quick-item"
                  style={{ background: qa.bg, borderColor: qa.border }}
                  onClick={() => router.push(qa.href)}
                >
                  <div className="quick-icon" style={{ background: qa.bg, border: `0.5px solid ${qa.border}` }}>
                    <svg viewBox="0 0 16 16" fill="none" stroke={qa.color} strokeWidth="1.4" strokeLinecap="round">
                      <rect x="2" y="3" width="12" height="10" rx="2"/>
                      <line x1="5" y1="7" x2="11" y2="7"/>
                      <line x1="5" y1="10" x2="9" y2="10"/>
                    </svg>
                  </div>
                  <span className="quick-label" style={{ color: qa.color }}>{qa.label}</span>
                </div>
              ))}
            </div>
          </Portlet>

          {/* KPIs — live data */}
          <Portlet title="Key Performance Indicators">
            <div className="kpi-heroes">
              {loading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="kpi-hero">
                      <div className="kpi-hero-label"><Sk w={60} /></div>
                      <div className="kpi-hero-value" style={{ marginTop: 6 }}><Sk w={80} /></div>
                    </div>
                  ))
                : heroes.map(k => (
                    <div key={k.label} className="kpi-hero">
                      <div className="kpi-hero-label">{k.label}</div>
                      <div className="kpi-hero-value" style={{ color: k.color, fontSize: k.value === 'N/A' ? 18 : 20 }}>
                        {k.value !== 'N/A' && <span style={{ fontSize: 13 }}>{k.up ? '▲' : '▼'}</span>}
                        {k.value}
                      </div>
                    </div>
                  ))
              }
            </div>
            <table className="kpi-table">
              <thead>
                <tr>
                  <th>Indicator</th><th>Period</th>
                  <th style={{ textAlign: 'right' }}>Current</th>
                  <th style={{ textAlign: 'right' }}>Previous</th>
                  <th style={{ textAlign: 'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i}>
                        {[100, 130, 70, 30, 50].map((w, j) => (
                          <td key={j} style={{ padding: '9px 8px' }}><Sk w={w} /></td>
                        ))}
                      </tr>
                    ))
                  : kpiRows.map(row => (
                      <tr key={row.indicator}>
                        <td className="indicator">{row.indicator}</td>
                        <td className="period">{row.period}</td>
                        <td className="mono" style={{ textAlign: 'right' }}>{row.current}</td>
                        <td className="mono" style={{ textAlign: 'right', color: 'rgba(255,255,255,0.4)' }}>{row.previous}</td>
                        <td style={{ textAlign: 'center' }}>
                          {row.change === 'N/A'
                            ? <Delta value="N/A" positive={false} />
                            : <span style={{ fontSize: 10, color: row.positive ? '#4ade80' : '#f87171', background: row.positive ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)', padding: '2px 7px', borderRadius: 20 }}>{row.positive ? '▲ Live' : '▼ Live'}</span>
                          }
                        </td>
                      </tr>
                    ))
                }
              </tbody>
            </table>
          </Portlet>

          {/* Financials — live data */}
          <Portlet title="Financials">
            <div className="fin-heroes">
              {loading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="fin-hero">
                      <div className="fin-hero-label"><Sk w={80} /></div>
                      <div className="fin-hero-value" style={{ marginTop: 4 }}><Sk w={70} /></div>
                    </div>
                  ))
                : finHeroes.map(f => (
                    <div key={f.label} className="fin-hero">
                      <div className="fin-hero-label">{f.label}</div>
                      <div className="fin-hero-value">{f.value}</div>
                    </div>
                  ))
              }
            </div>
            <table className="fin-table">
              <thead>
                <tr><th>Indicator</th><th>Today</th><th>This Week</th><th style={{color:'#fb923c'}}>Current Period</th><th>Previous Period</th></tr>
              </thead>
              <tbody>
                {finRows.map(row => (
                  <tr key={row.indicator}>
                    <td>{row.indicator}</td>
                    <td>{row.today}</td>
                    <td>{row.thisWeek}</td>
                    <td style={{ color: row.thisMonth !== '—' ? '#f1ede8' : undefined }}>{row.thisMonth}</td>
                    <td>{row.lastMonth}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Portlet>
        </div>

        {/* RIGHT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <Portlet title="Revenue By Period Trend">
            <div style={{ marginBottom: 8 }}>
              <select className="period-select"><option>By Period</option></select>
            </div>
            <MiniLineChart values={revPoints} color="#4ade80" />
            <div className="chart-title" style={{ marginTop: 8 }}>Revenue By Period</div>
            <div className="chart-subtitle">In Thousands</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', marginTop: 4 }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
                <span style={{ width: 14, height: 2, background: '#4ade80', display: 'inline-block', borderRadius: 1 }} /> Revenue
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>
                <span style={{ width: 14, height: 2, borderTop: '1px dashed rgba(255,255,255,0.3)', display: 'inline-block' }} /> Moving Avg
              </span>
            </div>
          </Portlet>

          <Portlet title="Expenses By Period Trend">
            <div style={{ marginBottom: 8 }}>
              <select className="period-select"><option>By Period</option></select>
            </div>
            <MiniLineChart values={expPoints} color="#f87171" />
            <div className="chart-title" style={{ marginTop: 8 }}>Expenses By Period</div>
            <div className="chart-subtitle">In Thousands</div>
          </Portlet>
        </div>

      </div>
    </>
  );
}

// ─── Page export ──────────────────────────────────────────────────────────────

export default function DashboardPage() {
  return (
    <ERPShell>
      <DashboardContent />
    </ERPShell>
  );
}