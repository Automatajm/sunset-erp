"use client";

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import { ERPTable, ERPColumn } from '@/components/ui/ERPTable';
import { ERPFilterBar, ERPFilter, useERPFilters, applyERPFilters } from '@/components/ui/ERPFilterBar';
import SearchSelect from '@/components/ui/SearchSelect';
import apiClient from '@/lib/api/client';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Supplier { id: string; code: string; name: string; }
interface Item     { id: string; code: string; name: string; baseUom: string; purchaseUomId?: string; purchaseUom?: { id: string; code: string; name: string }; }

interface SupplierItem {
  id: string;
  supplierId: string; supplier: Supplier;
  itemId: string;     item: Item;
  supplierItemCode?: string;
  supplierItemName?: string;
  purchaseUom: { id: string; code: string; name: string };
  lastPrice?: number;
  currency: string;
  priceValidFrom?: string;
  priceValidUntil?: string;
  priceAlertDays: number;
  priceExpiryDaysLeft?: number;
  priceExpiryStatus?: 'ok' | 'warning' | 'critical' | 'expires_today' | 'expired' | 'no_expiry' | 'no_price';
  leadTimeDays: number;
  moq: number;
  paymentTerms?: string;
  incoterm?: string;
  qualityRating?: number;
  isPreferred: boolean;
  isActive: boolean;
  isBlocked: boolean;
  blockedReason?: string;
  notes?: string;
  conversionPreview: string;
}

interface PriceHistoryEntry {
  id: string; price: number; currency: string;
  validFrom: string; validUntil?: string;
  source: string; rfqId?: string; notes?: string; createdAt: string;
}

type Tab = 'by_supplier' | 'by_item' | 'alerts';

// ─── Constants ────────────────────────────────────────────────────────────────

const INCOTERMS = ['EXW','FCA','CPT','CIP','DAP','DPU','DDP','FAS','FOB','CFR','CIF'];

const INCOTERM_INFO: Record<string, { full: string; responsibility: string; risk: string; mode: string }> = {
  EXW: { full: 'Ex Works',                       responsibility: 'Buyer handles all transport from seller\'s premises',           risk: 'Transfers at seller\'s location',          mode: 'Any mode' },
  FCA: { full: 'Free Carrier',                    responsibility: 'Seller delivers to named carrier; buyer arranges main transport', risk: 'Transfers when handed to carrier',          mode: 'Any mode' },
  CPT: { full: 'Carriage Paid To',                responsibility: 'Seller pays freight to destination; risk transfers earlier',     risk: 'Transfers when handed to first carrier',   mode: 'Any mode' },
  CIP: { full: 'Carriage and Insurance Paid To',  responsibility: 'Like CPT but seller also provides cargo insurance',              risk: 'Transfers when handed to first carrier',   mode: 'Any mode' },
  DAP: { full: 'Delivered at Place',              responsibility: 'Seller delivers to named destination, buyer clears customs',     risk: 'Transfers at named destination',           mode: 'Any mode' },
  DPU: { full: 'Delivered at Place Unloaded',     responsibility: 'Seller delivers and unloads at destination',                    risk: 'Transfers after unloading at destination', mode: 'Any mode' },
  DDP: { full: 'Delivered Duty Paid',             responsibility: 'Seller handles everything including import duties',              risk: 'Transfers at named destination',           mode: 'Any mode' },
  FAS: { full: 'Free Alongside Ship',             responsibility: 'Seller delivers alongside vessel at port of shipment',           risk: 'Transfers at port of origin alongside ship', mode: 'Sea / inland waterway' },
  FOB: { full: 'Free on Board',                   responsibility: 'Seller loads cargo on vessel; buyer handles freight and insurance', risk: 'Transfers when on board the vessel',    mode: 'Sea / inland waterway' },
  CFR: { full: 'Cost and Freight',                responsibility: 'Seller pays freight to destination port; buyer handles insurance', risk: 'Transfers when on board vessel at origin', mode: 'Sea / inland waterway' },
  CIF: { full: 'Cost Insurance and Freight',      responsibility: 'Seller pays freight and insurance to destination port',          risk: 'Transfers when on board vessel at origin', mode: 'Sea / inland waterway' },
};

const PAYMENT_TERMS = [
  'Net 15','Net 30','Net 45','Net 60','Net 90',
  '2/10 Net 30','COD','Prepaid','Upon Receipt',
];

// ─── API ──────────────────────────────────────────────────────────────────────

const supplierItemsApi = {
  getAll: () =>
    apiClient.get('/supplier-items').then(r => Array.isArray(r.data) ? r.data : r.data?.data ?? []),
  create: (body: any) =>
    apiClient.post('/supplier-items', body).then(r => r.data),
  bySupplier: (id: string) =>
    apiClient.get(`/supplier-items/by-supplier/${id}`).then(r => r.data),
  byItem: (id: string) =>
    apiClient.get(`/supplier-items/by-item/${id}`).then(r => r.data),
  expiringPrices: (days: number | null) =>
    apiClient.get(`/supplier-items/expiring-prices${days !== null ? `?days=${days}` : ''}`).then(r => r.data),
  priceHistory: (id: string) =>
    apiClient.get(`/supplier-items/${id}/price-history`).then(r => r.data),
  updatePrice: (id: string, body: any) =>
    apiClient.patch(`/supplier-items/${id}/price`, body).then(r => r.data),
  update: (id: string, body: any) =>
    apiClient.patch(`/supplier-items/${id}`, body).then(r => r.data),
  countsBySupplier: () =>
    apiClient.get('/supplier-items/counts-by-supplier').then(r => r.data),
  countsByItem: () =>
    apiClient.get('/supplier-items/counts-by-item').then(r => r.data),
};

const suppliersApi = {
  getAll: () => apiClient.get('/suppliers?limit=500').then(r => {
    const d = r.data; return Array.isArray(d) ? d : d?.data ?? [];
  }),
};

const itemsApi = {
  getPurchasable: () => apiClient.get('/items?limit=500&isPurchasable=true').then(r => {
    const d = r.data; return Array.isArray(d) ? d : d?.data ?? [];
  }),
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONO: React.CSSProperties = { fontFamily: "'IBM Plex Mono',monospace" };

function fmtAmt(v?: number | null, currency = 'USD') {
  if (v == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, minimumFractionDigits: 2 }).format(v);
}
function fmtDate(d?: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ─── Shared UI atoms ──────────────────────────────────────────────────────────

function ExpiryBadge({ status, days }: { status?: string; days?: number | null }) {
  if (!status || status === 'no_price') return <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11 }}>No price</span>;
  if (status === 'no_expiry')           return <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>No expiry</span>;
  if (status === 'ok')                  return <span style={{ ...MONO, fontSize: 10, color: 'var(--success)' }}>{days}d</span>;
  const cfg: Record<string, { color: string; bg: string; label: string }> = {
    warning:      { color: 'var(--warning)', bg: 'rgba(251,191,36,0.1)',  label: `${days}d`             },
    critical:     { color: 'var(--accent-mid)', bg: 'rgba(249,115,22,0.15)', label: `${days}d`             },
    expires_today:{ color: '#ef4444', bg: 'rgba(239,68,68,0.15)',  label: 'Today'                },
    expired:      { color: '#ef4444', bg: 'rgba(239,68,68,0.1)',   label: `${Math.abs(days ?? 0)}d ago` },
  };
  const c = cfg[status] ?? cfg.warning;
  return (
    <span style={{ ...MONO, fontSize: 10, color: c.color, background: c.bg, border: `0.5px solid color-mix(in srgb, ${c.color} 25%, transparent)`, borderRadius: 6, padding: '2px 7px', whiteSpace: 'nowrap' }}>
      {c.label}
    </span>
  );
}

function Btn({ children, onClick, variant = 'ghost' }: { children: React.ReactNode; onClick: () => void; variant?: 'primary' | 'ghost' }) {
  const styles: Record<string, React.CSSProperties> = {
    primary: { background: 'linear-gradient(135deg,var(--accent-pressed),var(--accent-mid))', border: 'none', color: 'white', fontWeight: 600 },
    ghost:   { background: 'rgba(251,146,60,0.08)', border: '0.5px solid rgba(251,146,60,0.3)', color: 'var(--accent-strong)' },
  };
  return (
    <button onClick={onClick} style={{ padding: '4px 10px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif", whiteSpace: 'nowrap', ...styles[variant] }}>
      {children}
    </button>
  );
}

// ─── PreferredToggle ──────────────────────────────────────────────────────────
// Marks this supplier as preferred for this item (item+supplier combo).
// Clicking "Set preferred" promotes this entry and demotes the previous one.
// The update to the old preferred happens server-side via the existing
// updateMany logic in the service.

function PreferredToggle({ si, onSaved }: { si: SupplierItem; onSaved: (newId: string, itemId: string) => void }) {
  const [saving, setSaving] = useState(false);

  const promote = async () => {
    if (si.isPreferred) return;
    setSaving(true);
    try {
      await supplierItemsApi.update(si.id, { isPreferred: true });
      onSaved(si.id, si.itemId);
    } catch {}
    finally { setSaving(false); }
  };

  return (
    <button
      onClick={promote}
      disabled={saving || si.isPreferred}
      title={si.isPreferred ? 'Preferred supplier for this item' : 'Set as preferred for this item'}
      style={{
        padding: '3px 9px', borderRadius: 5, fontSize: 10,
        cursor: si.isPreferred ? 'default' : 'pointer',
        fontFamily: "'IBM Plex Sans',sans-serif", fontWeight: 500, whiteSpace: 'nowrap',
        border: `0.5px solid ${si.isPreferred ? 'rgba(74,222,128,0.4)' : 'rgba(255,255,255,0.1)'}`,
        background: si.isPreferred ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.03)',
        color: si.isPreferred ? 'var(--success)' : 'rgba(255,255,255,0.3)',
        opacity: saving ? 0.5 : 1, transition: 'all 0.15s',
      }}>
      {si.isPreferred ? 'Preferred' : saving ? '...' : 'Set preferred'}
    </button>
  );
}

// ─── InlineEdit ───────────────────────────────────────────────────────────────
// Supports type='text'|'number' for free input, or type='select' with options[].

function InlineEdit({ value, onSave, type = 'text', suffix = '', min, step, width = 80, options }: {
  value: string | number | null | undefined;
  onSave: (v: string) => Promise<void>;
  type?: 'text' | 'number' | 'select';
  suffix?: string;
  min?: number;
  step?: number;
  width?: number;
  options?: string[];
}) {
  const [editing, setEditing] = useState(false);
  const [draft,   setDraft]   = useState('');
  const [saving,  setSaving]  = useState(false);
  const inputRef = useRef<HTMLInputElement & HTMLSelectElement>(null);

  const start = () => { setDraft(String(value ?? '')); setEditing(true); setTimeout(() => inputRef.current?.focus(), 30); };

  const save = async (val?: string) => {
    const v = val ?? draft;
    if (v === String(value ?? '')) { setEditing(false); return; }
    setSaving(true);
    try { await onSave(v); } catch {}
    finally { setSaving(false); setEditing(false); }
  };

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter')  save();
    if (e.key === 'Escape') setEditing(false);
  };

  const inputStyle: React.CSSProperties = {
    background: 'rgba(251,146,60,0.08)',
    border: '0.5px solid rgba(251,146,60,0.4)',
    borderRadius: 5, padding: '3px 7px', fontSize: 12,
    color: 'var(--warning)', outline: 'none',
    fontFamily: "'IBM Plex Mono',monospace",
    opacity: saving ? 0.5 : 1,
    width,
  };

  if (editing && type === 'select' && options) return (
    <select
      ref={inputRef as any}
      value={draft}
      onChange={e => { setDraft(e.target.value); save(e.target.value); }}
      onBlur={() => setEditing(false)}
      onKeyDown={onKey}
      style={{ ...inputStyle, cursor: 'pointer' }}
    >
      <option value="">—</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );

  if (editing) return (
    <input
      ref={inputRef as any}
      type={type} value={draft} min={min} step={step}
      onChange={e => setDraft(e.target.value)} onBlur={() => save()} onKeyDown={onKey}
      style={inputStyle}
    />
  );

  const displayValue = value != null && value !== '' ? `${value}${suffix}` : '—';
  const hasValue = value != null && value !== '';

  return (
    <div onClick={start} title="Click to edit"
      style={{ cursor: 'text', display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 4px', borderRadius: 4, transition: 'background 0.1s' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(251,146,60,0.06)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
      <span style={{ ...MONO, fontSize: 12, color: hasValue ? 'var(--text-primary)' : 'rgba(255,255,255,0.2)' }}>
        {displayValue}
      </span>
      <svg width="8" height="8" viewBox="0 0 8 8" fill="none" style={{ opacity: 0.3, flexShrink: 0 }}>
        <path d="M5.5 1L7 2.5L3 6.5H1.5V5L5.5 1Z" stroke="currentColor" strokeWidth="0.8" strokeLinejoin="round"/>
      </svg>
    </div>
  );
}

// ─── RatingEdit ───────────────────────────────────────────────────────────────

function RatingEdit({ value, onSave }: { value?: number | null; onSave: (v: number | null) => Promise<void> }) {
  const [hover,  setHover]  = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async (v: number) => {
    const next = v === Number(value) ? null : v;
    setSaving(true);
    try { await onSave(next); } catch {}
    finally { setSaving(false); }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 2, opacity: saving ? 0.5 : 1 }}>
      {[1, 2, 3, 4, 5].map(n => {
        const filled = hover != null ? n <= hover : value != null && n <= Number(value);
        return (
          <span key={n} onClick={() => save(n)}
            onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(null)}
            style={{ fontSize: 13, cursor: 'pointer', color: filled ? 'var(--warning)' : 'rgba(255,255,255,0.15)', lineHeight: 1, userSelect: 'none', transition: 'color 0.1s' }}>
            ★
          </span>
        );
      })}
      {value != null && (
        <span style={{ ...MONO, fontSize: 10, color: 'rgba(255,255,255,0.3)', marginLeft: 3 }}>{Number(value).toFixed(1)}</span>
      )}
    </div>
  );
}

// ─── BlockToggle ──────────────────────────────────────────────────────────────
// Uses position:fixed + getBoundingClientRect so the popover never hides behind table rows.

function BlockToggle({ si, onSaved }: { si: SupplierItem; onSaved: () => void }) {
  const [open,   setOpen]   = useState(false);
  const [reason, setReason] = useState(si.blockedReason ?? '');
  const [saving, setSaving] = useState(false);
  const [pos,    setPos]    = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node) &&
          btnRef.current   && !btnRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [open]);

  const handleOpen = () => {
    if (open) { setOpen(false); return; }
    if (btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const panelWidth = 260;
      const left = Math.min(rect.left, window.innerWidth - panelWidth - 12);
      setPos({ top: rect.bottom + 6, left });
    }
    setReason(si.blockedReason ?? '');
    setOpen(true);
  };

  const toggle = async (block: boolean) => {
    setSaving(true);
    try {
      await supplierItemsApi.update(si.id, { isBlocked: block, blockedReason: block ? reason || null : null });
      onSaved();
      setOpen(false);
    } catch {}
    finally { setSaving(false); }
  };

  return (
    <>
      <button
        ref={btnRef}
        onClick={handleOpen}
        style={{ padding: '3px 9px', borderRadius: 5, fontSize: 10, cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif", fontWeight: 500, whiteSpace: 'nowrap', border: `0.5px solid ${si.isBlocked ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.12)'}`, background: si.isBlocked ? 'rgba(239,68,68,0.1)' : 'rgba(255,255,255,0.04)', color: si.isBlocked ? 'var(--danger)' : 'rgba(255,255,255,0.4)' }}>
        {si.isBlocked ? 'Blocked' : 'Active'}
      </button>

      {open && (
        <div
          ref={panelRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 9999, background: 'var(--surface)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 8, padding: '12px 12px 16px', width: 260, boxShadow: '0 8px 32px rgba(0,0,0,0.85)' }}>
          {si.isBlocked ? (
            <>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginBottom: 10 }}>
                Reason: <span style={{ color: 'var(--danger)', fontStyle: si.blockedReason ? 'normal' : 'italic' }}>{si.blockedReason || 'None given'}</span>
              </div>
              <button onClick={() => toggle(false)} disabled={saving}
                style={{ width: '100%', padding: '6px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(74,222,128,0.1)', border: '0.5px solid rgba(74,222,128,0.3)', color: 'var(--success)', fontFamily: "'IBM Plex Sans',sans-serif" }}>
                {saving ? 'Saving...' : 'Unblock supplier for this item'}
              </button>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>Block reason (optional)</div>
              <input value={reason} onChange={e => setReason(e.target.value)} placeholder="e.g. Quality issues"
                style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: '6px 9px', fontSize: 11, color: 'var(--text-strong)', outline: 'none', fontFamily: "'IBM Plex Sans',sans-serif", boxSizing: 'border-box' }} />
              <button onClick={() => toggle(true)} disabled={saving}
                style={{ width: '100%', padding: '6px', borderRadius: 6, fontSize: 11, cursor: 'pointer', background: 'rgba(239,68,68,0.1)', border: '0.5px solid rgba(239,68,68,0.3)', color: 'var(--danger)', fontFamily: "'IBM Plex Sans',sans-serif" }}>
                {saving ? 'Saving...' : 'Block supplier for this item'}
              </button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

// ─── Price Update Modal ───────────────────────────────────────────────────────

function PriceModal({ si, onClose, onSaved }: { si: SupplierItem; onClose: () => void; onSaved: (updated: { lastPrice: number; priceValidFrom: string; priceValidUntil?: string }) => void }) {
  const [price,      setPrice]      = useState(String(si.lastPrice ?? ''));
  const [validFrom,  setValidFrom]  = useState(si.priceValidFrom?.split('T')[0] ?? new Date().toISOString().split('T')[0]);
  const [validUntil, setValidUntil] = useState(si.priceValidUntil?.split('T')[0] ?? '');
  const [notes,      setNotes]      = useState('');
  const [saving,     setSaving]     = useState(false);
  const [err,        setErr]        = useState('');

  const INP: React.CSSProperties = { width: '100%', background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.12)', borderRadius: 7, padding: '8px 12px', fontSize: 13, color: 'var(--text-strong)', outline: 'none', fontFamily: "'IBM Plex Sans',sans-serif", boxSizing: 'border-box', colorScheme: 'dark' as any };
  const LBL: React.CSSProperties = { fontSize: 11, color: 'rgba(255,255,255,0.45)', display: 'block', marginBottom: 5 };

  const save = async () => {
    if (!price || !validFrom) { setErr('Price and start date are required'); return; }
    setSaving(true); setErr('');
    try {
      await supplierItemsApi.updatePrice(si.id, { price: parseFloat(price), currency: si.currency, validFrom, validUntil: validUntil || undefined, source: 'manual', notes: notes || undefined });
      onSaved({ lastPrice: parseFloat(price), priceValidFrom: validFrom, priceValidUntil: validUntil || undefined });
    } catch (e: any) { setErr(e.message ?? 'Error saving'); }
    finally { setSaving(false); }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#0c0a18', border: '0.5px solid rgba(251,146,60,0.3)', borderRadius: 14, width: 420, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.7)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>Update Price</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 3 }}>
              <span style={{ ...MONO, color: 'var(--accent-strong)' }}>{si.item.code}</span> &middot; {si.supplier.name}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={LBL}>New Price ({si.currency}) *</label>
            <input type="number" min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)}
              style={{ ...INP, ...MONO, color: 'var(--warning)', border: '0.5px solid rgba(251,146,60,0.3)' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={LBL}>Valid From *</label>
              <input type="date" value={validFrom} onChange={e => setValidFrom(e.target.value)} style={INP} />
            </div>
            <div>
              <label style={LBL}>Valid Until</label>
              <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} style={INP} />
            </div>
          </div>
          <div>
            <label style={LBL}>Notes</label>
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)} placeholder="e.g. Q2-2026 quotation" style={INP} />
          </div>
          {err && <div style={{ fontSize: 11, color: 'var(--danger)', background: 'rgba(248,113,113,0.08)', borderRadius: 6, padding: '6px 10px' }}>{err}</div>}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
            <Btn onClick={onClose}>Cancel</Btn>
            <Btn onClick={save} variant="primary">{saving ? 'Saving...' : 'Update Price'}</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Price History Panel ──────────────────────────────────────────────────────

function PriceHistoryPanel({ siId, onClose }: { siId: string; onClose: () => void }) {
  const [history, setHistory] = useState<PriceHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supplierItemsApi.priceHistory(siId).then(setHistory).catch(console.error).finally(() => setLoading(false));
  }, [siId]);

  const srcColor: Record<string, string> = { rfq: 'var(--accent-violet)', manual: 'var(--warning)', import: 'var(--success)', grn: '#38bdf8' };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#0c0a18', border: '0.5px solid rgba(167,139,250,0.3)', borderRadius: 14, width: 520, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.7)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>Price History</div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>
        <div style={{ overflowY: 'auto', padding: '12px 20px 20px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 30, color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>Loading...</div>
          ) : history.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 30, color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>No price history found</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {history.map((h, i) => (
                <div key={h.id} style={{ background: i === 0 ? 'rgba(251,191,36,0.04)' : 'rgba(255,255,255,0.02)', border: `0.5px solid ${i === 0 ? 'rgba(251,191,36,0.2)' : 'rgba(255,255,255,0.06)'}`, borderRadius: 8, padding: '10px 14px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span style={{ ...MONO, fontSize: 15, color: 'var(--warning)', fontWeight: 600 }}>{fmtAmt(h.price, h.currency)}</span>
                    <span style={{ fontSize: 10, color: srcColor[h.source] ?? '#fff', background: `${srcColor[h.source] ?? '#fff'}18`, border: `0.5px solid ${srcColor[h.source] ?? '#fff'}40`, borderRadius: 5, padding: '1px 7px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {h.source}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 16, marginTop: 6, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                    <span>From: <span style={{ color: 'rgba(255,255,255,0.6)' }}>{fmtDate(h.validFrom)}</span></span>
                    {h.validUntil && <span>Until: <span style={{ color: 'rgba(255,255,255,0.6)' }}>{fmtDate(h.validUntil)}</span></span>}
                    <span style={{ marginLeft: 'auto' }}>{fmtDate(h.createdAt)}</span>
                  </div>
                  {h.notes && <div style={{ marginTop: 4, fontSize: 11, color: 'rgba(255,255,255,0.3)', fontStyle: 'italic' }}>{h.notes}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}



// ─── Incoterm Info Modal ──────────────────────────────────────────────────────
// Reference card for all 11 ICC Incoterms 2020.
// Triggered by the ? button next to any Incoterm selector.

function IncotermInfoModal({ onClose }: { onClose: () => void }) {
  const groups = [
    { label: 'Any Mode of Transport', keys: ['EXW','FCA','CPT','CIP','DAP','DPU','DDP'], color: 'var(--accent-blue)' },
    { label: 'Sea & Inland Waterway Only', keys: ['FAS','FOB','CFR','CIF'], color: '#34d399' },
  ];
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 700, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ background: '#0c0a18', border: '0.5px solid rgba(96,165,250,0.25)', borderRadius: 14, width: 640, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.7)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '0.5px solid rgba(255,255,255,0.06)', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>Incoterms 2020 — Reference Guide</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>International Commercial Terms published by ICC · Defines delivery, risk and cost responsibilities</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 20, cursor: 'pointer', lineHeight: 1, flexShrink: 0 }}>×</button>
        </div>
        <div style={{ overflowY: 'auto', padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {groups.map(group => (
            <div key={group.label}>
              <div style={{ fontSize: 10, fontWeight: 600, color: group.color, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, height: '0.5px', background: `color-mix(in srgb, ${group.color} 25%, transparent)` }} />
                {group.label}
                <div style={{ flex: 1, height: '0.5px', background: `color-mix(in srgb, ${group.color} 25%, transparent)` }} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {group.keys.map(key => {
                  const info = INCOTERM_INFO[key];
                  return (
                    <div key={key} style={{ background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.06)', borderRadius: 8, padding: '10px 14px', display: 'grid', gridTemplateColumns: '52px 1fr', gap: 12, alignItems: 'start' }}>
                      <div>
                        <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 14, fontWeight: 700, color: group.color }}>{key}</div>
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.25)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{info.mode.includes('Sea') ? 'Sea only' : 'Any mode'}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 12, color: 'var(--text-primary)', fontWeight: 500, marginBottom: 4 }}>{info.full}</div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>{info.responsibility}</div>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 4 }}>Risk: {info.risk}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
          <div style={{ background: 'rgba(251,191,36,0.05)', border: '0.5px solid rgba(251,191,36,0.15)', borderRadius: 8, padding: '10px 14px', fontSize: 11, color: 'rgba(251,191,36,0.7)' }}>
            Tip: For sea freight, FOB and CIF are most common. For multimodal transport, FCA and DAP cover most scenarios.
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Add Item Modal ───────────────────────────────────────────────────────────
// Adds a new item to a supplier's catalog from the By Supplier tab.
// Requires: supplierId (fixed), itemId, purchaseUomId (from item).
// All price and commercial fields are optional — can be set later inline.

function AddItemModal({ supplierId, supplierName, existingItemIds, purchasableItems, onClose, onSaved }: {
  supplierId: string;
  supplierName: string;
  existingItemIds: Set<string>;
  purchasableItems: Item[];
  onClose: () => void;
  onSaved: (newSI: SupplierItem) => void;
}) {
  const [itemId,           setItemId]           = useState('');
  const [supplierItemCode, setSupplierItemCode] = useState('');
  const [lastPrice,        setLastPrice]        = useState('');
  const [validFrom,        setValidFrom]        = useState(new Date().toISOString().split('T')[0]);
  const [validUntil,       setValidUntil]       = useState('');
  const [moq,              setMoq]              = useState('1');
  const [leadTimeDays,     setLeadTimeDays]     = useState('0');
  const [incoterm,         setIncoterm]         = useState('');
  const [paymentTerms,     setPaymentTerms]     = useState('');
  const [isPreferred,      setIsPreferred]      = useState(false);
  const [saving,           setSaving]           = useState(false);
  const [err,              setErr]              = useState('');
  const [itemSearch,       setItemSearch]       = useState('');
  const [itemOpen,         setItemOpen]         = useState(false);
  const [showIncotermInfo, setShowIncotermInfo] = useState(false);
  const itemDropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (itemDropRef.current && !itemDropRef.current.contains(e.target as Node)) setItemOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  // Available items: purchasable, not already added to this supplier
  const availableItems = useMemo(() => {
    const pool = purchasableItems.filter(it => !existingItemIds.has(it.id));
    if (!itemSearch.trim()) return pool;
    const q = itemSearch.toLowerCase();
    return pool.filter(it => it.code.toLowerCase().includes(q) || it.name.toLowerCase().includes(q));
  }, [purchasableItems, existingItemIds, itemSearch]);

  const selectedItem = itemId ? purchasableItems.find(it => it.id === itemId) : null;

  const handleSave = async () => {
    if (!itemId) { setErr('Select an item'); return; }
    if (!selectedItem?.purchaseUomId) { setErr('Selected item has no Purchase UOM configured'); return; }
    setSaving(true); setErr('');
    try {
      const body: any = {
        supplierId,
        itemId,
        purchaseUomId: selectedItem.purchaseUomId,
        moq:           moq ? parseFloat(moq) : 1,
        leadTimeDays:  leadTimeDays ? parseInt(leadTimeDays) : 0,
        isPreferred,
      };
      if (supplierItemCode) body.supplierItemCode = supplierItemCode;
      if (lastPrice)        body.lastPrice        = parseFloat(lastPrice);
      if (lastPrice && validFrom) body.priceValidFrom  = validFrom;
      if (lastPrice && validUntil) body.priceValidUntil = validUntil;
      if (incoterm)         body.incoterm         = incoterm;
      if (paymentTerms)     body.paymentTerms     = paymentTerms;
      const created = await supplierItemsApi.create(body);
      onSaved(created);
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? e.message ?? 'Error saving');
    } finally { setSaving(false); }
  };

  const INP: React.CSSProperties = { width: '100%', background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.12)', borderRadius: 7, padding: '8px 12px', fontSize: 12, color: 'var(--text-strong)', outline: 'none', fontFamily: "'IBM Plex Sans',sans-serif", boxSizing: 'border-box', colorScheme: 'dark' as any };
  const LBL: React.CSSProperties = { fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 5 };
  const SEL: React.CSSProperties = { ...INP, cursor: 'pointer' };

  return (
    <>
    {showIncotermInfo && <IncotermInfoModal onClose={() => setShowIncotermInfo(false)} />}
    <div style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ background: '#0c0a18', border: '0.5px solid rgba(251,146,60,0.25)', borderRadius: 14, width: 500, padding: 24, boxShadow: '0 20px 60px rgba(0,0,0,0.7)', maxHeight: '90vh', overflowY: 'auto' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>Add Item to Supplier</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 3 }}>{supplierName}</div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 20, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {err && <div style={{ fontSize: 11, color: 'var(--danger)', background: 'rgba(248,113,113,0.08)', border: '0.5px solid rgba(248,113,113,0.2)', borderRadius: 6, padding: '8px 12px' }}>{err}</div>}

          {/* Item selector */}
          <div>
            <label style={LBL}>Item *</label>
            <div ref={itemDropRef} style={{ position: 'relative' }}>
              <div onClick={() => setItemOpen(o => !o)}
                style={{ ...INP, display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', padding: '8px 12px', minHeight: 38 }}>
                {selectedItem ? (
                  <span>
                    <span style={{ ...MONO, color: 'var(--accent-strong)', fontSize: 11 }}>{selectedItem.code}</span>
                    <span style={{ color: 'rgba(255,255,255,0.7)', marginLeft: 8, fontSize: 12 }}>{selectedItem.name}</span>
                  </span>
                ) : <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 12 }}>Search and select item...</span>}
                <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.3)', flexShrink: 0, marginLeft: 8 }}>{itemOpen ? '▲' : '▼'}</span>
              </div>
              {itemOpen && (
                <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 700, background: 'var(--surface)', border: '0.5px solid rgba(251,146,60,0.2)', borderRadius: 7, boxShadow: '0 8px 32px rgba(0,0,0,0.6)', marginTop: 2, overflow: 'hidden' }}>
                  <div style={{ padding: '6px 8px', borderBottom: '0.5px solid rgba(255,255,255,0.06)' }}>
                    <input autoFocus value={itemSearch} onChange={e => setItemSearch(e.target.value)} placeholder="Search by code or name…" onClick={e => e.stopPropagation()}
                      style={{ width: '100%', background: 'rgba(255,255,255,0.06)', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 5, padding: '5px 8px', fontSize: 12, color: 'var(--text-strong)', outline: 'none', fontFamily: "'IBM Plex Sans',sans-serif" }} />
                  </div>
                  <div style={{ maxHeight: 220, overflowY: 'auto' }}>
                    {availableItems.length === 0 ? (
                      <div style={{ padding: 12, fontSize: 12, color: 'rgba(255,255,255,0.3)', textAlign: 'center' }}>
                        {purchasableItems.filter(it => !existingItemIds.has(it.id)).length === 0 ? 'All purchasable items already added' : 'No items match search'}
                      </div>
                    ) : availableItems.map(it => (
                      <div key={it.id} onClick={() => { setItemId(it.id); setItemOpen(false); setItemSearch(''); }}
                        style={{ padding: '8px 12px', cursor: 'pointer', borderBottom: '0.5px solid rgba(255,255,255,0.03)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}
                        onMouseEnter={e => (e.currentTarget as any).style.background = 'rgba(255,255,255,0.04)'}
                        onMouseLeave={e => (e.currentTarget as any).style.background = 'transparent'}>
                        <div>
                          <div style={{ ...MONO, color: 'var(--accent-strong)', fontSize: 11 }}>{it.code}</div>
                          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginTop: 1 }}>{it.name}</div>
                        </div>
                        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', flexShrink: 0 }}>
                          {it.purchaseUom?.code ?? it.baseUom}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            {selectedItem && (
              <div style={{ marginTop: 5, fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>
                Purchase UOM: <span style={{ color: 'var(--accent-strong)', ...MONO }}>{selectedItem.purchaseUom?.code ?? selectedItem.baseUom}</span>
                {!selectedItem.purchaseUomId && <span style={{ color: 'var(--danger)', marginLeft: 8 }}>No Purchase UOM configured — set it in Items first</span>}
              </div>
            )}
          </div>

          {/* Supplier code */}
          <div>
            <label style={LBL}>Supplier Item Code</label>
            <input value={supplierItemCode} onChange={e => setSupplierItemCode(e.target.value)} placeholder="e.g. LOC-GAL-001" style={INP} />
          </div>

          {/* Price row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            <div>
              <label style={LBL}>Initial Price</label>
              <input type="number" min="0" step="0.01" value={lastPrice} onChange={e => setLastPrice(e.target.value)} placeholder="0.00" style={{ ...INP, ...MONO, color: 'var(--warning)' }} />
            </div>
            <div>
              <label style={LBL}>Valid From</label>
              <input type="date" value={validFrom} onChange={e => setValidFrom(e.target.value)} style={INP} />
            </div>
            <div>
              <label style={LBL}>Valid Until</label>
              <input type="date" value={validUntil} onChange={e => setValidUntil(e.target.value)} style={INP} />
            </div>
          </div>

          {/* MOQ + Lead */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <label style={LBL}>MOQ</label>
              <input type="number" min="0" step="1" value={moq} onChange={e => setMoq(e.target.value)} style={{ ...INP, ...MONO }} />
            </div>
            <div>
              <label style={LBL}>Lead Time (days)</label>
              <input type="number" min="0" step="1" value={leadTimeDays} onChange={e => setLeadTimeDays(e.target.value)} style={{ ...INP, ...MONO }} />
            </div>
          </div>

          {/* Incoterm + Payment */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                <label style={{ ...LBL, marginBottom: 0 }}>Incoterm</label>
                <button type="button" onClick={() => setShowIncotermInfo(true)}
                  style={{ width: 16, height: 16, borderRadius: '50%', background: 'rgba(96,165,250,0.15)', border: '0.5px solid rgba(96,165,250,0.3)', color: 'var(--accent-blue)', cursor: 'pointer', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1, fontFamily: 'serif' }}>
                  ?
                </button>
              </div>
              <select value={incoterm} onChange={e => setIncoterm(e.target.value)} style={SEL}>
                <option value="">—</option>
                {INCOTERMS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label style={LBL}>Payment Terms</label>
              <select value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} style={SEL}>
                <option value="">—</option>
                {PAYMENT_TERMS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          {/* Preferred toggle */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', background: isPreferred ? 'rgba(74,222,128,0.06)' : 'rgba(255,255,255,0.02)', border: `0.5px solid ${isPreferred ? 'rgba(74,222,128,0.2)' : 'rgba(255,255,255,0.08)'}`, borderRadius: 7, cursor: 'pointer' }} onClick={() => setIsPreferred(p => !p)}>
            <div style={{ width: 18, height: 18, borderRadius: 4, border: `1.5px solid ${isPreferred ? 'var(--success)' : 'rgba(255,255,255,0.2)'}`, background: isPreferred ? 'var(--success)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.15s' }}>
              {isPreferred && <span style={{ fontSize: 11, color: 'var(--bg)', fontWeight: 700 }}>✓</span>}
            </div>
            <div>
              <div style={{ fontSize: 12, color: isPreferred ? 'var(--success)' : 'rgba(255,255,255,0.6)', fontWeight: isPreferred ? 600 : 400 }}>Set as preferred supplier for this item</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginTop: 1 }}>Will demote any existing preferred supplier for this item</div>
            </div>
          </div>

          {/* Footer */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, paddingTop: 4 }}>
            <button onClick={onClose} style={{ padding: '7px 16px', borderRadius: 7, fontSize: 12, background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif" }}>Cancel</button>
            <button onClick={handleSave} disabled={saving || !itemId}
              style={{ padding: '7px 18px', borderRadius: 7, fontSize: 12, fontWeight: 600, background: itemId ? 'linear-gradient(135deg,var(--accent-pressed),var(--accent-mid))' : 'rgba(255,255,255,0.05)', border: 'none', color: itemId ? 'white' : 'rgba(255,255,255,0.3)', cursor: itemId ? 'pointer' : 'not-allowed', fontFamily: "'IBM Plex Sans',sans-serif", opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Adding...' : 'Add Item'}
            </button>
          </div>
        </div>
      </div>
    </div>
    </>
  );
}

// ─── Tab 1: By Supplier ───────────────────────────────────────────────────────

const BY_SUPPLIER_FILTERS: ERPFilter<SupplierItem>[] = [
  {
    key: 'priceExpiryStatus', label: 'Price Status', type: 'multiselect',
    options: [
      { value: 'expired',   label: 'Expired',   color: '#ef4444', bg: 'rgba(239,68,68,0.1)',    border: 'rgba(239,68,68,0.3)'    },
      { value: 'critical',  label: 'Critical',  color: 'var(--accent-mid)', bg: 'rgba(249,115,22,0.1)',   border: 'rgba(249,115,22,0.3)'   },
      { value: 'warning',   label: 'Warning',   color: 'var(--warning)', bg: 'rgba(251,191,36,0.1)',   border: 'rgba(251,191,36,0.3)'   },
      { value: 'ok',        label: 'OK',        color: 'var(--success)', bg: 'rgba(74,222,128,0.1)',   border: 'rgba(74,222,128,0.3)'   },
      { value: 'no_expiry', label: 'No Expiry', color: 'rgba(255,255,255,0.5)', bg: 'rgba(255,255,255,0.04)', border: 'rgba(255,255,255,0.12)' },
    ],
    filterFn: (row, val) => (val as string[]).includes(row.priceExpiryStatus ?? 'no_price'),
  },
  { key: 'isBlocked',   label: 'Blocked',   type: 'boolean', placeholder: 'Blocked only'   },
  { key: 'isPreferred', label: 'Preferred', type: 'boolean', placeholder: 'Preferred only' },
];

function TabBySupplier({ allItems, suppliers, purchasableItems, counts }: { allItems: SupplierItem[]; suppliers: Supplier[]; purchasableItems: Item[]; counts: Record<string, number> }) {
  const [selectedId, setSelectedId] = useState('');
  const [items,      setItems]      = useState<SupplierItem[]>(allItems);
  const [priceModal, setPriceModal] = useState<SupplierItem | null>(null);
  const [histSiId,   setHistSiId]   = useState<string | null>(null);
  const [addModal,   setAddModal]   = useState(false);

  const { values, setValue, reset, activeCount } = useERPFilters(BY_SUPPLIER_FILTERS);

  // Filter already-loaded data — no extra request needed
  const baseFiltered = useMemo(() =>
    selectedId ? items.filter(si => si.supplierId === selectedId) : items,
  [items, selectedId]);

  const filtered = useMemo(() => applyERPFilters(baseFiltered, BY_SUPPLIER_FILTERS, values), [baseFiltered, values]);

  const patch = useCallback(async (id: string, field: string, val: any) => {
    await supplierItemsApi.update(id, { [field]: val });
    setItems(prev => prev.map(si => si.id === id ? { ...si, [field]: val } : si));
  }, []);

  // Promote new preferred, demote old one for the same item
  const handlePreferred = useCallback((newId: string, itemId: string) => {
    setItems(prev => prev.map(si =>
      si.itemId === itemId ? { ...si, isPreferred: si.id === newId } : si
    ));
  }, []);

  const columns: ERPColumn<SupplierItem>[] = [
    {
      key: 'item', header: 'Item', width: 220,
      render: row => (
        <div>
          <div style={{ ...MONO, color: 'var(--accent-strong)', fontSize: 11 }}>{row.item.code}</div>
          <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, marginTop: 1 }}>{row.item.name}</div>
        </div>
      ),
      value: row => `${row.item.code} ${row.item.name}`,
    },
    {
      // Supplier's own code for this item — external reference, editable
      key: 'supplierItemCode', header: 'Supplier Code', width: 130,
      render: row => (
        <InlineEdit
          value={row.supplierItemCode}
          type="text"
          width={110}
          onSave={v => patch(row.id, 'supplierItemCode', v || null)}
        />
      ),
      value: row => row.supplierItemCode ?? '',
    },
    { key: 'purchaseUom', header: 'UOM', width: 70, align: 'center', render: row => <span style={{ fontSize: 11 }}>{row.purchaseUom.code}</span>, value: row => row.purchaseUom.code },
    {
      key: 'lastPrice', header: 'Price', width: 120, align: 'right',
      render: row => <span style={{ ...MONO, color: row.lastPrice ? 'var(--warning)' : 'rgba(255,255,255,0.2)', fontSize: 13, fontWeight: row.lastPrice ? 600 : 400 }}>{fmtAmt(row.lastPrice, row.currency)}</span>,
      value: row => row.lastPrice ?? 0,
    },
    { key: 'priceValidUntil', header: 'Valid Until', width: 110, render: row => <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>{fmtDate(row.priceValidUntil)}</span> },
    { key: 'priceExpiryStatus', header: 'Expiry', width: 90, render: row => <ExpiryBadge status={row.priceExpiryStatus} days={row.priceExpiryDaysLeft} /> },
    {
      key: 'isPreferred', header: 'Preferred', width: 115, sortable: true,
      render: row => <PreferredToggle si={row} onSaved={handlePreferred} />,
      value: row => row.isPreferred ? 1 : 0,
    },
    {
      key: 'status', header: 'Status', width: 100, sortable: false,
      render: row => <BlockToggle si={row} onSaved={() => setItems(prev => [...prev])} />,
    },
    {
      key: 'moq', header: 'MOQ', width: 80, align: 'right',
      render: row => <InlineEdit value={Number(row.moq)} type="number" min={0} step={1} width={70} onSave={v => patch(row.id, 'moq', parseFloat(v))} />,
      value: row => row.moq,
    },
    {
      key: 'leadTimeDays', header: 'Lead', width: 70, align: 'right',
      render: row => <InlineEdit value={row.leadTimeDays} type="number" min={0} step={1} suffix="d" width={60} onSave={v => patch(row.id, 'leadTimeDays', parseInt(v))} />,
      value: row => row.leadTimeDays,
    },
    {
      key: 'incoterm', header: 'Incoterm', width: 110,
      render: row => (
        <InlineEdit
          value={row.incoterm}
          type="select"
          options={INCOTERMS}
          width={95}
          onSave={v => patch(row.id, 'incoterm', v || null)}
        />
      ),
      value: row => row.incoterm ?? '',
    },
    {
      key: 'paymentTerms', header: 'Payment', width: 130,
      render: row => (
        <InlineEdit
          value={row.paymentTerms}
          type="select"
          options={PAYMENT_TERMS}
          width={115}
          onSave={v => patch(row.id, 'paymentTerms', v || null)}
        />
      ),
      value: row => row.paymentTerms ?? '',
    },
    {
      key: 'qualityRating', header: 'Rating', width: 110, sortable: false,
      render: row => <RatingEdit value={row.qualityRating} onSave={v => patch(row.id, 'qualityRating', v)} />,
      value: row => row.qualityRating ?? 0,
    },
    {
      key: 'actions', header: '', width: 130, sortable: false,
      render: row => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Btn onClick={() => setPriceModal(row)}>Price</Btn>
          <Btn onClick={() => setHistSiId(row.id)}>History</Btn>
        </div>
      ),
    },
  ];

  // Items already added for the selected supplier
  const existingItemIds = useMemo(() => new Set(items.filter(si => si.supplierId === selectedId).map(si => si.itemId)), [items, selectedId]);
  const selectedSupplier = suppliers.find(s => s.id === selectedId);

  return (
    <>
      {priceModal && <PriceModal si={priceModal} onClose={() => setPriceModal(null)} onSaved={updated => { setItems(prev => prev.map(si => si.id === priceModal!.id ? { ...si, lastPrice: updated.lastPrice, priceValidFrom: updated.priceValidFrom, priceValidUntil: updated.priceValidUntil } : si)); setPriceModal(null); }} />}
      {histSiId   && <PriceHistoryPanel siId={histSiId} onClose={() => setHistSiId(null)} />}
      {addModal && selectedId && (
        <AddItemModal
          supplierId={selectedId}
          supplierName={selectedSupplier?.name ?? ''}
          existingItemIds={existingItemIds}
          purchasableItems={purchasableItems}
          onClose={() => setAddModal(false)}
          onSaved={newSI => {
            setItems(prev => [...prev, newSI]);
            setAddModal(false);
          }}
        />
      )}

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Filter by supplier</div>
          <div style={{ maxWidth: 400 }}>
            <SearchSelect
              options={suppliers.map(s => {
                const n = counts[s.id] ?? 0;
                return {
                  value:    s.id,
                  label:    `${s.code} — ${s.name}`,
                  sublabel: n > 0 ? `${n} item${n !== 1 ? 's' : ''}` : 'No items configured',
                };
              })}
              value={selectedId}
              onChange={id => { setSelectedId(id); reset(); }}
              placeholder="All suppliers"
              clearLabel="— All suppliers —"
              minWidth={400}
            />
          </div>
        </div>
        <ERPFilterBar filters={BY_SUPPLIER_FILTERS} values={values} onChange={setValue} onReset={reset} activeCount={activeCount} />
        {selectedId && (
          <button onClick={() => setAddModal(true)}
            style={{ marginLeft: 'auto', padding: '7px 14px', borderRadius: 7, fontSize: 12, fontWeight: 600, cursor: 'pointer', background: 'linear-gradient(135deg,var(--accent-pressed),var(--accent-mid))', border: 'none', color: 'white', fontFamily: "'IBM Plex Sans',sans-serif", whiteSpace: 'nowrap', boxShadow: '0 2px 8px rgba(234,88,12,0.3)' }}>
            + Add Item
          </button>
        )}
      </div>

      <ERPTable<SupplierItem>
        columns={columns} data={filtered} rowKey={r => r.id}
        loading={false} emptyMessage="No supplier-item records found."
        exportFilename="supplier-price-list" maxHeight="calc(100vh - 400px)"
      />
    </>
  );
}

// ─── Tab 2: By Item (Benchmark) ───────────────────────────────────────────────

function TabByItem({ allItems, items, counts }: { allItems: SupplierItem[]; items: Item[]; counts: Record<string, number> }) {
  const [selectedId, setSelectedId] = useState('');
  const [sis,        setSis]        = useState<SupplierItem[]>(allItems);
  const [priceModal, setPriceModal] = useState<SupplierItem | null>(null);
  const [histSiId,   setHistSiId]   = useState<string | null>(null);

  const { values, setValue, reset, activeCount } = useERPFilters(BY_SUPPLIER_FILTERS);

  const baseFiltered = useMemo(() => {
    const pool = selectedId ? sis.filter(si => si.itemId === selectedId) : sis;
    return [...pool].sort((a, b) => {
      if (a.isPreferred !== b.isPreferred) return a.isPreferred ? -1 : 1;
      return (a.lastPrice ?? Infinity) - (b.lastPrice ?? Infinity);
    });
  }, [sis, selectedId]);

  const filtered = useMemo(() => applyERPFilters(baseFiltered, BY_SUPPLIER_FILTERS, values), [baseFiltered, values]);
  const cheapest = useMemo(() => filtered.find(si => si.lastPrice != null && !si.isBlocked), [filtered]);

  const patch = useCallback(async (id: string, field: string, val: any) => {
    await supplierItemsApi.update(id, { [field]: val });
    setSis(prev => prev.map(si => si.id === id ? { ...si, [field]: val } : si));
  }, []);

  const handlePreferred = useCallback((newId: string, itemId: string) => {
    setSis(prev => prev.map(si =>
      si.itemId === itemId ? { ...si, isPreferred: si.id === newId } : si
    ));
  }, []);

  const columns: ERPColumn<SupplierItem>[] = [
    { key: 'rank', header: '#', width: 40, align: 'center', render: (_, i) => <span style={{ ...MONO, color: 'rgba(255,255,255,0.3)', fontSize: 11 }}>{i + 1}</span>, sortable: false },
    {
      key: 'supplier', header: 'Supplier', width: 220,
      render: row => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div>
            <div style={{ ...MONO, color: 'var(--accent-strong)', fontSize: 11 }}>{row.supplier.code}</div>
            <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12 }}>{row.supplier.name}</div>
          </div>
          {row.id === cheapest?.id && <span style={{ fontSize: 10, color: 'var(--success)', background: 'rgba(74,222,128,0.1)', border: '0.5px solid rgba(74,222,128,0.25)', borderRadius: 5, padding: '1px 7px' }}>Lowest</span>}
        </div>
      ),
      value: row => `${row.supplier.code} ${row.supplier.name}`,
    },
    {
      key: 'supplierItemCode', header: 'Supplier Code', width: 130,
      render: row => (
        <InlineEdit
          value={row.supplierItemCode}
          type="text"
          width={110}
          onSave={v => patch(row.id, 'supplierItemCode', v || null)}
        />
      ),
      value: row => row.supplierItemCode ?? '',
    },
    {
      key: 'lastPrice', header: 'Price', width: 120, align: 'right',
      render: row => <span style={{ ...MONO, color: row.lastPrice ? 'var(--warning)' : 'rgba(255,255,255,0.2)', fontSize: 13, fontWeight: row.lastPrice ? 600 : 400 }}>{fmtAmt(row.lastPrice, row.currency)}</span>,
      value: row => row.lastPrice ?? 0,
    },
    {
      key: 'validity', header: 'Validity', width: 150, sortable: false,
      render: row => (
        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
          <div>{fmtDate(row.priceValidFrom)}</div>
          <div style={{ color: 'rgba(255,255,255,0.25)' }}>{fmtDate(row.priceValidUntil)}</div>
        </div>
      ),
    },
    { key: 'priceExpiryStatus', header: 'Expiry', width: 90, render: row => <ExpiryBadge status={row.priceExpiryStatus} days={row.priceExpiryDaysLeft} /> },
    {
      key: 'isPreferred', header: 'Preferred', width: 115, sortable: true,
      render: row => <PreferredToggle si={row} onSaved={handlePreferred} />,
      value: row => row.isPreferred ? 1 : 0,
    },
    {
      key: 'status', header: 'Status', width: 100, sortable: false,
      render: row => <BlockToggle si={row} onSaved={() => setSis(prev => [...prev])} />,
    },
    {
      key: 'moq', header: 'MOQ', width: 80, align: 'right',
      render: row => <InlineEdit value={Number(row.moq)} type="number" min={0} step={1} width={70} onSave={v => patch(row.id, 'moq', parseFloat(v))} />,
      value: row => row.moq,
    },
    {
      key: 'leadTimeDays', header: 'Lead', width: 70, align: 'right',
      render: row => <InlineEdit value={row.leadTimeDays} type="number" min={0} step={1} suffix="d" width={60} onSave={v => patch(row.id, 'leadTimeDays', parseInt(v))} />,
      value: row => row.leadTimeDays,
    },
    {
      key: 'incoterm', header: 'Incoterm', width: 110,
      render: row => (
        <InlineEdit value={row.incoterm} type="select" options={INCOTERMS} width={95} onSave={v => patch(row.id, 'incoterm', v || null)} />
      ),
      value: row => row.incoterm ?? '',
    },
    {
      key: 'paymentTerms', header: 'Payment', width: 130,
      render: row => (
        <InlineEdit value={row.paymentTerms} type="select" options={PAYMENT_TERMS} width={115} onSave={v => patch(row.id, 'paymentTerms', v || null)} />
      ),
      value: row => row.paymentTerms ?? '',
    },
    {
      key: 'qualityRating', header: 'Rating', width: 110, sortable: false,
      render: row => <RatingEdit value={row.qualityRating} onSave={v => patch(row.id, 'qualityRating', v)} />,
      value: row => row.qualityRating ?? 0,
    },
    {
      key: 'actions', header: '', width: 130, sortable: false,
      render: row => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Btn onClick={() => setPriceModal(row)}>Price</Btn>
          <Btn onClick={() => setHistSiId(row.id)}>History</Btn>
        </div>
      ),
    },
  ];

  return (
    <>
      {priceModal && <PriceModal si={priceModal} onClose={() => setPriceModal(null)} onSaved={updated => { setSis(prev => prev.map(si => si.id === priceModal!.id ? { ...si, lastPrice: updated.lastPrice, priceValidFrom: updated.priceValidFrom, priceValidUntil: updated.priceValidUntil } : si)); setPriceModal(null); }} />}
      {histSiId   && <PriceHistoryPanel siId={histSiId} onClose={() => setHistSiId(null)} />}

      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Filter by item</div>
          <div style={{ maxWidth: 400 }}>
            <SearchSelect
              options={items.map(it => {
                const n = counts[it.id] ?? 0;
                return { value: it.id, label: `${it.code} — ${it.name}`, sublabel: n > 0 ? `${n} supplier${n !== 1 ? 's' : ''}` : 'No suppliers configured' };
              })}
              value={selectedId}
              onChange={id => { setSelectedId(id); reset(); }}
              placeholder="All items"
              clearLabel="— All items —"
              minWidth={400}
            />
          </div>
        </div>
        <ERPFilterBar filters={BY_SUPPLIER_FILTERS} values={values} onChange={setValue} onReset={reset} activeCount={activeCount} />
      </div>

      {cheapest && selectedId && (
        <div style={{ background: 'rgba(74,222,128,0.04)', border: '0.5px solid rgba(74,222,128,0.15)', borderRadius: 8, padding: '9px 16px', marginBottom: 14, display: 'flex', alignItems: 'center', gap: 10, fontSize: 12 }}>
          <span style={{ color: 'rgba(255,255,255,0.5)' }}>Lowest price:</span>
          <span style={{ ...MONO, color: 'var(--success)', fontWeight: 600, fontSize: 13 }}>{fmtAmt(cheapest.lastPrice, cheapest.currency)}</span>
          <span style={{ color: 'rgba(255,255,255,0.3)' }}>—</span>
          <span style={{ color: 'var(--text-strong)' }}>{cheapest.supplier.name}</span>
        </div>
      )}

      <ERPTable<SupplierItem>
        columns={columns} data={filtered} rowKey={r => r.id}
        loading={false} emptyMessage="No supplier-item records found."
        exportFilename="item-benchmark" maxHeight="calc(100vh - 400px)"
      />
    </>
  );
}

// ─── Tab 3: Expiry Alerts ─────────────────────────────────────────────────────

const ALERT_FILTERS: ERPFilter<any>[] = [
  {
    key: 'expiryStatus', label: 'Severity', type: 'multiselect',
    options: [
      { value: 'expired',       label: 'Expired',  color: '#ef4444', bg: 'rgba(239,68,68,0.1)',    border: 'rgba(239,68,68,0.3)'   },
      { value: 'expires_today', label: 'Today',    color: 'var(--accent-mid)', bg: 'rgba(249,115,22,0.1)',   border: 'rgba(249,115,22,0.3)'  },
      { value: 'critical',      label: 'Critical', color: 'var(--warning)', bg: 'rgba(251,191,36,0.1)',   border: 'rgba(251,191,36,0.3)'  },
      { value: 'warning',       label: 'Warning',  color: 'var(--accent-violet)', bg: 'rgba(167,139,250,0.1)',  border: 'rgba(167,139,250,0.3)' },
    ],
    filterFn: (row, val) => (val as string[]).includes(row.expiryStatus),
  },
];

function TabAlerts() {
  const [rows,       setRows]       = useState<any[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [days,       setDays]       = useState<number | null>(null);
  const [priceModal, setPriceModal] = useState<SupplierItem | null>(null);
  const [histSiId,   setHistSiId]   = useState<string | null>(null);

  const { values, setValue, reset, activeCount } = useERPFilters(ALERT_FILTERS);

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await supplierItemsApi.expiringPrices(days)); }
    catch { setRows([]); }
    finally { setLoading(false); }
  }, [days]);

  useEffect(() => { load(); }, [load]);

  const filtered = useMemo(() => applyERPFilters(rows, ALERT_FILTERS, values), [rows, values]);

  const counts = useMemo(() => ({
    expired:       rows.filter(r => r.expiryStatus === 'expired').length,
    expires_today: rows.filter(r => r.expiryStatus === 'expires_today').length,
    critical:      rows.filter(r => r.expiryStatus === 'critical').length,
    warning:       rows.filter(r => r.expiryStatus === 'warning').length,
  }), [rows]);

  const columns: ERPColumn<any>[] = [
    {
      key: 'item', header: 'Item', width: 200,
      render: row => (
        <div>
          <div style={{ ...MONO, color: 'var(--accent-strong)', fontSize: 11 }}>{row.item.code}</div>
          <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 12, marginTop: 1 }}>{row.item.name}</div>
        </div>
      ),
      value: row => `${row.item.code} ${row.item.name}`,
    },
    {
      key: 'supplier', header: 'Supplier', width: 180,
      render: row => (
        <div>
          <div style={{ ...MONO, color: 'rgba(255,255,255,0.6)', fontSize: 11 }}>{row.supplier.code}</div>
          <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>{row.supplier.name}</div>
        </div>
      ),
      value: row => `${row.supplier.code} ${row.supplier.name}`,
    },
    {
      key: 'lastPrice', header: 'Current Price', width: 130, align: 'right',
      render: row => <span style={{ ...MONO, color: 'var(--warning)', fontSize: 13, fontWeight: 600 }}>{fmtAmt(row.lastPrice, row.currency)}</span>,
      value: row => row.lastPrice ?? 0,
    },
    { key: 'priceValidFrom',  header: 'Valid From', width: 110, render: row => <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{fmtDate(row.priceValidFrom)}</span> },
    { key: 'priceValidUntil', header: 'Expires',    width: 110, render: row => <span style={{ fontSize: 11, color: row.expiryStatus === 'expired' ? 'var(--danger)' : 'var(--warning)' }}>{fmtDate(row.priceValidUntil)}</span> },
    { key: 'expiryStatus',    header: 'Status',     width: 100, render: row => <ExpiryBadge status={row.expiryStatus} days={row.daysUntilExpiry} /> },
    {
      key: 'actions', header: '', width: 160, sortable: false,
      render: row => (
        <div style={{ display: 'flex', gap: 6 }}>
          <Btn onClick={() => setPriceModal(row)} variant="primary">Renew Price</Btn>
          <Btn onClick={() => setHistSiId(row.id)}>History</Btn>
        </div>
      ),
    },
  ];

  return (
    <>
      {priceModal && <PriceModal si={priceModal} onClose={() => setPriceModal(null)} onSaved={() => { setPriceModal(null); load(); }} />}
      {histSiId   && <PriceHistoryPanel siId={histSiId} onClose={() => setHistSiId(null)} />}

      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16, flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Alert window</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => setDays(null)}
            style={{ padding: '5px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer', ...MONO, border: `0.5px solid ${days === null ? 'rgba(251,146,60,0.5)' : 'rgba(255,255,255,0.1)'}`, background: days === null ? 'rgba(251,146,60,0.12)' : 'rgba(255,255,255,0.03)', color: days === null ? 'var(--accent-strong)' : 'rgba(255,255,255,0.4)' }}>
            All
          </button>
          {[15, 30, 60, 90].map(d => (
            <button key={d} onClick={() => setDays(d)}
              style={{ padding: '5px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer', ...MONO, border: `0.5px solid ${days === d ? 'rgba(251,146,60,0.5)' : 'rgba(255,255,255,0.1)'}`, background: days === d ? 'rgba(251,146,60,0.12)' : 'rgba(255,255,255,0.03)', color: days === d ? 'var(--accent-strong)' : 'rgba(255,255,255,0.4)' }}>
              {d}d
            </button>
          ))}
          </div>
        </div>
        <ERPFilterBar filters={ALERT_FILTERS} values={values} onChange={setValue} onReset={reset} activeCount={activeCount} />
        <div style={{ display: 'flex', gap: 20, marginLeft: 'auto' }}>
          {[
            { label: 'Expired',  count: counts.expired,       color: '#ef4444' },
            { label: 'Today',    count: counts.expires_today, color: 'var(--accent-mid)' },
            { label: 'Critical', count: counts.critical,      color: 'var(--warning)' },
            { label: 'Warning',  count: counts.warning,       color: 'var(--accent-violet)' },
          ].map(({ label, count, color }) => (
            <div key={label} style={{ textAlign: 'center' }}>
              <div style={{ ...MONO, fontSize: 20, fontWeight: 700, color }}>{count}</div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      <ERPTable<any>
        columns={columns} data={filtered} rowKey={r => r.id}
        loading={loading}
        emptyMessage={rows.length === 0 ? (days === null ? 'No price records with expiry dates found.' : `No prices expiring within ${days} days.`) : 'No results match current filters.'}
        exportFilename="expiring-prices" maxHeight="calc(100vh - 480px)"
      />
    </>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SupplierItemsPage() {
  const [tab,            setTab]            = useState<Tab>('by_supplier');
  const [allSI,          setAllSI]          = useState<SupplierItem[]>([]);
  const [suppliers,      setSuppliers]      = useState<Supplier[]>([]);
  const [items,          setItems]          = useState<Item[]>([]);
  const [supplierCounts, setSupplierCounts] = useState<Record<string, number>>({});
  const [itemCounts,     setItemCounts]     = useState<Record<string, number>>({});
  const [loading,        setLoading]        = useState(true);

  useEffect(() => {
    Promise.all([
      supplierItemsApi.getAll(),
      suppliersApi.getAll(),
      itemsApi.getPurchasable(),
      supplierItemsApi.countsBySupplier(),
      supplierItemsApi.countsByItem(),
    ])
      .then(([si, sup, itm, supCounts, itmCounts]) => {
        setAllSI(si);
        setSuppliers(sup);
        setItems(itm);
        setSupplierCounts(supCounts);
        setItemCounts(itmCounts);
      })
      .catch(console.error)
      .finally(() => setLoading(false));
  }, []);

  const TABS: { id: Tab; label: string }[] = [
    { id: 'by_supplier', label: 'By Supplier'  },
    { id: 'by_item',     label: 'By Item'       },
    { id: 'alerts',      label: 'Expiry Alerts' },
  ];

  return (
    <ERPShell>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 4px; height: 4px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: rgba(251,146,60,0.2); border-radius: 2px; }
      `}</style>

      <div style={{ padding: '24px 28px', minHeight: '100vh', background: '#08061a', fontFamily: "'IBM Plex Sans',sans-serif", color: 'var(--text-strong)' }}>

        <div style={{ marginBottom: 24 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 600, color: 'var(--text-strong)', letterSpacing: '-0.02em' }}>Supplier Price List</h1>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'rgba(255,255,255,0.35)' }}>
            Manage prices, validity dates and commercial conditions per item–supplier combination
          </p>
        </div>

        <div style={{ display: 'flex', gap: 2, marginBottom: 24, borderBottom: '0.5px solid rgba(255,255,255,0.07)' }}>
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              style={{ padding: '10px 20px', fontSize: 13, fontFamily: "'IBM Plex Sans',sans-serif", fontWeight: tab === t.id ? 600 : 400, cursor: 'pointer', background: 'none', border: 'none', color: tab === t.id ? 'var(--accent-strong)' : 'rgba(255,255,255,0.4)', borderBottom: tab === t.id ? '2px solid var(--accent-strong)' : '2px solid transparent', marginBottom: -1, transition: 'color 0.15s' }}>
              {t.label}
            </button>
          ))}
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '80px 20px', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Loading...</div>
        ) : (
          <>
            {tab === 'by_supplier' && <TabBySupplier allItems={allSI} suppliers={suppliers} purchasableItems={items} counts={supplierCounts} />}
            {tab === 'by_item'     && <TabByItem     allItems={allSI} items={items} counts={itemCounts} />}
            {tab === 'alerts'      && <TabAlerts />}
          </>
        )}
      </div>
    </ERPShell>
  );
}