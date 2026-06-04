"use client";
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import SearchSelect from '@/components/ui/SearchSelect';
import { ERPTreeTable, ERPTreeColumn } from '@/components/ui/ERPTreeTable';
import { bomApi } from '@/lib/api/bom';
import { itemsApi } from '@/lib/api/items';
import { consumptionGroupsApi } from '@/lib/api/consumption-groups';
import { tenantSettingsApi } from '@/lib/api/tenant-settings';
import { Item } from '@/lib/api/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface UomUnit { id: string; code: string; name: string; type: string; system: string }

interface BomComponent {
  id: string; lineNumber: number; consumptionGroupId: string;
  consumptionGroup?: { id: string; code: string; name: string; description?: string; consumptionUom?: { code: string; name: string; type: string } };
  quantityPer: number; uom: string; scrapPercent?: number; isPhantom?: boolean;
  consumptionUomId?: string;
  consumptionUom?: { id: string; code: string; name: string; type: string };
}

interface RoutingStep {
  id: string; stepNumber: number; description?: string;
  workCenterId: string;
  workCenter?: { id: string; code: string; name: string; costPerHour?: number };
  setupTime: number; runTimePerUnit: number; isActive: boolean; notes?: string;
}

interface Bom {
  id: string; bomNumber: string; parentItemId: string;
  parentItem?: { id: string; code: string; name: string; baseUom: string };
  version?: number; isActive: boolean;
  components?: BomComponent[];
  routings?: RoutingStep[];
  _count?: { components: number; routings: number };
  createdAt: string;
}

interface WorkCenter { id: string; code: string; name: string; costPerHour?: number }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function extractList<T>(data: unknown): T[] {
  if (Array.isArray(data)) return data as T[];
  const d = data as Record<string, unknown>;
  if (d?.value && Array.isArray(d.value)) return d.value as T[];
  return [];
}

function fmtAmt(v: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(v);
}

const UOM_COLOR: Record<string, string> = {
  volume: '#60a5fa', mass: '#a78bfa', count: '#4ade80', length: '#fbbf24', area: '#fb923c',
};

const MONO: React.CSSProperties = { fontFamily: "'IBM Plex Mono',monospace", fontSize: 12 };
const INPUT: React.CSSProperties = { background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '9px 12px', fontSize: 13, fontFamily: "'IBM Plex Sans',sans-serif", color: '#f1ede8', outline: 'none', width: '100%' };

function Field({ label, color, children }: { label: string; color?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <label style={{ fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: color ?? 'rgba(251,146,60,0.6)', fontFamily: "'IBM Plex Sans',sans-serif" }}>{label}</label>
      {children}
    </div>
  );
}

function UomSystemBadge({ uom }: { uom?: { code: string; name: string; type: string } | null }) {
  if (!uom) return <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11 }}>—</span>;
  const color = UOM_COLOR[uom.type] ?? '#e2dfd8';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 500, color, background: `${color}15`, border: `0.5px solid ${color}35` }}>
      {uom.code}
    </span>
  );
}

// ─── Add Routing Step Modal ───────────────────────────────────────────────────

function AddRoutingModal({ bomId, workCenters, onClose, onSaved }: {
  bomId: string; workCenters: WorkCenter[]; onClose: () => void; onSaved: () => void;
}) {
  const [form, setForm] = useState({ stepNumber: '', workCenterId: '', description: '', setupTime: '0', runTimePerUnit: '0', notes: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.stepNumber || !form.workCenterId) { setError('Step number and work center required'); return; }
    setBusy(true); setError('');
    try {
      await bomApi.addRoutingStep(bomId, {
        stepNumber: Number(form.stepNumber), workCenterId: form.workCenterId,
        description: form.description || undefined,
        setupTime: Number(form.setupTime) || 0, runTimePerUnit: Number(form.runTimePerUnit) || 0,
        notes: form.notes || undefined,
      });
      onSaved(); onClose();
    } catch (err) {
      setError((err as any).response?.data?.message || 'Failed');
    } finally { setBusy(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#0e0b1a', border: '0.5px solid rgba(96,165,250,0.2)', borderRadius: 14, width: '100%', maxWidth: 480, boxShadow: '0 24px 60px rgba(0,0,0,0.7)' }}>
        <div style={{ padding: '14px 18px 10px', borderBottom: '0.5px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: 13, fontWeight: 500, color: '#f1ede8' }}>Add Routing Step</span>
          <button onClick={onClose} style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.45)', fontSize: 16 }}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '0.5px solid rgba(239,68,68,0.25)', borderRadius: 7, padding: '7px 12px', fontSize: 12, color: '#fca5a5' }}>{error}</div>}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 10 }}>
              <Field label="Step #" color="rgba(96,165,250,0.6)">
                <input type="number" min="1" style={INPUT} value={form.stepNumber} onChange={e => setForm(f => ({ ...f, stepNumber: e.target.value }))} />
              </Field>
              <Field label="Work Center *" color="rgba(96,165,250,0.6)">
                <select style={{ ...INPUT, cursor: 'pointer' }} value={form.workCenterId} onChange={e => setForm(f => ({ ...f, workCenterId: e.target.value }))}>
                  <option value="">— Select —</option>
                  {workCenters.map(wc => <option key={wc.id} value={wc.id}>{wc.code} — {wc.name}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Description" color="rgba(96,165,250,0.6)">
              <input placeholder="e.g. Prep & Mix" style={INPUT} value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            </Field>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <Field label="Setup Time (hrs)" color="rgba(96,165,250,0.6)">
                <input type="number" min="0" step="0.001" style={INPUT} value={form.setupTime} onChange={e => setForm(f => ({ ...f, setupTime: e.target.value }))} />
              </Field>
              <Field label="Run Time / Unit (hrs)" color="rgba(96,165,250,0.6)">
                <input type="number" min="0" step="0.000001" style={INPUT} value={form.runTimePerUnit} onChange={e => setForm(f => ({ ...f, runTimePerUnit: e.target.value }))} />
              </Field>
            </div>
            <Field label="Notes" color="rgba(96,165,250,0.6)">
              <input placeholder="Optional" style={INPUT} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </Field>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '10px 18px 16px', borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
            <button type="button" onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '7px 14px', fontSize: 12, fontFamily: "'IBM Plex Sans',sans-serif", color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>Cancel</button>
            <button type="submit" disabled={busy} style={{ background: 'linear-gradient(135deg,#1e3a8a,#1d4ed8,#3b82f6)', border: 'none', borderRadius: 7, padding: '7px 18px', fontSize: 12, fontWeight: 500, fontFamily: "'IBM Plex Sans',sans-serif", color: 'white', cursor: 'pointer', opacity: busy ? 0.5 : 1 }}>
              {busy ? 'Adding…' : 'Add Step'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── BOM Detail Panel (expanded row) ─────────────────────────────────────────

function BomDetailPanel({ bom, workCenters, onRefresh }: {
  bom: Bom; workCenters: WorkCenter[]; onRefresh: () => void;
}) {
  const [tab, setTab] = useState<'components' | 'routing'>('components');
  const [routingSteps, setRoutingSteps] = useState<RoutingStep[]>([]);
  const [loadingRouting, setLoadingRouting] = useState(false);
  const [estimateQty, setEstimateQty] = useState('1000');
  const [estimate, setEstimate] = useState<any>(null);
  const [loadingEstimate, setLoadingEstimate] = useState(false);
  const [addRoutingOpen, setAddRoutingOpen] = useState(false);
  const [deletingStep, setDeletingStep] = useState<string | null>(null);

  const loadRouting = useCallback(async () => {
    setLoadingRouting(true);
    try { setRoutingSteps(Array.isArray(await bomApi.getRouting(bom.id)) ? await bomApi.getRouting(bom.id) as RoutingStep[] : []); }
    finally { setLoadingRouting(false); }
  }, [bom.id]);

  useEffect(() => { if (tab === 'routing') loadRouting(); }, [tab, loadRouting]);

  const handleEstimate = async () => {
    const qty = Number(estimateQty); if (!qty || qty <= 0) return;
    setLoadingEstimate(true);
    try { setEstimate(await bomApi.getLaborEstimate(bom.id, qty)); } finally { setLoadingEstimate(false); }
  };

  const handleDeleteStep = async (stepId: string) => {
    setDeletingStep(stepId);
    try { await bomApi.removeRoutingStep(bom.id, stepId); await loadRouting(); } finally { setDeletingStep(null); }
  };

  const TAB = (active: boolean, color: string): React.CSSProperties => ({
    padding: '5px 12px', borderRadius: 6, fontSize: 11, fontWeight: 500,
    cursor: 'pointer', border: 'none', fontFamily: "'IBM Plex Sans',sans-serif",
    color: active ? color : 'rgba(255,255,255,0.35)',
    background: active ? `${color}18` : 'transparent',
  });

  return (
    <div style={{ padding: '10px 40px 16px', background: 'rgba(251,146,60,0.015)', borderTop: '0.5px solid rgba(255,255,255,0.04)' }}>
      <div style={{ display: 'flex', gap: 4, marginBottom: 12 }}>
        <button style={TAB(tab === 'components', '#fb923c')} onClick={() => setTab('components')}>
          📋 Components ({bom.components?.length ?? bom._count?.components ?? 0})
        </button>
        <button style={TAB(tab === 'routing', '#60a5fa')} onClick={() => setTab('routing')}>
          ⚙ Routing ({routingSteps.length || bom._count?.routings || 0})
        </button>
      </div>

      {tab === 'components' && (
        bom.components && bom.components.length > 0 ? (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>{['#', 'Consumption Group', 'Qty Per', 'UOM (formulador)', 'Cons. UOM (MRP)', 'Scrap %', 'Phantom'].map(h => (
                <th key={h} style={{ padding: '6px 12px 6px 0', fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {bom.components.map(comp => (
                <tr key={comp.id}>
                  <td style={{ padding: '7px 12px 7px 0', fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{comp.lineNumber}</td>
                  <td style={{ padding: '7px 12px 7px 0' }}>
                    <span style={{ ...MONO, color: '#fb923c', fontSize: 11 }}>{comp.consumptionGroup?.code}</span>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginLeft: 8 }}>{comp.consumptionGroup?.name}</span>
                  </td>
                  <td style={{ padding: '7px 12px 7px 0', ...MONO, color: '#e2dfd8' }}>{comp.quantityPer}</td>
                  <td style={{ padding: '7px 12px 7px 0' }}>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', fontFamily: "'IBM Plex Mono',monospace" }}>{comp.uom}</span>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', marginLeft: 6 }}>libre</span>
                  </td>
                  <td style={{ padding: '7px 12px 7px 0' }}>
                    <UomSystemBadge uom={comp.consumptionUom ?? comp.consumptionGroup?.consumptionUom} />
                    {!comp.consumptionUom && !comp.consumptionGroup?.consumptionUom && (
                      <span style={{ fontSize: 10, color: 'rgba(251,191,36,0.6)', marginLeft: 6 }}>⚠ no configurado</span>
                    )}
                  </td>
                  <td style={{ padding: '7px 12px 7px 0', fontSize: 12, color: (comp.scrapPercent ?? 0) > 0 ? '#fbbf24' : 'rgba(255,255,255,0.25)' }}>{comp.scrapPercent ? `${comp.scrapPercent}%` : '—'}</td>
                  <td style={{ padding: '7px 12px 7px 0', fontSize: 11, color: comp.isPhantom ? '#60a5fa' : 'rgba(255,255,255,0.25)' }}>{comp.isPhantom ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>No components defined.</div>
        )
      )}

      {tab === 'routing' && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>Production steps for this BOM</span>
            <button onClick={() => setAddRoutingOpen(true)}
              style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', color: '#60a5fa', background: 'rgba(96,165,250,0.1)', border: '0.5px solid rgba(96,165,250,0.2)', fontFamily: "'IBM Plex Sans',sans-serif" }}>
              + Add Step
            </button>
          </div>
          {loadingRouting ? <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Loading…</div>
          : routingSteps.length === 0 ? <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', marginBottom: 12 }}>No routing steps yet.</div>
          : (
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 14 }}>
              <thead>
                <tr>{['Step', 'Description', 'Work Center', 'Setup (h)', 'Run/Unit (h)', 'Rate/hr', ''].map(h => (
                  <th key={h} style={{ padding: '4px 10px', fontSize: 10, color: 'rgba(96,165,250,0.5)', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', borderBottom: '0.5px solid rgba(255,255,255,0.04)' }}>{h}</th>
                ))}</tr>
              </thead>
              <tbody>
                {routingSteps.map(step => (
                  <tr key={step.id}>
                    <td style={{ padding: '6px 10px', ...MONO, color: '#60a5fa', textAlign: 'center', width: 40 }}>{step.stepNumber}</td>
                    <td style={{ padding: '6px 10px', fontSize: 12, color: '#e2dfd8' }}>{step.description || '—'}</td>
                    <td style={{ padding: '6px 10px' }}>
                      <span style={{ ...MONO, color: '#fb923c', fontSize: 11 }}>{step.workCenter?.code}</span>
                      <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', marginLeft: 6 }}>{step.workCenter?.name}</span>
                    </td>
                    <td style={{ padding: '6px 10px', ...MONO, textAlign: 'right' }}>{step.setupTime}</td>
                    <td style={{ padding: '6px 10px', ...MONO, textAlign: 'right' }}>{step.runTimePerUnit}</td>
                    <td style={{ padding: '6px 10px', ...MONO, textAlign: 'right', color: 'rgba(255,255,255,0.45)' }}>
                      {step.workCenter?.costPerHour ? fmtAmt(Number(step.workCenter.costPerHour)) : '—'}
                    </td>
                    <td style={{ padding: '6px 10px' }}>
                      <button onClick={() => handleDeleteStep(step.id)} disabled={deletingStep === step.id}
                        style={{ padding: '3px 8px', borderRadius: 5, fontSize: 11, cursor: 'pointer', color: '#f87171', background: 'rgba(248,113,113,0.08)', border: '0.5px solid rgba(248,113,113,0.15)', fontFamily: "'IBM Plex Sans',sans-serif", opacity: deletingStep === step.id ? 0.5 : 1 }}>
                        {deletingStep === step.id ? '…' : 'Del'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {/* Labor Estimate */}
          <div style={{ background: 'rgba(96,165,250,0.04)', border: '0.5px solid rgba(96,165,250,0.12)', borderRadius: 8, padding: '10px 14px' }}>
            <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(96,165,250,0.5)', marginBottom: 8 }}>Labor Estimate Calculator</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <input type="number" min="1" value={estimateQty} onChange={e => setEstimateQty(e.target.value)} style={{ ...INPUT, width: 120, padding: '6px 10px', fontSize: 12 }} placeholder="Quantity" />
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>units</span>
              <button onClick={handleEstimate} disabled={loadingEstimate || routingSteps.length === 0}
                style={{ padding: '6px 14px', borderRadius: 6, fontSize: 12, cursor: 'pointer', color: '#60a5fa', background: 'rgba(96,165,250,0.1)', border: '0.5px solid rgba(96,165,250,0.2)', fontFamily: "'IBM Plex Sans',sans-serif", opacity: loadingEstimate ? 0.5 : 1 }}>
                {loadingEstimate ? 'Calculating…' : 'Calculate'}
              </button>
            </div>
            {estimate && (
              <div style={{ marginTop: 10, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                {[
                  { label: 'Setup Hours', value: `${estimate.totalSetupHours}h`, color: 'rgba(255,255,255,0.5)' },
                  { label: 'Run Hours',   value: `${estimate.totalRunHours}h`,   color: '#a78bfa' },
                  { label: 'Total Hours', value: `${estimate.totalLaborHours}h`, color: '#60a5fa' },
                  { label: 'Est. Cost',   value: fmtAmt(estimate.estimatedLaborCost), color: '#4ade80' },
                ].map(s => (
                  <div key={s.label} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{s.label}</span>
                    <span style={{ ...MONO, color: s.color, fontSize: 14 }}>{s.value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {addRoutingOpen && (
        <AddRoutingModal bomId={bom.id} workCenters={workCenters}
          onClose={() => setAddRoutingOpen(false)}
          onSaved={() => { loadRouting(); onRefresh(); }}
        />
      )}
    </div>
  );
}

// ─── Create BOM Modal ─────────────────────────────────────────────────────────

interface CompRow {
  consumptionGroupId: string;
  quantityPer: string;
  uom: string;              // formulador libre
  consumptionUomId: string; // system UOM — auto-filled from group
  scrapPercent: string;
}

function BOMModal({ items, consumptionGroups, systemUoms, allUoms, onClose, onSaved }: {
  items: Item[];
  consumptionGroups: any[];
  systemUoms: UomUnit[];
  allUoms: UomUnit[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState({ parentItemId: '', bomNumber: '', version: '1' });
  const [components, setComponents] = useState<CompRow[]>([
    { consumptionGroupId: '', quantityPer: '', uom: '', consumptionUomId: '', scrapPercent: '0' },
  ]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const setComp = (idx: number, k: keyof CompRow, v: string) =>
    setComponents(cs => cs.map((c, i) => {
      if (i !== idx) return c;
      const updated = { ...c, [k]: v };
      // When selecting consumption group: auto-fill consumptionUomId from group
      if (k === 'consumptionGroupId') {
        const cg = consumptionGroups.find(x => x.id === v) as any;
        if (cg) {
          updated.consumptionUomId = cg.consumptionUomId ?? '';
          updated.uom = ''; // reset formulador UOM — must match new group's dimension
        }
      }
      return updated;
    }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.parentItemId) { setError('Parent item required.'); return; }
    const validComps = components.filter(c => c.consumptionGroupId && c.quantityPer);
    if (validComps.length === 0) { setError('At least one component required.'); return; }
    setBusy(true); setError('');
    try {
      await bomApi.create({
        parentItemId: form.parentItemId,
        bomNumber: form.bomNumber || undefined,
        version: Number(form.version) || 1,
        isActive: true,
        components: validComps.map((c, i) => {
          // uom is stored as UomUnit id — resolve to code for backend
          const uomUnit = allUoms.find(u => u.id === c.uom);
          return {
            consumptionGroupId: c.consumptionGroupId,
            quantity:           Number(c.quantityPer),
            uom:                uomUnit?.code ?? c.uom,
            consumptionUomId:   c.consumptionUomId || undefined,
            scrapPercent:       Number(c.scrapPercent) || undefined,
            lineNumber:         i + 1,
          };
        }),
      });
      onSaved(); onClose();
    } catch (err) { setError((err as any).response?.data?.message || 'Failed.'); }
    finally { setBusy(false); }
  };

  const itemOpts = items.filter(i => i.isManufacturable).map(i => ({ value: i.id, label: `${i.code} — ${i.name}` }));
  const cgOpts   = consumptionGroups.map((cg: any) => ({
    value:    cg.id,
    label:    `${cg.code} — ${cg.name}`,
    sublabel: cg.consumptionUom ? `${cg.consumptionUom.code} · ${cg.consumptionUom.type}` : undefined,
  }));
  const allUomOpts = allUoms.map(u => ({
    value:    u.id,
    label:    `${u.code} — ${u.name}`,
    sublabel: `${u.type} · ${u.system}`,
  }));
  const sysUomOpts = systemUoms.map(u => ({ value: u.id, label: `${u.code} — ${u.name}`, sublabel: `${u.type} · system` }));

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: 20, overflowY: 'auto' }}>
      <div style={{ background: '#0e0b1a', border: '0.5px solid rgba(251,146,60,0.2)', borderRadius: 14, width: '100%', maxWidth: 800, margin: 'auto', position: 'relative', boxShadow: '0 24px 60px rgba(0,0,0,0.7)' }}>
        <div style={{ position: 'absolute', top: 0, left: 30, right: 30, height: 1, background: 'linear-gradient(90deg,transparent,rgba(251,146,60,0.4),transparent)' }} />
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 20px 12px', borderBottom: '0.5px solid rgba(255,255,255,0.06)', position: 'sticky', top: 0, background: '#0e0b1a', zIndex: 1, borderRadius: '14px 14px 0 0' }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: '#f1ede8', fontFamily: "'IBM Plex Sans',sans-serif" }}>New Bill of Materials</span>
          <button onClick={onClose} style={{ width: 24, height: 24, borderRadius: 6, background: 'rgba(255,255,255,0.06)', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.45)', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
        </div>
        <form onSubmit={handleSubmit}>
          <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {error && <div style={{ background: 'rgba(239,68,68,0.1)', border: '0.5px solid rgba(239,68,68,0.25)', borderRadius: 7, padding: '8px 12px', fontSize: 12, color: '#fca5a5' }}>{error}</div>}

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: 10 }}>
              <Field label="Parent Item *">
                <SearchSelect options={itemOpts} value={form.parentItemId}
                  onChange={v => setForm(f => ({ ...f, parentItemId: v }))}
                  placeholder="Search manufacturable item…" clearLabel="— Select —" minWidth={260} />
              </Field>
              <Field label="BOM Number">
                <input style={INPUT} placeholder="BOM-001" value={form.bomNumber} onChange={e => setForm(f => ({ ...f, bomNumber: e.target.value }))} />
              </Field>
              <Field label="Version">
                <input style={INPUT} type="number" min="1" value={form.version} onChange={e => setForm(f => ({ ...f, version: e.target.value }))} />
              </Field>
            </div>

            {/* System UOM info box */}
            {systemUoms.length === 0 && (
              <div style={{ background: 'rgba(251,191,36,0.07)', border: '0.5px solid rgba(251,191,36,0.2)', borderRadius: 7, padding: '8px 12px', fontSize: 12, color: 'rgba(251,191,36,0.8)', display: 'flex', gap: 8 }}>
                <span>⚠</span>
                <span>No system UOMs configured. Go to <strong>Settings → General</strong> to configure them first. The Consumption UOM column will be empty.</span>
              </div>
            )}

            <div style={{ fontSize: 10, fontWeight: 500, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)', padding: '4px 0 2px', borderBottom: '0.5px solid rgba(255,255,255,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>Components</span>
              <button type="button"
                onClick={() => setComponents(cs => [...cs, { consumptionGroupId: '', quantityPer: '', uom: '', consumptionUomId: '', scrapPercent: '0' }])}
                style={{ background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 5, padding: '3px 10px', fontSize: 11, color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif" }}>
                + Add row
              </button>
            </div>

            {/* Components table header */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 80px 1fr 1fr 70px 24px', gap: 6 }}>
              {['Consumption Group', 'Qty Per *', 'UOM Formulador', 'Cons. UOM (MRP)', 'Scrap %', ''].map(h => (
                <span key={h} style={{ fontSize: 10, color: 'rgba(251,146,60,0.5)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '2px 0' }}>{h}</span>
              ))}
            </div>

            {/* Component rows */}
            {components.map((c, idx) => {
              const selCg = consumptionGroups.find(g => g.id === c.consumptionGroupId) as any;
              const cgConsUom = selCg?.consumptionUom ?? null;
              const cgType = cgConsUom?.type ?? null;

              // UOM formulador restringido a la misma dimensión del grupo
              const filteredUomOpts = cgType
                ? allUomOpts.filter(u => allUoms.find(x => x.id === u.value)?.type === cgType)
                : allUomOpts;
              return (
                <div key={idx} style={{ display: 'grid', gridTemplateColumns: '2fr 80px 1fr 1fr 70px 24px', gap: 6, alignItems: 'start' }}>

                  {/* Consumption Group — editable SearchSelect */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <SearchSelect
                      options={cgOpts}
                      value={c.consumptionGroupId}
                      onChange={v => setComp(idx, 'consumptionGroupId', v)}
                      placeholder="Search group…"
                      clearLabel="— Select group —"
                      minWidth={200}
                    />
                  </div>

                  {/* Qty Per */}
                  <input style={{ ...INPUT, fontSize: 12, padding: '7px 8px', textAlign: 'right' }}
                    type="number" min="0" step="0.001" placeholder="1"
                    value={c.quantityPer} onChange={e => setComp(idx, 'quantityPer', e.target.value)} />

                  {/* UOM formulador — SearchSelect filtrado por dimensión del grupo */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <SearchSelect
                      options={filteredUomOpts}
                      value={c.uom}
                      onChange={v => setComp(idx, 'uom', v)}
                      placeholder={cgType ? `UOM (${cgType})…` : 'Selecciona grupo primero…'}
                      clearLabel="— UOM —"
                      minWidth={140}
                    />
                    {!cgType && (
                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>Selecciona un grupo para ver UOMs disponibles</span>
                    )}
                    {cgType && filteredUomOpts.length === 0 && (
                      <span style={{ fontSize: 10, color: 'rgba(251,191,36,0.5)' }}>⚠ No hay UOMs de tipo {cgType}</span>
                    )}
                  </div>

                  {/* Cons. UOM — BLOQUEADO, auto-fill del grupo */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.06)', borderRadius: 7, minHeight: 34 }}>
                    {cgConsUom ? (
                      <>
                        <span style={{ width: 6, height: 6, borderRadius: '50%', background: UOM_COLOR[cgConsUom.type] ?? '#e2dfd8', flexShrink: 0 }} />
                        <span style={{ fontSize: 12, fontFamily: "'IBM Plex Mono',monospace", color: UOM_COLOR[cgConsUom.type] ?? '#e2dfd8', fontWeight: 500 }}>{cgConsUom.code}</span>
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{cgConsUom.name}</span>
                        <span style={{ fontSize: 9, color: 'rgba(74,222,128,0.5)', marginLeft: 'auto' }}>✓ grupo</span>
                      </>
                    ) : (
                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>
                        {c.consumptionGroupId ? '⚠ grupo sin UOM' : '— selecciona grupo —'}
                      </span>
                    )}
                  </div>

                  {/* Scrap % */}
                  <input style={{ ...INPUT, fontSize: 12, padding: '7px 8px', textAlign: 'right' }}
                    type="number" min="0" max="100" placeholder="0"
                    value={c.scrapPercent} onChange={e => setComp(idx, 'scrapPercent', e.target.value)} />

                  {/* Remove */}
                  {components.length > 1 && (
                    <button type="button"
                      onClick={() => setComponents(cs => cs.filter((_, i) => i !== idx))}
                      style={{ width: 22, height: 22, borderRadius: 4, background: 'rgba(239,68,68,0.1)', border: '0.5px solid rgba(239,68,68,0.2)', color: '#f87171', cursor: 'pointer', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: 6 }}>
                      ×
                    </button>
                  )}
                </div>
              );
            })}

            {/* Legend */}
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', lineHeight: 1.7, background: 'rgba(255,255,255,0.02)', borderRadius: 7, padding: '8px 12px', border: '0.5px solid rgba(255,255,255,0.05)' }}>
              <strong style={{ color: 'rgba(255,255,255,0.4)' }}>Consumption Group</strong> — representa la necesidad genérica de producción (ej: "Adhesivo Industrial KG"). Agrupa todos los items de compra que satisfacen esa necesidad.<br />
              <strong style={{ color: 'rgba(255,255,255,0.4)' }}>UOM libre</strong> — el formulador expresa la cantidad en cualquier unidad (GAL, KG, PCS, etc.).<br />
              <strong style={{ color: '#4ade80' }}>Cons. UOM</strong> — unidad de sistema. MRP convierte la UOM libre → Cons. UOM para agregar la demanda total del grupo.
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 20px 18px', borderTop: '0.5px solid rgba(255,255,255,0.06)' }}>
            <button type="button" onClick={onClose} style={{ background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '8px 16px', fontSize: 13, fontFamily: "'IBM Plex Sans',sans-serif", color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>Cancel</button>
            <button type="submit" disabled={busy} style={{ background: 'linear-gradient(135deg,#c2410c,#ea580c,#f97316)', border: 'none', borderRadius: 7, padding: '8px 20px', fontSize: 13, fontWeight: 500, fontFamily: "'IBM Plex Sans',sans-serif", color: 'white', cursor: 'pointer', boxShadow: '0 3px 12px rgba(234,88,12,0.35)', opacity: busy ? 0.5 : 1 }}>
              {busy ? 'Creating…' : 'Create BOM'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BOMPage() {
  const [list,        setList]             = useState<Bom[]>([]);
  const [items,       setItems]            = useState<Item[]>([]);
  const [consumptionGroups, setConsumptionGroups] = useState<any[]>([]);
  const [systemUoms,  setSystemUoms]       = useState<UomUnit[]>([]);
  const [allUoms,     setAllUoms]          = useState<UomUnit[]>([]);
  const [workCenters, setWorkCenters]      = useState<WorkCenter[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [error,       setError]       = useState('');
  const [detail,      setDetail]      = useState<Record<string, Bom>>({});
  const [modalOpen,   setModalOpen]   = useState(false);

  const fetchBoms = useCallback(async () => {
    try { setLoading(true); setList(extractList<Bom>(await bomApi.getAll())); }
    catch (err) { setError(err instanceof Error ? err.message : 'Load failed.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchBoms();
    itemsApi.getAll().then(setItems).catch(() => {});
    consumptionGroupsApi.getAll().then(setConsumptionGroups).catch(() => {});
    tenantSettingsApi.getSystemUoms().then(s => setSystemUoms(s.list ?? [])).catch(() => {});
    import('@/lib/api/client').then(({ default: apiClient }) => {
      apiClient.get('/uom/units').then(r => setAllUoms(Array.isArray(r.data) ? r.data : [])).catch(() => {});
      apiClient.get('/work-centers').then(r => setWorkCenters(Array.isArray(r.data) ? r.data : (r.data?.workCenters ?? []))).catch(() => {});
    });
  }, [fetchBoms]);

  const handleExpand = async (bom: Bom) => {
    if (!detail[bom.id]) {
      try {
        const d = await bomApi.getById(bom.id);
        setDetail(prev => ({ ...prev, [bom.id]: d as Bom }));
      } catch {}
    }
  };

  // ── Columns ──────────────────────────────────────────────────────────────

  const columns = useMemo<ERPTreeColumn<Bom>[]>(() => [
    {
      key: 'bomNumber', header: 'BOM Number', sortable: true,
      value: r => r.bomNumber,
      render: r => <span style={{ ...MONO, color: '#fb923c', fontWeight: 500 }}>{r.bomNumber}</span>,
    },
    {
      key: 'parentItem', header: 'Parent Item', sortable: true,
      value: r => r.parentItem?.name ?? '',
      render: r => (
        <span>
          <span style={{ ...MONO, color: '#fb923c', fontSize: 11 }}>{r.parentItem?.code}</span>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginLeft: 8 }}>{r.parentItem?.name}</span>
        </span>
      ),
    },
    {
      key: 'version', header: 'Ver.', width: 60, sortable: true,
      value: r => r.version ?? 1,
      render: r => <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>v{r.version ?? 1}</span>,
    },
    {
      key: 'components', header: 'Components', width: 110, sortable: true,
      value: r => r._count?.components ?? r.components?.length ?? 0,
      render: r => {
        const n = r._count?.components ?? r.components?.length ?? 0;
        return <span style={{ fontSize: 12, color: n > 0 ? 'rgba(251,146,60,0.7)' : 'rgba(255,255,255,0.25)' }}>{n} comp.</span>;
      },
    },
    {
      key: 'routing', header: 'Routing', width: 100, sortable: true,
      value: r => r._count?.routings ?? 0,
      render: r => {
        const n = r._count?.routings ?? 0;
        return <span style={{ fontSize: 12, color: n > 0 ? '#60a5fa' : 'rgba(255,255,255,0.25)' }}>{n > 0 ? `${n} steps` : 'No routing'}</span>;
      },
    },
    {
      key: 'isActive', header: 'Status', width: 90, sortable: true,
      value: r => r.isActive ? 'Active' : 'Inactive',
      render: r => (
        <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 20, color: r.isActive ? '#4ade80' : '#f87171', background: r.isActive ? 'rgba(74,222,128,0.1)' : 'rgba(248,113,113,0.1)', border: `0.5px solid ${r.isActive ? 'rgba(74,222,128,0.2)' : 'rgba(248,113,113,0.2)'}` }}>
          {r.isActive ? 'Active' : 'Inactive'}
        </span>
      ),
    },
    {
      key: '_actions', header: '', width: 80, sortable: false,
      render: r => (
        <button onClick={e => { e.stopPropagation(); bomApi.remove(r.id).then(fetchBoms); }}
          style={{ padding: '4px 9px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(239,68,68,0.08)', color: '#f87171', border: '0.5px solid rgba(239,68,68,0.2)', fontFamily: "'IBM Plex Sans',sans-serif" }}>
          Delete
        </button>
      ),
    },
  ], [fetchBoms]);

  return (
    <ERPShell breadcrumbs={['Home', 'Manufacturing', 'Bill of Materials']} title="Bill of Materials">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap');
        .bom-page{padding:0 18px 12px;display:flex;flex-direction:column;height:100%;overflow:hidden;gap:0}
        .bom-toolbar{display:flex;align-items:center;justify-content:flex-end;margin-bottom:10px;flex-shrink:0}
        .bom-btn-new{display:flex;align-items:center;gap:6px;background:linear-gradient(135deg,#c2410c,#ea580c,#f97316);border:none;border-radius:7px;padding:7px 14px;font-size:12px;font-weight:500;font-family:'IBM Plex Sans',sans-serif;color:white;cursor:pointer;box-shadow:0 3px 12px rgba(234,88,12,0.3)}
        .bom-error{background:rgba(239,68,68,0.08);border:0.5px solid rgba(239,68,68,0.2);border-radius:8px;padding:10px 14px;margin-bottom:10px;font-size:13px;color:#fca5a5;flex-shrink:0}
      `}</style>

      <div className="bom-page">
        <div className="bom-toolbar">
          <button className="bom-btn-new" onClick={() => setModalOpen(true)}>
            <svg viewBox="0 0 13 13" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" style={{ width: 13, height: 13 }}>
              <line x1="6.5" y1="1" x2="6.5" y2="12" /><line x1="1" y1="6.5" x2="12" y2="6.5" />
            </svg>
            New BOM
          </button>
        </div>

        {error && <div className="bom-error">{error}</div>}

        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <ERPTreeTable<Bom>
            columns={columns}
            data={list}
            rowKey={r => r.id}
            loading={loading}
            exportFilename="boms"
            emptyMessage="No BOMs yet."
            defaultPageSize={25}
            canExpand={() => true}
            expandedRow={bom => {
              const d = detail[bom.id];
              if (!d) return <div style={{ padding: '12px 20px', fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>Loading…</div>;
              return <BomDetailPanel bom={d} workCenters={workCenters} onRefresh={fetchBoms} />;
            }}
            onRowClick={bom => handleExpand(bom)}
          />
        </div>
      </div>

      {modalOpen && (
        <BOMModal
          items={items}
          consumptionGroups={consumptionGroups}
          systemUoms={systemUoms}
          allUoms={allUoms}
          onClose={() => setModalOpen(false)}
          onSaved={fetchBoms}
        />
      )}
    </ERPShell>
  );
}