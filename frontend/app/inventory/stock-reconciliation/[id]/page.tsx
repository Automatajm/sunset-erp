"use client";

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter }              from 'next/navigation';
import ERPShell        from '@/components/layout/ERPShell';
import apiClient       from '@/lib/api/client';
import { PrintButton } from '@/components/print/PrintButton';
import { ConfirmModal, useModal } from '@/components/ui/modal';
import AssignmentModal from './AssignmentModal';

// ─── Types ────────────────────────────────────────────────────────────────────

type SessionStatus = 'draft' | 'in_progress' | 'pending_approval' | 'approved' | 'posted' | 'cancelled';
type LineStatus    = 'pending' | 'counted' | 'confirmed' | 'adjusted';
type ActiveField   = 'storage' | 'purchase';

interface CountLine {
  id:                  string;
  itemId:              string;
  item:                { id: string; code: string; name: string; itemType: string };
  systemStorageQty:    number;
  storageUom:          string;
  systemPurchaseQty:   number;
  purchaseUom:         string;
  unitCostSnapshot:    number;
  countedStorageQty:   number | null;
  countedPurchaseQty:  number | null;
  varianceStorageQty:  number | null;
  variancePurchaseQty: number | null;
  varianceValue:       number | null;
  status:              LineStatus;
  lotNumber:           string | null;
  notes:               string | null;
}

interface CountSession {
  id:                 string;
  sessionNumber:      string;
  warehouse:          { id: string; code: string; name: string };
  description:        string | null;
  countDate:          string;
  status:             SessionStatus;
  totalLinesCount:    number | null;
  linesWithVariance:  number | null;
  totalVarianceValue: number | null;
  approvalNotes:      string | null;
  lines:              CountLine[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONO: React.CSSProperties = { fontFamily: "'IBM Plex Mono', monospace" };

function fmtQty(v: number | null, digits = 3) {
  if (v === null || v === undefined) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(v);
}
function fmtAmt(v: number | null) {
  if (v === null || v === undefined) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(v);
}
function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const STATUS_CFG: Record<SessionStatus, { color: string; bg: string; border: string; label: string }> = {
  draft:            { color: 'rgba(255,255,255,0.4)', bg: 'rgba(255,255,255,0.05)', border: 'rgba(255,255,255,0.1)', label: 'Draft'            },
  in_progress:      { color: 'var(--accent-blue, #60a5fa)',               bg: 'rgba(96,165,250,0.1)',   border: 'rgba(96,165,250,0.2)',  label: 'In Progress'      },
  pending_approval: { color: 'var(--warning, #fbbf24)',               bg: 'rgba(251,191,36,0.1)',   border: 'rgba(251,191,36,0.2)', label: 'Pending Approval' },
  approved:         { color: 'var(--accent-violet, #a78bfa)',               bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.2)', label: 'Approved'         },
  posted:           { color: 'var(--success, #4ade80)',               bg: 'rgba(74,222,128,0.1)',   border: 'rgba(74,222,128,0.2)', label: 'Posted'           },
  cancelled:        { color: 'var(--danger, #f87171)',               bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.2)', label: 'Cancelled'        },
};

const LINE_CFG: Record<LineStatus, { color: string; label: string }> = {
  pending:   { color: 'rgba(255,255,255,0.3)', label: 'Pending'  },
  counted:   { color: 'var(--accent-blue, #60a5fa)',               label: 'Counted'  },
  confirmed: { color: 'var(--accent-violet, #a78bfa)',               label: 'Confirmed'},
  adjusted:  { color: 'var(--success, #4ade80)',               label: 'Adjusted' },
};

// ─── Sub-components ───────────────────────────────────────────────────────────

function QtyCell({ qty, uom, color }: { qty: number | null; uom: string; color: string }) {
  return (
    <div style={{ textAlign: 'right' }}>
      <div style={{ ...MONO, fontSize: 12, color }}>{fmtQty(qty)}</div>
      <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', marginTop: 1 }}>{uom}</div>
    </div>
  );
}

// ─── Count Row ────────────────────────────────────────────────────────────────

interface CountRowProps {
  line:    CountLine;
  canEdit: boolean;
  onSave:  (lineId: string, storageQty?: number, purchaseQty?: number, notes?: string) => Promise<void>;
}

function CountRow({ line, canEdit, onSave }: CountRowProps) {
  const [editing,       setEditing]       = useState(false);
  const [activeField,   setActiveField]   = useState<ActiveField>('storage');
  const [storageInput,  setStorageInput]  = useState('');
  const [purchaseInput, setPurchaseInput] = useState('');
  const [notes,         setNotes]         = useState(line.notes ?? '');
  const [saving,        setSaving]        = useState(false);

  const hasVariance   = line.variancePurchaseQty !== null && line.variancePurchaseQty !== 0;
  const varColor      = !hasVariance ? 'var(--success, #4ade80)' : (line.variancePurchaseQty ?? 0) > 0 ? 'var(--warning, #fbbf24)' : 'var(--danger, #f87171)';

  function startEditing() {
    setStorageInput(line.countedStorageQty  !== null ? String(line.countedStorageQty)  : '');
    setPurchaseInput(line.countedPurchaseQty !== null ? String(line.countedPurchaseQty) : '');
    setActiveField('storage');
    setEditing(true);
  }

  async function handleSave() {
    const sv = storageInput  !== '' ? parseFloat(storageInput)  : undefined;
    const pv = purchaseInput !== '' ? parseFloat(purchaseInput) : undefined;
    if (sv === undefined && pv === undefined) return;
    setSaving(true);
    try {
      if (activeField === 'storage') {
        await onSave(line.id, sv, undefined, notes || undefined);
      } else {
        await onSave(line.id, undefined, pv, notes || undefined);
      }
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  // Styles
  const INP_ON: React.CSSProperties = {
    background: 'rgba(96,165,250,0.08)',
    border: '0.5px solid rgba(96,165,250,0.4)',
    borderRadius: 5, padding: '4px 8px', fontSize: 12,
    fontFamily: "'IBM Plex Mono',monospace",
    color: 'var(--text-primary, #e2dfd8)', outline: 'none', width: 88,
    textAlign: 'right' as const,
  };
  const INP_OFF: React.CSSProperties = {
    background: 'rgba(255,255,255,0.02)',
    border: '0.5px solid rgba(255,255,255,0.06)',
    borderRadius: 5, padding: '4px 8px', fontSize: 12,
    fontFamily: "'IBM Plex Mono',monospace",
    color: 'rgba(255,255,255,0.25)', outline: 'none', width: 88,
    textAlign: 'right' as const, cursor: 'not-allowed',
  };
  const SWITCH_BTN: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)',
    border: '0.5px solid rgba(255,255,255,0.1)',
    borderRadius: 4, padding: '1px 6px', fontSize: 9,
    fontFamily: "'IBM Plex Sans',sans-serif",
    color: 'rgba(255,255,255,0.35)', cursor: 'pointer',
  };

  return (
    <tr style={{ borderBottom: '0.5px solid rgba(255,255,255,0.05)' }}>

      {/* Status */}
      <td style={{ padding: '8px 12px', width: 90 }}>
        <span style={{ fontSize: 10, color: LINE_CFG[line.status].color }}>
          {LINE_CFG[line.status].label}
        </span>
      </td>

      {/* Item */}
      <td style={{ padding: '8px 12px' }}>
        <div style={{ ...MONO, fontSize: 11, color: 'var(--accent-strong, #fb923c)' }}>{line.item.code}</div>
        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>{line.item.name}</div>
        {line.lotNumber && (
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.2)', marginTop: 1 }}>Lot: {line.lotNumber}</div>
        )}
      </td>

      {/* System storage */}
      <td style={{ padding: '8px 12px' }}>
        <QtyCell qty={line.systemStorageQty} uom={line.storageUom} color="var(--text-primary, #e2dfd8)" />
      </td>

      {/* System purchase */}
      <td style={{ padding: '8px 12px' }}>
        <QtyCell qty={line.systemPurchaseQty} uom={line.purchaseUom} color="var(--accent-strong, #fb923c)" />
      </td>

      {/* Counted storage */}
      <td style={{ padding: '8px 12px' }}>
        {editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {activeField === 'purchase' && (
                <button style={SWITCH_BTN} onClick={() => setActiveField('storage')}>edit</button>
              )}
              <input
                style={activeField === 'storage' ? INP_ON : INP_OFF}
                type="number" min="0" step="any"
                value={activeField === 'storage' ? storageInput : storageInput}
                readOnly={activeField !== 'storage'}
                autoFocus={activeField === 'storage'}
                onChange={e => { if (activeField === 'storage') setStorageInput(e.target.value); }}
                onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
              />
            </div>
            <span style={{ fontSize: 9, color: activeField === 'storage' ? 'var(--accent-blue, #60a5fa)' : 'rgba(255,255,255,0.2)' }}>
              {line.storageUom}{activeField !== 'storage' ? ' (auto)' : ''}
            </span>
          </div>
        ) : (
          <QtyCell qty={line.countedStorageQty} uom={line.storageUom} color="var(--accent-blue, #60a5fa)" />
        )}
      </td>

      {/* Counted purchase */}
      <td style={{ padding: '8px 12px' }}>
        {editing ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              {activeField === 'storage' && (
                <button style={SWITCH_BTN} onClick={() => setActiveField('purchase')}>edit</button>
              )}
              <input
                style={activeField === 'purchase' ? INP_ON : INP_OFF}
                type="number" min="0" step="any"
                value={activeField === 'purchase' ? purchaseInput : purchaseInput}
                readOnly={activeField !== 'purchase'}
                autoFocus={activeField === 'purchase'}
                onChange={e => { if (activeField === 'purchase') setPurchaseInput(e.target.value); }}
                onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') setEditing(false); }}
              />
            </div>
            <span style={{ fontSize: 9, color: activeField === 'purchase' ? 'var(--accent-strong, #fb923c)' : 'rgba(255,255,255,0.2)' }}>
              {line.purchaseUom}{activeField !== 'purchase' ? ' (auto)' : ''}
            </span>
          </div>
        ) : (
          <QtyCell qty={line.countedPurchaseQty} uom={line.purchaseUom} color="var(--accent-strong, #fb923c)" />
        )}
      </td>

      {/* Variance purchase */}
      <td style={{ padding: '8px 12px', textAlign: 'right' }}>
        {line.variancePurchaseQty !== null ? (
          <div>
            <div style={{ ...MONO, fontSize: 12, fontWeight: 600, color: varColor }}>
              {(line.variancePurchaseQty > 0 ? '+' : '') + fmtQty(line.variancePurchaseQty)}
            </div>
            <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', marginTop: 1 }}>{line.purchaseUom}</div>
          </div>
        ) : (
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>—</span>
        )}
      </td>

      {/* Variance value */}
      <td style={{ padding: '8px 12px', textAlign: 'right' }}>
        {line.varianceValue !== null
          ? <span style={{ ...MONO, fontSize: 12, fontWeight: 600, color: varColor }}>{fmtAmt(line.varianceValue)}</span>
          : <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>—</span>}
      </td>

      {/* WAC */}
      <td style={{ padding: '8px 12px', textAlign: 'right' }}>
        <span style={{ ...MONO, fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{fmtAmt(line.unitCostSnapshot)}</span>
      </td>

      {/* Actions */}
      <td style={{ padding: '8px 12px', width: 110 }}>
        {canEdit && (editing ? (
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{ background: 'rgba(74,222,128,0.1)', border: '0.5px solid rgba(74,222,128,0.2)', borderRadius: 5, padding: '3px 8px', fontSize: 10, color: 'var(--success, #4ade80)', cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif" }}>
              {saving ? '…' : 'Save'}
            </button>
            <button
              onClick={() => setEditing(false)}
              style={{ background: 'var(--l05, rgba(255,255,255,0.05))', border: '0.5px solid var(--w10, rgba(255,255,255,0.1))', borderRadius: 5, padding: '3px 8px', fontSize: 10, color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif" }}>
              ✕
            </button>
          </div>
        ) : (
          <button
            onClick={startEditing}
            style={{ background: 'rgba(96,165,250,0.08)', border: '0.5px solid rgba(96,165,250,0.2)', borderRadius: 5, padding: '3px 10px', fontSize: 10, color: 'var(--accent-blue, #60a5fa)', cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif" }}>
            {line.countedStorageQty !== null ? 'Edit' : 'Count'}
          </button>
        ))}
      </td>
    </tr>
  );
}

// ─── Approve Modal ────────────────────────────────────────────────────────────

function ApproveModal({ onClose, onApprove }: { onClose: () => void; onApprove: (notes: string) => Promise<void> }) {
  const [notes,  setNotes]  = useState('');
  const [saving, setSaving] = useState(false);

  async function handleApprove() {
    setSaving(true);
    try { await onApprove(notes); onClose(); }
    finally { setSaving(false); }
  }

  const INP: React.CSSProperties = {
    background: 'var(--l04, rgba(255,255,255,0.04))', border: '0.5px solid var(--w10, rgba(255,255,255,0.1))',
    borderRadius: 7, padding: '8px 12px', fontSize: 13,
    fontFamily: "'IBM Plex Sans',sans-serif", color: 'var(--text-primary, #e2dfd8)',
    outline: 'none', width: '100%', boxSizing: 'border-box' as const,
    minHeight: 80, resize: 'vertical' as const,
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: 'var(--bg, #0a0712)', border: '0.5px solid rgba(167,139,250,0.3)', borderRadius: 12, padding: 28, width: 400, boxShadow: '0 20px 60px rgba(0,0,0,0.8)' }}>
        <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary, #e2dfd8)', marginBottom: 16 }}>Approve Session</div>
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 10, letterSpacing: '0.08em', textTransform: 'uppercase' as const }}>Approval Notes (optional)</div>
        <textarea style={INP} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Notes for the audit trail…" />
        <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ background: 'var(--l04, rgba(255,255,255,0.04))', border: '0.5px solid var(--w10, rgba(255,255,255,0.1))', borderRadius: 7, padding: '8px 16px', fontSize: 12, fontFamily: "'IBM Plex Sans',sans-serif", color: 'var(--w50, rgba(255,255,255,0.5))', cursor: 'pointer' }}>Cancel</button>
          <button onClick={handleApprove} disabled={saving} style={{ background: 'linear-gradient(135deg,#6d28d9,#7c3aed,#8b5cf6)', border: 'none', borderRadius: 7, padding: '8px 20px', fontSize: 12, fontWeight: 500, fontFamily: "'IBM Plex Sans',sans-serif", color: 'white', cursor: saving ? 'wait' : 'pointer' }}>
            {saving ? 'Approving…' : 'Approve'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function StockReconciliationDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id     = params?.id as string;

  const [session,       setSession]       = useState<CountSession | null>(null);
  const [loading,       setLoading]       = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [error,         setError]         = useState('');
  const [showApprove,   setShowApprove]   = useState(false);
  const [showAssign,    setShowAssign]    = useState(false);
  const cancelModal = useModal(); // spec-frontend-002 adoption — replaces window.confirm
  const [filterStatus,  setFilterStatus]  = useState('all');

  const fetchSession = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await apiClient.get(`/stock-reconciliation/${id}`);
      setSession(res.data as CountSession);
    } catch {
      setError('Failed to load session.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchSession(); }, [fetchSession]);

  async function doAction(endpoint: string, body?: object) {
    setActionLoading(true); setError('');
    try {
      await apiClient.patch(`/stock-reconciliation/${id}/${endpoint}`, body ?? {});
      await fetchSession();
    } catch (e: any) {
      setError(e?.response?.data?.message ?? `Action failed: ${endpoint}`);
    } finally {
      setActionLoading(false);
    }
  }

  async function handleSaveLine(lineId: string, storageQty?: number, purchaseQty?: number, notes?: string) {
    await apiClient.patch(`/stock-reconciliation/${id}/lines`, {
      lineId,
      countedStorageQty:  storageQty,
      countedPurchaseQty: purchaseQty,
      notes,
    });
    await fetchSession();
  }

  if (loading) {
    return (
      <ERPShell breadcrumbs={['Home', 'Inventory', 'Stock Reconciliation', '…']} title="Loading…">
        <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Loading session…</div>
      </ERPShell>
    );
  }

  if (!session) return null;

  const sc           = STATUS_CFG[session.status];
  const canCount     = session.status === 'in_progress';
  const pendingCount = session.lines.filter(l => l.status === 'pending').length;
  const countedCount = session.lines.filter(l => l.status !== 'pending').length;
  const totalVar     = session.lines.reduce((s, l) => s + (l.varianceValue ?? 0), 0);

  const displayLines = (() => {
    if (filterStatus === 'pending')  return session.lines.filter(l => l.status === 'pending');
    if (filterStatus === 'counted')  return session.lines.filter(l => l.status === 'counted');
    if (filterStatus === 'variance') return session.lines.filter(l => (l.variancePurchaseQty ?? 0) !== 0);
    return session.lines;
  })();

  const SEL: React.CSSProperties = {
    background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.09)',
    borderRadius: 7, padding: '6px 10px', fontSize: 12,
    fontFamily: "'IBM Plex Sans',sans-serif", color: 'var(--text-primary, #e2dfd8)',
    outline: 'none', cursor: 'pointer',
  };

  return (
    <ERPShell breadcrumbs={['Home', 'Inventory', 'Stock Reconciliation', session.sessionNumber]} title={session.sessionNumber}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&display=swap');
        .srd-page  { padding: 0 18px 16px; display:flex; flex-direction:column; gap:10px; height:100%; overflow:hidden; }
        .srd-hdr   { display:flex; align-items:center; gap:12px; flex-shrink:0; flex-wrap:wrap; }
        .srd-kpis  { display:grid; grid-template-columns:repeat(5,1fr); gap:8px; flex-shrink:0; }
        .srd-kpi   { background:rgba(10,7,18,0.7); border-radius:8px; padding:9px 14px; }
        .srd-kpi-l { font-size:9px; font-weight:500; letter-spacing:0.1em; text-transform:uppercase; color:rgba(255,255,255,0.3); margin-bottom:4px; }
        .srd-kpi-v { font-size:18px; font-weight:500; font-family:'IBM Plex Mono',monospace; }
        .srd-acts  { display:flex; gap:8px; flex-wrap:wrap; align-items:center; flex-shrink:0; }
        .srd-wrap  { flex:1; min-height:0; overflow-y:auto; background:rgba(10,7,18,0.5); border:0.5px solid rgba(255,255,255,0.07); border-radius:9px; }
        .srd-tbl   { width:100%; border-collapse:collapse; }
        .srd-th    { padding:8px 12px; font-size:9px; font-weight:600; letter-spacing:0.08em; text-transform:uppercase; color:rgba(255,255,255,0.3); text-align:left; border-bottom:0.5px solid rgba(255,255,255,0.08); background:rgba(10,7,18,0.8); position:sticky; top:0; z-index:1; white-space:nowrap; }
        .srd-th.r  { text-align:right; }
        .srd-err   { background:rgba(239,68,68,0.08); border:0.5px solid rgba(239,68,68,0.2); border-radius:8px; padding:10px 14px; font-size:13px; color:var(--danger-subtle, #fca5a5); flex-shrink:0; }
        .srd-btn   { border:none; border-radius:7px; padding:7px 14px; font-size:12px; font-weight:500; font-family:'IBM Plex Sans',sans-serif; cursor:pointer; }
        .srd-hint  { font-size:10px; color:rgba(255,255,255,0.25); background:rgba(255,255,255,0.03); border:0.5px solid rgba(255,255,255,0.07); border-radius:6px; padding:5px 10px; flex-shrink:0; }
      `}</style>

      <div className="srd-page">

        {/* Header */}
        <div className="srd-hdr">
          <button
            onClick={() => router.push('/inventory/stock-reconciliation')}
            style={{ background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.09)', borderRadius: 6, padding: '5px 10px', fontSize: 11, fontFamily: "'IBM Plex Sans',sans-serif", color: 'rgba(255,255,255,0.4)', cursor: 'pointer' }}>
            ← Back
          </button>
          <span style={{ display: 'inline-flex', alignItems: 'center', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 500, color: sc.color, background: sc.bg, border: `0.5px solid ${sc.border}` }}>
            {sc.label}
          </span>
          <span style={{ fontSize: 13, color: 'var(--text-primary, #e2dfd8)', fontWeight: 500 }}>
            {session.warehouse.code} — {session.warehouse.name}
          </span>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
            Count Date: {fmtDate(session.countDate)}
          </span>
          {session.description && (
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }}>
              {session.description}
            </span>
          )}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
            <PrintButton doc="stock-count" id={session.id} label="Count Sheet" style={{ padding: '5px 10px', fontSize: 11 }} />
          </div>
        </div>

        {/* KPIs */}
        <div className="srd-kpis">
          {[
            { label: 'Total Items',      value: String(session.lines.length), color: 'var(--text-strong, #f1ede8)', border: 'rgba(255,255,255,0.07)' },
            { label: 'Counted',          value: String(countedCount),         color: 'var(--accent-blue, #60a5fa)', border: 'rgba(96,165,250,0.15)'  },
            { label: 'Pending',          value: String(pendingCount),         color: pendingCount > 0 ? 'var(--warning, #fbbf24)' : 'var(--success, #4ade80)', border: pendingCount > 0 ? 'rgba(251,191,36,0.15)' : 'rgba(74,222,128,0.15)' },
            { label: 'Lines w/ Variance',value: String(session.linesWithVariance ?? displayLines.filter(l => (l.variancePurchaseQty ?? 0) !== 0).length), color: 'var(--warning, #fbbf24)', border: 'rgba(251,191,36,0.15)' },
            { label: 'Total Variance',   value: fmtAmt(session.totalVarianceValue ?? totalVar), color: totalVar < 0 ? 'var(--danger, #f87171)' : totalVar > 0 ? 'var(--warning, #fbbf24)' : 'var(--success, #4ade80)', border: 'rgba(255,255,255,0.07)' },
          ].map(k => (
            <div key={k.label} className="srd-kpi" style={{ border: `0.5px solid ${k.border}` }}>
              <div className="srd-kpi-l">{k.label}</div>
              <div className="srd-kpi-v" style={{ color: k.color, fontSize: k.value.length > 8 ? 13 : 18 }}>{k.value}</div>
            </div>
          ))}
        </div>

        {error && <div className="srd-err">{error}</div>}

        {/* Actions */}
        <div className="srd-acts">
          <select style={SEL} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
            <option value="all">All Lines ({session.lines.length})</option>
            <option value="pending">Pending ({pendingCount})</option>
            <option value="counted">Counted</option>
            <option value="variance">Has Variance</option>
          </select>

          {session.status === 'draft' && (
            <button className="srd-btn" disabled={actionLoading} onClick={() => doAction('start')}
              style={{ background: 'linear-gradient(135deg,#1e40af,#2563eb,#3b82f6)', color: 'white' }}>
              Start Counting
            </button>
          )}

          {session.status === 'in_progress' && (
            <button className="srd-btn" disabled={actionLoading || pendingCount > 0}
              onClick={() => doAction('submit')}
              style={{ background: pendingCount > 0 ? 'rgba(255,255,255,0.05)' : 'linear-gradient(135deg,#b45309,#d97706,#f59e0b)', color: pendingCount > 0 ? 'rgba(255,255,255,0.2)' : 'white', cursor: pendingCount > 0 ? 'not-allowed' : 'pointer' }}>
              {pendingCount > 0 ? `Submit (${pendingCount} pending)` : 'Submit for Approval'}
            </button>
          )}

          {session.status === 'in_progress' && (
            <button
              className="srd-btn"
              onClick={() => router.push(`/inventory/stock-reconciliation/${session.id}/count`)}
              style={{ background: 'rgba(74,222,128,0.08)', border: '0.5px solid rgba(74,222,128,0.2)', color: 'var(--success, #4ade80)' }}>
              📱 Mobile Count
            </button>
          )}

          {session.status === 'in_progress' && (
            <button
              className="srd-btn"
              onClick={() => setShowAssign(true)}
              style={{ background: 'rgba(167,139,250,0.08)', border: '0.5px solid rgba(167,139,250,0.2)', color: 'var(--accent-violet, #a78bfa)' }}>
              👥 Assign Lines
            </button>
          )}

          {session.status === 'pending_approval' && (
            <button className="srd-btn" disabled={actionLoading} onClick={() => setShowApprove(true)}
              style={{ background: 'linear-gradient(135deg,#6d28d9,#7c3aed,#8b5cf6)', color: 'white' }}>
              Approve
            </button>
          )}

          {session.status === 'approved' && (
            <button className="srd-btn" disabled={actionLoading} onClick={() => doAction('post')}
              style={{ background: 'linear-gradient(135deg,#065f46,#059669,#10b981)', color: 'white' }}>
              Post Adjustments
            </button>
          )}

          {!['posted', 'cancelled'].includes(session.status) && (
            <button className="srd-btn" disabled={actionLoading}
              onClick={cancelModal.openModal}
              style={{ background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.2)', color: 'var(--danger, #f87171)' }}>
              Cancel
            </button>
          )}

          {canCount && (
            <span className="srd-hint">
              Click <b>Count</b> on a line → enter qty in Storage or Purchase UOM → click <b>edit</b> to switch UOM → Save
            </span>
          )}
        </div>

        {/* Table */}
        <div className="srd-wrap">
          <table className="srd-tbl">
            <thead>
              <tr>
                <th className="srd-th">Status</th>
                <th className="srd-th">Item</th>
                <th className="srd-th r">System (Storage)</th>
                <th className="srd-th r">System (Purchase)</th>
                <th className="srd-th r">Counted (Storage)</th>
                <th className="srd-th r">Counted (Purchase)</th>
                <th className="srd-th r">Variance (Purchase)</th>
                <th className="srd-th r">Variance Value</th>
                <th className="srd-th r">WAC</th>
                <th className="srd-th"></th>
              </tr>
            </thead>
            <tbody>
              {displayLines.length === 0 ? (
                <tr>
                  <td colSpan={10} style={{ padding: 32, textAlign: 'center', color: 'rgba(255,255,255,0.2)', fontSize: 13 }}>
                    No lines to display
                  </td>
                </tr>
              ) : displayLines.map(line => (
                <CountRow
                  key={line.id}
                  line={line}
                  canEdit={canCount}
                  onSave={handleSaveLine}
                />
              ))}
            </tbody>
          </table>
        </div>

      </div>

      {showApprove && (
        <ApproveModal
          onClose={() => setShowApprove(false)}
          onApprove={async notes => { await doAction('approve', { approvalNotes: notes }); }}
        />
      )}

      {showAssign && (
        <AssignmentModal
          sessionId={session.id}
          warehouseId={session.warehouse.id}
          onClose={() => setShowAssign(false)}
          onSaved={() => fetchSession()}
        />
      )}

      <ConfirmModal
        open={cancelModal.open}
        onClose={cancelModal.closeModal}
        title={`Cancel count session ${session.sessionNumber}?`}
        description="This cancels the reconciliation session. It cannot be undone."
        variant="destructive"
        confirmLabel="Cancel session"
        cancelLabel="Keep session"
        onConfirm={async () => {
          await apiClient.patch(`/stock-reconciliation/${id}/cancel`, {});
          await fetchSession();
        }}
      />
    </ERPShell>
  );
}