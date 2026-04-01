"use client";

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useRouter }     from 'next/navigation';
import ERPShell          from '@/components/layout/ERPShell';
import { ERPTable, ERPColumn } from '@/components/ui/ERPTable';
import { ERPFilterBar, ERPFilter, useERPFilters, applyERPFilters } from '@/components/ui/ERPFilterBar';
import { warehousesApi } from '@/lib/api/warehouses';
import apiClient         from '@/lib/api/client';
import { Warehouse }     from '@/lib/api/types';

// ─── Types ────────────────────────────────────────────────────────────────────

type SessionStatus = 'draft' | 'in_progress' | 'pending_approval' | 'approved' | 'posted' | 'cancelled';

interface CountSession {
  id:                 string;
  sessionNumber:      string;
  warehouseId:        string;
  warehouse:          { id: string; code: string; name: string };
  description:        string | null;
  countDate:          string;
  status:             SessionStatus;
  totalLinesCount:    number | null;
  linesWithVariance:  number | null;
  totalVarianceValue: number | null;
  createdAt:          string;
  _count:             { lines: number };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONO: React.CSSProperties = { fontFamily: "'IBM Plex Mono', monospace" };

function fmtAmt(v: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(v);
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const STATUS_CFG: Record<SessionStatus, { color: string; bg: string; border: string; label: string }> = {
  draft:            { color: 'rgba(255,255,255,0.4)', bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.1)', label: 'Draft'            },
  in_progress:      { color: '#60a5fa',               bg: 'rgba(96,165,250,0.1)',   border: 'rgba(96,165,250,0.2)',  label: 'In Progress'      },
  pending_approval: { color: '#fbbf24',               bg: 'rgba(251,191,36,0.1)',   border: 'rgba(251,191,36,0.2)', label: 'Pending Approval' },
  approved:         { color: '#a78bfa',               bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.2)', label: 'Approved'         },
  posted:           { color: '#4ade80',               bg: 'rgba(74,222,128,0.1)',   border: 'rgba(74,222,128,0.2)', label: 'Posted'           },
  cancelled:        { color: '#f87171',               bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.2)', label: 'Cancelled'        },
};

const STATUS_ORDER: Record<SessionStatus, number> = {
  draft: 0, in_progress: 1, pending_approval: 2, approved: 3, posted: 4, cancelled: 5,
};

// ─── Create Session Modal ─────────────────────────────────────────────────────

function CreateSessionModal({
  warehouses, onClose, onCreate,
}: { warehouses: Warehouse[]; onClose: () => void; onCreate: (data: any) => Promise<void> }) {
  const [warehouseId,  setWarehouseId]  = useState('');
  const [description,  setDescription]  = useState('');
  const [countDate,    setCountDate]    = useState(new Date().toISOString().split('T')[0]);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState('');

  const handleSubmit = async () => {
    if (!warehouseId) { setError('Warehouse is required'); return; }
    setSaving(true); setError('');
    try {
      await onCreate({ warehouseId, description: description || undefined, countDate });
      onClose();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Failed to create session');
    } finally { setSaving(false); }
  };

  const INP: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.1)',
    borderRadius: 7, padding: '8px 12px', fontSize: 13, fontFamily: "'IBM Plex Sans',sans-serif",
    color: '#e2dfd8', outline: 'none', width: '100%', boxSizing: 'border-box',
  };
  const LBL: React.CSSProperties = { fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(251,146,60,0.6)', marginBottom: 5 };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#0a0712', border: '0.5px solid rgba(251,146,60,0.2)', borderRadius: 12, padding: 28, width: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.8)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <span style={{ fontSize: 15, fontWeight: 500, color: '#e2dfd8' }}>New Cycle Count Session</span>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 18 }}>×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={LBL}>Warehouse *</div>
            <select style={INP} value={warehouseId} onChange={e => setWarehouseId(e.target.value)}>
              <option value="">Select warehouse…</option>
              {warehouses.map(w => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
            </select>
          </div>
          <div>
            <div style={LBL}>Count Date</div>
            <input style={INP} type="date" value={countDate} onChange={e => setCountDate(e.target.value)} />
          </div>
          <div>
            <div style={LBL}>Description</div>
            <input style={INP} type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional description…" />
          </div>
        </div>

        {error && (
          <div style={{ marginTop: 12, background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.2)', borderRadius: 7, padding: '8px 12px', fontSize: 12, color: '#fca5a5' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, marginTop: 20, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '8px 16px', fontSize: 12, fontFamily: "'IBM Plex Sans',sans-serif", color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving} style={{ background: 'linear-gradient(135deg,#c2410c,#ea580c,#f97316)', border: 'none', borderRadius: 7, padding: '8px 20px', fontSize: 12, fontWeight: 500, fontFamily: "'IBM Plex Sans',sans-serif", color: 'white', cursor: saving ? 'wait' : 'pointer', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Creating…' : 'Create Session'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Columns ─────────────────────────────────────────────────────────────────

function buildColumns(onOpen: (id: string) => void): ERPColumn<CountSession>[] {
  return [
    {
      key: 'status', header: 'Status', width: 150, sortable: true,
      value: r => STATUS_ORDER[r.status],
      render: r => {
        const c = STATUS_CFG[r.status];
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', padding: '2px 8px', borderRadius: 20, fontSize: 10, fontWeight: 500, color: c.color, background: c.bg, border: `0.5px solid ${c.border}`, whiteSpace: 'nowrap' }}>
            {c.label}
          </span>
        );
      },
    },
    {
      key: 'sessionNumber', header: 'Session', width: 160, sortable: true,
      value: r => r.sessionNumber,
      render: r => (
        <button
          onClick={() => onOpen(r.id)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left' }}>
          <span style={{ ...MONO, fontSize: 12, color: '#fb923c', fontWeight: 500, textDecoration: 'underline', textDecorationColor: 'rgba(251,146,60,0.3)' }}>{r.sessionNumber}</span>
        </button>
      ),
    },
    {
      key: 'warehouse', header: 'Warehouse', width: 160, sortable: true,
      value: r => r.warehouse.code,
      render: r => (
        <div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{r.warehouse.code}</div>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 1 }}>{r.warehouse.name}</div>
        </div>
      ),
    },
    {
      key: 'countDate', header: 'Count Date', width: 120, sortable: true,
      value: r => r.countDate,
      render: r => <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{fmtDate(r.countDate)}</span>,
    },
    {
      key: 'lines', header: 'Items', width: 80, align: 'right', sortable: true,
      value: r => r._count.lines,
      render: r => <span style={{ ...MONO, fontSize: 12, color: '#e2dfd8' }}>{r._count.lines}</span>,
    },
    {
      key: 'linesWithVariance', header: 'Variances', width: 100, align: 'right', sortable: true,
      value: r => r.linesWithVariance ?? 0,
      render: r => r.linesWithVariance !== null
        ? <span style={{ ...MONO, fontSize: 12, color: r.linesWithVariance > 0 ? '#fbbf24' : '#4ade80' }}>{r.linesWithVariance}</span>
        : <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>—</span>,
    },
    {
      key: 'totalVarianceValue', header: 'Variance Value', width: 140, align: 'right', sortable: true,
      value: r => r.totalVarianceValue ?? 0,
      render: r => r.totalVarianceValue !== null
        ? <span style={{ ...MONO, fontSize: 12, fontWeight: 500, color: r.totalVarianceValue < 0 ? '#f87171' : r.totalVarianceValue > 0 ? '#fbbf24' : '#4ade80' }}>{fmtAmt(r.totalVarianceValue)}</span>
        : <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>—</span>,
    },
    {
      key: 'description', header: 'Description', sortable: false,
      value: r => r.description ?? '',
      render: r => r.description ? <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{r.description}</span> : null,
    },
  ];
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StockReconciliationPage() {
  const router = useRouter();
  const [sessions,   setSessions]   = useState<CountSession[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [showCreate, setShowCreate] = useState(false);

  const filters = useMemo((): ERPFilter<CountSession>[] => [
    {
      key: 'status', label: 'Status', type: 'multiselect',
      options: (Object.entries(STATUS_CFG) as [SessionStatus, typeof STATUS_CFG[SessionStatus]][]).map(([v, c]) => ({
        value: v, label: c.label, color: c.color, bg: c.bg, border: c.border,
      })),
      filterFn: (row, val) => (val as string[]).includes(row.status),
    },
    {
      key: 'warehouseSearch', label: 'Warehouse', type: 'search',
      placeholder: 'Code or name…', inputWidth: 160,
      filterFn: (row, val) =>
        row.warehouse.code.toLowerCase().includes(String(val).toLowerCase()) ||
        row.warehouse.name.toLowerCase().includes(String(val).toLowerCase()),
    },
    {
      key: 'hasVariance', label: 'Has Variance', type: 'boolean',
      placeholder: 'Only sessions with variance',
      filterFn: (row, val) => val === true ? (row.linesWithVariance ?? 0) > 0 : true,
    },
  ], []);

  const { values, setValue, reset, activeCount } = useERPFilters(filters);

  const fetchData = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const [sess, whs] = await Promise.all([
        apiClient.get('/stock-reconciliation'),
        warehousesApi.getAll(),
      ]);
      setSessions(sess.data as CountSession[]);
      setWarehouses(whs as Warehouse[]);
    } catch { setError('Failed to load sessions.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async (dto: any) => {
    await apiClient.post('/stock-reconciliation', dto);
    await fetchData();
  };

  const filtered = useMemo(() => applyERPFilters(sessions, filters, values), [sessions, filters, values]);
  const columns  = useMemo(() => buildColumns(id => router.push(`/inventory/stock-reconciliation/${id}`)), [router]);

  // KPI summaries
  const kpis = useMemo(() => ({
    total:       sessions.length,
    inProgress:  sessions.filter(s => s.status === 'in_progress').length,
    pending:     sessions.filter(s => s.status === 'pending_approval').length,
    posted:      sessions.filter(s => s.status === 'posted').length,
  }), [sessions]);

  return (
    <ERPShell breadcrumbs={['Home', 'Inventory', 'Stock Reconciliation']} title="Stock Reconciliation">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&display=swap');
        .sr-page  { padding: 0 18px 16px; display: flex; flex-direction: column; gap: 10px; height: 100%; overflow: hidden; }
        .sr-kpis  { display: grid; grid-template-columns: repeat(4,1fr); gap: 8px; flex-shrink: 0; }
        .sr-kpi   { background: rgba(10,7,18,0.7); border-radius: 9px; padding: 10px 14px; }
        .sr-kpi-l { font-size: 9px; font-weight: 500; letter-spacing: 0.1em; text-transform: uppercase; color: rgba(255,255,255,0.3); margin-bottom: 4px; }
        .sr-kpi-v { font-size: 22px; font-weight: 500; font-family: 'IBM Plex Mono', monospace; }
        .sr-filters { display: flex; align-items: flex-end; gap: 10px; flex-wrap: wrap; flex-shrink: 0; }
        .sr-table   { flex: 1; min-height: 0; display: flex; flex-direction: column; }
        .sr-error   { background: rgba(239,68,68,0.08); border: 0.5px solid rgba(239,68,68,0.2); border-radius: 8px; padding: 10px 14px; font-size: 13px; color: #fca5a5; flex-shrink: 0; }
        .sr-btn-new { background: linear-gradient(135deg,#c2410c,#ea580c,#f97316); border: none; border-radius: 7px; padding: 7px 16px; font-size: 12px; font-weight: 500; font-family: 'IBM Plex Sans',sans-serif; color: white; cursor: pointer; }
      `}</style>

      <div className="sr-page">

        {/* KPI bar */}
        <div className="sr-kpis">
          {[
            { label: 'Total Sessions',  value: String(kpis.total),      color: '#f1ede8', border: 'rgba(255,255,255,0.07)' },
            { label: 'In Progress',     value: String(kpis.inProgress), color: '#60a5fa', border: 'rgba(96,165,250,0.15)'  },
            { label: 'Pending Approval',value: String(kpis.pending),    color: '#fbbf24', border: 'rgba(251,191,36,0.15)'  },
            { label: 'Posted',          value: String(kpis.posted),     color: '#4ade80', border: 'rgba(74,222,128,0.15)'  },
          ].map(k => (
            <div key={k.label} className="sr-kpi" style={{ border: `0.5px solid ${k.border}` }}>
              <div className="sr-kpi-l">{k.label}</div>
              <div className="sr-kpi-v" style={{ color: k.color }}>{k.value}</div>
            </div>
          ))}
        </div>

        {error && <div className="sr-error">{error}</div>}

        {/* Filters + New button */}
        <div className="sr-filters">
          <ERPFilterBar filters={filters} values={values} onChange={setValue} onReset={reset} activeCount={activeCount} />
          <button className="sr-btn-new" onClick={() => setShowCreate(true)} style={{ alignSelf: 'flex-end' }}>
            + New Session
          </button>
        </div>

        {/* Table */}
        <div className="sr-table">
          <ERPTable<CountSession>
            columns={columns}
            data={filtered}
            rowKey={r => r.id}
            loading={loading}
            exportFilename={`stock-reconciliation-${new Date().toISOString().split('T')[0]}`}
            emptyMessage="No cycle count sessions. Create one to start a physical inventory."
            defaultPageSize={20}
            maxHeight="calc(100vh - 340px)"
            toolbarLeft={
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: "'IBM Plex Mono', monospace" }}>
                {filtered.length} of {sessions.length} sessions
              </span>
            }
          />
        </div>
      </div>

      {showCreate && (
        <CreateSessionModal
          warehouses={warehouses}
          onClose={() => setShowCreate(false)}
          onCreate={handleCreate}
        />
      )}
    </ERPShell>
  );
}