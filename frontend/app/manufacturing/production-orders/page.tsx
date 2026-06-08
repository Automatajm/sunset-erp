"use client";

import { useEffect, useState, useCallback } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import { productionOrdersApi } from '@/lib/api/production-orders';
import { PrintButton } from '@/components/print/PrintButton';
import { ConfirmModal } from '@/components/ui/modal';
import { bomApi } from '@/lib/api/bom';
import { ProductionOrderStatus, ProductionPriority } from '@/lib/api/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Bom { id: string; bomNumber: string; parentItem?: { name: string } }
interface ProductionOrder {
  id: string; poNumber: string; itemId: string; bomId: string;
  quantityToProduce: number; quantityProduced: number;
  plannedStartDate?: string; plannedEndDate?: string;
  actualStartDate?: string; actualEndDate?: string;
  status: ProductionOrderStatus; priority?: ProductionPriority; notes?: string;
}
interface LaborActual {
  id: string; workDate?: string; employeeName?: string;
  hoursPlanned?: number; hoursActual: number; laborRate?: number; laborCost?: number; notes?: string;
}
interface LaborSummary { totalPlannedHours: number; totalActualHours: number; varianceHours: number; totalLaborCost: number; efficiency?: number }
interface MaterialActual {
  id: string; itemId: string; item?: { code: string; name: string };
  qtyPlanned: number; qtyActual: number; unitCost: number; varianceCost: number; notes?: string;
}
interface MaterialSummary { totalMaterials: number; totalVarianceCost: number; overConsumed: number; underConsumed: number }
interface Variance {
  id: string; varianceType: string; description?: string;
  quantity?: number; unitCost?: number; totalCost?: number; status: string; notes?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  const d = data as Record<string, unknown>;
  if (d?.value && Array.isArray(d.value)) return d.value as T[];
  return [];
}
function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtAmt(v: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v);
}
function fmtNum(v: number) {
  return new Intl.NumberFormat('en-US').format(v);
}

const MONO = { fontFamily: "'IBM Plex Mono',monospace", fontSize: 12 } as React.CSSProperties;

const PO_STATUS: Record<ProductionOrderStatus, { color: string; bg: string; border: string }> = {
  draft:       { color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.2)' },
  released:    { color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',  border: 'rgba(96,165,250,0.2)' },
  in_progress: { color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.2)' },
  completed:   { color: '#4ade80', bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.2)' },
  cancelled:   { color: '#f87171', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.2)' },
};
const PRIORITY_COLOR: Record<string, string> = { low: 'rgba(255,255,255,0.3)', medium: '#fbbf24', high: '#fb923c', urgent: '#f87171' };
const STATUS_FLOW: Record<ProductionOrderStatus, string | null> = {
  draft: 'released', released: 'in_progress', in_progress: 'completed', completed: null, cancelled: null,
};

const INPUT: React.CSSProperties = { background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '9px 12px', fontSize: 13, fontFamily: "'IBM Plex Sans',sans-serif", color: '#f1ede8', outline: 'none', width: '100%' };
function Field({ label, color, children }: { label: string; color?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: color ?? 'rgba(251,146,60,0.6)', fontFamily: "'IBM Plex Sans',sans-serif" }}>{label}</label>
      {children}
    </div>
  );
}

// ─── Deliver FG Modal ─────────────────────────────────────────────────────────

function DeliverModal({ mo, onClose, onSaved }: { mo: ProductionOrder; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ quantityDelivered: String(mo.quantityToProduce), unitCost: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.quantityDelivered) { setError('Quantity required'); return; }
    setBusy(true); setError('');
    try {
      await (productionOrdersApi as any).deliverFg(mo.id, {
        quantityDelivered: Number(form.quantityDelivered),
        unitCost: form.unitCost ? Number(form.unitCost) : undefined,
        notes: form.notes || undefined,
      });
      onSaved(); onClose();
    } catch (err) {
      setError((err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Delivery failed');
    } finally { setBusy(false); }
  };

  const planned = mo.quantityToProduce;
  const delivered = Number(form.quantityDelivered) || 0;
  const variance = delivered - planned;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#0e0b1a', border: '0.5px solid rgba(74,222,128,0.2)', borderRadius: 14, width: '100%', maxWidth: 460, boxShadow: '0 24px 60px rgba(0,0,0,0.7)' }}>
        <div style={{ padding: '14px 18px 10px', borderBottom: '0.5px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: '#f1ede8' }}>Confirm FG Delivery</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{mo.poNumber} · Planned: <span style={{ color: '#fb923c', fontFamily: "'IBM Plex Mono',monospace" }}>{fmtNum(planned)}</span> units</div>
          </div>
          <button onClick={onClose} style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.45)', fontSize: 16 }}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '0.5px solid rgba(239,68,68,0.25)', borderRadius: 7, padding: '7px 12px', fontSize: 12, color: '#fca5a5' }}>{error}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Qty Delivered *" color="rgba(74,222,128,0.6)">
                <input type="number" min="0.001" step="0.001" style={INPUT} value={form.quantityDelivered} onChange={e => setForm(f => ({ ...f, quantityDelivered: e.target.value }))} />
              </Field>
              <Field label="Unit Cost (for JE)" color="rgba(74,222,128,0.6)">
                <input type="number" min="0" step="0.0001" placeholder="0.85" style={INPUT} value={form.unitCost} onChange={e => setForm(f => ({ ...f, unitCost: e.target.value }))} />
              </Field>
            </div>
            {form.quantityDelivered && (
              <div style={{ background: 'rgba(255,255,255,0.03)', border: `0.5px solid ${variance === 0 ? 'rgba(255,255,255,0.08)' : variance < 0 ? 'rgba(248,113,113,0.2)' : 'rgba(74,222,128,0.2)'}`, borderRadius: 7, padding: '8px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Variance</span>
                <span style={{ ...MONO, color: variance === 0 ? 'rgba(255,255,255,0.5)' : variance < 0 ? '#f87171' : '#4ade80', fontWeight: 500 }}>
                  {variance > 0 ? '+' : ''}{fmtNum(variance)} units
                  {variance < 0 ? ' (merma)' : variance > 0 ? ' (surplus)' : ' (exact)'}
                </span>
              </div>
            )}
            <Field label="Notes" color="rgba(74,222,128,0.6)">
              <input placeholder="Optional notes" style={INPUT} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </Field>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '10px 18px 16px', borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
            <button type="button" onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '7px 14px', fontSize: 12, fontFamily: "'IBM Plex Sans',sans-serif", color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>Cancel</button>
            <button type="submit" disabled={busy} style={{ background: 'linear-gradient(135deg,#14532d,#16a34a,#22c55e)', border: 'none', borderRadius: 7, padding: '7px 18px', fontSize: 12, fontWeight: 500, fontFamily: "'IBM Plex Sans',sans-serif", color: 'white', cursor: 'pointer', opacity: busy ? 0.5 : 1 }}>
              {busy ? 'Delivering…' : 'Confirm Delivery'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Labor Modal ──────────────────────────────────────────────────────────────

function LaborModal({ mo, onClose, onSaved }: { mo: ProductionOrder; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ workDate: new Date().toISOString().split('T')[0], employeeName: '', hoursPlanned: '', hoursActual: '', laborRate: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.hoursActual) { setError('Actual hours required'); return; }
    setBusy(true); setError('');
    try {
      await (productionOrdersApi as any).addLaborActual(mo.id, {
        workDate: form.workDate || undefined,
        employeeName: form.employeeName || undefined,
        hoursPlanned: form.hoursPlanned ? Number(form.hoursPlanned) : undefined,
        hoursActual: Number(form.hoursActual),
        laborRate: form.laborRate ? Number(form.laborRate) : undefined,
        notes: form.notes || undefined,
      });
      onSaved(); onClose();
    } catch (err) {
      setError((err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Failed');
    } finally { setBusy(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#0e0b1a', border: '0.5px solid rgba(167,139,250,0.2)', borderRadius: 14, width: '100%', maxWidth: 460, boxShadow: '0 24px 60px rgba(0,0,0,0.7)' }}>
        <div style={{ padding: '14px 18px 10px', borderBottom: '0.5px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: '#f1ede8' }}>Log Labor Actuals — {mo.poNumber}</div>
          <button onClick={onClose} style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.45)', fontSize: 16 }}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '0.5px solid rgba(239,68,68,0.25)', borderRadius: 7, padding: '7px 12px', fontSize: 12, color: '#fca5a5' }}>{error}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Work Date" color="rgba(167,139,250,0.6)">
                <input type="date" style={INPUT} value={form.workDate} onChange={e => setForm(f => ({ ...f, workDate: e.target.value }))} />
              </Field>
              <Field label="Employee" color="rgba(167,139,250,0.6)">
                <input placeholder="Name or ID" style={INPUT} value={form.employeeName} onChange={e => setForm(f => ({ ...f, employeeName: e.target.value }))} />
              </Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <Field label="Planned Hrs" color="rgba(167,139,250,0.6)">
                <input type="number" min="0" step="0.001" placeholder="8" style={INPUT} value={form.hoursPlanned} onChange={e => setForm(f => ({ ...f, hoursPlanned: e.target.value }))} />
              </Field>
              <Field label="Actual Hrs *" color="rgba(167,139,250,0.6)">
                <input type="number" min="0" step="0.001" placeholder="9.5" style={INPUT} value={form.hoursActual} onChange={e => setForm(f => ({ ...f, hoursActual: e.target.value }))} />
              </Field>
              <Field label="Rate/hr" color="rgba(167,139,250,0.6)">
                <input type="number" min="0" step="0.001" placeholder="12.50" style={INPUT} value={form.laborRate} onChange={e => setForm(f => ({ ...f, laborRate: e.target.value }))} />
              </Field>
            </div>
            <Field label="Notes" color="rgba(167,139,250,0.6)">
              <input placeholder="Optional notes" style={INPUT} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </Field>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '10px 18px 16px', borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
            <button type="button" onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '7px 14px', fontSize: 12, fontFamily: "'IBM Plex Sans',sans-serif", color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>Cancel</button>
            <button type="submit" disabled={busy} style={{ background: 'linear-gradient(135deg,#4c1d95,#6d28d9,#7c3aed)', border: 'none', borderRadius: 7, padding: '7px 18px', fontSize: 12, fontWeight: 500, fontFamily: "'IBM Plex Sans',sans-serif", color: 'white', cursor: 'pointer', opacity: busy ? 0.5 : 1 }}>
              {busy ? 'Saving…' : 'Log Labor'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Actuals Panel ────────────────────────────────────────────────────────────

function ActualsPanel({ mo, onRefresh }: { mo: ProductionOrder; onRefresh: () => void }) {
  const [tab, setTab] = useState<'labor' | 'materials' | 'variances'>('labor');
  const [laborData,    setLaborData]    = useState<{ actuals: LaborActual[]; summary: LaborSummary } | null>(null);
  const [materialData, setMaterialData] = useState<{ actuals: MaterialActual[]; summary: MaterialSummary } | null>(null);
  const [varianceData, setVarianceData] = useState<{ variances: Variance[]; summary: any } | null>(null);
  const [loading,      setLoading]      = useState(false);
  const [postingJe,    setPostingJe]    = useState<string | null>(null);

  const [loadingBom,         setLoadingBom]         = useState(false);
  const [loadingRouting,     setLoadingRouting]     = useState(false);
  const [bomSuggestions,     setBomSuggestions]     = useState<any[] | null>(null);
  const [bomSelected,        setBomSelected]        = useState<Set<string>>(new Set());
  const [routingSuggestions, setRoutingSuggestions] = useState<any[] | null>(null);
  const [routingSelected,    setRoutingSelected]    = useState<Set<number>>(new Set());

  const canPost = ['released', 'in_progress', 'completed'].includes(mo.status);

  const load = useCallback(async (t: typeof tab) => {
    setLoading(true);
    try {
      if (t === 'labor')          setLaborData(await (productionOrdersApi as any).getLaborActuals(mo.id));
      else if (t === 'materials') setMaterialData(await (productionOrdersApi as any).getMaterialActuals(mo.id));
      else                        setVarianceData(await (productionOrdersApi as any).getVariances(mo.id));
    } finally { setLoading(false); }
  }, [mo.id]);

  useEffect(() => { load(tab); }, [tab, load]);

  // ── Load from BOM ──────────────────────────────
  const handleLoadFromBom = async () => {
    if (!mo.bomId) return;
    setLoadingBom(true);
    try {
      const suggestions = await bomApi.getMaterialSuggestions(mo.bomId, mo.quantityToProduce);
      const list = Array.isArray(suggestions) ? suggestions : [];
      setBomSuggestions(list);
      setBomSelected(new Set(list.map((s: any) => s.consumptionGroupId ?? s.itemId).filter(Boolean)));
    } catch { setBomSuggestions([]); }
    finally { setLoadingBom(false); }
  };

  const handleConfirmBomSuggestions = async () => {
    if (!bomSuggestions) return;
    const selected = bomSuggestions.filter((s: any) => bomSelected.has(s.consumptionGroupId ?? s.itemId));
    if (selected.length === 0) return;
    setLoadingBom(true);
    try {
      for (const s of selected) {
        if (!s.itemId) continue;
        await (productionOrdersApi as any).addMaterialActual(mo.id, {
          itemId: s.itemId, qtyPlanned: s.qtyPlanned, qtyActual: s.qtyPlanned, unitCost: 0, notes: s.note,
        });
      }
      setBomSuggestions(null);
      setBomSelected(new Set());
      await load('materials');
    } finally { setLoadingBom(false); }
  };

  // ── Load from Routing ──────────────────────────
  const handleLoadFromRouting = async () => {
    if (!mo.bomId) return;
    setLoadingRouting(true);
    try {
      const estimate = await bomApi.getLaborEstimate(mo.bomId, mo.quantityToProduce);
      const steps = estimate.steps ?? [];
      setRoutingSuggestions(steps);
      setRoutingSelected(new Set(steps.map((s: any) => s.stepNumber)));
    } catch { setRoutingSuggestions([]); }
    finally { setLoadingRouting(false); }
  };

  const handleConfirmRoutingSuggestions = async () => {
    if (!routingSuggestions) return;
    const selected = routingSuggestions.filter(s => routingSelected.has(s.stepNumber));
    if (selected.length === 0) return;
    setLoadingRouting(true);
    try {
      for (const s of selected) {
        await (productionOrdersApi as any).addLaborActual(mo.id, {
          hoursPlanned: s.totalHours,
          hoursActual:  s.totalHours,
          laborRate:    s.costPerHour || undefined,
          notes:        `${s.description ?? ''} — ${s.workCenter?.name ?? ''}`.trim(),
        });
      }
      setRoutingSuggestions(null);
      setRoutingSelected(new Set());
      await load('labor');
    } finally { setLoadingRouting(false); }
  };

  const handlePostJe = async (varianceId: string) => {
    setPostingJe(varianceId);
    try { await (productionOrdersApi as any).postVarianceJe(varianceId, {}); await load('variances'); onRefresh(); }
    finally { setPostingJe(null); }
  };

  const TAB_STYLE = (active: boolean, color: string): React.CSSProperties => ({
    padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 500,
    cursor: 'pointer', border: 'none', fontFamily: "'IBM Plex Sans',sans-serif",
    color: active ? color : 'rgba(255,255,255,0.35)',
    background: active ? `${color}18` : 'transparent',
    transition: 'all 0.15s',
  });

  const SuggestBtn = ({ label, loading: btnLoading, onClick, color }: { label: string; loading: boolean; onClick: () => void; color: string }) => (
    <button onClick={onClick} disabled={btnLoading || !mo.bomId || !canPost}
      title={!canPost ? 'Release MO first to load suggestions' : !mo.bomId ? 'No BOM linked' : undefined}
      style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: mo.bomId && canPost ? 'pointer' : 'not-allowed', color, background: `${color}15`, border: `0.5px solid ${color}30`, fontFamily: "'IBM Plex Sans',sans-serif", opacity: btnLoading || !mo.bomId || !canPost ? 0.4 : 1, display: 'flex', alignItems: 'center', gap: 5 }}>
      {btnLoading ? '…' : `⚡ ${label}`}
    </button>
  );

  const CB_STYLE: React.CSSProperties = { width: 14, height: 14, cursor: 'pointer', accentColor: '#a78bfa' };

  return (
    <div style={{ padding: '10px 40px 16px', background: 'rgba(255,255,255,0.01)', borderTop: '0.5px solid rgba(255,255,255,0.04)' }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
        <button style={TAB_STYLE(tab === 'labor',     '#a78bfa')} onClick={() => setTab('labor')}>⏱ Labor</button>
        <button style={TAB_STYLE(tab === 'materials', '#fb923c')} onClick={() => setTab('materials')}>📦 Materials</button>
        <button style={TAB_STYLE(tab === 'variances', '#f87171')} onClick={() => setTab('variances')}>⚠ Variances</button>
      </div>

      {loading ? (
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)', padding: '8px 0' }}>Loading…</div>

      ) : tab === 'labor' && laborData ? (
        <>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {[
                { label: 'Planned',    value: `${laborData.summary.totalPlannedHours}h`,                                              color: 'rgba(255,255,255,0.5)' },
                { label: 'Actual',     value: `${laborData.summary.totalActualHours}h`,                                               color: '#a78bfa' },
                { label: 'Variance',   value: `${laborData.summary.varianceHours > 0 ? '+' : ''}${laborData.summary.varianceHours}h`, color: laborData.summary.varianceHours > 0 ? '#f87171' : '#4ade80' },
                { label: 'Labor Cost', value: fmtAmt(laborData.summary.totalLaborCost),                                               color: '#e2dfd8' },
                { label: 'Efficiency', value: laborData.summary.efficiency ? `${laborData.summary.efficiency.toFixed(1)}%` : '—',    color: (laborData.summary.efficiency ?? 0) >= 90 ? '#4ade80' : '#fbbf24' },
              ].map(s => (
                <div key={s.label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{s.label}</span>
                  <span style={{ ...MONO, color: s.color, fontSize: 13 }}>{s.value}</span>
                </div>
              ))}
            </div>
            <SuggestBtn label="Load from Routing" loading={loadingRouting} onClick={handleLoadFromRouting} color="#a78bfa" />
          </div>

          {/* Routing suggestions with checkboxes */}
          {routingSuggestions && routingSuggestions.length > 0 && (
            <div style={{ background: 'rgba(167,139,250,0.06)', border: '0.5px solid rgba(167,139,250,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 500, color: 'rgba(167,139,250,0.7)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  Routing Suggestions — select steps to add
                </span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button onClick={() => setRoutingSelected(new Set(routingSuggestions.map(s => s.stepNumber)))}
                    style={{ fontSize: 11, color: 'rgba(167,139,250,0.6)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif" }}>
                    Select all
                  </button>
                  <button onClick={() => setRoutingSelected(new Set())}
                    style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif" }}>
                    Clear
                  </button>
                </div>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 10 }}>
                <thead>
                  <tr>
                    <th style={{ width: 30, padding: '3px 8px', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}></th>
                    {['Step', 'Description', 'Work Center', 'Setup (h)', 'Run (h)', 'Total (h)', 'Est. Cost'].map(h => (
                      <th key={h} style={{ padding: '3px 8px', fontSize: 10, color: 'rgba(167,139,250,0.5)', fontWeight: 500, textTransform: 'uppercase', textAlign: 'left', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {routingSuggestions.map((s: any) => {
                    const checked = routingSelected.has(s.stepNumber);
                    return (
                      <tr key={s.stepNumber} style={{ opacity: checked ? 1 : 0.4, cursor: 'pointer' }}
                        onClick={() => setRoutingSelected(prev => { const n = new Set(prev); checked ? n.delete(s.stepNumber) : n.add(s.stepNumber); return n; })}>
                        <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                          <input type="checkbox" style={CB_STYLE} checked={checked} onChange={() => {}} />
                        </td>
                        <td style={{ padding: '5px 8px', ...MONO, color: '#a78bfa' }}>{s.stepNumber}</td>
                        <td style={{ padding: '5px 8px', fontSize: 12, color: '#e2dfd8' }}>{s.description || '—'}</td>
                        <td style={{ padding: '5px 8px', fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{s.workCenter?.name}</td>
                        <td style={{ padding: '5px 8px', ...MONO, textAlign: 'right' }}>{s.setupTime}</td>
                        <td style={{ padding: '5px 8px', ...MONO, textAlign: 'right' }}>{s.totalRunHours}</td>
                        <td style={{ padding: '5px 8px', ...MONO, color: '#a78bfa', textAlign: 'right', fontWeight: 500 }}>{s.totalHours}</td>
                        <td style={{ padding: '5px 8px', ...MONO, color: '#4ade80', textAlign: 'right' }}>{fmtAmt(s.estimatedCost)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button onClick={handleConfirmRoutingSuggestions} disabled={loadingRouting || routingSelected.size === 0}
                  style={{ padding: '5px 14px', borderRadius: 6, fontSize: 12, cursor: routingSelected.size > 0 ? 'pointer' : 'not-allowed', color: 'white', background: 'linear-gradient(135deg,#4c1d95,#6d28d9)', border: 'none', fontFamily: "'IBM Plex Sans',sans-serif", opacity: loadingRouting || routingSelected.size === 0 ? 0.5 : 1 }}>
                  {loadingRouting ? 'Adding…' : `✓ Add ${routingSelected.size} step${routingSelected.size !== 1 ? 's' : ''}`}
                </button>
                <button onClick={() => { setRoutingSuggestions(null); setRoutingSelected(new Set()); }}
                  style={{ padding: '5px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer', color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.1)', fontFamily: "'IBM Plex Sans',sans-serif" }}>
                  Dismiss
                </button>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>{routingSelected.size} of {routingSuggestions.length} selected</span>
              </div>
            </div>
          )}
          {routingSuggestions && routingSuggestions.length === 0 && (
            <div style={{ fontSize: 12, color: '#fbbf24', marginBottom: 10 }}>No routing steps defined. Add them in the BOM page first.</div>
          )}

          {laborData.actuals.length === 0 ? (
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>No labor actuals recorded yet.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>{['Date', 'Employee', 'Planned', 'Actual', 'Variance', 'Rate', 'Cost', 'Notes'].map(h => (
                  <th key={h} style={{ padding: '4px 10px', fontSize: 10, color: 'rgba(167,139,250,0.5)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {laborData.actuals.map(a => {
                  const variance = (a.hoursActual ?? 0) - (a.hoursPlanned ?? 0);
                  return (
                    <tr key={a.id}>
                      <td style={{ padding: '5px 10px', color: 'rgba(255,255,255,0.45)' }}>{fmtDate(a.workDate)}</td>
                      <td style={{ padding: '5px 10px', color: '#e2dfd8' }}>{a.employeeName || '—'}</td>
                      <td style={{ padding: '5px 10px', ...MONO, textAlign: 'right' }}>{a.hoursPlanned ?? '—'}</td>
                      <td style={{ padding: '5px 10px', ...MONO, color: '#a78bfa', textAlign: 'right' }}>{a.hoursActual}</td>
                      <td style={{ padding: '5px 10px', ...MONO, color: variance > 0 ? '#f87171' : variance < 0 ? '#4ade80' : 'rgba(255,255,255,0.3)', textAlign: 'right' }}>{a.hoursPlanned != null ? `${variance > 0 ? '+' : ''}${variance}h` : '—'}</td>
                      <td style={{ padding: '5px 10px', ...MONO, textAlign: 'right' }}>{a.laborRate ? `$${a.laborRate}` : '—'}</td>
                      <td style={{ padding: '5px 10px', ...MONO, color: '#e2dfd8', textAlign: 'right' }}>{a.laborCost ? fmtAmt(a.laborCost) : '—'}</td>
                      <td style={{ padding: '5px 10px', fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{a.notes || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </>

      ) : tab === 'materials' && materialData ? (
        <>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 10 }}>
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
              {[
                { label: 'Materials',       value: String(materialData.summary.totalMaterials),    color: '#e2dfd8' },
                { label: 'Over-consumed',   value: String(materialData.summary.overConsumed),      color: materialData.summary.overConsumed > 0 ? '#f87171' : 'rgba(255,255,255,0.3)' },
                { label: 'Under-consumed',  value: String(materialData.summary.underConsumed),     color: materialData.summary.underConsumed > 0 ? '#4ade80' : 'rgba(255,255,255,0.3)' },
                { label: 'Total Var. Cost', value: fmtAmt(materialData.summary.totalVarianceCost), color: materialData.summary.totalVarianceCost > 0 ? '#f87171' : materialData.summary.totalVarianceCost < 0 ? '#4ade80' : 'rgba(255,255,255,0.3)' },
              ].map(s => (
                <div key={s.label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{s.label}</span>
                  <span style={{ ...MONO, color: s.color, fontSize: 13 }}>{s.value}</span>
                </div>
              ))}
            </div>
            <SuggestBtn label="Load from BOM" loading={loadingBom} onClick={handleLoadFromBom} color="#fb923c" />
          </div>

          {/* BOM suggestions with checkboxes */}
          {bomSuggestions && bomSuggestions.length > 0 && (
            <div style={{ background: 'rgba(251,146,60,0.05)', border: '0.5px solid rgba(251,146,60,0.2)', borderRadius: 8, padding: '10px 14px', marginBottom: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 500, color: 'rgba(251,146,60,0.7)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                  BOM Suggestions — select materials to add
                </span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <button onClick={() => setBomSelected(new Set(bomSuggestions.map((s: any) => s.consumptionGroupId ?? s.itemId)))}
                    style={{ fontSize: 11, color: 'rgba(251,146,60,0.6)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif" }}>
                    Select all
                  </button>
                  <button onClick={() => setBomSelected(new Set())}
                    style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif" }}>
                    Clear
                  </button>
                </div>
              </div>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, marginBottom: 10 }}>
                <thead>
                  <tr>
                    <th style={{ width: 30, padding: '3px 8px', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}></th>
                    {['Item Code', 'Item Name', 'Qty Planned', 'UOM', 'Note'].map(h => (
                      <th key={h} style={{ padding: '3px 8px', fontSize: 10, color: 'rgba(251,146,60,0.5)', fontWeight: 500, textTransform: 'uppercase', textAlign: 'left', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bomSuggestions.map((s: any) => {
                    const checked = bomSelected.has(s.consumptionGroupId ?? s.itemId);
                    return (
                      <tr key={s.consumptionGroupId ?? s.itemId ?? s.consumptionGroupCode} style={{ opacity: checked ? 1 : 0.4, cursor: 'pointer' }}
                        onClick={() => setBomSelected(prev => { const k = s.consumptionGroupId ?? s.itemId; const n = new Set(prev); checked ? n.delete(k) : n.add(k); return n; })}>
                        <td style={{ padding: '5px 8px', textAlign: 'center' }}>
                          <input type="checkbox" style={{ ...CB_STYLE, accentColor: '#fb923c' }} checked={checked} onChange={() => {}} />
                        </td>
                        <td style={{ padding: '5px 8px', ...MONO, color: '#fb923c', fontSize: 11 }}>{s.consumptionGroupCode ?? s.itemCode ?? '—'}</td>
                        <td style={{ padding: '5px 8px', fontSize: 12, color: '#e2dfd8' }}>{s.consumptionGroupName ?? s.itemName ?? '—'}</td>
                        <td style={{ padding: '5px 8px', ...MONO, color: '#fb923c', textAlign: 'right', fontWeight: 500 }}>{fmtNum(s.qtyPlanned)}</td>
                        <td style={{ padding: '5px 8px', fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{s.uom}</td>
                        <td style={{ padding: '5px 8px', fontSize: 11, color: '#fbbf24' }}>{s.note || '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button onClick={handleConfirmBomSuggestions} disabled={loadingBom || bomSelected.size === 0}
                  style={{ padding: '5px 14px', borderRadius: 6, fontSize: 12, cursor: bomSelected.size > 0 ? 'pointer' : 'not-allowed', color: 'white', background: 'linear-gradient(135deg,#c2410c,#ea580c)', border: 'none', fontFamily: "'IBM Plex Sans',sans-serif", opacity: loadingBom || bomSelected.size === 0 ? 0.5 : 1 }}>
                  {loadingBom ? 'Adding…' : `✓ Add ${bomSelected.size} material${bomSelected.size !== 1 ? 's' : ''}`}
                </button>
                <button onClick={() => { setBomSuggestions(null); setBomSelected(new Set()); }}
                  style={{ padding: '5px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer', color: 'rgba(255,255,255,0.4)', background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.1)', fontFamily: "'IBM Plex Sans',sans-serif" }}>
                  Dismiss
                </button>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>{bomSelected.size} of {bomSuggestions.length} selected</span>
              </div>
            </div>
          )}
          {bomSuggestions && bomSuggestions.length === 0 && (
            <div style={{ fontSize: 12, color: '#fbbf24', marginBottom: 10 }}>No BOM components found for this order.</div>
          )}

          {materialData.actuals.length === 0 ? (
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>No material actuals recorded yet.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>{['Item', 'Planned', 'Actual', 'Variance Qty', 'Unit Cost', 'Variance Cost', 'Notes'].map(h => (
                  <th key={h} style={{ padding: '4px 10px', fontSize: 10, color: 'rgba(251,146,60,0.5)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {materialData.actuals.map(a => {
                  const varQty = a.qtyActual - a.qtyPlanned;
                  return (
                    <tr key={a.id}>
                      <td style={{ padding: '5px 10px' }}>
                        <span style={{ ...MONO, color: '#fb923c', fontSize: 11 }}>{a.item?.code}</span>
                        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginLeft: 8 }}>{a.item?.name}</span>
                      </td>
                      <td style={{ padding: '5px 10px', ...MONO, textAlign: 'right' }}>{fmtNum(a.qtyPlanned)}</td>
                      <td style={{ padding: '5px 10px', ...MONO, color: '#fb923c', textAlign: 'right' }}>{fmtNum(a.qtyActual)}</td>
                      <td style={{ padding: '5px 10px', ...MONO, color: varQty > 0 ? '#f87171' : varQty < 0 ? '#4ade80' : 'rgba(255,255,255,0.3)', textAlign: 'right' }}>{varQty > 0 ? '+' : ''}{fmtNum(varQty)}</td>
                      <td style={{ padding: '5px 10px', ...MONO, textAlign: 'right' }}>{fmtAmt(a.unitCost)}</td>
                      <td style={{ padding: '5px 10px', ...MONO, color: a.varianceCost > 0 ? '#f87171' : a.varianceCost < 0 ? '#4ade80' : 'rgba(255,255,255,0.3)', textAlign: 'right' }}>{fmtAmt(a.varianceCost)}</td>
                      <td style={{ padding: '5px 10px', fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{a.notes || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </>

      ) : tab === 'variances' && varianceData ? (
        <>
          <div style={{ display: 'flex', gap: 16, marginBottom: 10, flexWrap: 'wrap' }}>
            {[
              { label: 'Open',          value: String(varianceData.summary.open),              color: varianceData.summary.open > 0 ? '#fbbf24' : 'rgba(255,255,255,0.3)' },
              { label: 'JE Posted',     value: String(varianceData.summary.jePosted),          color: '#4ade80' },
              { label: 'Merma Cost',    value: fmtAmt(varianceData.summary.totalMermaCost),   color: '#f87171' },
              { label: 'Surplus Value', value: fmtAmt(varianceData.summary.totalSurplusCost), color: '#4ade80' },
              { label: 'Net',           value: fmtAmt(varianceData.summary.netVarianceCost),  color: varianceData.summary.netVarianceCost > 0 ? '#f87171' : '#4ade80' },
            ].map(s => (
              <div key={s.label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{s.label}</span>
                <span style={{ ...MONO, color: s.color, fontSize: 13 }}>{s.value}</span>
              </div>
            ))}
          </div>
          {varianceData.variances.length === 0 ? (
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>No variances for this order.</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>{['Type', 'Description', 'Quantity', 'Unit Cost', 'Total Cost', 'Status', ''].map(h => (
                  <th key={h} style={{ padding: '4px 10px', fontSize: 10, color: 'rgba(248,113,113,0.5)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {varianceData.variances.map((v: Variance) => (
                  <tr key={v.id}>
                    <td style={{ padding: '5px 10px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 7px', borderRadius: 10, fontSize: 11, fontWeight: 500, color: v.varianceType === 'merma' ? '#f87171' : '#4ade80', background: v.varianceType === 'merma' ? 'rgba(248,113,113,0.1)' : 'rgba(74,222,128,0.1)', border: `0.5px solid ${v.varianceType === 'merma' ? 'rgba(248,113,113,0.2)' : 'rgba(74,222,128,0.2)'}` }}>
                        {v.varianceType === 'merma' ? '▼' : '▲'} {v.varianceType}
                      </span>
                    </td>
                    <td style={{ padding: '5px 10px', fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{v.description || '—'}</td>
                    <td style={{ padding: '5px 10px', ...MONO, textAlign: 'right' }}>{v.quantity != null ? fmtNum(v.quantity) : '—'}</td>
                    <td style={{ padding: '5px 10px', ...MONO, textAlign: 'right' }}>{v.unitCost != null ? fmtAmt(v.unitCost) : '—'}</td>
                    <td style={{ padding: '5px 10px', ...MONO, color: v.varianceType === 'merma' ? '#f87171' : '#4ade80', textAlign: 'right', fontWeight: 500 }}>{v.totalCost != null ? fmtAmt(v.totalCost) : '—'}</td>
                    <td style={{ padding: '5px 10px' }}>
                      <span style={{ fontSize: 11, color: v.status === 'open' ? '#fbbf24' : '#4ade80', background: v.status === 'open' ? 'rgba(251,191,36,0.1)' : 'rgba(74,222,128,0.1)', padding: '2px 7px', borderRadius: 10, border: `0.5px solid ${v.status === 'open' ? 'rgba(251,191,36,0.2)' : 'rgba(74,222,128,0.2)'}` }}>{v.status}</span>
                    </td>
                    <td style={{ padding: '5px 10px' }}>
                      {v.status === 'open' && v.totalCost && (
                        <button onClick={() => handlePostJe(v.id)} disabled={postingJe === v.id}
                          style={{ padding: '3px 9px', borderRadius: 6, fontSize: 11, cursor: 'pointer', color: '#60a5fa', background: 'rgba(96,165,250,0.1)', border: '0.5px solid rgba(96,165,250,0.2)', fontFamily: "'IBM Plex Sans',sans-serif", opacity: postingJe === v.id ? 0.5 : 1 }}>
                          {postingJe === v.id ? '…' : 'Post JE'}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      ) : null}
    </div>
  );
}

// ─── MO Row ───────────────────────────────────────────────────────────────────

function MORow({ mo, boms, onStatusChange, actionBusy, onOpenLabor, onOpenDeliver, onRefresh }: {
  mo: ProductionOrder; boms: Bom[];
  onStatusChange: (id: string, status: string) => void;
  actionBusy: string | null;
  onOpenLabor: (mo: ProductionOrder) => void;
  onOpenDeliver: (mo: ProductionOrder) => void;
  onRefresh: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const s = PO_STATUS[mo.status];
  const nextStatus = STATUS_FLOW[mo.status];
  const busy = actionBusy === mo.id;
  const pct = mo.quantityToProduce > 0 ? Math.round((mo.quantityProduced / mo.quantityToProduce) * 100) : 0;
  const isActive = ['released', 'in_progress', 'completed'].includes(mo.status);

  return (
    <>
      <tr style={{ cursor: 'pointer' }} onClick={() => setExpanded(e => !e)}>
        <td>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', transform: expanded ? 'rotate(90deg)' : 'none', display: 'inline-block', transition: 'transform 0.15s' }}>▶</span>
            <span style={{ ...MONO, color: '#fb923c', fontWeight: 500 }}>{mo.poNumber}</span>
          </span>
        </td>
        <td><span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{boms.find(b => b.id === mo.bomId)?.bomNumber ?? '—'}</span></td>
        <td style={{ textAlign: 'right' }}><span style={MONO}>{fmtNum(mo.quantityToProduce)}</span></td>
        <td>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ ...MONO, color: pct >= 100 ? '#4ade80' : '#e2dfd8', fontSize: 11 }}>{fmtNum(mo.quantityProduced)}/{fmtNum(mo.quantityToProduce)}</span>
            <div style={{ width: 52, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.1)', flexShrink: 0 }}>
              <div style={{ width: `${Math.min(pct, 100)}%`, height: '100%', borderRadius: 2, background: pct >= 100 ? '#4ade80' : '#fb923c' }} />
            </div>
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{pct}%</span>
          </div>
        </td>
        <td><span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{fmtDate(mo.plannedStartDate)}</span></td>
        <td><span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{fmtDate(mo.plannedEndDate)}</span></td>
        <td>{mo.priority && <span style={{ fontSize: 11, color: PRIORITY_COLOR[mo.priority] }}>{mo.priority.charAt(0).toUpperCase() + mo.priority.slice(1)}</span>}</td>
        <td>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 9px', borderRadius: 20, fontSize: 11, fontWeight: 500, color: s.color, background: s.bg, border: `0.5px solid ${s.border}`, whiteSpace: 'nowrap' }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: s.color, flexShrink: 0 }} />
            {mo.status.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
          </span>
        </td>
        <td onClick={e => e.stopPropagation()}>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {nextStatus && (
              <button onClick={() => onStatusChange(mo.id, nextStatus)} disabled={busy}
                style={{ padding: '3px 8px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(251,146,60,0.1)', color: '#fb923c', border: '0.5px solid rgba(251,146,60,0.2)', fontFamily: "'IBM Plex Sans',sans-serif", opacity: busy ? 0.5 : 1 }}>
                {busy ? '…' : nextStatus.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}
              </button>
            )}
            {isActive && (
              <>
                <button onClick={() => onOpenLabor(mo)} disabled={busy}
                  style={{ padding: '3px 8px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(167,139,250,0.1)', color: '#a78bfa', border: '0.5px solid rgba(167,139,250,0.2)', fontFamily: "'IBM Plex Sans',sans-serif" }}>
                  + Labor
                </button>
                <button onClick={() => onOpenDeliver(mo)} disabled={busy}
                  style={{ padding: '3px 8px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(74,222,128,0.1)', color: '#4ade80', border: '0.5px solid rgba(74,222,128,0.2)', fontFamily: "'IBM Plex Sans',sans-serif" }}>
                  Deliver FG
                </button>
              </>
            )}
            {mo.status !== 'completed' && mo.status !== 'cancelled' && (
              <button onClick={() => onStatusChange(mo.id, 'cancelled')} disabled={busy}
                style={{ padding: '3px 8px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(248,113,113,0.08)', color: '#f87171', border: '0.5px solid rgba(248,113,113,0.2)', fontFamily: "'IBM Plex Sans',sans-serif", opacity: busy ? 0.5 : 1 }}>
                Cancel
              </button>
            )}
            <PrintButton doc="production-order" id={mo.id} label="" style={{ padding: '3px 7px' }} />
          </div>
        </td>
      </tr>
      {expanded && (
        <tr>
          <td colSpan={9} style={{ padding: 0 }}>
            <ActualsPanel mo={mo} onRefresh={onRefresh} />
          </td>
        </tr>
      )}
    </>
  );
}

// ─── Create MO Modal ──────────────────────────────────────────────────────────

function MOModal({ boms, onClose, onSaved }: { boms: Bom[]; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({ bomId: '', quantityToProduce: '', plannedStartDate: '', plannedEndDate: '', priority: '' as ProductionPriority | '', notes: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setForm(f => ({ ...f, [k]: e.target.value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.bomId || !form.quantityToProduce) { setError('BOM and quantity required.'); return; }
    setBusy(true); setError('');
    try {
      await productionOrdersApi.create({ bomId: form.bomId, quantityOrdered: Number(form.quantityToProduce), plannedStartDate: form.plannedStartDate || undefined, plannedEndDate: form.plannedEndDate || undefined, priority: form.priority || undefined, notes: form.notes || undefined });
      onSaved(); onClose();
    } catch (err) { setError((err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Failed.'); }
    finally { setBusy(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#0e0b1a', border: '0.5px solid rgba(251,146,60,0.2)', borderRadius: 14, width: '100%', maxWidth: 520, position: 'relative', boxShadow: '0 24px 60px rgba(0,0,0,0.7)' }}>
        <div style={{ position: 'absolute', top: 0, left: 30, right: 30, height: 1, background: 'linear-gradient(90deg,transparent,rgba(251,146,60,0.4),transparent)' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 12px', borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: '#f1ede8', fontFamily: "'IBM Plex Sans',sans-serif" }}>New Production Order</span>
          <button onClick={onClose} style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.45)', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '0.5px solid rgba(239,68,68,0.25)', borderRadius: 7, padding: '8px 12px', fontSize: 12, color: '#fca5a5' }}>{error}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 10 }}>
              <Field label="BOM *"><select style={INPUT} value={form.bomId} onChange={set('bomId')}><option value="">— Select BOM —</option>{boms.map(b => <option key={b.id} value={b.id}>{b.bomNumber} — {b.parentItem?.name}</option>)}</select></Field>
              <Field label="Qty To Produce *"><input style={INPUT} type="number" min="1" placeholder="100" value={form.quantityToProduce} onChange={set('quantityToProduce')} required /></Field>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
              <Field label="Planned Start"><input style={INPUT} type="date" value={form.plannedStartDate} onChange={set('plannedStartDate')} /></Field>
              <Field label="Planned End"><input style={INPUT} type="date" value={form.plannedEndDate} onChange={set('plannedEndDate')} /></Field>
              <Field label="Priority"><select style={INPUT} value={form.priority} onChange={set('priority')}><option value="">— None —</option>{['low', 'medium', 'high', 'urgent'].map(p => <option key={p} value={p}>{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}</select></Field>
            </div>
            <Field label="Notes"><input style={INPUT} placeholder="Optional notes" value={form.notes} onChange={set('notes')} /></Field>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px 18px', borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
            <button type="button" onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '8px 16px', fontSize: 13, fontFamily: "'IBM Plex Sans',sans-serif", color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>Cancel</button>
            <button type="submit" disabled={busy} style={{ background: 'linear-gradient(135deg,#c2410c,#ea580c,#f97316)', border: 'none', borderRadius: 7, padding: '8px 20px', fontSize: 13, fontWeight: 500, fontFamily: "'IBM Plex Sans',sans-serif", color: 'white', cursor: 'pointer', boxShadow: '0 3px 12px rgba(234,88,12,0.35)', opacity: busy ? 0.5 : 1 }}>{busy ? 'Creating…' : 'Create'}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ProductionOrdersPage() {
  const [list,         setList]         = useState<ProductionOrder[]>([]);
  const [boms,         setBoms]         = useState<Bom[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [statusFilter, setStatusFilter] = useState<ProductionOrderStatus | ''>('');
  const [modalOpen,    setModalOpen]    = useState(false);
  const [laborMo,      setLaborMo]      = useState<ProductionOrder | null>(null);
  const [deliverMo,    setDeliverMo]    = useState<ProductionOrder | null>(null);
  const [actionBusy,   setActionBusy]   = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    try {
      setLoading(true);
      setList(extractList<ProductionOrder>(await productionOrdersApi.getAll()));
    } catch (err) { setError(err instanceof Error ? err.message : 'Load failed.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchOrders();
    bomApi.getAll().then(raw => setBoms(extractList<Bom>(raw as unknown))).catch(() => {});
  }, [fetchOrders]);

  const filtered = list.filter(o => !statusFilter || o.status === statusFilter);

  const handleStatusChange = async (id: string, status: string) => {
    setActionBusy(id);
    try { await productionOrdersApi.updateStatus(id, status as ProductionOrderStatus); fetchOrders(); }
    catch (err) { setError((err as { response?: { data?: { message?: string } } }).response?.data?.message || 'Status update failed.'); }
    finally { setActionBusy(null); }
  };

  // spec-frontend-002 adoption — only the destructive 'cancelled' transition is
  // guarded; forward transitions (released→in_progress→completed) stay direct.
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const onStatusChange = (id: string, status: string) =>
    status === 'cancelled' ? setConfirmCancelId(id) : handleStatusChange(id, status);

  const counts = Object.keys(PO_STATUS).reduce((acc, s) => ({ ...acc, [s]: list.filter(o => o.status === s).length }), {} as Record<string, number>);

  return (
    <ERPShell breadcrumbs={['Home', 'Manufacturing', 'Production Orders']} title="Production Orders">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap');
        .mo-page { padding: 0 18px 24px; }
        .mo-stats { display:flex; gap:10px; margin-bottom:14px; flex-wrap:wrap; }
        .mo-stat { background:rgba(10,7,18,0.7); border-radius:8px; padding:7px 12px; display:flex; flex-direction:column; gap:2px; min-width:80px; cursor:pointer; transition:opacity 0.15s; }
        .mo-stat:hover { opacity:0.8; }
        .mo-stat-label { font-size:10px; font-weight:500; letter-spacing:0.08em; text-transform:uppercase; }
        .mo-stat-value { font-size:20px; font-weight:500; font-family:'IBM Plex Mono',monospace; color:#f1ede8; }
        .mo-toolbar { display:flex; align-items:center; gap:10px; margin-bottom:14px; flex-wrap:wrap; }
        .mo-filter { background:rgba(255,255,255,0.04); border:0.5px solid rgba(255,255,255,0.09); border-radius:7px; padding:7px 12px; font-size:12px; font-family:'IBM Plex Sans',sans-serif; color:#e2dfd8; outline:none; }
        .mo-filter option { background:#0e0b1a; color:#f1ede8; }
        .mo-btn-new { display:flex; align-items:center; gap:6px; margin-left:auto; background:linear-gradient(135deg,#c2410c,#ea580c,#f97316); border:none; border-radius:7px; padding:7px 14px; font-size:12px; font-weight:500; font-family:'IBM Plex Sans',sans-serif; color:white; cursor:pointer; box-shadow:0 3px 12px rgba(234,88,12,0.3); flex-shrink:0; }
        .mo-btn-new svg { width:13px; height:13px; display:block; flex-shrink:0; }
        .mo-wrap { background:rgba(10,7,18,0.7); border:0.5px solid rgba(251,146,60,0.12); border-radius:10px; overflow:hidden; }
        .mo-table { width:100%; border-collapse:collapse; }
        .mo-table thead th { padding:9px 14px; font-size:10px; font-weight:500; letter-spacing:0.1em; text-transform:uppercase; color:rgba(251,146,60,0.55); background:rgba(251,146,60,0.05); border-bottom:0.5px solid rgba(255,255,255,0.06); text-align:left; white-space:nowrap; }
        .mo-table tbody td { padding:10px 14px; border-bottom:0.5px solid rgba(255,255,255,0.04); vertical-align:middle; font-size:13px; }
        .mo-table tbody tr:last-child td { border-bottom:none; }
        .mo-table tbody tr:hover td { background:rgba(251,146,60,0.03); }
        .mo-empty, .mo-loading { text-align:center; padding:52px 24px; color:rgba(255,255,255,0.25); font-size:13px; }
        .mo-footer { font-size:11px; color:rgba(255,255,255,0.22); padding:8px 14px; border-top:0.5px solid rgba(255,255,255,0.04); }
        .mo-error { background:rgba(239,68,68,0.08); border:0.5px solid rgba(239,68,68,0.2); border-radius:8px; padding:10px 14px; margin-bottom:14px; font-size:13px; color:#fca5a5; }
      `}</style>

      <div className="mo-page">
        {list.length > 0 && (
          <div className="mo-stats">
            {(Object.entries(PO_STATUS) as [ProductionOrderStatus, typeof PO_STATUS[ProductionOrderStatus]][]).map(([s, style]) => (
              <div key={s} className="mo-stat" style={{ border: `0.5px solid ${statusFilter === s ? style.border : 'rgba(255,255,255,0.07)'}` }} onClick={() => setStatusFilter(prev => prev === s ? '' : s)}>
                <span className="mo-stat-label" style={{ color: style.color }}>{s.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</span>
                <span className="mo-stat-value">{counts[s] ?? 0}</span>
              </div>
            ))}
            <div className="mo-stat" style={{ border: `0.5px solid ${!statusFilter ? 'rgba(251,146,60,0.3)' : 'rgba(255,255,255,0.07)'}` }} onClick={() => setStatusFilter('')}>
              <span className="mo-stat-label" style={{ color: 'rgba(251,146,60,0.6)' }}>Total</span>
              <span className="mo-stat-value" style={{ color: '#fb923c' }}>{list.length}</span>
            </div>
          </div>
        )}
        <div className="mo-toolbar">
          <select className="mo-filter" value={statusFilter} onChange={e => setStatusFilter(e.target.value as ProductionOrderStatus | '')}>
            <option value="">All Status</option>
            {(Object.keys(PO_STATUS) as ProductionOrderStatus[]).map(s => <option key={s} value={s}>{s.replace('_', ' ').replace(/\b\w/g, c => c.toUpperCase())}</option>)}
          </select>
          <button className="mo-btn-new" onClick={() => setModalOpen(true)}>
            <svg viewBox="0 0 13 13" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round"><line x1="6.5" y1="1" x2="6.5" y2="12" /><line x1="1" y1="6.5" x2="12" y2="6.5" /></svg>
            New Production Order
          </button>
        </div>
        {error && <div className="mo-error">{error}</div>}
        <div className="mo-wrap">
          {loading ? <div className="mo-loading">Loading…</div>
            : filtered.length === 0 ? <div className="mo-empty">{statusFilter ? 'No orders match.' : 'No production orders yet.'}</div>
            : (
              <>
                <table className="mo-table">
                  <thead>
                    <tr>{['MO Number', 'BOM', 'Qty To Produce', 'Progress', 'Planned Start', 'Planned End', 'Priority', 'Status', ''].map(h => <th key={h}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {filtered.map(mo => (
                      <MORow key={mo.id} mo={mo} boms={boms} onStatusChange={onStatusChange} actionBusy={actionBusy} onOpenLabor={setLaborMo} onOpenDeliver={setDeliverMo} onRefresh={fetchOrders} />
                    ))}
                  </tbody>
                </table>
                <div className="mo-footer">{filtered.length} of {list.length} order{list.length !== 1 ? 's' : ''}</div>
              </>
            )}
        </div>
      </div>

      {modalOpen  && <MOModal    boms={boms} onClose={() => setModalOpen(false)}  onSaved={fetchOrders} />}
      {laborMo    && <LaborModal mo={laborMo}   onClose={() => setLaborMo(null)}   onSaved={fetchOrders} />}
      {deliverMo  && <DeliverModal mo={deliverMo} onClose={() => setDeliverMo(null)} onSaved={fetchOrders} />}

      <ConfirmModal
        open={!!confirmCancelId}
        onClose={() => setConfirmCancelId(null)}
        title="Cancel production order?"
        description="This cancels the manufacturing order. It cannot be undone."
        variant="destructive"
        confirmLabel="Cancel MO"
        cancelLabel="Keep MO"
        onConfirm={async () => { if (confirmCancelId) await handleStatusChange(confirmCancelId, 'cancelled'); }}
      />
    </ERPShell>
  );
}