"use client";

import { useRouter } from 'next/navigation';
import ERPShell from '@/components/layout/ERPShell';

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

// ─── Mock data ────────────────────────────────────────────────────────────────

const KPI_ROWS: KpiRow[] = [
  { indicator: 'Revenue',             period: 'This Period vs. Last Period',    current: '$524,890',   previous: '$468,908', change: '11.9%', positive: true  },
  { indicator: 'Expenses',            period: 'This Period vs. Last Period',    current: '$438,801',   previous: '$401,297', change: '9.3%',  positive: false },
  { indicator: 'Operating Cash Flow', period: 'This Period vs. Last Period',    current: '$143,221',   previous: '-$21,251', change: 'N/A',   positive: true  },
  { indicator: 'Total Bank Balance',  period: 'This Period vs. Last Period',    current: '$1,011,896', previous: '$868,675', change: '16.5%', positive: true  },
  { indicator: 'Payables',            period: 'Today vs. Same Day Last Month',  current: '$477,173',   previous: '$405,645', change: '17.6%', positive: false },
  { indicator: 'Receivables',         period: 'Today vs. Same Day Last Month',  current: '$476,982',   previous: '$357,768', change: '33.3%', positive: true  },
];

const FIN_ROWS: FinRow[] = [
  { indicator: 'Bank Balance',   today: '$868,674', thisWeek: '$979,996',  thisMonth: '$1,011,896', lastMonth: '$868,675' },
  { indicator: 'Revenue',        today: '$0',       thisWeek: '$159,008',  thisMonth: '$524,890',   lastMonth: '$468,908' },
  { indicator: 'Cost of Goods',  today: '$0',       thisWeek: '$95,372',   thisMonth: '$318,415',   lastMonth: '$284,967' },
  { indicator: 'Gross Margin',   today: '$0',       thisWeek: '$63,636',   thisMonth: '$206,475',   lastMonth: '$183,941' },
  { indicator: 'Gross Margin %', today: 'N/A',      thisWeek: '40.02%',    thisMonth: '39.34%',     lastMonth: '39.23%'  },
  { indicator: 'Expenses',       today: '$0',       thisWeek: '$95,372',   thisMonth: '$438,801',   lastMonth: '$401,297' },
];

const QUICK_ACCESS = [
  { label: 'Balance Sheet',    color: '#fb923c', bg: 'rgba(251,146,60,0.12)',  border: 'rgba(251,146,60,0.2)',  href: '/accounting/reports' },
  { label: 'Trial Balance',    color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',   border: 'rgba(96,165,250,0.18)', href: '/accounting/reports' },
  { label: 'Income Statement', color: '#4ade80', bg: 'rgba(74,222,128,0.1)',   border: 'rgba(74,222,128,0.18)', href: '/accounting/reports' },
  { label: 'Budget vs Actual', color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.18)',href: '/accounting/budgets' },
];

// ─── Mini charts ──────────────────────────────────────────────────────────────

const BAR_HEIGHTS = [52,48,55,50,58,54,60,56,62,59,65,61,70,68,74,72,78,75,80,76,82,79,85];

function MiniBarChart({ color = '#fb923c' }: { color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 60 }}>
      {BAR_HEIGHTS.map((h, i) => (
        <div key={i} style={{
          width: 6, height: `${h}%`,
          background: i === BAR_HEIGHTS.length - 1 ? color : `${color}55`,
          borderRadius: '2px 2px 0 0', flex: '0 0 auto',
        }} />
      ))}
    </div>
  );
}

function MiniLineChart({ color = '#4ade80' }: { color?: string }) {
  const pts = [40,38,42,36,44,40,46,42,50,46,52,48,56,50,58,52,60,54,64,58,68,62,72];
  const w = 220, h = 60;
  const xs = pts.map((_, i) => (i / (pts.length - 1)) * w);
  const ys = pts.map(v => h - (v / 80) * h);
  const d = xs.map((x, i) => `${i === 0 ? 'M' : 'L'}${x},${ys[i]}`).join(' ');
  const area = d + ` L${w},${h} L0,${h} Z`;
  return (
    <svg width="100%" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ height: 60 }}>
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#lg)" />
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

// ─── Dashboard content ────────────────────────────────────────────────────────

function DashboardContent() {
  const router = useRouter();

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap');

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
        <div className="db-title">Home</div>
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
            <MiniBarChart color="#fb923c" />
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
            <MiniBarChart color="#60a5fa" />
            <div className="chart-title" style={{ marginTop: 8 }}>Weekly New Business</div>
            <div className="chart-subtitle">In Thousands</div>
          </Portlet>
        </div>

        {/* MIDDLE */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Quick Access */}
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

          {/* KPIs */}
          <Portlet title="Key Performance Indicators">
            <div className="kpi-heroes">
              {[
                { label: 'Revenue',      value: '11.9%', color: '#4ade80', up: true },
                { label: 'Expenses',     value: '9.3%',  color: '#f87171', up: false },
                { label: 'Cash Flow',    value: 'N/A',   color: 'rgba(255,255,255,0.4)', up: true },
                { label: 'Bank Balance', value: '16.5%', color: '#4ade80', up: true },
              ].map(k => (
                <div key={k.label} className="kpi-hero">
                  <div className="kpi-hero-label">{k.label}</div>
                  <div className="kpi-hero-value" style={{ color: k.color, fontSize: k.value === 'N/A' ? 18 : 22 }}>
                    {k.value !== 'N/A' && <span style={{ fontSize: 14 }}>{k.up ? '▲' : '▼'}</span>}
                    {k.value}
                  </div>
                </div>
              ))}
            </div>
            <table className="kpi-table">
              <thead>
                <tr>
                  <th>Indicator</th><th>Period</th>
                  <th style={{ textAlign: 'right' }}>Current</th>
                  <th style={{ textAlign: 'right' }}>Previous</th>
                  <th style={{ textAlign: 'center' }}>Change</th>
                </tr>
              </thead>
              <tbody>
                {KPI_ROWS.map(row => (
                  <tr key={row.indicator}>
                    <td className="indicator">{row.indicator}</td>
                    <td className="period">{row.period}</td>
                    <td className="mono" style={{ textAlign: 'right' }}>{row.current}</td>
                    <td className="mono" style={{ textAlign: 'right', color: 'rgba(255,255,255,0.4)' }}>{row.previous}</td>
                    <td style={{ textAlign: 'center' }}><Delta value={row.change} positive={row.positive} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Portlet>

          {/* Financials */}
          <Portlet title="Financials">
            <div className="fin-heroes">
              {[
                { label: 'Gross Margin %',        value: '39.34%' },
                { label: 'Net Income % of Sales', value: '16.40%' },
                { label: 'Bank Balance',          value: '$868,674' },
                { label: 'EBITDA',                value: '$86,089' },
              ].map(f => (
                <div key={f.label} className="fin-hero">
                  <div className="fin-hero-label">{f.label}</div>
                  <div className="fin-hero-value">{f.value}</div>
                </div>
              ))}
            </div>
            <table className="fin-table">
              <thead>
                <tr><th>Indicator</th><th>Today</th><th>This Week</th><th>This Month</th><th>Last Month</th></tr>
              </thead>
              <tbody>
                {FIN_ROWS.map(row => (
                  <tr key={row.indicator}>
                    <td>{row.indicator}</td>
                    <td>{row.today}</td>
                    <td>{row.thisWeek}</td>
                    <td>{row.thisMonth}</td>
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
            <MiniLineChart color="#4ade80" />
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
            <MiniLineChart color="#f87171" />
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