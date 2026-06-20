'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import { ERPTable, ERPColumn } from '@/components/ui/ERPTable';
import {
  ERPFilterBar, ERPFilter,
  useERPFilters, applyERPFilters,
} from '@/components/ui/ERPFilterBar';
import { ErrorState } from '@/components/ui/ErrorState';
import { asErrorResponse, ErrorResponse } from '@/lib/api/errors';
import {
  notificationsApi,
  Notification,
  NotificationDrainResult,
} from '@/lib/api/notifications';

// ─── Config ─────────────────────────────────────────────────────────────────

const STATUS_CFG: Record<string, { color: string; bg: string; label: string }> = {
  pending:   { color: 'var(--warning)', bg: 'rgba(251,191,36,0.1)',  label: 'Pending'   },
  sent:      { color: 'var(--success)', bg: 'rgba(74,222,128,0.1)',  label: 'Sent'      },
  failed:    { color: 'var(--danger)', bg: 'rgba(248,113,113,0.1)', label: 'Failed'    },
  cancelled: { color: 'rgba(255,255,255,0.4)', bg: 'rgba(255,255,255,0.05)', label: 'Cancelled' },
};

const TYPE_CFG: Record<string, { color: string; label: string }> = {
  so_confirmed:        { color: 'var(--success)', label: 'SO Confirmed'   },
  po_created:          { color: 'var(--accent-strong)', label: 'PO Created'      },
  rfq_sent:            { color: 'var(--accent-blue)', label: 'RFQ Sent'        },
  invoice_overdue:     { color: 'var(--danger)', label: 'Invoice Overdue' },
  stock_below_reorder: { color: 'var(--warning)', label: 'Low Stock'       },
};

const BTN = (variant: 'primary' | 'ghost' | 'danger' = 'ghost'): React.CSSProperties => ({
  border: 'none', borderRadius: 7, padding: '6px 12px', fontSize: 11, fontWeight: 600,
  cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif",
  background: variant === 'primary' ? 'linear-gradient(135deg,var(--accent-pressed),var(--accent),var(--accent-mid))'
    : variant === 'danger' ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.06)',
  color: variant === 'primary' ? 'white' : variant === 'danger' ? 'var(--danger)' : 'rgba(255,255,255,0.6)',
  outline: variant === 'danger' ? '0.5px solid rgba(239,68,68,0.2)' : 'none',
});

function StatusBadge({ status }: { status: string }) {
  const c = STATUS_CFG[status] ?? STATUS_CFG.pending;
  return (
    <span style={{
      display: 'inline-block', padding: '2px 9px', borderRadius: 5, fontSize: 11, fontWeight: 600,
      color: c.color, background: c.bg,
    }}>{c.label}</span>
  );
}

function IconBell() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

const fmtDate = (s: string | null) =>
  s ? new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

// ─── Page ───────────────────────────────────────────────────────────────────

export default function NotificationsPage() {
  const [rows, setRows] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<ErrorResponse | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [drainMsg, setDrainMsg] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await notificationsApi.getAll());
      setLoadError(null);
    } catch (e) {
      // spec-frontend-002 §5 — render an in-place ErrorState from the normalized
      // error instead of a banner string for the initial-load failure.
      setLoadError(asErrorResponse(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const counts = useMemo(() => {
    const c = { pending: 0, sent: 0, failed: 0, cancelled: 0 };
    for (const r of rows) if (r.status in c) (c as any)[r.status]++;
    return c;
  }, [rows]);

  async function act(fn: () => Promise<unknown>, id: string) {
    setBusy(id);
    try { await fn(); await load(); }
    catch (e: any) { setError(e?.response?.data?.message ?? 'Action failed'); }
    finally { setBusy(null); }
  }

  async function drain() {
    setBusy('drain');
    setDrainMsg('');
    try {
      const r: NotificationDrainResult = await notificationsApi.drain();
      setDrainMsg(`Drained: ${r.sent} sent, ${r.failed} failed (${r.attempted} attempted)`);
      await load();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Drain failed');
    } finally { setBusy(null); }
  }

  const columns: ERPColumn<Notification>[] = [
    {
      key: 'type', header: 'Type', width: 150, sortable: true, value: r => r.type,
      render: r => {
        const c = TYPE_CFG[r.type] ?? { color: 'rgba(255,255,255,0.6)', label: r.type };
        return <span style={{ fontSize: 12, fontWeight: 600, color: c.color }}>{c.label}</span>;
      },
    },
    {
      key: 'recipient', header: 'Recipient', width: 220, sortable: true,
      value: r => r.recipientEmail ?? '',
      render: r => (
        <div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.75)' }}>{r.recipientEmail ?? '—'}</div>
          {r.recipientName && <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>{r.recipientName}</div>}
        </div>
      ),
    },
    {
      key: 'subject', header: 'Subject', sortable: true, value: r => r.subject,
      render: r => <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{r.subject}</span>,
    },
    {
      key: 'channel', header: 'Channel', width: 90, sortable: true, value: r => r.channel,
      render: r => <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', textTransform: 'uppercase' }}>{r.channel}</span>,
    },
    {
      key: 'status', header: 'Status', width: 110, sortable: true, value: r => r.status,
      render: r => (
        <div>
          <StatusBadge status={r.status} />
          {r.retryCount > 0 && <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>retries: {r.retryCount}</div>}
        </div>
      ),
    },
    {
      key: 'createdAt', header: 'Created', width: 130, sortable: true,
      value: r => r.createdAt,
      render: r => (
        <div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{fmtDate(r.createdAt)}</div>
          {r.sentAt && <div style={{ fontSize: 9, color: 'var(--success)', marginTop: 1 }}>sent {fmtDate(r.sentAt)}</div>}
        </div>
      ),
    },
    {
      key: 'actions', header: '', width: 150,
      render: r => {
        const canRetry = r.status === 'failed' || r.status === 'pending';
        const canCancel = r.status === 'pending' || r.status === 'failed';
        if (!canRetry && !canCancel) return null;
        return (
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            {canRetry && (
              <button style={BTN('ghost')} disabled={busy === r.id}
                onClick={() => act(() => notificationsApi.retry(r.id), r.id)}>Retry</button>
            )}
            {canCancel && (
              <button style={BTN('danger')} disabled={busy === r.id}
                onClick={() => act(() => notificationsApi.cancel(r.id), r.id)}>Cancel</button>
            )}
          </div>
        );
      },
    },
  ];

  const filterDefs: ERPFilter<Notification>[] = useMemo(() => [
    {
      key: 'status', label: 'Status', type: 'multiselect',
      options: Object.entries(STATUS_CFG).map(([v, c]) => ({ value: v, label: c.label })),
      filterFn: (row, val) => (val as string[]).includes(row.status),
    },
    {
      key: 'type', label: 'Type', type: 'multiselect',
      options: Object.entries(TYPE_CFG).map(([v, c]) => ({ value: v, label: c.label })),
      filterFn: (row, val) => (val as string[]).includes(row.type),
    },
    {
      key: 'channel', label: 'Channel', type: 'multiselect',
      options: [{ value: 'email', label: 'Email' }, { value: 'in_app', label: 'In-App' }],
      filterFn: (row, val) => (val as string[]).includes(row.channel),
    },
  ], []);

  const { values: filterVals, setValue: setFilterVal, reset: resetFilters, activeCount: filterCount } = useERPFilters(filterDefs);

  const filtered = useMemo(
    () => applyERPFilters(rows, filterDefs, filterVals),
    [rows, filterDefs, filterVals],
  );

  const KPIS = [
    { label: 'Pending', value: counts.pending, color: STATUS_CFG.pending.color, border: 'rgba(251,191,36,0.2)' },
    { label: 'Sent', value: counts.sent, color: STATUS_CFG.sent.color, border: 'rgba(74,222,128,0.2)' },
    { label: 'Failed', value: counts.failed, color: STATUS_CFG.failed.color, border: 'rgba(248,113,113,0.2)' },
    { label: 'Cancelled', value: counts.cancelled, color: STATUS_CFG.cancelled.color, border: 'rgba(255,255,255,0.1)' },
  ];

  return (
    <ERPShell breadcrumbs={['Home', 'Settings', 'Notifications']} title="Notifications">
      <div style={{ padding: 20 }}>
        {/* Header actions */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(255,255,255,0.5)' }}>
            <IconBell />
            <span style={{ fontSize: 12 }}>
              Queue-first outbound notifications. The worker drains pending rows every 15s.
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {drainMsg && <span style={{ fontSize: 11, color: 'var(--success)' }}>{drainMsg}</span>}
            <button style={BTN('ghost')} disabled={busy === 'drain'} onClick={load}>Refresh</button>
            <button style={BTN('primary')} disabled={busy === 'drain'} onClick={drain}>
              {busy === 'drain' ? 'Draining…' : 'Drain queue now'}
            </button>
          </div>
        </div>

        {error && (
          <div style={{ marginBottom: 12, padding: '10px 14px', borderRadius: 7, fontSize: 12,
            color: 'var(--danger)', background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.2)' }}>
            {error}
          </div>
        )}

        {/* KPI cards */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
          {KPIS.map(k => (
            <div key={k.label} style={{
              padding: '12px 16px', borderRadius: 9, background: 'rgba(10,7,18,0.7)',
              border: `0.5px solid ${k.border}`,
            }}>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)' }}>{k.label}</div>
              <div style={{ fontSize: 22, fontWeight: 700, color: k.color, marginTop: 4 }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* spec-frontend-002 §5 — in-place error state on load failure */}
        {loadError && !loading ? (
          <ErrorState error={loadError} onRetry={load} />
        ) : (
          <>
            {/* Filter bar */}
            <div style={{ marginBottom: 10 }}>
              <ERPFilterBar
                filters={filterDefs}
                values={filterVals}
                onChange={setFilterVal}
                onReset={resetFilters}
                activeCount={filterCount}
              />
            </div>

            <ERPTable<Notification>
              columns={columns}
              data={filtered}
              rowKey={r => r.id}
              loading={loading}
              emptyMessage={filterCount
                ? 'No notifications match your filters.'
                : 'No notifications yet — they appear as the business emits events (SO confirmed, PO created, invoice overdue…).'}
              exportFilename="notifications"
            />
          </>
        )}
      </div>
    </ERPShell>
  );
}
