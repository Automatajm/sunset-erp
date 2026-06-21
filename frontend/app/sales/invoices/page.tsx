"use client";
// ============================================================================
// frontend/app/sales/invoices/page.tsx
// spec-ux-t5-sales T5.3 — ERPTable + ERPFilterBar + FormModal + SearchSelect + ConfirmModal.
// Expandable-row detail (lines + payments) → row-click ModalShell.
// ============================================================================
import { useEffect, useState, useCallback, useMemo } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import SearchSelect from '@/components/ui/SearchSelect';
import { ERPTable, ERPColumn } from '@/components/ui/ERPTable';
import { FormModal } from '@/components/ui/modal/FormModal';
import { ModalShell } from '@/components/ui/modal/ModalShell';
import { arInvoicesApi, ArInvoice, ArKpis, ArAging } from '@/lib/api/ar-invoices';
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
const MONO = { fontFamily: "'IBM Plex Mono',monospace", fontSize: 12 } as React.CSSProperties;

type InvoiceStatus = 'draft' | 'sent' | 'partial' | 'paid' | 'overdue' | 'void';
const ALL_STATUSES: InvoiceStatus[] = ['draft', 'sent', 'partial', 'paid', 'overdue', 'void'];

const INP: React.CSSProperties = { background: 'var(--l04, rgba(255,255,255,0.04))', border: '0.5px solid var(--w10, rgba(255,255,255,0.1))', borderRadius: 7, padding: '8px 12px', fontSize: 12, fontFamily: "'IBM Plex Sans',sans-serif", color: 'var(--text-strong, #f1ede8)', outline: 'none', width: '100%' };
const LBL: React.CSSProperties = { fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(96,165,250,0.6)', fontFamily: "'IBM Plex Sans',sans-serif" };

const STATUS_STYLE: Record<InvoiceStatus, { color: string; bg: string; border: string }> = {
  draft:   { color: 'var(--warning, #fbbf24)', bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.2)' },
  sent:    { color: 'var(--accent-blue, #60a5fa)', bg: 'rgba(96,165,250,0.1)',  border: 'rgba(96,165,250,0.2)' },
  partial: { color: 'var(--accent-strong, #fb923c)', bg: 'rgba(251,146,60,0.1)',  border: 'rgba(251,146,60,0.2)' },
  paid:    { color: 'var(--success, #4ade80)', bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.2)' },
  overdue: { color: 'var(--danger, #f87171)', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.2)' },
  void:    { color: 'var(--w25, rgba(255,255,255,0.25))', bg: 'var(--l04, rgba(255,255,255,0.04))', border: 'var(--l08, rgba(255,255,255,0.08))' },
};

function StatusBadge({ status }: { status: InvoiceStatus }) {
  const s = STATUS_STYLE[status] ?? STATUS_STYLE.draft;
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 500, color: s.color, background: s.bg, border: `0.5px solid ${s.border}`, whiteSpace: 'nowrap' }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
      {status.charAt(0).toUpperCase() + status.slice(1)}
    </span>
  );
}

// ─── KPI Cards ────────────────────────────────────────────────────────────────
function KpiCards({ kpis, aging }: { kpis: ArKpis | null; aging: ArAging | null }) {
  if (!kpis) return null;
  const cards = [
    { label: 'Total Invoiced',  value: fmtAmt(kpis.invoiced),  color: 'var(--text-primary, #e2dfd8)' },
    { label: 'Collected',       value: fmtAmt(kpis.collected),  color: 'var(--success, #4ade80)' },
    { label: 'Pending',         value: fmtAmt(kpis.pending),    color: 'var(--accent-blue, #60a5fa)' },
    { label: 'Overdue',         value: fmtAmt(kpis.overdue),    color: 'var(--danger, #f87171)' },
    { label: 'Collection Rate', value: `${kpis.collectionRate.toFixed(1)}%`, color: kpis.collectionRate >= 80 ? 'var(--success, #4ade80)' : 'var(--warning, #fbbf24)' },
  ];
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap', flexShrink: 0 }}>
      {cards.map(c => (
        <div key={c.label} style={{ background: 'rgba(10,7,18,0.7)', border: '0.5px solid var(--l07, rgba(255,255,255,0.07))', borderRadius: 8, padding: '8px 14px', display: 'flex', flexDirection: 'column', gap: 3, minWidth: 130 }}>
          <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--w30, rgba(255,255,255,0.3))' }}>{c.label}</span>
          <span style={{ ...MONO, fontSize: 16, fontWeight: 500, color: c.color }}>{c.value}</span>
        </div>
      ))}
      {aging && (
        <div style={{ background: 'rgba(10,7,18,0.7)', border: '0.5px solid var(--l07, rgba(255,255,255,0.07))', borderRadius: 8, padding: '8px 14px', display: 'flex', gap: 16, alignItems: 'center' }}>
          {[
            { label: 'Current', val: aging.summary.current.amount,   color: 'var(--success, #4ade80)' },
            { label: '1-30d',   val: aging.summary.days1to30.amount,  color: 'var(--warning, #fbbf24)' },
            { label: '31-60d',  val: aging.summary.days31to60.amount, color: 'var(--accent-strong, #fb923c)' },
            { label: '90d+',    val: aging.summary.days90plus.amount, color: 'var(--danger, #f87171)' },
          ].map(b => (
            <div key={b.label} style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              <span style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: b.color, opacity: 0.7 }}>{b.label}</span>
              <span style={{ ...MONO, fontSize: 13, color: b.color }}>{fmtAmt(b.val)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Detail modal (lines + payments) ──────────────────────────────────────────
function InvoiceDetailModal({ inv, onClose }: { inv: ArInvoice | null; onClose: () => void }) {
  const [detail, setDetail] = useState<ArInvoice | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!inv) { setDetail(null); return; }
    setLoading(true);
    arInvoicesApi.getById(inv.id).then(setDetail).finally(() => setLoading(false));
  }, [inv]);

  const TH = (h: string, right = false) =>
    <th key={h} style={{ padding: '6px 10px', fontSize: 10, color: 'var(--w30, rgba(255,255,255,0.3))', fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', textAlign: right ? 'right' : 'left', borderBottom: '0.5px solid var(--l04, rgba(255,255,255,0.04))' }}>{h}</th>;

  return (
    <ModalShell open={!!inv} onClose={onClose} title={inv ? `${inv.invoiceNumber} — Detail` : ''} width={840}>
      {loading ? (
        <div style={{ padding: '16px', fontSize: 12, color: 'var(--w30, rgba(255,255,255,0.3))' }}>Loading…</div>
      ) : detail ? (
        <div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>{TH('#')}{TH('Description')}{TH('Qty', true)}{TH('UOM')}{TH('Unit Price', true)}{TH('Disc%', true)}{TH('Line Total', true)}{TH('CoGS', true)}</tr>
            </thead>
            <tbody>
              {detail.lines?.map(line => (
                <tr key={line.id}>
                  <td style={{ padding: '7px 10px', fontSize: 11, color: 'var(--w30, rgba(255,255,255,0.3))' }}>{line.lineNumber}</td>
                  <td style={{ padding: '7px 10px', fontSize: 12, color: 'var(--w70, rgba(255,255,255,0.7))' }}>{line.description || '—'}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', ...MONO }}>{line.quantity}</td>
                  <td style={{ padding: '7px 10px', fontSize: 12, color: 'var(--w45, rgba(255,255,255,0.45))' }}>{line.uom || '—'}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', ...MONO }}>{fmtAmt(line.unitPrice)}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', fontSize: 12, color: 'var(--w45, rgba(255,255,255,0.45))' }}>{Number(line.discountPercent) > 0 ? `${line.discountPercent}%` : '—'}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', ...MONO, color: 'var(--text-primary, #e2dfd8)', fontWeight: 500 }}>{fmtAmt(line.lineTotal)}</td>
                  <td style={{ padding: '7px 10px', textAlign: 'right', ...MONO, color: 'var(--w35, rgba(255,255,255,0.35))' }}>{line.cogsAmount ? fmtAmt(line.cogsAmount) : '—'}</td>
                </tr>
              ))}
              <tr style={{ borderTop: '0.5px solid var(--l08, rgba(255,255,255,0.08))', background: 'var(--l02, rgba(255,255,255,0.02))' }}>
                <td colSpan={6} style={{ padding: '8px 10px', fontSize: 11, color: 'var(--w30, rgba(255,255,255,0.3))', fontWeight: 500 }}>TOTAL</td>
                <td style={{ padding: '8px 10px', textAlign: 'right', ...MONO, color: 'var(--accent-blue, #60a5fa)', fontWeight: 600, fontSize: 13 }}>{fmtAmt(detail.totalAmount)}</td>
                <td />
              </tr>
            </tbody>
          </table>

          {detail.payments && detail.payments.length > 0 && (
            <div style={{ paddingTop: 12 }}>
              <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(74,222,128,0.5)', marginBottom: 6 }}>Payments</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {detail.payments.map(p => (
                  <div key={p.id} style={{ display: 'flex', gap: 16, alignItems: 'center', fontSize: 12 }}>
                    <span style={{ ...MONO, color: 'var(--success, #4ade80)', fontWeight: 500 }}>{fmtAmt(p.amount)}</span>
                    <span style={{ color: 'var(--w40, rgba(255,255,255,0.4))' }}>{fmtDate(p.paymentDate)}</span>
                    <span style={{ color: 'var(--w30, rgba(255,255,255,0.3))', fontSize: 11 }}>{p.paymentMethod ?? '—'}</span>
                    {p.reference && <span style={{ color: 'var(--w25, rgba(255,255,255,0.25))', fontSize: 11 }}>{p.reference}</span>}
                    <PrintButton doc="ar-receipt" id={detail.id} query={{ paymentId: p.id }} label="Receipt" style={{ padding: '2px 8px', fontSize: 10 }} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : <div style={{ padding: '16px', fontSize: 12, color: 'var(--w30, rgba(255,255,255,0.3))' }}>No detail.</div>}
    </ModalShell>
  );
}

// ─── Payment modal (shared FormModal) ─────────────────────────────────────────
function PaymentModal({ inv, onClose, onSaved }: { inv: ArInvoice | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ paymentDate: new Date().toISOString().split('T')[0], amount: '', paymentMethod: 'transfer', reference: '', notes: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (inv) {
      const outstanding = Number(inv.totalAmount) - Number(inv.paidAmount);
      setForm(f => ({ ...f, amount: outstanding.toFixed(2) }));
      setError(null);
    }
  }, [inv]);

  const outstanding = inv ? Number(inv.totalAmount) - Number(inv.paidAmount) : 0;
  const isValid = !!form.amount && Number(form.amount) > 0;

  const submit = async () => {
    if (!inv) return;
    if (!isValid) { setError('Amount must be greater than 0'); return; }
    setSubmitting(true); setError(null);
    try {
      await arInvoicesApi.applyPayment(inv.id, {
        paymentDate: form.paymentDate, amount: Number(form.amount),
        paymentMethod: form.paymentMethod || undefined, reference: form.reference || undefined, notes: form.notes || undefined,
      });
      onSaved(); onClose();
    } catch (err) {
      setError((err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Payment failed');
    } finally { setSubmitting(false); }
  };

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) =>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}><label style={{ ...LBL, color: 'rgba(74,222,128,0.6)' }}>{label}</label>{children}</div>;

  return (
    <FormModal
      open={!!inv}
      onClose={onClose}
      title={inv ? `Apply Payment — ${inv.invoiceNumber}` : ''}
      description={inv ? `Outstanding: ${fmtAmt(outstanding)}` : undefined}
      submitLabel="Apply Payment"
      submitting={submitting}
      isValid={isValid}
      error={error}
      onSubmit={submit}
      width={440}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Date *"><input type="date" value={form.paymentDate} onChange={e => setForm(f => ({ ...f, paymentDate: e.target.value }))} style={INP} /></Field>
          <Field label="Amount *"><input type="number" min="0.01" step="0.01" value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} style={{ ...INP, textAlign: 'right', ...MONO }} /></Field>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <Field label="Method">
            <SearchSelect
              options={[{ value: 'transfer', label: 'Wire Transfer' }, { value: 'check', label: 'Check' }, { value: 'cash', label: 'Cash' }, { value: 'card', label: 'Card' }]}
              value={form.paymentMethod} onChange={v => setForm(f => ({ ...f, paymentMethod: v }))} placeholder="Method…" minWidth={200}
            />
          </Field>
          <Field label="Reference"><input placeholder="WIRE-2026-001" value={form.reference} onChange={e => setForm(f => ({ ...f, reference: e.target.value }))} style={INP} /></Field>
        </div>
        <Field label="Notes"><input placeholder="Optional notes" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} style={INP} /></Field>
      </div>
    </FormModal>
  );
}

// ─── Create invoice modal (shared FormModal) ──────────────────────────────────
const EMPTY_LINE = { description: '', quantity: '', uom: '', unitPrice: '', discountPercent: '0', cogsAmount: '' };

function CreateInvoiceModal({ open, onClose, onSaved, customers }: {
  open: boolean; onClose: () => void; onSaved: () => void; customers: Customer[];
}) {
  const [header, setHeader] = useState({ customerId: '', invoiceDate: new Date().toISOString().split('T')[0], dueDate: '', currency: 'USD', notes: '' });
  const [lines, setLines] = useState([{ ...EMPTY_LINE }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      const due = new Date(); due.setDate(due.getDate() + 30);
      setHeader({ customerId: '', invoiceDate: new Date().toISOString().split('T')[0], dueDate: due.toISOString().split('T')[0], currency: 'USD', notes: '' });
      setLines([{ ...EMPTY_LINE }]);
      setError(null);
    }
  }, [open]);

  const setLine = (idx: number, key: string, value: string) =>
    setLines(ls => ls.map((l, i) => i === idx ? { ...l, [key]: value } : l));
  const calcLineTotal = (line: typeof EMPTY_LINE) => (Number(line.quantity) || 0) * (Number(line.unitPrice) || 0) * (1 - (Number(line.discountPercent) || 0) / 100);
  const grandTotal = lines.reduce((s, l) => s + calcLineTotal(l), 0);
  const validLines = lines.filter(l => l.quantity && l.unitPrice);
  const isValid = !!header.customerId && !!header.dueDate && validLines.length > 0;

  const submit = async () => {
    if (!header.customerId) { setError('Customer is required'); return; }
    if (!header.dueDate) { setError('Due date is required'); return; }
    if (validLines.length === 0) { setError('At least one line with quantity and price is required'); return; }
    setSubmitting(true); setError(null);
    try {
      await arInvoicesApi.create({
        customerId: header.customerId, invoiceDate: header.invoiceDate, dueDate: header.dueDate,
        currency: header.currency, notes: header.notes || undefined,
        lines: validLines.map(l => ({
          description: l.description || undefined, quantity: Number(l.quantity), uom: l.uom || undefined,
          unitPrice: Number(l.unitPrice), discountPercent: Number(l.discountPercent) || undefined,
          cogsAmount: l.cogsAmount ? Number(l.cogsAmount) : undefined,
        })),
      });
      onSaved(); onClose();
    } catch (err) {
      setError((err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Failed to create invoice');
    } finally { setSubmitting(false); }
  };

  const Field = ({ label, children }: { label: string; children: React.ReactNode }) =>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}><label style={LBL}>{label}</label>{children}</div>;

  return (
    <FormModal open={open} onClose={onClose} title="New Invoice" submitLabel="Create Invoice" submitting={submitting} isValid={isValid} error={error} onSubmit={submit} width={820}>
      <style>{`
        .invl-table{width:100%;border-collapse:collapse}
        .invl-table th{font-size:10px;color:rgba(96,165,250,0.5);text-transform:uppercase;letter-spacing:0.08em;padding:5px 6px;text-align:left;border-bottom:0.5px solid var(--l06, rgba(255,255,255,0.06));white-space:nowrap}
        .invl-table td{padding:4px 3px;vertical-align:middle}
        .invl-inp{background:var(--l04, rgba(255,255,255,0.04));border:0.5px solid var(--w10, rgba(255,255,255,0.1));border-radius:5px;padding:5px 7px;font-size:12px;font-family:'IBM Plex Sans',sans-serif;color:var(--text-strong, #f1ede8);outline:none;width:100%}
        .invl-btn-rm{width:20px;height:20px;border-radius:4px;background:rgba(239,68,68,0.1);border:0.5px solid rgba(239,68,68,0.2);color:var(--danger, #f87171);cursor:pointer;font-size:13px;display:flex;align-items:center;justify-content:center;flex-shrink:0}
      `}</style>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 10 }}>
          <Field label="Customer *">
            <SearchSelect options={customers.map(c => ({ value: c.id, label: `${c.code} — ${c.name}` }))} value={header.customerId} onChange={v => setHeader(h => ({ ...h, customerId: v }))} placeholder="Search customer…" clearLabel="— Select customer —" minWidth={300} />
          </Field>
          <Field label="Invoice Date *"><input type="date" value={header.invoiceDate} onChange={e => setHeader(h => ({ ...h, invoiceDate: e.target.value }))} style={INP} /></Field>
          <Field label="Due Date *"><input type="date" value={header.dueDate} onChange={e => setHeader(h => ({ ...h, dueDate: e.target.value }))} style={INP} /></Field>
          <Field label="Currency">
            <SearchSelect options={['USD', 'EUR', 'DOP'].map(c => ({ value: c, label: c }))} value={header.currency} onChange={v => setHeader(h => ({ ...h, currency: v }))} placeholder="Currency…" minWidth={160} />
          </Field>
        </div>
        <Field label="Notes"><input placeholder="Invoice notes" value={header.notes} onChange={e => setHeader(h => ({ ...h, notes: e.target.value }))} style={INP} /></Field>

        <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--w25, rgba(255,255,255,0.25))', padding: '6px 0 4px', borderBottom: '0.5px solid var(--l06, rgba(255,255,255,0.06))', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span>Invoice Lines</span>
          <button type="button" onClick={() => setLines(ls => [...ls, { ...EMPTY_LINE }])} style={{ background: 'var(--l04, rgba(255,255,255,0.04))', border: '0.5px solid var(--w10, rgba(255,255,255,0.1))', borderRadius: 5, padding: '4px 10px', fontSize: 11, color: 'var(--w50, rgba(255,255,255,0.5))', cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif" }}>+ Add Line</button>
        </div>
        <table className="invl-table">
          <thead>
            <tr>
              <th>Description</th><th style={{ width: 70 }}>Qty *</th><th style={{ width: 55 }}>UOM</th>
              <th style={{ width: 90 }}>Price *</th><th style={{ width: 60 }}>Disc%</th><th style={{ width: 90 }}>CoGS</th>
              <th style={{ width: 90 }}>Total</th><th style={{ width: 24 }}></th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, idx) => (
              <tr key={idx}>
                <td><input className="invl-inp" placeholder="Description" value={line.description} onChange={e => setLine(idx, 'description', e.target.value)} /></td>
                <td><input className="invl-inp" type="number" min="0" step="0.001" placeholder="0" value={line.quantity} onChange={e => setLine(idx, 'quantity', e.target.value)} style={{ textAlign: 'right' }} /></td>
                <td><input className="invl-inp" placeholder="hrs" value={line.uom} onChange={e => setLine(idx, 'uom', e.target.value)} /></td>
                <td><input className="invl-inp" type="number" min="0" step="0.01" placeholder="0.00" value={line.unitPrice} onChange={e => setLine(idx, 'unitPrice', e.target.value)} style={{ textAlign: 'right' }} /></td>
                <td><input className="invl-inp" type="number" min="0" max="100" step="0.1" placeholder="0" value={line.discountPercent} onChange={e => setLine(idx, 'discountPercent', e.target.value)} style={{ textAlign: 'right' }} /></td>
                <td><input className="invl-inp" type="number" min="0" step="0.01" placeholder="0.00" value={line.cogsAmount} onChange={e => setLine(idx, 'cogsAmount', e.target.value)} style={{ textAlign: 'right', color: 'var(--w45, rgba(255,255,255,0.45))' }} /></td>
                <td style={{ ...MONO, fontSize: 11, color: 'var(--text-primary, #e2dfd8)', textAlign: 'right', padding: '4px 6px' }}>{calcLineTotal(line) > 0 ? fmtAmt(calcLineTotal(line)) : '—'}</td>
                <td>{lines.length > 1 && <button type="button" className="invl-btn-rm" onClick={() => setLines(ls => ls.filter((_, i) => i !== idx))}>×</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 16, padding: '6px 0', borderTop: '0.5px solid var(--l06, rgba(255,255,255,0.06))' }}>
          <span style={{ fontSize: 12, color: 'var(--w40, rgba(255,255,255,0.4))' }}>Grand Total</span>
          <span style={{ ...MONO, fontSize: 14, fontWeight: 500, color: 'var(--accent-blue, #60a5fa)' }}>{fmtAmt(grandTotal)}</span>
        </div>
      </div>
    </FormModal>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function ArInvoicesPage() {
  const [invoices,     setInvoices]     = useState<ArInvoice[]>([]);
  const [customers,    setCustomers]    = useState<Customer[]>([]);
  const [, setItems]   = useState<Item[]>([]);
  const [kpis,         setKpis]         = useState<ArKpis | null>(null);
  const [aging,        setAging]        = useState<ArAging | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [statusFilter, setStatusFilter] = useState<InvoiceStatus | ''>('');
  const [createOpen,   setCreateOpen]   = useState(false);
  const [paymentInv,   setPaymentInv]   = useState<ArInvoice | null>(null);
  const [detailInv,    setDetailInv]    = useState<ArInvoice | null>(null);
  const [actionBusy,   setActionBusy]   = useState<string | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ id: string; action: 'send' | 'void'; invoiceNumber: string } | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [invs, custs, its, k, a] = await Promise.all([
        arInvoicesApi.getAll(), customersApi.getAll(), itemsApi.getAll(), arInvoicesApi.getKpis(), arInvoicesApi.getAging(),
      ]);
      setInvoices(invs); setCustomers(custs); setItems(its); setKpis(k); setAging(a);
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
      setError((err as { response?: { data?: { message?: string } } }).response?.data?.message || `${action} failed`);
      throw err; // surface inline in ConfirmModal
    } finally { setActionBusy(null); }
  };

  const handleAction = (id: string, action: 'send' | 'void') => {
    const inv = invoices.find(i => i.id === id);
    setConfirmAction({ id, action, invoiceNumber: inv?.invoiceNumber ?? '' });
  };

  const filtered = useMemo(() => statusFilter ? invoices.filter(i => i.status === statusFilter) : invoices, [invoices, statusFilter]);
  const counts = Object.fromEntries(ALL_STATUSES.map(s => [s, invoices.filter(i => i.status === s).length])) as Record<InvoiceStatus, number>;

  const columns = useMemo<ERPColumn<ArInvoice>[]>(() => [
    {
      key: 'invoiceNumber', header: 'Invoice #', width: 140, sortable: true,
      value: r => r.invoiceNumber,
      render: r => <span style={{ ...MONO, color: 'var(--accent-blue, #60a5fa)', fontWeight: 500 }}>{r.invoiceNumber}</span>,
    },
    {
      key: 'customer', header: 'Customer / SO', sortable: true,
      value: r => r.customer?.name ?? '',
      render: r => (
        <div>
          <span style={{ color: 'var(--text-primary, #e2dfd8)', fontWeight: 500 }}>{r.customer?.name ?? '—'}</span>
          {r.salesOrder && <div style={{ fontSize: 11, color: 'rgba(96,165,250,0.5)', marginTop: 1 }}>SO: {r.salesOrder.soNumber}</div>}
        </div>
      ),
    },
    { key: 'invoiceDate', header: 'Invoice Date', width: 120, sortable: true, value: r => r.invoiceDate ?? '', render: r => <span style={{ fontSize: 12, color: 'var(--w50, rgba(255,255,255,0.5))' }}>{fmtDate(r.invoiceDate)}</span> },
    {
      key: 'dueDate', header: 'Due Date', width: 130, sortable: true,
      value: r => r.dueDate ?? '',
      render: r => {
        const days = daysUntil(r.dueDate);
        const dueSoon = r.status === 'sent' && days >= 0 && days <= 7;
        return (
          <span style={{ fontSize: 12, color: dueSoon ? 'var(--warning, #fbbf24)' : r.status === 'overdue' ? 'var(--danger, #f87171)' : 'var(--w50, rgba(255,255,255,0.5))' }}>
            {fmtDate(r.dueDate)}
            {dueSoon && <span style={{ marginLeft: 4, fontSize: 10, color: 'var(--warning, #fbbf24)' }}>({days}d)</span>}
          </span>
        );
      },
    },
    { key: 'totalAmount', header: 'Total', width: 120, align: 'right', sortable: true, value: r => Number(r.totalAmount), render: r => <span style={{ ...MONO, color: 'var(--text-primary, #e2dfd8)' }}>{fmtAmt(r.totalAmount)}</span> },
    {
      key: 'outstanding', header: 'Outstanding', width: 150, align: 'right', sortable: true,
      value: r => Number(r.totalAmount) - Number(r.paidAmount),
      render: r => {
        const outstanding = Number(r.totalAmount) - Number(r.paidAmount);
        const pctPaid = Number(r.totalAmount) > 0 ? (Number(r.paidAmount) / Number(r.totalAmount)) * 100 : 0;
        return (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}>
            <div style={{ width: 44, height: 3, borderRadius: 2, background: 'var(--l08, rgba(255,255,255,0.08))', overflow: 'hidden', flexShrink: 0 }}>
              <div style={{ height: '100%', width: `${Math.min(100, pctPaid)}%`, background: pctPaid >= 100 ? 'var(--success, #4ade80)' : 'var(--accent-strong, #fb923c)', borderRadius: 2 }} />
            </div>
            <span style={{ ...MONO, fontSize: 11, color: pctPaid >= 100 ? 'var(--success, #4ade80)' : outstanding > 0 ? 'var(--accent-strong, #fb923c)' : 'var(--w30, rgba(255,255,255,0.3))' }}>{fmtAmt(outstanding)}</span>
          </div>
        );
      },
    },
    { key: 'status', header: 'Status', width: 110, sortable: true, value: r => r.status, render: r => <StatusBadge status={r.status as InvoiceStatus} /> },
    {
      key: '_actions', header: '', width: 200, sortable: false,
      render: r => {
        const busy = actionBusy === r.id;
        return (
          <div style={{ display: 'flex', gap: 4 }} onClick={e => e.stopPropagation()}>
            {r.status === 'draft' && (
              <button onClick={() => handleAction(r.id, 'send')} disabled={busy}
                style={{ padding: '3px 9px', borderRadius: 6, fontSize: 11, cursor: 'pointer', color: 'var(--accent-blue, #60a5fa)', background: 'rgba(96,165,250,0.1)', border: '0.5px solid rgba(96,165,250,0.2)', fontFamily: "'IBM Plex Sans',sans-serif", opacity: busy ? 0.5 : 1 }}>{busy ? '…' : 'Send'}</button>
            )}
            {['sent', 'partial'].includes(r.status) && (
              <button onClick={() => setPaymentInv(r)} disabled={busy}
                style={{ padding: '3px 9px', borderRadius: 6, fontSize: 11, cursor: 'pointer', color: 'var(--success, #4ade80)', background: 'rgba(74,222,128,0.1)', border: '0.5px solid rgba(74,222,128,0.2)', fontFamily: "'IBM Plex Sans',sans-serif", opacity: busy ? 0.5 : 1 }}>+ Payment</button>
            )}
            {['draft', 'sent', 'partial'].includes(r.status) && (
              <button onClick={() => handleAction(r.id, 'void')} disabled={busy}
                style={{ padding: '3px 9px', borderRadius: 6, fontSize: 11, cursor: 'pointer', color: 'var(--danger, #f87171)', background: 'rgba(248,113,113,0.08)', border: '0.5px solid rgba(248,113,113,0.15)', fontFamily: "'IBM Plex Sans',sans-serif", opacity: busy ? 0.5 : 1 }}>Void</button>
            )}
            <PrintButton doc="ar-invoice" id={r.id} label="" style={{ padding: '3px 7px' }} />
          </div>
        );
      },
    },
  ], [actionBusy, invoices]);

  return (
    <ERPShell breadcrumbs={['Home', 'Sales', 'AR Invoices']} title="Accounts Receivable">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap');
        .ar-page { padding: 0 18px 12px; display:flex; flex-direction:column; height:100%; overflow:hidden; }
        .ar-stats { display:flex; gap:8px; margin-bottom:10px; flex-wrap:wrap; flex-shrink:0; }
        .ar-stat { background:rgba(10,7,18,0.7); border-radius:8px; padding:6px 10px; display:flex; flex-direction:column; gap:2px; min-width:70px; cursor:pointer; transition:opacity 0.15s; }
        .ar-stat:hover { opacity:0.8; }
        .ar-stat-label { font-size:10px; font-weight:500; letter-spacing:0.08em; text-transform:uppercase; }
        .ar-stat-value { font-size:18px; font-weight:500; font-family:'IBM Plex Mono',monospace; color:var(--text-strong, #f1ede8); }
        .ar-btn-new { display:flex; align-items:center; gap:6px; background:linear-gradient(135deg,#1e3a8a,#1d4ed8,#3b82f6); border:none; border-radius:7px; padding:7px 14px; font-size:12px; font-weight:500; font-family:'IBM Plex Sans',sans-serif; color:white; cursor:pointer; box-shadow:0 3px 12px rgba(59,130,246,0.3); flex-shrink:0; align-self:flex-end; }
        .ar-btn-new:hover { opacity:0.88; }
        .ar-error { background:rgba(239,68,68,0.08); border:0.5px solid rgba(239,68,68,0.2); border-radius:8px; padding:10px 14px; margin-bottom:10px; font-size:13px; color:var(--danger-subtle, #fca5a5); flex-shrink:0; }
      `}</style>

      <div className="ar-page">
        <KpiCards kpis={kpis} aging={aging} />

        <div className="ar-stats">
          {ALL_STATUSES.map(s => {
            const style = STATUS_STYLE[s];
            return (
              <div key={s} className="ar-stat" style={{ border: `0.5px solid ${statusFilter === s ? style.border : 'var(--l07, rgba(255,255,255,0.07))'}` }} onClick={() => setStatusFilter(prev => prev === s ? '' : s)}>
                <span className="ar-stat-label" style={{ color: style.color }}>{s.charAt(0).toUpperCase() + s.slice(1)}</span>
                <span className="ar-stat-value">{counts[s]}</span>
              </div>
            );
          })}
          <div className="ar-stat" style={{ border: `0.5px solid ${!statusFilter ? 'rgba(96,165,250,0.3)' : 'var(--l07, rgba(255,255,255,0.07))'}` }} onClick={() => setStatusFilter('')}>
            <span className="ar-stat-label" style={{ color: 'rgba(96,165,250,0.6)' }}>Total</span>
            <span className="ar-stat-value" style={{ color: 'var(--accent-blue, #60a5fa)' }}>{invoices.length}</span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, marginBottom: 10, flexShrink: 0, flexWrap: 'wrap' }}>
          <div style={{ width: 220 }}>
            <SearchSelect
              options={ALL_STATUSES.map(s => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))}
              value={statusFilter} onChange={v => setStatusFilter(v as InvoiceStatus | '')}
              placeholder="All Status" clearLabel="All Status" minWidth={200}
            />
          </div>
          <button className="ar-btn-new" onClick={() => setCreateOpen(true)}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><line x1="6.5" y1="1" x2="6.5" y2="12"/><line x1="1" y1="6.5" x2="12" y2="6.5"/></svg>
            New Invoice
          </button>
        </div>

        {error && <div className="ar-error">{error}</div>}

        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <ERPTable<ArInvoice>
            columns={columns}
            data={filtered}
            rowKey={r => r.id}
            loading={loading}
            exportFilename="ar-invoices"
            emptyMessage={statusFilter ? 'No invoices match your filters.' : 'No invoices yet.'}
            defaultPageSize={25}
            maxHeight="100%"
            onRowClick={r => setDetailInv(r)}
          />
        </div>
      </div>

      <CreateInvoiceModal open={createOpen} onClose={() => setCreateOpen(false)} onSaved={fetchAll} customers={customers} />
      <PaymentModal inv={paymentInv} onClose={() => setPaymentInv(null)} onSaved={fetchAll} />
      <InvoiceDetailModal inv={detailInv} onClose={() => setDetailInv(null)} />

      <ConfirmModal
        open={!!confirmAction}
        onClose={() => setConfirmAction(null)}
        title={confirmAction ? (confirmAction.action === 'send' ? `Send invoice ${confirmAction.invoiceNumber}?` : `Void invoice ${confirmAction.invoiceNumber}?`) : ''}
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
