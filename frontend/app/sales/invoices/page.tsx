"use client";

import { useEffect, useState, useCallback } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import { arInvoicesApi, ArInvoice, ArKpis, ArAging, CreateArInvoiceDto } from '@/lib/api/ar-invoices';
import { customersApi } from '@/lib/api/customers';
import { itemsApi } from '@/lib/api/items';
import { PrintButton } from '@/components/print/PrintButton';
import { ConfirmModal } from '@/components/ui/modal';
import { Customer, Item } from '@/lib/api/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtAmt(v: string | number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(v));
}
function fmtDate(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function daysUntil(d: string) {
  return Math.floor((new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

type InvoiceStatus = 'draft' | 'sent' | 'partial' | 'paid' | 'overdue' | 'void';

const STATUS_STYLE: Record<InvoiceStatus, { color: string; bg: string; border: string }> = {
  draft:   { color: 'var(--warning)', bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.2)' },
  sent:    { color: 'var(--accent-blue)', bg: 'rgba(96,165,250,0.1)',  border: 'rgba(96,165,250,0.2)' },
  partial: { color: 'var(--accent-strong)', bg: 'rgba(251,146,60,0.1)',  border: 'rgba(251,146,60,0.2)' },
  paid:    { color: 'var(--success)', bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.2)' },
  overdue: { color: 'var(--danger)', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.2)' },
  void:    { color: 'rgba(255,255,255,0.25)', bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.08)' },
};

function StatusBadge({ status }: { status: InvoiceStatus }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.draft;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 500,
      color: s.color, background: s.bg, border: `0.5px solid ${s.border}`,
      whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// ─── KPI Cards ────────────────────────────────────────────────────────────────

function KpiCards({ kpis, aging }: { kpis: ArKpis | null; aging: ArAging | null }) {
  if (!kpis) return null;
  const cards = [
    { label: 'Total Invoiced',    value: fmtAmt(kpis.invoiced),       color: 'var(--text-primary)' },
    { label: 'Collected',         value: fmtAmt(kpis.collected),       color: 'var(--success)' },
    { label: 'Pending',           value: fmtAmt(kpis.pending),         color: 'var(--accent-blue)' },
    { label: 'Overdue',           value: fmtAmt(kpis.overdue),         color: 'var(--danger)' },
    { label: 'Collection Rate',   value: `${kpis.collectionRate.toFixed(1)}%`, color: kpis.collectionRate >= 80 ? 'var(--success)' : 'var(--warning)' },
  ];
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
      {cards.map(c => (
        <div key={c.label} style={{ background: 'rgba(10,7,18,0.7)', border: '0.5px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 3, minWidth: 130 }}>
          <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)' }}>{c.label}</span>
          <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 16, fontWeight: 500, color: c.color }}>{c.value}</span>
        </div>
      ))}
      {/* Aging mini-buckets */}
      {aging && (
        <div style={{ background: 'rgba(10,7,18,0.7)', border: '0.5px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '8px 14px', display: 'flex', gap: 16, alignItems: 'center' }}>
          {[
            { label: 'Current',  val: aging.summary.current.amount,    color: 'var(--success)' },
            { label: '1-30d',    val: aging.summary.days1to30.amount,   color: 'var(--warning)' },
            { label: '31-60d',   val: aging.summary.days31to60.amount,  color: 'var(--accent-strong)' },
            { label: '90d+',     val: aging.summary.days90plus.amount,  color: 'var(--danger)' },
          ].map(b => (
            <div key={b.label} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: b.color, opacity: 0.7 }}>{b.label}</span>
              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 13, color: b.color }}>{fmtAmt(b.val)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Invoice Row ──────────────────────────────────────────────────────────────

function InvoiceRow({ inv, onAction, actionBusy, onPayment }: {
  inv: ArInvoice;
  onAction: (id: string, action: 'send' | 'void') => void;
  actionBusy: string | null;
  onPayment: (inv: ArInvoice) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [detail, setDetail] = useState<ArInvoice | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const busy = actionBusy === inv.id;
  const MONO = { fontFamily: "'IBM Plex Mono',monospace", fontSize: 12 } as React.CSSProperties;

  const outstanding = Number(inv.totalAmount) - Number(inv.paidAmount);
  const days = daysUntil(inv.dueDate);
  const dueSoon = inv.status === 'sent' && days >= 0 && days <= 7;

  const handleExpand = async () => {
    if (!expanded && !detail) {
      setLoadingDetail(true);
      try { setDetail(await arInvoicesApi.getById(inv.id)); }
      finally { setLoadingDetail(false); }
    }
    setExpanded(e => !e);
  };

  const pctPaid = Number(inv.totalAmount) > 0
    ? (Number(inv.paidAmount) / Number(inv.totalAmount)) * 100 : 0;

  return (
    <>
      <tr style={{ cursor: 'pointer' }} onClick={handleExpand}>
        {/* Invoice # */}
        <td>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', transform: expanded ? 'rotate(90deg)' : 'none', display: 'inline-block', transition: 'transform 0.15s' }}>▶</span>
            <span style={{ ...MONO, color: 'var(--accent-blue)', fontWeight: 500 }}>{inv.invoiceNumber}</span>
          </span>
        </td>
        {/* Customer */}
        <td>
          <span style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{inv.customer?.name ?? '—'}</span>
          {inv.salesOrder && <div style={{ fontSize: 11, color: 'rgba(96,165,250,0.5)', marginTop: 1 }}>SO: {inv.salesOrder.soNumber}</div>}
        </td>
        {/* Invoice Date */}
        <td><span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{fmtDate(inv.invoiceDate)}</span></td>
        {/* Due Date */}
        <td>
          <span style={{ fontSize: 12, color: dueSoon ? 'var(--warning)' : inv.status === 'overdue' ? 'var(--danger)' : 'rgba(255,255,255,0.5)' }}>
            {fmtDate(inv.dueDate)}
            {dueSoon && <span style={{ marginLeft: 4, fontSize: 10, color: 'var(--warning)' }}>({days}d)</span>}
          </span>
        </td>
        {/* Total */}
        <td style={{ textAlign: 'right' }}>
          <span style={{ ...MONO, color: 'var(--text-primary)' }}>{fmtAmt(inv.totalAmount)}</span>
        </td>
        {/* Paid progress */}
        <td style={{ textAlign: 'right', minWidth: 110 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
            <div style={{ width: 44, height: 3, borderRadius: 2, background: 'rgba(255,255,255,0.08)', overflow: 'hidden', flexShrink: 0 }}>
              <div style={{ height: '100%', width: `${Math.min(100, pctPaid)}%`, background: pctPaid >= 100 ? 'var(--success)' : 'var(--accent-strong)', borderRadius: 2, transition: 'width 0.3s' }} />
            </div>
            <span style={{ ...MONO, fontSize: 11, color: pctPaid >= 100 ? 'var(--success)' : outstanding > 0 ? 'var(--accent-strong)' : 'rgba(255,255,255,0.3)' }}>
              {fmtAmt(outstanding)}
            </span>
          </div>
        </td>
        {/* Status */}
        <td><StatusBadge status={inv.status} /></td>
        {/* Actions */}
        <td onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', gap: 4 }}>
            {inv.status === 'draft' && (
              <button onClick={() => onAction(inv.id, 'send')} disabled={busy}
                style={{ padding: '3px 9px', borderRadius: 6, fontSize: 11, cursor: 'pointer', color: 'var(--accent-blue)', background: 'rgba(96,165,250,0.1)', border: '0.5px solid rgba(96,165,250,0.2)', fontFamily: "'IBM Plex Sans',sans-serif", opacity: busy ? 0.5 : 1 }}>
                {busy ? '…' : 'Send'}
              </button>
            )}
            {['sent', 'partial'].includes(inv.status) && (
              <button onClick={() => onPayment(inv)} disabled={busy}
                style={{ padding: '3px 9px', borderRadius: 6, fontSize: 11, cursor: 'pointer', color: 'var(--success)', background: 'rgba(74,222,128,0.1)', border: '0.5px solid rgba(74,222,128,0.2)', fontFamily: "'IBM Plex Sans',sans-serif", opacity: busy ? 0.5 : 1 }}>
                + Payment
              </button>
            )}
            {['draft', 'sent', 'partial'].includes(inv.status) && (
              <button onClick={() => onAction(inv.id, 'void')} disabled={busy}
                style={{ padding: '3px 9px', borderRadius: 6, fontSize: 11, cursor: 'pointer', color: 'var(--danger)', background: 'rgba(248,113,113,0.08)', border: '0.5px solid rgba(248,113,113,0.15)', fontFamily: "'IBM Plex Sans',sans-serif", opacity: busy ? 0.5 : 1 }}>
                Void
              </button>
            )}
            <PrintButton doc="ar-invoice" id={inv.id} label="" style={{ padding: '3px 7px' }} />
          </div>
        </td>
      </tr>

      {/* Expanded detail */}
      {expanded && (
        <tr>
          <td colSpan={8} style={{ padding: 0, background: 'rgba(96,165,250,0.01)' }}>
            {loadingDetail ? (
              <div style={{ padding: '16px 40px', fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Loading…</div>
            ) : detail ? (
              <div style={{ padding: '0 0 8px' }}>
                {/* Lines */}
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr>
                      {['#', 'Description', 'Qty', 'UOM', 'Unit Price', 'Disc%', 'Line Total', 'CoGS'].map(h => (
                        <th key={h} style={{ padding: `6px 14px 6px ${h === '#' ? '40px' : '14px'}`, fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: ['Qty', 'Unit Price', 'Disc%', 'Line Total', 'CoGS'].includes(h) ? 'right' : 'left', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {detail.lines?.map(line => (
                      <tr key={line.id}>
                        <td style={{ padding: '7px 14px 7px 40px', fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{line.lineNumber}</td>
                        <td style={{ padding: '7px 14px', fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>{line.description || '—'}</td>
                        <td style={{ padding: '7px 14px', textAlign: 'right', fontFamily: "'IBM Plex Mono',monospace", fontSize: 12 }}>{line.quantity}</td>
                        <td style={{ padding: '7px 14px', fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{line.uom || '—'}</td>
                        <td style={{ padding: '7px 14px', textAlign: 'right', fontFamily: "'IBM Plex Mono',monospace", fontSize: 12 }}>{fmtAmt(line.unitPrice)}</td>
                        <td style={{ padding: '7px 14px', textAlign: 'right', fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{Number(line.discountPercent) > 0 ? `${line.discountPercent}%` : '—'}</td>
                        <td style={{ padding: '7px 14px', textAlign: 'right', fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: 'var(--text-primary)', fontWeight: 500 }}>{fmtAmt(line.lineTotal)}</td>
                        <td style={{ padding: '7px 14px', textAlign: 'right', fontFamily: "'IBM Plex Mono',monospace", fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>{line.cogsAmount ? fmtAmt(line.cogsAmount) : '—'}</td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: '0.5px solid rgba(255,255,255,0.08)', background: 'rgba(255,255,255,0.02)' }}>
                      <td colSpan={6} style={{ padding: '8px 14px', fontSize: 11, color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>TOTAL</td>
                      <td style={{ padding: '8px 14px', textAlign: 'right', fontFamily: "'IBM Plex Mono',monospace", color: 'var(--accent-blue)', fontWeight: 600, fontSize: 13 }}>{fmtAmt(detail.totalAmount)}</td>
                      <td />
                    </tr>
                  </tbody>
                </table>

                {/* Payments */}
                {detail.payments && detail.payments.length > 0 && (
                  <div style={{ padding: '8px 40px 0' }}>
                    <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(74,222,128,0.5)', marginBottom: 6 }}>Payments</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {detail.payments.map(p => (
                        <div key={p.id} style={{ display: 'flex', gap: 16, alignItems: 'center', fontSize: 12 }}>
                          <span style={{ fontFamily: "'IBM Plex Mono',monospace", color: 'var(--success)', fontWeight: 500 }}>{fmtAmt(p.amount)}</span>
                          <span style={{ color: 'rgba(255,255,255,0.4)' }}>{fmtDate(p.paymentDate)}</span>
                          <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>{p.paymentMethod ?? '—'}</span>
                          {p.reference && <span style={{ color: 'rgba(255,255,255,0.25)', fontSize: 11 }}>{p.reference}</span>}
                          <PrintButton doc="ar-receipt" id={detail.id} query={{ paymentId: p.id }} label="Receipt" style={{ padding: '2px 8px', fontSize: 10 }} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Payment Modal ────────────────────────────────────────────────────────────

function PaymentModal({ inv, onClose, onSaved }: {
  inv: ArInvoice | null; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({ paymentDate: new Date().toISOString().split('T')[0], amount: '', paymentMethod: 'transfer', reference: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (inv) {
      const outstanding = Number(inv.totalAmount) - Number(inv.paidAmount);
      setForm(f => ({ ...f, amount: outstanding.toFixed(2) }));
      setError('');
    }
  }, [inv]);

  if (!inv) return null;
  const outstanding = Number(inv.totalAmount) - Number(inv.paidAmount);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.amount || Number(form.amount) <= 0) { setError('Amount must be greater than 0'); return; }
    setSubmitting(true); setError('');
    try {
      await arInvoicesApi.applyPayment(inv.id, {
        paymentDate: form.paymentDate,
        amount: Number(form.amount),
        paymentMethod: form.paymentMethod || undefined,
        reference: form.reference || undefined,
        notes: form.notes || undefined,
      });
      onSaved(); onClose();
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
      setError(msg || 'Payment failed');
    } finally { setSubmitting(false); }
  };

  const inp = { background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '8px 12px', fontSize: 12, fontFamily: "'IBM Plex Sans',sans-serif", color: 'var(--text-strong)', outline: 'none', width: '100%' } as React.CSSProperties;
  const lbl = { fontSize: 10, fontWeight: 500, letterSpacing: '0.08em' as const, textTransform: 'uppercase' as const, color: 'rgba(74,222,128,0.6)', fontFamily: "'IBM Plex Sans',sans-serif" };

  return (
    <>
      <style>{`.pay-overlay { position:fixed; inset:0; z-index:400; background:rgba(0,0,0,0.7); backdrop-filter:blur(4px); display:flex; align-items:center; justify-content:center; }`}</style>
      <div className="pay-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div style={{ background: 'var(--surface)', border: '0.5px solid rgba(74,222,128,0.2)', borderRadius: 14, width: '100%', maxWidth: 420, boxShadow: '0 24px 60px rgba(0,0,0,0.7)', position: 'relative' }}>
          <div style={{ padding: '14px 18px 10px', borderBottom: '0.5px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-strong)' }}>Apply Payment</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>
                {inv.invoiceNumber} · Outstanding: <span style={{ color: 'var(--accent-strong)', fontFamily: "'IBM Plex Mono',monospace" }}>{fmtAmt(outstanding)}</span>
              </div>
            </div>
            <button onClick={onClose} style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.45)', fontSize: 16 }}>×</button>
          </div>
          <form onSubmit={handleSubmit}>
            <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '0.5px solid rgba(239,68,68,0.25)', borderRadius: 7, padding: '7px 12px', fontSize: 12, color: 'var(--danger-subtle)' }}>{error}</div>}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={lbl}>Date *</label>
                  <input type="date" value={form.paymentDate} onChange={e => setForm(f => ({ ...f, paymentDate: e.target.value }))} style={inp} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={lbl}>Amount *</label>
                  <input type="number" min="0.01" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} style={{ ...inp, textAlign: 'right', fontFamily: "'IBM Plex Mono',monospace" }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={lbl}>Method</label>
                  <select value={form.paymentMethod} onChange={e => setForm(f => ({ ...f, paymentMethod: e.target.value }))} style={{ ...inp, cursor: 'pointer' }}>
                    <option value="transfer">Wire Transfer</option>
                    <option value="check">Check</option>
                    <option value="cash">Cash</option>
                    <option value="card">Card</option>
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={lbl}>Reference</label>
                  <input placeholder="WIRE-2026-001" value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} style={inp} />
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={lbl}>Notes</label>
                <input placeholder="Optional notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={inp} />
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '10px 18px 16px', borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
              <button type="button" onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '7px 14px', fontSize: 12, fontFamily: "'IBM Plex Sans',sans-serif", color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>Cancel</button>
              <button type="submit" disabled={submitting} style={{ background: 'linear-gradient(135deg,#14532d,#16a34a,#22c55e)', border: 'none', borderRadius: 7, padding: '7px 18px', fontSize: 12, fontWeight: 500, fontFamily: "'IBM Plex Sans',sans-serif", color: 'white', cursor: 'pointer', opacity: submitting ? 0.5 : 1 }}>
                {submitting ? 'Applying…' : 'Apply Payment'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

// ─── Create Invoice Modal ─────────────────────────────────────────────────────

const EMPTY_LINE = { description: '', quantity: '', uom: '', unitPrice: '', discountPercent: '0', cogsAmount: '' };

function CreateInvoiceModal({ open, onClose, onSaved, customers, items }: {
  open: boolean; onClose: () => void; onSaved: () => void;
  customers: Customer[]; items: Item[];
}) {
  const [header, setHeader] = useState({ customerId: '', invoiceDate: new Date().toISOString().split('T')[0], dueDate: '', currency: 'USD', notes: '' });
  const [lines, setLines] = useState([{ ...EMPTY_LINE }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      const due = new Date(); due.setDate(due.getDate() + 30);
      setHeader({ customerId: '', invoiceDate: new Date().toISOString().split('T')[0], dueDate: due.toISOString().split('T')[0], currency: 'USD', notes: '' });
      setLines([{ ...EMPTY_LINE }]);
      setError('');
    }
  }, [open]);

  const setLine = (idx: number, key: string, value: string) =>
    setLines(ls => ls.map((l, i) => i === idx ? { ...l, [key]: value } : l));

  const calcLineTotal = (line: typeof EMPTY_LINE) => {
    const qty = Number(line.quantity) || 0;
    const price = Number(line.unitPrice) || 0;
    const disc = Number(line.discountPercent) || 0;
    return qty * price * (1 - disc / 100);
  };

  const grandTotal = lines.reduce((s, l) => s + calcLineTotal(l), 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!header.customerId) { setError('Customer is required'); return; }
    if (!header.dueDate) { setError('Due date is required'); return; }
    const validLines = lines.filter(l => l.quantity && l.unitPrice);
    if (validLines.length === 0) { setError('At least one line with quantity and price is required'); return; }
    setSubmitting(true); setError('');
    try {
      await arInvoicesApi.create({
        customerId:  header.customerId,
        invoiceDate: header.invoiceDate,
        dueDate:     header.dueDate,
        currency:    header.currency,
        notes:       header.notes || undefined,
        lines: validLines.map(l => ({
          description:     l.description || undefined,
          quantity:        Number(l.quantity),
          uom:             l.uom || undefined,
          unitPrice:       Number(l.unitPrice),
          discountPercent: Number(l.discountPercent) || undefined,
          cogsAmount:      l.cogsAmount ? Number(l.cogsAmount) : undefined,
        })),
      });
      onSaved(); onClose();
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
      setError(msg || 'Failed to create invoice');
    } finally { setSubmitting(false); }
  };

  if (!open) return null;

  const inp = { background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '8px 12px', fontSize: 12, fontFamily: "'IBM Plex Sans',sans-serif", color: 'var(--text-strong)', outline: 'none', width: '100%' } as React.CSSProperties;
  const lbl = { fontSize: 10, fontWeight: 500, letterSpacing: '0.08em' as const, textTransform: 'uppercase' as const, color: 'rgba(96,165,250,0.6)', fontFamily: "'IBM Plex Sans',sans-serif" };

  return (
    <>
      <style>{`
        .inv-overlay { position:fixed; inset:0; z-index:400; background:rgba(0,0,0,0.7); backdrop-filter:blur(4px); display:flex; align-items:flex-start; justify-content:center; padding:20px; overflow-y:auto; }
        .inv-box { background:var(--surface); border:0.5px solid rgba(96,165,250,0.2); border-radius:14px; width:100%; max-width:820px; margin:auto; box-shadow:0 24px 60px rgba(0,0,0,0.7); }
        .inv-line-input { background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.1); border-radius:5px; padding:5px 7px; font-size:12px; font-family:'IBM Plex Sans',sans-serif; color:var(--text-strong); outline:none; width:100%; }
        .inv-line-select { background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.1); border-radius:5px; padding:5px 7px; font-size:12px; font-family:'IBM Plex Sans',sans-serif; color:var(--text-strong); outline:none; width:100%; cursor:pointer; }
        .inv-line-select option { background:var(--surface); }
        .inv-lines-table { width:100%; border-collapse:collapse; }
        .inv-lines-table th { font-size:10px; color:rgba(96,165,250,0.5); text-transform:uppercase; letter-spacing:0.08em; padding:5px 6px; text-align:left; border-bottom:0.5px solid rgba(255,255,255,0.06); white-space:nowrap; }
        .inv-lines-table td { padding:4px 3px; vertical-align:middle; }
        .inv-btn-rm { width:20px; height:20px; border-radius:4px; background:rgba(239,68,68,0.1); border:0.5px solid rgba(239,68,68,0.2); color:var(--danger); cursor:pointer; font-size:13px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
      `}</style>
      <div className="inv-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="inv-box">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px 10px', borderBottom: '0.5px solid rgba(255,255,255,0.06)', position: 'sticky', top: 0, background: 'var(--surface)', zIndex: 1, borderRadius: '14px 14px 0 0' }}>
            <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-strong)' }}>New Invoice</span>
            <button onClick={onClose} style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.45)', fontSize: 16 }}>×</button>
          </div>
          <form onSubmit={handleSubmit}>
            <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
              {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '0.5px solid rgba(239,68,68,0.25)', borderRadius: 7, padding: '7px 12px', fontSize: 12, color: 'var(--danger-subtle)' }}>{error}</div>}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 10 }}>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={lbl}>Customer *</label>
                  <select value={header.customerId} onChange={e => setHeader(h => ({ ...h, customerId: e.target.value }))} style={{ ...inp, cursor: 'pointer' }}>
                    <option value="">— Select customer —</option>
                    {customers.map(c => <option key={c.id} value={c.id}>{c.code} — {c.name}</option>)}
                  </select>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={lbl}>Invoice Date *</label>
                  <input type="date" value={header.invoiceDate} onChange={e => setHeader(h => ({ ...h, invoiceDate: e.target.value }))} style={inp} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={lbl}>Due Date *</label>
                  <input type="date" value={header.dueDate} onChange={e => setHeader(h => ({ ...h, dueDate: e.target.value }))} style={inp} />
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={lbl}>Currency</label>
                  <select value={header.currency} onChange={e => setHeader(h => ({ ...h, currency: e.target.value }))} style={{ ...inp, cursor: 'pointer' }}>
                    <option value="USD">USD</option>
                    <option value="EUR">EUR</option>
                    <option value="DOP">DOP</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={lbl}>Notes</label>
                <input placeholder="Invoice notes" value={header.notes} onChange={e => setHeader(h => ({ ...h, notes: e.target.value }))} style={inp} />
              </div>

              {/* Lines */}
              <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', padding: '6px 0 4px', borderBottom: '0.5px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span>Invoice Lines</span>
                <button type="button" onClick={() => setLines(ls => [...ls, { ...EMPTY_LINE }])} style={{ background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 5, padding: '4px 10px', fontSize: 11, color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif" }}>+ Add Line</button>
              </div>

              <table className="inv-lines-table">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th style={{ width: 70 }}>Qty *</th>
                    <th style={{ width: 55 }}>UOM</th>
                    <th style={{ width: 90 }}>Price *</th>
                    <th style={{ width: 60 }}>Disc%</th>
                    <th style={{ width: 90 }}>CoGS</th>
                    <th style={{ width: 90 }}>Total</th>
                    <th style={{ width: 24 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((line, idx) => (
                    <tr key={idx}>
                      <td><input className="inv-line-input" placeholder="Description" value={line.description} onChange={e => setLine(idx, 'description', e.target.value)} /></td>
                      <td><input className="inv-line-input" type="number" min="0" step="0.001" placeholder="0" value={line.quantity} onChange={e => setLine(idx, 'quantity', e.target.value)} style={{ textAlign: 'right' }} /></td>
                      <td><input className="inv-line-input" placeholder="hrs" value={line.uom} onChange={e => setLine(idx, 'uom', e.target.value)} /></td>
                      <td><input className="inv-line-input" type="number" min="0" step="0.01" placeholder="0.00" value={line.unitPrice} onChange={e => setLine(idx, 'unitPrice', e.target.value)} style={{ textAlign: 'right' }} /></td>
                      <td><input className="inv-line-input" type="number" min="0" max="100" step="0.1" placeholder="0" value={line.discountPercent} onChange={e => setLine(idx, 'discountPercent', e.target.value)} style={{ textAlign: 'right' }} /></td>
                      <td><input className="inv-line-input" type="number" min="0" step="0.01" placeholder="0.00" value={line.cogsAmount} onChange={e => setLine(idx, 'cogsAmount', e.target.value)} style={{ textAlign: 'right', color: 'rgba(255,255,255,0.45)' }} /></td>
                      <td style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: 'var(--text-primary)', textAlign: 'right', padding: '4px 6px' }}>
                        {calcLineTotal(line) > 0 ? fmtAmt(calcLineTotal(line)) : '—'}
                      </td>
                      <td>{lines.length > 1 && <button type="button" className="inv-btn-rm" onClick={() => setLines(ls => ls.filter((_, i) => i !== idx))}>×</button>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, padding: '6px 0', borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Grand Total</span>
                <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 14, fontWeight: 500, color: 'var(--accent-blue)' }}>{fmtAmt(grandTotal)}</span>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '10px 18px 16px', borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
              <button type="button" onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '7px 14px', fontSize: 12, fontFamily: "'IBM Plex Sans',sans-serif", color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>Cancel</button>
              <button type="submit" disabled={submitting} style={{ background: 'linear-gradient(135deg,#1e3a8a,#1d4ed8,#3b82f6)', border: 'none', borderRadius: 7, padding: '7px 18px', fontSize: 12, fontWeight: 500, fontFamily: "'IBM Plex Sans',sans-serif", color: 'white', cursor: 'pointer', opacity: submitting ? 0.5 : 1 }}>
                {submitting ? 'Creating…' : 'Create Invoice'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ArInvoicesPage() {
  const [invoices,     setInvoices]     = useState<ArInvoice[]>([]);
  const [customers,    setCustomers]    = useState<Customer[]>([]);
  const [items,        setItems]        = useState<Item[]>([]);
  const [kpis,         setKpis]         = useState<ArKpis | null>(null);
  const [aging,        setAging]        = useState<ArAging | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | ''>('');
  const [createOpen,   setCreateOpen]   = useState(false);
  const [paymentInv,   setPaymentInv]   = useState<ArInvoice | null>(null);
  const [actionBusy,   setActionBusy]   = useState<string | null>(null);
  // spec-frontend-002/003 — send (issues the invoice) and void (irreversible)
  // were unguarded; route both through the shared ConfirmModal.
  const [confirmAction, setConfirmAction] = useState<
    { id: string; action: 'send' | 'void'; invoiceNumber: string } | null
  >(null);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [invs, custs, its, k, a] = await Promise.all([
        arInvoicesApi.getAll(),
        customersApi.getAll(),
        itemsApi.getAll(),
        arInvoicesApi.getKpis(),
        arInvoicesApi.getAging(),
      ]);
      setInvoices(invs);
      setCustomers(custs);
      setItems(its);
      setKpis(k);
      setAging(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const runAction = async (id: string, action: 'send' | 'void') => {
    setActionBusy(id);
    try {
      if (action === 'send') await arInvoicesApi.send(id);
      else await arInvoicesApi.void(id);
      fetchAll();
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
      setError(msg || `${action} failed`);
      throw err; // surface inline in ConfirmModal, keep it open
    } finally { setActionBusy(null); }
  };

  const handleAction = (id: string, action: 'send' | 'void') => {
    const inv = invoices.find(i => i.id === id);
    setConfirmAction({ id, action, invoiceNumber: inv?.invoiceNumber ?? '' });
  };

  const filtered = invoices.filter(inv => {
    const q = search.toLowerCase();
    const matchSearch = !q ||
      inv.invoiceNumber.toLowerCase().includes(q) ||
      (inv.customer?.name ?? '').toLowerCase().includes(q);
    const matchStatus = !statusFilter || inv.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const allStatuses: InvoiceStatus[] = ['draft', 'sent', 'partial', 'paid', 'overdue', 'void'];
  const counts = Object.fromEntries(allStatuses.map(s => [s, invoices.filter(i => i.status === s).length])) as Record<InvoiceStatus, number>;

  return (
    <ERPShell breadcrumbs={['Home', 'Sales', 'AR Invoices']} title="Accounts Receivable">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap');
        .ar-page { padding: 0 18px 24px; }
        .ar-stats { display:flex; gap:8px; margin-bottom:10px; flex-wrap:wrap; }
        .ar-stat { background:rgba(10,7,18,0.7); border-radius:8px; padding:6px 10px; display:flex; flex-direction:column; gap:2px; min-width:70px; cursor:pointer; transition:opacity 0.15s; }
        .ar-stat:hover { opacity:0.8; }
        .ar-stat-label { font-size:10px; font-weight:500; letter-spacing:0.08em; text-transform:uppercase; }
        .ar-stat-value { font-size:18px; font-weight:500; font-family:'IBM Plex Mono',monospace; color:var(--text-strong); }
        .ar-toolbar { display:flex; align-items:center; gap:10px; margin-bottom:14px; flex-wrap:wrap; }
        .ar-search { background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.09); border-radius:7px; padding:7px 12px; font-size:12px; font-family:'IBM Plex Sans',sans-serif; color:var(--text-primary); outline:none; width:240px; }
        .ar-search::placeholder { color:rgba(255,255,255,0.2); }
        .ar-search:focus { border-color:rgba(96,165,250,0.4); box-shadow:0 0 0 2px rgba(96,165,250,0.08); }
        .ar-filter { background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.09); border-radius:7px; padding:7px 12px; font-size:12px; font-family:'IBM Plex Sans',sans-serif; color:var(--text-primary); outline:none; cursor:pointer; }
        .ar-filter option { background:var(--surface); }
        .ar-btn-new { display:flex; align-items:center; gap:6px; margin-left:auto; background:linear-gradient(135deg,#1e3a8a,#1d4ed8,#3b82f6); border:none; border-radius:7px; padding:7px 14px; font-size:12px; font-weight:500; font-family:'IBM Plex Sans',sans-serif; color:white; cursor:pointer; box-shadow:0 3px 12px rgba(59,130,246,0.3); transition:opacity 0.15s, transform 0.15s; flex-shrink:0; }
        .ar-btn-new:hover { opacity:0.88; transform:translateY(-1px); }
        .ar-wrap { background:rgba(10,7,18,0.7); border:0.5px solid rgba(96,165,250,0.12); border-radius:10px; overflow:hidden; }
        .ar-table { width:100%; border-collapse:collapse; }
        .ar-table thead th { padding:9px 14px; font-size:10px; font-weight:500; letter-spacing:0.1em; text-transform:uppercase; color:rgba(96,165,250,0.55); background:rgba(96,165,250,0.05); border-bottom:0.5px solid rgba(255,255,255,0.06); text-align:left; white-space:nowrap; }
        .ar-table tbody td { padding:10px 14px; border-bottom:0.5px solid rgba(255,255,255,0.04); vertical-align:middle; font-size:13px; }
        .ar-table tbody tr:last-child td { border-bottom:none; }
        .ar-table tbody tr:hover td { background:rgba(96,165,250,0.02); }
        .ar-empty, .ar-loading { text-align:center; padding:52px 24px; color:rgba(255,255,255,0.25); font-size:13px; display:flex; flex-direction:column; align-items:center; gap:10px; }
        .ar-spinner { width:18px; height:18px; border-radius:50%; border:2px solid rgba(96,165,250,0.2); border-top-color:var(--accent-blue); animation:ar-spin 0.7s linear infinite; }
        @keyframes ar-spin { to { transform:rotate(360deg); } }
        .ar-footer { font-size:11px; color:rgba(255,255,255,0.22); padding:8px 14px; border-top:0.5px solid rgba(255,255,255,0.04); }
        .ar-error { background:rgba(239,68,68,0.08); border:0.5px solid rgba(239,68,68,0.2); border-radius:8px; padding:10px 14px; margin-bottom:14px; font-size:13px; color:var(--danger-subtle); }
      `}</style>

      <div className="ar-page">
        {/* KPI Cards */}
        <KpiCards kpis={kpis} aging={aging} />

        {/* Status filter chips */}
        <div className="ar-stats">
          {allStatuses.map(s => {
            const style = STATUS_STYLE[s];
            return (
              <div key={s} className="ar-stat"
                style={{ border: `0.5px solid ${statusFilter === s ? style.border : 'rgba(255,255,255,0.07)'}` }}
                onClick={() => setStatusFilter(prev => prev === s ? '' : s)}>
                <span className="ar-stat-label" style={{ color: style.color }}>{s.charAt(0).toUpperCase() + s.slice(1)}</span>
                <span className="ar-stat-value">{counts[s]}</span>
              </div>
            );
          })}
          <div className="ar-stat"
            style={{ border: `0.5px solid ${!statusFilter ? 'rgba(96,165,250,0.3)' : 'rgba(255,255,255,0.07)'}` }}
            onClick={() => setStatusFilter('')}>
            <span className="ar-stat-label" style={{ color: 'rgba(96,165,250,0.6)' }}>Total</span>
            <span className="ar-stat-value" style={{ color: 'var(--accent-blue)' }}>{invoices.length}</span>
          </div>
        </div>

        {/* Toolbar */}
        <div className="ar-toolbar">
          <input className="ar-search" placeholder="Search by invoice#, customer…" value={search} onChange={e => setSearch(e.target.value)} />
          <select className="ar-filter" value={statusFilter} onChange={e => setStatusFilter(e.target.value as InvoiceStatus | '')}>
            <option value="">All Status</option>
            {allStatuses.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
          </select>
          <button className="ar-btn-new" onClick={() => setCreateOpen(true)}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><line x1="6.5" y1="1" x2="6.5" y2="12"/><line x1="1" y1="6.5" x2="12" y2="6.5"/></svg>
            New Invoice
          </button>
        </div>

        {error && <div className="ar-error">{error}</div>}

        {/* Table */}
        <div className="ar-wrap">
          {loading ? (
            <div className="ar-loading"><div className="ar-spinner" />Loading invoices…</div>
          ) : filtered.length === 0 ? (
            <div className="ar-empty">{search || statusFilter ? 'No invoices match your filters.' : 'No invoices yet.'}</div>
          ) : (
            <>
              <table className="ar-table">
                <thead>
                  <tr>
                    <th>Invoice #</th>
                    <th>Customer / SO</th>
                    <th>Invoice Date</th>
                    <th>Due Date</th>
                    <th style={{ textAlign: 'right' }}>Total</th>
                    <th style={{ textAlign: 'right' }}>Outstanding</th>
                    <th>Status</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(inv => (
                    <InvoiceRow
                      key={inv.id}
                      inv={inv}
                      onAction={handleAction}
                      actionBusy={actionBusy}
                      onPayment={setPaymentInv}
                    />
                  ))}
                </tbody>
              </table>
              <div className="ar-footer">
                {filtered.length} of {invoices.length} invoice{invoices.length !== 1 ? 's' : ''}
              </div>
            </>
          )}
        </div>
      </div>

      <CreateInvoiceModal open={createOpen} onClose={() => setCreateOpen(false)} onSaved={fetchAll} customers={customers} items={items} />
      <PaymentModal inv={paymentInv} onClose={() => setPaymentInv(null)} onSaved={fetchAll} />

      <ConfirmModal
        open={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        title={confirmAction
          ? (confirmAction.action === 'send'
              ? `Send invoice ${confirmAction.invoiceNumber}?`
              : `Void invoice ${confirmAction.invoiceNumber}?`)
          : ''}
        description={confirmAction?.action === 'send'
          ? 'This issues the invoice to the customer and posts it to accounts receivable.'
          : 'Voiding cancels this invoice and reverses its receivable. It cannot be undone.'}
        variant={confirmAction?.action === 'void' ? 'destructive' : 'default'}
        confirmLabel={confirmAction?.action === 'send' ? 'Send Invoice' : 'Void Invoice'}
        onConfirm={async () => { if (confirmAction) await runAction(confirmAction.id, confirmAction.action); }}
      />
    </ERPShell>
  );
}