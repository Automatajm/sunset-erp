"use client";

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter }                       from 'next/navigation';
import apiClient                                      from '@/lib/api/client';

// ─── Types ────────────────────────────────────────────────────────────────────

type LineStatus  = 'pending' | 'counted' | 'confirmed' | 'adjusted';
type ActiveField = 'storage' | 'purchase';

interface CountLine {
  id:                  string;
  itemId:              string;
  item:                { id: string; code: string; name: string; itemType: string };
  systemStorageQty:    number;
  storageUom:          string;
  systemPurchaseQty:   number;
  purchaseUom:         string;
  unitCostSnapshot:    number;
  countedStorageQty:   number | null;
  countedPurchaseQty:  number | null;
  varianceStorageQty:  number | null;
  variancePurchaseQty: number | null;
  varianceValue:       number | null;
  status:              LineStatus;
  lotNumber:           string | null;
  notes:               string | null;
}

interface CountSession {
  id:            string;
  sessionNumber: string;
  warehouse:     { id: string; code: string; name: string };
  description:   string | null;
  countDate:     string;
  status:        string;
  lines:         CountLine[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtQty(v: number | null, digits = 3) {
  if (v === null || v === undefined) return '—';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(v);
}
function fmtAmt(v: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(v);
}

const ITEM_TYPE_COLOR: Record<string, string> = {
  finished_good: '#4ade80',
  raw_material:  '#60a5fa',
  consumable:    '#fbbf24',
};

// ─── Numeric Keypad ───────────────────────────────────────────────────────────

function NumPad({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const keys = ['7','8','9','4','5','6','1','2','3','.','0','⌫'];

  function press(k: string) {
    if (k === '⌫') {
      onChange(value.slice(0, -1));
      return;
    }
    if (k === '.' && value.includes('.')) return;
    if (k === '.' && value === '') { onChange('0.'); return; }
    onChange(value + k);
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, width: '100%', maxWidth: 280 }}>
      {keys.map(k => (
        <button
          key={k}
          onClick={() => press(k)}
          style={{
            height: 56, borderRadius: 12, fontSize: k === '⌫' ? 20 : 22, fontWeight: 500,
            fontFamily: "'IBM Plex Mono', monospace",
            background: k === '⌫' ? 'rgba(248,113,113,0.12)' : 'rgba(255,255,255,0.06)',
            border: k === '⌫' ? '0.5px solid rgba(248,113,113,0.2)' : '0.5px solid rgba(255,255,255,0.1)',
            color: k === '⌫' ? '#f87171' : '#e2dfd8',
            cursor: 'pointer', userSelect: 'none',
            transition: 'background 0.1s',
          }}
          onTouchStart={e => { e.currentTarget.style.background = k === '⌫' ? 'rgba(248,113,113,0.25)' : 'rgba(255,255,255,0.14)'; }}
          onTouchEnd={e =>   { e.currentTarget.style.background = k === '⌫' ? 'rgba(248,113,113,0.12)' : 'rgba(255,255,255,0.06)'; }}
        >
          {k}
        </button>
      ))}
    </div>
  );
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────

function ProgressBar({ counted, total }: { counted: number; total: number }) {
  const pct = total > 0 ? (counted / total) * 100 : 0;
  return (
    <div style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,#ea580c,#f97316)', borderRadius: 2, transition: 'width 0.4s ease' }} />
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MobileCountPage() {
  const params = useParams();
  const router = useRouter();
  const id     = params?.id as string;

  const [session,      setSession]      = useState<CountSession | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [saving,       setSaving]       = useState(false);
  const [error,        setError]        = useState('');
  const [cursor,       setCursor]       = useState(0);       // index in workList
  const [input,        setInput]        = useState('');
  const [activeField,  setActiveField]  = useState<ActiveField>('storage');
  const [showAll,      setShowAll]      = useState(false);   // pending only vs all
  const [savedFlash,   setSavedFlash]   = useState(false);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchSession = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get(`/stock-reconciliation/${id}`);
      setSession(res.data as CountSession);
    } catch {
      setError('Failed to load session.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => { fetchSession(); }, [fetchSession]);

  // ── Work list — pending first, then counted ────────────────────────────────

  const workList = useMemo(() => {
    if (!session) return [];
    const lines = [...session.lines];
    if (!showAll) {
      // Pending first, then counted
      const pending = lines.filter(l => l.status === 'pending');
      const counted = lines.filter(l => l.status !== 'pending');
      return [...pending, ...counted];
    }
    return lines;
  }, [session, showAll]);

  const line        = workList[cursor] ?? null;
  const totalLines  = workList.length;
  const countedN    = workList.filter(l => l.status !== 'pending').length;
  const pendingN    = workList.filter(l => l.status === 'pending').length;

  // Reset input when line changes
  useEffect(() => {
    if (!line) return;
    setActiveField('storage');
    setInput(line.countedStorageQty !== null ? String(line.countedStorageQty) : '');
  }, [line?.id]);

  // ── Save line ──────────────────────────────────────────────────────────────

  async function handleSave(andNext = true) {
    if (!line || !input) return;
    const val = parseFloat(input);
    if (isNaN(val) || val < 0) return;

    setSaving(true);
    try {
      await apiClient.patch(`/stock-reconciliation/${id}/lines`, {
        lineId:            line.id,
        countedStorageQty:  activeField === 'storage'  ? val : undefined,
        countedPurchaseQty: activeField === 'purchase' ? val : undefined,
      });
      // Flash feedback
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 600);

      await fetchSession();

      if (andNext) {
        // Move to next pending item
        const nextPending = workList.findIndex((l, i) => i > cursor && l.status === 'pending');
        if (nextPending !== -1) {
          setCursor(nextPending);
        } else if (cursor < totalLines - 1) {
          setCursor(c => c + 1);
        }
      }
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  // ── Navigation ─────────────────────────────────────────────────────────────

  function goPrev() { if (cursor > 0) { setCursor(c => c - 1); setInput(''); } }
  function goNext() { if (cursor < totalLines - 1) { setCursor(c => c + 1); setInput(''); } }

  // ── Loading ────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div style={{ height: '100dvh', background: '#06040f', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid rgba(251,146,60,0.3)', borderTopColor: '#fb923c', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', fontFamily: "'IBM Plex Sans',sans-serif" }}>Loading session…</span>
      </div>
    );
  }

  if (!session || workList.length === 0) {
    return (
      <div style={{ height: '100dvh', background: '#06040f', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, padding: 24 }}>
        <div style={{ fontSize: 40 }}>✓</div>
        <div style={{ fontSize: 18, fontWeight: 600, color: '#4ade80', fontFamily: "'IBM Plex Sans',sans-serif" }}>All items counted!</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', textAlign: 'center', fontFamily: "'IBM Plex Sans',sans-serif" }}>
          Return to the desktop view to review variances and submit for approval.
        </div>
        <button
          onClick={() => router.push(`/inventory/stock-reconciliation/${id}`)}
          style={{ marginTop: 8, background: 'linear-gradient(135deg,#c2410c,#ea580c,#f97316)', border: 'none', borderRadius: 10, padding: '14px 28px', fontSize: 15, fontWeight: 600, fontFamily: "'IBM Plex Sans',sans-serif", color: 'white', cursor: 'pointer' }}>
          View Session Summary
        </button>
      </div>
    );
  }

  if (!line) return null;

  const isCountedLine  = line.status !== 'pending';
  const hasVariance    = line.variancePurchaseQty !== null && line.variancePurchaseQty !== 0;
  const varColor       = !hasVariance ? '#4ade80' : (line.variancePurchaseQty ?? 0) > 0 ? '#fbbf24' : '#f87171';
  const itemTypeColor  = ITEM_TYPE_COLOR[line.item.itemType] ?? '#e2dfd8';
  const displayQty = input || '0';

  // Format with thousands separator but preserve decimal editing
  function formatDisplay(val: string): string {
    if (!val || val === '0') return '0';
    const [intPart, decPart] = val.split('.');
    const formatted = new Intl.NumberFormat('en-US').format(Number(intPart) || 0);
    return decPart !== undefined ? `${formatted}.${decPart}` : formatted;
  }
  const canSave        = input !== '' && !isNaN(parseFloat(input)) && parseFloat(input) >= 0;

  return (
    <div style={{ height: '100dvh', background: '#06040f', display: 'flex', flexDirection: 'column', fontFamily: "'IBM Plex Sans',sans-serif", overflow: 'hidden' }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap');
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
      `}</style>

      {/* ── Top bar ── */}
      <div style={{ padding: '12px 16px 8px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <button
            onClick={() => router.push(`/inventory/stock-reconciliation/${id}`)}
            style={{ background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '6px 12px', fontSize: 13, color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>
            ← Back
          </button>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              {session.sessionNumber}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>
              {session.warehouse.code} — {session.warehouse.name}
            </div>
          </div>
          <button
            onClick={() => { setShowAll(a => !a); setCursor(0); }}
            style={{ background: showAll ? 'rgba(251,146,60,0.12)' : 'rgba(255,255,255,0.05)', border: `0.5px solid ${showAll ? 'rgba(251,146,60,0.3)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 8, padding: '6px 10px', fontSize: 11, color: showAll ? '#fb923c' : 'rgba(255,255,255,0.4)', cursor: 'pointer' }}>
            {showAll ? 'All' : 'Pending'}
          </button>
        </div>

        {/* Progress */}
        <ProgressBar counted={countedN} total={totalLines} />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span style={{ fontSize: 11, color: '#fb923c', fontFamily: "'IBM Plex Mono',monospace" }}>{countedN} / {totalLines} counted</span>
          <span style={{ fontSize: 11, color: pendingN > 0 ? '#fbbf24' : '#4ade80', fontFamily: "'IBM Plex Mono',monospace" }}>{pendingN} pending</span>
        </div>
      </div>

      {/* ── Item card ── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0 16px', gap: 10, overflow: 'hidden' }}>

        {/* Navigation + item info */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: `0.5px solid ${savedFlash ? 'rgba(74,222,128,0.4)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 14, padding: '14px 16px', flexShrink: 0, transition: 'border-color 0.3s' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            {/* Prev */}
            <button onClick={goPrev} disabled={cursor === 0}
              style={{ width: 40, height: 40, borderRadius: 10, background: cursor === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.07)', border: '0.5px solid rgba(255,255,255,0.08)', fontSize: 18, color: cursor === 0 ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.5)', cursor: cursor === 0 ? 'not-allowed' : 'pointer' }}>
              ‹
            </button>

            {/* Item info */}
            <div style={{ textAlign: 'center', flex: 1, padding: '0 12px' }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 2 }}>
                {cursor + 1} of {totalLines}
              </div>
              <div style={{ fontSize: 20, fontWeight: 600, color: '#fb923c', fontFamily: "'IBM Plex Mono',monospace", letterSpacing: '0.02em' }}>
                {line.item.code}
              </div>
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>
                {line.item.name}
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 6 }}>
                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, color: itemTypeColor, background: `${itemTypeColor}18`, border: `0.5px solid ${itemTypeColor}30` }}>
                  {line.item.itemType.replace('_', ' ')}
                </span>
                <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, color: isCountedLine ? '#4ade80' : '#fbbf24', background: isCountedLine ? 'rgba(74,222,128,0.1)' : 'rgba(251,191,36,0.1)', border: `0.5px solid ${isCountedLine ? 'rgba(74,222,128,0.2)' : 'rgba(251,191,36,0.2)'}` }}>
                  {isCountedLine ? 'Counted' : 'Pending'}
                </span>
              </div>
              {line.lotNumber && (
                <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>Lot: {line.lotNumber}</div>
              )}
            </div>

            {/* Next */}
            <button onClick={goNext} disabled={cursor === totalLines - 1}
              style={{ width: 40, height: 40, borderRadius: 10, background: cursor === totalLines - 1 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.07)', border: '0.5px solid rgba(255,255,255,0.08)', fontSize: 18, color: cursor === totalLines - 1 ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.5)', cursor: cursor === totalLines - 1 ? 'not-allowed' : 'pointer' }}>
              ›
            </button>
          </div>

          {/* System quantities */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 3 }}>System ({line.storageUom})</div>
              <div style={{ fontSize: 18, fontWeight: 500, color: '#e2dfd8', fontFamily: "'IBM Plex Mono',monospace" }}>{fmtQty(line.systemStorageQty)}</div>
            </div>
            <div style={{ background: 'rgba(251,146,60,0.05)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 9, color: 'rgba(251,146,60,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 3 }}>System ({line.purchaseUom})</div>
              <div style={{ fontSize: 18, fontWeight: 500, color: '#fb923c', fontFamily: "'IBM Plex Mono',monospace" }}>{fmtQty(line.systemPurchaseQty)}</div>
            </div>
          </div>

          {/* Variance (only if counted) */}
          {isCountedLine && line.variancePurchaseQty !== null && (
            <div style={{ marginTop: 8, background: `${varColor}10`, border: `0.5px solid ${varColor}30`, borderRadius: 8, padding: '7px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Variance ({line.purchaseUom})</span>
              <div style={{ textAlign: 'right' }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: varColor, fontFamily: "'IBM Plex Mono',monospace" }}>
                  {line.variancePurchaseQty > 0 ? '+' : ''}{fmtQty(line.variancePurchaseQty)}
                </span>
                {line.varianceValue !== null && (
                  <div style={{ fontSize: 11, color: varColor, opacity: 0.7 }}>{fmtAmt(line.varianceValue)}</div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── UOM toggle ── */}
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button
            onClick={() => { setActiveField('storage'); setInput(line.countedStorageQty !== null ? String(line.countedStorageQty) : ''); }}
            style={{ flex: 1, height: 44, borderRadius: 10, fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer', transition: 'all 0.15s', background: activeField === 'storage' ? 'rgba(96,165,250,0.15)' : 'rgba(255,255,255,0.04)', color: activeField === 'storage' ? '#60a5fa' : 'rgba(255,255,255,0.4)', outline: activeField === 'storage' ? '1px solid rgba(96,165,250,0.3)' : 'none' }}>
            Storage · {line.storageUom}
          </button>
          <button
            onClick={() => { setActiveField('purchase'); setInput(line.countedPurchaseQty !== null ? String(line.countedPurchaseQty) : ''); }}
            style={{ flex: 1, height: 44, borderRadius: 10, fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer', transition: 'all 0.15s', background: activeField === 'purchase' ? 'rgba(251,146,60,0.15)' : 'rgba(255,255,255,0.04)', color: activeField === 'purchase' ? '#fb923c' : 'rgba(255,255,255,0.4)', outline: activeField === 'purchase' ? '1px solid rgba(251,146,60,0.3)' : 'none' }}>
            Purchase · {line.purchaseUom}
          </button>
        </div>

        {/* ── Big qty display ── */}
        <div style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${activeField === 'storage' ? 'rgba(96,165,250,0.25)' : 'rgba(251,146,60,0.25)'}`, borderRadius: 14, padding: '16px 20px', textAlign: 'center', flexShrink: 0 }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 4, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Counting in {activeField === 'storage' ? line.storageUom : line.purchaseUom}
          </div>
          <div style={{ fontSize: 42, fontWeight: 600, fontFamily: "'IBM Plex Mono',monospace", color: input ? (activeField === 'storage' ? '#60a5fa' : '#fb923c') : 'rgba(255,255,255,0.15)', letterSpacing: '-0.02em', minHeight: 52 }}>
            {formatDisplay(displayQty)}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 2 }}>
            {activeField === 'storage' ? line.storageUom : line.purchaseUom} · WAC {fmtAmt(line.unitCostSnapshot)}/{line.purchaseUom}
          </div>
        </div>

        {/* ── Numpad ── */}
        <div style={{ display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
          <NumPad value={input} onChange={setInput} />
        </div>

        {/* Error */}
        {error && (
          <div style={{ background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: '#fca5a5', textAlign: 'center', flexShrink: 0 }}>
            {error}
            <button onClick={() => setError('')} style={{ marginLeft: 8, background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', fontSize: 14 }}>×</button>
          </div>
        )}

        {/* ── Save buttons ── */}
        <div style={{ display: 'flex', gap: 8, flexShrink: 0, paddingBottom: 16 }}>
          <button
            onClick={() => handleSave(false)}
            disabled={!canSave || saving}
            style={{ flex: 1, height: 52, borderRadius: 12, fontSize: 14, fontWeight: 500, background: canSave ? 'rgba(96,165,250,0.1)' : 'rgba(255,255,255,0.03)', border: `0.5px solid ${canSave ? 'rgba(96,165,250,0.3)' : 'rgba(255,255,255,0.06)'}`, color: canSave ? '#60a5fa' : 'rgba(255,255,255,0.2)', cursor: canSave ? 'pointer' : 'not-allowed' }}>
            Save
          </button>
          <button
            onClick={() => handleSave(true)}
            disabled={!canSave || saving}
            style={{ flex: 2, height: 52, borderRadius: 12, fontSize: 15, fontWeight: 600, background: canSave ? 'linear-gradient(135deg,#c2410c,#ea580c,#f97316)' : 'rgba(255,255,255,0.04)', border: 'none', color: canSave ? 'white' : 'rgba(255,255,255,0.2)', cursor: canSave ? 'pointer' : 'not-allowed', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving…' : cursor < totalLines - 1 ? 'Save & Next →' : 'Save ✓'}
          </button>
        </div>

      </div>
    </div>
  );
}