"use client";

import { useEffect, useState, useCallback, useRef } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import { itemsApi } from '@/lib/api/items';
import { macroCategoriesApi } from '@/lib/api/macro-categories';
import { categoriesApi } from '@/lib/api/categories';
import { uomApi } from '@/lib/api/uom';
import { supplierItemsApi } from '@/lib/api/supplier-items';
import { suppliersApi } from '@/lib/api/suppliers';
import {
  Item, CreateItemDto, ItemType,
  MacroCategory, Category, UomUnit,
  SupplierItem, CreateSupplierItemDto,
} from '@/lib/api/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const ITEM_TYPES: { value: ItemType; label: string; color: string; bg: string; border: string }[] = [
  { value: 'raw_material',     label: 'Raw Material',     color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',  border: 'rgba(96,165,250,0.2)' },
  { value: 'finished_good',    label: 'Finished Good',    color: '#4ade80', bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.2)' },
  { value: 'work_in_progress', label: 'Work in Progress', color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.2)' },
  { value: 'service',          label: 'Service',          color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.2)' },
];

const UOM_TYPE_COLOR: Record<string, string> = {
  volume: '#60a5fa', mass: '#a78bfa', count: '#4ade80',
  length: '#fbbf24', area: '#fb923c', time: '#f87171',
};

const EMPTY_FORM: CreateItemDto = {
  code: '', name: '', itemType: 'raw_material', baseUom: 'PCS',
  description: '', valuationMethod: 'average',
  categoryId: undefined, consumptionGroupId: undefined,
  purchaseUomId: undefined, purchaseToConsumptionFactor: 1,
  storageUomId: undefined,  storageToConsumptionFactor: 1,
  consumptionUomId: undefined,
  standardCost: undefined, leadTimeDays: undefined,
  safetyStock: undefined, reorderPoint: undefined, reorderQuantity: undefined,
  isStockable: true, isPurchasable: true, isSaleable: true,
  isManufacturable: false, isLotTracked: false, isSerialTracked: false,
};

function getTypeConfig(t: ItemType) {
  return ITEM_TYPES.find(x => x.value === t) ?? ITEM_TYPES[0];
}

const FIELD: React.CSSProperties = {
  background: '#0e0b1a',
  border: '0.5px solid rgba(255,255,255,0.1)',
  borderRadius: 7, padding: '9px 12px', fontSize: 13,
  fontFamily: "'IBM Plex Sans',sans-serif",
  color: '#f1ede8', outline: 'none', width: '100%',
};

// ─── SearchSelect — panel uses position:fixed to escape any overflow container ─

interface SSOption { value: string; label: string; sublabel?: string; }

function SearchSelect({
  options, value, onChange,
  placeholder = 'Search…', clearLabel = '— None —',
}: {
  options: SSOption[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  clearLabel?: string;
}) {
  const [open,  setOpen]  = useState(false);
  const [query, setQuery] = useState('');
  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef   = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLInputElement>(null);
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});

  // Position panel using fixed coords from trigger bounding rect
  const openPanel = () => {
    if (!triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const panelH = 280; // max panel height

    if (spaceBelow >= panelH || spaceBelow >= 180) {
      // Open downward
      setPanelStyle({
        position: 'fixed',
        top: r.bottom + 4,
        left: r.left,
        width: r.width,
        zIndex: 9999,
      });
    } else {
      // Open upward
      setPanelStyle({
        position: 'fixed',
        bottom: window.innerHeight - r.top + 4,
        left: r.left,
        width: r.width,
        zIndex: 9999,
      });
    }
    setOpen(true);
    setQuery('');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  // Close on outside click — use mousedown on document but check both refs
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      const inTrigger = triggerRef.current?.contains(t);
      const inPanel   = panelRef.current?.contains(t);
      if (!inTrigger && !inPanel) {
        setOpen(false); setQuery('');
      }
    };
    // Use capture phase so we get the event before anything else
    document.addEventListener('mousedown', handler, true);
    return () => document.removeEventListener('mousedown', handler, true);
  }, [open]);

  const selected = options.find(o => o.value === value);
  const filtered = query.trim()
    ? options.filter(o =>
        o.label.toLowerCase().includes(query.toLowerCase()) ||
        (o.sublabel ?? '').toLowerCase().includes(query.toLowerCase())
      )
    : options;

  const select = (v: string) => { onChange(v); setOpen(false); setQuery(''); };

  return (
    <>
      {/* Trigger */}
      <div
        ref={triggerRef}
        onClick={() => open ? setOpen(false) : openPanel()}
        style={{
          background: '#0e0b1a',
          border: `0.5px solid ${open ? 'rgba(251,146,60,0.45)' : 'rgba(255,255,255,0.1)'}`,
          borderRadius: 7, padding: '9px 12px',
          fontSize: 13, fontFamily: "'IBM Plex Sans',sans-serif",
          color: selected ? '#f1ede8' : 'rgba(255,255,255,0.25)',
          cursor: 'pointer', display: 'flex', alignItems: 'center',
          justifyContent: 'space-between', gap: 8, userSelect: 'none',
          boxShadow: open ? '0 0 0 2px rgba(234,88,12,0.1)' : 'none',
          transition: 'border-color 0.15s, box-shadow 0.15s',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {selected ? selected.label : clearLabel}
        </span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
          style={{ flexShrink: 0, opacity: 0.4, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      {/* Panel — rendered via fixed position, escapes all overflow containers */}
      {open && (
        <div
          ref={panelRef}
          onMouseDown={e => e.stopPropagation()}
          style={{
            ...panelStyle,
            background: '#0e0b1a',
            border: '0.5px solid rgba(251,146,60,0.25)',
            borderRadius: 8,
            boxShadow: '0 16px 48px rgba(0,0,0,0.8), 0 0 0 0.5px rgba(255,255,255,0.04) inset',
            overflow: 'hidden',
          }}
        >
          {/* Search input */}
          <div style={{ padding: '8px 10px', borderBottom: '0.5px solid rgba(255,255,255,0.07)' }}>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={placeholder}
              style={{
                width: '100%', background: 'rgba(255,255,255,0.05)',
                border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 6,
                padding: '6px 10px', fontSize: 12,
                fontFamily: "'IBM Plex Sans',sans-serif",
                color: '#f1ede8', outline: 'none',
              }}
            />
          </div>

          {/* Options */}
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {/* Clear */}
            <div
              onClick={() => select('')}
              style={{
                padding: '8px 12px', fontSize: 12, cursor: 'pointer',
                color: 'rgba(255,255,255,0.3)', fontFamily: "'IBM Plex Sans',sans-serif",
                borderBottom: '0.5px solid rgba(255,255,255,0.04)',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {clearLabel}
            </div>

            {filtered.length === 0 ? (
              <div style={{ padding: 12, fontSize: 12, color: 'rgba(255,255,255,0.25)', textAlign: 'center', fontFamily: "'IBM Plex Sans',sans-serif" }}>
                No results for &ldquo;{query}&rdquo;
              </div>
            ) : filtered.map(o => (
              <div
                key={o.value}
                onClick={() => select(o.value)}
                style={{
                  padding: '8px 12px', fontSize: 13, cursor: 'pointer',
                  fontFamily: "'IBM Plex Sans',sans-serif",
                  color: value === o.value ? '#fb923c' : '#e2dfd8',
                  background: value === o.value ? 'rgba(251,146,60,0.08)' : 'transparent',
                  borderLeft: value === o.value ? '2px solid #fb923c' : '2px solid transparent',
                }}
                onMouseEnter={e => { if (value !== o.value) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                onMouseLeave={e => { if (value !== o.value) e.currentTarget.style.background = 'transparent'; }}
              >
                <div>{o.label}</div>
                {o.sublabel && (
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>{o.sublabel}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}

// ─── Badges ───────────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type: ItemType }) {
  const c = getTypeConfig(type);
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'2px 9px', borderRadius:20, fontSize:11, fontWeight:500, color:c.color, background:c.bg, border:`0.5px solid ${c.border}`, whiteSpace:'nowrap' }}>
      <span style={{ width:5, height:5, borderRadius:'50%', background:c.color, flexShrink:0 }} />{c.label}
    </span>
  );
}

function UomBadge({ unit }: { unit?: { code: string; name: string; type: string } | null }) {
  if (!unit) return <span style={{ color:'rgba(255,255,255,0.25)', fontSize:12 }}>—</span>;
  const color = UOM_TYPE_COLOR[unit.type] ?? '#e2dfd8';
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:4, padding:'2px 8px', borderRadius:20, fontSize:11, fontWeight:500, color, background:`${color}15`, border:`0.5px solid ${color}35` }}>
      {unit.code}
    </span>
  );
}

function BoolDot({ value }: { value: boolean }) {
  return <span style={{ width:7, height:7, borderRadius:'50%', display:'inline-block', background:value ? '#4ade80' : 'rgba(255,255,255,0.15)', boxShadow:value ? '0 0 4px rgba(74,222,128,0.4)' : 'none' }} />;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:12, color:checked ? '#e2dfd8' : 'rgba(255,255,255,0.4)', userSelect:'none' }}>
      <div onClick={() => onChange(!checked)} style={{ width:32, height:18, borderRadius:9, flexShrink:0, background:checked ? 'rgba(234,88,12,0.8)' : 'rgba(255,255,255,0.1)', border:`0.5px solid ${checked ? 'rgba(251,146,60,0.5)' : 'rgba(255,255,255,0.15)'}`, position:'relative', transition:'background 0.2s', cursor:'pointer' }}>
        <div style={{ position:'absolute', top:2, left:checked ? 16 : 2, width:13, height:13, borderRadius:'50%', background:'#fff', transition:'left 0.2s', boxShadow:'0 1px 3px rgba(0,0,0,0.3)' }} />
      </div>
      {label}
    </label>
  );
}

// ─── Stats bar ────────────────────────────────────────────────────────────────

interface ItemStatistics {
  total: number;
  byType: { type: ItemType; count: number }[];
  stockable: number; purchasable: number; saleable: number;
  withCategory?: number; withUomTriple?: number;
}

function StatsBar({ stats }: { stats: ItemStatistics }) {
  return (
    <div style={{ display:'flex', gap:10, marginBottom:14, flexWrap:'wrap' }}>
      {ITEM_TYPES.map(t => {
        const count = stats.byType.find(b => b.type === t.value)?.count ?? 0;
        return (
          <div key={t.value} style={{ background:'rgba(10,7,18,0.7)', border:`0.5px solid ${t.border}`, borderRadius:8, padding:'8px 14px', display:'flex', flexDirection:'column', gap:2, minWidth:110 }}>
            <span style={{ fontSize:10, color:t.color, textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:500 }}>{t.label}</span>
            <span style={{ fontSize:22, fontWeight:500, color:'#f1ede8', fontFamily:"'IBM Plex Mono',monospace" }}>{count}</span>
          </div>
        );
      })}
      <div style={{ background:'rgba(10,7,18,0.7)', border:'0.5px solid rgba(251,146,60,0.2)', borderRadius:8, padding:'8px 14px', display:'flex', flexDirection:'column', gap:2, minWidth:70 }}>
        <span style={{ fontSize:10, color:'rgba(251,146,60,0.6)', textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:500 }}>Total</span>
        <span style={{ fontSize:22, fontWeight:500, color:'#fb923c', fontFamily:"'IBM Plex Mono',monospace" }}>{stats.total}</span>
      </div>
      {stats.withCategory !== undefined && (
        <div style={{ background:'rgba(10,7,18,0.7)', border:'0.5px solid rgba(167,139,250,0.2)', borderRadius:8, padding:'8px 14px', display:'flex', flexDirection:'column', gap:2, minWidth:90 }}>
          <span style={{ fontSize:10, color:'#a78bfa', textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:500 }}>Categorized</span>
          <span style={{ fontSize:22, fontWeight:500, color:'#f1ede8', fontFamily:"'IBM Plex Mono',monospace" }}>{stats.withCategory}</span>
        </div>
      )}
      {stats.withUomTriple !== undefined && (
        <div style={{ background:'rgba(10,7,18,0.7)', border:'0.5px solid rgba(96,165,250,0.2)', borderRadius:8, padding:'8px 14px', display:'flex', flexDirection:'column', gap:2, minWidth:90 }}>
          <span style={{ fontSize:10, color:'#60a5fa', textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:500 }}>UOM Triple</span>
          <span style={{ fontSize:22, fontWeight:500, color:'#f1ede8', fontFamily:"'IBM Plex Mono',monospace" }}>{stats.withUomTriple}</span>
        </div>
      )}
    </div>
  );
}

// ─── Suppliers Tab — SearchSelect only here ───────────────────────────────────

function SuppliersTab({ item, uomUnits }: { item: Item; uomUnits: UomUnit[] }) {
  const [supplierItems, setSupplierItems] = useState<SupplierItem[]>([]);
  const [suppliers,     setSuppliers]     = useState<any[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [addOpen,       setAddOpen]       = useState(false);
  const [addForm,       setAddForm]       = useState<Partial<CreateSupplierItemDto>>({
    itemId: item.id, isPreferred: false, isActive: true, packSize: 1, leadTimeDays: 0, moq: 1,
  });
  const [adding,   setAdding]   = useState(false);
  const [addError, setAddError] = useState('');

  const fetch_ = useCallback(async () => {
    try {
      setLoading(true);
      const [si, sup] = await Promise.all([
        supplierItemsApi.getByItem(item.id),
        suppliersApi.getAll(),
      ]);
      setSupplierItems(si); setSuppliers(sup);
    } catch {} finally { setLoading(false); }
  }, [item.id]);

  useEffect(() => { fetch_(); }, [fetch_]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.supplierId || !addForm.purchaseUomId) { setAddError('Supplier and Purchase UOM are required'); return; }
    setAdding(true); setAddError('');
    try {
      await supplierItemsApi.create(addForm as CreateSupplierItemDto);
      setAddOpen(false);
      setAddForm({ itemId: item.id, isPreferred: false, isActive: true, packSize: 1, leadTimeDays: 0, moq: 1 });
      fetch_();
    } catch (err: any) { setAddError(err?.response?.data?.message ?? 'Failed to add supplier'); }
    finally { setAdding(false); }
  };

  const supplierOpts: SSOption[] = suppliers.map((s: any) => ({ value: s.id, label: `${s.code} — ${s.name}` }));
  const uomOpts: SSOption[]      = uomUnits.map(u => ({ value: u.id, label: `${u.code} — ${u.name}`, sublabel: `${u.type} · ${u.system}` }));

  const L: React.CSSProperties = { fontSize:11, fontWeight:500, letterSpacing:'0.08em', textTransform:'uppercase', color:'rgba(251,146,60,0.6)' };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ fontSize:12, color:'rgba(255,255,255,0.4)' }}>
          {supplierItems.length} supplier{supplierItems.length !== 1 ? 's' : ''} for this item
        </span>
        <button type="button" onClick={() => setAddOpen(a => !a)} style={{ background:'rgba(251,146,60,0.1)', border:'0.5px solid rgba(251,146,60,0.3)', borderRadius:7, padding:'5px 12px', fontSize:11, fontFamily:"'IBM Plex Sans',sans-serif", color:'#fb923c', cursor:'pointer' }}>
          {addOpen ? 'Cancel' : '+ Add Supplier'}
        </button>
      </div>

      {addOpen && (
        <div style={{ background:'rgba(251,146,60,0.04)', border:'0.5px solid rgba(251,146,60,0.15)', borderRadius:8, padding:14 }}>
          {addError && (
            <div style={{ background:'rgba(239,68,68,0.1)', border:'0.5px solid rgba(239,68,68,0.2)', borderRadius:6, padding:'6px 10px', fontSize:12, color:'#fca5a5', marginBottom:10 }}>{addError}</div>
          )}
          <form onSubmit={handleAdd} style={{ display:'flex', flexDirection:'column', gap:10 }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>

              {/* Supplier — SearchSelect */}
              <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                <label style={L}>Supplier *</label>
                <SearchSelect
                  options={supplierOpts}
                  value={addForm.supplierId ?? ''}
                  onChange={v => setAddForm(f => ({ ...f, supplierId: v || undefined }))}
                  placeholder="Search supplier…"
                  clearLabel="— Select supplier —"
                />
              </div>

              {/* Purchase UOM — SearchSelect */}
              <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                <label style={L}>Purchase UOM *</label>
                <SearchSelect
                  options={uomOpts}
                  value={addForm.purchaseUomId ?? ''}
                  onChange={v => setAddForm(f => ({ ...f, purchaseUomId: v || undefined }))}
                  placeholder="Search UOM…"
                  clearLabel="— Select UOM —"
                />
              </div>

              <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                <label style={L}>Supplier Item Code</label>
                <input style={FIELD} placeholder="Supplier's ref code" value={addForm.supplierItemCode ?? ''} onChange={e => setAddForm(f => ({ ...f, supplierItemCode: e.target.value || undefined }))} />
              </div>

              <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                <label style={L}>Last Price</label>
                <input type="number" min="0" step="0.01" style={FIELD} placeholder="0.00" value={addForm.lastPrice ?? ''} onChange={e => setAddForm(f => ({ ...f, lastPrice: e.target.value ? Number(e.target.value) : undefined }))} />
              </div>

              <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                <label style={L}>Lead Time (days)</label>
                <input type="number" min="0" style={FIELD} value={addForm.leadTimeDays ?? 0} onChange={e => setAddForm(f => ({ ...f, leadTimeDays: Number(e.target.value) }))} />
              </div>

              <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                <label style={L}>MOQ</label>
                <input type="number" min="1" style={FIELD} value={addForm.moq ?? 1} onChange={e => setAddForm(f => ({ ...f, moq: Number(e.target.value) }))} />
              </div>
            </div>

            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:4 }}>
              <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'rgba(255,255,255,0.5)', cursor:'pointer' }}>
                <input type="checkbox" checked={addForm.isPreferred ?? false} onChange={e => setAddForm(f => ({ ...f, isPreferred: e.target.checked }))} />
                Set as preferred supplier
              </label>
              <button type="submit" disabled={adding} style={{ background:'linear-gradient(135deg,#c2410c,#ea580c,#f97316)', border:'none', borderRadius:7, padding:'7px 16px', fontSize:12, fontWeight:500, fontFamily:"'IBM Plex Sans',sans-serif", color:'white', cursor:'pointer', opacity:adding ? 0.5 : 1 }}>
                {adding ? 'Adding…' : 'Add Supplier'}
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <div style={{ textAlign:'center', padding:24, color:'rgba(255,255,255,0.25)', fontSize:12 }}>Loading…</div>
      ) : supplierItems.length === 0 ? (
        <div style={{ textAlign:'center', padding:24, color:'rgba(255,255,255,0.2)', fontSize:12 }}>No suppliers assigned to this item yet.</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {supplierItems.map(si => (
            <div key={si.id} style={{ background:si.isPreferred ? 'rgba(74,222,128,0.04)' : 'rgba(255,255,255,0.02)', border:`0.5px solid ${si.isPreferred ? 'rgba(74,222,128,0.2)' : 'rgba(255,255,255,0.07)'}`, borderRadius:8, padding:'10px 14px', display:'grid', gridTemplateColumns:'1fr 70px 80px 80px 60px auto', gap:10, alignItems:'center' }}>
              <div>
                <div style={{ fontSize:13, fontWeight:500, color:'#e2dfd8', display:'flex', alignItems:'center', gap:8 }}>
                  {si.supplier?.name}
                  {si.isPreferred && <span style={{ fontSize:10, color:'#4ade80', background:'rgba(74,222,128,0.1)', border:'0.5px solid rgba(74,222,128,0.2)', padding:'1px 7px', borderRadius:20 }}>preferred</span>}
                </div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,0.3)', marginTop:2 }}>{si.supplier?.code}{si.supplierItemCode && ` · ref: ${si.supplierItemCode}`}</div>
              </div>
              <div style={{ textAlign:'center' }}>
                <div style={{ fontSize:10, color:'rgba(255,255,255,0.3)', marginBottom:2 }}>UOM</div>
                <span style={{ fontSize:12, fontFamily:"'IBM Plex Mono',monospace", color:'#fb923c' }}>{si.purchaseUom?.code ?? '—'}</span>
              </div>
              <div style={{ textAlign:'center' }}>
                <div style={{ fontSize:10, color:'rgba(255,255,255,0.3)', marginBottom:2 }}>Factor</div>
                <span style={{ fontSize:12, fontFamily:"'IBM Plex Mono',monospace", color:'#fb923c' }}>{Number(si.conversionFactor).toFixed(4)}</span>
              </div>
              <div style={{ textAlign:'center' }}>
                <div style={{ fontSize:10, color:'rgba(255,255,255,0.3)', marginBottom:2 }}>Price</div>
                <span style={{ fontSize:12, fontFamily:"'IBM Plex Mono',monospace", color:'#e2dfd8' }}>{si.lastPrice ? `$${Number(si.lastPrice).toFixed(2)}` : '—'}</span>
              </div>
              <div style={{ textAlign:'center' }}>
                <div style={{ fontSize:10, color:'rgba(255,255,255,0.3)', marginBottom:2 }}>Lead</div>
                <span style={{ fontSize:12, color:'rgba(255,255,255,0.5)' }}>{si.leadTimeDays}d</span>
              </div>
              <div style={{ display:'flex', gap:5 }}>
                {!si.isPreferred && (
                  <button type="button" onClick={async () => { try { await supplierItemsApi.update(si.id, { isPreferred: true }); fetch_(); } catch {} }} style={{ padding:'4px 8px', borderRadius:6, fontSize:10, cursor:'pointer', background:'rgba(74,222,128,0.08)', border:'0.5px solid rgba(74,222,128,0.2)', color:'#4ade80', fontFamily:"'IBM Plex Sans',sans-serif", whiteSpace:'nowrap' }}>Set preferred</button>
                )}
                <button type="button" onClick={async () => { try { await supplierItemsApi.remove(si.id); fetch_(); } catch {} }} style={{ padding:'4px 8px', borderRadius:6, fontSize:10, cursor:'pointer', background:'rgba(239,68,68,0.07)', border:'0.5px solid rgba(239,68,68,0.2)', color:'#f87171', fontFamily:"'IBM Plex Sans',sans-serif" }}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Item Modal ───────────────────────────────────────────────────────────────

function ItemModal({ open, onClose, onSaved, initial, categories, macroCategories, uomUnits }: {
  open: boolean; onClose: () => void; onSaved: () => void;
  initial: Item | null;
  categories: Category[]; macroCategories: MacroCategory[]; uomUnits: UomUnit[];
}) {
  const [form,        setForm]        = useState<CreateItemDto>(EMPTY_FORM);
  const [tab,         setTab]         = useState<'general' | 'uom' | 'suppliers'>('general');
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState('');
  const [macroFilter, setMacroFilter] = useState('');

  useEffect(() => {
    if (open) {
      setError(''); setTab('general');
      const a = initial as any;
      setMacroFilter(a?.category?.macroCategory?.id ?? a?.category?.macroCategoryId ?? '');
      setForm(initial ? {
        code: initial.code, name: initial.name,
        itemType: initial.itemType, baseUom: initial.baseUom,
        description: initial.description ?? '',
        valuationMethod: initial.valuationMethod,
        categoryId: initial.categoryId ?? undefined,
        consumptionGroupId: a?.consumptionGroupId ?? undefined,
        purchaseUomId: a?.purchaseUomId ?? undefined,
        purchaseToConsumptionFactor: Number(a?.purchaseToConsumptionFactor ?? 1),
        storageUomId: a?.storageUomId ?? undefined,
        storageToConsumptionFactor: Number(a?.storageToConsumptionFactor ?? 1),
        consumptionUomId: a?.consumptionUomId ?? undefined,
        standardCost: initial.standardCost ?? undefined,
        leadTimeDays: initial.leadTimeDays ?? undefined,
        safetyStock: initial.safetyStock ?? undefined,
        reorderPoint: initial.reorderPoint ?? undefined,
        reorderQuantity: initial.reorderQuantity ?? undefined,
        isStockable: initial.isStockable, isPurchasable: initial.isPurchasable,
        isSaleable: initial.isSaleable, isManufacturable: initial.isManufacturable,
        isLotTracked: initial.isLotTracked, isSerialTracked: initial.isSerialTracked,
      } : EMPTY_FORM);
    }
  }, [open, initial]);

  const set = (key: keyof CreateItemDto) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value }));

  const setNum = (key: keyof CreateItemDto) =>
    (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm(f => ({ ...f, [key]: e.target.value === '' ? undefined : Number(e.target.value) }));

  const setBool = (key: keyof CreateItemDto) => (v: boolean) =>
    setForm(f => ({ ...f, [key]: v }));

  const buildPayload = (): CreateItemDto => {
    const p: any = { ...form };
    ['standardCost','leadTimeDays','safetyStock','reorderPoint','reorderQuantity'].forEach(k => {
      if (p[k] === undefined || p[k] === null || p[k] === '') delete p[k];
    });
    ['categoryId','consumptionGroupId','purchaseUomId','storageUomId','consumptionUomId'].forEach(k => {
      if (!p[k]) delete p[k];
    });
    return p as CreateItemDto;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code.trim() || !form.name.trim()) { setError('Code and name are required.'); return; }
    setSubmitting(true); setError('');
    try {
      const payload = buildPayload();
      if (initial) await itemsApi.update(initial.id, payload);
      else          await itemsApi.create(payload);
      onSaved(); onClose();
    } catch (err: any) { setError(err?.response?.data?.message ?? 'Operation failed.'); }
    finally { setSubmitting(false); }
  };

  const filteredCategories = macroFilter
    ? categories.filter(c => c.macroCategoryId === macroFilter || c.macroCategory?.id === macroFilter)
    : categories;

  if (!open) return null;

  const anyInit = initial as any;
  const supCount = anyInit?.supplierItems?.length ?? 0;
  const TABS = [
    { key: 'general',   label: 'General' },
    { key: 'uom',       label: 'Units of Measure' },
    ...(initial ? [{ key: 'suppliers', label: `Suppliers${supCount ? ` (${supCount})` : ''}` }] : []),
  ];

  return (
    <>
      <style>{`
        .im-overlay{position:fixed;inset:0;z-index:400;background:rgba(0,0,0,0.65);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:24px}
        .im-box{background:#0e0b1a;border:0.5px solid rgba(251,146,60,0.2);border-radius:14px;width:100%;max-width:600px;max-height:92vh;display:flex;flex-direction:column;box-shadow:0 24px 60px rgba(0,0,0,0.7);position:relative}
        .im-box::before{content:'';position:absolute;top:0;left:30px;right:30px;height:1px;background:linear-gradient(90deg,transparent,rgba(251,146,60,0.4),transparent);pointer-events:none}
        .im-hdr{display:flex;align-items:center;justify-content:space-between;padding:14px 20px 0;flex-shrink:0}
        .im-title{font-size:14px;font-weight:500;color:#f1ede8}
        .im-close{width:24px;height:24px;border-radius:6px;background:rgba(255,255,255,0.06);border:none;cursor:pointer;color:rgba(255,255,255,0.45);font-size:16px;display:flex;align-items:center;justify-content:center}
        .im-tabs{display:flex;padding:0 20px;border-bottom:0.5px solid rgba(255,255,255,0.06);flex-shrink:0}
        .im-tab{padding:10px 14px;font-size:12px;cursor:pointer;color:rgba(255,255,255,0.4);border:none;border-bottom:2px solid transparent;background:none;font-family:'IBM Plex Sans',sans-serif;transition:color 0.15s;white-space:nowrap}
        .im-tab:hover{color:rgba(255,255,255,0.7)}
        .im-tab-active{color:#fb923c !important;border-bottom-color:#fb923c !important}
        .im-scroll{flex:1;overflow-y:auto;min-height:0}
        .im-body{padding:16px 20px;display:flex;flex-direction:column;gap:12px}
        .im-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        .im-row3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px}
        .im-field{display:flex;flex-direction:column;gap:5px}
        .im-label{font-size:11px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;color:rgba(251,146,60,0.6)}
        .im-sublabel{font-size:10px;color:rgba(255,255,255,0.3);margin-top:-2px}
        .im-input,.im-select,.im-textarea{background:#0e0b1a;border:0.5px solid rgba(255,255,255,0.1);border-radius:7px;padding:9px 12px;font-size:13px;font-family:'IBM Plex Sans',sans-serif;color:#f1ede8;outline:none;width:100%;transition:border-color 0.2s,box-shadow 0.2s}
        .im-input::placeholder,.im-textarea::placeholder{color:rgba(255,255,255,0.18)}
        .im-input:focus,.im-select:focus,.im-textarea:focus{border-color:rgba(251,146,60,0.45);box-shadow:0 0 0 2px rgba(234,88,12,0.1)}
        .im-select option{background:#0e0b1a;color:#f1ede8}
        .im-textarea{resize:vertical;min-height:60px}
        .im-section{font-size:10px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.25);padding:4px 0 2px;border-bottom:0.5px solid rgba(255,255,255,0.06);margin-top:4px}
        .im-toggles{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}
        .im-error{background:rgba(239,68,68,0.1);border:0.5px solid rgba(239,68,68,0.25);border-radius:7px;padding:8px 12px;font-size:12px;color:#fca5a5}
        .im-ftr{display:flex;justify-content:flex-end;gap:8px;padding:12px 20px 18px;border-top:0.5px solid rgba(255,255,255,0.06);flex-shrink:0}
        .im-btn-cancel{background:rgba(255,255,255,0.05);border:0.5px solid rgba(255,255,255,0.1);border-radius:7px;padding:8px 16px;font-size:13px;font-family:'IBM Plex Sans',sans-serif;color:rgba(255,255,255,0.5);cursor:pointer}
        .im-btn-save{background:linear-gradient(135deg,#c2410c,#ea580c,#f97316);border:none;border-radius:7px;padding:8px 20px;font-size:13px;font-weight:500;font-family:'IBM Plex Sans',sans-serif;color:white;cursor:pointer;box-shadow:0 3px 12px rgba(234,88,12,0.35)}
        .im-btn-save:disabled{opacity:0.5;cursor:not-allowed}
        .im-uom-info{background:rgba(255,255,255,0.02);border:0.5px solid rgba(255,255,255,0.06);border-radius:8px;padding:10px 14px;font-size:11px;color:rgba(255,255,255,0.35);line-height:1.6}
      `}</style>

      <div className="im-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="im-box">
          <div className="im-hdr">
            <span className="im-title">{initial ? `Edit — ${initial.code}` : 'New Item'}</span>
            <button className="im-close" type="button" onClick={onClose}>×</button>
          </div>

          <div className="im-tabs">
            {TABS.map(t => (
              <button key={t.key} type="button"
                className={`im-tab${tab === t.key ? ' im-tab-active' : ''}`}
                onClick={() => setTab(t.key as any)}>
                {t.label}
              </button>
            ))}
          </div>

          {/* Scrollable body — separated from header/footer so they stay fixed */}
          <div className="im-scroll">
            <form onSubmit={handleSubmit}>
              <div className="im-body">
                {error && <div className="im-error">{error}</div>}

                {/* GENERAL */}
                {tab === 'general' && (
                  <>
                    <div className="im-row">
                      <div className="im-field">
                        <label className="im-label">Code *</label>
                        <input className="im-input" placeholder="ITEM001" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} required />
                      </div>
                      <div className="im-field">
                        <label className="im-label">Item Type *</label>
                        <select className="im-select" value={form.itemType} onChange={set('itemType')}>
                          {ITEM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="im-field">
                      <label className="im-label">Name *</label>
                      <input className="im-input" placeholder="Product name" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required />
                    </div>
                    <div className="im-field">
                      <label className="im-label">Description</label>
                      <textarea className="im-textarea" placeholder="Optional description…" value={form.description} onChange={set('description')} />
                    </div>

                    <div className="im-section">Classification</div>
                    <div className="im-row">
                      <div className="im-field">
                        <label className="im-label">Macro Category</label>
                        <SearchSelect
                          options={macroCategories.map(mc => ({ value: mc.id, label: `${mc.code} — ${mc.name}` }))}
                          value={macroFilter}
                          onChange={v => { setMacroFilter(v); setForm(f => ({ ...f, categoryId: undefined })); }}
                          placeholder="Search macro category…"
                          clearLabel="— All macro categories —"
                        />
                      </div>
                      <div className="im-field">
                        <label className="im-label">Category</label>
                        <SearchSelect
                          options={filteredCategories.map(c => ({ value: c.id, label: `${c.code} — ${c.name}`, sublabel: c.macroCategory?.name }))}
                          value={form.categoryId ?? ''}
                          onChange={v => setForm(f => ({ ...f, categoryId: v || undefined }))}
                          placeholder="Search category…"
                          clearLabel="— Select category —"
                        />
                      </div>
                    </div>

                    <div className="im-section">Valuation & Planning</div>
                    <div className="im-row">
                      <div className="im-field">
                        <label className="im-label">Valuation Method</label>
                        <select className="im-select" value={form.valuationMethod ?? 'average'} onChange={set('valuationMethod')}>
                          <option value="average">Average</option>
                          <option value="fifo">FIFO</option>
                          <option value="standard">Standard</option>
                        </select>
                      </div>
                      <div className="im-field">
                        <label className="im-label">Standard Cost</label>
                        <input className="im-input" type="number" min="0" step="0.01" placeholder="0.00" value={form.standardCost ?? ''} onChange={setNum('standardCost')} />
                      </div>
                    </div>
                    <div className="im-row3">
                      <div className="im-field">
                        <label className="im-label">Lead Time (days)</label>
                        <input className="im-input" type="number" min="0" placeholder="0" value={form.leadTimeDays ?? ''} onChange={setNum('leadTimeDays')} />
                      </div>
                      <div className="im-field">
                        <label className="im-label">Safety Stock</label>
                        <input className="im-input" type="number" min="0" placeholder="0" value={form.safetyStock ?? ''} onChange={setNum('safetyStock')} />
                      </div>
                      <div className="im-field">
                        <label className="im-label">Reorder Point</label>
                        <input className="im-input" type="number" min="0" placeholder="0" value={form.reorderPoint ?? ''} onChange={setNum('reorderPoint')} />
                      </div>
                    </div>

                    <div className="im-section">Properties</div>
                    <div className="im-toggles">
                      <Toggle label="Stockable"      checked={form.isStockable      ?? true}  onChange={setBool('isStockable')} />
                      <Toggle label="Purchasable"    checked={form.isPurchasable    ?? true}  onChange={setBool('isPurchasable')} />
                      <Toggle label="Saleable"       checked={form.isSaleable       ?? true}  onChange={setBool('isSaleable')} />
                      <Toggle label="Manufacturable" checked={form.isManufacturable ?? false} onChange={setBool('isManufacturable')} />
                      <Toggle label="Lot Tracked"    checked={form.isLotTracked     ?? false} onChange={setBool('isLotTracked')} />
                      <Toggle label="Serial Tracked" checked={form.isSerialTracked  ?? false} onChange={setBool('isSerialTracked')} />
                    </div>
                  </>
                )}

                {/* UOM */}
                {tab === 'uom' && (
                  <>
                    <div className="im-uom-info">
                      <strong style={{ color:'rgba(255,255,255,0.5)' }}>Triple UOM:</strong> Three independent logistics domains.
                      Purchasing receives in <strong style={{ color:'#fb923c' }}>Purchase UOM</strong> ·
                      Warehouse manages in <strong style={{ color:'#60a5fa' }}>Storage UOM</strong> ·
                      Production consumes in <strong style={{ color:'#4ade80' }}>Consumption UOM</strong>.
                      Conversion factors are auto-calculated from the catalog when possible.
                    </div>
                    <div className="im-field">
                      <label className="im-label">Base UOM (legacy) *</label>
                      <p className="im-sublabel">Kept for backward compatibility. Set Consumption UOM for new items.</p>
                      <input className="im-input" placeholder="PCS" value={form.baseUom} onChange={e => setForm(f => ({ ...f, baseUom: e.target.value }))} required />
                    </div>

                    <div className="im-section" style={{ color:'#fb923c', opacity:0.8 }}>Purchase — Purchasing domain</div>
                    <div className="im-row">
                      <div className="im-field">
                        <label className="im-label">Purchase UOM</label>
                        <p className="im-sublabel">Unit used in POs and supplier quotes</p>
                        <SearchSelect
                          options={uomUnits.map(u => ({ value: u.id, label: `${u.code} — ${u.name}`, sublabel: `${u.type} · ${u.system}` }))}
                          value={form.purchaseUomId ?? ''}
                          onChange={v => setForm(f => ({ ...f, purchaseUomId: v || undefined }))}
                          placeholder="Search UOM…"
                          clearLabel="— Same as consumption —"
                        />
                      </div>
                      <div className="im-field">
                        <label className="im-label">Purchase → Consumption Factor</label>
                        <p className="im-sublabel">How many consumption units per 1 purchase unit</p>
                        <input className="im-input" type="number" min="0" step="0.000001" value={form.purchaseToConsumptionFactor ?? 1} onChange={setNum('purchaseToConsumptionFactor')} />
                      </div>
                    </div>

                    <div className="im-section" style={{ color:'#60a5fa', opacity:0.8 }}>Storage — Warehouse domain</div>
                    <div className="im-row">
                      <div className="im-field">
                        <label className="im-label">Storage UOM</label>
                        <p className="im-sublabel">Unit used for stock counting in warehouse</p>
                        <SearchSelect
                          options={uomUnits.map(u => ({ value: u.id, label: `${u.code} — ${u.name}`, sublabel: `${u.type} · ${u.system}` }))}
                          value={form.storageUomId ?? ''}
                          onChange={v => setForm(f => ({ ...f, storageUomId: v || undefined }))}
                          placeholder="Search UOM…"
                          clearLabel="— Same as consumption —"
                        />
                      </div>
                      <div className="im-field">
                        <label className="im-label">Storage → Consumption Factor</label>
                        <p className="im-sublabel">How many consumption units per 1 storage unit</p>
                        <input className="im-input" type="number" min="0" step="0.000001" value={form.storageToConsumptionFactor ?? 1} onChange={setNum('storageToConsumptionFactor')} />
                      </div>
                    </div>

                    <div className="im-section" style={{ color:'#4ade80', opacity:0.8 }}>Consumption — Production domain</div>
                    <div className="im-field">
                      <label className="im-label">Consumption UOM</label>
                      <p className="im-sublabel">Unit used in BOM and production orders — base for all conversions</p>
                      <SearchSelect
                        options={uomUnits.map(u => ({ value: u.id, label: `${u.code} — ${u.name}`, sublabel: `${u.type} · ${u.system}` }))}
                        value={form.consumptionUomId ?? ''}
                        onChange={v => setForm(f => ({ ...f, consumptionUomId: v || undefined }))}
                        placeholder="Search UOM…"
                        clearLabel="— Select consumption UOM —"
                      />
                    </div>

                    {form.consumptionUomId && (
                      <div style={{ background:'rgba(74,222,128,0.04)', border:'0.5px solid rgba(74,222,128,0.15)', borderRadius:8, padding:'10px 14px', fontSize:12 }}>
                        <div style={{ color:'rgba(255,255,255,0.4)', marginBottom:6, fontSize:10, textTransform:'uppercase', letterSpacing:'0.08em' }}>Conversion Preview</div>
                        <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
                          <span style={{ color:'#fb923c' }}>1 {uomUnits.find(u => u.id === form.purchaseUomId)?.code ?? 'purchase'} = {form.purchaseToConsumptionFactor ?? 1} {uomUnits.find(u => u.id === form.consumptionUomId)?.code}</span>
                          <span style={{ color:'#60a5fa' }}>1 {uomUnits.find(u => u.id === form.storageUomId)?.code ?? 'storage'} = {form.storageToConsumptionFactor ?? 1} {uomUnits.find(u => u.id === form.consumptionUomId)?.code}</span>
                        </div>
                      </div>
                    )}
                  </>
                )}

                {/* SUPPLIERS */}
                {tab === 'suppliers' && initial && <SuppliersTab item={initial} uomUnits={uomUnits} />}
              </div>

              <div className="im-ftr">
                <button type="button" className="im-btn-cancel" onClick={onClose}>{tab === 'suppliers' ? 'Close' : 'Cancel'}</button>
                {tab !== 'suppliers' && (
                  <button type="submit" className="im-btn-save" disabled={submitting}>
                    {submitting ? 'Saving…' : initial ? 'Save Changes' : 'Create Item'}
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Delete confirm ───────────────────────────────────────────────────────────

function DeleteConfirm({ item, onCancel, onConfirm, busy }: { item: Item; onCancel: () => void; onConfirm: () => void; busy: boolean }) {
  return (
    <div style={{ position:'fixed', inset:0, zIndex:400, background:'rgba(0,0,0,0.65)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ background:'#0e0b1a', border:'0.5px solid rgba(239,68,68,0.25)', borderRadius:14, width:'100%', maxWidth:400, padding:'24px 24px 20px', boxShadow:'0 24px 60px rgba(0,0,0,0.7)' }}>
        <div style={{ fontSize:14, fontWeight:500, color:'#f1ede8', marginBottom:10 }}>Delete item?</div>
        <div style={{ fontSize:13, color:'rgba(255,255,255,0.5)', marginBottom:20, lineHeight:1.5 }}>
          <strong style={{ color:'#f1ede8' }}>{item.name}</strong> ({item.code}) will be soft-deleted.
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

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ItemsPage() {
  const [items,           setItems]           = useState<Item[]>([]);
  const [filtered,        setFiltered]        = useState<Item[]>([]);
  const [stats,           setStats]           = useState<ItemStatistics | null>(null);
  const [categories,      setCategories]      = useState<Category[]>([]);
  const [macroCategories, setMacroCategories] = useState<MacroCategory[]>([]);
  const [uomUnits,        setUomUnits]        = useState<UomUnit[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [error,           setError]           = useState('');
  const [search,          setSearch]          = useState('');
  const [typeFilter,      setTypeFilter]      = useState<ItemType | ''>('');
  const [modalOpen,       setModalOpen]       = useState(false);
  const [editing,         setEditing]         = useState<Item | null>(null);
  const [deleting,        setDeleting]        = useState<Item | null>(null);
  const [deleteBusy,      setDeleteBusy]      = useState(false);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [data, statsData, cats, mcs, uoms] = await Promise.all([
        itemsApi.getAll(), itemsApi.getStatistics(),
        categoriesApi.getAll(), macroCategoriesApi.getAll(), uomApi.getUnits(),
      ]);
      setItems(data as Item[]); setStats(statsData);
      setCategories(cats); setMacroCategories(mcs); setUomUnits(uoms);
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to load items.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    const q = search.toLowerCase();
    setFiltered(items.filter(i => {
      const ms = !q || i.name.toLowerCase().includes(q) || i.code.toLowerCase().includes(q);
      const mt = !typeFilter || i.itemType === typeFilter;
      return ms && mt;
    }));
  }, [search, typeFilter, items]);

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try { await itemsApi.remove(deleting.id); setDeleting(null); fetchAll(); }
    catch (err: any) { setError(err?.response?.data?.message ?? 'Delete failed.'); setDeleting(null); }
    finally { setDeleteBusy(false); }
  };

  return (
    <ERPShell breadcrumbs={['Home', 'Inventory', 'Items']} title="Items">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap');
        .itm-page{padding:0 18px 24px}
        .itm-toolbar{display:flex;align-items:center;gap:10px;margin-bottom:14px;flex-wrap:wrap}
        .itm-search{background:rgba(255,255,255,0.04);border:0.5px solid rgba(255,255,255,0.09);border-radius:7px;padding:7px 12px;font-size:12px;font-family:'IBM Plex Sans',sans-serif;color:#e2dfd8;outline:none;width:240px}
        .itm-search:focus{border-color:rgba(251,146,60,0.4)}
        .itm-filter{background:rgba(255,255,255,0.04);border:0.5px solid rgba(255,255,255,0.09);border-radius:7px;padding:7px 12px;font-size:12px;font-family:'IBM Plex Sans',sans-serif;color:#e2dfd8;outline:none}
        .itm-filter option{background:#0e0b1a;color:#f1ede8}
        .itm-btn-new{display:flex;align-items:center;gap:6px;margin-left:auto;background:linear-gradient(135deg,#c2410c,#ea580c,#f97316);border:none;border-radius:7px;padding:7px 14px;font-size:12px;font-weight:500;font-family:'IBM Plex Sans',sans-serif;color:white;cursor:pointer;box-shadow:0 3px 12px rgba(234,88,12,0.3);transition:opacity 0.15s;flex-shrink:0}
        .itm-btn-new:hover{opacity:0.88}
        .itm-wrap{background:rgba(10,7,18,0.7);border:0.5px solid rgba(251,146,60,0.12);border-radius:10px;overflow:hidden}
        .itm-table{width:100%;border-collapse:collapse}
        .itm-table thead th{padding:9px 14px;font-size:10px;font-weight:500;letter-spacing:0.1em;text-transform:uppercase;color:rgba(251,146,60,0.55);background:rgba(251,146,60,0.05);border-bottom:0.5px solid rgba(255,255,255,0.06);text-align:left;white-space:nowrap}
        .itm-table tbody td{padding:10px 14px;border-bottom:0.5px solid rgba(255,255,255,0.04);vertical-align:middle;font-size:13px}
        .itm-table tbody tr:last-child td{border-bottom:none}
        .itm-table tbody tr:hover td{background:rgba(251,146,60,0.03)}
        .itm-code{font-family:'IBM Plex Mono',monospace;font-size:12px;color:#fb923c}
        .itm-name{color:#e2dfd8;font-weight:500}
        .itm-muted{color:rgba(255,255,255,0.4);font-size:12px}
        .itm-actions{display:flex;gap:6px}
        .itm-btn-edit,.itm-btn-del{padding:5px 10px;border-radius:6px;font-size:11px;font-family:'IBM Plex Sans',sans-serif;cursor:pointer;border:0.5px solid transparent;transition:background 0.15s;white-space:nowrap}
        .itm-btn-edit{background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.55);border-color:rgba(255,255,255,0.1)}
        .itm-btn-edit:hover{background:rgba(255,255,255,0.09)}
        .itm-btn-del{background:rgba(239,68,68,0.08);color:#f87171;border-color:rgba(239,68,68,0.2)}
        .itm-btn-del:hover{background:rgba(239,68,68,0.14)}
        .itm-empty,.itm-loading{text-align:center;padding:52px 24px;color:rgba(255,255,255,0.25);font-size:13px;display:flex;flex-direction:column;align-items:center;gap:10px}
        .itm-spinner{width:18px;height:18px;border-radius:50%;border:2px solid rgba(251,146,60,0.2);border-top-color:#fb923c;animation:itm-spin 0.7s linear infinite}
        @keyframes itm-spin{to{transform:rotate(360deg)}}
        .itm-footer{font-size:11px;color:rgba(255,255,255,0.22);padding:8px 14px;border-top:0.5px solid rgba(255,255,255,0.04)}
        .itm-error{background:rgba(239,68,68,0.08);border:0.5px solid rgba(239,68,68,0.2);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:13px;color:#fca5a5}
        .itm-cat{display:inline-flex;align-items:center;padding:2px 7px;border-radius:20px;font-size:10px;font-weight:500;color:#a78bfa;background:rgba(167,139,250,0.1);border:0.5px solid rgba(167,139,250,0.2)}
        .itm-sup{display:inline-flex;align-items:center;padding:2px 7px;border-radius:20px;font-size:10px;color:#4ade80;background:rgba(74,222,128,0.08);border:0.5px solid rgba(74,222,128,0.2)}
      `}</style>

      <div className="itm-page">
        {stats && <StatsBar stats={stats} />}

        <div className="itm-toolbar">
          <input className="itm-search" placeholder="Search by code or name…" value={search} onChange={e => setSearch(e.target.value)} />
          <select className="itm-filter" value={typeFilter} onChange={e => setTypeFilter(e.target.value as ItemType | '')}>
            <option value="">All Types</option>
            {ITEM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <button className="itm-btn-new" onClick={() => { setEditing(null); setModalOpen(true); }}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round">
              <line x1="6.5" y1="1" x2="6.5" y2="12"/><line x1="1" y1="6.5" x2="12" y2="6.5"/>
            </svg>
            New Item
          </button>
        </div>

        {error && <div className="itm-error">{error}</div>}

        <div className="itm-wrap">
          {loading ? (
            <div className="itm-loading"><div className="itm-spinner" />Loading items…</div>
          ) : filtered.length === 0 ? (
            <div className="itm-empty">{search || typeFilter ? 'No items match your filters.' : 'No items yet.'}</div>
          ) : (
            <>
              <table className="itm-table">
                <thead>
                  <tr>
                    <th>Code</th><th>Name</th><th>Type</th><th>Category</th>
                    <th>Purchase</th><th>Storage</th><th>Consumption</th><th>Suppliers</th>
                    <th style={{ textAlign:'center' }}>S</th><th style={{ textAlign:'center' }}>P</th>
                    <th style={{ textAlign:'center' }}>Sa</th><th style={{ textAlign:'center' }}>M</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(item => {
                    const a = item as any;
                    return (
                      <tr key={item.id}>
                        <td><span className="itm-code">{item.code}</span></td>
                        <td>
                          <span className="itm-name">{item.name}</span>
                          {item.description && <div style={{ fontSize:11, color:'rgba(255,255,255,0.3)', marginTop:2 }}>{item.description}</div>}
                        </td>
                        <td><TypeBadge type={item.itemType} /></td>
                        <td>{a.category ? <span className="itm-cat">{a.category.code}</span> : <span className="itm-muted">—</span>}</td>
                        <td><UomBadge unit={a.purchaseUom} /></td>
                        <td><UomBadge unit={a.storageUom} /></td>
                        <td><UomBadge unit={a.consumptionUom} /></td>
                        <td>{a.supplierItems?.length > 0 ? <span className="itm-sup">{a.supplierItems.length} supplier{a.supplierItems.length !== 1 ? 's' : ''}</span> : <span className="itm-muted">—</span>}</td>
                        <td style={{ textAlign:'center' }}><BoolDot value={item.isStockable} /></td>
                        <td style={{ textAlign:'center' }}><BoolDot value={item.isPurchasable} /></td>
                        <td style={{ textAlign:'center' }}><BoolDot value={item.isSaleable} /></td>
                        <td style={{ textAlign:'center' }}><BoolDot value={item.isManufacturable} /></td>
                        <td>
                          <div className="itm-actions">
                            <button className="itm-btn-edit" onClick={() => { setEditing(item); setModalOpen(true); }}>Edit</button>
                            <button className="itm-btn-del"  onClick={() => setDeleting(item)}>Delete</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="itm-footer">
                {filtered.length} of {items.length} item{items.length !== 1 ? 's' : ''}
                {typeFilter && ` · filtered by ${getTypeConfig(typeFilter as ItemType).label}`}
              </div>
            </>
          )}
        </div>

        <div style={{ marginTop:8, display:'flex', gap:14, fontSize:10, color:'rgba(255,255,255,0.25)' }}>
          <span>S = Stockable</span><span>P = Purchasable</span><span>Sa = Saleable</span><span>M = Manufacturable</span>
        </div>
      </div>

      <ItemModal
        open={modalOpen} onClose={() => setModalOpen(false)}
        onSaved={fetchAll} initial={editing}
        categories={categories} macroCategories={macroCategories} uomUnits={uomUnits}
      />

      {deleting && <DeleteConfirm item={deleting} onCancel={() => setDeleting(null)} onConfirm={handleDelete} busy={deleteBusy} />}
    </ERPShell>
  );
}