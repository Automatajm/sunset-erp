"use client";

import { useEffect, useState, useCallback, useMemo } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import { ERPTable, ERPColumn } from '@/components/ui/ERPTable';
import { ERPFilterBar, ERPFilter, useERPFilters, applyERPFilters } from '@/components/ui/ERPFilterBar';
import { purchaseRequisitionsApi } from '@/lib/api/purchase-requisitions';
import { PrintButton } from '@/components/print/PrintButton';
import { ConfirmModal } from '@/components/ui/modal';
import { itemsApi } from '@/lib/api/items';
import { suppliersApi } from '@/lib/api/suppliers';
import { warehousesApi } from '@/lib/api/warehouses';
import { Supplier, Item } from '@/lib/api/types';

// ─── Types ────────────────────────────────────────────────────────────────────

type PRStatus   = 'draft' | 'submitted' | 'approved' | 'in_progress' | 'completed' | 'rejected' | 'cancelled';
type PRPriority = 'normal' | 'urgent' | 'critical';

interface PRLine {
  id: string; lineNumber: number;
  itemId?: string; item?: { id: string; code: string; name: string; baseUom: string };
  itemStatus: string;
  genericDescription?: string; genericSpec?: string;
  quantity: string; uom: string;
  unitEstimate?: string;
  requiredDate: string;
  warehouseId?: string; warehouse?: { id: string; code: string; name: string };
  poLineId?: string; notes?: string;
}

interface PR {
  id: string; prNumber: string; title: string;
  requestedBy: string; departmentId?: string;
  priority: PRPriority; requiredDate: string;
  justification?: string; source: string;
  estimatedAmount?: string;
  status: PRStatus; notes?: string;
  approvedBy?: string; approvedAt?: string;
  rejectedBy?: string; rejectedAt?: string; rejectionReason?: string;
  lines?: PRLine[];
  rfqs?: { id: string; rfqNumber: string; status: string }[];
  _count?: { lines: number; rfqs: number };
  createdAt: string;
}

interface Warehouse { id: string; code: string; name: string; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtDateShort(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function fmtAmt(v?: string | number) {
  if (!v && v !== 0) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(v));
}

// ─── Status / Priority configs ────────────────────────────────────────────────

const STATUS_CFG: Record<PRStatus, { color: string; bg: string; border: string; label: string }> = {
  draft:       { color: 'var(--warning, #fbbf24)', bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.2)',  label: 'Draft' },
  submitted:   { color: 'var(--accent-blue, #60a5fa)', bg: 'rgba(96,165,250,0.1)',  border: 'rgba(96,165,250,0.2)',  label: 'Submitted' },
  approved:    { color: '#34d399', bg: 'rgba(52,211,153,0.1)',  border: 'rgba(52,211,153,0.2)',  label: 'Approved' },
  in_progress: { color: 'var(--accent-strong, #fb923c)', bg: 'rgba(251,146,60,0.1)',  border: 'rgba(251,146,60,0.2)',  label: 'In Progress' },
  completed:   { color: 'var(--success, #4ade80)', bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.2)',  label: 'Completed' },
  rejected:    { color: 'var(--danger, #f87171)', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.2)', label: 'Rejected' },
  cancelled:   { color: 'var(--text-secondary, #6b7280)', bg: 'rgba(107,114,128,0.1)', border: 'rgba(107,114,128,0.2)', label: 'Cancelled' },
};

const PRIORITY_CFG: Record<PRPriority, { color: string; label: string }> = {
  normal:   { color: 'rgba(255,255,255,0.35)', label: 'Normal' },
  urgent:   { color: 'var(--accent-strong, #fb923c)',                label: 'Urgent' },
  critical: { color: 'var(--danger, #f87171)',                label: 'Critical' },
};

function StatusBadge({ status }: { status: PRStatus }) {
  const s = STATUS_CFG[status] ?? STATUS_CFG.draft;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 500, color: s.color, background: s.bg, border: `0.5px solid ${s.border}`, whiteSpace: 'nowrap' }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
      {s.label}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: PRPriority }) {
  const p = PRIORITY_CFG[priority] ?? PRIORITY_CFG.normal;
  if (priority === 'normal') return <span style={{ fontSize: 11, color: p.color }}>{p.label}</span>;
  return (
    <span style={{ fontSize: 11, fontWeight: 600, color: p.color, display: 'inline-flex', alignItems: 'center', gap: 3 }}>
      {priority === 'critical' ? '🔴' : '🟠'} {p.label}
    </span>
  );
}

// ─── PR Detail Drawer ─────────────────────────────────────────────────────────

function PRDetailDrawer({ pr, onClose, onAction, suppliers }: {
  pr: PR; onClose: () => void; onAction: () => void; suppliers: Supplier[];
}) {
  const [detail,      setDetail]      = useState<PR | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [actionBusy,  setActionBusy]  = useState(false);
  const [rejectOpen,  setRejectOpen]  = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [selectedLines, setSelectedLines] = useState<Set<string>>(new Set());
  const [rfqOpen,     setRfqOpen]     = useState(false);
  const [rfqTitle,    setRfqTitle]    = useState('');
  const [rfqSuppliers, setRfqSuppliers] = useState<string[]>([]);
  const [rfqDeadline, setRfqDeadline] = useState('');
  const [rfqBusy,     setRfqBusy]    = useState(false);
  const [rfqError,    setRfqError]   = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const d = await purchaseRequisitionsApi.getById(pr.id);
        setDetail(d as PR);
        setRfqTitle(`RFQ from ${(d as PR).prNumber}`);
      } finally { setLoading(false); }
    })();
  }, [pr.id]);

  const handleStatus = async (status: string, reason?: string) => {
    setActionBusy(true);
    try {
      await purchaseRequisitionsApi.updateStatus(pr.id, status, reason);
      onAction(); onClose();
    } catch (err: any) {
      alert(err?.response?.data?.message || 'Failed to update status');
    } finally { setActionBusy(false); }
  };

  // spec-frontend-002 adoption — approve/cancel guarded by a ConfirmModal.
  // doStatus throws so ConfirmModal surfaces the error inline and stays open.
  const [confirmStatus, setConfirmStatus] = useState<
    { status: string; title: string; description: string; variant: 'default' | 'destructive'; label: string } | null
  >(null);
  const doStatus = async (status: string) => {
    await purchaseRequisitionsApi.updateStatus(pr.id, status);
    onAction(); onClose();
  };

  const toggleLine = (lineId: string) =>
    setSelectedLines(prev => { const n = new Set(prev); n.has(lineId) ? n.delete(lineId) : n.add(lineId); return n; });

  const toggleAll = () => {
    const eligible = detail?.lines ?? [];
    if (selectedLines.size === eligible.length) setSelectedLines(new Set());
    else setSelectedLines(new Set(eligible.map(l => l.id)));
  };

  const toggleSupplier = (id: string) =>
    setRfqSuppliers(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);

  const handleConvertToRfq = async () => {
    if (!rfqTitle.trim())        { setRfqError('RFQ title is required'); return; }
    if (rfqSuppliers.length === 0) { setRfqError('Select at least one supplier'); return; }
    if (selectedLines.size === 0)  { setRfqError('Select at least one line'); return; }
    setRfqBusy(true); setRfqError('');
    try {
      await purchaseRequisitionsApi.convertToRfq(pr.id, {
        lineIds:          Array.from(selectedLines),
        rfqTitle,
        supplierIds:      rfqSuppliers,
        responseDeadline: rfqDeadline || undefined,
      });
      onAction(); onClose();
    } catch (err: any) {
      setRfqError(err?.response?.data?.message || 'Conversion failed');
    } finally { setRfqBusy(false); }
  };

  const MONO: React.CSSProperties = { fontFamily: "'IBM Plex Mono',monospace" };
  const canSubmit   = detail?.status === 'draft';
  const canApprove  = detail?.status === 'submitted';
  const canReject   = detail?.status === 'submitted';
  const canConvert  = detail && ['approved', 'in_progress'].includes(detail.status);
  const canCancel   = detail && ['draft', 'submitted', 'approved'].includes(detail.status);
  const canResubmit = detail?.status === 'rejected';

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex' }}>
      <div style={{ flex: 1, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }} onClick={onClose} />
      <div style={{ width: 740, background: 'var(--bg, #0a0712)', borderLeft: '0.5px solid rgba(251,146,60,0.15)', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '0.5px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, position: 'sticky', top: 0, background: 'var(--bg, #0a0712)', zIndex: 1 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-strong, #f1ede8)', ...MONO }}>{pr.prNumber}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{pr.title}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <PrintButton doc="purchase-requisition" id={pr.id} label="" style={{ padding: '4px 7px' }} />
            <PriorityBadge priority={pr.priority} />
            <StatusBadge status={pr.status} />
            <button onClick={onClose} style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.45)', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
          </div>
        </div>

        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Loading…</div>
        ) : detail ? (
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Info cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {[
                { label: 'Required By',  value: fmtDate(detail.requiredDate) },
                { label: 'Department',   value: detail.departmentId || '—' },
                { label: 'Source',       value: detail.source },
                { label: 'Est. Amount',  value: fmtAmt(detail.estimatedAmount) },
              ].map(item => (
                <div key={item.label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '8px 12px' }}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{item.label}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-primary, #e2dfd8)' }}>{item.value}</div>
                </div>
              ))}
            </div>

            {/* Rejection reason */}
            {detail.status === 'rejected' && detail.rejectionReason && (
              <div style={{ background: 'rgba(248,113,113,0.06)', border: '0.5px solid rgba(248,113,113,0.2)', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 10, color: 'var(--danger, #f87171)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Rejection Reason</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>{detail.rejectionReason}</div>
              </div>
            )}

            {/* Justification */}
            {detail.justification && (
              <div style={{ background: 'rgba(255,255,255,0.02)', borderRadius: 8, padding: '10px 14px' }}>
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>Justification</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>{detail.justification}</div>
              </div>
            )}

            {/* Linked RFQs */}
            {detail.rfqs && detail.rfqs.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 500, color: 'rgba(251,146,60,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Linked RFQs</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {detail.rfqs.map(rfq => (
                    <span key={rfq.id} style={{ ...MONO, fontSize: 11, padding: '3px 10px', borderRadius: 20, background: 'rgba(96,165,250,0.08)', border: '0.5px solid rgba(96,165,250,0.2)', color: 'var(--accent-blue, #60a5fa)' }}>
                      {rfq.rfqNumber} · {rfq.status}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Lines */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: 'rgba(251,146,60,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Lines ({detail.lines?.length ?? 0})
                </div>
                {(canConvert) && (
                  <button onClick={toggleAll} style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif" }}>
                    {selectedLines.size === (detail.lines?.length ?? 0) ? 'Deselect all' : 'Select all'}
                  </button>
                )}
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {['', '#', 'Item', 'Qty', 'UOM', 'Required', 'Warehouse', 'Est. Cost', 'Type'].map(h => (
                      <th key={h} style={{ padding: '6px 8px', fontSize: 10, color: 'rgba(251,146,60,0.5)', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: ['Qty', 'Est. Cost'].includes(h) ? 'right' : 'left', borderBottom: '0.5px solid rgba(255,255,255,0.06)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detail.lines?.map(line => {
                    const isSelected = selectedLines.has(line.id);
                    return (
                      <tr key={line.id}
                        onClick={() => canConvert && toggleLine(line.id)}
                        style={{ borderBottom: '0.5px solid rgba(255,255,255,0.04)', cursor: canConvert ? 'pointer' : 'default', background: isSelected ? 'rgba(96,165,250,0.06)' : 'transparent', transition: 'background 0.1s' }}>
                        <td style={{ padding: '8px 6px', width: 24 }}>
                          {canConvert && (
                            <div style={{ width: 14, height: 14, borderRadius: 4, border: `1px solid ${isSelected ? 'var(--accent-blue, #60a5fa)' : 'rgba(255,255,255,0.2)'}`, background: isSelected ? 'var(--accent-blue, #60a5fa)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {isSelected && <span style={{ fontSize: 9, color: 'white', fontWeight: 700 }}>✓</span>}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '8px', color: 'rgba(255,255,255,0.3)' }}>{line.lineNumber}</td>
                        <td style={{ padding: '8px' }}>
                          {line.item ? (
                            <>
                              <div style={{ ...MONO, color: 'var(--accent-strong, #fb923c)', fontSize: 11 }}>{line.item.code}</div>
                              <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, marginTop: 1 }}>{line.item.name}</div>
                            </>
                          ) : (
                            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontStyle: 'italic' }}>{line.genericDescription || '—'}</div>
                          )}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right', ...MONO }}>{Number(line.quantity).toLocaleString()}</td>
                        <td style={{ padding: '8px', color: 'rgba(255,255,255,0.45)' }}>{line.uom}</td>
                        <td style={{ padding: '8px', fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{fmtDateShort(line.requiredDate)}</td>
                        <td style={{ padding: '8px', fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{line.warehouse?.code ?? '—'}</td>
                        <td style={{ padding: '8px', textAlign: 'right', ...MONO, fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{fmtAmt(line.unitEstimate)}</td>
                        <td style={{ padding: '8px' }}>
                          <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 10, background: line.itemStatus === 'catalog' ? 'rgba(74,222,128,0.1)' : 'rgba(251,191,36,0.1)', color: line.itemStatus === 'catalog' ? 'var(--success, #4ade80)' : 'var(--warning, #fbbf24)', border: `0.5px solid ${line.itemStatus === 'catalog' ? 'rgba(74,222,128,0.2)' : 'rgba(251,191,36,0.2)'}` }}>
                            {line.itemStatus}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Convert to RFQ */}
            {canConvert && (
              <div style={{ background: 'rgba(96,165,250,0.04)', border: '0.5px solid rgba(96,165,250,0.15)', borderRadius: 10, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: rfqOpen ? 12 : 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--accent-blue, #60a5fa)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Convert to RFQ
                    {selectedLines.size > 0 && <span style={{ marginLeft: 6, color: 'rgba(255,255,255,0.4)' }}>({selectedLines.size} lines)</span>}
                  </span>
                  <button type="button" onClick={() => setRfqOpen(o => !o)} style={{ fontSize: 11, color: rfqOpen ? 'var(--danger, #f87171)' : 'var(--accent-blue, #60a5fa)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif" }}>
                    {rfqOpen ? 'Cancel' : 'Create RFQ →'}
                  </button>
                </div>

                {rfqOpen && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {rfqError && <div style={{ background: 'rgba(239,68,68,0.1)', border: '0.5px solid rgba(239,68,68,0.2)', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: 'var(--danger-subtle, #fca5a5)' }}>{rfqError}</div>}

                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>RFQ Title *</label>
                        <input value={rfqTitle} onChange={e => setRfqTitle(e.target.value)}
                          style={{ background: 'var(--surface, #0e0b1a)', border: '0.5px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '7px 10px', fontSize: 12, fontFamily: "'IBM Plex Sans',sans-serif", color: 'var(--text-primary, #e2dfd8)', outline: 'none' }} />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Response Deadline</label>
                        <input type="date" value={rfqDeadline} onChange={e => setRfqDeadline(e.target.value)}
                          style={{ background: 'var(--surface, #0e0b1a)', border: '0.5px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '7px 10px', fontSize: 12, fontFamily: "'IBM Plex Sans',sans-serif", color: 'var(--text-primary, #e2dfd8)', outline: 'none', colorScheme: 'dark' as any }} />
                      </div>
                    </div>

                    <div>
                      <label style={{ fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 6 }}>
                        Invite Suppliers * ({rfqSuppliers.length} selected)
                      </label>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, maxHeight: 100, overflowY: 'auto' }}>
                        {suppliers.map(s => {
                          const sel = rfqSuppliers.includes(s.id);
                          return (
                            <span key={s.id} onClick={() => toggleSupplier(s.id)}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 20, fontSize: 11, cursor: 'pointer', background: sel ? 'rgba(167,139,250,0.1)' : 'rgba(255,255,255,0.03)', border: `0.5px solid ${sel ? 'rgba(167,139,250,0.35)' : 'rgba(255,255,255,0.1)'}`, color: sel ? 'var(--accent-violet, #a78bfa)' : 'rgba(255,255,255,0.4)', transition: 'all 0.1s', fontFamily: "'IBM Plex Sans',sans-serif" }}>
                              {sel && <span style={{ fontSize: 9, fontWeight: 700 }}>✓</span>}
                              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: sel ? 'var(--accent-strong, #fb923c)' : 'rgba(255,255,255,0.3)' }}>{s.code}</span>
                              {s.name}
                            </span>
                          );
                        })}
                      </div>
                    </div>

                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button onClick={handleConvertToRfq} disabled={rfqBusy || selectedLines.size === 0 || rfqSuppliers.length === 0}
                        style={{ background: 'linear-gradient(135deg,#1e3a8a,#1d4ed8,#2563eb)', border: 'none', borderRadius: 7, padding: '8px 20px', fontSize: 13, fontWeight: 500, fontFamily: "'IBM Plex Sans',sans-serif", color: 'white', cursor: rfqBusy ? 'not-allowed' : 'pointer', opacity: rfqBusy || selectedLines.size === 0 || rfqSuppliers.length === 0 ? 0.5 : 1 }}>
                        {rfqBusy ? 'Creating RFQ…' : `Create RFQ with ${selectedLines.size} line${selectedLines.size !== 1 ? 's' : ''}`}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Reject modal inline */}
            {rejectOpen && (
              <div style={{ background: 'rgba(248,113,113,0.05)', border: '0.5px solid rgba(248,113,113,0.2)', borderRadius: 10, padding: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: 'var(--danger, #f87171)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Rejection Reason *</div>
                <textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} rows={3}
                  placeholder="Explain why this PR is being rejected…"
                  style={{ background: 'var(--surface, #0e0b1a)', border: '0.5px solid rgba(248,113,113,0.2)', borderRadius: 6, padding: '8px 10px', fontSize: 12, fontFamily: "'IBM Plex Sans',sans-serif", color: 'var(--text-primary, #e2dfd8)', outline: 'none', resize: 'vertical' }} />
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  <button onClick={() => { setRejectOpen(false); setRejectReason(''); }} style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', fontFamily: "'IBM Plex Sans',sans-serif" }}>Cancel</button>
                  <button onClick={() => handleStatus('rejected', rejectReason)} disabled={!rejectReason.trim() || actionBusy}
                    style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer', background: 'rgba(248,113,113,0.15)', border: '0.5px solid rgba(248,113,113,0.3)', color: 'var(--danger, #f87171)', fontFamily: "'IBM Plex Sans',sans-serif", opacity: !rejectReason.trim() ? 0.5 : 1 }}>
                    Confirm Rejection
                  </button>
                </div>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, paddingTop: 8, borderTop: '0.5px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
              {canSubmit && (
                <button onClick={() => handleStatus('submitted')} disabled={actionBusy}
                  style={{ padding: '7px 16px', borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: 'pointer', background: 'rgba(96,165,250,0.1)', border: '0.5px solid rgba(96,165,250,0.25)', color: 'var(--accent-blue, #60a5fa)', fontFamily: "'IBM Plex Sans',sans-serif", opacity: actionBusy ? 0.5 : 1 }}>
                  📤 Submit for Approval
                </button>
              )}
              {canResubmit && (
                <button onClick={() => handleStatus('submitted')} disabled={actionBusy}
                  style={{ padding: '7px 16px', borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: 'pointer', background: 'rgba(96,165,250,0.1)', border: '0.5px solid rgba(96,165,250,0.25)', color: 'var(--accent-blue, #60a5fa)', fontFamily: "'IBM Plex Sans',sans-serif", opacity: actionBusy ? 0.5 : 1 }}>
                  🔄 Re-submit
                </button>
              )}
              {canApprove && (
                <button onClick={() => setConfirmStatus({ status: 'approved', title: `Approve PR ${pr.prNumber}?`, description: 'This approves the requisition for procurement.', variant: 'default', label: 'Approve' })} disabled={actionBusy}
                  style={{ padding: '7px 16px', borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: 'pointer', background: 'rgba(74,222,128,0.1)', border: '0.5px solid rgba(74,222,128,0.25)', color: 'var(--success, #4ade80)', fontFamily: "'IBM Plex Sans',sans-serif", opacity: actionBusy ? 0.5 : 1 }}>
                  ✓ Approve
                </button>
              )}
              {canReject && !rejectOpen && (
                <button onClick={() => setRejectOpen(true)} disabled={actionBusy}
                  style={{ padding: '7px 16px', borderRadius: 7, fontSize: 12, cursor: 'pointer', background: 'rgba(248,113,113,0.08)', border: '0.5px solid rgba(248,113,113,0.2)', color: 'var(--danger, #f87171)', fontFamily: "'IBM Plex Sans',sans-serif", opacity: actionBusy ? 0.5 : 1 }}>
                  ✕ Reject
                </button>
              )}
              {canCancel && (
                <button onClick={() => setConfirmStatus({ status: 'cancelled', title: `Cancel PR ${pr.prNumber}?`, description: 'This cancels the requisition. It cannot be undone.', variant: 'destructive', label: 'Cancel PR' })} disabled={actionBusy}
                  style={{ padding: '7px 16px', borderRadius: 7, fontSize: 12, cursor: 'pointer', background: 'rgba(107,114,128,0.08)', border: '0.5px solid rgba(107,114,128,0.2)', color: '#9ca3af', fontFamily: "'IBM Plex Sans',sans-serif", opacity: actionBusy ? 0.5 : 1 }}>
                  Cancel PR
                </button>
              )}
            </div>
          </div>
        ) : null}
      </div>

      <ConfirmModal
        open={!!confirmStatus}
        onClose={() => setConfirmStatus(null)}
        title={confirmStatus?.title ?? ''}
        description={confirmStatus?.description}
        variant={confirmStatus?.variant}
        confirmLabel={confirmStatus?.label}
        onConfirm={async () => { if (confirmStatus) await doStatus(confirmStatus.status); }}
      />
    </div>
  );
}

// ─── Create PR Modal ──────────────────────────────────────────────────────────

interface NewPRLine {
  itemId: string; genericDescription: string; genericSpec: string;
  quantity: string; uom: string; unitEstimate: string;
  requiredDate: string; warehouseId: string;
}
const EMPTY_LINE: NewPRLine = { itemId: '', genericDescription: '', genericSpec: '', quantity: '', uom: '', unitEstimate: '', requiredDate: '', warehouseId: '' };

function CreatePRModal({ open, onClose, onSaved, items, warehouses }: {
  open: boolean; onClose: () => void; onSaved: () => void; items: Item[]; warehouses: Warehouse[];
}) {
  const [header, setHeader] = useState({ title: '', departmentId: '', priority: 'normal', requiredDate: '', justification: '', source: 'manual', notes: '' });
  const [lines,  setLines]  = useState<NewPRLine[]>([{ ...EMPTY_LINE }]);
  const [submitting, setSub] = useState(false);
  const [error, setError]   = useState('');

  useEffect(() => {
    if (open) { setError(''); setHeader({ title: '', departmentId: '', priority: 'normal', requiredDate: '', justification: '', source: 'manual', notes: '' }); setLines([{ ...EMPTY_LINE }]); }
  }, [open]);

  const setH = (k: keyof typeof header) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setHeader(h => ({ ...h, [k]: e.target.value }));

  const setLine = (idx: number, k: keyof NewPRLine, v: string) =>
    setLines(ls => ls.map((l, i) => {
      if (i !== idx) return l;
      const upd = { ...l, [k]: v };
      if (k === 'itemId' && v) { const it = items.find(x => x.id === v); if (it) upd.uom = it.baseUom; }
      return upd;
    }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!header.title.trim())    { setError('Title is required.'); return; }
    if (!header.requiredDate)    { setError('Required date is required.'); return; }
    const valid = lines.filter(l => (l.itemId || l.genericDescription.trim()) && l.quantity && l.uom && l.requiredDate);
    if (!valid.length)           { setError('At least one complete line is required.'); return; }
    setSub(true); setError('');
    try {
      await purchaseRequisitionsApi.create({
        title:          header.title,
        departmentId:   header.departmentId || undefined,
        priority:       header.priority,
        requiredDate:   header.requiredDate,
        justification:  header.justification || undefined,
        source:         header.source,
        notes:          header.notes || undefined,
        lines: valid.map(l => ({
          itemId:             l.itemId || undefined,
          genericDescription: l.genericDescription || undefined,
          genericSpec:        l.genericSpec || undefined,
          quantity:           Number(l.quantity),
          uom:                l.uom,
          unitEstimate:       l.unitEstimate ? Number(l.unitEstimate) : undefined,
          requiredDate:       l.requiredDate,
          warehouseId:        l.warehouseId || undefined,
        })),
      });
      onSaved(); onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Operation failed.');
    } finally { setSub(false); }
  };

  if (!open) return null;

  const INP: React.CSSProperties = { background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '8px 12px', fontSize: 12, fontFamily: "'IBM Plex Sans',sans-serif", color: 'var(--text-strong, #f1ede8)', outline: 'none', width: '100%' };
  const LBL: React.CSSProperties = { fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(251,146,60,0.6)' };
  const PRIORITY_COLORS: Record<string, string> = { normal: 'rgba(255,255,255,0.4)', urgent: 'var(--accent-strong, #fb923c)', critical: 'var(--danger, #f87171)' };

  return (
    <>
      <style>{`
        .pr-overlay{position:fixed;inset:0;z-index:400;background:rgba(0,0,0,0.7);backdrop-filter:blur(4px);display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow-y:auto}
        .pr-box{background:var(--surface, #0e0b1a);border:0.5px solid rgba(251,146,60,0.2);border-radius:14px;width:100%;max-width:940px;margin:auto;position:relative;box-shadow:0 24px 60px rgba(0,0,0,0.7)}
        .pr-box::before{content:'';position:absolute;top:0;left:30px;right:30px;height:1px;background:linear-gradient(90deg,transparent,rgba(251,146,60,0.4),transparent);pointer-events:none}
        .pr-th{font-size:10px;color:rgba(251,146,60,0.5);text-transform:uppercase;letter-spacing:0.08em;padding:5px 6px;text-align:left;border-bottom:0.5px solid rgba(255,255,255,0.06);white-space:nowrap;font-weight:500}
        .pr-inp{background:rgba(255,255,255,0.04);border:0.5px solid rgba(255,255,255,0.1);border-radius:5px;padding:5px 7px;font-size:12px;font-family:'IBM Plex Sans',sans-serif;color:var(--text-strong, #f1ede8);outline:none;width:100%}
        .pr-sel{background:rgba(255,255,255,0.04);border:0.5px solid rgba(255,255,255,0.1);border-radius:5px;padding:5px 7px;font-size:12px;font-family:'IBM Plex Sans',sans-serif;color:var(--text-strong, #f1ede8);outline:none;width:100%}
        .pr-sel option{background:var(--surface, #0e0b1a)}
        .pr-section{font-size:10px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.25);padding:6px 0 4px;border-bottom:0.5px solid rgba(255,255,255,0.06);margin-top:4px;display:flex;align-items:center;justify-content:space-between}
        .pr-btn-add{background:rgba(255,255,255,0.04);border:0.5px solid rgba(255,255,255,0.1);border-radius:5px;padding:4px 10px;font-size:11px;color:rgba(255,255,255,0.5);cursor:pointer;font-family:'IBM Plex Sans',sans-serif}
        .pr-btn-rm{width:20px;height:20px;border-radius:4px;background:rgba(239,68,68,0.1);border:0.5px solid rgba(239,68,68,0.2);color:var(--danger, #f87171);cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
      `}</style>
      <div className="pr-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="pr-box">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 12px', borderBottom: '0.5px solid rgba(255,255,255,0.06)', position: 'sticky', top: 0, background: 'var(--surface, #0e0b1a)', zIndex: 1, borderRadius: '14px 14px 0 0' }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-strong, #f1ede8)' }}>New Purchase Requisition</span>
            <button onClick={onClose} style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.45)', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '0.5px solid rgba(239,68,68,0.25)', borderRadius: 7, padding: '8px 12px', fontSize: 12, color: 'var(--danger-subtle, #fca5a5)' }}>{error}</div>}

              <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr 1fr', gap: 10 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={LBL}>Title *</label>
                  <input value={header.title} onChange={setH('title')} placeholder="e.g. Materiales Producción Abril 2026" style={INP} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={LBL}>Department</label>
                  <input value={header.departmentId} onChange={setH('departmentId')} placeholder="e.g. PROD" style={INP} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={LBL}>Required By *</label>
                  <input type="date" value={header.requiredDate} onChange={setH('requiredDate')} style={INP} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={LBL}>Priority</label>
                  <select value={header.priority} onChange={setH('priority')} style={{ ...INP, cursor: 'pointer', color: PRIORITY_COLORS[header.priority] ?? 'var(--text-strong, #f1ede8)' }}>
                    <option value="normal">Normal</option>
                    <option value="urgent">🟠 Urgent</option>
                    <option value="critical">🔴 Critical</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={LBL}>Source</label>
                  <select value={header.source} onChange={setH('source')} style={{ ...INP, cursor: 'pointer' }}>
                    <option value="manual">Manual</option>
                    <option value="production_plan">Production Plan</option>
                    <option value="mrp">MRP</option>
                    <option value="general_need">General Need</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={LBL}>Justification</label>
                  <input value={header.justification} onChange={setH('justification')} placeholder="Business reason…" style={INP} />
                </div>
              </div>

              <div className="pr-section">
                <span>Requisition Lines</span>
                <button type="button" className="pr-btn-add" onClick={() => setLines(ls => [...ls, { ...EMPTY_LINE }])}>+ Add Line</button>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th className="pr-th" style={{ width: 200 }}>Item</th>
                    <th className="pr-th">Generic Description</th>
                    <th className="pr-th" style={{ width: 80 }}>Qty *</th>
                    <th className="pr-th" style={{ width: 65 }}>UOM *</th>
                    <th className="pr-th" style={{ width: 115 }}>Required *</th>
                    <th className="pr-th" style={{ width: 90 }}>Est. Cost</th>
                    <th className="pr-th" style={{ width: 150 }}>Warehouse</th>
                    <th className="pr-th" style={{ width: 24 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: '4px 3px' }}>
                        <select className="pr-sel" value={line.itemId} onChange={e => setLine(idx, 'itemId', e.target.value)}>
                          <option value="">— Catalog item —</option>
                          {items.filter(it => it.isPurchasable).map(it => <option key={it.id} value={it.id}>{it.code} — {it.name}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '4px 3px' }}>
                        <input className="pr-inp" placeholder="Or free-text…" value={line.genericDescription} onChange={e => setLine(idx, 'genericDescription', e.target.value)} disabled={!!line.itemId} style={{ opacity: line.itemId ? 0.4 : 1 }} />
                      </td>
                      <td style={{ padding: '4px 3px' }}>
                        <input className="pr-inp" type="number" min="0" step="0.001" placeholder="0" value={line.quantity} onChange={e => setLine(idx, 'quantity', e.target.value)} style={{ textAlign: 'right' }} />
                      </td>
                      <td style={{ padding: '4px 3px' }}>
                        <input className="pr-inp" placeholder="KG" value={line.uom} onChange={e => setLine(idx, 'uom', e.target.value)} />
                      </td>
                      <td style={{ padding: '4px 3px' }}>
                        <input className="pr-inp" type="date" value={line.requiredDate} onChange={e => setLine(idx, 'requiredDate', e.target.value)} style={{ colorScheme: 'dark' }} />
                      </td>
                      <td style={{ padding: '4px 3px' }}>
                        <input className="pr-inp" type="number" min="0" step="0.01" placeholder="0.00" value={line.unitEstimate} onChange={e => setLine(idx, 'unitEstimate', e.target.value)} style={{ textAlign: 'right' }} />
                      </td>
                      <td style={{ padding: '4px 3px' }}>
                        <select className="pr-sel" value={line.warehouseId} onChange={e => setLine(idx, 'warehouseId', e.target.value)}>
                          <option value="">— Optional —</option>
                          {warehouses.map(w => <option key={w.id} value={w.id}>{w.code} — {w.name}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '4px 3px' }}>
                        {lines.length > 1 && <button type="button" className="pr-btn-rm" onClick={() => setLines(ls => ls.filter((_, i) => i !== idx))}>×</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px 18px', borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
              <button type="button" onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '8px 16px', fontSize: 13, fontFamily: "'IBM Plex Sans',sans-serif", color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>Cancel</button>
              <button type="submit" disabled={submitting} style={{ background: 'linear-gradient(135deg,var(--accent-pressed, #c2410c),var(--accent, #ea580c),var(--accent-mid, #f97316))', border: 'none', borderRadius: 7, padding: '8px 20px', fontSize: 13, fontWeight: 500, fontFamily: "'IBM Plex Sans',sans-serif", color: 'white', cursor: 'pointer', boxShadow: '0 3px 12px rgba(234,88,12,0.35)', opacity: submitting ? 0.5 : 1 }}>
                {submitting ? 'Creating…' : 'Create PR'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PurchaseRequisitionsPage() {
  const [prs,        setPrs]        = useState<PR[]>([]);
  const [items,      setItems]      = useState<Item[]>([]);
  const [suppliers,  setSuppliers]  = useState<Supplier[]>([]);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [detailPR,   setDetailPR]   = useState<PR | null>(null);
  const [activeStatus, setActiveStatus] = useState<PRStatus | null>(null);

  const filterDefs = useMemo<ERPFilter<PR>[]>(() => [
    {
      key: 'priority', label: 'Priority', type: 'select', placeholder: 'All',
      options: [
        { value: 'critical', label: '🔴 Critical' },
        { value: 'urgent',   label: '🟠 Urgent' },
        { value: 'normal',   label: 'Normal' },
      ],
      filterFn: (row, val) => row.priority === val,
    },
    {
      key: 'source', label: 'Source', type: 'select', placeholder: 'All Sources',
      options: [
        { value: 'manual',          label: 'Manual' },
        { value: 'production_plan', label: 'Production Plan' },
        { value: 'mrp',             label: 'MRP' },
        { value: 'general_need',    label: 'General Need' },
      ],
      filterFn: (row, val) => row.source === val,
    },
  ], []);

  const { values: filterVals, setValue: setFilterVal, reset: resetFilters, activeCount: filterCount } = useERPFilters(filterDefs);

  const filtered = useMemo(() => {
    const base = applyERPFilters(prs, filterDefs, filterVals);
    return activeStatus ? base.filter(p => p.status === activeStatus) : base;
  }, [prs, filterDefs, filterVals, activeStatus]);

  const stats = useMemo(() => {
    const s: Partial<Record<PRStatus, number>> = {};
    prs.forEach(p => { s[p.status] = (s[p.status] ?? 0) + 1; });
    return s;
  }, [prs]);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [raw, its, sups, whs] = await Promise.all([
        purchaseRequisitionsApi.getAll(),
        itemsApi.getAll(),
        suppliersApi.getAll(),
        warehousesApi.getAll(),
      ]);
      setPrs(Array.isArray(raw) ? raw as PR[] : []);
      setItems(its);
      setSuppliers(sups);
      setWarehouses(whs as Warehouse[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const columns = useMemo<ERPColumn<PR>[]>(() => [
    {
      key: 'prNumber', header: 'PR Number', width: 140, sortable: true,
      value: r => r.prNumber,
      render: r => <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: 'var(--accent-strong, #fb923c)', fontWeight: 500 }}>{r.prNumber}</span>,
    },
    {
      key: 'title', header: 'Title', sortable: true,
      value: r => r.title,
      render: r => <span style={{ color: 'var(--text-primary, #e2dfd8)', fontWeight: 500 }}>{r.title}</span>,
    },
    {
      key: 'priority', header: 'Priority', width: 90, sortable: true,
      value: r => r.priority,
      render: r => <PriorityBadge priority={r.priority} />,
    },
    {
      key: 'requiredDate', header: 'Required', width: 100, sortable: true,
      value: r => r.requiredDate,
      render: r => {
        const isLate = new Date(r.requiredDate) < new Date() && !['completed', 'cancelled'].includes(r.status);
        return <span style={{ fontSize: 12, color: isLate ? 'var(--danger, #f87171)' : 'rgba(255,255,255,0.5)' }}>{fmtDateShort(r.requiredDate)}</span>;
      },
    },
    {
      key: 'source', header: 'Source', width: 110, sortable: true,
      value: r => r.source,
      render: r => <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{r.source.replace(/_/g, ' ')}</span>,
    },
    {
      key: 'lines', header: 'Lines', width: 60, align: 'center', sortable: true,
      value: r => r._count?.lines ?? 0,
      render: r => <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{r._count?.lines ?? 0}</span>,
    },
    {
      key: 'rfqs', header: 'RFQs', width: 55, align: 'center', sortable: true,
      value: r => r._count?.rfqs ?? 0,
      render: r => {
        const count = r._count?.rfqs ?? 0;
        return <span style={{ fontSize: 12, color: count > 0 ? 'var(--accent-blue, #60a5fa)' : 'rgba(255,255,255,0.25)' }}>{count}</span>;
      },
    },
    {
      key: 'estimatedAmount', header: 'Est. Amount', width: 120, align: 'right', sortable: true,
      value: r => Number(r.estimatedAmount ?? 0),
      render: r => <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: r.estimatedAmount ? 'var(--text-primary, #e2dfd8)' : 'rgba(255,255,255,0.2)' }}>{fmtAmt(r.estimatedAmount)}</span>,
    },
    {
      key: 'status', header: 'Status', width: 130, sortable: true,
      value: r => r.status,
      render: r => <StatusBadge status={r.status} />,
    },
    {
      key: '_actions', header: '', width: 70, sortable: false,
      render: r => (
        <button onClick={e => { e.stopPropagation(); setDetailPR(r); }}
          style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.55)', fontFamily: "'IBM Plex Sans',sans-serif" }}>
          View
        </button>
      ),
    },
  ], []);

  return (
    <ERPShell breadcrumbs={['Home', 'Procurement', 'Purchase Requisitions']} title="Purchase Requisitions">
      <style>{`.pr-page{padding:0 18px 12px;display:flex;flex-direction:column;height:100%;overflow:hidden}`}</style>
      <div className="pr-page">

        {/* Status cards */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexShrink: 0, flexWrap: 'wrap' }}>
          {(Object.entries(STATUS_CFG) as [PRStatus, typeof STATUS_CFG[PRStatus]][]).map(([status, cfg]) => {
            const count = stats[status] ?? 0;
            if (!count && status !== 'draft') return null;
            const isActive = activeStatus === status;
            return (
              <div key={status}
                onClick={() => setActiveStatus(prev => prev === status ? null : status)}
                style={{ background: isActive ? cfg.bg : 'rgba(10,7,18,0.7)', border: `0.5px solid ${isActive ? cfg.color : cfg.border}`, borderRadius: 8, padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 95, cursor: 'pointer', transition: 'all 0.15s' }}>
                <span style={{ fontSize: 10, color: cfg.color, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500 }}>{cfg.label}</span>
                <span style={{ fontSize: 22, fontWeight: 500, color: isActive ? cfg.color : 'var(--text-strong, #f1ede8)', fontFamily: "'IBM Plex Mono',monospace" }}>{count}</span>
              </div>
            );
          })}
          <div onClick={() => setActiveStatus(null)}
            style={{ background: !activeStatus ? 'rgba(251,146,60,0.08)' : 'rgba(10,7,18,0.7)', border: `0.5px solid ${!activeStatus ? 'rgba(251,146,60,0.3)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 8, padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 70, cursor: 'pointer' }}>
            <span style={{ fontSize: 10, color: 'rgba(251,146,60,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500 }}>Total</span>
            <span style={{ fontSize: 22, fontWeight: 500, color: 'var(--accent-strong, #fb923c)', fontFamily: "'IBM Plex Mono',monospace" }}>{prs.length}</span>
          </div>
        </div>

        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 10, flexShrink: 0, flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}>
            <ERPFilterBar filters={filterDefs} values={filterVals} onChange={setFilterVal} onReset={resetFilters} activeCount={filterCount} />
          </div>
          <button onClick={() => setCreateOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'linear-gradient(135deg,var(--accent-pressed, #c2410c),var(--accent, #ea580c),var(--accent-mid, #f97316))', border: 'none', borderRadius: 7, padding: '7px 14px', fontSize: 12, fontWeight: 500, fontFamily: "'IBM Plex Sans',sans-serif", color: 'white', cursor: 'pointer', boxShadow: '0 3px 12px rgba(234,88,12,0.3)', flexShrink: 0, alignSelf: 'flex-end' }}>
            + New PR
          </button>
        </div>

        {error && <div style={{ background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 10, fontSize: 13, color: 'var(--danger-subtle, #fca5a5)', flexShrink: 0 }}>{error}</div>}

        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <ERPTable<PR>
            columns={columns} data={filtered} rowKey={r => r.id} loading={loading}
            exportFilename="purchase-requisitions"
            emptyMessage={filterCount || activeStatus ? 'No PRs match your filters.' : 'No purchase requisitions yet.'}
            defaultPageSize={25} maxHeight="100%"
            onRowClick={pr => setDetailPR(pr)}
          />
        </div>
      </div>

      <CreatePRModal open={createOpen} onClose={() => setCreateOpen(false)} onSaved={fetchAll} items={items} warehouses={warehouses} />
      {detailPR && <PRDetailDrawer pr={detailPR} onClose={() => setDetailPR(null)} onAction={() => { setDetailPR(null); fetchAll(); }} suppliers={suppliers} />}
    </ERPShell>
  );
}
