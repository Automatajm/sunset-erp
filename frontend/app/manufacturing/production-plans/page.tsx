"use client";

import { useEffect, useState, useCallback, useMemo } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import { ERPTable, ERPColumn } from '@/components/ui/ERPTable';
import { ERPFilterBar, ERPFilter, useERPFilters, applyERPFilters } from '@/components/ui/ERPFilterBar';
import { productionPlansApi } from '@/lib/api/production-plans';
import { itemsApi } from '@/lib/api/items';
import { bomApi } from '@/lib/api/bom';

// ─── Types ────────────────────────────────────────────────────────────────────

type PPStatus  = 'draft' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled';
type PPHorizon = 'weekly' | 'monthly' | 'quarterly';

interface PPLine {
  id: string; lineNumber: number;
  itemId: string; item?: { id: string; code: string; name: string; baseUom: string };
  bomId?: string; bom?: { id: string; bomNumber: string; version: number };
  plannedQty: number; producedQty: number; uom: string;
  plannedStart: string; plannedEnd: string;
  soLineId?: string; status: string; notes?: string;
  productionOrders?: { id: string; poNumber: string; status: string; quantityToProduce: number; quantityProduced: number }[];
}

interface PP {
  id: string; planNumber: string; title: string;
  horizon: PPHorizon; source: string; status: PPStatus;
  periodStart: string; periodEnd: string;
  crpStatus?: string; crpNotes?: string;
  notes?: string; lines?: PPLine[];
  _count?: { lines: number };
  createdAt: string;
}

interface Item { id: string; code: string; name: string; baseUom: string; isPurchasable: boolean; isManufacturable: boolean; }
interface Bom  { id: string; bomNumber: string; parentItemId: string; parentItem?: { name: string }; version: number; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtDateShort(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function fmtNum(v: number) { return new Intl.NumberFormat('en-US').format(v); }

// ─── Status / Horizon configs ─────────────────────────────────────────────────

const STATUS_CFG: Record<PPStatus, { color: string; bg: string; border: string; label: string }> = {
  draft:       { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.2)',  label: 'Draft' },
  confirmed:   { color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',  border: 'rgba(96,165,250,0.2)',  label: 'Confirmed' },
  in_progress: { color: '#fb923c', bg: 'rgba(251,146,60,0.1)',  border: 'rgba(251,146,60,0.2)',  label: 'In Progress' },
  completed:   { color: '#4ade80', bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.2)',  label: 'Completed' },
  cancelled:   { color: '#f87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.2)', label: 'Cancelled' },
};

const HORIZON_CFG: Record<PPHorizon, { color: string; label: string }> = {
  weekly:    { color: '#34d399', label: 'Weekly' },
  monthly:   { color: '#60a5fa', label: 'Monthly' },
  quarterly: { color: '#a78bfa', label: 'Quarterly' },
};

const CRP_CFG: Record<string, { color: string; label: string }> = {
  feasible:    { color: '#4ade80', label: 'Feasible' },
  constrained: { color: '#fbbf24', label: 'Constrained' },
  infeasible:  { color: '#f87171', label: 'Infeasible' },
};

function StatusBadge({ status }: { status: PPStatus }) {
  const s = STATUS_CFG[status] ?? STATUS_CFG.draft;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 500, color: s.color, background: s.bg, border: `0.5px solid ${s.border}`, whiteSpace: 'nowrap' }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
      {s.label}
    </span>
  );
}

// ─── Plan Detail Drawer ────────────────────────────────────────────────────────

function PlanDetailDrawer({ plan, onClose, onAction }: {
  plan: PP; onClose: () => void; onAction: () => void;
}) {
  const [detail,      setDetail]      = useState<PP | null>(null);
  const [avp,         setAvp]         = useState<any>(null);
  const [loading,     setLoading]     = useState(true);
  const [tab,         setTab]         = useState<'lines' | 'avp'>('lines');
  const [actionBusy,  setActionBusy]  = useState(false);
  const [genBusy,     setGenBusy]     = useState(false);
  const [selectedLines, setSelectedLines] = useState<Set<string>>(new Set());
  const [error,       setError]       = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [d, a] = await Promise.all([
          productionPlansApi.getById(plan.id),
          productionPlansApi.getActualVsPlanned(plan.id),
        ]);
        setDetail(d as PP);
        setAvp(a);
      } finally { setLoading(false); }
    })();
  }, [plan.id]);

  const handleStatus = async (status: string) => {
    setActionBusy(true); setError('');
    try {
      await productionPlansApi.updateStatus(plan.id, status);
      onAction(); onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Failed to update status');
    } finally { setActionBusy(false); }
  };

  const handleGenerateMos = async () => {
    setGenBusy(true); setError('');
    try {
      const lineIds = selectedLines.size > 0 ? Array.from(selectedLines) : undefined;
      const result  = await productionPlansApi.generateMos(plan.id, lineIds);
      setError('');
      alert(`✅ ${result.message}`);
      onAction();
      // Refresh detail
      const [d, a] = await Promise.all([
        productionPlansApi.getById(plan.id),
        productionPlansApi.getActualVsPlanned(plan.id),
      ]);
      setDetail(d as PP);
      setAvp(a);
    } catch (err: any) {
      setError(err?.response?.data?.message || 'MO generation failed');
    } finally { setGenBusy(false); }
  };

  const toggleLine = (id: string) =>
    setSelectedLines(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const toggleAll = () => {
    const pending = detail?.lines?.filter(l => l.status === 'pending') ?? [];
    if (selectedLines.size === pending.length) setSelectedLines(new Set());
    else setSelectedLines(new Set(pending.map(l => l.id)));
  };

  const MONO: React.CSSProperties = { fontFamily: "'IBM Plex Mono',monospace" };
  const TAB  = (active: boolean): React.CSSProperties => ({
    padding: '6px 14px', fontSize: 12, borderRadius: 6, cursor: 'pointer', border: 'none',
    fontFamily: "'IBM Plex Sans',sans-serif", fontWeight: active ? 500 : 400,
    background: active ? 'rgba(251,146,60,0.12)' : 'transparent',
    color: active ? '#fb923c' : 'rgba(255,255,255,0.4)', transition: 'all 0.15s',
  });

  const canConfirm    = detail?.status === 'draft';
  const canGenerate   = detail && ['confirmed', 'in_progress'].includes(detail.status);
  const canCancel     = detail && !['completed', 'cancelled'].includes(detail.status);
  const pendingLines  = detail?.lines?.filter(l => l.status === 'pending') ?? [];

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex' }}>
      <div style={{ flex: 1, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }} onClick={onClose} />
      <div style={{ width: 820, background: '#0a0712', borderLeft: '0.5px solid rgba(251,146,60,0.15)', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '0.5px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: '#f1ede8', ...MONO }}>{plan.planNumber}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{plan.title}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 11, color: HORIZON_CFG[plan.horizon]?.color ?? '#e2dfd8', background: `${HORIZON_CFG[plan.horizon]?.color ?? '#e2dfd8'}18`, padding: '2px 9px', borderRadius: 20, border: `0.5px solid ${HORIZON_CFG[plan.horizon]?.color ?? '#e2dfd8'}35` }}>
              {HORIZON_CFG[plan.horizon]?.label ?? plan.horizon}
            </span>
            {plan.crpStatus && (
              <span style={{ fontSize: 11, color: CRP_CFG[plan.crpStatus]?.color ?? '#e2dfd8', background: `${CRP_CFG[plan.crpStatus]?.color ?? '#e2dfd8'}18`, padding: '2px 9px', borderRadius: 20, border: `0.5px solid ${CRP_CFG[plan.crpStatus]?.color ?? '#e2dfd8'}35` }}>
                CRP: {CRP_CFG[plan.crpStatus]?.label ?? plan.crpStatus}
              </span>
            )}
            <StatusBadge status={plan.status} />
            <button onClick={onClose} style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.45)', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ padding: '8px 16px', borderBottom: '0.5px solid rgba(255,255,255,0.06)', display: 'flex', gap: 4, flexShrink: 0 }}>
          <button style={TAB(tab === 'lines')} onClick={() => setTab('lines')}>Plan Lines</button>
          <button style={TAB(tab === 'avp')}   onClick={() => setTab('avp')}>Actual vs Planned</button>
        </div>

        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Loading…</div>
        ) : detail ? (
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

            {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '0.5px solid rgba(239,68,68,0.2)', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: '#fca5a5' }}>{error}</div>}

            {/* Info cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {[
                { label: 'Period Start', value: fmtDate(detail.periodStart) },
                { label: 'Period End',   value: fmtDate(detail.periodEnd) },
                { label: 'Source',       value: detail.source === 'from_sales_orders' ? 'Sales Orders' : 'Free Plan' },
                { label: 'Lines',        value: detail._count?.lines ?? detail.lines?.length ?? 0 },
              ].map(item => (
                <div key={item.label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '8px 12px' }}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{item.label}</div>
                  <div style={{ fontSize: 13, color: '#e2dfd8' }}>{item.value}</div>
                </div>
              ))}
            </div>

            {/* ── TAB: Plan Lines ── */}
            {tab === 'lines' && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 11, fontWeight: 500, color: 'rgba(251,146,60,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Plan Lines
                  </div>
                  {pendingLines.length > 0 && (
                    <button onClick={toggleAll} style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif" }}>
                      {selectedLines.size === pendingLines.length ? 'Deselect all' : 'Select all pending'}
                    </button>
                  )}
                </div>

                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      {['', '#', 'Item', 'Planned Qty', 'UOM', 'Start', 'End', 'BOM', 'MOs', 'Status'].map(h => (
                        <th key={h} style={{ padding: '6px 8px', fontSize: 10, color: 'rgba(251,146,60,0.5)', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: ['Planned Qty'].includes(h) ? 'right' : 'left', borderBottom: '0.5px solid rgba(255,255,255,0.06)', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.lines?.map(line => {
                      const isPending  = line.status === 'pending';
                      const isSelected = selectedLines.has(line.id);
                      const moCount    = line.productionOrders?.length ?? 0;
                      return (
                        <tr key={line.id}
                          onClick={() => isPending && toggleLine(line.id)}
                          style={{ borderBottom: '0.5px solid rgba(255,255,255,0.04)', cursor: isPending ? 'pointer' : 'default', background: isSelected ? 'rgba(96,165,250,0.06)' : 'transparent', transition: 'background 0.1s' }}>
                          <td style={{ padding: '8px 6px', width: 24 }}>
                            {isPending && (
                              <div style={{ width: 14, height: 14, borderRadius: 4, border: `1px solid ${isSelected ? '#60a5fa' : 'rgba(255,255,255,0.2)'}`, background: isSelected ? '#60a5fa' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                {isSelected && <span style={{ fontSize: 9, color: 'white', fontWeight: 700 }}>✓</span>}
                              </div>
                            )}
                          </td>
                          <td style={{ padding: '8px', color: 'rgba(255,255,255,0.3)' }}>{line.lineNumber}</td>
                          <td style={{ padding: '8px' }}>
                            <div style={{ ...MONO, color: '#fb923c', fontSize: 11 }}>{line.item?.code}</div>
                            <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11 }}>{line.item?.name}</div>
                          </td>
                          <td style={{ padding: '8px', textAlign: 'right', ...MONO }}>{fmtNum(line.plannedQty)}</td>
                          <td style={{ padding: '8px', color: 'rgba(255,255,255,0.45)' }}>{line.uom}</td>
                          <td style={{ padding: '8px', fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{fmtDateShort(line.plannedStart)}</td>
                          <td style={{ padding: '8px', fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{fmtDateShort(line.plannedEnd)}</td>
                          <td style={{ padding: '8px', fontSize: 11, ...MONO, color: line.bom ? '#a78bfa' : 'rgba(255,255,255,0.2)' }}>
                            {line.bom ? `v${line.bom.version}` : '—'}
                          </td>
                          <td style={{ padding: '8px', textAlign: 'center' }}>
                            <span style={{ fontSize: 12, color: moCount > 0 ? '#4ade80' : 'rgba(255,255,255,0.2)' }}>{moCount}</span>
                          </td>
                          <td style={{ padding: '8px' }}>
                            <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 10,
                              background: line.status === 'completed' ? 'rgba(74,222,128,0.1)' : line.status === 'mo_created' ? 'rgba(96,165,250,0.1)' : line.status === 'cancelled' ? 'rgba(248,113,113,0.1)' : 'rgba(251,191,36,0.1)',
                              color: line.status === 'completed' ? '#4ade80' : line.status === 'mo_created' ? '#60a5fa' : line.status === 'cancelled' ? '#f87171' : '#fbbf24',
                              border: `0.5px solid ${line.status === 'completed' ? 'rgba(74,222,128,0.2)' : line.status === 'mo_created' ? 'rgba(96,165,250,0.2)' : line.status === 'cancelled' ? 'rgba(248,113,113,0.2)' : 'rgba(251,191,36,0.2)'}`,
                            }}>
                              {line.status.replace('_', ' ')}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>

                {/* Generate MOs */}
                {canGenerate && pendingLines.length > 0 && (
                  <div style={{ background: 'rgba(74,222,128,0.04)', border: '0.5px solid rgba(74,222,128,0.15)', borderRadius: 10, padding: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 500, color: '#4ade80', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Generate Production Orders</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 3 }}>
                        {selectedLines.size > 0 ? `${selectedLines.size} lines selected` : `All ${pendingLines.length} pending lines`}
                      </div>
                    </div>
                    <button onClick={handleGenerateMos} disabled={genBusy}
                      style={{ background: 'linear-gradient(135deg,#166534,#15803d,#16a34a)', border: 'none', borderRadius: 7, padding: '8px 20px', fontSize: 13, fontWeight: 500, fontFamily: "'IBM Plex Sans',sans-serif", color: 'white', cursor: genBusy ? 'not-allowed' : 'pointer', opacity: genBusy ? 0.5 : 1 }}>
                      {genBusy ? 'Generating…' : '⚡ Generate MOs'}
                    </button>
                  </div>
                )}
              </>
            )}

            {/* ── TAB: Actual vs Planned ── */}
            {tab === 'avp' && avp && (
              <>
                {/* Totals */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: 10 }}>
                  {[
                    { label: 'Total Planned',  value: fmtNum(avp.totals.totalPlanned),                 color: '#e2dfd8' },
                    { label: 'Total Produced', value: fmtNum(avp.totals.totalProduced),                color: '#4ade80' },
                    { label: 'Pending',        value: String(avp.totals.linesPending),                 color: '#fbbf24' },
                    { label: 'MO Created',     value: String(avp.totals.linesMoCreated),               color: '#60a5fa' },
                    { label: 'Completed',      value: String(avp.totals.linesCompleted),               color: '#4ade80' },
                  ].map(item => (
                    <div key={item.label} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '8px 12px' }}>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{item.label}</div>
                      <div style={{ fontSize: 18, fontWeight: 500, color: item.color, fontFamily: "'IBM Plex Mono',monospace" }}>{item.value}</div>
                    </div>
                  ))}
                </div>

                {/* Per-line breakdown */}
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr>
                      {['#', 'Item', 'Planned', 'Produced', 'Variance', '% Complete', 'Period', 'MOs', 'Status'].map(h => (
                        <th key={h} style={{ padding: '6px 8px', fontSize: 10, color: 'rgba(251,146,60,0.5)', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: ['Planned','Produced','Variance'].includes(h) ? 'right' : 'left', borderBottom: '0.5px solid rgba(255,255,255,0.06)', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {avp.summary.map((line: any) => {
                      const isPositive = line.variance >= 0;
                      const pct        = line.completionPct;
                      return (
                        <tr key={line.lineId} style={{ borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '8px', color: 'rgba(255,255,255,0.3)' }}>{line.lineNumber}</td>
                          <td style={{ padding: '8px' }}>
                            <div style={{ ...MONO, color: '#fb923c', fontSize: 11 }}>{line.item?.code}</div>
                            <div style={{ color: 'rgba(255,255,255,0.55)', fontSize: 11 }}>{line.item?.name}</div>
                          </td>
                          <td style={{ padding: '8px', textAlign: 'right', ...MONO }}>{fmtNum(line.plannedQty)}</td>
                          <td style={{ padding: '8px', textAlign: 'right', ...MONO, color: '#4ade80' }}>{fmtNum(line.producedQty)}</td>
                          <td style={{ padding: '8px', textAlign: 'right', ...MONO, color: isPositive ? '#4ade80' : '#f87171' }}>
                            {isPositive ? '+' : ''}{fmtNum(line.variance)}
                          </td>
                          <td style={{ padding: '8px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div style={{ width: 60, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.1)', flexShrink: 0 }}>
                                <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', borderRadius: 2, background: pct >= 100 ? '#4ade80' : pct > 50 ? '#fb923c' : '#fbbf24' }} />
                              </div>
                              <span style={{ ...MONO, fontSize: 11, color: pct >= 100 ? '#4ade80' : 'rgba(255,255,255,0.5)' }}>{pct}%</span>
                            </div>
                          </td>
                          <td style={{ padding: '8px', fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
                            {fmtDateShort(line.plannedStart)} → {fmtDateShort(line.plannedEnd)}
                          </td>
                          <td style={{ padding: '8px' }}>
                            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                              {line.moSummary.total === 0 ? (
                                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>—</span>
                              ) : (
                                <>
                                  {line.moSummary.inProgress > 0  && <span style={{ fontSize: 10, color: '#fb923c',  background: 'rgba(251,146,60,0.1)',  padding: '1px 5px', borderRadius: 8 }}>{line.moSummary.inProgress} active</span>}
                                  {line.moSummary.completed > 0   && <span style={{ fontSize: 10, color: '#4ade80',  background: 'rgba(74,222,128,0.1)',  padding: '1px 5px', borderRadius: 8 }}>{line.moSummary.completed} done</span>}
                                  {line.moSummary.draft > 0       && <span style={{ fontSize: 10, color: '#fbbf24',  background: 'rgba(251,191,36,0.1)',  padding: '1px 5px', borderRadius: 8 }}>{line.moSummary.draft} draft</span>}
                                </>
                              )}
                            </div>
                          </td>
                          <td style={{ padding: '8px' }}>
                            <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 10,
                              background: line.status === 'completed' ? 'rgba(74,222,128,0.1)' : line.status === 'mo_created' ? 'rgba(96,165,250,0.1)' : 'rgba(251,191,36,0.1)',
                              color: line.status === 'completed' ? '#4ade80' : line.status === 'mo_created' ? '#60a5fa' : '#fbbf24',
                            }}>
                              {line.status.replace('_', ' ')}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, paddingTop: 8, borderTop: '0.5px solid rgba(255,255,255,0.06)', flexWrap: 'wrap' }}>
              {canConfirm && (
                <button onClick={() => handleStatus('confirmed')} disabled={actionBusy}
                  style={{ padding: '7px 16px', borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: 'pointer', background: 'rgba(96,165,250,0.1)', border: '0.5px solid rgba(96,165,250,0.25)', color: '#60a5fa', fontFamily: "'IBM Plex Sans',sans-serif", opacity: actionBusy ? 0.5 : 1 }}>
                  ✓ Confirm Plan
                </button>
              )}
              {detail?.status === 'in_progress' && (
                <button onClick={() => handleStatus('completed')} disabled={actionBusy}
                  style={{ padding: '7px 16px', borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: 'pointer', background: 'rgba(74,222,128,0.1)', border: '0.5px solid rgba(74,222,128,0.25)', color: '#4ade80', fontFamily: "'IBM Plex Sans',sans-serif", opacity: actionBusy ? 0.5 : 1 }}>
                  ✓ Mark Completed
                </button>
              )}
              {canCancel && (
                <button onClick={() => handleStatus('cancelled')} disabled={actionBusy}
                  style={{ padding: '7px 16px', borderRadius: 7, fontSize: 12, cursor: 'pointer', background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.2)', color: '#f87171', fontFamily: "'IBM Plex Sans',sans-serif", opacity: actionBusy ? 0.5 : 1 }}>
                  Cancel Plan
                </button>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

// ─── Create Plan Modal ─────────────────────────────────────────────────────────

interface NewPPLine { itemId: string; bomId: string; plannedQty: string; uom: string; plannedStart: string; plannedEnd: string; }
const EMPTY_LINE: NewPPLine = { itemId: '', bomId: '', plannedQty: '', uom: '', plannedStart: '', plannedEnd: '' };

function CreatePlanModal({ open, onClose, onSaved, items, boms }: {
  open: boolean; onClose: () => void; onSaved: () => void; items: Item[]; boms: Bom[];
}) {
  const [header, setHeader] = useState({ title: '', horizon: 'weekly', source: 'free', periodStart: '', periodEnd: '', notes: '' });
  const [lines,  setLines]  = useState<NewPPLine[]>([{ ...EMPTY_LINE }]);
  const [submitting, setSub] = useState(false);
  const [error, setError]   = useState('');

  useEffect(() => {
    if (open) { setError(''); setHeader({ title: '', horizon: 'weekly', source: 'free', periodStart: '', periodEnd: '', notes: '' }); setLines([{ ...EMPTY_LINE }]); }
  }, [open]);

  const setH = (k: keyof typeof header) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setHeader(h => ({ ...h, [k]: e.target.value }));

  const setLine = (idx: number, k: keyof NewPPLine, v: string) =>
    setLines(ls => ls.map((l, i) => {
      if (i !== idx) return l;
      const upd = { ...l, [k]: v };
      if (k === 'itemId' && v) {
        const it = items.find(x => x.id === v);
        if (it) upd.uom = it.baseUom;
        // Auto-select first matching BOM
        const bom = boms.find(b => b.parentItemId === v);
        if (bom) upd.bomId = bom.id;
      }
      return upd;
    }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!header.title.trim())  { setError('Title is required.'); return; }
    if (!header.periodStart || !header.periodEnd) { setError('Period start and end are required.'); return; }
    const valid = lines.filter(l => l.itemId && l.plannedQty && l.uom && l.plannedStart && l.plannedEnd);
    if (!valid.length) { setError('At least one complete line is required.'); return; }

    setSub(true); setError('');
    try {
      await productionPlansApi.create({
        title:       header.title,
        horizon:     header.horizon,
        source:      header.source,
        periodStart: header.periodStart,
        periodEnd:   header.periodEnd,
        notes:       header.notes || undefined,
        lines: valid.map(l => ({
          itemId:      l.itemId,
          bomId:       l.bomId || undefined,
          plannedQty:  Number(l.plannedQty),
          uom:         l.uom,
          plannedStart: l.plannedStart,
          plannedEnd:   l.plannedEnd,
        })),
      });
      onSaved(); onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Operation failed.');
    } finally { setSub(false); }
  };

  if (!open) return null;

  const INP: React.CSSProperties = { background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '8px 12px', fontSize: 12, fontFamily: "'IBM Plex Sans',sans-serif", color: '#f1ede8', outline: 'none', width: '100%' };
  const LBL: React.CSSProperties = { fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(251,146,60,0.6)' };

  const mfgItems = items.filter(it => it.isManufacturable);

  return (
    <>
      <style>{`
        .pp-overlay{position:fixed;inset:0;z-index:400;background:rgba(0,0,0,0.7);backdrop-filter:blur(4px);display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow-y:auto}
        .pp-box{background:#0e0b1a;border:0.5px solid rgba(251,146,60,0.2);border-radius:14px;width:100%;max-width:980px;margin:auto;position:relative;box-shadow:0 24px 60px rgba(0,0,0,0.7)}
        .pp-box::before{content:'';position:absolute;top:0;left:30px;right:30px;height:1px;background:linear-gradient(90deg,transparent,rgba(251,146,60,0.4),transparent);pointer-events:none}
        .pp-th{font-size:10px;color:rgba(251,146,60,0.5);text-transform:uppercase;letter-spacing:0.08em;padding:5px 6px;text-align:left;border-bottom:0.5px solid rgba(255,255,255,0.06);white-space:nowrap;font-weight:500}
        .pp-inp{background:rgba(255,255,255,0.04);border:0.5px solid rgba(255,255,255,0.1);border-radius:5px;padding:5px 7px;font-size:12px;font-family:'IBM Plex Sans',sans-serif;color:#f1ede8;outline:none;width:100%}
        .pp-sel{background:rgba(255,255,255,0.04);border:0.5px solid rgba(255,255,255,0.1);border-radius:5px;padding:5px 7px;font-size:12px;font-family:'IBM Plex Sans',sans-serif;color:#f1ede8;outline:none;width:100%}
        .pp-sel option{background:#0e0b1a}
        .pp-section{font-size:10px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.25);padding:6px 0 4px;border-bottom:0.5px solid rgba(255,255,255,0.06);margin-top:4px;display:flex;align-items:center;justify-content:space-between}
        .pp-btn-add{background:rgba(255,255,255,0.04);border:0.5px solid rgba(255,255,255,0.1);border-radius:5px;padding:4px 10px;font-size:11px;color:rgba(255,255,255,0.5);cursor:pointer;font-family:'IBM Plex Sans',sans-serif}
        .pp-btn-rm{width:20px;height:20px;border-radius:4px;background:rgba(239,68,68,0.1);border:0.5px solid rgba(239,68,68,0.2);color:#f87171;cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
      `}</style>
      <div className="pp-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="pp-box">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 12px', borderBottom: '0.5px solid rgba(255,255,255,0.06)', position: 'sticky', top: 0, background: '#0e0b1a', zIndex: 1, borderRadius: '14px 14px 0 0' }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: '#f1ede8' }}>New Production Plan</span>
            <button onClick={onClose} style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.45)', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
          </div>
          <form onSubmit={handleSubmit}>
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '0.5px solid rgba(239,68,68,0.25)', borderRadius: 7, padding: '8px 12px', fontSize: 12, color: '#fca5a5' }}>{error}</div>}

              <div style={{ display: 'grid', gridTemplateColumns: '3fr 1fr 1fr 1fr 1fr', gap: 10 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={LBL}>Title *</label>
                  <input value={header.title} onChange={setH('title')} placeholder="e.g. Semana 15 – Producción Cajas" style={INP} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={LBL}>Horizon *</label>
                  <select value={header.horizon} onChange={setH('horizon')} style={{ ...INP, cursor: 'pointer' }}>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="quarterly">Quarterly</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={LBL}>Source</label>
                  <select value={header.source} onChange={setH('source')} style={{ ...INP, cursor: 'pointer' }}>
                    <option value="free">Free Plan</option>
                    <option value="from_sales_orders">Sales Orders</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={LBL}>Period Start *</label>
                  <input type="date" value={header.periodStart} onChange={setH('periodStart')} style={INP} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={LBL}>Period End *</label>
                  <input type="date" value={header.periodEnd} onChange={setH('periodEnd')} style={INP} />
                </div>
              </div>

              <div className="pp-section">
                <span>Production Lines</span>
                <button type="button" className="pp-btn-add" onClick={() => setLines(ls => [...ls, { ...EMPTY_LINE }])}>+ Add Line</button>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th className="pp-th" style={{ width: 220 }}>Item (Finished Good) *</th>
                    <th className="pp-th" style={{ width: 170 }}>BOM</th>
                    <th className="pp-th" style={{ width: 90 }}>Planned Qty *</th>
                    <th className="pp-th" style={{ width: 60 }}>UOM *</th>
                    <th className="pp-th" style={{ width: 120 }}>Plan Start *</th>
                    <th className="pp-th" style={{ width: 120 }}>Plan End *</th>
                    <th className="pp-th" style={{ width: 24 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => {
                    const itemBoms = boms.filter(b => b.parentItemId === line.itemId);
                    return (
                      <tr key={idx}>
                        <td style={{ padding: '4px 3px' }}>
                          <select className="pp-sel" value={line.itemId} onChange={e => setLine(idx, 'itemId', e.target.value)}>
                            <option value="">— Select item —</option>
                            {mfgItems.map(it => <option key={it.id} value={it.id}>{it.code} — {it.name}</option>)}
                          </select>
                        </td>
                        <td style={{ padding: '4px 3px' }}>
                          <select className="pp-sel" value={line.bomId} onChange={e => setLine(idx, 'bomId', e.target.value)} disabled={!line.itemId || itemBoms.length === 0}>
                            <option value="">— Auto or select —</option>
                            {itemBoms.map(b => <option key={b.id} value={b.id}>{b.bomNumber} v{b.version}</option>)}
                          </select>
                        </td>
                        <td style={{ padding: '4px 3px' }}>
                          <input className="pp-inp" type="number" min="0.001" step="0.001" placeholder="0" value={line.plannedQty} onChange={e => setLine(idx, 'plannedQty', e.target.value)} style={{ textAlign: 'right' }} />
                        </td>
                        <td style={{ padding: '4px 3px' }}>
                          <input className="pp-inp" placeholder="PCS" value={line.uom} onChange={e => setLine(idx, 'uom', e.target.value)} />
                        </td>
                        <td style={{ padding: '4px 3px' }}>
                          <input className="pp-inp" type="date" value={line.plannedStart} onChange={e => setLine(idx, 'plannedStart', e.target.value)} style={{ colorScheme: 'dark' }} />
                        </td>
                        <td style={{ padding: '4px 3px' }}>
                          <input className="pp-inp" type="date" value={line.plannedEnd} onChange={e => setLine(idx, 'plannedEnd', e.target.value)} style={{ colorScheme: 'dark' }} />
                        </td>
                        <td style={{ padding: '4px 3px' }}>
                          {lines.length > 1 && <button type="button" className="pp-btn-rm" onClick={() => setLines(ls => ls.filter((_, i) => i !== idx))}>×</button>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px 18px', borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
              <button type="button" onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '8px 16px', fontSize: 13, fontFamily: "'IBM Plex Sans',sans-serif", color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>Cancel</button>
              <button type="submit" disabled={submitting} style={{ background: 'linear-gradient(135deg,#c2410c,#ea580c,#f97316)', border: 'none', borderRadius: 7, padding: '8px 20px', fontSize: 13, fontWeight: 500, fontFamily: "'IBM Plex Sans',sans-serif", color: 'white', cursor: 'pointer', boxShadow: '0 3px 12px rgba(234,88,12,0.35)', opacity: submitting ? 0.5 : 1 }}>
                {submitting ? 'Creating…' : 'Create Production Plan'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function ProductionPlansPage() {
  const [plans,      setPlans]      = useState<PP[]>([]);
  const [items,      setItems]      = useState<Item[]>([]);
  const [boms,       setBoms]       = useState<Bom[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [detailPlan, setDetailPlan] = useState<PP | null>(null);
  const [activeStatus, setActiveStatus] = useState<PPStatus | null>(null);

  const filterDefs = useMemo<ERPFilter<PP>[]>(() => [
    {
      key: 'horizon', label: 'Horizon', type: 'select', placeholder: 'All Horizons',
      options: [
        { value: 'weekly',    label: 'Weekly' },
        { value: 'monthly',   label: 'Monthly' },
        { value: 'quarterly', label: 'Quarterly' },
      ],
      filterFn: (row, val) => row.horizon === val,
    },
    {
      key: 'source', label: 'Source', type: 'select', placeholder: 'All Sources',
      options: [
        { value: 'free',              label: 'Free Plan' },
        { value: 'from_sales_orders', label: 'Sales Orders' },
      ],
      filterFn: (row, val) => row.source === val,
    },
  ], []);

  const { values: filterVals, setValue: setFilterVal, reset: resetFilters, activeCount: filterCount } = useERPFilters(filterDefs);

  const filtered = useMemo(() => {
    const base = applyERPFilters(plans, filterDefs, filterVals);
    return activeStatus ? base.filter(p => p.status === activeStatus) : base;
  }, [plans, filterDefs, filterVals, activeStatus]);

  const stats = useMemo(() => {
    const s: Partial<Record<PPStatus, number>> = {};
    plans.forEach(p => { s[p.status] = (s[p.status] ?? 0) + 1; });
    return s;
  }, [plans]);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [raw, its, bs] = await Promise.all([
        productionPlansApi.getAll(),
        itemsApi.getAll(),
        bomApi.getAll(),
      ]);
      setPlans(Array.isArray(raw) ? raw as PP[] : []);
      setItems(its as Item[]);
      const bomList = Array.isArray(bs) ? bs : (bs as any)?.value ?? [];
      setBoms(bomList as Bom[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const columns = useMemo<ERPColumn<PP>[]>(() => [
    {
      key: 'planNumber', header: 'Plan', width: 140, sortable: true,
      value: r => r.planNumber,
      render: r => <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: '#fb923c', fontWeight: 500 }}>{r.planNumber}</span>,
    },
    {
      key: 'title', header: 'Title', sortable: true,
      value: r => r.title,
      render: r => <span style={{ color: '#e2dfd8', fontWeight: 500 }}>{r.title}</span>,
    },
    {
      key: 'horizon', header: 'Horizon', width: 100, sortable: true,
      value: r => r.horizon,
      render: r => {
        const h = HORIZON_CFG[r.horizon as PPHorizon];
        return <span style={{ fontSize: 11, color: h?.color ?? '#e2dfd8', background: `${h?.color ?? '#e2dfd8'}18`, padding: '2px 8px', borderRadius: 20, border: `0.5px solid ${h?.color ?? '#e2dfd8'}35` }}>{h?.label ?? r.horizon}</span>;
      },
    },
    {
      key: 'period', header: 'Period', width: 160, sortable: false,
      value: r => r.periodStart,
      render: r => <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{fmtDateShort(r.periodStart)} → {fmtDateShort(r.periodEnd)}</span>,
    },
    {
      key: 'lines', header: 'Lines', width: 60, align: 'center', sortable: true,
      value: r => r._count?.lines ?? r.lines?.length ?? 0,
      render: r => <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{r._count?.lines ?? r.lines?.length ?? 0}</span>,
    },
    {
      key: 'crpStatus', header: 'CRP', width: 100, sortable: false,
      render: r => {
        if (!r.crpStatus) return <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>—</span>;
        const c = CRP_CFG[r.crpStatus];
        return <span style={{ fontSize: 11, color: c?.color ?? '#e2dfd8' }}>{c?.label ?? r.crpStatus}</span>;
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
        <button onClick={e => { e.stopPropagation(); setDetailPlan(r); }}
          style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.55)', fontFamily: "'IBM Plex Sans',sans-serif" }}>
          View
        </button>
      ),
    },
  ], []);

  return (
    <ERPShell breadcrumbs={['Home', 'Manufacturing', 'Production Plans']} title="Production Plans">
      <style>{`.pp-page{padding:0 18px 12px;display:flex;flex-direction:column;height:100%;overflow:hidden}`}</style>
      <div className="pp-page">

        {/* Status cards */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexShrink: 0, flexWrap: 'wrap' }}>
          {(Object.entries(STATUS_CFG) as [PPStatus, typeof STATUS_CFG[PPStatus]][]).map(([status, cfg]) => {
            const count = stats[status] ?? 0;
            if (!count && status !== 'draft') return null;
            const isActive = activeStatus === status;
            return (
              <div key={status}
                onClick={() => setActiveStatus(prev => prev === status ? null : status)}
                style={{ background: isActive ? cfg.bg : 'rgba(10,7,18,0.7)', border: `0.5px solid ${isActive ? cfg.color : cfg.border}`, borderRadius: 8, padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 95, cursor: 'pointer', transition: 'all 0.15s' }}>
                <span style={{ fontSize: 10, color: cfg.color, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500 }}>{cfg.label}</span>
                <span style={{ fontSize: 22, fontWeight: 500, color: isActive ? cfg.color : '#f1ede8', fontFamily: "'IBM Plex Mono',monospace" }}>{count}</span>
              </div>
            );
          })}
          <div onClick={() => setActiveStatus(null)}
            style={{ background: !activeStatus ? 'rgba(251,146,60,0.08)' : 'rgba(10,7,18,0.7)', border: `0.5px solid ${!activeStatus ? 'rgba(251,146,60,0.3)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 8, padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 70, cursor: 'pointer' }}>
            <span style={{ fontSize: 10, color: 'rgba(251,146,60,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500 }}>Total</span>
            <span style={{ fontSize: 22, fontWeight: 500, color: '#fb923c', fontFamily: "'IBM Plex Mono',monospace" }}>{plans.length}</span>
          </div>
        </div>

        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 10, flexShrink: 0, flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}>
            <ERPFilterBar filters={filterDefs} values={filterVals} onChange={setFilterVal} onReset={resetFilters} activeCount={filterCount} />
          </div>
          <button onClick={() => setCreateOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'linear-gradient(135deg,#c2410c,#ea580c,#f97316)', border: 'none', borderRadius: 7, padding: '7px 14px', fontSize: 12, fontWeight: 500, fontFamily: "'IBM Plex Sans',sans-serif", color: 'white', cursor: 'pointer', boxShadow: '0 3px 12px rgba(234,88,12,0.3)', flexShrink: 0, alignSelf: 'flex-end' }}>
            + New Plan
          </button>
        </div>

        {error && <div style={{ background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 10, fontSize: 13, color: '#fca5a5', flexShrink: 0 }}>{error}</div>}

        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <ERPTable<PP>
            columns={columns} data={filtered} rowKey={r => r.id} loading={loading}
            exportFilename="production-plans"
            emptyMessage={filterCount || activeStatus ? 'No plans match your filters.' : 'No production plans yet.'}
            defaultPageSize={25} maxHeight="100%"
            onRowClick={plan => setDetailPlan(plan)}
          />
        </div>
      </div>

      <CreatePlanModal open={createOpen} onClose={() => setCreateOpen(false)} onSaved={fetchAll} items={items} boms={boms} />
      {detailPlan && <PlanDetailDrawer plan={detailPlan} onClose={() => setDetailPlan(null)} onAction={() => { fetchAll(); }} />}
    </ERPShell>
  );
}
