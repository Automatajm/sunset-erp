"use client";

import { useEffect, useState, useCallback } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import { cashFlowApi } from '@/lib/api/cash-flow';
import { CashFlowScenario } from '@/lib/api/types';

// ─── Real backend types ───────────────────────────────────────────────────────

interface CashFlowLine {
  id: string;
  lineDate: string;
  lineType: 'inflow' | 'outflow';
  category: string;
  amount: string; // comes as string
  description?: string;
  accountId?: string | null;
}

interface CashFlowProjection {
  id: string;
  projectionCode: string;
  projectionName: string;
  startDate: string;
  endDate: string;
  scenario: CashFlowScenario;
  description?: string;
  cashFlowLines: CashFlowLine[]; // real field name
  createdAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractList(data: unknown): CashFlowProjection[] {
  if (Array.isArray(data)) return data as CashFlowProjection[];
  const d = data as Record<string, unknown>;
  if (d?.value && Array.isArray(d.value)) return d.value as CashFlowProjection[];
  return [];
}

function fmtAmt(v: string | number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(Number(v));
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtDateShort(d: string) {
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ─── Scenario badge ───────────────────────────────────────────────────────────

const SCENARIO_STYLE: Record<CashFlowScenario, { color: string; bg: string; border: string }> = {
  optimistic:  { color: '#4ade80', bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.2)' },
  realistic:   { color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',  border: 'rgba(96,165,250,0.2)' },
  pessimistic: { color: '#f87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.2)' },
};

function ScenarioBadge({ scenario }: { scenario: CashFlowScenario }) {
  const s = SCENARIO_STYLE[scenario];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 500,
      color: s.color, background: s.bg, border: `0.5px solid ${s.border}`,
      whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
      {scenario.charAt(0).toUpperCase() + scenario.slice(1)}
    </span>
  );
}

// ─── Projection card ──────────────────────────────────────────────────────────

function ProjectionCard({ proj, onAddLine, onRefresh }: {
  proj: CashFlowProjection;
  onAddLine: (id: string) => void;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [lineFilter, setLineFilter] = useState<'all' | 'inflow' | 'outflow'>('all');

  const totalInflow  = proj.cashFlowLines.filter(l => l.lineType === 'inflow').reduce((s, l) => s + Number(l.amount), 0);
  const totalOutflow = proj.cashFlowLines.filter(l => l.lineType === 'outflow').reduce((s, l) => s + Number(l.amount), 0);
  const netFlow = totalInflow - totalOutflow;

  const filteredLines = proj.cashFlowLines.filter(l =>
    lineFilter === 'all' || l.lineType === lineFilter
  ).sort((a, b) => new Date(a.lineDate).getTime() - new Date(b.lineDate).getTime());

  const MONO = { fontFamily: "'IBM Plex Mono',monospace", fontSize: 12 } as React.CSSProperties;

  return (
    <div style={{
      background: 'rgba(10,7,18,0.7)', border: '0.5px solid rgba(251,146,60,0.12)',
      borderRadius: 10, overflow: 'hidden',
    }}>
      {/* Card header */}
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', cursor: 'pointer', transition: 'background 0.15s' }}
        onClick={() => setExpanded(e => !e)}
      >
        <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', transform: expanded ? 'rotate(90deg)' : 'none', display: 'inline-block', transition: 'transform 0.15s', flexShrink: 0 }}>▶</span>
        <span style={{ ...MONO, color: '#fb923c', fontWeight: 500, flexShrink: 0 }}>{proj.projectionCode}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#e2dfd8' }}>{proj.projectionName}</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>
            {fmtDate(proj.startDate)} → {fmtDate(proj.endDate)} · {proj.cashFlowLines.length} line{proj.cashFlowLines.length !== 1 ? 's' : ''}
          </div>
        </div>

        {/* Summary chips */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
            <span style={{ fontSize: 10, color: 'rgba(74,222,128,0.6)', letterSpacing: '0.06em' }}>INFLOW</span>
            <span style={{ ...MONO, color: '#4ade80', fontWeight: 500 }}>{fmtAmt(totalInflow)}</span>
          </div>
          <div style={{ width: 0.5, height: 28, background: 'rgba(255,255,255,0.1)' }} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
            <span style={{ fontSize: 10, color: 'rgba(248,113,113,0.6)', letterSpacing: '0.06em' }}>OUTFLOW</span>
            <span style={{ ...MONO, color: '#f87171', fontWeight: 500 }}>{fmtAmt(totalOutflow)}</span>
          </div>
          <div style={{ width: 0.5, height: 28, background: 'rgba(255,255,255,0.1)' }} />
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 1 }}>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.06em' }}>NET</span>
            <span style={{ ...MONO, fontWeight: 600, color: netFlow >= 0 ? '#4ade80' : '#f87171' }}>{fmtAmt(netFlow)}</span>
          </div>
          <ScenarioBadge scenario={proj.scenario} />
        </div>
      </div>

      {/* Expanded detail */}
      {expanded && (
        <div style={{ borderTop: '0.5px solid rgba(255,255,255,0.06)', padding: '12px 16px 14px' }}>
          {proj.description && (
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 12, lineHeight: 1.5 }}>{proj.description}</p>
          )}

          {/* Line filter + add */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{ display: 'flex', background: 'rgba(255,255,255,0.04)', borderRadius: 7, border: '0.5px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
              {(['all', 'inflow', 'outflow'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setLineFilter(f)}
                  style={{
                    padding: '5px 12px', fontSize: 11, fontFamily: "'IBM Plex Sans',sans-serif",
                    cursor: 'pointer', border: 'none',
                    background: lineFilter === f ? 'rgba(251,146,60,0.15)' : 'transparent',
                    color: lineFilter === f ? '#fb923c' : 'rgba(255,255,255,0.4)',
                    transition: 'background 0.15s',
                  }}
                >
                  {f.charAt(0).toUpperCase() + f.slice(1)}
                </button>
              ))}
            </div>
            <button
              onClick={() => onAddLine(proj.id)}
              style={{
                padding: '5px 12px', borderRadius: 6, fontSize: 11,
                background: 'rgba(96,165,250,0.1)', color: '#60a5fa',
                border: '0.5px solid rgba(96,165,250,0.2)',
                fontFamily: "'IBM Plex Sans',sans-serif", cursor: 'pointer',
              }}
            >
              + Add Line
            </button>
          </div>

          {/* Lines table */}
          {filteredLines.length === 0 ? (
            <div style={{ padding: '20px 0', textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>
              No {lineFilter !== 'all' ? lineFilter : ''} lines yet.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Date', 'Type', 'Category', 'Description', 'Amount'].map(h => (
                    <th key={h} style={{
                      padding: '6px 10px', fontSize: 10, color: 'rgba(251,146,60,0.5)',
                      fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase',
                      textAlign: h === 'Amount' ? 'right' : 'left',
                      borderBottom: '0.5px solid rgba(255,255,255,0.06)',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredLines.map(line => (
                  <tr key={line.id}>
                    <td style={{ padding: '7px 10px', fontSize: 12, color: 'rgba(255,255,255,0.5)', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>
                      {fmtDateShort(line.lineDate)}
                    </td>
                    <td style={{ padding: '7px 10px', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>
                      <span style={{
                        fontSize: 11, padding: '1px 7px', borderRadius: 20,
                        color: line.lineType === 'inflow' ? '#4ade80' : '#f87171',
                        background: line.lineType === 'inflow' ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)',
                        border: `0.5px solid ${line.lineType === 'inflow' ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)'}`,
                      }}>
                        {line.lineType === 'inflow' ? '↑ In' : '↓ Out'}
                      </span>
                    </td>
                    <td style={{ padding: '7px 10px', fontSize: 12, color: '#e2dfd8', fontWeight: 500, borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>
                      {line.category}
                    </td>
                    <td style={{ padding: '7px 10px', fontSize: 12, color: 'rgba(255,255,255,0.45)', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>
                      {line.description || '—'}
                    </td>
                    <td style={{ padding: '7px 10px', textAlign: 'right', borderBottom: '0.5px solid rgba(255,255,255,0.04)', ...MONO, color: line.lineType === 'inflow' ? '#4ade80' : '#f87171', fontWeight: 500 }}>
                      {line.lineType === 'inflow' ? '+' : '−'}{fmtAmt(line.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
              {/* Summary row */}
              <tfoot>
                <tr style={{ borderTop: '0.5px solid rgba(255,255,255,0.1)' }}>
                  <td colSpan={4} style={{ padding: '8px 10px', fontSize: 11, color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>
                    NET FLOW
                  </td>
                  <td style={{ padding: '8px 10px', textAlign: 'right', ...MONO, fontWeight: 600, fontSize: 13, color: netFlow >= 0 ? '#4ade80' : '#f87171' }}>
                    {netFlow >= 0 ? '+' : ''}{fmtAmt(netFlow)}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Create Projection Modal ──────────────────────────────────────────────────

function CreateProjectionModal({ open, onClose, onSaved }: {
  open: boolean; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({
    projectionCode: '', projectionName: '', startDate: '', endDate: '',
    scenario: 'realistic' as CashFlowScenario, description: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) { setError(''); setForm({ projectionCode: '', projectionName: '', startDate: '', endDate: '', scenario: 'realistic', description: '' }); }
  }, [open]);

  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.projectionCode.trim() || !form.projectionName.trim() || !form.startDate || !form.endDate) {
      setError('Code, name and dates are required.'); return;
    }
    setSubmitting(true); setError('');
    try {
      await cashFlowApi.create(form);
      onSaved(); onClose();
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
      setError(msg || 'Operation failed.');
    } finally { setSubmitting(false); }
  };

  if (!open) return null;

  const INPUT: React.CSSProperties = { background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '9px 12px', fontSize: 13, fontFamily: "'IBM Plex Sans',sans-serif", color: '#f1ede8', outline: 'none', width: '100%' };
  const LABEL: React.CSSProperties = { fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(251,146,60,0.6)', fontFamily: "'IBM Plex Sans',sans-serif" };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#0e0b1a', border: '0.5px solid rgba(251,146,60,0.2)', borderRadius: 14, width: '100%', maxWidth: 500, position: 'relative', boxShadow: '0 24px 60px rgba(0,0,0,0.7)' }}>
        <div style={{ position: 'absolute', top: 0, left: 30, right: 30, height: 1, background: 'linear-gradient(90deg,transparent,rgba(251,146,60,0.4),transparent)' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 12px', borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: '#f1ede8', fontFamily: "'IBM Plex Sans',sans-serif" }}>New Cash Flow Projection</span>
          <button onClick={onClose} style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.45)', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '0.5px solid rgba(239,68,68,0.25)', borderRadius: 7, padding: '8px 12px', fontSize: 12, color: '#fca5a5' }}>{error}</div>}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={LABEL}>Projection Code *</label>
                <input style={INPUT} placeholder="CFP-2026-Q1" value={form.projectionCode} onChange={set('projectionCode')} required />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={LABEL}>Scenario *</label>
                <select style={INPUT} value={form.scenario} onChange={set('scenario')}>
                  <option value="optimistic">Optimistic</option>
                  <option value="realistic">Realistic</option>
                  <option value="pessimistic">Pessimistic</option>
                </select>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={LABEL}>Projection Name *</label>
              <input style={INPUT} placeholder="Q1 2026 Cash Flow Projection" value={form.projectionName} onChange={set('projectionName')} required />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={LABEL}>Start Date *</label>
                <input style={INPUT} type="date" value={form.startDate} onChange={set('startDate')} required />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={LABEL}>End Date *</label>
                <input style={INPUT} type="date" value={form.endDate} onChange={set('endDate')} required />
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={LABEL}>Description</label>
              <input style={INPUT} placeholder="Optional description" value={form.description} onChange={set('description')} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px 18px', borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
            <button type="button" onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '8px 16px', fontSize: 13, fontFamily: "'IBM Plex Sans',sans-serif", color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>Cancel</button>
            <button type="submit" disabled={submitting} style={{ background: 'linear-gradient(135deg,#c2410c,#ea580c,#f97316)', border: 'none', borderRadius: 7, padding: '8px 20px', fontSize: 13, fontWeight: 500, fontFamily: "'IBM Plex Sans',sans-serif", color: 'white', cursor: 'pointer', boxShadow: '0 3px 12px rgba(234,88,12,0.35)', opacity: submitting ? 0.5 : 1 }}>
              {submitting ? 'Creating…' : 'Create Projection'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Add Line Modal ───────────────────────────────────────────────────────────

function AddLineModal({ open, projectionId, onClose, onSaved }: {
  open: boolean; projectionId: string; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({ lineDate: '', lineType: 'inflow' as 'inflow' | 'outflow', category: '', amount: '', description: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) { setError(''); setForm({ lineDate: '', lineType: 'inflow', category: '', amount: '', description: '' }); }
  }, [open]);

  const set = (k: keyof typeof form) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.lineDate || !form.category.trim() || !form.amount) {
      setError('Date, category and amount are required.'); return;
    }
    setSubmitting(true); setError('');
    try {
      await cashFlowApi.addLine(projectionId, {
        lineDate: form.lineDate,
        lineType: form.lineType,
        category: form.category,
        amount: Number(form.amount),
        description: form.description || undefined,
      });
      onSaved(); onClose();
    } catch (err) {
      const msg = (err as { response?: { data?: { message?: string } } }).response?.data?.message;
      setError(msg || 'Operation failed.');
    } finally { setSubmitting(false); }
  };

  if (!open) return null;

  const INPUT: React.CSSProperties = { background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '9px 12px', fontSize: 13, fontFamily: "'IBM Plex Sans',sans-serif", color: '#f1ede8', outline: 'none', width: '100%' };
  const LABEL: React.CSSProperties = { fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(251,146,60,0.6)', fontFamily: "'IBM Plex Sans',sans-serif" };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#0e0b1a', border: '0.5px solid rgba(251,146,60,0.2)', borderRadius: 14, width: '100%', maxWidth: 460, position: 'relative', boxShadow: '0 24px 60px rgba(0,0,0,0.7)' }}>
        <div style={{ position: 'absolute', top: 0, left: 30, right: 30, height: 1, background: 'linear-gradient(90deg,transparent,rgba(251,146,60,0.4),transparent)' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 12px', borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: '#f1ede8', fontFamily: "'IBM Plex Sans',sans-serif" }}>Add Cash Flow Line</span>
          <button onClick={onClose} style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.45)', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '0.5px solid rgba(239,68,68,0.25)', borderRadius: 7, padding: '8px 12px', fontSize: 12, color: '#fca5a5' }}>{error}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={LABEL}>Date *</label>
                <input style={INPUT} type="date" value={form.lineDate} onChange={set('lineDate')} required />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={LABEL}>Type *</label>
                <select style={INPUT} value={form.lineType} onChange={set('lineType')}>
                  <option value="inflow">Inflow</option>
                  <option value="outflow">Outflow</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={LABEL}>Category *</label>
                <input style={INPUT} placeholder="Sales Revenue" value={form.category} onChange={set('category')} required />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={LABEL}>Amount *</label>
                <input style={INPUT} type="number" min="0" step="0.01" placeholder="50000" value={form.amount} onChange={set('amount')} required />
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={LABEL}>Description</label>
              <input style={INPUT} placeholder="Optional description" value={form.description} onChange={set('description')} />
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px 18px', borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
            <button type="button" onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '8px 16px', fontSize: 13, fontFamily: "'IBM Plex Sans',sans-serif", color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>Cancel</button>
            <button type="submit" disabled={submitting} style={{ background: 'linear-gradient(135deg,#c2410c,#ea580c,#f97316)', border: 'none', borderRadius: 7, padding: '8px 20px', fontSize: 13, fontWeight: 500, fontFamily: "'IBM Plex Sans',sans-serif", color: 'white', cursor: 'pointer', boxShadow: '0 3px 12px rgba(234,88,12,0.35)', opacity: submitting ? 0.5 : 1 }}>
              {submitting ? 'Adding…' : 'Add Line'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function CashFlowPage() {
  const [projections, setProjections] = useState<CashFlowProjection[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [createOpen,  setCreateOpen]  = useState(false);
  const [addLineFor,  setAddLineFor]  = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const raw = await cashFlowApi.getAll();
      setProjections(extractList(raw as unknown));
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load cash flow projections.';
      setError(message);
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Overall summary across all projections
  const totalInflow  = projections.flatMap(p => p.cashFlowLines).filter(l => l.lineType === 'inflow').reduce((s, l) => s + Number(l.amount), 0);
  const totalOutflow = projections.flatMap(p => p.cashFlowLines).filter(l => l.lineType === 'outflow').reduce((s, l) => s + Number(l.amount), 0);
  const netFlow = totalInflow - totalOutflow;

  return (
    <ERPShell breadcrumbs={['Home', 'Financial', 'Cash Flow']} title="Cash Flow">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500&display=swap');
        .cf-page { padding: 0 18px 24px; }
        .cf-summary { display:flex; gap:10px; margin-bottom:14px; flex-wrap:wrap; }
        .cf-sum-card { background:rgba(10,7,18,0.7); border-radius:8px; padding:10px 16px; display:flex; flex-direction:column; gap:3px; min-width:140px; }
        .cf-sum-label { font-size:10px; font-weight:500; letter-spacing:0.08em; text-transform:uppercase; }
        .cf-sum-value { font-size:24px; font-weight:500; font-family:'IBM Plex Mono',monospace; color:#f1ede8; }
        .cf-toolbar { display:flex; align-items:center; justify-content:flex-end; margin-bottom:14px; }
        .cf-btn-new { display:flex; align-items:center; gap:6px; background:linear-gradient(135deg,#c2410c,#ea580c,#f97316); border:none; border-radius:7px; padding:7px 14px; font-size:12px; font-weight:500; font-family:'IBM Plex Sans',sans-serif; color:white; cursor:pointer; box-shadow:0 3px 12px rgba(234,88,12,0.3); transition:opacity 0.15s, transform 0.15s; }
        .cf-btn-new:hover { opacity:0.88; transform:translateY(-1px); }
        .cf-btn-new svg { width:13px; height:13px; display:block; flex-shrink:0; }
        .cf-list { display:flex; flex-direction:column; gap:10px; }
        .cf-empty, .cf-loading { text-align:center; padding:52px 24px; color:rgba(255,255,255,0.25); font-size:13px; display:flex; flex-direction:column; align-items:center; gap:10px; background:rgba(10,7,18,0.7); border:0.5px solid rgba(251,146,60,0.12); border-radius:10px; }
        .cf-spinner { width:18px; height:18px; border-radius:50%; border:2px solid rgba(251,146,60,0.2); border-top-color:#fb923c; animation:cf-spin 0.7s linear infinite; flex-shrink:0; }
        @keyframes cf-spin { to { transform:rotate(360deg); } }
        .cf-error { background:rgba(239,68,68,0.08); border:0.5px solid rgba(239,68,68,0.2); border-radius:8px; padding:10px 14px; margin-bottom:14px; font-size:13px; color:#fca5a5; }
      `}</style>

      <div className="cf-page">

        {/* Global summary */}
        {projections.length > 0 && (
          <div className="cf-summary">
            <div className="cf-sum-card" style={{ border: '0.5px solid rgba(74,222,128,0.2)' }}>
              <span className="cf-sum-label" style={{ color: '#4ade80' }}>Total Inflow</span>
              <span className="cf-sum-value">{fmtAmt(totalInflow)}</span>
            </div>
            <div className="cf-sum-card" style={{ border: '0.5px solid rgba(248,113,113,0.2)' }}>
              <span className="cf-sum-label" style={{ color: '#f87171' }}>Total Outflow</span>
              <span className="cf-sum-value">{fmtAmt(totalOutflow)}</span>
            </div>
            <div className="cf-sum-card" style={{ border: `0.5px solid ${netFlow >= 0 ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)'}` }}>
              <span className="cf-sum-label" style={{ color: netFlow >= 0 ? '#4ade80' : '#f87171' }}>Net Flow</span>
              <span className="cf-sum-value" style={{ color: netFlow >= 0 ? '#4ade80' : '#f87171' }}>{fmtAmt(netFlow)}</span>
            </div>
            <div className="cf-sum-card" style={{ border: '0.5px solid rgba(251,146,60,0.2)' }}>
              <span className="cf-sum-label" style={{ color: 'rgba(251,146,60,0.6)' }}>Projections</span>
              <span className="cf-sum-value" style={{ color: '#fb923c' }}>{projections.length}</span>
            </div>
          </div>
        )}

        <div className="cf-toolbar">
          <button className="cf-btn-new" onClick={() => setCreateOpen(true)}>
            <svg viewBox="0 0 13 13" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
              <line x1="6.5" y1="1" x2="6.5" y2="12" /><line x1="1" y1="6.5" x2="12" y2="6.5" />
            </svg>
            New Projection
          </button>
        </div>

        {error && <div className="cf-error">{error}</div>}

        {loading ? (
          <div className="cf-loading"><div className="cf-spinner" />Loading cash flow projections…</div>
        ) : projections.length === 0 ? (
          <div className="cf-empty">No cash flow projections yet.</div>
        ) : (
          <div className="cf-list">
            {projections.map(proj => (
              <ProjectionCard
                key={proj.id}
                proj={proj}
                onAddLine={id => setAddLineFor(id)}
                onRefresh={fetchAll}
              />
            ))}
          </div>
        )}
      </div>

      <CreateProjectionModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={fetchAll}
      />

      {addLineFor && (
        <AddLineModal
          open={true}
          projectionId={addLineFor}
          onClose={() => setAddLineFor(null)}
          onSaved={fetchAll}
        />
      )}
    </ERPShell>
  );
}