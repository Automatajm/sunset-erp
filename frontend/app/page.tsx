"use client";

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import ERPShell from '@/components/layout/ERPShell';
import { financialReportsApi } from '@/lib/api/financial-reports';
import { salesOrdersApi }      from '@/lib/api/sales-orders';
import { purchaseOrdersApi }   from '@/lib/api/purchase-orders';
import { cashFlowApi }         from '@/lib/api/cash-flow';
import { budgetsApi }          from '@/lib/api/budgets';
import apiClient               from '@/lib/api/client';

// ─── Chart data types ─────────────────────────────────────────────────────────

interface WeekPoint { label: string; revenue: number; expenses: number; income: number }

// ─── Types ────────────────────────────────────────────────────────────────────

interface KpiRow {
  indicator: string;
  current: string;
  previous: string;
  vsP: string;
  vsPPos: boolean;
  ytd: string;
  prevYtd: string;
  vsYtd: string;
  vsYtdPos: boolean;
  statusPos: boolean;
  isSubtotal?: boolean; // visual styling
}

interface FinRow {
  indicator: string;
  today: string;
  thisWeek: string;
  current: string;
  budget: string;
  varBud: string;
  varBudPos: boolean;
  ytd: string;
  budgetYtd: string;
  varYtd: string;
  varYtdPos: boolean;
  statusPos: boolean;
  isSubtotal?: boolean;
}

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtK(n: number) {
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (Math.abs(n) >= 1_000)     return `$${(n / 1_000).toFixed(1)}K`;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
}

// ─── Static fin rows (period comparison unavailable without history) ───────────

const EMPTY_FIN_ROW = (indicator: string): FinRow => ({
  indicator, today: '—', thisWeek: '—', current: '—', budget: '—',
  varBud: '—', varBudPos: true, ytd: '—', budgetYtd: '—',
  varYtd: '—', varYtdPos: true, statusPos: true,
});

const FIN_ROWS_STATIC: FinRow[] = [
  'Bank Balance', 'Revenue', 'Cost of Goods',
  'Gross Margin', 'Gross Margin %', 'Expenses',
].map(EMPTY_FIN_ROW);

// ─── Quick Access — with correct tab deep links ────────────────────────────────

const QUICK_ACCESS = [
  { label: 'Balance Sheet',    color: '#fb923c', bg: 'rgba(251,146,60,0.12)',  border: 'rgba(251,146,60,0.2)',   href: '/accounting/reports?tab=bs' },
  { label: 'Trial Balance',    color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',   border: 'rgba(96,165,250,0.18)', href: '/accounting/reports?tab=tb' },
  { label: 'Income Statement', color: '#4ade80', bg: 'rgba(74,222,128,0.1)',   border: 'rgba(74,222,128,0.18)', href: '/accounting/reports?tab=pl' },
  { label: 'Budget vs Actual', color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.18)',href: '/accounting/budgets' },
];

// ─── Mini charts — data driven ───────────────────────────────────────────────

// ─── Chart types ─────────────────────────────────────────────────────────────

type ChartMode = 'monthly' | 'weekly';

interface ChartPoint { label: string; value: number }

// Build monthly points from raw monthly map
function buildMonthlyPoints(
  monthMap: Record<string, { revenue: number; expenses: number }>,
  metric: 'revenue' | 'expenses' | 'income'
): ChartPoint[] {
  return Object.keys(monthMap).sort().map(k => ({
    label: k.substring(5, 7) + '/' + k.substring(2, 4), // MM/YY
    value: metric === 'income'
      ? monthMap[k].revenue - monthMap[k].expenses
      : monthMap[k][metric],
  }));
}

// ─── InteractiveChart ─────────────────────────────────────────────────────────

function InteractiveChart({
  points,
  color,
  mode,
  onModeChange,
  activeLabel,
  chartType = 'bar',
}: {
  points: ChartPoint[];
  color: string;
  mode: ChartMode;
  onModeChange: (m: ChartMode) => void;
  activeLabel?: string;
  chartType?: 'bar' | 'line';
}) {
  const display = mode === 'weekly' ? points.slice(-12) : points;
  const max = Math.max(...display.map(p => p.value), 1);
  const w = 220, h = 55;

  return (
    <div>
      {/* Mode toggle */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {(['monthly', 'weekly'] as ChartMode[]).map(m => (
          <button key={m} onClick={() => onModeChange(m)} style={{
            padding: '2px 8px', borderRadius: 4, fontSize: 10, cursor: 'pointer',
            fontFamily: "'IBM Plex Sans',sans-serif",
            background: mode === m ? `${color}22` : 'rgba(255,255,255,0.04)',
            border: `0.5px solid ${mode === m ? color + '66' : 'rgba(255,255,255,0.08)'}`,
            color: mode === m ? color : 'rgba(255,255,255,0.35)',
            transition: 'all 0.15s',
          }}>{m === 'monthly' ? 'Monthly' : 'Weekly'}</button>
        ))}
      </div>

      {/* Chart */}
      {chartType === 'bar' ? (
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: h }}>
          {display.map((p, i) => {
            const pct = Math.max((p.value / max) * 100, 2);
            const isActive = activeLabel ? p.label === activeLabel : i === display.length - 1;
            return (
              <div key={i} style={{ flex: 1, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                <div style={{
                  width: '100%', height: `${pct}%`,
                  background: isActive ? color : `${color}55`,
                  borderRadius: '2px 2px 0 0',
                  transition: 'height 0.3s, background 0.2s',
                  boxShadow: isActive ? `0 0 6px ${color}88` : 'none',
                }} />
              </div>
            );
          })}
        </div>
      ) : (
        <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ height: h, display: 'block' }}>
          <defs>
            <linearGradient id={`lg-${color.replace('#','')}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.2" />
              <stop offset="100%" stopColor={color} stopOpacity="0.02" />
            </linearGradient>
          </defs>
          {(() => {
            if (display.length < 2) return null;
            const min = Math.min(...display.map(p => p.value));
            const range = max - min || 1;
            const xs = display.map((_, i) => (i / (display.length - 1)) * w);
            const ys = display.map(p => h - ((p.value - min) / range) * (h * 0.82) - h * 0.05);
            const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${ys[i].toFixed(1)}`).join(' ');
            return (
              <>
                <path d={d + ` L${w},${h} L0,${h} Z`} fill={`url(#lg-${color.replace('#','')})`} />
                <path d={d} fill="none" stroke={`${color}99`} strokeWidth="1.5" strokeLinejoin="round" />
                {display.map((p, i) => {
                  const isActive = activeLabel ? p.label === activeLabel : i === display.length - 1;
                  return isActive
                    ? <circle key={i} cx={xs[i]} cy={ys[i]} r={3} fill={color} stroke="#0e0b1a" strokeWidth={1.5} />
                    : null;
                })}
              </>
            );
          })()}
        </svg>
      )}

      {/* X-axis — simple sequential numbers, active period highlighted */}
      <div style={{ display: 'flex', marginTop: 3, gap: 2 }}>
        {display.map((p, i) => {
          const isActive = activeLabel ? p.label === activeLabel : i === display.length - 1;
          const label = isActive ? p.label : String(i + 1);
          return (
            <div key={i} title={p.label} style={{
              flex: 1, textAlign: 'center', fontSize: 8, lineHeight: 1,
              color: isActive ? color : 'rgba(255,255,255,0.22)',
              fontFamily: "'IBM Plex Mono',monospace",
              fontWeight: isActive ? 700 : 400,
              overflow: 'hidden', whiteSpace: 'nowrap',
            }}>{label}</div>
          );
        })}
      </div>
    </div>
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
        padding: '5px 10px',
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

  function buildDates(year: number, months: number[], ytd: boolean) {
    const py = year - 1;
    if (ytd) {
      const endM    = TODAY_MONTH;
      const endDay  = new Date(year, endM, 0).getDate();
      const pEndDay = new Date(py, endM, 0).getDate();
      return {
        start:     `${year}-01-01`,
        end:       `${year}-${String(endM).padStart(2,'0')}-${String(endDay).padStart(2,'0')}`,
        prevStart: `${py}-01-01`,
        prevEnd:   `${py}-${String(endM).padStart(2,'0')}-${String(pEndDay).padStart(2,'0')}`,
        label:     `YTD ${year} vs YTD ${py}`,
      };
    }
    if (months.length === 0) {
      return {
        start: `${year}-01-01`, end: `${year}-12-31`,
        prevStart: `${py}-01-01`, prevEnd: `${py}-12-31`,
        label: `${year} vs ${py}`,
      };
    }
    // Multi-month: Jan 1 of first month → last day of last month
    const sortedMs  = [...months].sort((a,b) => a-b);
    const firstM    = sortedMs[0];
    const lastM     = sortedMs[sortedMs.length - 1];
    const lastDay   = new Date(year, lastM, 0).getDate();
    const pLastDay  = new Date(py, lastM, 0).getDate();
    const label     = sortedMs.length === 1
      ? `${MONTH_NAMES[firstM-1]} ${year} vs ${MONTH_NAMES[firstM-1]} ${py}`
      : `${MONTH_NAMES[firstM-1]}–${MONTH_NAMES[lastM-1]} ${year} vs ${py}`;
    // For non-contiguous months, use union of date ranges (start of first → end of last)
    return {
      start:     `${year}-${String(firstM).padStart(2,'0')}-01`,
      end:       `${year}-${String(lastM).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`,
      prevStart: `${py}-${String(firstM).padStart(2,'0')}-01`,
      prevEnd:   `${py}-${String(lastM).padStart(2,'0')}-${String(pLastDay).padStart(2,'0')}`,
      label,
    };
  }

  // YTD end = last day of last selected month (or TODAY_MONTH if no month selected)
  function buildYtdEnd(year: number, months: number[], ytd: boolean): string {
    if (ytd || months.length === 0) {
      const m = TODAY_MONTH;
      return `${year}-${String(m).padStart(2,'0')}-${new Date(year,m,0).getDate()}`;
    }
    const lastM = Math.max(...months);
    return `${year}-${String(lastM).padStart(2,'0')}-${new Date(year,lastM,0).getDate()}`;
  }

  // ── Live data state ──
  const [selYear,   setSelYear]   = useState(() => new Date().getFullYear());
  const [selMonths, setSelMonths] = useState<number[]>([]);  // [] = full year, [1,2,3] = multi
  const [ytd,       setYtd]       = useState(false);
  const [lastClicked, setLastClicked] = useState<number | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [kpiRows,    setKpiRows]    = useState<KpiRow[]>([]);
  const [heroes,     setHeroes]     = useState<{ label: string; value: string; color: string; up: boolean }[]>([]);
  const [finHeroes,  setFinHeroes]  = useState<{ label: string; value: string }[]>([]);
  const [finRows,    setFinRows]    = useState<FinRow[]>(FIN_ROWS_STATIC);
  const [chartMode,  setChartMode]  = useState<ChartMode>('monthly');
  const [revPoints,  setRevPoints]  = useState<ChartPoint[]>([]);
  const [expPoints,  setExpPoints]  = useState<ChartPoint[]>([]);
  const [incPoints,  setIncPoints]  = useState<ChartPoint[]>([]);
  const [cosPoints,  setCosPoints]  = useState<ChartPoint[]>([]);
  const [weekPoints, setWeekPoints] = useState<{ rev: ChartPoint[]; exp: ChartPoint[]; inc: ChartPoint[]; cos: ChartPoint[] }>({ rev: [], exp: [], inc: [], cos: [] });

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const pd = buildDates(selYear, selMonths, ytd);
      // period label derived from pd.label
      // active chart label = selected month in MM/YY format
      // stored in a ref-like way via selMonth/selYear already available in render
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

        // ── SG&A / EBIT / EBITDA — exact values from structured P&L ────────────
        type PLStructured = {
          sga?: { total: number };
          ebit?: number;
          depreciation?: { total: number };
          ebitda?: number;
          financial?: { total: number };
          ebt?: number;
          tax?: { total: number };
        };
        const plS     = plData     as PLStructured;
        const plPrevS = plPrevData as PLStructured;

        const sgaCur    = plS.sga?.total          ?? 0;
        const deprCur   = plS.depreciation?.total ?? 0;
        const intCur    = plS.financial?.total    ?? 0;
        const ebit      = plS.ebit                ?? (revenue - cosTotal - sgaCur);
        const ebitda    = plS.ebitda              ?? (ebit + deprCur);

        const prevSga   = plPrevS.sga?.total          ?? 0;
        const prevDepr  = plPrevS.depreciation?.total ?? 0;
        const prevEbit  = plPrevS.ebit                ?? (prevRev - prevCoS - prevSga);
        const prevEbitda= plPrevS.ebitda              ?? (prevEbit + prevDepr);
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

        // ── Chart points from General Ledger ──
        type GLEntry = { date: string; accountNumber: string; debit: number; credit: number };
        const glData = gl as { entries?: GLEntry[] };
        const glEntries = glData.entries ?? [];

        // Monthly grouping
        const monthMap: Record<string, { revenue: number; expenses: number; cos: number; sga: number; depr: number; interest: number }> = {};
        const weekMap:  Record<string, { revenue: number; expenses: number; cos: number; sga: number; depr: number; interest: number }> = {};

        glEntries.forEach(e => {
          const mKey = e.date.substring(0, 7);
          if (!monthMap[mKey]) monthMap[mKey] = { revenue: 0, expenses: 0, cos: 0, sga: 0, depr: 0, interest: 0 };
          if (e.accountNumber.startsWith('4'))   monthMap[mKey].revenue  += e.credit;
          if (e.accountNumber.startsWith('5'))   monthMap[mKey].cos      += e.debit;
          // SG&A = 6.1.x + 6.2.x excluding depreciation (6.2.06)
          if (e.accountNumber.startsWith('6.1') || (e.accountNumber.startsWith('6.2') && e.accountNumber !== '6.2.06'))
            monthMap[mKey].sga += e.debit;
          // Depreciation
          if (e.accountNumber === '6.2.06') monthMap[mKey].depr += e.debit;
          // Interest & financial
          if (e.accountNumber.startsWith('6.3')) monthMap[mKey].interest += e.debit;
          if (e.accountNumber.startsWith('6'))   monthMap[mKey].expenses += e.debit;

          const d = new Date(e.date);
          const day = d.getDay();
          const mon = new Date(d);
          mon.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
          const wKey = mon.toISOString().substring(0, 10);
          if (!weekMap[wKey]) weekMap[wKey] = { revenue: 0, expenses: 0, cos: 0, sga: 0, depr: 0, interest: 0 };
          if (e.accountNumber.startsWith('4'))   weekMap[wKey].revenue  += e.credit;
          if (e.accountNumber.startsWith('5'))   weekMap[wKey].cos      += e.debit;
          if (e.accountNumber.startsWith('6'))   weekMap[wKey].expenses += e.debit;
        });

        // Build ChartPoint arrays
        const mkLabel = (ym: string) => ym.substring(5,7) + '/' + ym.substring(2,4);
        const mkWLabel = (d: string) => {
          const dt = new Date(d); return `W${Math.ceil(dt.getDate()/7)} ${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][dt.getMonth()]}`;
        };

        const mKeys = Object.keys(monthMap).sort();
        const wKeys = Object.keys(weekMap).sort();

        if (mKeys.length > 0) {
          setRevPoints(mKeys.map(k => ({ label: mkLabel(k), value: monthMap[k].revenue })));
          setExpPoints(mKeys.map(k => ({ label: mkLabel(k), value: monthMap[k].expenses })));
          setIncPoints(mKeys.map(k => ({ label: mkLabel(k), value: monthMap[k].revenue - monthMap[k].expenses })));
          setCosPoints(mKeys.map(k => ({ label: mkLabel(k), value: monthMap[k].cos ?? 0 })));
        }
        // ── Weekly distribution from monthly data ──
        // Since JEs are posted on last day of month, distribute monthly values
        // evenly across the weeks of that month to get realistic weekly view.
        {
          // Build a week spine: last 12 Mondays up to and including current week
          const today = new Date();
          const todayDay = today.getDay();
          const currentMon = new Date(today);
          currentMon.setDate(today.getDate() + (todayDay === 0 ? -6 : 1 - todayDay));

          const spine: string[] = [];
          for (let i = 11; i >= 0; i--) {
            const d = new Date(currentMon);
            d.setDate(currentMon.getDate() - i * 7);
            spine.push(d.toISOString().substring(0, 10));
          }

          // For each month in monthMap, count how many of its weeks are in spine
          // then distribute value proportionally
          const wRevMap: Record<string, number> = {};
          const wExpMap: Record<string, number> = {};

          spine.forEach(wk => {
            wRevMap[wk] = 0;
            wExpMap[wk] = 0;
          });

          Object.keys(monthMap).forEach(ym => {
            const [y, mo] = ym.split('-').map(Number);
            // Get all Mondays in this month
            const weeksInMonth: string[] = [];
            const firstDay = new Date(y, mo - 1, 1);
            const lastDay  = new Date(y, mo, 0);
            // Walk from first Monday on or before firstDay
            const startD = new Date(firstDay);
            const sd = startD.getDay();
            startD.setDate(startD.getDate() + (sd === 0 ? -6 : 1 - sd));
            const cur = new Date(startD);
            while (cur <= lastDay) {
              const k = cur.toISOString().substring(0, 10);
              // Only include if week overlaps with month
              const weekEnd = new Date(cur); weekEnd.setDate(cur.getDate() + 6);
              if (weekEnd >= firstDay && cur <= lastDay) weeksInMonth.push(k);
              cur.setDate(cur.getDate() + 7);
            }
            if (weeksInMonth.length === 0) return;
            const perWeekRev = monthMap[ym].revenue  / weeksInMonth.length;
            const perWeekExp = monthMap[ym].expenses / weeksInMonth.length;
            weeksInMonth.forEach(wk => {
              if (wk in wRevMap) { wRevMap[wk] += perWeekRev; wExpMap[wk] += perWeekExp; }
            });
          });

          const wCosMap: Record<string, number> = {};
          spine.forEach(wk => { wCosMap[wk] = 0; });
          Object.keys(monthMap).forEach(ym => {
            const [y, mo] = ym.split('-').map(Number);
            const firstDay = new Date(y, mo - 1, 1);
            const lastDay  = new Date(y, mo, 0);
            const weeksInMonth: string[] = [];
            const startD = new Date(firstDay);
            const sd = startD.getDay();
            startD.setDate(startD.getDate() + (sd === 0 ? -6 : 1 - sd));
            const cur = new Date(startD);
            while (cur <= lastDay) {
              const k = cur.toISOString().substring(0, 10);
              const weekEnd = new Date(cur); weekEnd.setDate(cur.getDate() + 6);
              if (weekEnd >= firstDay && cur <= lastDay) weeksInMonth.push(k);
              cur.setDate(cur.getDate() + 7);
            }
            if (weeksInMonth.length === 0) return;
            const perWeekCos = (monthMap[ym].cos ?? 0) / weeksInMonth.length;
            weeksInMonth.forEach(wk => { if (wk in wCosMap) wCosMap[wk] += perWeekCos; });
          });
          setWeekPoints({
            rev: spine.map((k, i) => ({ label: String(i + 1), value: Math.round(wRevMap[k] || 0) })),
            exp: spine.map((k, i) => ({ label: String(i + 1), value: Math.round(wExpMap[k] || 0) })),
            inc: spine.map((k, i) => ({ label: String(i + 1), value: Math.round((wRevMap[k] || 0) - (wExpMap[k] || 0)) })),
            cos: spine.map((k, i) => ({ label: String(i + 1), value: Math.round(wCosMap[k]  || 0) })),
          });
        }

        // ── KPI heroes with YoY ──
        setHeroes([
          { label: 'Revenue',      value: fmtK(revenue),   color: '#4ade80',   up: revenue >= prevRev  },
          { label: 'Expenses',     value: fmtK(expenses),  color: '#f87171',   up: false               },
          { label: 'Net Income',   value: fmtK(netIncome), color: netIncome >= 0 ? '#4ade80' : '#f87171', up: netIncome >= prevNI },
          { label: 'Bank Balance', value: fmtK(cashInBank),color: '#60a5fa',   up: cashInBank > 0      },
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

        // ── Today / This Week dates ──
        const todayDate    = new Date();
        const todayStr     = todayDate.toISOString().split('T')[0];
        const weekStart    = new Date(todayDate);
        weekStart.setDate(todayDate.getDate() - (todayDate.getDay() === 0 ? 6 : todayDate.getDay() - 1));
        const weekStartStr = weekStart.toISOString().split('T')[0];

        // YTD dates — Jan 1 → last selected month (or today for TY with no month)
        const _ytdBaseEnd = buildYtdEnd(selYear, selMonths, ytd);
        const ytdEnd   = selYear === TODAY_YEAR && selMonths.length === 0 && !ytd
          ? todayStr   // TY with no month filter: use actual today
          : _ytdBaseEnd;
        const ytdStart = `${selYear}-01-01`;

        // Fetch today, this week, YTD, and budget lines in parallel
        const [plToday, plWeek, plYtd, budgetList, plPrevYtdRaw] = await Promise.all([
          financialReportsApi.getProfitAndLoss({ startDate: todayStr,     endDate: todayStr    }),
          financialReportsApi.getProfitAndLoss({ startDate: weekStartStr, endDate: todayStr    }),
          financialReportsApi.getProfitAndLoss({ startDate: ytdStart,     endDate: ytdEnd      }),
          budgetsApi.getAll().catch(() => []),
          financialReportsApi.getProfitAndLoss({ startDate: `${selYear-1}-01-01`, endDate: `${selYear-1}-${ytdEnd.slice(5)}` }).catch(() => null),
        ]);

        // ── Previous YTD ──
        type PLData3 = { revenue: { total: number }; costOfSales: { total: number }; expenses: { total: number }; netIncome: number };
        const pyp   = (plPrevYtdRaw ?? { revenue: { total: 0 }, costOfSales: { total: 0 }, expenses: { total: 0 }, netIncome: 0 }) as PLData3;
        const pyRev = pyp.revenue?.total ?? 0;
        const pyCoS = pyp.costOfSales?.total ?? 0;
        const pyExp = pyp.expenses?.total ?? 0;
        const pyNI  = pyp.netIncome ?? 0;

        type PLData2 = {
          revenue: { total: number }; costOfSales: { total: number };
          expenses: { total: number }; netIncome: number;
          sga?: { total: number }; ebit?: number;
          depreciation?: { total: number }; ebitda?: number;
          financial?: { total: number }; ebt?: number;
        };
        const ptd = plToday as PLData2;
        const pwd = plWeek  as PLData2;
        const pyt = plYtd   as PLData2;

        const tdRev = ptd.revenue?.total ?? 0;
        const tdCos = ptd.costOfSales?.total ?? 0;
        const tdExp = ptd.expenses?.total ?? 0;
        const wkRev = pwd.revenue?.total ?? 0;
        const wkCos = pwd.costOfSales?.total ?? 0;
        const wkExp = pwd.expenses?.total ?? 0;
        const ytRev = pyt.revenue?.total ?? 0;
        const ytCos = pyt.costOfSales?.total ?? 0;
        const ytExp = pyt.expenses?.total ?? 0;

        const fmtOrDash = (n: number) => n > 0 ? fmtK(n) : '—';
        const vsStr = (cur: number, prev: number): { s: string; pos: boolean } => {
          if (!prev) return { s: '—', pos: true };
          const d = cur - prev; const p = (d/prev*100).toFixed(1);
          const sign = d >= 0 ? '+' : '';
          return { s: `${sign}${fmtK(d)} / ${sign}${p}%`, pos: d >= 0 };
        };
        const vsCost = (cur: number, prev: number) => { const v = vsStr(cur,prev); return { ...v, pos: cur <= prev }; };

        const vRP  = vsStr(revenue, prevRev);
        const vCP  = vsCost(cosTotal, prevCoS);
        const vGP  = vsStr(revenue-cosTotal, prevRev-prevCoS);
        const vNP  = vsStr(netIncome, prevNI);
        const vEP  = vsCost(expenses, prevExp);
        const vRY  = vsStr(ytRev, pyRev);
        const vCY  = vsCost(ytCos, pyCoS);
        const vGY  = vsStr(ytRev-ytCos, pyRev-pyCoS);
        const vNY  = vsStr(pyt.netIncome ?? 0, pyNI);
        const vEY  = vsCost(ytExp, pyExp);

        setKpiRows([
          { indicator: 'Revenue',       current: fmtK(revenue),          previous: fmtK(prevRev),        vsP: vRP.s,  vsPPos: vRP.pos,  ytd: fmtOrDash(ytRev),       prevYtd: fmtOrDash(pyRev),        vsYtd: vRY.s,  vsYtdPos: vRY.pos,  statusPos: vRY.pos  },
          { indicator: 'Cost of Sales', current: fmtK(cosTotal),         previous: fmtK(prevCoS),        vsP: vCP.s,  vsPPos: vCP.pos,  ytd: fmtOrDash(ytCos),       prevYtd: fmtOrDash(pyCoS),        vsYtd: vCY.s,  vsYtdPos: vCY.pos,  statusPos: vCY.pos  },
          { indicator: 'Gross Profit',  current: fmtK(revenue-cosTotal), previous: fmtK(prevRev-prevCoS),vsP: vGP.s,  vsPPos: vGP.pos,  ytd: fmtOrDash(ytRev-ytCos), prevYtd: fmtOrDash(pyRev-pyCoS),  vsYtd: vGY.s,  vsYtdPos: vGY.pos,  statusPos: vGY.pos  },
          { indicator: 'Gross Margin %',
            current: grossMarginPct,
            previous: prevRev > 0 ? ((prevRev-prevCoS)/prevRev*100).toFixed(1)+'%' : '—',
            vsP: (() => { const c=revenue>0?(revenue-cosTotal)/revenue*100:0; const p=prevRev>0?(prevRev-prevCoS)/prevRev*100:0; if(!p)return'—'; const d=c-p; return`${d>=0?'+':''}${d.toFixed(1)}pp`; })(),
            vsPPos: revenue>0&&prevRev>0 ? (revenue-cosTotal)/revenue>=(prevRev-prevCoS)/prevRev : true,
            ytd: ytRev > 0 ? ((ytRev-ytCos)/ytRev*100).toFixed(1)+'%' : '—',
            prevYtd: pyRev>0 ? ((pyRev-pyCoS)/pyRev*100).toFixed(1)+'%' : '—',
            vsYtd: (() => { const c=ytRev>0?(ytRev-ytCos)/ytRev*100:0; const p=pyRev>0?(pyRev-pyCoS)/pyRev*100:0; if(!p)return'—'; const d=c-p; return`${d>=0?'+':''}${d.toFixed(1)}pp`; })(),
            vsYtdPos: ytRev>0&&pyRev>0 ? (ytRev-ytCos)/ytRev>=(pyRev-pyCoS)/pyRev : true,
            statusPos: ytRev>0&&pyRev>0 ? (ytRev-ytCos)/ytRev>=(pyRev-pyCoS)/pyRev : true },
          { indicator: 'Net Income',    current: fmtK(netIncome),        previous: fmtK(prevNI),         vsP: vNP.s,  vsPPos: vNP.pos,  ytd: fmtOrDash(ytRev-ytCos-ytExp), prevYtd: fmtOrDash(pyRev-pyCoS-pyExp), vsYtd: vNY.s, vsYtdPos: vNY.pos, statusPos: vNY.pos },
          { indicator: 'Expenses',      current: fmtK(expenses),         previous: fmtK(prevExp),        vsP: vEP.s,  vsPPos: vEP.pos,  ytd: fmtOrDash(ytExp),       prevYtd: fmtOrDash(pyExp),        vsYtd: vEY.s,  vsYtdPos: vEY.pos,  statusPos: vEY.pos  },
          { indicator: 'Bank Balance',  current: fmtK(cashInBank),       previous: '—',                  vsP: '—',    vsPPos: true,     ytd: fmtK(cashInBank),       prevYtd: '—',                     vsYtd: '—',    vsYtdPos: true,     statusPos: cashInBank > 0 },
          // ── Operating metrics ──
          { indicator: '─── Operating ───', current: '', previous: '', vsP: '', vsPPos: true, ytd: '', prevYtd: '', vsYtd: '', vsYtdPos: true, statusPos: true, isSubtotal: true },
          { indicator: 'SG&A',
            current: fmtK(sgaCur), previous: fmtK(prevSga),
            vsP: (() => { const v = vsStr(sgaCur, prevSga); return `${v.s}`; })(),
            vsPPos: sgaCur <= prevSga,
            ytd: fmtOrDash(pyt.sga?.total ?? 0), prevYtd: '—', vsYtd: '—', vsYtdPos: true,
            statusPos: sgaCur <= prevSga },
          { indicator: 'EBIT',
            current: fmtK(ebit), previous: fmtK(prevEbit),
            vsP: vsStr(ebit, prevEbit).s, vsPPos: vsStr(ebit, prevEbit).pos,
            ytd: fmtOrDash(pyt.ebit ?? 0), prevYtd: '—', vsYtd: '—', vsYtdPos: true,
            statusPos: ebit >= prevEbit, isSubtotal: true },
          { indicator: 'D&A',
            current: fmtK(deprCur), previous: fmtK(prevDepr),
            vsP: (() => { if(!prevDepr)return'—'; const d=deprCur-prevDepr; const p=(d/prevDepr*100).toFixed(1); return`${d>=0?'+':''}${fmtK(d)} / ${d>=0?'+':''}${p}%`; })(),
            vsPPos: deprCur <= prevDepr,
            ytd: ytRev > 0 ? fmtK(deprCur*(ytRev/Math.max(revenue,1))) : '—',
            prevYtd: '—', vsYtd: '—', vsYtdPos: true, statusPos: true },
          { indicator: 'EBITDA',
            current: fmtK(ebitda), previous: fmtK(prevEbitda),
            vsP: vsStr(ebitda, prevEbitda).s, vsPPos: vsStr(ebitda, prevEbitda).pos,
            ytd: fmtOrDash(pyt.ebitda ?? 0), prevYtd: '—', vsYtd: '—', vsYtdPos: true,
            statusPos: ebitda >= prevEbitda, isSubtotal: true },
        ]);

        // ── Extract budget amounts for current year ──
        // budgetLines have embedded account.accountNumber — use directly, no TB lookup needed
        type BudLine = { accountId: string; fiscalPeriod: string; budgetAmount: string | number; account?: { accountNumber: string } };
        type BudObj  = { id: string; fiscalYear: string; budgetLines?: BudLine[] | string };

        // getAll returns flat array but budgetLines may be empty string on list view
        // Fetch the specific budget by ID to get full lines
        const buds: BudObj[] = Array.isArray(budgetList)
          ? budgetList
          : (budgetList as { value?: BudObj[] }).value ?? [];

        const yearBudMeta = buds.find((b: BudObj) => b.fiscalYear === String(selYear));
        let budLines: BudLine[] = [];

        if (yearBudMeta?.id) {
          try {
            const res = await apiClient.get(`/budgets/${yearBudMeta.id}`);
            const fb = res.data as BudObj;
            budLines = Array.isArray(fb.budgetLines) ? (fb.budgetLines as BudLine[]) : [];
          } catch { budLines = []; }
        }

        // Budget for full period (all months of selYear) or month-specific
        // Budget months: match selected months or all 12
        const pdMonths = selMonths.length > 0
          ? selMonths.map(m => `${selYear}-${String(m).padStart(2,'0')}`)
          : Array.from({length:12},(_,i) => `${selYear}-${String(i+1).padStart(2,'0')}`);
        // YTD budget months: Jan → last selected month (or TODAY_MONTH)
        const ytdLastM  = selMonths.length > 0 ? Math.max(...selMonths) : TODAY_MONTH;
        const ytdMonths = Array.from({length: ytdLastM},
          (_,i) => `${selYear}-${String(i+1).padStart(2,'0')}`);

        // Use embedded account.accountNumber for prefix matching
        const sumBudget = (months: string[], prefix: string) =>
          budLines
            .filter((l: BudLine) =>
              months.includes(l.fiscalPeriod) &&
              (l.account?.accountNumber ?? '').startsWith(prefix)
            )
            .reduce((s: number, l: BudLine) => s + Number(l.budgetAmount), 0);

        const budRev  = sumBudget(pdMonths, '4');
        const budCos  = sumBudget(pdMonths, '5');
        // Expenses budget excludes 6.4.x (tax) to match P&L legacy expenses field
        const budExp  = sumBudget(pdMonths, '6.1') + sumBudget(pdMonths, '6.2') + sumBudget(pdMonths, '6.3');
        const budRevY = sumBudget(ytdMonths, '4');
        const budCosY = sumBudget(ytdMonths, '5');
        const budExpY = sumBudget(ytdMonths, '6.1') + sumBudget(ytdMonths, '6.2') + sumBudget(ytdMonths, '6.3');

        // ── Derived budget metrics ────────────────────────────────────────────
        const budGrossP  = budRev - budCos;
        const budSga     = sumBudget(pdMonths, '6.1') + sumBudget(pdMonths, '6.2') - sumBudget(pdMonths, '6.2.06');
        const budDepr    = sumBudget(pdMonths, '6.2.06');
        const budInt     = sumBudget(pdMonths, '6.3');
        const budEbit    = budGrossP - budSga;
        const budEbitda  = budEbit + budDepr;

        const budGrossPY = budRevY - budCosY;
        const budSgaY    = sumBudget(ytdMonths, '6.1') + sumBudget(ytdMonths, '6.2') - sumBudget(ytdMonths, '6.2.06');
        const budDeprY   = sumBudget(ytdMonths, '6.2.06');
        const budEbitY   = budGrossPY - budSgaY;
        const budEbitdaY = budEbitY + budDeprY;

        // ── Variance formatter ──
        const varFmt = (act: number, bud: number): { str: string; pos: boolean } => {
          if (bud === 0 || act === 0) return { str: '—', pos: true };
          const diff = act - bud;
          const pct  = (diff / bud * 100).toFixed(1);
          const sign = diff >= 0 ? '+' : '';
          return { str: `${sign}${fmtK(diff)} / ${sign}${pct}%`, pos: diff >= 0 };
        };

        // For cost/expense: favorable = actual LOWER than budget
        const varCost = (act: number, bud: number) => {
          const v = varFmt(act, bud);
          return { ...v, pos: act <= bud };
        };

        const prevGM    = prevRev > 0 ? ((prevRev-prevCoS)/prevRev*100).toFixed(1)+'%' : '—';
        const tdGMpct   = tdRev > 0 ? ((tdRev-tdCos)/tdRev*100).toFixed(1)+'%' : '—';
        const wkGMpct   = wkRev > 0 ? ((wkRev-wkCos)/wkRev*100).toFixed(1)+'%' : '—';
        const ytGMpct   = ytRev > 0 ? ((ytRev-ytCos)/ytRev*100).toFixed(1)+'%' : '—';
        const budGMpct  = budRev > 0 ? ((budRev-budCos)/budRev*100).toFixed(1)+'%' : '—';
        const budGMpctY = budRevY > 0 ? ((budRevY-budCosY)/budRevY*100).toFixed(1)+'%' : '—';

        const vRev  = varFmt(revenue, budRev);
        const vCos  = varCost(cosTotal, budCos);
        const vExp  = varCost(expenses, budExp);
        const vGM   = varFmt(revenue-cosTotal, budRev-budCos);
        const vRevY = varFmt(ytRev, budRevY);
        const vCosY = varCost(ytCos, budCosY);
        const vExpY = varCost(ytExp, budExpY);
        const vGMY  = varFmt(ytRev-ytCos, budRevY-budCosY);

        setFinRows([
          { indicator: 'Bank Balance',
            today: fmtK(cashInBank), thisWeek: fmtK(cashInBank),
            current: fmtK(cashInBank), budget: '—', varBud: '—', varBudPos: true,
            ytd: fmtK(cashInBank), budgetYtd: '—', varYtd: '—', varYtdPos: true, statusPos: cashInBank > 0 },
          { indicator: 'Revenue',
            today: fmtOrDash(tdRev), thisWeek: fmtOrDash(wkRev),
            current: fmtK(revenue), budget: fmtOrDash(budRev), varBud: vRev.str, varBudPos: vRev.pos,
            ytd: fmtOrDash(ytRev), budgetYtd: fmtOrDash(budRevY), varYtd: vRevY.str, varYtdPos: vRevY.pos, statusPos: vRevY.pos },
          { indicator: 'Cost of Goods',
            today: fmtOrDash(tdCos), thisWeek: fmtOrDash(wkCos),
            current: fmtK(cosTotal), budget: fmtOrDash(budCos), varBud: vCos.str, varBudPos: vCos.pos,
            ytd: fmtOrDash(ytCos), budgetYtd: fmtOrDash(budCosY), varYtd: vCosY.str, varYtdPos: vCosY.pos, statusPos: vCosY.pos },
          { indicator: 'Gross Margin',
            today: fmtOrDash(tdRev-tdCos), thisWeek: fmtOrDash(wkRev-wkCos),
            current: fmtK(revenue-cosTotal), budget: fmtOrDash(budRev-budCos), varBud: vGM.str, varBudPos: vGM.pos,
            ytd: fmtOrDash(ytRev-ytCos), budgetYtd: fmtOrDash(budRevY-budCosY), varYtd: vGMY.str, varYtdPos: vGMY.pos, statusPos: vGMY.pos },
          { indicator: 'Gross Margin %',
            today: tdGMpct, thisWeek: wkGMpct,
            current: grossMarginPct, budget: budGMpct,
            varBud: (() => { const c=revenue>0?(revenue-cosTotal)/revenue*100:0; const b=budRev>0?(budRev-budCos)/budRev*100:0; if(!b)return'—'; const d=c-b; return`${d>=0?'+':''}${d.toFixed(1)}pp`; })(),
            varBudPos: revenue>0&&budRev>0 ? (revenue-cosTotal)/revenue>=(budRev-budCos)/budRev : true,
            ytd: ytGMpct, budgetYtd: budGMpctY,
            varYtd: (() => { const c=ytRev>0?(ytRev-ytCos)/ytRev*100:0; const b=budRevY>0?(budRevY-budCosY)/budRevY*100:0; if(!b)return'—'; const d=c-b; return`${d>=0?'+':''}${d.toFixed(1)}pp`; })(),
            varYtdPos: ytRev>0&&budRevY>0 ? (ytRev-ytCos)/ytRev>=(budRevY-budCosY)/budRevY : true,
            statusPos: (ytRev-ytCos) >= (budRevY-budCosY) },
          { indicator: 'Expenses',
            today: fmtOrDash(tdExp), thisWeek: fmtOrDash(wkExp),
            current: fmtK(expenses), budget: fmtOrDash(budExp), varBud: vExp.str, varBudPos: vExp.pos,
            ytd: fmtOrDash(ytExp), budgetYtd: fmtOrDash(budExpY), varYtd: vExpY.str, varYtdPos: vExpY.pos, statusPos: vExpY.pos },
          // ── Operating metrics ──
          { indicator: '─── Operating ───', today:'', thisWeek:'', current:'', budget:'', varBud:'', varBudPos:true, ytd:'', budgetYtd:'', varYtd:'', varYtdPos:true, statusPos:true, isSubtotal:true },
          { indicator: 'SG&A',
            today: '—', thisWeek: '—',
            current: fmtK(sgaCur), budget: fmtOrDash(budSga), varBud: varCost(sgaCur, budSga).str, varBudPos: varCost(sgaCur, budSga).pos,
            ytd: fmtOrDash(pyt.sga?.total ?? 0), budgetYtd: fmtOrDash(budSgaY), varYtd: varCost(pyt.sga?.total ?? 0, budSgaY).str, varYtdPos: varCost(pyt.sga?.total ?? 0, budSgaY).pos,
            statusPos: varCost(pyt.sga?.total ?? 0, budSgaY).pos },
          { indicator: 'EBIT',
            today: '—', thisWeek: '—',
            current: fmtK(ebit), budget: fmtOrDash(budEbit), varBud: varFmt(ebit, budEbit).str, varBudPos: varFmt(ebit, budEbit).pos,
            ytd: fmtOrDash(pyt.ebit ?? 0), budgetYtd: fmtOrDash(budEbitY), varYtd: varFmt(pyt.ebit ?? 0, budEbitY).str, varYtdPos: varFmt(pyt.ebit ?? 0, budEbitY).pos,
            statusPos: varFmt(pyt.ebit ?? 0, budEbitY).pos, isSubtotal: true },
          { indicator: 'D&A',
            today: '—', thisWeek: '—',
            current: fmtK(deprCur), budget: fmtOrDash(budDepr),
            varBud: varCost(deprCur, budDepr).str, varBudPos: varCost(deprCur, budDepr).pos,
            ytd: fmtOrDash(pyt.depreciation?.total ?? 0), budgetYtd: fmtOrDash(budDeprY),
            varYtd: varCost(pyt.depreciation?.total ?? 0, budDeprY).str, varYtdPos: varCost(pyt.depreciation?.total ?? 0, budDeprY).pos,
            statusPos: varCost(pyt.depreciation?.total ?? 0, budDeprY).pos },
          { indicator: 'EBITDA',
            today: '—', thisWeek: '—',
            current: fmtK(ebitda), budget: fmtOrDash(budEbitda), varBud: varFmt(ebitda, budEbitda).str, varBudPos: varFmt(ebitda, budEbitda).pos,
            ytd: fmtOrDash(pyt.ebitda ?? 0), budgetYtd: fmtOrDash(budEbitdaY), varYtd: varFmt(pyt.ebitda ?? 0, budEbitdaY).str, varYtdPos: varFmt(pyt.ebitda ?? 0, budEbitdaY).pos,
            statusPos: varFmt(pyt.ebitda ?? 0, budEbitdaY).pos, isSubtotal: true },
        ]);

      } catch { /* non-blocking */ }
      finally { setLoading(false); }
    };
    load();
  }, [selYear, selMonths, ytd]);

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap');
        @keyframes db-pulse { 0%,100%{opacity:0.35} 50%{opacity:0.75} }

        .db-header {
          display: flex; align-items: center; justify-content: space-between;
          padding: 6px 12px 5px;
        }
        .db-title  { font-size: 15px; font-weight: 500; color: #f1ede8; }
        .db-actions { display: flex; align-items: center; gap: 6px; font-size: 12px; }
        .db-action-link { color: rgba(251,146,60,0.55); cursor: pointer; transition: color 0.15s; }
        .db-action-link:hover { color: #fb923c; }
        .db-sep { color: rgba(255,255,255,0.15); }

        .portlet-grid {
          display: grid;
          grid-template-columns: 280px 1fr 280px;
          gap: 6px;
          padding: 0 12px 12px;
          align-items: start;
        }

        .quick-grid { display: flex; flex-direction: row; gap: 6px; }
        .quick-item {
          flex: 1; display: flex; flex-direction: row; align-items: center;
          justify-content: center; gap: 5px; padding: 5px 6px;
          border-radius: 6px; cursor: pointer;
          transition: opacity 0.15s, transform 0.15s;
          text-align: left; border: 0.5px solid transparent;
        }
        .quick-item:hover { opacity: 0.85; transform: translateY(-1px); }
        .quick-icon {
          width: 18px; height: 18px; border-radius: 4px;
          display: flex; align-items: center; justify-content: center; flex-shrink: 0;
        }
        .quick-icon svg { width: 10px; height: 10px; display: block; flex-shrink: 0; }
        .quick-label { font-size: 10px; font-weight: 500; line-height: 1.2; white-space: nowrap; }

        .kpi-heroes {
          display: grid; grid-template-columns: repeat(4,1fr);
          gap: 1px; background: rgba(255,255,255,0.05);
          border-radius: 6px; overflow: hidden; margin-bottom: 4px;
        }
        .kpi-hero { background: rgba(10,7,18,0.6); padding: 4px 8px; }
        .kpi-hero-label { font-size: 9px; color: rgba(255,255,255,0.4); letter-spacing: 0.06em; text-transform: uppercase; }
        .kpi-hero-value { font-size: 16px; font-weight: 500; line-height: 1; display: flex; align-items: center; gap: 4px; margin-top: 2px; }

        .kpi-table { width: 100%; border-collapse: collapse; font-size: 12px; }
        .kpi-table thead th {
          font-size: 10px; font-weight: 500; letter-spacing: 0.08em;
          text-transform: uppercase; color: rgba(251,146,60,0.5);
          padding: 3px 6px; border-bottom: 0.5px solid rgba(255,255,255,0.07); text-align: left; white-space: nowrap;
        }
        .kpi-table tbody td { padding: 3px 6px; border-bottom: 0.5px solid rgba(255,255,255,0.04); color: rgba(255,255,255,0.7); vertical-align: middle; white-space: nowrap; }
        .kpi-table tbody td.indicator { font-weight: 500; color: #e2dfd8; }
        .kpi-table tbody td.period    { color: rgba(251,146,60,0.55); font-size: 11px; }
        .kpi-table tbody td.mono      { font-family: 'IBM Plex Mono', monospace; font-size: 11px; }
        .kpi-table tbody tr:last-child td { border-bottom: none; }
        .kpi-table tbody tr:hover td { background: rgba(251,146,60,0.04); }

        .fin-heroes {
          display: grid; grid-template-columns: repeat(4,1fr);
          gap: 1px; background: rgba(255,255,255,0.05);
          border-radius: 6px; overflow: hidden; margin-bottom: 4px;
        }
        .fin-hero { background: rgba(10,7,18,0.6); padding: 4px 8px; }
        .fin-hero-label { font-size: 9px; color: rgba(255,255,255,0.35); letter-spacing: 0.05em; margin-bottom: 2px; }
        .fin-hero-value { font-size: 14px; font-weight: 500; color: #f1ede8; font-family: 'IBM Plex Mono', monospace; }

        .fin-table { width: 100%; border-collapse: collapse; font-size: 11px; }
        .fin-table thead th {
          font-size: 9px; font-weight: 500; letter-spacing: 0.07em;
          text-transform: uppercase; color: rgba(251,146,60,0.5);
          padding: 3px 5px; border-bottom: 0.5px solid rgba(255,255,255,0.07);
          text-align: right; white-space: nowrap;
        }
        .fin-table thead th:first-child { text-align: left; }
        .fin-table tbody td {
          padding: 3px 5px; border-bottom: 0.5px solid rgba(255,255,255,0.04);
          color: rgba(255,255,255,0.55); text-align: right;
          font-family: 'IBM Plex Mono', monospace; font-size: 10px;
          white-space: nowrap;
        }
        .fin-table tbody td:first-child { font-family: 'IBM Plex Sans', sans-serif; font-size: 11px; color: #e2dfd8; text-align: left; }
        .fin-table tbody tr:last-child td { border-bottom: none; }
        .fin-table tbody tr:hover td { background: rgba(251,146,60,0.04); }

        .chart-subtitle { font-size: 10px; color: rgba(255,255,255,0.3); text-align: center; }
      `}</style>

      {/* Page header */}
      <div className="db-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div className="db-title">Home</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>

            {/* ── TY / LY ── */}
            {([TODAY_YEAR, TODAY_YEAR - 1] as const).map((y, idx) => {
              const label = idx === 0 ? 'TY' : 'LY';
              const active = selYear === y && !ytd && selMonths.length === 0;
              return (
                <button key={y} onClick={() => { setSelYear(y); setYtd(false); setSelMonths([]); setLastClicked(null); }} title={String(y)} style={{
                  padding: '3px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
                  fontFamily: "'IBM Plex Sans',sans-serif",
                  background: active ? 'rgba(251,146,60,0.18)' : 'rgba(255,255,255,0.04)',
                  border: `0.5px solid ${active ? 'rgba(251,146,60,0.45)' : 'rgba(255,255,255,0.1)'}`,
                  color: active ? '#fb923c' : 'rgba(255,255,255,0.45)',
                  fontWeight: active ? 600 : 400,
                  transition: 'all 0.15s',

                }}>{label}</button>
              );
            })}

            {/* ── YTD ── */}
            <button onClick={() => { setYtd(v => !v); setSelMonths([]); setLastClicked(null); }} style={{
              padding: '3px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
              fontFamily: "'IBM Plex Sans',sans-serif",
              background: ytd ? 'rgba(167,139,250,0.15)' : 'rgba(255,255,255,0.04)',
              border: `0.5px solid ${ytd ? 'rgba(167,139,250,0.45)' : 'rgba(255,255,255,0.1)'}`,
              color: ytd ? '#a78bfa' : 'rgba(255,255,255,0.45)',
              fontWeight: ytd ? 600 : 400,
              transition: 'all 0.15s',
            }}>YTD</button>

            {/* ── Reset ── */}
            <button onClick={() => { setSelYear(new Date().getFullYear()); setSelMonths([]); setYtd(false); setLastClicked(null); }} style={{
              padding: '3px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer',
              fontFamily: "'IBM Plex Sans',sans-serif",
              background: 'rgba(255,255,255,0.03)',
              border: '0.5px solid rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.3)',
              transition: 'all 0.15s',
            }}>↺ Reset</button>

            {/* ── Divider ── */}
            <span style={{ color: 'rgba(255,255,255,0.1)', fontSize: 16, margin: '0 2px' }}>│</span>

            {/* ── Month buttons ── */}
            {MONTH_NAMES.map((name, i) => {
              const m = i + 1;
              const active = selMonths.includes(m) && !ytd;
              return (
                <button key={m} onClick={(e) => {
                  setYtd(false);
                  if (e.shiftKey && lastClicked !== null) {
                    // Shift+click: select range
                    const lo = Math.min(lastClicked, m);
                    const hi = Math.max(lastClicked, m);
                    const range = Array.from({length: hi-lo+1}, (_,k) => lo+k);
                    setSelMonths(prev => {
                      const merged = Array.from(new Set([...prev, ...range])).sort((a,b)=>a-b);
                      return merged;
                    });
                  } else {
                    // Normal click: toggle
                    setSelMonths(prev =>
                      prev.includes(m) ? prev.filter(x => x !== m) : [...prev, m].sort((a,b)=>a-b)
                    );
                    setLastClicked(m);
                  }
                }} style={{
                  padding: '3px 7px', borderRadius: 5, fontSize: 11, cursor: 'pointer',
                  fontFamily: "'IBM Plex Sans',sans-serif",
                  background: active ? 'rgba(96,165,250,0.15)' : 'rgba(255,255,255,0.03)',
                  border: `0.5px solid ${active ? 'rgba(96,165,250,0.4)' : 'rgba(255,255,255,0.08)'}`,
                  color: active ? '#60a5fa' : 'rgba(255,255,255,0.38)',
                  fontWeight: active ? 600 : 400,
                  transition: 'all 0.15s',
                  userSelect: 'none',
                }}>{name}</button>
              );
            })}

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Portlet title="Income By Period Trend">
            <InteractiveChart
              points={chartMode === 'monthly' ? incPoints : weekPoints.inc}
              color="#fb923c"
              mode={chartMode}
              onModeChange={setChartMode}
              activeLabel={selMonths.length > 0 && chartMode === 'monthly'
                ? String(selMonths[selMonths.length-1]).padStart(2,'0') + '/' + String(selYear).substring(2)
                : undefined}
              chartType="bar"
            />
            <div className="chart-subtitle" style={{ marginTop: 4 }}>Net Income · In Thousands</div>
          </Portlet>

          <Portlet title="Cost of Sales Trend">
            <InteractiveChart
              points={chartMode === 'monthly' ? cosPoints : weekPoints.cos}
              color="#f87171"
              mode={chartMode}
              onModeChange={setChartMode}
              activeLabel={selMonths.length > 0 && chartMode === 'monthly'
                ? String(selMonths[selMonths.length-1]).padStart(2,'0') + '/' + String(selYear).substring(2)
                : undefined}
              chartType="bar"
            />
            <div className="chart-subtitle" style={{ marginTop: 4 }}>Cost of Sales · In Thousands</div>
          </Portlet>
        </div>

        {/* MIDDLE */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>

          {/* Quick Access — deep links to report tabs */}
          <Portlet title="Quick Access">
            <div className="quick-grid" style={{ padding: '2px 0' }}>
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
                  <th>Indicator</th>
                  <th style={{ textAlign:'right', color:'#fb923c' }}>Current</th>
                  <th style={{ textAlign:'right' }}>Previous</th>
                  <th style={{ textAlign:'right', color:'#fbbf24' }}>Current vs Previous</th>
                  <th style={{ textAlign:'right', color:'#60a5fa' }}>Current YTD</th>
                  <th style={{ textAlign:'right' }}>Previous YTD</th>
                  <th style={{ textAlign:'right', color:'#fbbf24' }}>Current vs Prev YTD</th>
                  <th style={{ textAlign:'center' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {loading
                  ? Array.from({ length: 6 }).map((_, i) => (
                      <tr key={i}>
                        {[100,70,60,110,70,60,110,50].map((w,j) => (
                          <td key={j} style={{ padding:'9px 8px' }}><Sk w={w} /></td>
                        ))}
                      </tr>
                    ))
                  : kpiRows.map(row => (
                      <tr key={row.indicator} style={row.isSubtotal ? { background: 'rgba(251,146,60,0.04)', borderTop: '0.5px solid rgba(251,146,60,0.15)' } : {}}>
                        <td className="indicator" style={row.isSubtotal ? { color: '#fb923c', fontWeight: 600 } : row.indicator.startsWith('─') ? { color: 'rgba(255,255,255,0.2)', fontSize: 10 } : {}}>{row.indicator}</td>
                        <td className="mono" style={{ textAlign:'right', color:'#fb923c', fontWeight:500 }}>{row.current}</td>
                        <td className="mono" style={{ textAlign:'right', color:'rgba(255,255,255,0.4)' }}>{row.previous}</td>
                        <td style={{ textAlign:'right', fontSize:10, color: row.vsP==='—' ? 'rgba(255,255,255,0.25)' : row.vsPPos ? '#4ade80' : '#f87171' }}>{row.vsP}</td>
                        <td className="mono" style={{ textAlign:'right', color:'#60a5fa' }}>{row.ytd}</td>
                        <td className="mono" style={{ textAlign:'right', color:'rgba(255,255,255,0.4)' }}>{row.prevYtd}</td>
                        <td style={{ textAlign:'right', fontSize:10, color: row.vsYtd==='—' ? 'rgba(255,255,255,0.25)' : row.vsYtdPos ? '#4ade80' : '#f87171' }}>{row.vsYtd}</td>
                        <td style={{ textAlign:'center' }}>
                          <span style={{ fontSize:10, color: row.statusPos ? '#4ade80' : '#f87171', background: row.statusPos ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)', padding:'2px 7px', borderRadius:20, display:'inline-flex', alignItems:'center', gap:3 }}>
                            {row.statusPos ? '▲' : '▼'} YTD
                          </span>
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
                <tr>
                  <th style={{ textAlign:'left', minWidth: 110 }}>Indicator</th>
                  <th>Today</th>
                  <th>This Week</th>
                  <th style={{ color:'#fb923c' }}>Current</th>
                  <th style={{ color:'#a78bfa' }}>Budget</th>
                  <th style={{ color:'#fbbf24' }}>Current vs Budget</th>
                  <th style={{ color:'#60a5fa' }}>Current YTD</th>
                  <th style={{ color:'#a78bfa' }}>Budget YTD</th>
                  <th style={{ color:'#fbbf24' }}>Current vs Bud YTD</th>
                  <th style={{ textAlign:'center', color:'rgba(255,255,255,0.3)' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {finRows.map(row => (
                  <tr key={row.indicator} style={row.isSubtotal ? { background:'rgba(251,146,60,0.04)', borderTop:'0.5px solid rgba(251,146,60,0.15)' } : {}}>
                    <td style={{ fontFamily:"'IBM Plex Sans',sans-serif", textAlign:'left',
                      color: row.indicator.startsWith('─') ? 'rgba(255,255,255,0.2)' : row.isSubtotal ? '#fb923c' : '#e2dfd8',
                      fontWeight: row.isSubtotal ? 600 : 400, fontSize: row.indicator.startsWith('─') ? 9 : undefined }}>{row.indicator}</td>
                    <td style={{ color: row.today !== '—' ? '#f1ede8' : undefined }}>{row.today}</td>
                    <td style={{ color: row.thisWeek !== '—' ? '#f1ede8' : undefined }}>{row.thisWeek}</td>
                    <td style={{ color:'#fb923c', fontWeight: 500 }}>{row.current}</td>
                    <td style={{ color:'rgba(167,139,250,0.8)' }}>{row.budget}</td>
                    <td style={{ color: row.varBud === '—' ? 'rgba(255,255,255,0.25)' : row.varBudPos ? '#4ade80' : '#f87171', fontSize: 10 }}>{row.varBud}</td>
                    <td style={{ color:'#60a5fa' }}>{row.ytd}</td>
                    <td style={{ color:'rgba(167,139,250,0.8)' }}>{row.budgetYtd}</td>
                    <td style={{ color: row.varYtd === '—' ? 'rgba(255,255,255,0.25)' : row.varYtdPos ? '#4ade80' : '#f87171', fontSize: 10 }}>{row.varYtd}</td>
                    <td style={{ textAlign:'center' }}>
                      <span style={{ fontSize:10, color: row.statusPos ? '#4ade80' : '#f87171', background: row.statusPos ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)', padding:'2px 7px', borderRadius:20, display:'inline-flex', alignItems:'center', gap:3 }}>
                        {row.statusPos ? '▲' : '▼'} YTD
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Portlet>
        </div>

        {/* RIGHT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <Portlet title="Revenue By Period Trend">
            <InteractiveChart
              points={chartMode === 'monthly' ? revPoints : weekPoints.rev}
              color="#4ade80"
              mode={chartMode}
              onModeChange={setChartMode}
              activeLabel={selMonths.length > 0 && chartMode === 'monthly'
                ? String(selMonths[selMonths.length-1]).padStart(2,'0') + '/' + String(selYear).substring(2)
                : undefined}
              chartType="line"
            />
            <div className="chart-subtitle" style={{ marginTop: 4 }}>Revenue · In Thousands</div>
          </Portlet>

          <Portlet title="Expenses By Period Trend">
            <InteractiveChart
              points={chartMode === 'monthly' ? expPoints : weekPoints.exp}
              color="#f87171"
              mode={chartMode}
              onModeChange={setChartMode}
              activeLabel={selMonths.length > 0 && chartMode === 'monthly'
                ? String(selMonths[selMonths.length-1]).padStart(2,'0') + '/' + String(selYear).substring(2)
                : undefined}
              chartType="line"
            />
            <div className="chart-subtitle" style={{ marginTop: 4 }}>Expenses · In Thousands</div>
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