// ============================================================================
// FILE: frontend/app/procurement/suppliers/page.tsx
// ============================================================================
"use client";

import { useEffect, useState, useCallback, useMemo } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import { ERPTable, ERPColumn } from '@/components/ui/ERPTable';
import { ERPFilterBar, ERPFilter, useERPFilters, applyERPFilters } from '@/components/ui/ERPFilterBar';
import { suppliersApi } from '@/lib/api/suppliers';
import { supplierItemsApi } from '@/lib/api/supplier-items';
import { Supplier, CreateSupplierDto, SupplierItem } from '@/lib/api/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const PAYMENT_TERMS = ['Net 15','Net 30','Net 45','Net 60','Net 90','Immediate','COD'];
const CURRENCIES    = ['USD','EUR','DOP','GBP','CAD','MXN'];
const INCOTERMS     = ['EXW','FCA','CPT','CIP','DAP','DPU','DDP','FAS','FOB','CFR','CIF'];
const TAX_TYPES     = ['ITBIS','Exempt','Zero Rate','N/A'];
const COUNTRIES     = [
  { code:'DO', name:'Dominican Republic' }, { code:'US', name:'United States' },
  { code:'MX', name:'Mexico' }, { code:'ES', name:'Spain' },
  { code:'DE', name:'Germany' }, { code:'CN', name:'China' },
  { code:'BR', name:'Brazil' }, { code:'CO', name:'Colombia' },
  { code:'PA', name:'Panama' }, { code:'GT', name:'Guatemala' },
  { code:'HT', name:'Haiti' }, { code:'PR', name:'Puerto Rico' },
];

const EMPTY_FORM: CreateSupplierDto = {
  code:'', name:'', legalName:'', taxId:'', taxType:'',
  phone:'', email:'', website:'',
  contactName:'', contactPhone:'', contactEmail:'',
  address:'', city:'', country:'',
  paymentTerms:'', currency:'USD', incoterms:'',
  creditLimit: undefined, minimumOrderAmount: undefined, minimumOrderCurrency:'USD',
  deliveryLeadDays: undefined, qualityRating: undefined,
  category:'', isPreferred: false,
  bankName:'', bankAccount:'', bankRouting:'',
  notes:'',
};

const MONO: React.CSSProperties = { fontFamily:"'IBM Plex Mono',monospace" };

function fmtAmt(v?: number | string | null) {
  if (v === null || v === undefined || v === '') return '—';
  return new Intl.NumberFormat('en-US', { style:'currency', currency:'USD' }).format(Number(v));
}

// ─── Badges ───────────────────────────────────────────────────────────────────

function ActiveBadge({ active }: { active: boolean }) {
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'2px 9px', borderRadius:20, fontSize:11, fontWeight:500, color:active ? '#4ade80' : 'rgba(255,255,255,0.35)', background:active ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.05)', border:`0.5px solid ${active ? 'rgba(74,222,128,0.2)' : 'rgba(255,255,255,0.08)'}` }}>
      <span style={{ width:5, height:5, borderRadius:'50%', background:active ? '#4ade80' : 'rgba(255,255,255,0.2)', flexShrink:0 }} />
      {active ? 'Active' : 'Inactive'}
    </span>
  );
}

function StarRating({ value }: { value?: number | null }) {
  if (!value) return <span style={{ color:'rgba(255,255,255,0.2)', fontSize:12 }}>—</span>;
  const v = Number(value);
  return (
    <div style={{ display:'flex', alignItems:'center', gap:3 }}>
      {[1,2,3,4,5].map(i => (
        <span key={i} style={{ fontSize:11, color: i <= Math.round(v) ? '#fbbf24' : 'rgba(255,255,255,0.15)' }}>★</span>
      ))}
      <span style={{ fontSize:11, color:'rgba(255,255,255,0.4)', marginLeft:2 }}>{v.toFixed(1)}</span>
    </div>
  );
}

// ─── Supplier Modal ───────────────────────────────────────────────────────────

function SupplierModal({ open, onClose, onSaved, initial }: {
  open: boolean; onClose: () => void; onSaved: () => void; initial: Supplier | null;
}) {
  const [form,       setForm]       = useState<CreateSupplierDto>(EMPTY_FORM);
  const [tab,        setTab]        = useState<'general' | 'contact' | 'commercial' | 'banking'>('general');
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState('');

  useEffect(() => {
    if (open) {
      setError(''); setTab('general');
      if (initial) {
        const s = initial as any;
        setForm({
          code: s.code, name: s.name, legalName: s.legalName ?? '',
          taxId: s.taxId ?? '', taxType: s.taxType ?? '',
          phone: s.phone ?? '', email: s.email ?? '', website: s.website ?? '',
          contactName: s.contactName ?? '', contactPhone: s.contactPhone ?? '',
          contactEmail: s.contactEmail ?? '',
          address: s.address ?? '', city: s.city ?? '', country: s.country ?? '',
          paymentTerms: s.paymentTerms ?? '', currency: s.currency ?? 'USD',
          incoterms: s.incoterms ?? '',
          creditLimit: s.creditLimit ? Number(s.creditLimit) : undefined,
          minimumOrderAmount: s.minimumOrderAmount ? Number(s.minimumOrderAmount) : undefined,
          minimumOrderCurrency: s.minimumOrderCurrency ?? 'USD',
          deliveryLeadDays: s.deliveryLeadDays ?? undefined,
          qualityRating: s.qualityRating ? Number(s.qualityRating) : undefined,
          category: s.category ?? '', isPreferred: s.isPreferred ?? false,
          bankName: s.bankName ?? '', bankAccount: s.bankAccount ?? '',
          bankRouting: s.bankRouting ?? '', notes: s.notes ?? '',
        });
      } else {
        setForm(EMPTY_FORM);
      }
    }
  }, [open, initial]);

  const set = (key: keyof CreateSupplierDto) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }));

  const setNum = (key: keyof CreateSupplierDto) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value === '' ? undefined : Number(e.target.value) }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code.trim() || !form.name.trim()) { setError('Code and name are required.'); return; }
    setSubmitting(true); setError('');
    try {
      const payload = { ...form };
      // Clean empty strings to undefined
      (Object.keys(payload) as (keyof CreateSupplierDto)[]).forEach(k => {
        if (payload[k] === '') (payload as any)[k] = undefined;
      });
      if (initial) await suppliersApi.update(initial.id, payload);
      else          await suppliersApi.create(payload);
      onSaved(); onClose();
    } catch (err: any) { setError(err.response?.data?.message || 'Operation failed.'); }
    finally { setSubmitting(false); }
  };

  if (!open) return null;

  const F: React.CSSProperties = { background:'#0e0b1a', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:7, padding:'9px 12px', fontSize:13, fontFamily:"'IBM Plex Sans',sans-serif", color:'#f1ede8', outline:'none', width:'100%' };
  const L: React.CSSProperties = { fontSize:11, fontWeight:500, letterSpacing:'0.08em', textTransform:'uppercase', color:'rgba(251,146,60,0.6)' };
  const SL: React.CSSProperties = { fontSize:10, color:'rgba(255,255,255,0.3)', marginTop:-2 };

  const TABS = [
    { key:'general',    label:'General' },
    { key:'contact',    label:'Contact' },
    { key:'commercial', label:'Commercial' },
    { key:'banking',    label:'Banking' },
  ];

  return (
    <>
      <style>{`
        .sm-overlay{position:fixed;inset:0;z-index:400;background:rgba(0,0,0,0.65);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:24px}
        .sm-box{background:#0e0b1a;border:0.5px solid rgba(251,146,60,0.2);border-radius:14px;width:100%;max-width:620px;max-height:92vh;display:flex;flex-direction:column;box-shadow:0 24px 60px rgba(0,0,0,0.7);position:relative}
        .sm-box::before{content:'';position:absolute;top:0;left:30px;right:30px;height:1px;background:linear-gradient(90deg,transparent,rgba(251,146,60,0.4),transparent);pointer-events:none}
        .sm-hdr{display:flex;align-items:center;justify-content:space-between;padding:14px 20px 0;flex-shrink:0}
        .sm-tabs{display:flex;padding:0 20px;border-bottom:0.5px solid rgba(255,255,255,0.06);flex-shrink:0;overflow-x:auto}
        .sm-tab{padding:10px 14px;font-size:12px;cursor:pointer;color:rgba(255,255,255,0.4);border:none;border-bottom:2px solid transparent;background:none;font-family:'IBM Plex Sans',sans-serif;transition:color 0.15s;white-space:nowrap;flex-shrink:0}
        .sm-tab:hover{color:rgba(255,255,255,0.7)}
        .sm-tab-on{color:#fb923c !important;border-bottom-color:#fb923c !important}
        .sm-scroll{flex:1;overflow-y:auto;min-height:0}
        .sm-body{padding:16px 20px;display:flex;flex-direction:column;gap:12px}
        .sm-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        .sm-row3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
        .sm-field{display:flex;flex-direction:column;gap:5px}
        .sm-section{font-size:10px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.25);padding:4px 0 2px;border-bottom:0.5px solid rgba(255,255,255,0.06);margin-top:4px}
        .sm-error{background:rgba(239,68,68,0.1);border:0.5px solid rgba(239,68,68,0.25);border-radius:7px;padding:8px 12px;font-size:12px;color:#fca5a5}
        .sm-ftr{display:flex;justify-content:flex-end;gap:8px;padding:12px 20px 18px;border-top:0.5px solid rgba(255,255,255,0.06);flex-shrink:0}
        .sm-btn-cancel{background:rgba(255,255,255,0.05);border:0.5px solid rgba(255,255,255,0.1);border-radius:7px;padding:8px 16px;font-size:13px;font-family:'IBM Plex Sans',sans-serif;color:rgba(255,255,255,0.5);cursor:pointer}
        .sm-btn-save{background:linear-gradient(135deg,#c2410c,#ea580c,#f97316);border:none;border-radius:7px;padding:8px 20px;font-size:13px;font-weight:500;font-family:'IBM Plex Sans',sans-serif;color:white;cursor:pointer;box-shadow:0 3px 12px rgba(234,88,12,0.35)}
        .sm-btn-save:disabled{opacity:0.5;cursor:not-allowed}
        .sm-stars{display:flex;gap:4px;padding:4px 0}
        .sm-star{font-size:22px;cursor:pointer;transition:transform 0.1s}
        .sm-star:hover{transform:scale(1.15)}
      `}</style>

      <div className="sm-overlay">
        <div className="sm-box">
          <div className="sm-hdr">
            <span style={{ fontSize:14, fontWeight:500, color:'#f1ede8' }}>
              {initial ? `Edit — ${initial.code}` : 'New Supplier'}
            </span>
            <button onClick={onClose} style={{ width:24, height:24, borderRadius:6, background:'rgba(255,255,255,0.06)', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.45)', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
          </div>

          <div className="sm-tabs">
            {TABS.map(t => (
              <button key={t.key} type="button" className={`sm-tab${tab === t.key ? ' sm-tab-on' : ''}`} onClick={() => setTab(t.key as any)}>
                {t.label}
              </button>
            ))}
          </div>

          <div className="sm-scroll">
            <form onSubmit={handleSubmit}>
              <div className="sm-body">
                {error && <div className="sm-error">{error}</div>}

                {/* ── GENERAL ── */}
                {tab === 'general' && (
                  <>
                    <div className="sm-row">
                      <div className="sm-field">
                        <label style={L}>Code *</label>
                        <input style={F} placeholder="SUP-001" value={form.code} onChange={set('code')} required />
                      </div>
                      <div className="sm-field">
                        <label style={L}>Category</label>
                        <input style={F} placeholder="Manufacturing" value={form.category} onChange={set('category')} />
                      </div>
                    </div>
                    <div className="sm-field">
                      <label style={L}>Name *</label>
                      <input style={F} placeholder="Acme Corporation" value={form.name} onChange={set('name')} required />
                    </div>
                    <div className="sm-field">
                      <label style={L}>Legal Name</label>
                      <input style={F} placeholder="Acme Corporation S.R.L." value={form.legalName} onChange={set('legalName')} />
                    </div>
                    <div className="sm-row">
                      <div className="sm-field">
                        <label style={L}>Tax ID / RNC</label>
                        <input style={F} placeholder="123-45678-9" value={form.taxId} onChange={set('taxId')} />
                      </div>
                      <div className="sm-field">
                        <label style={L}>Tax Type</label>
                        <select style={{ ...F, cursor:'pointer' }} value={form.taxType} onChange={set('taxType')}>
                          <option value="">— Select —</option>
                          {TAX_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                    </div>

                    <div className="sm-section">Location</div>
                    <div className="sm-field">
                      <label style={L}>Address</label>
                      <input style={F} placeholder="Av. 27 de Febrero #123" value={form.address} onChange={set('address')} />
                    </div>
                    <div className="sm-row">
                      <div className="sm-field">
                        <label style={L}>City</label>
                        <input style={F} placeholder="Santo Domingo" value={form.city} onChange={set('city')} />
                      </div>
                      <div className="sm-field">
                        <label style={L}>Country</label>
                        <select style={{ ...F, cursor:'pointer' }} value={form.country} onChange={set('country')}>
                          <option value="">— Select country —</option>
                          {COUNTRIES.map(c => <option key={c.code} value={c.code}>{c.name}</option>)}
                        </select>
                      </div>
                    </div>

                    <div className="sm-section">Quality Rating</div>
                    <div className="sm-field">
                      <label style={L}>Initial Rating (1–5)</label>
                      <p style={SL}>Can be updated automatically by SupplierScore engine</p>
                      <div className="sm-stars">
                        {[1,2,3,4,5].map(i => (
                          <span key={i} className="sm-star"
                            onClick={() => setForm(f => ({ ...f, qualityRating: f.qualityRating === i ? undefined : i }))}
                            style={{ color: form.qualityRating && i <= form.qualityRating ? '#fbbf24' : 'rgba(255,255,255,0.2)' }}>
                            ★
                          </span>
                        ))}
                        {form.qualityRating && (
                          <span style={{ fontSize:12, color:'rgba(255,255,255,0.4)', alignSelf:'center', marginLeft:4 }}>
                            {form.qualityRating}.0
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="sm-field">
                      <label style={L}>Notes</label>
                      <textarea style={{ ...F, resize:'vertical', minHeight:60 } as React.CSSProperties} placeholder="Internal notes…" value={form.notes} onChange={set('notes')} />
                    </div>

                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <input type="checkbox" id="pref-chk" checked={form.isPreferred ?? false}
                        onChange={e => setForm(f => ({ ...f, isPreferred: e.target.checked }))}
                        style={{ accentColor:'#fb923c', cursor:'pointer' }} />
                      <label htmlFor="pref-chk" style={{ fontSize:12, color:'rgba(255,255,255,0.5)', cursor:'pointer' }}>
                        Mark as preferred / strategic supplier
                      </label>
                    </div>
                  </>
                )}

                {/* ── CONTACT ── */}
                {tab === 'contact' && (
                  <>
                    <div className="sm-section">Corporate Contact</div>
                    <div className="sm-row">
                      <div className="sm-field">
                        <label style={L}>Phone</label>
                        <input style={F} placeholder="+1-809-555-0123" value={form.phone} onChange={set('phone')} />
                      </div>
                      <div className="sm-field">
                        <label style={L}>Email</label>
                        <input style={F} type="email" placeholder="contact@acme.com" value={form.email} onChange={set('email')} />
                      </div>
                    </div>
                    <div className="sm-field">
                      <label style={L}>Website</label>
                      <input style={F} placeholder="https://acme.com" value={form.website} onChange={set('website')} />
                    </div>

                    <div className="sm-section">Operational Contact</div>
                    <p style={{ ...SL, margin:'-4px 0 2px', fontSize:11 }}>Person you call / email for orders and issues</p>
                    <div className="sm-field">
                      <label style={L}>Contact Name</label>
                      <input style={F} placeholder="Juan Pérez" value={form.contactName} onChange={set('contactName')} />
                    </div>
                    <div className="sm-row">
                      <div className="sm-field">
                        <label style={L}>Contact Phone</label>
                        <input style={F} placeholder="+1-809-555-0001" value={form.contactPhone} onChange={set('contactPhone')} />
                      </div>
                      <div className="sm-field">
                        <label style={L}>Contact Email</label>
                        <input style={F} type="email" placeholder="jperez@acme.com" value={form.contactEmail} onChange={set('contactEmail')} />
                      </div>
                    </div>
                  </>
                )}

                {/* ── COMMERCIAL ── */}
                {tab === 'commercial' && (
                  <>
                    <div className="sm-section">Payment & Currency</div>
                    <div className="sm-row">
                      <div className="sm-field">
                        <label style={L}>Payment Terms</label>
                        <select style={{ ...F, cursor:'pointer' }} value={form.paymentTerms} onChange={set('paymentTerms')}>
                          <option value="">— Select —</option>
                          {PAYMENT_TERMS.map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                      <div className="sm-field">
                        <label style={L}>Currency</label>
                        <select style={{ ...F, cursor:'pointer' }} value={form.currency} onChange={set('currency')}>
                          {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="sm-row">
                      <div className="sm-field">
                        <label style={L}>Incoterms</label>
                        <select style={{ ...F, cursor:'pointer' }} value={form.incoterms} onChange={set('incoterms')}>
                          <option value="">— Select —</option>
                          {INCOTERMS.map(i => <option key={i} value={i}>{i}</option>)}
                        </select>
                      </div>
                      <div className="sm-field">
                        <label style={L}>Delivery Lead Time (days)</label>
                        <input style={F} type="number" min="0" placeholder="0" value={form.deliveryLeadDays ?? ''} onChange={setNum('deliveryLeadDays')} />
                      </div>
                    </div>

                    <div className="sm-section">Credit & Minimums</div>
                    <div className="sm-row">
                      <div className="sm-field">
                        <label style={L}>Credit Limit</label>
                        <input style={F} type="number" min="0" step="0.01" placeholder="0.00" value={form.creditLimit ?? ''} onChange={setNum('creditLimit')} />
                      </div>
                      <div className="sm-field">
                        <label style={L}>Min. Order Amount</label>
                        <input style={F} type="number" min="0" step="0.01" placeholder="0.00" value={form.minimumOrderAmount ?? ''} onChange={setNum('minimumOrderAmount')} />
                      </div>
                    </div>
                    <div className="sm-row">
                      <div className="sm-field">
                        <label style={L}>Min. Order Currency</label>
                        <select style={{ ...F, cursor:'pointer' }} value={form.minimumOrderCurrency} onChange={set('minimumOrderCurrency')}>
                          {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                      </div>
                    </div>
                  </>
                )}

                {/* ── BANKING ── */}
                {tab === 'banking' && (
                  <>
                    <div className="sm-section">Bank Details</div>
                    <p style={{ ...SL, fontSize:11, margin:'-4px 0 4px' }}>Used for AP wire transfers</p>
                    <div className="sm-field">
                      <label style={L}>Bank Name</label>
                      <input style={F} placeholder="Banco Popular Dominicano" value={form.bankName} onChange={set('bankName')} />
                    </div>
                    <div className="sm-row">
                      <div className="sm-field">
                        <label style={L}>Account Number</label>
                        <input style={{ ...F, fontFamily:"'IBM Plex Mono',monospace" }} placeholder="123-456789-0" value={form.bankAccount} onChange={set('bankAccount')} />
                      </div>
                      <div className="sm-field">
                        <label style={L}>Routing / ABA / SWIFT</label>
                        <input style={{ ...F, fontFamily:"'IBM Plex Mono',monospace" }} placeholder="021000021" value={form.bankRouting} onChange={set('bankRouting')} />
                      </div>
                    </div>
                    <div style={{ background:'rgba(251,146,60,0.04)', border:'0.5px solid rgba(251,146,60,0.12)', borderRadius:8, padding:'10px 14px', marginTop:4 }}>
                      <div style={{ fontSize:11, color:'rgba(255,255,255,0.35)', lineHeight:1.6 }}>
                        🔒 Banking details are stored encrypted and only visible to users with AP access.
                      </div>
                    </div>
                  </>
                )}
              </div>

              <div className="sm-ftr">
                <button type="button" className="sm-btn-cancel" onClick={onClose}>Cancel</button>
                <button type="submit" className="sm-btn-save" disabled={submitting}>
                  {submitting ? 'Saving…' : initial ? 'Save Changes' : 'Create Supplier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Price List Drawer ────────────────────────────────────────────────────────

function PriceListDrawer({ supplier, onClose }: { supplier: Supplier; onClose: () => void }) {
  const [items, setItems]   = useState<SupplierItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch]   = useState('');

  useEffect(() => {
    supplierItemsApi.getBySupplier(supplier.id)
      .then(data => setItems(data))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [supplier.id]);

  const filtered = search.trim()
    ? items.filter(si =>
        si.item?.code?.toLowerCase().includes(search.toLowerCase()) ||
        si.item?.name?.toLowerCase().includes(search.toLowerCase()) ||
        (si as any).supplierItemCode?.toLowerCase().includes(search.toLowerCase())
      )
    : items;

  const preferred = filtered.filter(si => si.isPreferred);
  const others    = filtered.filter(si => !si.isPreferred);

  return (
    <div style={{ position:'fixed', inset:0, zIndex:400, display:'flex' }}>
      <div style={{ flex:1, background:'rgba(0,0,0,0.5)', backdropFilter:'blur(2px)' }} onClick={onClose} />
      <div style={{ width:680, background:'#0a0712', borderLeft:'0.5px solid rgba(251,146,60,0.15)', display:'flex', flexDirection:'column' }}>
        {/* Header */}
        <div style={{ padding:'16px 20px', borderBottom:'0.5px solid rgba(255,255,255,0.06)', flexShrink:0 }}>
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <div>
              <div style={{ fontSize:14, fontWeight:500, color:'#f1ede8' }}>{supplier.name}</div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.35)', marginTop:2 }}>
                <span style={{ ...MONO, color:'#fb923c' }}>{supplier.code}</span>
                {supplier.paymentTerms && <span style={{ marginLeft:10 }}>{supplier.paymentTerms}</span>}
                {supplier.currency && <span style={{ marginLeft:10 }}>{supplier.currency}</span>}
              </div>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:12, color:'rgba(255,255,255,0.3)' }}>{items.length} items</span>
              <button onClick={onClose} style={{ width:24, height:24, borderRadius:6, background:'rgba(255,255,255,0.06)', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.45)', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
            </div>
          </div>

          {/* Quick stats */}
          <div style={{ display:'flex', gap:10, marginTop:10 }}>
            {[
              { label:'Items', value: items.length, color:'#fb923c' },
              { label:'Preferred', value: items.filter(i => i.isPreferred).length, color:'#4ade80' },
              { label:'With Price', value: items.filter(i => i.lastPrice).length, color:'#60a5fa' },
            ].map(s => (
              <div key={s.label} style={{ background:'rgba(255,255,255,0.03)', border:'0.5px solid rgba(255,255,255,0.06)', borderRadius:6, padding:'5px 12px', display:'flex', gap:6, alignItems:'center' }}>
                <span style={{ fontSize:10, color:'rgba(255,255,255,0.3)', textTransform:'uppercase', letterSpacing:'0.08em' }}>{s.label}</span>
                <span style={{ fontSize:15, fontWeight:500, color:s.color, ...MONO }}>{s.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Search */}
        <div style={{ padding:'10px 20px', borderBottom:'0.5px solid rgba(255,255,255,0.04)', flexShrink:0 }}>
          <input
            value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search item code or name…"
            style={{ background:'rgba(255,255,255,0.04)', border:'0.5px solid rgba(255,255,255,0.09)', borderRadius:7, padding:'7px 12px', fontSize:12, fontFamily:"'IBM Plex Sans',sans-serif", color:'#e2dfd8', outline:'none', width:'100%' }}
          />
        </div>

        {/* List */}
        <div style={{ flex:1, overflowY:'auto', padding:'10px 20px', display:'flex', flexDirection:'column', gap:6 }}>
          {loading ? (
            <div style={{ textAlign:'center', padding:30, color:'rgba(255,255,255,0.25)', fontSize:13 }}>Loading…</div>
          ) : filtered.length === 0 ? (
            <div style={{ textAlign:'center', padding:30, color:'rgba(255,255,255,0.2)', fontSize:13 }}>
              {search ? `No items matching "${search}"` : 'No items assigned to this supplier yet.'}
            </div>
          ) : (
            <>
              {preferred.length > 0 && (
                <>
                  <div style={{ fontSize:10, fontWeight:500, letterSpacing:'0.1em', textTransform:'uppercase', color:'rgba(74,222,128,0.5)', padding:'4px 0 2px', borderBottom:'0.5px solid rgba(74,222,128,0.1)', marginBottom:2 }}>Preferred Items</div>
                  {preferred.map(si => <PriceRow key={si.id} si={si} />)}
                  {others.length > 0 && <div style={{ fontSize:10, fontWeight:500, letterSpacing:'0.1em', textTransform:'uppercase', color:'rgba(255,255,255,0.2)', padding:'8px 0 2px', borderBottom:'0.5px solid rgba(255,255,255,0.06)', marginBottom:2, marginTop:4 }}>Other Items</div>}
                </>
              )}
              {others.map(si => <PriceRow key={si.id} si={si} />)}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PriceRow({ si }: { si: SupplierItem }) {
  return (
    <div style={{ background:'rgba(255,255,255,0.02)', border:`0.5px solid ${si.isPreferred ? 'rgba(74,222,128,0.15)' : 'rgba(255,255,255,0.06)'}`, borderRadius:8, padding:'10px 14px', display:'flex', alignItems:'center', gap:12 }}>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <span style={{ ...MONO, fontSize:11, color:'#fb923c' }}>{si.item?.code}</span>
          {(si as any).supplierItemCode && (
            <span style={{ fontSize:10, color:'rgba(255,255,255,0.25)', background:'rgba(255,255,255,0.04)', padding:'1px 6px', borderRadius:4 }}>{(si as any).supplierItemCode}</span>
          )}
          {si.isPreferred && (
            <span style={{ fontSize:9, color:'#4ade80', background:'rgba(74,222,128,0.1)', border:'0.5px solid rgba(74,222,128,0.2)', padding:'1px 6px', borderRadius:10 }}>preferred</span>
          )}
        </div>
        <div style={{ fontSize:11, color:'rgba(255,255,255,0.45)', marginTop:2 }}>{si.item?.name}</div>
      </div>
      <div style={{ display:'flex', gap:14, alignItems:'center', flexShrink:0 }}>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:9, color:'rgba(255,255,255,0.25)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:2 }}>UOM</div>
          <span style={{ ...MONO, fontSize:12, color:'#fb923c' }}>{si.purchaseUom?.code ?? '—'}</span>
        </div>
        <div style={{ textAlign:'right' }}>
          <div style={{ fontSize:9, color:'rgba(255,255,255,0.25)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:2 }}>Last Price</div>
          <span style={{ ...MONO, fontSize:13, fontWeight:500, color: si.lastPrice ? '#e2dfd8' : 'rgba(255,255,255,0.2)' }}>
            {si.lastPrice ? `$${Number(si.lastPrice).toFixed(4)}` : '—'}
          </span>
        </div>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:9, color:'rgba(255,255,255,0.25)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:2 }}>MOQ</div>
          <span style={{ ...MONO, fontSize:12, color:'rgba(255,255,255,0.5)' }}>{(si as any).moq ?? 1}</span>
        </div>
        <div style={{ textAlign:'center' }}>
          <div style={{ fontSize:9, color:'rgba(255,255,255,0.25)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:2 }}>Lead</div>
          <span style={{ fontSize:12, color:'rgba(255,255,255,0.5)' }}>{si.leadTimeDays ?? 0}d</span>
        </div>
      </div>
    </div>
  );
}

// ─── Delete confirm ───────────────────────────────────────────────────────────

function DeleteConfirm({ supplier, onCancel, onConfirm, busy }: {
  supplier: Supplier; onCancel: () => void; onConfirm: () => void; busy: boolean;
}) {
  return (
    <div style={{ position:'fixed', inset:0, zIndex:400, background:'rgba(0,0,0,0.65)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ background:'#0e0b1a', border:'0.5px solid rgba(239,68,68,0.25)', borderRadius:14, width:'100%', maxWidth:400, padding:'24px 24px 20px', boxShadow:'0 24px 60px rgba(0,0,0,0.7)' }}>
        <div style={{ fontSize:14, fontWeight:500, color:'#f1ede8', marginBottom:10 }}>Delete supplier?</div>
        <div style={{ fontSize:13, color:'rgba(255,255,255,0.5)', marginBottom:20, lineHeight:1.5 }}>
          <strong style={{ color:'#f1ede8' }}>{supplier.name}</strong> ({supplier.code}) will be soft-deleted.
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
          <button onClick={onCancel} style={{ background:'rgba(255,255,255,0.05)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:7, padding:'8px 16px', fontSize:13, fontFamily:"'IBM Plex Sans',sans-serif", color:'rgba(255,255,255,0.5)', cursor:'pointer' }}>Cancel</button>
          <button onClick={onConfirm} disabled={busy} style={{ background:'rgba(239,68,68,0.15)', border:'0.5px solid rgba(239,68,68,0.35)', borderRadius:7, padding:'8px 16px', fontSize:13, fontWeight:500, fontFamily:"'IBM Plex Sans',sans-serif", color:'#f87171', cursor:busy ? 'not-allowed' : 'pointer', opacity:busy ? 0.5 : 1 }}>
            {busy ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Columns ──────────────────────────────────────────────────────────────────

function SUPPLIER_COLUMNS(
  onEdit: (s: Supplier) => void,
  onDelete: (s: Supplier) => void,
  onPriceList: (s: Supplier) => void,
): ERPColumn<Supplier>[] {
  return [
    {
      key: 'code', header: 'Code', width: 120, sortable: true,
      value: r => r.code,
      render: r => (
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <span style={{ ...MONO, fontSize:12, color:'#fb923c' }}>{r.code}</span>
          {(r as any).isPreferred && <span style={{ fontSize:9, color:'#fbbf24', background:'rgba(251,191,36,0.1)', border:'0.5px solid rgba(251,191,36,0.2)', padding:'1px 5px', borderRadius:10 }}>⭐</span>}
        </div>
      ),
    },
    {
      key: 'name', header: 'Name', sortable: true,
      value: r => r.name,
      render: r => (
        <div>
          <div style={{ color:'#e2dfd8', fontWeight:500 }}>{r.name}</div>
          {r.legalName && r.legalName !== r.name && <div style={{ fontSize:11, color:'rgba(255,255,255,0.3)', marginTop:2 }}>{r.legalName}</div>}
          {(r as any).city && <div style={{ fontSize:10, color:'rgba(255,255,255,0.25)', marginTop:1 }}>{(r as any).city}{(r as any).country ? ` · ${(r as any).country}` : ''}</div>}
        </div>
      ),
    },
    {
      key: 'category', header: 'Category', width: 120, sortable: true,
      value: r => r.category ?? '',
      render: r => r.category
        ? <span style={{ display:'inline-flex', padding:'2px 7px', borderRadius:20, fontSize:10, fontWeight:500, color:'#a78bfa', background:'rgba(167,139,250,0.1)', border:'0.5px solid rgba(167,139,250,0.2)' }}>{r.category}</span>
        : <span style={{ color:'rgba(255,255,255,0.25)', fontSize:12 }}>—</span>,
    },
    {
      key: 'contact', header: 'Contact', sortable: false,
      render: r => {
        const s = r as any;
        return (
          <div>
            {s.contactName && <div style={{ fontSize:12, color:'#e2dfd8' }}>{s.contactName}</div>}
            {r.email && <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)' }}>{r.email}</div>}
            {r.phone && <div style={{ fontSize:11, color:'rgba(255,255,255,0.35)', ...MONO }}>{r.phone}</div>}
          </div>
        );
      },
    },
    {
      key: 'paymentTerms', header: 'Terms', width: 85, sortable: true,
      value: r => r.paymentTerms ?? '',
      render: r => <span style={{ fontSize:12, color:'rgba(255,255,255,0.5)' }}>{r.paymentTerms || '—'}</span>,
    },
    {
      key: 'creditLimit', header: 'Credit', width: 100, align:'right', sortable: true,
      value: r => r.creditLimit ? Number(r.creditLimit) : 0,
      render: r => <span style={{ ...MONO, fontSize:11, color: r.creditLimit ? '#e2dfd8' : 'rgba(255,255,255,0.2)' }}>{fmtAmt(r.creditLimit)}</span>,
    },
    {
      key: 'qualityRating', header: 'Rating', width: 110, sortable: true,
      value: r => (r as any).qualityRating ? Number((r as any).qualityRating) : 0,
      render: r => <StarRating value={(r as any).qualityRating} />,
    },
    {
      key: 'isActive', header: 'Status', width: 90, sortable: true,
      value: r => r.isActive ? 'active' : 'inactive',
      render: r => <ActiveBadge active={r.isActive} />,
    },
    {
      key: '_actions', header: '', width: 150, sortable: false,
      render: r => (
        <div style={{ display:'flex', gap:5 }}>
          <button className="sup-btn-price" onClick={e => { e.stopPropagation(); onPriceList(r); }}>Price List</button>
          <button className="sup-btn-edit"  onClick={e => { e.stopPropagation(); onEdit(r); }}>Edit</button>
          <button className="sup-btn-del"   onClick={e => { e.stopPropagation(); onDelete(r); }}>Del</button>
        </div>
      ),
    },
  ];
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function SuppliersPage() {
  const [suppliers,    setSuppliers]    = useState<Supplier[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState('');
  const [modalOpen,    setModalOpen]    = useState(false);
  const [editing,      setEditing]      = useState<Supplier | null>(null);
  const [deleting,     setDeleting]     = useState<Supplier | null>(null);
  const [priceListSup, setPriceListSup] = useState<Supplier | null>(null);
  const [deleteBusy,   setDeleteBusy]   = useState(false);

  const categories = useMemo(() => {
    const cats = [...new Set(suppliers.map(s => s.category).filter(Boolean))];
    return cats.map(c => ({ value: c!, label: c! }));
  }, [suppliers]);

  const filterDefs = useMemo<ERPFilter<Supplier>[]>(() => [
    { key:'category', label:'Category', type:'select', placeholder:'All Categories', options:categories, filterFn:(row,val) => row.category === val },
    { key:'paymentTerms', label:'Terms', type:'select', placeholder:'All Terms', options:PAYMENT_TERMS.map(t => ({ value:t, label:t })), filterFn:(row,val) => row.paymentTerms === val },
    { key:'currency', label:'Currency', type:'select', placeholder:'All', options:CURRENCIES.map(c => ({ value:c, label:c })), filterFn:(row,val) => row.currency === val },
    { key:'isPreferred', label:'Preferred', type:'boolean', placeholder:'Preferred only', filterFn:(row,val) => val === true ? !!(row as any).isPreferred : true },
    { key:'isActive', label:'Active only', type:'boolean', filterFn:(row,val) => val === true ? row.isActive : true },
  ], [categories]);

  const { values:filterVals, setValue:setFilterVal, reset:resetFilters, activeCount:filterCount } = useERPFilters(filterDefs);
  const filtered = useMemo(() => applyERPFilters(suppliers, filterDefs, filterVals), [suppliers, filterDefs, filterVals]);

  const stats = useMemo(() => ({
    total:     suppliers.length,
    active:    suppliers.filter(s => s.isActive).length,
    preferred: suppliers.filter(s => (s as any).isPreferred).length,
    inactive:  suppliers.filter(s => !s.isActive).length,
  }), [suppliers]);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      setSuppliers(await suppliersApi.getAll());
    } catch (err: any) { setError(err.message || 'Failed to load suppliers.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try { await suppliersApi.remove(deleting.id); setDeleting(null); fetchAll(); }
    catch (err: any) { setError(err.response?.data?.message || 'Delete failed.'); setDeleting(null); }
    finally { setDeleteBusy(false); }
  };

  return (
    <ERPShell breadcrumbs={['Home','Procurement','Suppliers']} title="Suppliers">
      <style>{`
        .sup-page{padding:0 18px 12px;display:flex;flex-direction:column;height:100%;overflow:hidden}
        .sup-btn-edit,.sup-btn-del,.sup-btn-price{padding:4px 8px;border-radius:6px;font-size:10px;font-family:'IBM Plex Sans',sans-serif;cursor:pointer;border:0.5px solid transparent;white-space:nowrap}
        .sup-btn-price{background:rgba(251,146,60,0.08);color:#fb923c;border-color:rgba(251,146,60,0.2)}
        .sup-btn-price:hover{background:rgba(251,146,60,0.14)}
        .sup-btn-edit{background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.55);border-color:rgba(255,255,255,0.1)}
        .sup-btn-edit:hover{background:rgba(255,255,255,0.09)}
        .sup-btn-del{background:rgba(239,68,68,0.08);color:#f87171;border-color:rgba(239,68,68,0.2)}
        .sup-btn-del:hover{background:rgba(239,68,68,0.14)}
        .sup-error{background:rgba(239,68,68,0.08);border:0.5px solid rgba(239,68,68,0.2);border-radius:8px;padding:10px 14px;margin-bottom:10px;font-size:13px;color:#fca5a5;flex-shrink:0}
      `}</style>

      <div className="sup-page">
        {/* Stats */}
        <div style={{ display:'flex', gap:10, marginBottom:10, flexShrink:0 }}>
          {[
            { label:'Total',     value:stats.total,     color:'#fb923c', border:'rgba(251,146,60,0.2)'  },
            { label:'Active',    value:stats.active,    color:'#4ade80', border:'rgba(74,222,128,0.2)'  },
            { label:'Preferred', value:stats.preferred, color:'#fbbf24', border:'rgba(251,191,36,0.2)'  },
            { label:'Inactive',  value:stats.inactive,  color:'#f87171', border:'rgba(248,113,113,0.2)' },
          ].map(s => (
            <div key={s.label} style={{ background:'rgba(10,7,18,0.7)', border:`0.5px solid ${s.border}`, borderRadius:8, padding:'8px 14px', display:'flex', flexDirection:'column', gap:2, minWidth:80 }}>
              <span style={{ fontSize:10, color:s.color, textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:500 }}>{s.label}</span>
              <span style={{ fontSize:22, fontWeight:500, color:'#f1ede8', fontFamily:"'IBM Plex Mono',monospace" }}>{s.value}</span>
            </div>
          ))}
        </div>

        {/* Toolbar */}
        <div style={{ display:'flex', alignItems:'flex-end', gap:10, marginBottom:10, flexShrink:0, flexWrap:'wrap' }}>
          <div style={{ flex:1 }}>
            <ERPFilterBar filters={filterDefs} values={filterVals} onChange={setFilterVal} onReset={resetFilters} activeCount={filterCount} />
          </div>
          <button onClick={() => { setEditing(null); setModalOpen(true); }}
            style={{ display:'flex', alignItems:'center', gap:6, background:'linear-gradient(135deg,#c2410c,#ea580c,#f97316)', border:'none', borderRadius:7, padding:'7px 14px', fontSize:12, fontWeight:500, fontFamily:"'IBM Plex Sans',sans-serif", color:'white', cursor:'pointer', boxShadow:'0 3px 12px rgba(234,88,12,0.3)', flexShrink:0, alignSelf:'flex-end' }}>
            + New Supplier
          </button>
        </div>

        {error && <div className="sup-error">{error}</div>}

        <div style={{ flex:1, minHeight:0, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          <ERPTable<Supplier>
            columns={SUPPLIER_COLUMNS(
              s => { setEditing(s); setModalOpen(true); },
              s => setDeleting(s),
              s => setPriceListSup(s),
            )}
            data={filtered}
            rowKey={r => r.id}
            loading={loading}
            exportFilename="suppliers"
            emptyMessage={filterCount ? 'No suppliers match your filters.' : 'No suppliers yet.'}
            defaultPageSize={25}
            maxHeight="100%"
            onRowClick={s => setPriceListSup(s)}
          />
        </div>
      </div>

      <SupplierModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={fetchAll} initial={editing} />

      {deleting && <DeleteConfirm supplier={deleting} onCancel={() => setDeleting(null)} onConfirm={handleDelete} busy={deleteBusy} />}

      {priceListSup && <PriceListDrawer supplier={priceListSup} onClose={() => setPriceListSup(null)} />}
    </ERPShell>
  );
}