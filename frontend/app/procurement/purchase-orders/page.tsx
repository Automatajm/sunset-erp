"use client";

import { useEffect, useState, useCallback, useMemo } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import { ERPTable, ERPColumn } from '@/components/ui/ERPTable';
import SearchSelect from '@/components/ui/SearchSelect';
import { ERPFilterBar, ERPFilter, useERPFilters, applyERPFilters } from '@/components/ui/ERPFilterBar';
import { purchaseOrdersApi } from '@/lib/api/purchase-orders';
import { suppliersApi } from '@/lib/api/suppliers';
import { itemsApi } from '@/lib/api/items';
import { warehousesApi } from '@/lib/api/warehouses';
import { PrintButton } from '@/components/print/PrintButton';
import { ConfirmModal } from '@/components/ui/modal';
import { Supplier, Item } from '@/lib/api/types';

// ─── Types ────────────────────────────────────────────────────────────────────

type POStatus = 'draft' | 'confirmed' | 'partially_received' | 'received' | 'cancelled' | 'closed';

interface POLine {
  id: string; lineNumber: number;
  itemId: string; item?: { id: string; code: string; name: string; baseUom: string };
  description?: string;
  orderedQuantity: string; receivedQuantity: string;
  uom: string; unitPrice: string; discountPercent: string;
  lineTotal: string; expectedDate?: string; status: string;
}

interface PO {
  id: string; poNumber: string; supplierId: string;
  supplier?: { id: string; code: string; name: string; email?: string; phone?: string };
  poDate: string; expectedDate?: string; deliveryAddress?: string;
  paymentTerms?: string; currency?: string;
  subtotal: string; discountAmount: string; taxAmount: string; total: string;
  status: POStatus; notes?: string;
  lines?: POLine[]; _count?: { lines: number }; createdAt: string;
}

interface Warehouse { id: string; code: string; name: string; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtAmt(v: string | number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(v));
}
function fmtDate(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtDateShort(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_CFG: Record<POStatus, { color: string; bg: string; border: string; label: string }> = {
  draft:              { color: 'var(--warning, #fbbf24)', bg: 'rgba(251,191,36,0.1)',   border: 'rgba(251,191,36,0.2)',   label: 'Draft' },
  confirmed:          { color: 'var(--accent-blue, #60a5fa)', bg: 'rgba(96,165,250,0.1)',   border: 'rgba(96,165,250,0.2)',   label: 'Confirmed' },
  partially_received: { color: 'var(--accent-strong, #fb923c)', bg: 'rgba(251,146,60,0.1)',   border: 'rgba(251,146,60,0.2)',   label: 'Partial' },
  received:           { color: 'var(--success, #4ade80)', bg: 'rgba(74,222,128,0.1)',   border: 'rgba(74,222,128,0.2)',   label: 'Received' },
  cancelled:          { color: 'var(--danger, #f87171)', bg: 'rgba(248,113,113,0.1)',  border: 'rgba(248,113,113,0.2)',  label: 'Cancelled' },
  closed:             { color: 'var(--accent-violet, #a78bfa)', bg: 'rgba(167,139,250,0.1)',  border: 'rgba(167,139,250,0.2)',  label: 'Closed' },
};

function StatusBadge({ status }: { status: POStatus }) {
  const s = STATUS_CFG[status] ?? STATUS_CFG.draft;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 500, color: s.color, background: s.bg, border: `0.5px solid ${s.border}`, whiteSpace: 'nowrap' }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
      {s.label}
    </span>
  );
}

// ─── PO Detail drawer ─────────────────────────────────────────────────────────

function PODetailDrawer({ po, onClose, onAction }: {
  po: PO; onClose: () => void; onAction: () => void;
}) {
  const [detail,      setDetail]      = useState<PO | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [warehouses,  setWarehouses]  = useState<Warehouse[]>([]);
  const [receiving,   setReceiving]   = useState(false);
  const [recvWh,      setRecvWh]      = useState('');
  const [recvQtys,    setRecvQtys]    = useState<Record<string, string>>({});
  const [recvBusy,    setRecvBusy]    = useState(false);
  const [recvError,   setRecvError]   = useState('');
  const [actionBusy]  = useState(false); // ConfirmModal owns the pending state now

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [d, whs] = await Promise.all([
          purchaseOrdersApi.getById(po.id),
          warehousesApi.getAll(),
        ]);
        setDetail(d as PO);
        setWarehouses(whs as Warehouse[]);
        // Init receive quantities to 0
        const init: Record<string, string> = {};
        (d as PO).lines?.forEach(l => { init[l.id] = ''; });
        setRecvQtys(init);
      } finally { setLoading(false); }
    })();
  }, [po.id]);

  // spec-frontend-002 adoption — status transitions are now guarded by a
  // ConfirmModal. doStatus throws on error so ConfirmModal surfaces it inline.
  const [confirmStatus, setConfirmStatus] = useState<
    { status: string; title: string; description: string; variant: 'default' | 'destructive'; label: string } | null
  >(null);

  const doStatus = async (status: string) => {
    await purchaseOrdersApi.updateStatus(po.id, status as any);
    onAction(); onClose();
  };

  const handleReceive = async () => {
    if (!recvWh) { setRecvError('Select a warehouse.'); return; }
    const lines = Object.entries(recvQtys)
      .filter(([, qty]) => qty && Number(qty) > 0)
      .map(([lineId, qty]) => ({ lineId, receivedQuantity: Number(qty) }));
    if (!lines.length) { setRecvError('Enter at least one quantity to receive.'); return; }

    setRecvBusy(true); setRecvError('');
    try {
      await (purchaseOrdersApi as any).receive(po.id, { warehouseId: recvWh, lines });
      onAction(); onClose();
    } catch (err: any) {
      setRecvError(err?.response?.data?.message || 'Receive failed.');
    } finally { setRecvBusy(false); }
  };

  const MONO: React.CSSProperties = { fontFamily: "'IBM Plex Mono',monospace" };
  const canReceive = detail && ['confirmed', 'partially_received'].includes(detail.status);
  const canConfirm = detail?.status === 'draft';
  const canCancel  = detail && ['draft', 'confirmed'].includes(detail.status);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex' }}>
      {/* Backdrop */}
      <div style={{ flex: 1, background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(2px)' }} onClick={onClose} />
      {/* Drawer */}
      <div style={{ width: 680, background: 'var(--bg, #0a0712)', borderLeft: '0.5px solid rgba(251,146,60,0.15)', display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '0.5px solid var(--l06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-strong, #f1ede8)', fontFamily: "'IBM Plex Mono',monospace" }}>{po.poNumber}</div>
            <div style={{ fontSize: 12, color: 'var(--w40)', marginTop: 2 }}>{po.supplier?.name}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <StatusBadge status={po.status} />
            <PrintButton doc="purchase-order" id={po.id} style={{ padding: '6px 12px' }} />
            <button onClick={onClose} style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--l06)', border: 'none', cursor: 'pointer', color: 'var(--w45)', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
          </div>
        </div>

        {loading ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--w30)', fontSize: 13 }}>
            Loading…
          </div>
        ) : detail ? (
          <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* PO Info */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10 }}>
              {[
                { label: 'PO Date',       value: fmtDate(detail.poDate) },
                { label: 'Expected',      value: fmtDate(detail.expectedDate) },
                { label: 'Payment Terms', value: detail.paymentTerms || '—' },
                { label: 'Currency',      value: detail.currency || 'USD' },
              ].map(item => (
                <div key={item.label} style={{ background: 'var(--l03)', borderRadius: 8, padding: '8px 12px' }}>
                  <div style={{ fontSize: 10, color: 'var(--w30)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{item.label}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-primary, #e2dfd8)' }}>{item.value}</div>
                </div>
              ))}
            </div>

            {/* Lines table */}
            <div>
              <div style={{ fontSize: 11, fontWeight: 500, color: 'rgba(251,146,60,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Order Lines</div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr>
                    {['#', 'Item', 'Ordered', 'Received', 'UOM', 'Price', 'Total', 'Status'].map(h => (
                      <th key={h} style={{ padding: '6px 8px', fontSize: 10, color: 'rgba(251,146,60,0.5)', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: ['Ordered','Received','Price','Total'].includes(h) ? 'right' : 'left', borderBottom: '0.5px solid var(--l06)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detail.lines?.map(line => {
                    const pct = Number(line.orderedQuantity) > 0
                      ? (Number(line.receivedQuantity) / Number(line.orderedQuantity)) * 100
                      : 0;
                    return (
                      <tr key={line.id} style={{ borderBottom: '0.5px solid var(--l04)' }}>
                        <td style={{ padding: '8px', color: 'var(--w30)' }}>{line.lineNumber}</td>
                        <td style={{ padding: '8px' }}>
                          <div style={{ ...MONO, color: 'var(--accent-strong, #fb923c)', fontSize: 11 }}>{line.item?.code}</div>
                          <div style={{ color: 'var(--w55)', fontSize: 11, marginTop: 1 }}>{line.item?.name}</div>
                        </td>
                        <td style={{ padding: '8px', textAlign: 'right', ...MONO }}>{Number(line.orderedQuantity).toLocaleString()}</td>
                        <td style={{ padding: '8px', textAlign: 'right' }}>
                          <div style={{ ...MONO, color: pct >= 100 ? 'var(--success, #4ade80)' : pct > 0 ? 'var(--accent-strong, #fb923c)' : 'var(--w40)' }}>
                            {Number(line.receivedQuantity).toLocaleString()}
                          </div>
                          {pct > 0 && pct < 100 && (
                            <div style={{ fontSize: 10, color: 'var(--w30)', marginTop: 2 }}>{pct.toFixed(0)}%</div>
                          )}
                        </td>
                        <td style={{ padding: '8px', color: 'var(--w45)' }}>{line.uom}</td>
                        <td style={{ padding: '8px', textAlign: 'right', ...MONO, fontSize: 11 }}>{fmtAmt(line.unitPrice)}</td>
                        <td style={{ padding: '8px', textAlign: 'right', ...MONO, fontWeight: 500, color: 'var(--text-primary, #e2dfd8)' }}>{fmtAmt(line.lineTotal)}</td>
                        <td style={{ padding: '8px' }}>
                          <span style={{ fontSize: 10, padding: '1px 6px', borderRadius: 10, background: line.status === 'closed' ? 'rgba(74,222,128,0.1)' : 'var(--l05)', color: line.status === 'closed' ? 'var(--success, #4ade80)' : 'var(--w40)', border: `0.5px solid ${line.status === 'closed' ? 'rgba(74,222,128,0.2)' : 'var(--l08)'}` }}>
                            {line.status}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  <tr style={{ background: 'var(--l02)' }}>
                    <td colSpan={5} style={{ padding: '8px', fontSize: 11, color: 'var(--w30)', fontWeight: 500 }}>TOTAL</td>
                    <td colSpan={2} style={{ padding: '8px', textAlign: 'right', ...MONO, fontWeight: 600, color: 'var(--accent-strong, #fb923c)', fontSize: 14 }}>{fmtAmt(detail.total)}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Receive goods section */}
            {canReceive && (
              <div style={{ background: 'rgba(74,222,128,0.04)', border: '0.5px solid rgba(74,222,128,0.15)', borderRadius: 10, padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--success, #4ade80)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Receive Goods</span>
                  <button
                    type="button"
                    onClick={() => setReceiving(r => !r)}
                    style={{ fontSize: 11, color: receiving ? 'var(--danger, #f87171)' : 'var(--success, #4ade80)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif" }}
                  >
                    {receiving ? 'Cancel' : 'Enter Receipt'}
                  </button>
                </div>

                {receiving && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {recvError && (
                      <div style={{ background: 'rgba(239,68,68,0.1)', border: '0.5px solid rgba(239,68,68,0.2)', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: 'var(--danger-subtle, #fca5a5)' }}>{recvError}</div>
                    )}

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <label style={{ fontSize: 10, fontWeight: 500, color: 'var(--w40)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Warehouse *</label>
                      <SearchSelect
                        options={warehouses.map(w => ({ value: w.id, label: `${w.code} — ${w.name}` }))}
                        value={recvWh}
                        onChange={setRecvWh}
                        placeholder="Search warehouse…"
                        clearLabel="— Select warehouse —"
                        minWidth={260}
                      />
                    </div>

                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                      <thead>
                        <tr>
                          <th style={{ padding: '5px 6px', fontSize: 10, color: 'var(--w35)', textAlign: 'left', fontWeight: 500 }}>Item</th>
                          <th style={{ padding: '5px 6px', fontSize: 10, color: 'var(--w35)', textAlign: 'right', fontWeight: 500 }}>Ordered</th>
                          <th style={{ padding: '5px 6px', fontSize: 10, color: 'var(--w35)', textAlign: 'right', fontWeight: 500 }}>Received</th>
                          <th style={{ padding: '5px 6px', fontSize: 10, color: 'var(--w35)', textAlign: 'right', fontWeight: 500 }}>Pending</th>
                          <th style={{ padding: '5px 6px', fontSize: 10, color: 'rgba(74,222,128,0.7)', textAlign: 'right', fontWeight: 500 }}>Receive Now</th>
                        </tr>
                      </thead>
                      <tbody>
                        {detail.lines?.filter(l => l.status !== 'closed').map(line => {
                          const pending = Number(line.orderedQuantity) - Number(line.receivedQuantity);
                          return (
                            <tr key={line.id} style={{ borderTop: '0.5px solid var(--l04)' }}>
                              <td style={{ padding: '6px' }}>
                                <span style={{ ...MONO, fontSize: 11, color: 'var(--accent-strong, #fb923c)' }}>{line.item?.code}</span>
                                <span style={{ fontSize: 11, color: 'var(--w50)', marginLeft: 6 }}>{line.item?.name}</span>
                              </td>
                              <td style={{ padding: '6px', textAlign: 'right', ...MONO, color: 'var(--w40)' }}>{Number(line.orderedQuantity).toLocaleString()}</td>
                              <td style={{ padding: '6px', textAlign: 'right', ...MONO, color: 'var(--w40)' }}>{Number(line.receivedQuantity).toLocaleString()}</td>
                              <td style={{ padding: '6px', textAlign: 'right', ...MONO, color: 'var(--accent-strong, #fb923c)' }}>{pending.toLocaleString()}</td>
                              <td style={{ padding: '6px' }}>
                                <input
                                  type="number" min="0" max={pending} step="0.001"
                                  placeholder={`max ${pending}`}
                                  value={recvQtys[line.id] ?? ''}
                                  onChange={e => setRecvQtys(q => ({ ...q, [line.id]: e.target.value }))}
                                  style={{ background: 'var(--l06)', border: '0.5px solid rgba(74,222,128,0.25)', borderRadius: 5, padding: '4px 8px', fontSize: 12, fontFamily: "'IBM Plex Mono',monospace", color: 'var(--text-primary, #e2dfd8)', outline: 'none', width: '100%', textAlign: 'right' }}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                      <button
                        onClick={handleReceive} disabled={recvBusy}
                        style={{ background: 'linear-gradient(135deg,#166534,#15803d,#16a34a)', border: 'none', borderRadius: 7, padding: '8px 20px', fontSize: 13, fontWeight: 500, fontFamily: "'IBM Plex Sans',sans-serif", color: 'white', cursor: recvBusy ? 'not-allowed' : 'pointer', opacity: recvBusy ? 0.5 : 1 }}
                      >
                        {recvBusy ? 'Processing…' : 'Confirm Receipt'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: 8, paddingTop: 8, borderTop: '0.5px solid var(--l06)', flexWrap: 'wrap' }}>
              {canConfirm && (
                <button onClick={() => setConfirmStatus({ status: 'confirmed', title: `Confirm PO ${po.poNumber}?`, description: 'This issues the purchase order to the supplier.', variant: 'default', label: 'Confirm PO' })} disabled={actionBusy}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 16px', borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: 'pointer', background: 'rgba(96,165,250,0.1)', border: '0.5px solid rgba(96,165,250,0.25)', color: 'var(--accent-blue, #60a5fa)', fontFamily: "'IBM Plex Sans',sans-serif", opacity: actionBusy ? 0.5 : 1 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  Confirm PO
                </button>
              )}
              {detail?.status === 'received' && (
                <button onClick={() => setConfirmStatus({ status: 'closed', title: `Close PO ${po.poNumber}?`, description: 'This marks the purchase order complete.', variant: 'default', label: 'Close PO' })} disabled={actionBusy}
                  style={{ padding: '7px 16px', borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: 'pointer', background: 'rgba(167,139,250,0.1)', border: '0.5px solid rgba(167,139,250,0.25)', color: 'var(--accent-violet, #a78bfa)', fontFamily: "'IBM Plex Sans',sans-serif", opacity: actionBusy ? 0.5 : 1 }}>
                  Close PO
                </button>
              )}
              {canCancel && (
                <button onClick={() => setConfirmStatus({ status: 'cancelled', title: `Cancel PO ${po.poNumber}?`, description: 'This cancels the purchase order. It cannot be undone.', variant: 'destructive', label: 'Cancel PO' })} disabled={actionBusy}
                  style={{ padding: '7px 16px', borderRadius: 7, fontSize: 12, cursor: 'pointer', background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.2)', color: 'var(--danger, #f87171)', fontFamily: "'IBM Plex Sans',sans-serif", opacity: actionBusy ? 0.5 : 1 }}>
                  Cancel PO
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

// ─── Create PO modal ──────────────────────────────────────────────────────────

interface NewPOLine { itemId: string; description: string; orderedQuantity: string; uom: string; unitPrice: string; discountPercent: string; expectedDate: string; }
const EMPTY_LINE: NewPOLine = { itemId: '', description: '', orderedQuantity: '', uom: '', unitPrice: '', discountPercent: '0', expectedDate: '' };

function CreatePOModal({ open, onClose, onSaved, suppliers, items }: {
  open: boolean; onClose: () => void; onSaved: () => void; suppliers: Supplier[]; items: Item[];
}) {
  const [header, setHeader]     = useState({ supplierId: '', expectedDate: '', deliveryAddress: '', paymentTerms: 'Net 30', currency: 'USD', notes: '' });
  const [lines,  setLines]      = useState<NewPOLine[]>([{ ...EMPTY_LINE }]);
  const [submitting, setSub]    = useState(false);
  const [error, setError]       = useState('');

  useEffect(() => {
    if (open) { setError(''); setHeader({ supplierId: '', expectedDate: '', deliveryAddress: '', paymentTerms: 'Net 30', currency: 'USD', notes: '' }); setLines([{ ...EMPTY_LINE }]); }
  }, [open]);

  const setH = (k: keyof typeof header) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setHeader(h => ({ ...h, [k]: e.target.value }));

  const setLine = (idx: number, k: keyof NewPOLine, v: string) =>
    setLines(ls => ls.map((l, i) => {
      if (i !== idx) return l;
      const upd = { ...l, [k]: v };
      if (k === 'itemId') { const it = items.find(x => x.id === v); if (it) upd.uom = it.baseUom; }
      return upd;
    }));

  const lineTotal = (l: NewPOLine) => (Number(l.orderedQuantity) || 0) * (Number(l.unitPrice) || 0) * (1 - (Number(l.discountPercent) || 0) / 100);
  const grandTotal = lines.reduce((s, l) => s + lineTotal(l), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!header.supplierId) { setError('Supplier is required.'); return; }
    const valid = lines.filter(l => l.itemId && l.orderedQuantity && l.unitPrice);
    if (!valid.length) { setError('At least one complete line is required.'); return; }
    setSub(true); setError('');
    try {
      await purchaseOrdersApi.create({
        supplierId: header.supplierId,
        expectedDate: header.expectedDate || undefined,
        deliveryAddress: header.deliveryAddress || undefined,
        paymentTerms: header.paymentTerms || undefined,
        currency: header.currency,
        notes: header.notes || undefined,
        lines: valid.map(l => ({
          itemId: l.itemId, description: l.description || undefined,
          orderedQuantity: Number(l.orderedQuantity), uom: l.uom,
          unitPrice: Number(l.unitPrice), discountPercent: Number(l.discountPercent) || undefined,
          expectedDate: l.expectedDate || undefined,
        })),
      });
      onSaved(); onClose();
    } catch (err: any) {
      setError(err?.response?.data?.message || 'Operation failed.');
    } finally { setSub(false); }
  };

  if (!open) return null;

  const INP: React.CSSProperties = { background: 'var(--l04, rgba(255,255,255,0.04))', border: '0.5px solid var(--w10, rgba(255,255,255,0.1))', borderRadius: 7, padding: '8px 12px', fontSize: 12, fontFamily: "'IBM Plex Sans',sans-serif", color: 'var(--text-strong, #f1ede8)', outline: 'none', width: '100%' };
  const LBL: React.CSSProperties = { fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(251,146,60,0.6)' };

  return (
    <>
      <style>{`
        .po-overlay{position:fixed;inset:0;z-index:400;background:rgba(0,0,0,0.7);backdrop-filter:blur(4px);display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow-y:auto}
        .po-box{background:var(--surface, #0e0b1a);border:0.5px solid rgba(251,146,60,0.2);border-radius:14px;width:100%;max-width:860px;margin:auto;position:relative;box-shadow:0 24px 60px rgba(0,0,0,0.7)}
        .po-box::before{content:'';position:absolute;top:0;left:30px;right:30px;height:1px;background:linear-gradient(90deg,transparent,rgba(251,146,60,0.4),transparent);pointer-events:none}
        .po-lines-th{font-size:10px;color:rgba(251,146,60,0.5);text-transform:uppercase;letter-spacing:0.08em;padding:5px 6px;text-align:left;border-bottom:0.5px solid rgba(255,255,255,0.06);white-space:nowrap;font-weight:500}
        .po-line-inp{background:rgba(255,255,255,0.04);border:0.5px solid rgba(255,255,255,0.1);border-radius:5px;padding:5px 7px;font-size:12px;font-family:'IBM Plex Sans',sans-serif;color:var(--text-strong, #f1ede8);outline:none;width:100%}
        .po-line-sel{background:rgba(255,255,255,0.04);border:0.5px solid rgba(255,255,255,0.1);border-radius:5px;padding:5px 7px;font-size:12px;font-family:'IBM Plex Sans',sans-serif;color:var(--text-strong, #f1ede8);outline:none;width:100%}
        .po-line-sel option{background:var(--surface, #0e0b1a)}
        .po-section{font-size:10px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.25);padding:6px 0 4px;border-bottom:0.5px solid rgba(255,255,255,0.06);margin-top:4px;display:flex;align-items:center;justify-content:space-between}
        .po-btn-add{background:rgba(255,255,255,0.04);border:0.5px solid rgba(255,255,255,0.1);border-radius:5px;padding:4px 10px;font-size:11px;color:rgba(255,255,255,0.5);cursor:pointer;font-family:'IBM Plex Sans',sans-serif}
        .po-btn-rm{width:20px;height:20px;border-radius:4px;background:rgba(239,68,68,0.1);border:0.5px solid rgba(239,68,68,0.2);color:var(--danger, #f87171);cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
      `}</style>
      <div className="po-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="po-box">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 12px', borderBottom: '0.5px solid rgba(255,255,255,0.06)', position: 'sticky', top: 0, background: 'var(--surface, #0e0b1a)', zIndex: 1, borderRadius: '14px 14px 0 0' }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-strong, #f1ede8)' }}>New Purchase Order</span>
            <button onClick={onClose} style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.45)', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
          </div>
          <form onSubmit={handleSubmit}>
            <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '0.5px solid rgba(239,68,68,0.25)', borderRadius: 7, padding: '8px 12px', fontSize: 12, color: 'var(--danger-subtle, #fca5a5)' }}>{error}</div>}

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={LBL}>Supplier *</label>
                  <SearchSelect
                    options={suppliers.map(s => ({ value: s.id, label: `${s.code} — ${s.name}` }))}
                    value={header.supplierId}
                    onChange={v => setHeader(h => ({ ...h, supplierId: v }))}
                    placeholder="Search supplier…"
                    clearLabel="— Select supplier —"
                    minWidth={280}
                  />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={LBL}>Expected Date</label>
                  <input type="date" value={header.expectedDate} onChange={setH('expectedDate')} style={INP} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={LBL}>Currency</label>
                  <SearchSelect options={['USD','EUR','DOP','GBP'].map(c => ({ value: c, label: c }))} value={header.currency} onChange={v => setHeader(h => ({ ...h, currency: v }))} placeholder="Currency…" minWidth={160} />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={LBL}>Payment Terms</label>
                  <input placeholder="Net 30" value={header.paymentTerms} onChange={setH('paymentTerms')} style={INP} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={LBL}>Delivery Address</label>
                  <input placeholder="Address" value={header.deliveryAddress} onChange={setH('deliveryAddress')} style={INP} />
                </div>
              </div>

              <div className="po-section">
                <span>Order Lines</span>
                <button type="button" className="po-btn-add" onClick={() => setLines(ls => [...ls, { ...EMPTY_LINE }])}>+ Add Line</button>
              </div>

              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th className="po-lines-th" style={{ width: 220 }}>Item *</th>
                    <th className="po-lines-th">Description</th>
                    <th className="po-lines-th" style={{ width: 80 }}>Qty *</th>
                    <th className="po-lines-th" style={{ width: 60 }}>UOM</th>
                    <th className="po-lines-th" style={{ width: 90 }}>Price *</th>
                    <th className="po-lines-th" style={{ width: 60 }}>Disc%</th>
                    <th className="po-lines-th" style={{ width: 100 }}>Total</th>
                    <th className="po-lines-th" style={{ width: 110 }}>Exp. Date</th>
                    <th className="po-lines-th" style={{ width: 24 }}></th>
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
                          placeholder="Item…"
                          clearLabel="— Item —"
                          minWidth={240}
                        />
                      </td>
                      <td style={{ padding: '4px 3px' }}><input className="po-line-inp" placeholder="Description" value={line.description} onChange={e => setLine(idx, 'description', e.target.value)} /></td>
                      <td style={{ padding: '4px 3px' }}><input className="po-line-inp" type="number" min="0" step="0.001" placeholder="0" value={line.orderedQuantity} onChange={e => setLine(idx, 'orderedQuantity', e.target.value)} style={{ textAlign: 'right' }} /></td>
                      <td style={{ padding: '4px 3px' }}><input className="po-line-inp" placeholder="PCS" value={line.uom} onChange={e => setLine(idx, 'uom', e.target.value)} /></td>
                      <td style={{ padding: '4px 3px' }}><input className="po-line-inp" type="number" min="0" step="0.01" placeholder="0.00" value={line.unitPrice} onChange={e => setLine(idx, 'unitPrice', e.target.value)} style={{ textAlign: 'right' }} /></td>
                      <td style={{ padding: '4px 3px' }}><input className="po-line-inp" type="number" min="0" max="100" step="0.1" placeholder="0" value={line.discountPercent} onChange={e => setLine(idx, 'discountPercent', e.target.value)} style={{ textAlign: 'right' }} /></td>
                      <td style={{ padding: '4px 6px', fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: 'var(--text-primary, #e2dfd8)', textAlign: 'right' }}>{lineTotal(line) > 0 ? fmtAmt(lineTotal(line)) : '—'}</td>
                      <td style={{ padding: '4px 3px' }}><input className="po-line-inp" type="date" value={line.expectedDate} onChange={e => setLine(idx, 'expectedDate', e.target.value)} /></td>
                      <td style={{ padding: '4px 3px' }}>{lines.length > 1 && <button type="button" className="po-btn-rm" onClick={() => setLines(ls => ls.filter((_, i) => i !== idx))}>×</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, padding: '8px 0', borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Grand Total</span>
                <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 14, fontWeight: 500, color: 'var(--accent-strong, #fb923c)' }}>{fmtAmt(grandTotal)}</span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px 18px', borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
              <button type="button" onClick={onClose} style={{ background: 'var(--l05, rgba(255,255,255,0.05))', border: '0.5px solid var(--w10, rgba(255,255,255,0.1))', borderRadius: 7, padding: '8px 16px', fontSize: 13, fontFamily: "'IBM Plex Sans',sans-serif", color: 'var(--w50, rgba(255,255,255,0.5))', cursor: 'pointer' }}>Cancel</button>
              <button type="submit" disabled={submitting} style={{ background: 'linear-gradient(135deg,var(--accent-pressed, #c2410c),var(--accent, #ea580c),var(--accent-mid, #f97316))', border: 'none', borderRadius: 7, padding: '8px 20px', fontSize: 13, fontWeight: 500, fontFamily: "'IBM Plex Sans',sans-serif", color: 'white', cursor: 'pointer', boxShadow: '0 3px 12px rgba(234,88,12,0.35)', opacity: submitting ? 0.5 : 1 }}>
                {submitting ? 'Creating…' : 'Create Purchase Order'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function PurchaseOrdersPage() {
  const [orders,      setOrders]      = useState<PO[]>([]);
  const [suppliers,   setSuppliers]   = useState<Supplier[]>([]);
  const [items,       setItems]       = useState<Item[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [createOpen,  setCreateOpen]  = useState(false);
  const [detailPO,    setDetailPO]    = useState<PO | null>(null);
  const [activeType,  setActiveType]  = useState<POStatus | null>(null);

  // ── Filters ────────────────────────────────────────────────────────────────
  const filterDefs = useMemo<ERPFilter<PO>[]>(() => [
    {
      key: 'supplierId', label: 'Supplier', type: 'searchselect', placeholder: 'All Suppliers',
      options: suppliers.map(s => ({ value: s.id, label: `${s.code} — ${s.name}`, sublabel: s.paymentTerms ?? undefined })),
      filterFn: (row, val) => row.supplierId === val,
    },
    {
      key: 'currency', label: 'Currency', type: 'select', placeholder: 'All',
      options: ['USD','EUR','DOP'].map(c => ({ value: c, label: c })),
      filterFn: (row, val) => (row.currency ?? 'USD') === val,
    },
  ], [suppliers]);

  const { values: filterVals, setValue: setFilterVal, reset: resetFilters, activeCount: filterCount } = useERPFilters(filterDefs);

  const filtered = useMemo(() => {
    const base = applyERPFilters(orders, filterDefs, filterVals);
    return activeType ? base.filter(o => o.status === activeType) : base;
  }, [orders, filterDefs, filterVals, activeType]);

  // ── Stats ──────────────────────────────────────────────────────────────────
  const stats = useMemo(() => {
    const s: Partial<Record<POStatus, number>> = {};
    orders.forEach(o => { s[o.status] = (s[o.status] ?? 0) + 1; });
    return s;
  }, [orders]);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [raw, sups, its] = await Promise.all([
        purchaseOrdersApi.getAll(),
        suppliersApi.getAll(),
        itemsApi.getAll(),
      ]);
      setOrders(Array.isArray(raw) ? raw as PO[] : []);
      setSuppliers(sups);
      setItems(its);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // ── Columns ────────────────────────────────────────────────────────────────
  const columns = useMemo<ERPColumn<PO>[]>(() => [
    {
      key: 'poNumber', header: 'PO Number', width: 140, sortable: true,
      value: r => r.poNumber,
      render: r => <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: 'var(--accent-strong, #fb923c)', fontWeight: 500 }}>{r.poNumber}</span>,
    },
    {
      key: 'supplier', header: 'Supplier', sortable: true,
      value: r => r.supplier?.name ?? '',
      render: r => <span style={{ color: 'var(--text-primary, #e2dfd8)', fontWeight: 500 }}>{r.supplier?.name ?? '—'}</span>,
    },
    {
      key: 'poDate', header: 'Date', width: 100, sortable: true,
      value: r => r.poDate,
      render: r => <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{fmtDateShort(r.poDate)}</span>,
    },
    {
      key: 'expectedDate', header: 'Expected', width: 100, sortable: true,
      value: r => r.expectedDate ?? '',
      render: r => <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{fmtDateShort(r.expectedDate)}</span>,
    },
    {
      key: 'lines', header: 'Lines', width: 60, align: 'center', sortable: true,
      value: r => r._count?.lines ?? r.lines?.length ?? 0,
      render: r => <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{r._count?.lines ?? r.lines?.length ?? 0}</span>,
    },
    {
      key: 'total', header: 'Total', width: 120, align: 'right', sortable: true,
      value: r => Number(r.total),
      render: r => <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, fontWeight: 500, color: 'var(--text-primary, #e2dfd8)' }}>{fmtAmt(r.total)}</span>,
    },
    {
      key: 'currency', header: 'Cur.', width: 55, align: 'center', sortable: false,
      render: r => <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{r.currency ?? 'USD'}</span>,
    },
    {
      key: 'status', header: 'Status', width: 130, sortable: true,
      value: r => r.status,
      render: r => <StatusBadge status={r.status} />,
    },
    {
      key: '_actions', header: '', width: 80, sortable: false,
      render: r => (
        <button
          onClick={e => { e.stopPropagation(); setDetailPO(r); }}
          style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'var(--l05, rgba(255,255,255,0.05))', border: '0.5px solid var(--w10, rgba(255,255,255,0.1))', color: 'rgba(255,255,255,0.55)', fontFamily: "'IBM Plex Sans',sans-serif" }}
        >
          View
        </button>
      ),
    },
  ], []);

  return (
    <ERPShell breadcrumbs={['Home', 'Procurement', 'Purchase Orders']} title="Purchase Orders">
      <style>{`
        .po-page{padding:0 18px 12px;display:flex;flex-direction:column;height:100%;overflow:hidden}
        .po-error{background:rgba(239,68,68,0.08);border:0.5px solid rgba(239,68,68,0.2);border-radius:8px;padding:10px 14px;margin-bottom:10px;font-size:13px;color:var(--danger-subtle, #fca5a5);flex-shrink:0}
      `}</style>

      <div className="po-page">

        {/* Stats cards — clickeable para filtrar */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 10, flexShrink: 0, flexWrap: 'wrap' }}>
          {(Object.entries(STATUS_CFG) as [POStatus, typeof STATUS_CFG[POStatus]][]).map(([status, cfg]) => {
            const count = stats[status] ?? 0;
            if (!count && status !== 'draft') return null;
            const isActive = activeType === status;
            return (
              <div key={status}
                onClick={() => setActiveType(prev => prev === status ? null : status)}
                style={{ background: isActive ? cfg.bg : 'rgba(10,7,18,0.7)', border: `0.5px solid ${isActive ? cfg.color : cfg.border}`, borderRadius: 8, padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 85, cursor: 'pointer', transition: 'all 0.15s', boxShadow: isActive ? `0 0 12px ${cfg.bg}` : 'none' }}
              >
                <span style={{ fontSize: 10, color: cfg.color, textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500 }}>{cfg.label}</span>
                <span style={{ fontSize: 22, fontWeight: 500, color: isActive ? cfg.color : 'var(--text-strong, #f1ede8)', fontFamily: "'IBM Plex Mono',monospace" }}>{count}</span>
              </div>
            );
          })}
          <div
            onClick={() => setActiveType(null)}
            style={{ background: !activeType ? 'rgba(251,146,60,0.08)' : 'rgba(10,7,18,0.7)', border: `0.5px solid ${!activeType ? 'rgba(251,146,60,0.3)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 8, padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 2, minWidth: 70, cursor: 'pointer', transition: 'all 0.15s' }}
          >
            <span style={{ fontSize: 10, color: 'rgba(251,146,60,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 500 }}>Total</span>
            <span style={{ fontSize: 22, fontWeight: 500, color: 'var(--accent-strong, #fb923c)', fontFamily: "'IBM Plex Mono',monospace" }}>{orders.length}</span>
          </div>
        </div>

        {/* Toolbar */}
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 10, flexShrink: 0, flexWrap: 'wrap' }}>
          <div style={{ flex: 1 }}>
            <ERPFilterBar
              filters={filterDefs}
              values={filterVals}
              onChange={setFilterVal}
              onReset={resetFilters}
              activeCount={filterCount}
            />
          </div>
          <button
            onClick={() => setCreateOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'linear-gradient(135deg,var(--accent-pressed, #c2410c),var(--accent, #ea580c),var(--accent-mid, #f97316))', border: 'none', borderRadius: 7, padding: '7px 14px', fontSize: 12, fontWeight: 500, fontFamily: "'IBM Plex Sans',sans-serif", color: 'white', cursor: 'pointer', boxShadow: '0 3px 12px rgba(234,88,12,0.3)', flexShrink: 0, alignSelf: 'flex-end' }}
          >
            + New PO
          </button>
        </div>

        {error && <div className="po-error">{error}</div>}

        {/* Table */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <ERPTable<PO>
            columns={columns}
            data={filtered}
            rowKey={r => r.id}
            loading={loading}
            exportFilename="purchase-orders"
            emptyMessage={filterCount || activeType ? 'No orders match your filters.' : 'No purchase orders yet.'}
            defaultPageSize={25}
            maxHeight="100%"
            onRowClick={po => setDetailPO(po)}
          />
        </div>
      </div>

      <CreatePOModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={fetchAll}
        suppliers={suppliers}
        items={items}
      />

      {detailPO && (
        <PODetailDrawer
          po={detailPO}
          onClose={() => setDetailPO(null)}
          onAction={() => { setDetailPO(null); fetchAll(); }}
        />
      )}
    </ERPShell>
  );
}