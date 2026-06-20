"use client";

import { useEffect, useState, useCallback, useMemo } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import { ERPTable, ERPColumn } from '@/components/ui/ERPTable';
import { ERPFilterBar, ERPFilter, useERPFilters, applyERPFilters } from '@/components/ui/ERPFilterBar';
import { generalNeedsApi } from '@/lib/api/general-needs';
import { ConfirmModal, useModal } from '@/components/ui/modal';
import { itemsApi } from '@/lib/api/items';
import { suppliersApi } from '@/lib/api/suppliers';
import { Supplier, Item } from '@/lib/api/types';

// ─── Types ────────────────────────────────────────────────────────────────────

type GNStatus = 'draft' | 'in_progress' | 'completed' | 'cancelled';

interface GNLine {
  id: string; lineNumber: number;
  itemId?: string; item?: { id: string; code: string; name: string };
  genericDescription?: string;
  quantity: string; uom: string;
  requiredDate: string;
  suggestedSupplierId?: string;
  suggestedSupplier?: { id: string; code: string; name: string };
  estimatedUnitCost?: string;
  sourceType?: string; sourceMoId?: string;
  prLineId?: string; status: string;
  notes?: string;
}

interface GN {
  id: string; gnNumber: string;
  title: string; description?: string;
  periodStart: string; periodEnd: string;
  source: string; status: GNStatus; notes?: string;
  lines?: GNLine[];
  rfqs?: { id: string; rfqNumber: string; status: string }[];
  _count?: { lines: number; rfqs: number };
  createdAt: string;
}

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
  if (!v) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(v));
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CFG: Record<GNStatus, { color: string; bg: string; border: string; label: string }> = {
  draft:       { color: 'var(--warning)', bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.2)',  label: 'Draft' },
  in_progress: { color: 'var(--accent-blue)', bg: 'rgba(96,165,250,0.1)',  border: 'rgba(96,165,250,0.2)',  label: 'In Progress' },
  completed:   { color: 'var(--success)', bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.2)',  label: 'Completed' },
  cancelled:   { color: 'var(--danger)', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.2)', label: 'Cancelled' },
};

function StatusBadge({ status }: { status: GNStatus }) {
  const s = STATUS_CFG[status] ?? STATUS_CFG.draft;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 500, color: s.color, background: s.bg, border: `0.5px solid ${s.border}`, whiteSpace: 'nowrap' }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
      {s.label}
    </span>
  );
}

// ─── GN Detail Drawer ─────────────────────────────────────────────────────────

function GNDetailDrawer({ gn, onClose, onAction }: {
  gn: GN; onClose: () => void; onAction: () => void;
}) {
  const [detail,      setDetail]      = useState<GN | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [actionBusy,  setActionBusy]  = useState(false);
  const [selectedLines, setSelectedLines] = useState<Set<string>>(new Set());
  const [convertOpen, setConvertOpen] = useState(false);
  const [prTitle,     setPrTitle]     = useState('');
  const [priority,    setPriority]    = useState('normal');
  const [convertBusy, setConvertBusy] = useState(false);
  const [convertErr,  setConvertErr]  = useState('');
  // spec-frontend-002/003 — cancel guarded by ConfirmModal; status errors
  // absorbed inline instead of relayed via alert().
  const [statusError, setStatusError] = useState('');
  const cancelModal = useModal();

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const d = await generalNeedsApi.getById(gn.id);
        setDetail(d as GN);
        setPrTitle(`PR from ${(d as GN).gnNumber}`);
      } finally { setLoading(false); }
    })();
  }, [gn.id]);

  const handleStatus = async (status: string) => {
    setActionBusy(true); setStatusError('');
    try {
      await generalNeedsApi.updateStatus(gn.id, status);
      onAction(); onClose();
    } catch (err: any) {
      setStatusError(err?.response?.data?.message || 'Failed to update status');
      throw err; // surface inline in ConfirmModal for the cancel path
    } finally { setActionBusy(false); }
  };

  const toggleLine = (lineId: string) => {
    setSelectedLines(prev => {
      const next = new Set(prev);
      next.has(lineId) ? next.delete(lineId) : next.add(lineId);
      return next;
    });
  };

  const toggleAll = () => {
    const pending = detail?.lines?.filter(l => l.status === 'pending') ?? [];
    if (selectedLines.size === pending.length) setSelectedLines(new Set());
    else setSelectedLines(new Set(pending.map(l => l.id)));
  };

  const handleConvertToPr = async () => {
    if (!prTitle.trim()) { setConvertErr('PR title is required'); return; }
    if (selectedLines.size === 0) { setConvertErr('Select at least one line'); return; }
    setConvertBusy(true); setConvertErr('');
    try {
      await generalNeedsApi.convertToPr(gn.id, {
        lineIds: Array.from(selectedLines),
        prTitle,
        priority,
      });
      onAction(); onClose();
    } catch (err: any) {
      setConvertErr(err?.response?.data?.message || 'Conversion failed');
    } finally { setConvertBusy(false); }
  };

  const MONO: React.CSSProperties = { fontFamily: "'IBM Plex Mono',monospace" };
  const canProgress = detail?.status === 'draft';
  const canComplete = detail?.status === 'in_progress';
  const canCancel   = detail && ['draft', 'in_progress'].includes(detail.status);
  const pendingLines = detail?.lines?.filter(l => l.status === 'pending') ?? [];

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex' }}>
      <div style={{ flex: 1, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }} onClick={onClose} />
      <div style={{ width: 720, background: 'var(--bg)', borderLeft: '0.5px solid rgba(251,146,60,0.15)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '0.5px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, position: 'sticky', top: 0, background: 'var(--bg)', zIndex: 1 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-strong)', ...MONO }}>{gn.gnNumber}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{gn.title}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <StatusBadge status={gn.status} />
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
                { label: 'Period Start', value: fmtDate(detail.periodStart) },
                { label: 'Period End',   value: fmtDate(detail.periodEnd) },
                { label: 'Source',       value: detail.source === 'mrp_explode' ? 'MRP Explode' : 'Manual' },
                { label: 'RFQs',         value: detail._count?.rfqs ?? detail.rfqs?.length ?? 0 },
              ].map(item => (
                <div key={item.label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '8px 12px' }}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{item.label}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-primary)' }}>{item.value}</div>
                </div>
              ))}
            </div>

            {/* RFQ links */}
            {detail.rfqs && detail.rfqs.length > 0 && (
              <div>
                <div style={{ fontSize: 11, fontWeight: 500, color: 'rgba(251,146,60,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Linked RFQs</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {detail.rfqs.map(rfq => (
                    <span key={rfq.id} style={{ ...MONO, fontSize: 11, padding: '3px 10px', borderRadius: 20, background: 'rgba(96,165,250,0.08)', border: '0.5px solid rgba(96,165,250,0.2)', color: 'var(--accent-blue)' }}>
                      {rfq.rfqNumber} · {rfq.status}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Lines table */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: 'rgba(251,146,60,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Need Lines ({detail.lines?.length ?? 0})
                </div>
                {pendingLines.length > 0 && (
                  <button
                    onClick={toggleAll}
                    style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif" }}
                  >
                    {selectedLines.size === pendingLines.length ? 'Deselect all' : 'Select all pending'}
                  </button>
                )}
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {['', '#', 'Item', 'Qty', 'UOM', 'Required', 'Sugg. Supplier', 'Est. Cost', 'Status'].map(h => (
                      <th key={h} style={{ padding: '6px 8px', fontSize: 10, color: 'rgba(251,146,60,0.5)', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: ['Qty', 'Est. Cost'].includes(h) ? 'right' : 'left', borderBottom: '0.5px solid rgba(255,255,255,0.06)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detail.lines?.map(line => {
                    const isPending = line.status === 'pending';
                    const isSelected = selectedLines.has(line.id);
                    return (
                      <tr
                        key={line.id}
                        onClick={() => isPending && toggleLine(line.id)}
                        style={{ borderBottom: '0.5px solid rgba(255,255,255,0.04)', cursor: isPending ? 'pointer' : 'default', background: isSelected ? 'rgba(96,165,250,0.06)' : 'transparent', transition: 'background 0.1s' }}
                      >
                        <td style={{ padding: '8px 6px', width: 24 }}>
                          {isPending && (
                            <div style={{ width: 14, height: 14, borderRadius: 4, border: `1px solid ${isSelected ? 'var(--accent-blue)' : 'rgba(255,255,255,0.2)'}`, background: isSelected ? 'var(--accent-blue)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              {isSelected && <span style={{ fontSize: 9, color: 'white', fontWeight: 700 }}>✓</span>}
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '8px', color: 'rgba(255,255,255,0.3)' }}>{line.lineNumber}</td>
                        <td style={{ padding: '8px' }}>
                          {line.item ? (
                            <>
                              <div style={{ ...MONO, color: 'var(--accent-strong)', fontSize: 11 }}>{line.item.code}</div>
                              <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11, marginTop: 1 }}>{line.item.name}</div>
                            </>
                          ) : (
                            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, fontStyle: 'italic' }}>{line.genericDescription || '—'}</div>
                          )}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right', ...MONO }}>{Number(line.quantity).toLocaleString()}</td>
                        <td style={{ padding: '8px', color: 'rgba(255,255,255,0.45)' }}>{line.uom}</td>
                        <td style={{ padding: '8px', fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{fmtDateShort(line.requiredDate)}</td>
                        <td style={{ padding: '8px', fontSize: 11 }}>
                          {line.suggestedSupplier ? (
                            <span style={{ color: 'var(--accent-violet)' }}>{line.suggestedSupplier.code}</span>
                          ) : <span style={{ color: 'rgba(255,255,255,0.2)' }}>—</span>}
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right', ...MONO, fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>
                          {fmtAmt(line.estimatedUnitCost)}
                        </td>
                        <td style={{ padding: '8px' }}>
                          <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 10, background: line.status === 'converted' ? 'rgba(74,222,128,0.1)' : line.status === 'cancelled' ? 'rgba(248,113,113,0.1)' : 'rgba(251,191,36,0.1)', color: line.status === 'converted' ? 'var(--success)' : line.status === 'cancelled' ? 'var(--danger)' : 'var(--warning)', border: `0.5px solid ${line.status === 'converted' ? 'rgba(74,222,128,0.2)' : line.status === 'cancelled' ? 'rgba(248,113,113,0.2)' : 'rgba(251,191,36,0.2)'}` }}>
                            {line.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Convert to PR */}
            {pendingLines.length > 0 && canProgress || canComplete ? (
              <div style={{ background: 'rgba(96,165,250,0.04)', border: '0.5px solid rgba(96,165,250,0.15)', borderRadius: 10, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: convertOpen ? 12 : 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--accent-blue)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Convert to Purchase Requisition
                    {selectedLines.size > 0 && <span style={{ marginLeft: 6, color: 'rgba(255,255,255,0.4)' }}>({selectedLines.size} lines selected)</span>}
                  </span>
                  <button
                    type="button"
                    onClick={() => setConvertOpen(o => !o)}
                    style={{ fontSize: 11, color: convertOpen ? 'var(--danger)' : 'var(--accent-blue)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif" }}
                  >
                    {convertOpen ? 'Cancel' : 'Convert →'}
                  </button>
                </div>
                {convertOpen && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {convertErr && <div style={{ background: 'rgba(239,68,68,0.1)', border: '0.5px solid rgba(239,68,68,0.2)', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: 'var(--danger-subtle)' }}>{convertErr}</div>}
                    <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>PR Title *</label>
                        <input
                          value={prTitle} onChange={e => setPrTitle(e.target.value)}
                          style={{ background: 'var(--surface)', border: '0.5px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '7px 10px', fontSize: 12, fontFamily: "'IBM Plex Sans',sans-serif", color: 'var(--text-primary)', outline: 'none' }}
                        />
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <label style={{ fontSize: 10, fontWeight: 500, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Priority</label>
                        <select value={priority} onChange={e => setPriority(e.target.value)} style={{ background: 'var(--surface)', border: '0.5px solid rgba(255,255,255,0.12)', borderRadius: 6, padding: '7px 10px', fontSize: 12, fontFamily: "'IBM Plex Sans',sans-serif", color: 'var(--text-primary)', outline: 'none', colorScheme: 'dark' as any }}>
                          <option value="normal">Normal</option>
                          <option value="urgent">Urgent</option>
                          <option value="critical">Critical</option>
                        </select>
                      </div>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button onClick={handleConvertToPr} disabled={convertBusy || selectedLines.size === 0}
                        style={{ background: 'linear-gradient(135deg,#1e3a8a,#1d4ed8,#2563eb)', border: 'none', borderRadius: 7, padding: '8px 20px', fontSize: 13, fontWeight: 500, fontFamily: "'IBM Plex Sans',sans-serif", color: 'white', cursor: convertBusy || selectedLines.size === 0 ? 'not-allowed' : 'pointer', opacity: convertBusy || selectedLines.size === 0 ? 0.5 : 1 }}>
                        {convertBusy ? 'Converting…' : `Convert ${selectedLines.size} line${selectedLines.size !== 1 ? 's' : ''} to PR`}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : null}

            {statusError && <div style={{ background: 'rgba(239,68,68,0.1)', border: '0.5px solid rgba(239,68,68,0.2)', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: 'var(--danger-subtle)' }}>{statusError}</div>}

            {/* Status actions */}
            <div style={{ display: 'flex', gap: 8, paddingTop: 8, borderTop: '0.5px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
              {canProgress && (
                <button onClick={() => handleStatus('in_progress')} disabled={actionBusy}
                  style={{ padding: '7px 16px', borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: 'pointer', background: 'rgba(96,165,250,0.1)', border: '0.5px solid rgba(96,165,250,0.25)', color: 'var(--accent-blue)', fontFamily: "'IBM Plex Sans',sans-serif", opacity: actionBusy ? 0.5 : 1 }}>
                  → Mark In Progress
                </button>
              )}
              {canComplete && (
                <button onClick={() => handleStatus('completed')} disabled={actionBusy}
                  style={{ padding: '7px 16px', borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: 'pointer', background: 'rgba(74,222,128,0.1)', border: '0.5px solid rgba(74,222,128,0.25)', color: 'var(--success)', fontFamily: "'IBM Plex Sans',sans-serif", opacity: actionBusy ? 0.5 : 1 }}>
                  ✓ Mark Completed
                </button>
              )}
              {canCancel && (
                <button onClick={cancelModal.openModal} disabled={actionBusy}
                  style={{ padding: '7px 16px', borderRadius: 7, fontSize: 12, cursor: 'pointer', background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.2)', color: 'var(--danger)', fontFamily: "'IBM Plex Sans',sans-serif", opacity: actionBusy ? 0.5 : 1 }}>
                  Cancel GN
                </button>
              )}
            </div>
          </div>
        ) : null}
      </div>

      <ConfirmModal
        open={cancelModal.open}
        onClose={cancelModal.closeModal}
        title={`Cancel general need ${gn.gnNumber}?`}
        description="This cancels the general need. It cannot be undone."
        variant="destructive"
        confirmLabel="Cancel GN"
        cancelLabel="Keep GN"
        onConfirm={() => handleStatus('cancelled')}
      />
    </div>
  );
}

// ─── Create GN Modal ──────────────────────────────────────────────────────────

interface NewGNLine {
  itemId: string; genericDescription: string;
  quantity: string; uom: string;
  requiredDate: string; suggestedSupplierId: string;
  estimatedUnitCost: string;
}
const EMPTY_LINE: NewGNLine = { itemId: '', genericDescription: '', quantity: '', uom: '', requiredDate: '', suggestedSupplierId: '', estimatedUnitCost: '' };

function CreateGNModal({ open, onClose, onSaved, items, suppliers }: {
  open: boolean; onClose: () => void; onSaved: () => void; items: Item[]; suppliers: Supplier[];
}) {
  const [header, setHeader] = useState({ title: '', description: '', periodStart: '', periodEnd: '', source: 'manual', notes: '' });
  const [lines,  setLines]  = useState<NewGNLine[]>([{ ...EMPTY_LINE }]);
  const [submitting, setSub] = useState(false);
  const [error, setError]   = useState('');

  useEffect(() => {
    if (open) { setError(''); setHeader({ title: '', description: '', periodStart: '', periodEnd: '', source: 'manual', notes: '' }); setLines([{ ...EMPTY_LINE }]); }
  }, [open]);

  const setH = (k: keyof typeof header) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setHeader(h => ({ ...h, [k]: e.target.value }));

  const setLine = (idx: number, k: keyof NewGNLine, v: string) =>
    setLines(ls => ls.map((l, i) => {
      if (i !== idx) return l;
      const upd = { ...l, [k]: v };
      if (k === 'itemId' && v) {
        const it = items.find(x => x.id === v);
        if (it) upd.uom = it.baseUom;
        // Auto-suggest preferred supplier
        const sup = suppliers.find(s => s.id === (it?.defaultSupplierId ?? ''));
        if (sup) upd.suggestedSupplierId = sup.id;
      }
      return upd;
    }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!header.title.trim()) { setError('Title is required.'); return; }
    if (!header.periodStart || !header.periodEnd) { setError('Period start and end are required.'); return; }
    const valid = lines.filter(l => (l.itemId || l.genericDescription.trim()) && l.quantity && l.uom && l.requiredDate);
    if (!valid.length) { setError('At least one complete line is required.'); return; }

    setSub(true); setError('');
    try {
      await generalNeedsApi.create({
        title:       header.title,
        description: header.description || undefined,
        periodStart: header.periodStart,
        periodEnd:   header.periodEnd,
        source:      header.source,
        notes:       header.notes || undefined,
        lines: valid.map(l => ({
          itemId:               l.itemId || undefined,
          genericDescription:   l.genericDescription || undefined,
          quantity:             Number(l.quantity),
          uom:                  l.uom,
          requiredDate:         l.requiredDate,
          suggestedSupplierId:  l.suggestedSupplierId || undefined,
          estimatedUnitCost:    l.estimatedUnitCost ? Number(l.estimatedUnitCost) : undefined,
        })),
      });
      onSaved(); onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Operation failed.');
    } finally { setSub(false); }
  };

  if (!open) return null;

  const INP: React.CSSProperties = { background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '8px 12px', fontSize: 12, fontFamily: "'IBM Plex Sans',sans-serif", color: 'var(--text-strong)', outline: 'none', width: '100%' };
  const LBL: React.CSSProperties = { fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(251,146,60,0.6)' };

  return (
    <>
      <style>{`
        .gn-overlay{position:fixed;inset:0;z-index:400;background:rgba(0,0,0,0.7);backdrop-filter:blur(4px);display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow-y:auto}
        .gn-box{background:var(--surface);border:0.5px solid rgba(251,146,60,0.2);border-radius:14px;width:100%;max-width:920px;margin:auto;position:relative;box-shadow:0 24px 60px rgba(0,0,0,0.7)}
        .gn-box::before{content:'';position:absolute;top:0;left:30px;right:30px;height:1px;background:linear-gradient(90deg,transparent,rgba(251,146,60,0.4),transparent);pointer-events:none}
        .gn-th{font-size:10px;color:rgba(251,146,60,0.5);text-transform:uppercase;letter-spacing:0.08em;padding:5px 6px;text-align:left;border-bottom:0.5px solid rgba(255,255,255,0.06);white-space:nowrap;font-weight:500}
        .gn-inp{background:rgba(255,255,255,0.04);border:0.5px solid rgba(255,255,255,0.1);border-radius:5px;padding:5px 7px;font-size:12px;font-family:'IBM Plex Sans',sans-serif;color:var(--text-strong);outline:none;width:100%}
        .gn-sel{background:rgba(255,255,255,0.04);border:0.5px solid rgba(255,255,255,0.1);border-radius:5px;padding:5px 7px;font-size:12px;font-family:'IBM Plex Sans',sans-serif;color:var(--text-strong);outline:none;width:100%}
        .gn-sel option{background:var(--surface)}
        .gn-section{font-size:10px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.25);padding:6px 0 4px;border-bottom:0.5px solid rgba(255,255,255,0.06);margin-top:4px;display:flex;align-items:center;justify-content:space-between}
        .gn-btn-add{background:rgba(255,255,255,0.04);border:0.5px solid rgba(255,255,255,0.1);border-radius:5px;padding:4px 10px;font-size:11px;color:rgba(255,255,255,0.5);cursor:pointer;font-family:'IBM Plex Sans',sans-serif}
        .gn-btn-rm{width:20px;height:20px;border-radius:4px;background:rgba(239,68,68,0.1);border:0.5px solid rgba(239,68,68,0.2);color:var(--danger);cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
      `}</style>
      <div className="gn-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="gn-box">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 12px', borderBottom: '0.5px solid rgba(255,255,255,0.06)', position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1, borderRadius: '14px 14px 0 0' }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-strong)' }}>New General Need</span>
            <button onClick={onClose} style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.45)', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
          </div>
          <form onSubmit={handleSubmit}>
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '0.5px solid rgba(239,68,68,0.25)', borderRadius: 7, padding: '8px 12px', fontSize: 12, color: 'var(--danger-subtle)' }}>{error}</div>}

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 10 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={LBL}>Title *</label>
                  <input value={header.title} onChange={setH('title')} placeholder="e.g. Monthly Needs April 2026" style={INP} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={LBL}>Period Start *</label>
                  <input type="date" value={header.periodStart} onChange={setH('periodStart')} style={INP} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={LBL}>Period End *</label>
                  <input type="date" value={header.periodEnd} onChange={setH('periodEnd')} style={INP} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={LBL}>Source</label>
                  <select value={header.source} onChange={setH('source')} style={{ ...INP, cursor: 'pointer' }}>
                    <option value="manual">Manual</option>
                    <option value="mrp_explode">MRP Explode</option>
                  </select>
                </div>
              </div>

              <div className="gn-section">
                <span>Need Lines</span>
                <button type="button" className="gn-btn-add" onClick={() => setLines(ls => [...ls, { ...EMPTY_LINE }])}>+ Add Line</button>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th className="gn-th" style={{ width: 200 }}>Item</th>
                    <th className="gn-th">Generic Description</th>
                    <th className="gn-th" style={{ width: 80 }}>Qty *</th>
                    <th className="gn-th" style={{ width: 65 }}>UOM *</th>
                    <th className="gn-th" style={{ width: 115 }}>Required Date *</th>
                    <th className="gn-th" style={{ width: 170 }}>Suggested Supplier</th>
                    <th className="gn-th" style={{ width: 100 }}>Est. Cost</th>
                    <th className="gn-th" style={{ width: 24 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: '4px 3px' }}>
                        <select className="gn-sel" value={line.itemId} onChange={e => setLine(idx, 'itemId', e.target.value)}>
                          <option value="">— Catalog item —</option>
                          {items.filter(it => it.isPurchasable).map(it => <option key={it.id} value={it.id}>{it.code} — {it.name}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '4px 3px' }}>
                        <input className="gn-inp" placeholder="Or describe generic item…" value={line.genericDescription} onChange={e => setLine(idx, 'genericDescription', e.target.value)} disabled={!!line.itemId} style={{ opacity: line.itemId ? 0.4 : 1 }} />
                      </td>
                      <td style={{ padding: '4px 3px' }}>
                        <input className="gn-inp" type="number" min="0" step="0.001" placeholder="0" value={line.quantity} onChange={e => setLine(idx, 'quantity', e.target.value)} style={{ textAlign: 'right' }} />
                      </td>
                      <td style={{ padding: '4px 3px' }}>
                        <input className="gn-inp" placeholder="KG" value={line.uom} onChange={e => setLine(idx, 'uom', e.target.value)} />
                      </td>
                      <td style={{ padding: '4px 3px' }}>
                        <input className="gn-inp" type="date" value={line.requiredDate} onChange={e => setLine(idx, 'requiredDate', e.target.value)} style={{ colorScheme: 'dark' }} />
                      </td>
                      <td style={{ padding: '4px 3px' }}>
                        <select className="gn-sel" value={line.suggestedSupplierId} onChange={e => setLine(idx, 'suggestedSupplierId', e.target.value)}>
                          <option value="">— Optional —</option>
                          {suppliers.map(s => <option key={s.id} value={s.id}>{s.code} — {s.name}</option>)}
                        </select>
                      </td>
                      <td style={{ padding: '4px 3px' }}>
                        <input className="gn-inp" type="number" min="0" step="0.01" placeholder="0.00" value={line.estimatedUnitCost} onChange={e => setLine(idx, 'estimatedUnitCost', e.target.value)} style={{ textAlign: 'right' }} />
                      </td>
                      <td style={{ padding: '4px 3px' }}>
                        {lines.length > 1 && (
                          <button type="button" className="gn-btn-rm" onClick={() => setLines(ls => ls.filter((_, i) => i !== idx))}>×</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px 18px', borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
              <button type="button" onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '8px 16px', fontSize: 13, fontFamily: "'IBM Plex Sans',sans-serif", color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>Cancel</button>
              <button type="submit" disabled={submitting} style={{ background: 'linear-gradient(135deg,var(--accent-pressed),var(--accent),var(--accent-mid))', border: 'none', borderRadius: 7, padding: '8px 20px', fontSize: 13, fontWeight: 500, fontFamily: "'IBM Plex Sans',sans-serif", color: 'white', cursor: 'pointer', boxShadow: '0 3px 12px rgba(234,88,12,0.35)', opacity: submitting ? 0.5 : 1 }}>
                {submitting ? 'Creating…' : 'Create General Need'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function GeneralNeedsPage() {
  const [gns,        setGns]        = useState<GN[]>([]);
  const [items,      setItems]      = useState<Item[]>([]);
  const [suppliers,  setSuppliers]  = useState<Supplier[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [detailGN,   setDetailGN]   = useState<GN | null>(null);
  const [activeStatus, setActiveStatus] = useState<GNStatus | null>(null);

  const filterDefs = useMemo<ERPFilter<GN>[]>(() => [
    {
      key: 'source', label: 'Source', type: 'select', placeholder: 'All Sources',
      options: [{ value: 'manual', label: 'Manual' }, { value: 'mrp_explode', label: 'MRP Explode' }],
      filterFn: (row, val) => row.source === val,
    },
  ], []);

  const { values: filterVals, setValue: setFilterVal, reset: resetFilters, activeCount: filterCount } = useERPFilters(filterDefs);

  const filtered = useMemo(() => {
    const base = applyERPFilters(gns, filterDefs, filterVals);
    return activeStatus ? base.filter(g => g.status === activeStatus) : base;
  }, [gns, filterDefs, filterVals, activeStatus]);

  const stats = useMemo(() => {
    const s: Partial<Record<GNStatus, number>> = {};
    gns.forEach(g => { s[g.status] = (s[g.status] ?? 0) + 1; });
    return s;
  }, [gns]);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [raw, its, sups] = await Promise.all([
        generalNeedsApi.getAll(),
        itemsApi.getAll(),
        suppliersApi.getAll(),
      ]);
      setGns(Array.isArray(raw) ? raw as GN[] : []);
      setItems(its);
      setSuppliers(sups);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const columns = useMemo<ERPColumn<GN>[]>(() => [
    {
      key: 'gnNumber', header: 'GN Number', width: 140, sortable: true,
      value: r => r.gnNumber,
      render: r => <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: 'var(--accent-strong)', fontWeight: 500 }}>{r.gnNumber}</span>,
    },
    {
      key: 'title', header: 'Title', sortable: true,
      value: r => r.title,
      render: r => <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{r.title}</span>,
    },
    {
      key: 'period', header: 'Period', width: 160, sortable: false,
      value: r => r.periodStart,
      render: r => <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{fmtDateShort(r.periodStart)} → {fmtDateShort(r.periodEnd)}</span>,
    },
    {
      key: 'source', header: 'Source', width: 100, sortable: true,
      value: r => r.source,
      render: r => <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{r.source === 'mrp_explode' ? 'MRP' : 'Manual'}</span>,
    },
    {
      key: 'lines', header: 'Lines', width: 60, align: 'center', sortable: true,
      value: r => r._count?.lines ?? r.lines?.length ?? 0,
      render: r => <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{r._count?.lines ?? r.lines?.length ?? 0}</span>,
    },
    {
      key: 'rfqs', header: 'RFQs', width: 55, align: 'center', sortable: true,
      value: r => r._count?.rfqs ?? 0,
      render: r => {
        const count = r._count?.rfqs ?? 0;
        return <span style={{ fontSize: 12, color: count > 0 ? 'var(--accent-blue)' : 'rgba(255,255,255,0.25)' }}>{count}</span>;
      },
    },
    {
      key: 'status', header: 'Status', width: 130, sortable: true,
      value: r => r.status,
      render: r => <StatusBadge status={r.status} />,
    },
    {
      key: '_actions', header: '', width: 70, sortable: false,
      render: r => (
        <button onClick={e => { e.stopPropagation(); setDetailGN(r); }}
          style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.55)', fontFamily: "'IBM Plex Sans',sans-serif" }}>
          View
        </button>
      ),
    },
  ], []);

  return (
    <ERPShell breadcrumbs={['Home', 'Procurement', 'General Needs']} title="General Needs">
      <style>{`.gn-page{padding:0 18px 12px;display:flex;flex-direction:column;height:100%;overflow:hidden}`}</style>
      <div className="gn-page">

        {/* Status cards */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexShrink: 0, flexWrap: 'wrap' }}>
          {(Object.entries(STATUS_CFG) as [GNStatus, typeof STATUS_CFG[GNStatus]][]).map(([status, cfg]) => {
            const count = stats[status] ?? 0;
            if (!count && status !== 'draft') return null;
            const isActive = activeStatus === status;
            return (
              <div key={status}
                onClick={() => setActiveStatus(prev => prev === status ? null : status)}
                style={{ background: isActive ? cfg.bg : 'rgba(10,7,18,0.7)', border: `0.5px solid ${isActive ? cfg.color : cfg.border}`, borderRadius: 8, padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 90, cursor: 'pointer', transition: 'all 0.15s' }}>
                <span style={{ fontSize: 10, color: cfg.color, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500 }}>{cfg.label}</span>
                <span style={{ fontSize: 22, fontWeight: 500, color: isActive ? cfg.color : 'var(--text-strong)', fontFamily: "'IBM Plex Mono',monospace" }}>{count}</span>
              </div>
            );
          })}
          <div onClick={() => setActiveStatus(null)}
            style={{ background: !activeStatus ? 'rgba(251,146,60,0.08)' : 'rgba(10,7,18,0.7)', border: `0.5px solid ${!activeStatus ? 'rgba(251,146,60,0.3)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 8, padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 70, cursor: 'pointer' }}>
            <span style={{ fontSize: 10, color: 'rgba(251,146,60,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500 }}>Total</span>
            <span style={{ fontSize: 22, fontWeight: 500, color: 'var(--accent-strong)', fontFamily: "'IBM Plex Mono',monospace" }}>{gns.length}</span>
          </div>
        </div>

        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 10, flexShrink: 0, flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}>
            <ERPFilterBar filters={filterDefs} values={filterVals} onChange={setFilterVal} onReset={resetFilters} activeCount={filterCount} />
          </div>
          <button onClick={() => setCreateOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'linear-gradient(135deg,var(--accent-pressed),var(--accent),var(--accent-mid))', border: 'none', borderRadius: 7, padding: '7px 14px', fontSize: 12, fontWeight: 500, fontFamily: "'IBM Plex Sans',sans-serif", color: 'white', cursor: 'pointer', boxShadow: '0 3px 12px rgba(234,88,12,0.3)', flexShrink: 0, alignSelf: 'flex-end' }}>
            + New GN
          </button>
        </div>

        {error && <div style={{ background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 10, fontSize: 13, color: 'var(--danger-subtle)', flexShrink: 0 }}>{error}</div>}

        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <ERPTable<GN>
            columns={columns} data={filtered} rowKey={r => r.id} loading={loading}
            exportFilename="general-needs"
            emptyMessage={filterCount || activeStatus ? 'No GNs match your filters.' : 'No general needs yet.'}
            defaultPageSize={25} maxHeight="100%"
            onRowClick={gn => setDetailGN(gn)}
          />
        </div>
      </div>

      <CreateGNModal open={createOpen} onClose={() => setCreateOpen(false)} onSaved={fetchAll} items={items} suppliers={suppliers} />
      {detailGN && <GNDetailDrawer gn={detailGN} onClose={() => setDetailGN(null)} onAction={() => { setDetailGN(null); fetchAll(); }} />}
    </ERPShell>
  );
}