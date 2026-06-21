"use client";

import { useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter }                       from 'next/navigation';
import apiClient                                      from '@/lib/api/client';
import { getAccessToken }                             from '@/lib/api/token-store';
import dynamic                                        from 'next/dynamic';

const BarcodeScanner = dynamic(() => import('./BarcodeScanner'), { ssr: false });

// ---- JWT decode (no external lib needed) ------------------------------------

function getTokenUserId(): string | null {
  try {
    // spec-034 — access token lives in memory, not localStorage.
    const token = getAccessToken();
    if (!token) return null;
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.sub ?? payload.userId ?? payload.id ?? null;
  } catch { return null; }
}

// ---- Types ------------------------------------------------------------------

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
  assignedToUserId:    string | null;
  assignedToUser:      { id: string; firstName: string; lastName: string } | null;
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

// ---- Helpers ----------------------------------------------------------------

function fmtQty(v: number | null, digits = 3) {
  if (v === null || v === undefined) return '---';
  return new Intl.NumberFormat('en-US', { maximumFractionDigits: digits }).format(v);
}
function fmtAmt(v: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(v);
}

const ITEM_TYPE_COLOR: Record<string, string> = {
  finished_good: 'var(--success, #4ade80)',
  raw_material:  'var(--accent-blue, #60a5fa)',
  consumable:    'var(--warning, #fbbf24)',
};

// ---- NumPad -----------------------------------------------------------------

function NumPad({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const keys = ['7','8','9','4','5','6','1','2','3','.','0','<'];
  function press(k: string) {
    if (k === '<') { onChange(value.slice(0, -1)); return; }
    if (k === '.' && value.includes('.')) return;
    if (k === '.' && value === '') { onChange('0.'); return; }
    onChange(value + k);
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, width: '100%', maxWidth: 280 }}>
      {keys.map(k => (
        <button key={k} onClick={() => press(k)}
          style={{ height: 56, borderRadius: 12, fontSize: k === '<' ? 18 : 22, fontWeight: 500, fontFamily: "'IBM Plex Mono', monospace", background: k === '<' ? 'rgba(248,113,113,0.12)' : 'rgba(255,255,255,0.06)', border: k === '<' ? '0.5px solid rgba(248,113,113,0.2)' : '0.5px solid rgba(255,255,255,0.1)', color: k === '<' ? 'var(--danger, #f87171)' : 'var(--text-primary, #e2dfd8)', cursor: 'pointer', userSelect: 'none' }}
          onTouchStart={e => { e.currentTarget.style.background = k === '<' ? 'rgba(248,113,113,0.25)' : 'rgba(255,255,255,0.14)'; }}
          onTouchEnd={e =>   { e.currentTarget.style.background = k === '<' ? 'rgba(248,113,113,0.12)' : 'rgba(255,255,255,0.06)'; }}>
          {k}
        </button>
      ))}
    </div>
  );
}

// ---- Progress Bar -----------------------------------------------------------

function ProgressBar({ counted, total }: { counted: number; total: number }) {
  const pct = total > 0 ? (counted / total) * 100 : 0;
  return (
    <div style={{ width: '100%', height: 4, background: 'rgba(255,255,255,0.08)', borderRadius: 2, overflow: 'hidden' }}>
      <div style={{ width: `${pct}%`, height: '100%', background: 'linear-gradient(90deg,var(--accent, #ea580c),var(--accent-mid, #f97316))', borderRadius: 2, transition: 'width 0.4s ease' }} />
    </div>
  );
}

// ---- Main Page --------------------------------------------------------------

export default function MobileCountPage() {
  const params = useParams();
  const router = useRouter();
  const id     = Array.isArray(params?.id) ? params.id[0] : params?.id as string;

  const [session,     setSession]     = useState<CountSession | null>(null);
  const [loading,     setLoading]     = useState(true);
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState('');
  const [scanError,   setScanError]   = useState('');
  const [cursor,      setCursor]      = useState(0);
  const [input,       setInput]       = useState('');
  const [activeField, setActiveField] = useState<ActiveField>('storage');
  const [showAll,     setShowAll]     = useState(false);
  const [savedFlash,  setSavedFlash]  = useState(false);
  const [showScanner, setShowScanner] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  // ---- Get current user from JWT -------------------------------------------

  useEffect(() => {
    const uid = getTokenUserId();
    setCurrentUserId(uid);
  }, []);

  // ---- Fetch session --------------------------------------------------------

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

  // ---- Work list logic ------------------------------------------------------
  // If ANY lines have assignments AND current user has assignments in this session
  // → show only lines assigned to this user (+ already counted by anyone)
  // If no assignments exist → show all lines (supervisor mode)

  const workList = useMemo(() => {
    if (!session) return [];

    const allLines = [...session.lines];
    const hasAnyAssignments = allLines.some(l => l.assignedToUserId !== null);

    if (!hasAnyAssignments) {
      // No assignments — show all (supervisor or unassigned session)
      if (!showAll) {
        const pending = allLines.filter(l => l.status === 'pending');
        const counted = allLines.filter(l => l.status !== 'pending');
        return [...pending, ...counted];
      }
      return allLines;
    }

    // Assignments exist — filter to current user's lines
    const myLines = allLines.filter(l =>
      l.assignedToUserId === currentUserId ||
      l.status !== 'pending' // always show already-counted lines for context
    );

    if (!showAll) {
      const pending = myLines.filter(l => l.status === 'pending');
      const counted = myLines.filter(l => l.status !== 'pending');
      return [...pending, ...counted];
    }
    return myLines;
  }, [session, showAll, currentUserId]);

  // ---- Derived counts -------------------------------------------------------

  const hasAssignments  = (session?.lines ?? []).some(l => l.assignedToUserId !== null);
  const myAssignedCount = (session?.lines ?? []).filter(l => l.assignedToUserId === currentUserId).length;
  const line            = workList[cursor] ?? null;
  const totalLines      = workList.length;
  const countedN        = workList.filter(l => l.status !== 'pending').length;
  const pendingN        = workList.filter(l => l.status === 'pending').length;

  // Reset input when line changes
  useEffect(() => {
    if (!line) return;
    setActiveField('storage');
    setInput(line.countedStorageQty !== null ? String(line.countedStorageQty) : '');
  }, [line?.id]); // eslint-disable-line

  // ---- Save line ------------------------------------------------------------

  async function handleSave(andNext = true) {
    if (!line || !input) return;
    const val = parseFloat(input);
    if (isNaN(val) || val < 0) return;
    setSaving(true);
    try {
      await apiClient.patch(`/stock-reconciliation/${id}/lines`, {
        lineId:             line.id,
        countedStorageQty:  activeField === 'storage'  ? val : undefined,
        countedPurchaseQty: activeField === 'purchase' ? val : undefined,
      });
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 600);
      await fetchSession();
      if (andNext) {
        const nextPending = workList.findIndex((l, i) => i > cursor && l.status === 'pending');
        if (nextPending !== -1) setCursor(nextPending);
        else if (cursor < totalLines - 1) setCursor(c => c + 1);
      }
    } catch (e: any) {
      setError(e?.response?.data?.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  // ---- Navigation -----------------------------------------------------------

  function goPrev() { if (cursor > 0) { setCursor(c => c - 1); setInput(''); } }
  function goNext() { if (cursor < totalLines - 1) { setCursor(c => c + 1); setInput(''); } }

  // ---- Barcode scan ---------------------------------------------------------

  async function handleScan(scanned: string) {
    setShowScanner(false);
    setScanError('');
    try {
      const res = await apiClient.get(`/items/barcode/${encodeURIComponent(scanned)}`);
      const itemId = res.data?.item?.id;
      if (!itemId) { setScanError(`No item found for: ${scanned}`); return; }
      const idx = workList.findIndex(l => l.itemId === itemId);
      if (idx === -1) {
        setScanError(`Item "${res.data?.item?.code}" is not in your count list`);
        return;
      }
      setCursor(idx);
      setInput(workList[idx].countedStorageQty !== null ? String(workList[idx].countedStorageQty) : '');
    } catch (e: any) {
      setScanError(e?.response?.data?.message ?? `Item not found for: ${scanned}`);
    }
  }

  // ---- Display formatter ----------------------------------------------------

  function formatDisplay(val: string): string {
    if (!val || val === '0') return '0';
    const [intPart, decPart] = val.split('.');
    const formatted = new Intl.NumberFormat('en-US').format(Number(intPart) || 0);
    return decPart !== undefined ? `${formatted}.${decPart}` : formatted;
  }

  // ---- Loading --------------------------------------------------------------

  if (loading) {
    return (
      <div style={{ height: '100dvh', background: '#06040f', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
        <div style={{ width: 32, height: 32, borderRadius: '50%', border: '2px solid rgba(251,146,60,0.3)', borderTopColor: 'var(--accent-strong, #fb923c)', animation: 'spin 0.8s linear infinite' }} />
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.3)', fontFamily: "'IBM Plex Sans',sans-serif" }}>Loading session...</span>
      </div>
    );
  }

  // ---- All done -------------------------------------------------------------

  if (!session || workList.length === 0) {
    const totalSessionLines = session?.lines.length ?? 0;
    const myPending = session?.lines.filter(l => l.assignedToUserId === currentUserId && l.status === 'pending').length ?? 0;
    return (
      <div style={{ height: '100dvh', background: '#06040f', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 16, padding: 24 }}>
        <div style={{ fontSize: 40 }}>OK</div>
        <div style={{ fontSize: 18, fontWeight: 600, color: 'var(--success, #4ade80)', fontFamily: "'IBM Plex Sans',sans-serif" }}>
          {hasAssignments ? 'Your assigned lines are all counted!' : 'All items counted!'}
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', textAlign: 'center', fontFamily: "'IBM Plex Sans',sans-serif", lineHeight: 1.6 }}>
          {hasAssignments
            ? `You were assigned ${myAssignedCount} line${myAssignedCount !== 1 ? 's' : ''}. Return to the supervisor to complete the session.`
            : 'Return to the desktop view to review variances and submit for approval.'
          }
        </div>
        <button
          onClick={() => router.push(`/inventory/stock-reconciliation/${id}`)}
          style={{ marginTop: 8, background: 'linear-gradient(135deg,var(--accent-pressed, #c2410c),var(--accent, #ea580c),var(--accent-mid, #f97316))', border: 'none', borderRadius: 10, padding: '14px 28px', fontSize: 15, fontWeight: 600, fontFamily: "'IBM Plex Sans',sans-serif", color: 'white', cursor: 'pointer' }}>
          View Session
        </button>
      </div>
    );
  }

  if (!line) return null;

  const isCountedLine = line.status !== 'pending';
  const hasVariance   = line.variancePurchaseQty !== null && line.variancePurchaseQty !== 0;
  const varColor      = !hasVariance ? 'var(--success, #4ade80)' : (line.variancePurchaseQty ?? 0) > 0 ? 'var(--warning, #fbbf24)' : 'var(--danger, #f87171)';
  const itemTypeColor = ITEM_TYPE_COLOR[line.item.itemType] ?? 'var(--text-primary, #e2dfd8)';
  const displayQty    = input || '0';
  const canSave       = input !== '' && !isNaN(parseFloat(input)) && parseFloat(input) >= 0;
  const isMyLine      = !hasAssignments || line.assignedToUserId === currentUserId;

  return (
    <>
      <div style={{ height: '100dvh', background: '#06040f', display: 'flex', flexDirection: 'column', fontFamily: "'IBM Plex Sans',sans-serif", overflow: 'hidden' }}>
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap');
          * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        `}</style>

        {/* Top bar */}
        <div style={{ padding: '12px 16px 8px', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <button
              onClick={() => router.push(`/inventory/stock-reconciliation/${id}`)}
              style={{ background: 'var(--l05, rgba(255,255,255,0.05))', border: '0.5px solid var(--w10, rgba(255,255,255,0.1))', borderRadius: 8, padding: '6px 12px', fontSize: 13, color: 'var(--w50, rgba(255,255,255,0.5))', cursor: 'pointer' }}>
              Back
            </button>
            <div style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                {session.sessionNumber}
              </div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)' }}>
                {session.warehouse.code} - {session.warehouse.name}
              </div>
              {/* Assignment badge */}
              {hasAssignments && (
                <div style={{ marginTop: 3, fontSize: 9, padding: '2px 8px', borderRadius: 10, background: 'rgba(96,165,250,0.1)', color: 'var(--accent-blue, #60a5fa)', border: '0.5px solid rgba(96,165,250,0.2)', display: 'inline-block' }}>
                  {myAssignedCount} assigned to you
                </div>
              )}
            </div>
            <div style={{ display: 'flex', gap: 6 }}>
              {/* Pending/All toggle */}
              <button
                onClick={() => { setShowAll(a => !a); setCursor(0); }}
                style={{ background: showAll ? 'rgba(251,146,60,0.12)' : 'rgba(255,255,255,0.05)', border: `0.5px solid ${showAll ? 'rgba(251,146,60,0.3)' : 'rgba(255,255,255,0.1)'}`, borderRadius: 8, padding: '6px 10px', fontSize: 11, color: showAll ? 'var(--accent-strong, #fb923c)' : 'rgba(255,255,255,0.4)', cursor: 'pointer' }}>
                {showAll ? 'All' : 'Pending'}
              </button>
              {/* Scan button */}
              <button
                onClick={() => { setScanError(''); setShowScanner(true); }}
                style={{ background: 'rgba(251,146,60,0.12)', border: '0.5px solid rgba(251,146,60,0.3)', borderRadius: 8, padding: '6px 12px', fontSize: 18, color: 'var(--accent-strong, #fb923c)', cursor: 'pointer', lineHeight: 1 }}>
                [=]
              </button>
            </div>
          </div>

          {/* Progress */}
          <ProgressBar counted={countedN} total={totalLines} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ fontSize: 11, color: 'var(--accent-strong, #fb923c)', fontFamily: "'IBM Plex Mono',monospace" }}>{countedN} / {totalLines} counted</span>
            <span style={{ fontSize: 11, color: pendingN > 0 ? 'var(--warning, #fbbf24)' : 'var(--success, #4ade80)', fontFamily: "'IBM Plex Mono',monospace" }}>{pendingN} pending</span>
          </div>
        </div>

        {/* Content */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '0 16px', gap: 10, overflow: 'hidden' }}>

          {/* Item card */}
          <div style={{ background: 'rgba(255,255,255,0.03)', border: `0.5px solid ${savedFlash ? 'rgba(74,222,128,0.4)' : !isMyLine ? 'rgba(251,191,36,0.2)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 14, padding: '14px 16px', flexShrink: 0, transition: 'border-color 0.3s' }}>
            
            {/* Not-my-line warning */}
            {!isMyLine && (
              <div style={{ marginBottom: 8, fontSize: 10, color: 'var(--warning, #fbbf24)', background: 'rgba(251,191,36,0.06)', border: '0.5px solid rgba(251,191,36,0.2)', borderRadius: 6, padding: '4px 10px', textAlign: 'center' }}>
                Assigned to {line.assignedToUser ? `${line.assignedToUser.firstName} ${line.assignedToUser.lastName}` : 'another user'}
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <button onClick={goPrev} disabled={cursor === 0}
                style={{ width: 40, height: 40, borderRadius: 10, background: cursor === 0 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.07)', border: '0.5px solid rgba(255,255,255,0.08)', fontSize: 18, color: cursor === 0 ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.5)', cursor: cursor === 0 ? 'not-allowed' : 'pointer' }}>
                {'<'}
              </button>
              <div style={{ textAlign: 'center', flex: 1, padding: '0 12px' }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 2 }}>{cursor + 1} of {totalLines}</div>
                <div style={{ fontSize: 20, fontWeight: 600, color: 'var(--accent-strong, #fb923c)', fontFamily: "'IBM Plex Mono',monospace" }}>{line.item.code}</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 2 }}>{line.item.name}</div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 6 }}>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, color: itemTypeColor, background: `color-mix(in srgb, ${itemTypeColor} 9%, transparent)`, border: `0.5px solid color-mix(in srgb, ${itemTypeColor} 19%, transparent)` }}>
                    {line.item.itemType.replace('_', ' ')}
                  </span>
                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, color: isCountedLine ? 'var(--success, #4ade80)' : 'var(--warning, #fbbf24)', background: isCountedLine ? 'rgba(74,222,128,0.1)' : 'rgba(251,191,36,0.1)', border: `0.5px solid ${isCountedLine ? 'rgba(74,222,128,0.2)' : 'rgba(251,191,36,0.2)'}` }}>
                    {isCountedLine ? 'Counted' : 'Pending'}
                  </span>
                </div>
              </div>
              <button onClick={goNext} disabled={cursor === totalLines - 1}
                style={{ width: 40, height: 40, borderRadius: 10, background: cursor === totalLines - 1 ? 'rgba(255,255,255,0.02)' : 'rgba(255,255,255,0.07)', border: '0.5px solid rgba(255,255,255,0.08)', fontSize: 18, color: cursor === totalLines - 1 ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.5)', cursor: cursor === totalLines - 1 ? 'not-allowed' : 'pointer' }}>
                {'>'}
              </button>
            </div>

            {/* System quantities */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 3 }}>System ({line.storageUom})</div>
                <div style={{ fontSize: 18, fontWeight: 500, color: 'var(--text-primary, #e2dfd8)', fontFamily: "'IBM Plex Mono',monospace" }}>{fmtQty(line.systemStorageQty)}</div>
              </div>
              <div style={{ background: 'rgba(251,146,60,0.05)', borderRadius: 8, padding: '8px 10px', textAlign: 'center' }}>
                <div style={{ fontSize: 9, color: 'rgba(251,146,60,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 3 }}>System ({line.purchaseUom})</div>
                <div style={{ fontSize: 18, fontWeight: 500, color: 'var(--accent-strong, #fb923c)', fontFamily: "'IBM Plex Mono',monospace" }}>{fmtQty(line.systemPurchaseQty)}</div>
              </div>
            </div>

            {/* Variance if counted */}
            {isCountedLine && line.variancePurchaseQty !== null && (
              <div style={{ marginTop: 8, background: `color-mix(in srgb, ${varColor} 6%, transparent)`, border: `0.5px solid color-mix(in srgb, ${varColor} 19%, transparent)`, borderRadius: 8, padding: '7px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
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

          {/* UOM toggle */}
          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
            <button
              onClick={() => { setActiveField('storage'); setInput(line.countedStorageQty !== null ? String(line.countedStorageQty) : ''); }}
              style={{ flex: 1, height: 44, borderRadius: 10, fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer', transition: 'all 0.15s', background: activeField === 'storage' ? 'rgba(96,165,250,0.15)' : 'rgba(255,255,255,0.04)', color: activeField === 'storage' ? 'var(--accent-blue, #60a5fa)' : 'rgba(255,255,255,0.4)', outline: activeField === 'storage' ? '1px solid rgba(96,165,250,0.3)' : 'none' }}>
              Storage - {line.storageUom}
            </button>
            <button
              onClick={() => { setActiveField('purchase'); setInput(line.countedPurchaseQty !== null ? String(line.countedPurchaseQty) : ''); }}
              style={{ flex: 1, height: 44, borderRadius: 10, fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer', transition: 'all 0.15s', background: activeField === 'purchase' ? 'rgba(251,146,60,0.15)' : 'rgba(255,255,255,0.04)', color: activeField === 'purchase' ? 'var(--accent-strong, #fb923c)' : 'rgba(255,255,255,0.4)', outline: activeField === 'purchase' ? '1px solid rgba(251,146,60,0.3)' : 'none' }}>
              Purchase - {line.purchaseUom}
            </button>
          </div>

          {/* Big qty display */}
          <div style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${activeField === 'storage' ? 'rgba(96,165,250,0.25)' : 'rgba(251,146,60,0.25)'}`, borderRadius: 14, padding: '16px 20px', textAlign: 'center', flexShrink: 0 }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginBottom: 4, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
              Counting in {activeField === 'storage' ? line.storageUom : line.purchaseUom}
            </div>
            <div style={{ fontSize: 42, fontWeight: 600, fontFamily: "'IBM Plex Mono',monospace", color: input ? (activeField === 'storage' ? 'var(--accent-blue, #60a5fa)' : 'var(--accent-strong, #fb923c)') : 'rgba(255,255,255,0.15)', letterSpacing: '-0.02em', minHeight: 52 }}>
              {formatDisplay(displayQty)}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)', marginTop: 2 }}>
              {activeField === 'storage' ? line.storageUom : line.purchaseUom} - WAC {fmtAmt(line.unitCostSnapshot)}/{line.purchaseUom}
            </div>
          </div>

          {/* Numpad */}
          <div style={{ display: 'flex', justifyContent: 'center', flexShrink: 0 }}>
            <NumPad value={input} onChange={setInput} />
          </div>

          {/* Errors */}
          {error && (
            <div style={{ background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'var(--danger-subtle, #fca5a5)', textAlign: 'center', flexShrink: 0 }}>
              {error}
              <button onClick={() => setError('')} style={{ marginLeft: 8, background: 'none', border: 'none', color: 'var(--danger-subtle, #fca5a5)', cursor: 'pointer', fontSize: 14 }}>x</button>
            </div>
          )}
          {scanError && (
            <div style={{ background: 'rgba(251,146,60,0.08)', border: '0.5px solid rgba(251,146,60,0.2)', borderRadius: 8, padding: '8px 12px', fontSize: 12, color: 'var(--accent-strong, #fb923c)', textAlign: 'center', flexShrink: 0 }}>
              {scanError}
              <button onClick={() => setScanError('')} style={{ marginLeft: 8, background: 'none', border: 'none', color: 'var(--accent-strong, #fb923c)', cursor: 'pointer', fontSize: 14 }}>x</button>
            </div>
          )}

          {/* Save buttons — disabled if not my line */}
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, paddingBottom: 16 }}>
            <button
              onClick={() => handleSave(false)}
              disabled={!canSave || saving || !isMyLine}
              style={{ flex: 1, height: 52, borderRadius: 12, fontSize: 14, fontWeight: 500, background: canSave && isMyLine ? 'rgba(96,165,250,0.1)' : 'rgba(255,255,255,0.03)', border: `0.5px solid ${canSave && isMyLine ? 'rgba(96,165,250,0.3)' : 'rgba(255,255,255,0.06)'}`, color: canSave && isMyLine ? 'var(--accent-blue, #60a5fa)' : 'rgba(255,255,255,0.2)', cursor: canSave && isMyLine ? 'pointer' : 'not-allowed' }}>
              Save
            </button>
            <button
              onClick={() => handleSave(true)}
              disabled={!canSave || saving || !isMyLine}
              style={{ flex: 2, height: 52, borderRadius: 12, fontSize: 15, fontWeight: 600, background: canSave && isMyLine ? 'linear-gradient(135deg,var(--accent-pressed, #c2410c),var(--accent, #ea580c),var(--accent-mid, #f97316))' : 'rgba(255,255,255,0.04)', border: 'none', color: canSave && isMyLine ? 'white' : 'rgba(255,255,255,0.2)', cursor: canSave && isMyLine ? 'pointer' : 'not-allowed', opacity: saving ? 0.7 : 1 }}>
              {saving ? 'Saving...' : !isMyLine ? 'Not your line' : cursor < totalLines - 1 ? 'Save & Next' : 'Save OK'}
            </button>
          </div>

        </div>
      </div>

      {/* Barcode Scanner overlay */}
      {showScanner && (
        <BarcodeScanner
          onScan={handleScan}
          onClose={() => setShowScanner(false)}
        />
      )}
    </>
  );
}