"use client";

import { useEffect, useState, useCallback, useMemo } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import { ERPTable, ERPColumn } from '@/components/ui/ERPTable';
import SearchSelect from '@/components/ui/SearchSelect';
import { ERPFilterBar, ERPFilter, useERPFilters, applyERPFilters } from '@/components/ui/ERPFilterBar';
import { rfqsApi } from '@/lib/api/rfqs';
import { ConfirmModal, useModal } from '@/components/ui/modal';
import { PrintButton } from '@/components/print/PrintButton';
import { suppliersApi } from '@/lib/api/suppliers';
import { itemsApi } from '@/lib/api/items';
import { Supplier, Item } from '@/lib/api/types';

// ─── Types ────────────────────────────────────────────────────────────────────

type RFQStatus = 'draft' | 'sent' | 'partial_response' | 'fully_responded' | 'awarded' | 'cancelled';

interface RfqResponseLine {
  id: string; rfqSupplierId: string; rfqLineId: string;
  offeredQty: string; uom: string; unitPrice: string;
  leadTimeDays: number; validUntil?: string;
  packSize?: string; moq?: string;
  isAwarded: boolean; awardedQty?: string; notes?: string;
  rfqSupplier?: { id: string; supplierId: string; supplier?: { id: string; code: string; name: string } };
}

interface RfqLine {
  id: string; lineNumber: number;
  itemId?: string; item?: { id: string; code: string; name: string };
  genericDescription?: string;
  quantity: string; uom: string; requiredDate: string;
  prLineId?: string; gnLineId?: string;
  awardedSupplierId?: string;
  awardedSupplier?: { id: string; code: string; name: string };
  awardedUnitPrice?: string; awardedQty?: string;
  poLineId?: string; status: string;
  responseLines?: RfqResponseLine[];
}

interface RfqSupplier {
  id: string; supplierId: string; status: string;
  sentAt?: string; respondedAt?: string;
  totalOfferedAmount?: string;
  supplier?: { id: string; code: string; name: string; contactName?: string; contactEmail?: string };
  responseLines?: { id: string; rfqLineId: string; unitPrice: string; offeredQty: string; isAwarded: boolean }[];
}

interface RFQ {
  id: string; rfqNumber: string; title: string;
  status: RFQStatus; issueDate: string;
  responseDeadline?: string; currency: string;
  prId?: string; gnId?: string; notes?: string;
  awardedAt?: string;
  purchaseRequisition?: { id: string; prNumber: string };
  generalNeed?: { id: string; gnNumber: string };
  lines?: RfqLine[];
  rfqSuppliers?: RfqSupplier[];
  _count?: { lines: number; rfqSuppliers: number };
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
  if (!v && v !== 0) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(v));
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CFG: Record<RFQStatus, { color: string; bg: string; border: string; label: string }> = {
  draft:            { color: 'var(--warning, #fbbf24)', bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.2)',  label: 'Draft' },
  sent:             { color: 'var(--accent-blue, #60a5fa)', bg: 'rgba(96,165,250,0.1)',  border: 'rgba(96,165,250,0.2)',  label: 'Sent' },
  partial_response: { color: 'var(--accent-strong, #fb923c)', bg: 'rgba(251,146,60,0.1)',  border: 'rgba(251,146,60,0.2)',  label: 'Partial' },
  fully_responded:  { color: '#34d399', bg: 'rgba(52,211,153,0.1)',  border: 'rgba(52,211,153,0.2)',  label: 'Responded' },
  awarded:          { color: 'var(--success, #4ade80)', bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.2)',  label: 'Awarded' },
  cancelled:        { color: 'var(--danger, #f87171)', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.2)', label: 'Cancelled' },
};

function StatusBadge({ status }: { status: RFQStatus }) {
  const s = STATUS_CFG[status] ?? STATUS_CFG.draft;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 500, color: s.color, background: s.bg, border: `0.5px solid ${s.border}`, whiteSpace: 'nowrap' }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
      {s.label}
    </span>
  );
}

// ─── RFQ Detail Drawer ────────────────────────────────────────────────────────

function RFQDetailDrawer({ rfq, onClose, onAction }: {
  rfq: RFQ; onClose: () => void; onAction: () => void;
}) {
  const [detail,      setDetail]      = useState<RFQ | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [tab,         setTab]         = useState<'lines' | 'comparison' | 'response'>('lines');
  const [actionBusy,  setActionBusy]  = useState(false);
  const [comparison,  setComparison]  = useState<any>(null);
  const [respSupplier, setRespSupplier] = useState('');
  const [respLines,   setRespLines]   = useState<Record<string, { qty: string; price: string; leadDays: string }>>({});
  const [respBusy,    setRespBusy]    = useState(false);
  const [respError,   setRespError]   = useState('');
  const [awardMap,    setAwardMap]    = useState<Record<string, string>>({}); // rfqLineId → rfqResponseLineId
  const [awardBusy,   setAwardBusy]   = useState(false);
  const [awardError,  setAwardError]  = useState('');
  // spec-frontend-002/003 — send & cancel were native alert()/confirm(); guard
  // both with the shared ConfirmModal (errors absorbed inline).
  const sendModal   = useModal();
  const cancelModal = useModal();

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const d = await rfqsApi.getById(rfq.id);
        setDetail(d as RFQ);
        // Init response lines
        const init: Record<string, { qty: string; price: string; leadDays: string }> = {};
        (d as RFQ).lines?.forEach(l => { init[l.id] = { qty: '', price: '', leadDays: '' }; });
        setRespLines(init);
      } finally { setLoading(false); }
    })();
  }, [rfq.id]);

  useEffect(() => {
    if (tab === 'comparison' && !comparison) {
      rfqsApi.getComparison(rfq.id).then(setComparison).catch(() => {});
    }
  }, [tab, comparison, rfq.id]);

  const handleSend = async () => {
    setActionBusy(true);
    try { await rfqsApi.send(rfq.id); onAction(); onClose(); }
    finally { setActionBusy(false); }
  };

  const handleCancel = async () => {
    setActionBusy(true);
    try { await rfqsApi.cancel(rfq.id); onAction(); onClose(); }
    finally { setActionBusy(false); }
  };

  const handleSubmitResponse = async () => {
    if (!respSupplier) { setRespError('Select a supplier'); return; }
    const lines = Object.entries(respLines)
      .filter(([, v]) => v.qty && v.price && v.leadDays)
      .map(([rfqLineId, v]) => ({
        rfqLineId, offeredQty: Number(v.qty), uom: detail?.lines?.find(l => l.id === rfqLineId)?.uom ?? '',
        unitPrice: Number(v.price), leadTimeDays: Number(v.leadDays),
      }));
    if (!lines.length) { setRespError('Enter at least one line response'); return; }
    setRespBusy(true); setRespError('');
    try {
      await rfqsApi.submitResponse(rfq.id, { rfqSupplierId: respSupplier, lines });
      const d = await rfqsApi.getById(rfq.id);
      setDetail(d as RFQ);
      setTab('comparison');
      setComparison(null);
      onAction();
    } catch (err: any) {
      setRespError(err?.response?.data?.message || 'Failed to submit response');
    } finally { setRespBusy(false); }
  };

  const handleAward = async () => {
    const awards = Object.entries(awardMap)
      .filter(([, responseLineId]) => responseLineId)
      .map(([rfqLineId, rfqResponseLineId]) => ({ rfqLineId, rfqResponseLineId }));
    if (!awards.length) { setAwardError('Select at least one award'); return; }
    setAwardBusy(true); setAwardError('');
    try {
      await rfqsApi.award(rfq.id, { awards });
      onAction(); onClose();
    } catch (err: any) {
      setAwardError(err?.response?.data?.message || 'Award failed');
    } finally { setAwardBusy(false); }
  };

  const MONO: React.CSSProperties = { fontFamily: "'IBM Plex Mono',monospace" };
  const canSend    = detail?.status === 'draft';
  const canRespond = detail?.status === 'sent';
  const canAward   = detail && ['partial_response', 'fully_responded'].includes(detail.status);
  const canCancel  = detail && !['awarded', 'cancelled'].includes(detail.status);

  const TAB_STYLE = (active: boolean): React.CSSProperties => ({
    padding: '6px 14px', fontSize: 12, borderRadius: 6, cursor: 'pointer', border: 'none',
    fontFamily: "'IBM Plex Sans',sans-serif", fontWeight: active ? 500 : 400,
    background: active ? 'rgba(251,146,60,0.12)' : 'transparent',
    color: active ? 'var(--accent-strong, #fb923c)' : 'var(--w40)',
    transition: 'all 0.15s',
  });

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex' }}>
      <div style={{ flex: 1, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }} onClick={onClose} />
      <div style={{ width: 780, background: 'var(--bg, #0a0712)', borderLeft: '0.5px solid rgba(251,146,60,0.15)', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '0.5px solid var(--l06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-strong, #f1ede8)', ...MONO }}>{rfq.rfqNumber}</div>
            <div style={{ fontSize: 12, color: 'var(--w40)', marginTop: 2 }}>{rfq.title}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <PrintButton doc="rfq" id={rfq.id} label="" style={{ padding: '4px 7px' }} />
            <StatusBadge status={rfq.status} />
            <button onClick={onClose} style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--l06)', border: 'none', cursor: 'pointer', color: 'var(--w45)', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ padding: '8px 16px', borderBottom: '0.5px solid var(--l06)', display: 'flex', gap: 4, flexShrink: 0 }}>
          <button style={TAB_STYLE(tab === 'lines')} onClick={() => setTab('lines')}>Lines & Suppliers</button>
          <button style={TAB_STYLE(tab === 'comparison')} onClick={() => setTab('comparison')}>Comparison Matrix</button>
          {canRespond && <button style={TAB_STYLE(tab === 'response')} onClick={() => setTab('response')}>Enter Response</button>}
        </div>

        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--w30)', fontSize: 13 }}>Loading…</div>
        ) : detail ? (
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Info */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {[
                { label: 'Issue Date',    value: fmtDate(detail.issueDate) },
                { label: 'Deadline',      value: fmtDate(detail.responseDeadline) },
                { label: 'Currency',      value: detail.currency },
                { label: 'Source',        value: detail.purchaseRequisition?.prNumber ?? detail.generalNeed?.gnNumber ?? 'Manual' },
              ].map(item => (
                <div key={item.label} style={{ background: 'var(--l03)', borderRadius: 8, padding: '8px 12px' }}>
                  <div style={{ fontSize: 10, color: 'var(--w30)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{item.label}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-primary, #e2dfd8)' }}>{item.value}</div>
                </div>
              ))}
            </div>

            {/* ── TAB: Lines & Suppliers ── */}
            {tab === 'lines' && (
              <>
                {/* Suppliers */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 500, color: 'rgba(251,146,60,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Invited Suppliers</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {detail.rfqSuppliers?.map(rs => {
                      const scfg = { invited: 'var(--warning, #fbbf24)', sent: 'var(--accent-blue, #60a5fa)', responded: '#34d399', awarded: 'var(--success, #4ade80)', declined: 'var(--danger, #f87171)' }[rs.status] ?? 'var(--warning, #fbbf24)';
                      return (
                        <div key={rs.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'var(--l03)', borderRadius: 8, padding: '8px 12px' }}>
                          <div>
                            <span style={{ ...MONO, fontSize: 12, color: 'var(--accent-strong, #fb923c)' }}>{rs.supplier?.code}</span>
                            <span style={{ fontSize: 12, color: 'var(--text-primary, #e2dfd8)', marginLeft: 8 }}>{rs.supplier?.name}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            {rs.totalOfferedAmount && <span style={{ ...MONO, fontSize: 12, color: 'var(--w50)' }}>{fmtAmt(rs.totalOfferedAmount)}</span>}
                            <span style={{ fontSize: 10, padding: '1px 8px', borderRadius: 10, background: `color-mix(in srgb, ${scfg} 9%, transparent)`, color: scfg, border: `0.5px solid color-mix(in srgb, ${scfg} 19%, transparent)` }}>{rs.status}</span>
                            <PrintButton doc="rfq" id={rfq.id} query={{ rfqSupplierId: rs.id }} label="" style={{ padding: '3px 6px' }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Lines */}
                <div>
                  <div style={{ fontSize: 11, fontWeight: 500, color: 'rgba(251,146,60,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>RFQ Lines</div>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr>
                        {['#', 'Item', 'Qty', 'UOM', 'Required', 'Status', 'Awarded To', 'Awarded Price'].map(h => (
                          <th key={h} style={{ padding: '6px 8px', fontSize: 10, color: 'rgba(251,146,60,0.5)', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: ['Qty', 'Awarded Price'].includes(h) ? 'right' : 'left', borderBottom: '0.5px solid var(--l06)', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {detail.lines?.map(line => (
                        <tr key={line.id} style={{ borderBottom: '0.5px solid var(--l04)' }}>
                          <td style={{ padding: '8px', color: 'var(--w30)' }}>{line.lineNumber}</td>
                          <td style={{ padding: '8px' }}>
                            {line.item ? (
                              <>
                                <div style={{ ...MONO, color: 'var(--accent-strong, #fb923c)', fontSize: 11 }}>{line.item.code}</div>
                                <div style={{ color: 'var(--w55)', fontSize: 11 }}>{line.item.name}</div>
                              </>
                            ) : <div style={{ color: 'var(--w40)', fontSize: 11, fontStyle: 'italic' }}>{line.genericDescription}</div>}
                          </td>
                          <td style={{ padding: '8px', textAlign: 'right', ...MONO }}>{Number(line.quantity).toLocaleString()}</td>
                          <td style={{ padding: '8px', color: 'var(--w45)' }}>{line.uom}</td>
                          <td style={{ padding: '8px', fontSize: 11, color: 'var(--w50)' }}>{fmtDateShort(line.requiredDate)}</td>
                          <td style={{ padding: '8px' }}>
                            <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 10, background: line.status === 'awarded' ? 'rgba(74,222,128,0.1)' : 'var(--l05)', color: line.status === 'awarded' ? 'var(--success, #4ade80)' : 'var(--w40)', border: `0.5px solid ${line.status === 'awarded' ? 'rgba(74,222,128,0.2)' : 'var(--l08)'}` }}>
                              {line.status}
                            </span>
                          </td>
                          <td style={{ padding: '8px', fontSize: 11, color: 'var(--accent-violet, #a78bfa)' }}>{line.awardedSupplier?.code ?? '—'}</td>
                          <td style={{ padding: '8px', textAlign: 'right', ...MONO, fontSize: 11 }}>{line.awardedUnitPrice ? fmtAmt(line.awardedUnitPrice) : '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {/* ── TAB: Comparison Matrix ── */}
            {tab === 'comparison' && (
              <div>
                {!comparison ? (
                  <div style={{ textAlign: 'center', padding: 40, color: 'var(--w30)', fontSize: 13 }}>Loading comparison…</div>
                ) : (
                  <>
                    <div style={{ fontSize: 11, fontWeight: 500, color: 'rgba(251,146,60,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>
                      Supplier Comparison — {comparison.rfqNumber}
                    </div>

                    {/* Award error */}
                    {awardError && <div style={{ background: 'rgba(239,68,68,0.1)', border: '0.5px solid rgba(239,68,68,0.2)', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: 'var(--danger-subtle, #fca5a5)', marginBottom: 8 }}>{awardError}</div>}

                    <div style={{ overflowX: 'auto' }}>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                        <thead>
                          <tr>
                            <th style={{ padding: '7px 10px', fontSize: 10, color: 'rgba(251,146,60,0.5)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', borderBottom: '0.5px solid var(--l08)', whiteSpace: 'nowrap', minWidth: 160 }}>Item</th>
                            <th style={{ padding: '7px 8px', fontSize: 10, color: 'rgba(251,146,60,0.5)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'right', borderBottom: '0.5px solid var(--l08)', whiteSpace: 'nowrap' }}>Needed</th>
                            {comparison.matrix[0]?.offers.map((o: any) => (
                              <th key={o.supplierId} style={{ padding: '7px 10px', fontSize: 10, color: 'var(--accent-violet, #a78bfa)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'right', borderBottom: '0.5px solid var(--l08)', whiteSpace: 'nowrap', minWidth: 120 }}>
                                {o.supplierCode}
                                <div style={{ fontSize: 9, color: o.supplierStatus === 'responded' ? '#34d399' : 'var(--w30)', fontWeight: 400 }}>{o.supplierStatus}</div>
                              </th>
                            ))}
                            {canAward && <th style={{ padding: '7px 10px', fontSize: 10, color: 'var(--success, #4ade80)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'center', borderBottom: '0.5px solid var(--l08)', whiteSpace: 'nowrap' }}>Award</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {comparison.matrix.map((line: any) => (
                            <tr key={line.lineId} style={{ borderBottom: '0.5px solid var(--l04)' }}>
                              <td style={{ padding: '8px 10px' }}>
                                <div style={{ ...MONO, color: 'var(--accent-strong, #fb923c)', fontSize: 11 }}>{line.itemName}</div>
                                <div style={{ color: 'var(--w30)', fontSize: 10, marginTop: 2 }}>{fmtDateShort(line.requiredDate)}</div>
                              </td>
                              <td style={{ padding: '8px', textAlign: 'right', ...MONO }}>{Number(line.quantity).toLocaleString()} {line.uom}</td>
                              {line.offers.map((offer: any) => (
                                <td key={offer.supplierId} style={{ padding: '8px 10px', textAlign: 'right', background: offer.isAwarded ? 'rgba(74,222,128,0.06)' : 'transparent' }}>
                                  {offer.unitPrice ? (
                                    <>
                                      <div style={{ ...MONO, color: offer.isAwarded ? 'var(--success, #4ade80)' : 'var(--text-primary, #e2dfd8)', fontWeight: offer.isAwarded ? 600 : 400 }}>{fmtAmt(offer.unitPrice)}</div>
                                      <div style={{ color: 'var(--w30)', fontSize: 10, marginTop: 1 }}>{offer.leadTimeDays}d · {Number(offer.offeredQty).toLocaleString()} {line.uom}</div>
                                    </>
                                  ) : <span style={{ color: 'var(--w20)' }}>—</span>}
                                </td>
                              ))}
                              {canAward && (
                                <td style={{ padding: '8px 10px', textAlign: 'center' }}>
                                  <SearchSelect
                                    options={line.offers.filter((o: any) => o.responseLineId).map((offer: any) => ({ value: offer.responseLineId, label: `${offer.supplierCode} · ${fmtAmt(offer.unitPrice)}` }))}
                                    value={awardMap[line.lineId] ?? ''}
                                    onChange={v => setAwardMap(m => ({ ...m, [line.lineId]: v }))}
                                    placeholder="— No award —"
                                    clearLabel="— No award —"
                                    minWidth={220}
                                  />
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {canAward && (
                      <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 12 }}>
                        <button onClick={handleAward} disabled={awardBusy || Object.values(awardMap).filter(Boolean).length === 0}
                          style={{ background: 'linear-gradient(135deg,#166534,#15803d,#16a34a)', border: 'none', borderRadius: 7, padding: '8px 22px', fontSize: 13, fontWeight: 500, fontFamily: "'IBM Plex Sans',sans-serif", color: 'white', cursor: awardBusy ? 'not-allowed' : 'pointer', opacity: awardBusy || Object.values(awardMap).filter(Boolean).length === 0 ? 0.5 : 1 }}>
                          {awardBusy ? 'Awarding…' : `Award & Generate POs (${Object.values(awardMap).filter(Boolean).length} lines)`}
                        </button>
                      </div>
                    )}
                  </>
                )}
              </div>
            )}

            {/* ── TAB: Enter Response ── */}
            {tab === 'response' && canRespond && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: 'rgba(251,146,60,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Enter Supplier Response</div>

                {respError && <div style={{ background: 'rgba(239,68,68,0.1)', border: '0.5px solid rgba(239,68,68,0.2)', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: 'var(--danger-subtle, #fca5a5)' }}>{respError}</div>}

                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <label style={{ fontSize: 10, fontWeight: 500, color: 'var(--w40)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Responding Supplier *</label>
                  <div style={{ maxWidth: 320 }}>
                    <SearchSelect
                      options={(detail.rfqSuppliers?.filter(rs => rs.status === 'sent') ?? []).map(rs => ({ value: rs.id, label: `${rs.supplier?.code} — ${rs.supplier?.name}` }))}
                      value={respSupplier}
                      onChange={setRespSupplier}
                      placeholder="Search supplier…"
                      clearLabel="— Select supplier —"
                      minWidth={300}
                    />
                  </div>
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      {['Line', 'Item', 'Needed', 'Offered Qty', 'Unit Price', 'Lead Days'].map(h => (
                        <th key={h} style={{ padding: '6px 8px', fontSize: 10, color: 'rgba(251,146,60,0.5)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', borderBottom: '0.5px solid var(--l06)', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.lines?.map(line => (
                      <tr key={line.id} style={{ borderBottom: '0.5px solid var(--l04)' }}>
                        <td style={{ padding: '7px 8px', color: 'var(--w30)' }}>{line.lineNumber}</td>
                        <td style={{ padding: '7px 8px' }}>
                          <div style={{ fontFamily: "'IBM Plex Mono',monospace", color: 'var(--accent-strong, #fb923c)', fontSize: 11 }}>{line.item?.code ?? '—'}</div>
                          <div style={{ color: 'var(--w50)', fontSize: 11 }}>{line.item?.name ?? line.genericDescription}</div>
                        </td>
                        <td style={{ padding: '7px 8px', fontFamily: "'IBM Plex Mono',monospace", color: 'var(--w50)' }}>{Number(line.quantity).toLocaleString()} {line.uom}</td>
                        <td style={{ padding: '7px 5px' }}>
                          <input type="number" min="0" step="0.001" placeholder="0" value={respLines[line.id]?.qty ?? ''}
                            onChange={e => setRespLines(r => ({ ...r, [line.id]: { ...r[line.id], qty: e.target.value } }))}
                            style={{ background: 'var(--l04)', border: '0.5px solid var(--w12)', borderRadius: 5, padding: '5px 8px', fontSize: 12, fontFamily: "'IBM Plex Mono',monospace", color: 'var(--text-primary, #e2dfd8)', outline: 'none', width: 90, textAlign: 'right' }} />
                        </td>
                        <td style={{ padding: '7px 5px' }}>
                          <input type="number" min="0" step="0.01" placeholder="0.00" value={respLines[line.id]?.price ?? ''}
                            onChange={e => setRespLines(r => ({ ...r, [line.id]: { ...r[line.id], price: e.target.value } }))}
                            style={{ background: 'var(--l04)', border: '0.5px solid var(--w12)', borderRadius: 5, padding: '5px 8px', fontSize: 12, fontFamily: "'IBM Plex Mono',monospace", color: 'var(--text-primary, #e2dfd8)', outline: 'none', width: 90, textAlign: 'right' }} />
                        </td>
                        <td style={{ padding: '7px 5px' }}>
                          <input type="number" min="0" step="1" placeholder="0" value={respLines[line.id]?.leadDays ?? ''}
                            onChange={e => setRespLines(r => ({ ...r, [line.id]: { ...r[line.id], leadDays: e.target.value } }))}
                            style={{ background: 'var(--l04)', border: '0.5px solid var(--w12)', borderRadius: 5, padding: '5px 8px', fontSize: 12, fontFamily: "'IBM Plex Mono',monospace", color: 'var(--text-primary, #e2dfd8)', outline: 'none', width: 70, textAlign: 'right' }} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button onClick={handleSubmitResponse} disabled={respBusy}
                    style={{ background: 'linear-gradient(135deg,#1e3a8a,#1d4ed8,#2563eb)', border: 'none', borderRadius: 7, padding: '8px 20px', fontSize: 13, fontWeight: 500, fontFamily: "'IBM Plex Sans',sans-serif", color: 'white', cursor: respBusy ? 'not-allowed' : 'pointer', opacity: respBusy ? 0.5 : 1 }}>
                    {respBusy ? 'Submitting…' : 'Submit Response'}
                  </button>
                </div>
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, paddingTop: 8, borderTop: '0.5px solid var(--l06)', flexWrap: 'wrap' }}>
              {canSend && (
                <button onClick={sendModal.openModal} disabled={actionBusy}
                  style={{ padding: '7px 16px', borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: 'pointer', background: 'rgba(96,165,250,0.1)', border: '0.5px solid rgba(96,165,250,0.25)', color: 'var(--accent-blue, #60a5fa)', fontFamily: "'IBM Plex Sans',sans-serif", opacity: actionBusy ? 0.5 : 1 }}>
                  Send to Suppliers
                </button>
              )}
              {canCancel && (
                <button onClick={cancelModal.openModal} disabled={actionBusy}
                  style={{ padding: '7px 16px', borderRadius: 7, fontSize: 12, cursor: 'pointer', background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.2)', color: 'var(--danger, #f87171)', fontFamily: "'IBM Plex Sans',sans-serif", opacity: actionBusy ? 0.5 : 1 }}>
                  Cancel RFQ
                </button>
              )}
            </div>
          </div>
        ) : null}
      </div>

      <ConfirmModal
        open={sendModal.open}
        onClose={sendModal.closeModal}
        title={`Send RFQ ${rfq.rfqNumber ?? ''} to suppliers?`}
        description="This issues the RFQ to the invited suppliers and opens it for responses."
        confirmLabel="Send to Suppliers"
        onConfirm={handleSend}
      />
      <ConfirmModal
        open={cancelModal.open}
        onClose={cancelModal.closeModal}
        title={`Cancel RFQ ${rfq.rfqNumber ?? ''}?`}
        description="This cancels the request for quotation. It cannot be undone."
        variant="destructive"
        confirmLabel="Cancel RFQ"
        cancelLabel="Keep RFQ"
        onConfirm={handleCancel}
      />
    </div>
  );
}

// ─── Create RFQ Modal ─────────────────────────────────────────────────────────

interface NewRFQLine { itemId: string; genericDescription: string; quantity: string; uom: string; requiredDate: string; }
const EMPTY_LINE: NewRFQLine = { itemId: '', genericDescription: '', quantity: '', uom: '', requiredDate: '' };

function CreateRFQModal({ open, onClose, onSaved, items, suppliers }: {
  open: boolean; onClose: () => void; onSaved: () => void; items: Item[]; suppliers: Supplier[];
}) {
  const [header, setHeader]         = useState({ title: '', currency: 'USD', responseDeadline: '', notes: '' });
  const [selectedSuppliers, setSup] = useState<string[]>([]);
  const [lines,  setLines]          = useState<NewRFQLine[]>([{ ...EMPTY_LINE }]);
  const [submitting, setSub]        = useState(false);
  const [error, setError]           = useState('');

  useEffect(() => {
    if (open) { setError(''); setHeader({ title: '', currency: 'USD', responseDeadline: '', notes: '' }); setSup([]); setLines([{ ...EMPTY_LINE }]); }
  }, [open]);

  const setH = (k: keyof typeof header) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setHeader(h => ({ ...h, [k]: e.target.value }));

  const toggleSupplier = (id: string) =>
    setSup(prev => prev.includes(id) ? prev.filter(s => s !== id) : [...prev, id]);

  const setLine = (idx: number, k: keyof NewRFQLine, v: string) =>
    setLines(ls => ls.map((l, i) => {
      if (i !== idx) return l;
      const upd = { ...l, [k]: v };
      if (k === 'itemId' && v) { const it = items.find(x => x.id === v); if (it) upd.uom = it.baseUom; }
      return upd;
    }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!header.title.trim()) { setError('Title is required.'); return; }
    if (selectedSuppliers.length === 0) { setError('Select at least one supplier.'); return; }
    const valid = lines.filter(l => (l.itemId || l.genericDescription.trim()) && l.quantity && l.uom && l.requiredDate);
    if (!valid.length) { setError('At least one complete line is required.'); return; }
    setSub(true); setError('');
    try {
      await rfqsApi.create({
        title:           header.title,
        currency:        header.currency,
        responseDeadline: header.responseDeadline || undefined,
        notes:           header.notes || undefined,
        supplierIds:     selectedSuppliers,
        lines: valid.map(l => ({
          itemId:             l.itemId || undefined,
          genericDescription: l.genericDescription || undefined,
          quantity:           Number(l.quantity),
          uom:                l.uom,
          requiredDate:       l.requiredDate,
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

  return (
    <>
      <style>{`
        .rfq-overlay{position:fixed;inset:0;z-index:400;background:rgba(0,0,0,0.7);backdrop-filter:blur(4px);display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow-y:auto}
        .rfq-box{background:var(--surface, #0e0b1a);border:0.5px solid rgba(251,146,60,0.2);border-radius:14px;width:100%;max-width:940px;margin:auto;position:relative;box-shadow:0 24px 60px rgba(0,0,0,0.7)}
        .rfq-box::before{content:'';position:absolute;top:0;left:30px;right:30px;height:1px;background:linear-gradient(90deg,transparent,rgba(251,146,60,0.4),transparent);pointer-events:none}
        .rfq-th{font-size:10px;color:rgba(251,146,60,0.5);text-transform:uppercase;letter-spacing:0.08em;padding:5px 6px;text-align:left;border-bottom:0.5px solid rgba(255,255,255,0.06);white-space:nowrap;font-weight:500}
        .rfq-inp{background:rgba(255,255,255,0.04);border:0.5px solid rgba(255,255,255,0.1);border-radius:5px;padding:5px 7px;font-size:12px;font-family:'IBM Plex Sans',sans-serif;color:var(--text-strong, #f1ede8);outline:none;width:100%}
        .rfq-sel{background:rgba(255,255,255,0.04);border:0.5px solid rgba(255,255,255,0.1);border-radius:5px;padding:5px 7px;font-size:12px;font-family:'IBM Plex Sans',sans-serif;color:var(--text-strong, #f1ede8);outline:none;width:100%}
        .rfq-sel option{background:var(--surface, #0e0b1a)}
        .rfq-section{font-size:10px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.25);padding:6px 0 4px;border-bottom:0.5px solid rgba(255,255,255,0.06);margin-top:4px;display:flex;align-items:center;justify-content:space-between}
        .rfq-btn-add{background:rgba(255,255,255,0.04);border:0.5px solid rgba(255,255,255,0.1);border-radius:5px;padding:4px 10px;font-size:11px;color:rgba(255,255,255,0.5);cursor:pointer;font-family:'IBM Plex Sans',sans-serif}
        .rfq-btn-rm{width:20px;height:20px;border-radius:4px;background:rgba(239,68,68,0.1);border:0.5px solid rgba(239,68,68,0.2);color:var(--danger, #f87171);cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
        .sup-chip{display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:20px;font-size:11px;cursor:pointer;transition:all 0.15s;font-family:'IBM Plex Sans',sans-serif;border:0.5px solid}
      `}</style>
      <div className="rfq-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="rfq-box">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 12px', borderBottom: '0.5px solid rgba(255,255,255,0.06)', position: 'sticky', top: 0, background: 'var(--surface, #0e0b1a)', zIndex: 1, borderRadius: '14px 14px 0 0' }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-strong, #f1ede8)' }}>New RFQ — Request for Quotation</span>
            <button onClick={onClose} style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.45)', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
          </div>
          <form onSubmit={handleSubmit}>
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '0.5px solid rgba(239,68,68,0.25)', borderRadius: 7, padding: '8px 12px', fontSize: 12, color: 'var(--danger-subtle, #fca5a5)' }}>{error}</div>}

              <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr', gap: 10 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={LBL}>Title *</label>
                  <input value={header.title} onChange={setH('title')} placeholder="e.g. Cotización Materias Primas Q2-2026" style={INP} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={LBL}>Response Deadline</label>
                  <input type="date" value={header.responseDeadline} onChange={setH('responseDeadline')} style={INP} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={LBL}>Currency</label>
                  <SearchSelect options={['USD','EUR','DOP','GBP'].map(c => ({ value: c, label: c }))} value={header.currency} onChange={v => setHeader(h => ({ ...h, currency: v }))} placeholder="Currency…" minWidth={160} />
                </div>
              </div>

              {/* Supplier chips */}
              <div>
                <label style={{ ...LBL, display: 'block', marginBottom: 8 }}>Invite Suppliers * ({selectedSuppliers.length} selected)</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, maxHeight: 120, overflowY: 'auto', padding: '4px 0' }}>
                  {suppliers.map(s => {
                    const sel = selectedSuppliers.includes(s.id);
                    return (
                      <span key={s.id} className="sup-chip"
                        onClick={() => toggleSupplier(s.id)}
                        style={{ background: sel ? 'rgba(167,139,250,0.1)' : 'rgba(255,255,255,0.03)', borderColor: sel ? 'rgba(167,139,250,0.35)' : 'rgba(255,255,255,0.1)', color: sel ? 'var(--accent-violet, #a78bfa)' : 'rgba(255,255,255,0.45)' }}>
                        {sel && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                        <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 10, color: sel ? 'var(--accent-strong, #fb923c)' : 'rgba(255,255,255,0.3)' }}>{s.code}</span>
                        {s.name}
                      </span>
                    );
                  })}
                </div>
              </div>

              <div className="rfq-section">
                <span>RFQ Lines</span>
                <button type="button" className="rfq-btn-add" onClick={() => setLines(ls => [...ls, { ...EMPTY_LINE }])}>+ Add Line</button>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th className="rfq-th" style={{ width: 210 }}>Item</th>
                    <th className="rfq-th">Generic Description</th>
                    <th className="rfq-th" style={{ width: 80 }}>Qty *</th>
                    <th className="rfq-th" style={{ width: 65 }}>UOM *</th>
                    <th className="rfq-th" style={{ width: 120 }}>Required Date *</th>
                    <th className="rfq-th" style={{ width: 24 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => (
                    <tr key={idx}>
                      <td style={{ padding: '4px 3px' }}>
                        <SearchSelect
                          options={items.filter(it => it.isPurchasable).map(it => ({ value: it.id, label: `${it.code} — ${it.name}` }))}
                          value={line.itemId}
                          onChange={v => setLine(idx, 'itemId', v)}
                          placeholder="Catalog item…"
                          clearLabel="— Catalog item —"
                          minWidth={260}
                        />
                      </td>
                      <td style={{ padding: '4px 3px' }}>
                        <input className="rfq-inp" placeholder="Or free-text…" value={line.genericDescription} onChange={e => setLine(idx, 'genericDescription', e.target.value)} disabled={!!line.itemId} style={{ opacity: line.itemId ? 0.4 : 1 }} />
                      </td>
                      <td style={{ padding: '4px 3px' }}>
                        <input className="rfq-inp" type="number" min="0" step="0.001" placeholder="0" value={line.quantity} onChange={e => setLine(idx, 'quantity', e.target.value)} style={{ textAlign: 'right' }} />
                      </td>
                      <td style={{ padding: '4px 3px' }}>
                        <input className="rfq-inp" placeholder="KG" value={line.uom} onChange={e => setLine(idx, 'uom', e.target.value)} />
                      </td>
                      <td style={{ padding: '4px 3px' }}>
                        <input className="rfq-inp" type="date" value={line.requiredDate} onChange={e => setLine(idx, 'requiredDate', e.target.value)} style={{ colorScheme: 'dark' }} />
                      </td>
                      <td style={{ padding: '4px 3px' }}>
                        {lines.length > 1 && <button type="button" className="rfq-btn-rm" onClick={() => setLines(ls => ls.filter((_, i) => i !== idx))}>×</button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px 18px', borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
              <button type="button" onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '8px 16px', fontSize: 13, fontFamily: "'IBM Plex Sans',sans-serif", color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>Cancel</button>
              <button type="submit" disabled={submitting} style={{ background: 'linear-gradient(135deg,var(--accent-pressed, #c2410c),var(--accent, #ea580c),var(--accent-mid, #f97316))', border: 'none', borderRadius: 7, padding: '8px 20px', fontSize: 13, fontWeight: 500, fontFamily: "'IBM Plex Sans',sans-serif", color: 'white', cursor: 'pointer', boxShadow: '0 3px 12px rgba(234,88,12,0.35)', opacity: submitting ? 0.5 : 1 }}>
                {submitting ? 'Creating…' : 'Create RFQ'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function RFQsPage() {
  const [rfqs,       setRfqs]       = useState<RFQ[]>([]);
  const [items,      setItems]      = useState<Item[]>([]);
  const [suppliers,  setSuppliers]  = useState<Supplier[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [detailRFQ,  setDetailRFQ]  = useState<RFQ | null>(null);
  const [activeStatus, setActiveStatus] = useState<RFQStatus | null>(null);

  const filterDefs = useMemo<ERPFilter<RFQ>[]>(() => [
    {
      key: 'currency', label: 'Currency', type: 'select', placeholder: 'All',
      options: ['USD','EUR','DOP'].map(c => ({ value: c, label: c })),
      filterFn: (row, val) => row.currency === val,
    },
  ], []);

  const { values: filterVals, setValue: setFilterVal, reset: resetFilters, activeCount: filterCount } = useERPFilters(filterDefs);

  const filtered = useMemo(() => {
    const base = applyERPFilters(rfqs, filterDefs, filterVals);
    return activeStatus ? base.filter(r => r.status === activeStatus) : base;
  }, [rfqs, filterDefs, filterVals, activeStatus]);

  const stats = useMemo(() => {
    const s: Partial<Record<RFQStatus, number>> = {};
    rfqs.forEach(r => { s[r.status] = (s[r.status] ?? 0) + 1; });
    return s;
  }, [rfqs]);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [raw, its, sups] = await Promise.all([
        rfqsApi.getAll(),
        itemsApi.getAll(),
        suppliersApi.getAll(),
      ]);
      setRfqs(Array.isArray(raw) ? raw as RFQ[] : []);
      setItems(its);
      setSuppliers(sups);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const columns = useMemo<ERPColumn<RFQ>[]>(() => [
    {
      key: 'rfqNumber', header: 'RFQ Number', width: 140, sortable: true,
      value: r => r.rfqNumber,
      render: r => <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: 'var(--accent-strong, #fb923c)', fontWeight: 500 }}>{r.rfqNumber}</span>,
    },
    {
      key: 'title', header: 'Title', sortable: true,
      value: r => r.title,
      render: r => <span style={{ color: 'var(--text-primary, #e2dfd8)', fontWeight: 500 }}>{r.title}</span>,
    },
    {
      key: 'issueDate', header: 'Issued', width: 100, sortable: true,
      value: r => r.issueDate,
      render: r => <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{fmtDateShort(r.issueDate)}</span>,
    },
    {
      key: 'deadline', header: 'Deadline', width: 100, sortable: true,
      value: r => r.responseDeadline ?? '',
      render: r => {
        if (!r.responseDeadline) return <span style={{ color: 'rgba(255,255,255,0.2)' }}>—</span>;
        const isLate = new Date(r.responseDeadline) < new Date() && r.status === 'sent';
        return <span style={{ fontSize: 12, color: isLate ? 'var(--danger, #f87171)' : 'rgba(255,255,255,0.45)' }}>{fmtDateShort(r.responseDeadline)}</span>;
      },
    },
    {
      key: 'suppliers', header: 'Suppliers', width: 75, align: 'center', sortable: true,
      value: r => r._count?.rfqSuppliers ?? 0,
      render: r => <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{r._count?.rfqSuppliers ?? 0}</span>,
    },
    {
      key: 'lines', header: 'Lines', width: 60, align: 'center', sortable: true,
      value: r => r._count?.lines ?? 0,
      render: r => <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{r._count?.lines ?? 0}</span>,
    },
    {
      key: 'source', header: 'Source', width: 100, sortable: false,
      render: r => {
        const src = r.purchaseRequisition?.prNumber ?? r.generalNeed?.gnNumber;
        return <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: src ? 'var(--accent-blue, #60a5fa)' : 'rgba(255,255,255,0.25)' }}>{src ?? 'Manual'}</span>;
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
        <button onClick={e => { e.stopPropagation(); setDetailRFQ(r); }}
          style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.55)', fontFamily: "'IBM Plex Sans',sans-serif" }}>
          View
        </button>
      ),
    },
  ], []);

  return (
    <ERPShell breadcrumbs={['Home', 'Procurement', 'RFQs']} title="Requests for Quotation">
      <style>{`.rfq-page{padding:0 18px 12px;display:flex;flex-direction:column;height:100%;overflow:hidden}`}</style>
      <div className="rfq-page">

        {/* Status cards */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexShrink: 0, flexWrap: 'wrap' }}>
          {(Object.entries(STATUS_CFG) as [RFQStatus, typeof STATUS_CFG[RFQStatus]][]).map(([status, cfg]) => {
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
            <span style={{ fontSize: 22, fontWeight: 500, color: 'var(--accent-strong, #fb923c)', fontFamily: "'IBM Plex Mono',monospace" }}>{rfqs.length}</span>
          </div>
        </div>

        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 10, flexShrink: 0, flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}>
            <ERPFilterBar filters={filterDefs} values={filterVals} onChange={setFilterVal} onReset={resetFilters} activeCount={filterCount} />
          </div>
          <button onClick={() => setCreateOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'linear-gradient(135deg,var(--accent-pressed, #c2410c),var(--accent, #ea580c),var(--accent-mid, #f97316))', border: 'none', borderRadius: 7, padding: '7px 14px', fontSize: 12, fontWeight: 500, fontFamily: "'IBM Plex Sans',sans-serif", color: 'white', cursor: 'pointer', boxShadow: '0 3px 12px rgba(234,88,12,0.3)', flexShrink: 0, alignSelf: 'flex-end' }}>
            + New RFQ
          </button>
        </div>

        {error && <div style={{ background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 10, fontSize: 13, color: 'var(--danger-subtle, #fca5a5)', flexShrink: 0 }}>{error}</div>}

        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <ERPTable<RFQ>
            columns={columns} data={filtered} rowKey={r => r.id} loading={loading}
            exportFilename="rfqs"
            emptyMessage={filterCount || activeStatus ? 'No RFQs match your filters.' : 'No RFQs yet.'}
            defaultPageSize={25} maxHeight="100%"
            onRowClick={rfq => setDetailRFQ(rfq)}
          />
        </div>
      </div>

      <CreateRFQModal open={createOpen} onClose={() => setCreateOpen(false)} onSaved={fetchAll} items={items} suppliers={suppliers} />
      {detailRFQ && <RFQDetailDrawer rfq={detailRFQ} onClose={() => setDetailRFQ(null)} onAction={() => { setDetailRFQ(null); fetchAll(); }} />}
    </ERPShell>
  );
}