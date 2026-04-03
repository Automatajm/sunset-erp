// ============================================================================
// FILE: frontend/app/inventory/items/page.tsx
// ============================================================================
"use client";

import { useEffect, useState, useCallback, useMemo, useRef, useImperativeHandle, forwardRef } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import SearchSelect from '@/components/ui/SearchSelect';
import { ERPTable, ERPColumn } from '@/components/ui/ERPTable';
import { ERPFilterBar, ERPFilter, useERPFilters, applyERPFilters } from '@/components/ui/ERPFilterBar';
import { itemsApi } from '@/lib/api/items';
import { macroCategoriesApi } from '@/lib/api/macro-categories';
import { categoriesApi } from '@/lib/api/categories';
import { uomApi } from '@/lib/api/uom';
import { supplierItemsApi } from '@/lib/api/supplier-items';
import { suppliersApi } from '@/lib/api/suppliers';
import type { ERPFilter } from '@/components/ui/ERPTable';
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

function StatsBar({ stats, activeType, onTypeClick }: {
  stats: ItemStatistics;
  activeType?: string;
  onTypeClick?: (type: string | null) => void;
}) {
  return (
    <div style={{ display:'flex', gap:10, marginBottom:10, flexWrap:'wrap', flexShrink:0 }}>
      {ITEM_TYPES.map(t => {
        const count = stats.byType.find(b => b.type === t.value)?.count ?? 0;
        const isActive = activeType === t.value;
        return (
          <div key={t.value} onClick={() => onTypeClick?.(isActive ? null : t.value)}
            style={{ background: isActive ? t.bg : 'rgba(10,7,18,0.7)', border:`0.5px solid ${isActive ? t.color : t.border}`, borderRadius:8, padding:'8px 14px', display:'flex', flexDirection:'column', gap:2, minWidth:110, cursor:onTypeClick ? 'pointer' : 'default', transition:'all 0.15s', boxShadow:isActive ? `0 0 12px ${t.bg}` : 'none' }}>
            <span style={{ fontSize:10, color:t.color, textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:500 }}>{t.label}</span>
            <span style={{ fontSize:22, fontWeight:500, color:isActive ? t.color : '#f1ede8', fontFamily:"'IBM Plex Mono',monospace" }}>{count}</span>
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

// ─── Suppliers Tab ────────────────────────────────────────────────────────────

interface SupplierFormState {
  supplierId: string; purchaseUomId: string; supplierItemCode: string;
  lastPrice: string; leadTimeDays: string; moq: string; isPreferred: boolean;
}

const EMPTY_SUP_FORM: SupplierFormState = {
  supplierId: '', purchaseUomId: '', supplierItemCode: '',
  lastPrice: '', leadTimeDays: '0', moq: '1', isPreferred: false,
};

interface SuppliersTabHandle {
  submitAdd: () => Promise<void>;
  hasUnsavedData: () => boolean;
}

const SuppliersTab = forwardRef<SuppliersTabHandle, { item: Item; uomUnits: UomUnit[] }>(
  function SuppliersTab({ item, uomUnits }, ref) {
  const [supplierItems, setSupplierItems] = useState<SupplierItem[]>([]);
  const [suppliers,     setSuppliers]     = useState<any[]>([]);
  const [loading,       setLoading]       = useState(true);
  const [addForm,       setAddForm]       = useState<SupplierFormState>({ ...EMPTY_SUP_FORM, purchaseUomId: (item as any).purchaseUomId ?? '' });
  const [adding,        setAdding]        = useState(false);
  const [addError,      setAddError]      = useState('');
  const [editingId,     setEditingId]     = useState<string | null>(null);
  const [saving,        setSaving]        = useState(false);
  const [supSearch,     setSupSearch]     = useState('');

  // Derive the item's purchaseUom object for display
  const itemPurchaseUom = uomUnits.find(u => u.id === (item as any).purchaseUomId);

  useImperativeHandle(ref, () => ({
    submitAdd: async () => {
      if (!addForm.supplierId) { setAddError('Supplier is required'); return; }
      await handleAdd({ preventDefault: () => {} } as React.FormEvent);
    },
    hasUnsavedData: () => !!(addForm.supplierId || addForm.supplierItemCode || addForm.lastPrice),
  }));

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

  // Keep purchaseUomId in sync if item changes (e.g. user edits UOM tab then comes back)
  useEffect(() => {
    setAddForm(f => ({ ...f, purchaseUomId: (item as any).purchaseUomId ?? '' }));
  }, [(item as any).purchaseUomId]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.supplierId) { setAddError('Supplier is required'); return; }
    if (!(item as any).purchaseUomId) {
      setAddError('This item has no Purchase UOM configured. Go to the UOM tab and set it first.');
      return;
    }
    setAdding(true); setAddError('');
    try {
      await supplierItemsApi.create({
        itemId:           item.id,
        supplierId:       addForm.supplierId,
        purchaseUomId:    (item as any).purchaseUomId,  // always from item, never from form
        supplierItemCode: addForm.supplierItemCode || undefined,
        lastPrice:        addForm.lastPrice ? Number(addForm.lastPrice) : undefined,
        leadTimeDays:     Number(addForm.leadTimeDays) || 0,
        moq:              Number(addForm.moq) || 1,
        isPreferred:      addForm.isPreferred,
        isActive:         true,
        packSize:         1,
      } as CreateSupplierItemDto);
      setAddForm({ ...EMPTY_SUP_FORM, purchaseUomId: (item as any).purchaseUomId ?? '' });
      setEditingId(null);
      await fetch_();
    } catch (err: any) { setAddError(err?.response?.data?.message ?? 'Failed to add supplier'); }
    finally { setAdding(false); }
  };

  const handleEdit = (si: SupplierItem) => {
    setEditingId(si.id);
    setAddForm({
      supplierId:       si.supplier?.id ?? (si as any).supplierId ?? '',
      purchaseUomId:    (item as any).purchaseUomId ?? '',  // always locked to item
      supplierItemCode: (si as any).supplierItemCode ?? '',
      lastPrice:        si.lastPrice ? String(si.lastPrice) : '',
      leadTimeDays:     String(si.leadTimeDays ?? 0),
      moq:              String((si as any).moq ?? 1),
      isPreferred:      si.isPreferred,
    });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setAddForm({ ...EMPTY_SUP_FORM, purchaseUomId: (item as any).purchaseUomId ?? '' });
    setAddError('');
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    setSaving(true); setAddError('');
    try {
      await supplierItemsApi.update(editingId, {
        purchaseUomId:    (item as any).purchaseUomId || undefined,  // locked to item
        supplierItemCode: addForm.supplierItemCode || undefined,
        lastPrice:        addForm.lastPrice ? Number(addForm.lastPrice) : undefined,
        leadTimeDays:     Number(addForm.leadTimeDays) || 0,
        moq:              Number(addForm.moq) || 1,
        isPreferred:      addForm.isPreferred,
      });
      setEditingId(null);
      setAddForm({ ...EMPTY_SUP_FORM, purchaseUomId: (item as any).purchaseUomId ?? '' });
      await fetch_();
    } catch (err: any) { setAddError(err?.response?.data?.message ?? 'Failed to update'); }
    finally { setSaving(false); }
  };

  const handleRemove    = async (siId: string) => { try { await supplierItemsApi.remove(siId); await fetch_(); } catch {} };
  const handlePreferred = async (siId: string) => { try { await supplierItemsApi.update(siId, { isPreferred: true }); await fetch_(); } catch {} };

  const filteredSuppliers = supSearch.trim()
    ? supplierItems.filter(si =>
        si.supplier?.name.toLowerCase().includes(supSearch.toLowerCase()) ||
        si.supplier?.code.toLowerCase().includes(supSearch.toLowerCase()) ||
        ((si as any).supplierItemCode ?? '').toLowerCase().includes(supSearch.toLowerCase())
      )
    : supplierItems;

  const supplierOpts = suppliers.map((s: any) => ({ value: s.id, label: `${s.code} — ${s.name}` }));

  const L: React.CSSProperties = { fontSize: 11, fontWeight: 500, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(251,146,60,0.6)' };
  const INP: React.CSSProperties = { background: '#0e0b1a', border: '0.5px solid rgba(255,255,255,0.1)', borderRadius: 7, padding: '7px 10px', fontSize: 12, fontFamily: "'IBM Plex Sans',sans-serif", color: '#f1ede8', outline: 'none', width: '100%' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

      {/* Add / Edit form */}
      <div style={{ background: 'rgba(251,146,60,0.04)', border: '0.5px solid rgba(251,146,60,0.15)', borderRadius: 8, padding: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <div style={{ fontSize: 11, fontWeight: 500, color: editingId ? '#4ade80' : '#fb923c', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
            {editingId ? `Editing — ${suppliers.find(s => s.id === addForm.supplierId)?.name ?? 'Supplier'}` : 'Add Supplier'}
          </div>
          {editingId && (
            <button type="button" onClick={handleCancelEdit} style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif" }}>
              Cancel edit
            </button>
          )}
        </div>

        {addError && (
          <div style={{ background: 'rgba(239,68,68,0.1)', border: '0.5px solid rgba(239,68,68,0.2)', borderRadius: 6, padding: '6px 10px', fontSize: 12, color: '#fca5a5', marginBottom: 10 }}>
            {addError}
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

          {/* Row 1: Supplier + Purchase UOM (locked) */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={L}>Supplier *</label>
              <SearchSelect
                options={supplierOpts}
                value={addForm.supplierId}
                onChange={v => setAddForm(f => ({ ...f, supplierId: v }))}
                placeholder="Search supplier…"
                clearLabel="— Select supplier —"
                minWidth={220}
              />
            </div>

            {/* Purchase UOM — READ ONLY, locked to item.purchaseUomId */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={L}>Purchase UOM</label>
              {itemPurchaseUom ? (
                <div style={{ display:'flex', alignItems:'center', gap:8, background:'rgba(251,146,60,0.06)', border:'0.5px solid rgba(251,146,60,0.25)', borderRadius:7, padding:'7px 12px', height:36 }}>
                  <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:13, color:'#fb923c', fontWeight:600 }}>
                    {itemPurchaseUom.code}
                  </span>
                  <span style={{ fontSize:11, color:'rgba(255,255,255,0.35)' }}>{itemPurchaseUom.name}</span>
                  <span style={{ fontSize:10, color:'rgba(251,146,60,0.4)', marginLeft:'auto', whiteSpace:'nowrap' }}>
                    🔒 from item
                  </span>
                </div>
              ) : (
                <div style={{ display:'flex', alignItems:'center', gap:8, background:'rgba(239,68,68,0.07)', border:'0.5px solid rgba(239,68,68,0.2)', borderRadius:7, padding:'7px 12px', fontSize:11, color:'#fca5a5', height:36 }}>
                  ⚠ Set Purchase UOM in UOM tab first
                </div>
              )}
            </div>
          </div>

          {/* Row 2: Supplier Item Code + Last Price */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={L}>Supplier Item Code</label>
              <input style={INP} placeholder="Supplier ref code" value={addForm.supplierItemCode}
                onChange={e => setAddForm(f => ({ ...f, supplierItemCode: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={L}>Last Price</label>
              <input type="number" min="0" step="0.01" style={INP} placeholder="0.00"
                value={addForm.lastPrice} onChange={e => setAddForm(f => ({ ...f, lastPrice: e.target.value }))} />
            </div>
          </div>

          {/* Row 3: Lead Time + MOQ */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={L}>Lead Time (days)</label>
              <input type="number" min="0" style={INP} value={addForm.leadTimeDays}
                onChange={e => setAddForm(f => ({ ...f, leadTimeDays: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <label style={L}>MOQ</label>
              <input type="number" min="1" style={INP} value={addForm.moq}
                onChange={e => setAddForm(f => ({ ...f, moq: e.target.value }))} />
            </div>
          </div>

          {/* Footer: preferred + action button */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>
              <input type="checkbox" checked={addForm.isPreferred}
                onChange={e => setAddForm(f => ({ ...f, isPreferred: e.target.checked }))} />
              Set as preferred supplier
            </label>
            {editingId ? (
              <button type="button" disabled={saving} onClick={handleSaveEdit}
                style={{ background: 'linear-gradient(135deg,#166534,#15803d,#16a34a)', border: 'none', borderRadius: 7, padding: '7px 18px', fontSize: 12, fontWeight: 500, fontFamily: "'IBM Plex Sans',sans-serif", color: 'white', cursor: 'pointer', opacity: saving ? 0.5 : 1 }}>
                {saving ? 'Saving…' : 'Save Changes'}
              </button>
            ) : (
              <button type="button" disabled={adding || !itemPurchaseUom} onClick={handleAdd}
                style={{ background: 'linear-gradient(135deg,#c2410c,#ea580c,#f97316)', border: 'none', borderRadius: 7, padding: '7px 18px', fontSize: 12, fontWeight: 500, fontFamily: "'IBM Plex Sans',sans-serif", color: 'white', cursor: adding || !itemPurchaseUom ? 'not-allowed' : 'pointer', opacity: adding || !itemPurchaseUom ? 0.4 : 1 }}>
                {adding ? 'Adding…' : '+ Add Supplier'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Supplier list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>
            {supplierItems.length} supplier{supplierItems.length !== 1 ? 's' : ''} assigned
          </div>
          {supplierItems.length > 0 && (
            <input value={supSearch} onChange={e => setSupSearch(e.target.value)} placeholder="Search supplier…"
              style={{ background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.09)', borderRadius: 6, padding: '4px 10px', fontSize: 11, fontFamily: "'IBM Plex Sans',sans-serif", color: '#e2dfd8', outline: 'none', width: 160 }} />
          )}
        </div>

        <div style={{ maxHeight: 280, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 6, paddingRight: 2 }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 20, color: 'rgba(255,255,255,0.25)', fontSize: 12 }}>Loading…</div>
          ) : filteredSuppliers.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 20, color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>
              {supSearch ? `No results for "${supSearch}"` : 'No suppliers yet — use the form above.'}
            </div>
          ) : filteredSuppliers.map(si => (
            <div key={si.id} style={{ background: editingId === si.id ? 'rgba(74,222,128,0.06)' : si.isPreferred ? 'rgba(74,222,128,0.04)' : 'rgba(255,255,255,0.02)', border: `0.5px solid ${editingId === si.id ? 'rgba(74,222,128,0.35)' : si.isPreferred ? 'rgba(74,222,128,0.2)' : 'rgba(255,255,255,0.07)'}`, borderRadius: 8, padding: '10px 14px' }}>
              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10 }}>
                <div style={{ flex: 1, minWidth: 120 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#e2dfd8', display: 'flex', alignItems: 'center', gap: 8 }}>
                    {si.supplier?.name}
                    {si.isPreferred && <span style={{ fontSize: 10, color: '#4ade80', background: 'rgba(74,222,128,0.1)', border: '0.5px solid rgba(74,222,128,0.2)', padding: '1px 7px', borderRadius: 20 }}>preferred</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>
                    {si.supplier?.code}{(si as any).supplierItemCode && ` · ref: ${(si as any).supplierItemCode}`}
                  </div>
                </div>
                <div style={{ minWidth: 55, textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 2 }}>UOM</div>
                  <span style={{ fontSize: 12, fontFamily: "'IBM Plex Mono',monospace", color: '#fb923c' }}>{si.purchaseUom?.code ?? '—'}</span>
                </div>
                <div style={{ minWidth: 70, textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 2 }}>Price</div>
                  <span style={{ fontSize: 12, fontFamily: "'IBM Plex Mono',monospace", color: '#e2dfd8' }}>{si.lastPrice ? `$${Number(si.lastPrice).toFixed(2)}` : '—'}</span>
                </div>
                <div style={{ minWidth: 45, textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 2 }}>Lead</div>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{si.leadTimeDays}d</span>
                </div>
                <div style={{ minWidth: 45, textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 2 }}>MOQ</div>
                  <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>{(si as any).moq ?? 1}</span>
                </div>
                <div style={{ display: 'flex', gap: 5, marginLeft: 'auto' }}>
                  {!si.isPreferred && (
                    <button type="button" onClick={() => handlePreferred(si.id)} style={{ padding: '4px 8px', borderRadius: 6, fontSize: 10, cursor: 'pointer', background: 'rgba(74,222,128,0.08)', border: '0.5px solid rgba(74,222,128,0.2)', color: '#4ade80', fontFamily: "'IBM Plex Sans',sans-serif", whiteSpace: 'nowrap' }}>Preferred</button>
                  )}
                  <button type="button" onClick={() => handleEdit(si)} style={{ padding: '4px 8px', borderRadius: 6, fontSize: 10, cursor: 'pointer', background: 'rgba(255,255,255,0.05)', border: '0.5px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', fontFamily: "'IBM Plex Sans',sans-serif" }}>Edit</button>
                  <button type="button" onClick={() => handleRemove(si.id)} style={{ padding: '4px 8px', borderRadius: 6, fontSize: 10, cursor: 'pointer', background: 'rgba(239,68,68,0.07)', border: '0.5px solid rgba(239,68,68,0.2)', color: '#f87171', fontFamily: "'IBM Plex Sans',sans-serif" }}>Remove</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
});

// ─── Item Modal ───────────────────────────────────────────────────────────────

function ItemModal({ open, onClose, onSaved, onCreated, initial, categories, macroCategories, uomUnits }: {
  open: boolean; onClose: () => void; onSaved: () => void;
  onCreated: (item: Item) => void;
  initial: Item | null;
  categories: Category[]; macroCategories: MacroCategory[]; uomUnits: UomUnit[];
}) {
  const [form,        setForm]        = useState<CreateItemDto>(EMPTY_FORM);
  const [tab,         setTab]         = useState<'general' | 'uom' | 'suppliers'>('general');
  const [editMode,    setEditMode]    = useState<Item | null>(null);
  const suppliersTabRef = useRef<SuppliersTabHandle>(null);
  const [submitting,  setSubmitting]  = useState(false);
  const [error,       setError]       = useState('');
  const [macroFilter, setMacroFilter] = useState('');

  useEffect(() => {
    if (open) {
      setError(''); setTab('general'); setEditMode(null);
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

  const set    = (key: keyof CreateItemDto) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setForm(f => ({ ...f, [key]: e.target.value }));
  const setNum = (key: keyof CreateItemDto) => (e: React.ChangeEvent<HTMLInputElement>) => setForm(f => ({ ...f, [key]: e.target.value === '' ? undefined : Number(e.target.value) }));
  const setBool = (key: keyof CreateItemDto) => (v: boolean) => setForm(f => ({ ...f, [key]: v }));

  const buildPayload = (): CreateItemDto => {
    const p: any = { ...form };
    ['categoryId','consumptionGroupId','purchaseUomId','storageUomId','consumptionUomId'].forEach(k => { if (!p[k]) delete p[k]; });
    ['standardCost','leadTimeDays','safetyStock','reorderPoint','reorderQuantity','purchaseToConsumptionFactor','storageToConsumptionFactor'].forEach(k => {
      if (p[k] === undefined || p[k] === null || p[k] === '') delete p[k];
      else p[k] = Number(p[k]);
    });
    return p as CreateItemDto;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) { setError('Name is required.'); return; }
    setSubmitting(true); setError('');
    try {
      const payload = buildPayload();
      if (initial) {
        await itemsApi.update(initial.id, payload);
        onSaved(); onClose();
      } else {
        const created = await itemsApi.create(payload);
        onSaved();
        setEditMode(created as Item);
        setTab('suppliers');
        onCreated(created as Item);
      }
    } catch (err: any) { setError(err?.response?.data?.message ?? 'Operation failed.'); }
    finally { setSubmitting(false); }
  };

  const filteredCategories = macroFilter
    ? categories.filter(c => c.macroCategoryId === macroFilter || c.macroCategory?.id === macroFilter)
    : categories;

  const effectiveInitial = editMode ?? initial;
  if (!open) return null;

  const anyInit = effectiveInitial as any;
  const supCount = anyInit?.supplierItems?.length ?? 0;
  const uomOpts = uomUnits.map(u => ({ value: u.id, label: `${u.code} — ${u.name}`, sublabel: `${u.type} · ${u.system}` }));

  const TABS = [
    { key: 'general',   label: 'General' },
    { key: 'uom',       label: 'Units of Measure' },
    ...(effectiveInitial ? [{ key: 'suppliers', label: `Suppliers${supCount ? ` (${supCount})` : ''}` }] : []),
  ];

  // Build a synthetic item object that reflects current form state (so purchaseUomId is live)
  const liveItem: Item = effectiveInitial
    ? { ...effectiveInitial, purchaseUomId: form.purchaseUomId ?? (effectiveInitial as any).purchaseUomId } as any
    : effectiveInitial as any;

  return (
    <>
      <style>{`
        .im-overlay{position:fixed;inset:0;z-index:400;background:rgba(0,0,0,0.65);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:24px}
        .im-box{background:#0e0b1a;border:0.5px solid rgba(251,146,60,0.2);border-radius:14px;width:100%;max-width:620px;max-height:92vh;display:flex;flex-direction:column;box-shadow:0 24px 60px rgba(0,0,0,0.7);position:relative;overflow:visible}
        .im-box::before{content:'';position:absolute;top:0;left:30px;right:30px;height:1px;background:linear-gradient(90deg,transparent,rgba(251,146,60,0.4),transparent);pointer-events:none;border-radius:14px 14px 0 0}
        .im-hdr{display:flex;align-items:center;justify-content:space-between;padding:14px 20px 0;flex-shrink:0;border-radius:14px 14px 0 0;background:#0e0b1a;position:relative;z-index:1}
        .im-title{font-size:14px;font-weight:500;color:#f1ede8}
        .im-close{width:24px;height:24px;border-radius:6px;background:rgba(255,255,255,0.06);border:none;cursor:pointer;color:rgba(255,255,255,0.45);font-size:16px;display:flex;align-items:center;justify-content:center}
        .im-tabs{display:flex;padding:0 20px;border-bottom:0.5px solid rgba(255,255,255,0.06);flex-shrink:0;background:#0e0b1a;position:relative;z-index:1}
        .im-tab{padding:10px 14px;font-size:12px;cursor:pointer;color:rgba(255,255,255,0.4);border:none;border-bottom:2px solid transparent;background:none;font-family:'IBM Plex Sans',sans-serif;transition:color 0.15s;white-space:nowrap}
        .im-tab:hover{color:rgba(255,255,255,0.7)}
        .im-tab-active{color:#fb923c !important;border-bottom-color:#fb923c !important}
        .im-scroll{flex:1;overflow-y:auto;min-height:0;overflow-x:visible}
        .im-body{padding:16px 20px;display:flex;flex-direction:column;gap:12px;overflow:visible}
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
        .im-ftr{display:flex;justify-content:flex-end;gap:8px;padding:12px 20px 18px;border-top:0.5px solid rgba(255,255,255,0.06);flex-shrink:0;background:#0e0b1a;border-radius:0 0 14px 14px;position:relative;z-index:1}
        .im-btn-cancel{background:rgba(255,255,255,0.05);border:0.5px solid rgba(255,255,255,0.1);border-radius:7px;padding:8px 16px;font-size:13px;font-family:'IBM Plex Sans',sans-serif;color:rgba(255,255,255,0.5);cursor:pointer}
        .im-btn-save{background:linear-gradient(135deg,#c2410c,#ea580c,#f97316);border:none;border-radius:7px;padding:8px 20px;font-size:13px;font-weight:500;font-family:'IBM Plex Sans',sans-serif;color:white;cursor:pointer;box-shadow:0 3px 12px rgba(234,88,12,0.35)}
        .im-btn-save:disabled{opacity:0.5;cursor:not-allowed}
        .im-uom-info{background:rgba(255,255,255,0.02);border:0.5px solid rgba(255,255,255,0.06);border-radius:8px;padding:10px 14px;font-size:11px;color:rgba(255,255,255,0.35);line-height:1.6}
      `}</style>

      <div className="im-overlay">
        <div className="im-box">
          <div className="im-hdr">
            <span className="im-title">{effectiveInitial ? `Edit — ${effectiveInitial.code}` : 'New Item'}</span>
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

          <div className="im-scroll">
            <form onSubmit={handleSubmit}>
              <div className="im-body">
                {error && <div className="im-error">{error}</div>}

                {/* GENERAL */}
                {tab === 'general' && (
                  <>
                    <div className="im-row">
                      <div className="im-field">
                        <label className="im-label">Code</label>
                        <input className="im-input" placeholder="Auto-generated" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} />
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
                          minWidth={240}
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
                          minWidth={240}
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
                    </div>
                    <div className="im-field">
                      <label className="im-label">Base UOM (legacy) *</label>
                      <p className="im-sublabel">Kept for backward compatibility.</p>
                      <input className="im-input" placeholder="PCS" value={form.baseUom} onChange={e => setForm(f => ({ ...f, baseUom: e.target.value }))} required />
                    </div>

                    <div className="im-section" style={{ color:'#fb923c', opacity:0.8 }}>Purchase — Purchasing domain</div>
                    <div className="im-row">
                      <div className="im-field">
                        <label className="im-label">Purchase UOM</label>
                        <p className="im-sublabel">Unit used in POs, GRNs and supplier quotes</p>
                        <SearchSelect options={uomOpts} value={form.purchaseUomId ?? ''} onChange={v => setForm(f => ({ ...f, purchaseUomId: v || undefined }))} placeholder="Search UOM…" clearLabel="— Same as consumption —" minWidth={240} />
                      </div>
                      <div className="im-field">
                        <label className="im-label">Purchase → Consumption Factor</label>
                        <p className="im-sublabel">Consumption units per 1 purchase unit</p>
                        <input className="im-input" type="number" min="0" step="0.000001" value={form.purchaseToConsumptionFactor ?? 1} onChange={setNum('purchaseToConsumptionFactor')} />
                      </div>
                    </div>

                    <div className="im-section" style={{ color:'#60a5fa', opacity:0.8 }}>Storage — Warehouse domain</div>
                    <div className="im-row">
                      <div className="im-field">
                        <label className="im-label">Storage UOM</label>
                        <p className="im-sublabel">Unit used for stock counting in warehouse</p>
                        <SearchSelect options={uomOpts} value={form.storageUomId ?? ''} onChange={v => setForm(f => ({ ...f, storageUomId: v || undefined }))} placeholder="Search UOM…" clearLabel="— Same as consumption —" minWidth={240} />
                      </div>
                      <div className="im-field">
                        <label className="im-label">Storage → Consumption Factor</label>
                        <p className="im-sublabel">Consumption units per 1 storage unit</p>
                        <input className="im-input" type="number" min="0" step="0.000001" value={form.storageToConsumptionFactor ?? 1} onChange={setNum('storageToConsumptionFactor')} />
                      </div>
                    </div>

                    <div className="im-section" style={{ color:'#4ade80', opacity:0.8 }}>Consumption — Production domain</div>
                    <div className="im-field">
                      <label className="im-label">Consumption UOM</label>
                      <p className="im-sublabel">Unit used in BOM and production orders</p>
                      <SearchSelect options={uomOpts} value={form.consumptionUomId ?? ''} onChange={v => setForm(f => ({ ...f, consumptionUomId: v || undefined }))} placeholder="Search UOM…" clearLabel="— Select consumption UOM —" minWidth={240} />
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
                {tab === 'suppliers' && effectiveInitial && (
                  <SuppliersTab ref={suppliersTabRef} item={liveItem ?? effectiveInitial} uomUnits={uomUnits} />
                )}
              </div>

              <div className="im-ftr">
                <button type="button" className="im-btn-cancel" onClick={onClose}>
                  {tab === 'suppliers' ? 'Close' : 'Cancel'}
                </button>
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

// ─── Items Table Columns ──────────────────────────────────────────────────────

function ITEMS_COLUMNS(onEdit: (item: Item) => void, onDelete: (item: Item) => void): ERPColumn<Item>[] {
  return [
    { key: 'code', header: 'Code', width: 120, sortable: true, value: r => r.code, render: r => <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:12, color:'#fb923c' }}>{r.code}</span> },
    { key: 'name', header: 'Name', sortable: true, value: r => r.name, render: r => (<div><div style={{ color:'#e2dfd8', fontWeight:500 }}>{r.name}</div>{r.description && <div style={{ fontSize:11, color:'rgba(255,255,255,0.3)', marginTop:2 }}>{r.description}</div>}</div>) },
    { key: 'itemType', header: 'Type', width: 140, sortable: true, value: r => r.itemType, render: r => <TypeBadge type={r.itemType} /> },
    { key: 'category', header: 'Category', width: 110, sortable: true, value: r => (r as any).category?.code ?? '', render: r => { const a = r as any; return a.category ? <span style={{ display:'inline-flex', alignItems:'center', padding:'2px 7px', borderRadius:20, fontSize:10, fontWeight:500, color:'#a78bfa', background:'rgba(167,139,250,0.1)', border:'0.5px solid rgba(167,139,250,0.2)' }}>{a.category.code}</span> : <span style={{ color:'rgba(255,255,255,0.4)', fontSize:12 }}>—</span>; } },
    { key: 'purchaseUom', header: 'Purchase', width: 90, sortable: true, value: r => (r as any).purchaseUom?.code ?? '', render: r => <UomBadge unit={(r as any).purchaseUom} /> },
    { key: 'storageUom', header: 'Storage', width: 90, sortable: true, value: r => (r as any).storageUom?.code ?? '', render: r => <UomBadge unit={(r as any).storageUom} /> },
    { key: 'consumptionUom', header: 'Consumption', width: 110, sortable: true, value: r => (r as any).consumptionUom?.code ?? '', render: r => <UomBadge unit={(r as any).consumptionUom} /> },
    { key: 'suppliers', header: 'Suppliers', width: 100, sortable: true, value: r => (r as any).supplierItems?.length ?? 0, render: r => { const count = (r as any).supplierItems?.length ?? 0; return count > 0 ? <span style={{ display:'inline-flex', alignItems:'center', padding:'2px 7px', borderRadius:20, fontSize:10, color:'#4ade80', background:'rgba(74,222,128,0.08)', border:'0.5px solid rgba(74,222,128,0.2)' }}>{count} supplier{count !== 1 ? 's' : ''}</span> : <span style={{ color:'rgba(255,255,255,0.4)', fontSize:12 }}>—</span>; } },
    { key: 'isStockable',      header: 'S',  width: 45, align: 'center', sortable: false, render: r => <BoolDot value={r.isStockable} /> },
    { key: 'isPurchasable',    header: 'P',  width: 45, align: 'center', sortable: false, render: r => <BoolDot value={r.isPurchasable} /> },
    { key: 'isSaleable',       header: 'Sa', width: 45, align: 'center', sortable: false, render: r => <BoolDot value={r.isSaleable} /> },
    { key: 'isManufacturable', header: 'M',  width: 45, align: 'center', sortable: false, render: r => <BoolDot value={r.isManufacturable} /> },
    {
      key: '_actions', header: '', width: 110, sortable: false,
      render: r => (
        <div style={{ display:'flex', gap:6 }}>
          <button className="itm-btn-edit" onClick={e => { e.stopPropagation(); onEdit(r); }}>Edit</button>
          <button className="itm-btn-del"  onClick={e => { e.stopPropagation(); onDelete(r); }}>Delete</button>
        </div>
      ),
    },
  ];
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ItemsPage() {
  const [items,           setItems]           = useState<Item[]>([]);
  const [stats,           setStats]           = useState<ItemStatistics | null>(null);
  const [categories,      setCategories]      = useState<Category[]>([]);
  const [macroCategories, setMacroCategories] = useState<MacroCategory[]>([]);
  const [uomUnits,        setUomUnits]        = useState<UomUnit[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [error,           setError]           = useState('');
  const [modalOpen,       setModalOpen]       = useState(false);
  const [editing,         setEditing]         = useState<Item | null>(null);
  const [deleting,        setDeleting]        = useState<Item | null>(null);
  const [typeFilter,      setTypeFilter]      = useState<string | null>(null);
  const [deleteBusy,      setDeleteBusy]      = useState(false);
  const [pageSuppliers,   setPageSuppliers]   = useState<any[]>([]);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [data, statsData, cats, mcs, uoms, sups] = await Promise.all([
        itemsApi.getAll(), itemsApi.getStatistics(),
        categoriesApi.getAll(), macroCategoriesApi.getAll(), uomApi.getUnits(),
        suppliersApi.getAll(),
      ]);
      setItems(data as Item[]); setStats(statsData);
      setCategories(cats); setMacroCategories(mcs); setUomUnits(uoms);
      setPageSuppliers(sups as any[]);
    } catch (err) { setError(err instanceof Error ? err.message : 'Failed to load items.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const itemsFilters = useMemo<ERPFilter<Item>[]>(() => [
    { key: 'macroCategoryId', label: 'Macro Cat.', type: 'searchselect', placeholder: 'All Macro Categories', options: macroCategories.map(mc => ({ value: mc.id, label: `${mc.code} — ${mc.name}` })), filterFn: (row, val) => { const cat = (row as any).category; return cat?.macroCategoryId === val || cat?.macroCategory?.id === val; } },
    { key: 'categoryId', label: 'Category', type: 'searchselect', placeholder: 'All Categories', options: categories.map(c => ({ value: c.id, label: `${c.code} — ${c.name}`, sublabel: (c as any).macroCategory?.name })), filterFn: (row, val) => (row as any).category?.id === val || row.categoryId === val },
    { key: 'supplierId', label: 'Supplier', type: 'searchselect', placeholder: 'All Suppliers', options: pageSuppliers.map(s => ({ value: s.id, label: `${s.code} — ${s.name}`, sublabel: s.category ?? undefined })), filterFn: (row, val) => ((row as any).supplierItems ?? []).some((si: any) => si.supplierId === val || si.supplier?.id === val) },
    { key: 'valuationMethod', label: 'Valuation', type: 'select', placeholder: 'All Methods', options: [{ value: 'average', label: 'Average' }, { value: 'fifo', label: 'FIFO' }, { value: 'standard', label: 'Standard' }], filterFn: (row, val) => row.valuationMethod === val },
    { key: 'hasUomTriple',     label: 'UOM Triple',    type: 'boolean', placeholder: 'UOM Triple only', filterFn: (row, val) => val === true ? !!(row as any).consumptionUomId : true },
    { key: 'isStockable',      label: 'Stockable',     type: 'boolean', filterFn: (row, val) => val === true ? row.isStockable      : true },
    { key: 'isPurchasable',    label: 'Purchasable',   type: 'boolean', filterFn: (row, val) => val === true ? row.isPurchasable    : true },
    { key: 'isSaleable',       label: 'Saleable',      type: 'boolean', filterFn: (row, val) => val === true ? row.isSaleable       : true },
    { key: 'isManufacturable', label: 'Manufacturable',type: 'boolean', filterFn: (row, val) => val === true ? row.isManufacturable : true },
  ], [categories, macroCategories, pageSuppliers]);

  const { values: filterVals, setValue: setFilterVal, reset: resetFilters, activeCount: filterCount } = useERPFilters(itemsFilters);

  const filtered = useMemo(() => {
    const base = applyERPFilters(items, itemsFilters, filterVals);
    return typeFilter ? base.filter(i => i.itemType === typeFilter) : base;
  }, [items, itemsFilters, filterVals, typeFilter]);

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
        .itm-page{padding:0 18px 12px;display:flex;flex-direction:column;height:100%;gap:0;overflow:hidden}
        .itm-toolbar{display:flex;align-items:flex-start;gap:10px;margin-bottom:10px;flex-wrap:wrap}
        .itm-btn-new{display:flex;align-items:center;gap:6px;margin-left:auto;background:linear-gradient(135deg,#c2410c,#ea580c,#f97316);border:none;border-radius:7px;padding:7px 14px;font-size:12px;font-weight:500;font-family:'IBM Plex Sans',sans-serif;color:white;cursor:pointer;box-shadow:0 3px 12px rgba(234,88,12,0.3);flex-shrink:0}
        .itm-btn-new:hover{opacity:0.88}
        .itm-error{background:rgba(239,68,68,0.08);border:0.5px solid rgba(239,68,68,0.2);border-radius:8px;padding:10px 14px;margin-bottom:14px;font-size:13px;color:#fca5a5}
        .itm-btn-edit,.itm-btn-del{padding:5px 10px;border-radius:6px;font-size:11px;font-family:'IBM Plex Sans',sans-serif;cursor:pointer;border:0.5px solid transparent;white-space:nowrap}
        .itm-btn-edit{background:rgba(255,255,255,0.05);color:rgba(255,255,255,0.55);border-color:rgba(255,255,255,0.1)}
        .itm-btn-del{background:rgba(239,68,68,0.08);color:#f87171;border-color:rgba(239,68,68,0.2)}
      `}</style>

      <div className="itm-page">
        {stats && <StatsBar stats={stats} activeType={typeFilter} onTypeClick={setTypeFilter} />}

        <div className="itm-toolbar">
          <div style={{ flex: 1 }}>
            <ERPFilterBar filters={itemsFilters} values={filterVals} onChange={setFilterVal}
              onReset={() => { resetFilters(); setTypeFilter(null); }}
              activeCount={filterCount + (typeFilter ? 1 : 0)} />
          </div>
          <button className="itm-btn-new" onClick={() => { setEditing(null); setModalOpen(true); }}>
            + New Item
          </button>
        </div>

        {error && <div className="itm-error">{error}</div>}

        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <ERPTable<Item>
            columns={ITEMS_COLUMNS(item => { setEditing(item); setModalOpen(true); }, item => setDeleting(item))}
            data={filtered} rowKey={row => row.id} loading={loading}
            exportFilename="items"
            emptyMessage={filterCount || typeFilter ? 'No items match your filters.' : 'No items yet.'}
            defaultPageSize={25} maxHeight="100%"
          />
        </div>

        <div style={{ marginTop:6, display:'flex', gap:14, fontSize:10, color:'rgba(255,255,255,0.25)', flexShrink:0 }}>
          <span>S = Stockable</span><span>P = Purchasable</span><span>Sa = Saleable</span><span>M = Manufacturable</span>
        </div>
      </div>

      <ItemModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={fetchAll}
        onCreated={created => { setEditing(created); fetchAll(); }}
        initial={editing}
        categories={categories} macroCategories={macroCategories} uomUnits={uomUnits}
      />

      {deleting && <DeleteConfirm item={deleting} onCancel={() => setDeleting(null)} onConfirm={handleDelete} busy={deleteBusy} />}
    </ERPShell>
  );
}