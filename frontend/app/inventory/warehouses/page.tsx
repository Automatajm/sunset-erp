"use client";

import { useEffect, useState, useCallback, useMemo } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import { ERPTable, ERPColumn } from '@/components/ui/ERPTable';
import { ERPFilterBar, ERPFilter, useERPFilters, applyERPFilters } from '@/components/ui/ERPFilterBar';
import { warehousesApi } from '@/lib/api/warehouses';
import { warehouseLocationsApi, WZone, WAisle, WRack, WLevel, WBin } from '@/lib/api/warehouse-locations';
import { Warehouse, CreateWarehouseDto } from '@/lib/api/types';

// ─── Types ────────────────────────────────────────────────────────────────────
type WarehouseType = 'regular' | 'consignment' | 'transit';

interface WarehouseStats {
  stockLines: number;
  totalOnHand: string | null;
  locations: { zones: number; aisles: number; racks: number; levels: number; bins: number };
  capacity: { maxWeightKg: string | null; maxVolumeLtr: string | null; maxPallets: number | null };
}

// ─── Constants ────────────────────────────────────────────────────────────────
const WH_TYPES: { value: WarehouseType; label: string; color: string; bg: string; border: string }[] = [
  { value: 'regular',     label: 'Regular',     color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',  border: 'rgba(96,165,250,0.2)' },
  { value: 'consignment', label: 'Consignment', color: '#fbbf24', bg: 'rgba(251,191,36,0.1)',  border: 'rgba(251,191,36,0.2)' },
  { value: 'transit',     label: 'Transit',     color: '#a78bfa', bg: 'rgba(167,139,250,0.1)', border: 'rgba(167,139,250,0.2)' },
];

const ZONE_TYPES = [
  { value: 'storage',    label: 'Storage',    color: '#60a5fa' },
  { value: 'receiving',  label: 'Receiving',  color: '#4ade80' },
  { value: 'shipping',   label: 'Shipping',   color: '#fbbf24' },
  { value: 'quarantine', label: 'Quarantine', color: '#f87171' },
  { value: 'production', label: 'Production', color: '#a78bfa' },
  { value: 'returns',    label: 'Returns',    color: '#fb923c' },
];

const BIN_TYPES = ['standard', 'pallet', 'big_bag', 'tank', 'silo', 'ibc', 'container', 'bulk'];

const EMPTY_WH_FORM: CreateWarehouseDto = {
  code: '', name: '', warehouseType: 'regular',
  address: '', isActive: true, locationTrackingEnabled: false,
};

function getTypeConfig(t?: string) { return WH_TYPES.find(x => x.value === t) ?? WH_TYPES[0]; }
function zoneColor(t: string) { return ZONE_TYPES.find(z => z.value === t)?.color ?? '#e2dfd8'; }

// ─── Shared Styles ────────────────────────────────────────────────────────────
const INP: React.CSSProperties = { background:'rgba(255,255,255,0.04)', border:'0.5px solid rgba(255,255,255,0.12)', borderRadius:6, padding:'6px 10px', fontSize:12, fontFamily:"'IBM Plex Sans',sans-serif", color:'#f1ede8', outline:'none', width:'100%' };
const LBL: React.CSSProperties = { fontSize:10, fontWeight:500, letterSpacing:'0.08em', textTransform:'uppercase', color:'rgba(251,146,60,0.55)' };
const BTN_ADD: React.CSSProperties = { background:'rgba(251,146,60,0.1)', border:'0.5px solid rgba(251,146,60,0.25)', borderRadius:6, padding:'4px 10px', fontSize:11, fontFamily:"'IBM Plex Sans',sans-serif", color:'#fb923c', cursor:'pointer' };
const BTN_SAVE: React.CSSProperties = { background:'rgba(234,88,12,0.8)', border:'none', borderRadius:6, padding:'5px 12px', fontSize:11, fontWeight:500, fontFamily:"'IBM Plex Sans',sans-serif", color:'white', cursor:'pointer' };
const BTN_CANCEL: React.CSSProperties = { background:'rgba(255,255,255,0.05)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:6, padding:'5px 10px', fontSize:11, fontFamily:"'IBM Plex Sans',sans-serif", color:'rgba(255,255,255,0.45)', cursor:'pointer' };
const BTN_EDIT: React.CSSProperties = { background:'none', border:'none', padding:'3px 7px', fontSize:10, fontFamily:"'IBM Plex Sans',sans-serif", color:'rgba(255,255,255,0.3)', cursor:'pointer', borderRadius:4 };
const BTN_DEL: React.CSSProperties = { background:'none', border:'none', padding:'3px 7px', fontSize:10, fontFamily:"'IBM Plex Sans',sans-serif", color:'rgba(239,68,68,0.5)', cursor:'pointer', borderRadius:4 };

// ─── Inline Form ──────────────────────────────────────────────────────────────
// Generic inline creation/edit form row used at every level

interface InlineFormProps {
  fields: { key: string; label: string; placeholder?: string; type?: string; options?: string[] }[];
  values: Record<string, string>;
  onChange: (key: string, val: string) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
  error?: string;
  saveLabel?: string;
}

function InlineForm({ fields, values, onChange, onSave, onCancel, saving, error, saveLabel = 'Add' }: InlineFormProps) {
  return (
    <div style={{ background:'rgba(251,146,60,0.04)', border:'0.5px solid rgba(251,146,60,0.15)', borderRadius:7, padding:10, display:'flex', flexDirection:'column', gap:8 }}>
      {error && <div style={{ background:'rgba(239,68,68,0.1)', border:'0.5px solid rgba(239,68,68,0.2)', borderRadius:5, padding:'5px 9px', fontSize:11, color:'#fca5a5' }}>{error}</div>}
      <div style={{ display:'grid', gridTemplateColumns:`repeat(${Math.min(fields.length, 3)}, 1fr)`, gap:8 }}>
        {fields.map(f => (
          <div key={f.key} style={{ display:'flex', flexDirection:'column', gap:3 }}>
            <label style={LBL}>{f.label}</label>
            {f.options ? (
              <select style={INP} value={values[f.key] ?? ''} onChange={e => onChange(f.key, e.target.value)}>
                {f.options.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            ) : (
              <input style={INP} type={f.type ?? 'text'} placeholder={f.placeholder ?? ''} value={values[f.key] ?? ''} onChange={e => onChange(f.key, e.target.value)} />
            )}
          </div>
        ))}
      </div>
      <div style={{ display:'flex', gap:6, justifyContent:'flex-end' }}>
        <button style={BTN_CANCEL} onClick={onCancel} type="button">Cancel</button>
        <button style={BTN_SAVE} onClick={onSave} disabled={saving} type="button">
          {saving ? 'Saving…' : saveLabel}
        </button>
      </div>
    </div>
  );
}

// ─── Location Tree with full CRUD ─────────────────────────────────────────────

interface LocationTreeProps {
  warehouseId: string;
  onStatsChange?: () => void;
}

function LocationTree({ warehouseId, onStatsChange }: LocationTreeProps) {
  const [zones,      setZones]      = useState<WZone[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [expanded,   setExpanded]   = useState<Set<string>>(new Set());

  // Which node is showing its "add child" form
  const [addingTo,   setAddingTo]   = useState<string | null>(null);
  const [addLevel,   setAddLevel]   = useState<'zone'|'aisle'|'rack'|'level'|'bin'>('zone');

  // Which node is being edited inline
  const [editingId,  setEditingId]  = useState<string | null>(null);
  const [editLevel,  setEditLevel]  = useState<'zone'|'aisle'|'rack'|'level'|'bin'>('zone');

  const [formVals,   setFormVals]   = useState<Record<string,string>>({});
  const [saving,     setSaving]     = useState(false);
  const [formError,  setFormError]  = useState('');

  // ── Load ──────────────────────────────────────────────────────────────────

  const loadTree = useCallback(async () => {
    try {
      setLoading(true);
      const data = await warehousesApi.getLocationTree(warehouseId);
      setZones(data);
      if (data.length > 0 && expanded.size === 0) setExpanded(new Set([data[0].id]));
    } catch {} finally { setLoading(false); }
  }, [warehouseId]);

  useEffect(() => { loadTree(); }, [loadTree]);

  const toggle = (id: string) => setExpanded(prev => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });

  // ── Form helpers ──────────────────────────────────────────────────────────

  const startAdd = (parentId: string, level: typeof addLevel, defaults?: Record<string,string>) => {
    setAddingTo(parentId); setAddLevel(level);
    setEditingId(null);
    setFormVals(defaults ?? {}); setFormError('');
  };

  const startEdit = (id: string, level: typeof editLevel, current: Record<string,string>) => {
    setEditingId(id); setEditLevel(level);
    setAddingTo(null);
    setFormVals(current); setFormError('');
  };

  const cancelForm = () => { setAddingTo(null); setEditingId(null); setFormVals({}); setFormError(''); };

  const fv = (key: string) => formVals[key] ?? '';
  const setFv = (key: string, val: string) => setFormVals(p => ({ ...p, [key]: val }));

  // ── CRUD operations ───────────────────────────────────────────────────────

  const handleSave = async () => {
    setSaving(true); setFormError('');
    try {
      if (editingId) {
        // EDIT
        switch (editLevel) {
          case 'zone':  await warehouseLocationsApi.updateZone(editingId,  { code: fv('code'), name: fv('name'), zoneType: fv('zoneType'), description: fv('description') || undefined }); break;
          case 'aisle': await warehouseLocationsApi.updateAisle(editingId, { code: fv('code'), name: fv('name') || undefined }); break;
          case 'rack':  await warehouseLocationsApi.updateRack(editingId,  { code: fv('code'), name: fv('name') || undefined }); break;
          case 'level': await warehouseLocationsApi.updateLevel(editingId, { code: fv('code'), name: fv('name') || undefined, maxWeightKg: fv('maxWeightKg') ? Number(fv('maxWeightKg')) : undefined, maxVolumeLtr: fv('maxVolumeLtr') ? Number(fv('maxVolumeLtr')) : undefined, maxPallets: fv('maxPallets') ? Number(fv('maxPallets')) : undefined }); break;
          case 'bin':   await warehouseLocationsApi.updateBin(editingId,   { code: fv('code'), name: fv('name') || undefined, binType: fv('binType'), maxWeightKg: fv('maxWeightKg') ? Number(fv('maxWeightKg')) : undefined, maxVolumeLtr: fv('maxVolumeLtr') ? Number(fv('maxVolumeLtr')) : undefined, maxPallets: fv('maxPallets') ? Number(fv('maxPallets')) : undefined, notes: fv('notes') || undefined }); break;
        }
      } else if (addingTo) {
        // CREATE
        switch (addLevel) {
          case 'zone':  await warehouseLocationsApi.createZone({ warehouseId, code: fv('code'), name: fv('name'), zoneType: fv('zoneType') || 'storage', description: fv('description') || undefined }); break;
          case 'aisle': await warehouseLocationsApi.createAisle({ zoneId: addingTo, code: fv('code'), name: fv('name') || undefined }); break;
          case 'rack':  await warehouseLocationsApi.createRack({ aisleId: addingTo, code: fv('code'), name: fv('name') || undefined }); break;
          case 'level': await warehouseLocationsApi.createLevel({ rackId: addingTo, code: fv('code'), name: fv('name') || undefined, maxWeightKg: fv('maxWeightKg') ? Number(fv('maxWeightKg')) : undefined, maxVolumeLtr: fv('maxVolumeLtr') ? Number(fv('maxVolumeLtr')) : undefined, maxPallets: fv('maxPallets') ? Number(fv('maxPallets')) : undefined }); break;
          case 'bin':   await warehouseLocationsApi.createBin({ levelId: addingTo, code: fv('code'), name: fv('name') || undefined, binType: fv('binType') || 'standard', maxWeightKg: fv('maxWeightKg') ? Number(fv('maxWeightKg')) : undefined, maxVolumeLtr: fv('maxVolumeLtr') ? Number(fv('maxVolumeLtr')) : undefined, maxPallets: fv('maxPallets') ? Number(fv('maxPallets')) : undefined, notes: fv('notes') || undefined }); break;
        }
        // Auto-expand the parent so user sees the new child
        setExpanded(prev => new Set([...prev, addingTo]));
      }
      cancelForm();
      await loadTree();
      onStatsChange?.();
    } catch (err: any) {
      setFormError(err?.response?.data?.message ?? 'Operation failed.');
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: string, level: typeof addLevel) => {
    try {
      switch (level) {
        case 'zone':  await warehouseLocationsApi.deleteZone(id);  break;
        case 'aisle': await warehouseLocationsApi.deleteAisle(id); break;
        case 'rack':  await warehouseLocationsApi.deleteRack(id);  break;
        case 'level': await warehouseLocationsApi.deleteLevel(id); break;
        case 'bin':   await warehouseLocationsApi.deleteBin(id);   break;
      }
      await loadTree();
      onStatsChange?.();
    } catch (err: any) {
      setFormError(err?.response?.data?.message ?? 'Cannot delete — may have children or stock.');
    }
  };

  // ── Form field definitions per level ──────────────────────────────────────

  const zoneFields  = [{ key:'code', label:'Code *', placeholder:'STOR' }, { key:'name', label:'Name *', placeholder:'Storage Area' }, { key:'zoneType', label:'Zone Type', options: ZONE_TYPES.map(z => z.value) }, { key:'description', label:'Description', placeholder:'Optional…' }];
  const aisleFields = [{ key:'code', label:'Code *', placeholder:'01' }, { key:'name', label:'Name', placeholder:'Aisle 1' }];
  const rackFields  = [{ key:'code', label:'Code *', placeholder:'01' }, { key:'name', label:'Name', placeholder:'Rack 1' }];
  const levelFields = [{ key:'code', label:'Code *', placeholder:'01' }, { key:'name', label:'Name', placeholder:'Level 1' }, { key:'maxWeightKg', label:'Max Weight (kg)', placeholder:'0', type:'number' }, { key:'maxVolumeLtr', label:'Max Volume (ltr)', placeholder:'0', type:'number' }, { key:'maxPallets', label:'Max Pallets', placeholder:'0', type:'number' }];
  const binFields   = [{ key:'code', label:'Code *', placeholder:'01' }, { key:'name', label:'Name', placeholder:'Bin 1' }, { key:'binType', label:'Bin Type', options: BIN_TYPES }, { key:'maxWeightKg', label:'Max Weight (kg)', placeholder:'0', type:'number' }, { key:'maxVolumeLtr', label:'Max Vol (ltr)', placeholder:'0', type:'number' }, { key:'maxPallets', label:'Max Pallets', placeholder:'0', type:'number' }, { key:'notes', label:'Notes', placeholder:'Optional…' }];

  // ── Row rendering helpers ─────────────────────────────────────────────────

  const nodeActions = (id: string, level: typeof addLevel, editDefaults: Record<string,string>, canAddChild: boolean, childLevel?: typeof addLevel, childLabel?: string, parentId?: string) => (
    <div style={{ display:'flex', gap:4, marginLeft:'auto', opacity:0, transition:'opacity 0.15s' }} className="loc-actions">
      {canAddChild && childLevel && (
        <button style={BTN_ADD} onClick={e => { e.stopPropagation(); startAdd(id, childLevel); }} type="button">+ {childLabel}</button>
      )}
      <button style={BTN_EDIT} onClick={e => { e.stopPropagation(); startEdit(id, level, editDefaults); }} type="button">Edit</button>
      <button style={BTN_DEL}  onClick={e => { e.stopPropagation(); handleDelete(id, level); }} type="button">✕</button>
    </div>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  if (loading) return <div style={{ textAlign:'center', padding:32, color:'rgba(255,255,255,0.25)', fontSize:12 }}>Loading locations…</div>;

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      <style>{`
        .loc-row:hover .loc-actions { opacity: 1 !important; }
        .loc-row:hover { background: rgba(255,255,255,0.03) !important; }
      `}</style>

      {/* ── Add Zone button (always visible at top) ── */}
      {addingTo !== warehouseId && (
        <button style={{ ...BTN_ADD, alignSelf:'flex-start', marginBottom:2 }}
          onClick={() => startAdd(warehouseId, 'zone', { zoneType: 'storage' })} type="button">
          + Add Zone
        </button>
      )}
      {addingTo === warehouseId && addLevel === 'zone' && (
        <InlineForm fields={zoneFields} values={formVals} onChange={setFv} onSave={handleSave} onCancel={cancelForm} saving={saving} error={formError} saveLabel="Create Zone" />
      )}

      {zones.length === 0 && addingTo !== warehouseId && (
        <div style={{ textAlign:'center', padding:32, color:'rgba(255,255,255,0.2)', fontSize:12, border:'0.5px dashed rgba(255,255,255,0.08)', borderRadius:8 }}>
          No zones yet — click "+ Add Zone" to start configuring this warehouse.
        </div>
      )}

      {/* ── Zones ── */}
      {zones.map(zone => (
        <div key={zone.id} style={{ borderRadius:8, border:'0.5px solid rgba(255,255,255,0.07)', overflow:'visible' }}>

          {/* Zone row */}
          {editingId === zone.id ? (
            <div style={{ padding:10 }}>
              <InlineForm fields={zoneFields} values={formVals} onChange={setFv} onSave={handleSave} onCancel={cancelForm} saving={saving} error={formError} saveLabel="Save Zone" />
            </div>
          ) : (
            <div className="loc-row" onClick={() => toggle(zone.id)}
              style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background:'rgba(255,255,255,0.02)', cursor:'pointer', userSelect:'none', borderRadius: expanded.has(zone.id) ? '8px 8px 0 0' : 8 }}>
              <span style={{ fontSize:11, color: zoneColor(zone.zoneType), transition:'transform 0.15s', display:'inline-block', transform: expanded.has(zone.id) ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
              <span style={{ fontSize:12, color: zoneColor(zone.zoneType), fontFamily:"'IBM Plex Mono',monospace", fontWeight:500, minWidth:60 }}>{zone.code}</span>
              <span style={{ fontSize:12, color:'#e2dfd8', flex:1 }}>{zone.name}</span>
              <span style={{ fontSize:10, color: zoneColor(zone.zoneType), background:`${zoneColor(zone.zoneType)}18`, border:`0.5px solid ${zoneColor(zone.zoneType)}35`, padding:'1px 7px', borderRadius:20 }}>{zone.zoneType}</span>
              <span style={{ fontSize:11, color:'rgba(255,255,255,0.25)' }}>{zone.aisles?.length ?? zone._count?.aisles ?? 0} aisles</span>
              {nodeActions(zone.id, 'zone', { code:zone.code, name:zone.name, zoneType:zone.zoneType, description:zone.description??'' }, true, 'aisle', 'Aisle')}
            </div>
          )}

          {/* Add Aisle form */}
          {addingTo === zone.id && addLevel === 'aisle' && (
            <div style={{ padding:'0 10px 10px', borderTop:'0.5px solid rgba(255,255,255,0.05)' }}>
              <InlineForm fields={aisleFields} values={formVals} onChange={setFv} onSave={handleSave} onCancel={cancelForm} saving={saving} error={formError} saveLabel="Create Aisle" />
            </div>
          )}

          {/* Aisles */}
          {expanded.has(zone.id) && zone.aisles?.map(aisle => (
            <div key={aisle.id} style={{ borderTop:'0.5px solid rgba(255,255,255,0.04)' }}>

              {editingId === aisle.id ? (
                <div style={{ padding:'6px 10px 6px 28px' }}>
                  <InlineForm fields={aisleFields} values={formVals} onChange={setFv} onSave={handleSave} onCancel={cancelForm} saving={saving} error={formError} saveLabel="Save Aisle" />
                </div>
              ) : (
                <div className="loc-row" onClick={() => toggle(aisle.id)}
                  style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 14px 8px 28px', cursor:'pointer', userSelect:'none' }}>
                  <span style={{ fontSize:10, color:'rgba(255,255,255,0.2)' }}>│</span>
                  <span style={{ fontSize:10, color:'rgba(251,146,60,0.7)', transition:'transform 0.15s', display:'inline-block', transform: expanded.has(aisle.id) ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                  <span style={{ fontSize:11, color:'rgba(251,146,60,0.8)', fontFamily:"'IBM Plex Mono',monospace", minWidth:70 }}>{aisle.fullCode}</span>
                  <span style={{ fontSize:11, color:'rgba(255,255,255,0.6)', flex:1 }}>{aisle.name ?? `Aisle ${aisle.code}`}</span>
                  <span style={{ fontSize:10, color:'rgba(255,255,255,0.2)' }}>{aisle.racks?.length ?? aisle._count?.racks ?? 0} racks</span>
                  {nodeActions(aisle.id, 'aisle', { code:aisle.code, name:aisle.name??'' }, true, 'rack', 'Rack')}
                </div>
              )}

              {/* Add Rack form */}
              {addingTo === aisle.id && addLevel === 'rack' && (
                <div style={{ padding:'0 10px 8px 44px', borderTop:'0.5px solid rgba(255,255,255,0.03)' }}>
                  <InlineForm fields={rackFields} values={formVals} onChange={setFv} onSave={handleSave} onCancel={cancelForm} saving={saving} error={formError} saveLabel="Create Rack" />
                </div>
              )}

              {/* Racks */}
              {expanded.has(aisle.id) && aisle.racks?.map(rack => (
                <div key={rack.id} style={{ borderTop:'0.5px solid rgba(255,255,255,0.03)' }}>

                  {editingId === rack.id ? (
                    <div style={{ padding:'6px 10px 6px 44px' }}>
                      <InlineForm fields={rackFields} values={formVals} onChange={setFv} onSave={handleSave} onCancel={cancelForm} saving={saving} error={formError} saveLabel="Save Rack" />
                    </div>
                  ) : (
                    <div className="loc-row" onClick={() => toggle(rack.id)}
                      style={{ display:'flex', alignItems:'center', gap:10, padding:'7px 14px 7px 44px', cursor:'pointer', userSelect:'none' }}>
                      <span style={{ fontSize:10, color:'rgba(255,255,255,0.15)' }}>│</span>
                      <span style={{ fontSize:10, color:'rgba(96,165,250,0.6)', transition:'transform 0.15s', display:'inline-block', transform: expanded.has(rack.id) ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                      <span style={{ fontSize:11, color:'rgba(96,165,250,0.8)', fontFamily:"'IBM Plex Mono',monospace", minWidth:80 }}>{rack.fullCode}</span>
                      <span style={{ fontSize:11, color:'rgba(255,255,255,0.5)', flex:1 }}>{rack.name ?? `Rack ${rack.code}`}</span>
                      <span style={{ fontSize:10, color:'rgba(255,255,255,0.2)' }}>{rack.levels?.length ?? 0} levels</span>
                      {nodeActions(rack.id, 'rack', { code:rack.code, name:rack.name??'' }, true, 'level', 'Level')}
                    </div>
                  )}

                  {/* Add Level form */}
                  {addingTo === rack.id && addLevel === 'level' && (
                    <div style={{ padding:'0 10px 8px 58px', borderTop:'0.5px solid rgba(255,255,255,0.02)' }}>
                      <InlineForm fields={levelFields} values={formVals} onChange={setFv} onSave={handleSave} onCancel={cancelForm} saving={saving} error={formError} saveLabel="Create Level" />
                    </div>
                  )}

                  {/* Levels */}
                  {expanded.has(rack.id) && rack.levels?.map(level => (
                    <div key={level.id} style={{ borderTop:'0.5px solid rgba(255,255,255,0.02)' }}>

                      {editingId === level.id ? (
                        <div style={{ padding:'6px 10px 6px 58px' }}>
                          <InlineForm fields={levelFields} values={formVals} onChange={setFv} onSave={handleSave} onCancel={cancelForm} saving={saving} error={formError} saveLabel="Save Level" />
                        </div>
                      ) : (
                        <div className="loc-row" onClick={() => toggle(level.id)}
                          style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 14px 6px 58px', cursor:'pointer', userSelect:'none' }}>
                          <span style={{ fontSize:10, color:'rgba(255,255,255,0.12)' }}>│</span>
                          <span style={{ fontSize:10, color:'rgba(167,139,250,0.6)', transition:'transform 0.15s', display:'inline-block', transform: expanded.has(level.id) ? 'rotate(90deg)' : 'rotate(0deg)' }}>▶</span>
                          <span style={{ fontSize:10, color:'rgba(167,139,250,0.8)', fontFamily:"'IBM Plex Mono',monospace", minWidth:90 }}>{level.fullCode}</span>
                          <span style={{ fontSize:10, color:'rgba(255,255,255,0.45)', flex:1 }}>{level.name ?? `Level ${level.code}`}</span>
                          {level.maxWeightKg && <span style={{ fontSize:10, color:'rgba(255,255,255,0.2)' }}>{Number(level.maxWeightKg).toLocaleString()}kg</span>}
                          {level.maxPallets  && <span style={{ fontSize:10, color:'rgba(255,255,255,0.2)' }}>{level.maxPallets}plt</span>}
                          {(level._count?.stock ?? 0) > 0 && <span style={{ fontSize:10, color:'#4ade80', background:'rgba(74,222,128,0.08)', padding:'1px 6px', borderRadius:20 }}>{level._count!.stock} lines</span>}
                          {(level._count?.bins  ?? 0) > 0 && <span style={{ fontSize:10, color:'rgba(255,255,255,0.2)' }}>{level._count!.bins} bins</span>}
                          {nodeActions(level.id, 'level', { code:level.code, name:level.name??'', maxWeightKg:level.maxWeightKg?String(level.maxWeightKg):'', maxVolumeLtr:level.maxVolumeLtr?String(level.maxVolumeLtr):'', maxPallets:level.maxPallets?String(level.maxPallets):'' }, true, 'bin', 'Bin')}
                        </div>
                      )}

                      {/* Add Bin form */}
                      {addingTo === level.id && addLevel === 'bin' && (
                        <div style={{ padding:'0 10px 8px 72px', borderTop:'0.5px solid rgba(255,255,255,0.015)' }}>
                          <InlineForm fields={binFields} values={{ binType:'standard', ...formVals }} onChange={setFv} onSave={handleSave} onCancel={cancelForm} saving={saving} error={formError} saveLabel="Create Bin" />
                        </div>
                      )}

                      {/* Bins */}
                      {expanded.has(level.id) && level.bins?.map(bin => (
                        <div key={bin.id}>
                          {editingId === bin.id ? (
                            <div style={{ padding:'6px 10px 6px 72px', borderTop:'0.5px solid rgba(255,255,255,0.01)' }}>
                              <InlineForm fields={binFields} values={formVals} onChange={setFv} onSave={handleSave} onCancel={cancelForm} saving={saving} error={formError} saveLabel="Save Bin" />
                            </div>
                          ) : (
                            <div className="loc-row"
                              style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 14px 5px 72px', borderTop:'0.5px solid rgba(255,255,255,0.01)', cursor:'default', userSelect:'none' }}>
                              <span style={{ fontSize:10, color:'rgba(255,255,255,0.1)' }}>│</span>
                              <span style={{ fontSize:10, color:'rgba(251,146,60,0.6)', fontFamily:"'IBM Plex Mono',monospace", minWidth:100 }}>{bin.fullCode}</span>
                              <span style={{ fontSize:10, color:'rgba(255,255,255,0.4)', flex:1 }}>{bin.name ?? `Bin ${bin.code}`}</span>
                              <span style={{ fontSize:9, color:'rgba(255,255,255,0.25)', background:'rgba(255,255,255,0.04)', padding:'1px 6px', borderRadius:20 }}>{bin.binType}</span>
                              {bin.maxWeightKg && <span style={{ fontSize:10, color:'rgba(255,255,255,0.2)' }}>{Number(bin.maxWeightKg).toLocaleString()}kg</span>}
                              {bin.maxPallets  && <span style={{ fontSize:10, color:'rgba(255,255,255,0.2)' }}>{bin.maxPallets}plt</span>}
                              {(bin._count?.stock ?? 0) > 0 && <span style={{ fontSize:10, color:'#4ade80', background:'rgba(74,222,128,0.08)', padding:'1px 6px', borderRadius:20 }}>{bin._count!.stock} lines</span>}
                              {nodeActions(bin.id, 'bin', { code:bin.code, name:bin.name??'', binType:bin.binType, maxWeightKg:bin.maxWeightKg?String(bin.maxWeightKg):'', maxVolumeLtr:bin.maxVolumeLtr?String(bin.maxVolumeLtr):'', maxPallets:bin.maxPallets?String(bin.maxPallets):'', notes:bin.notes??'' }, false)}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}

      {formError && !addingTo && !editingId && (
        <div style={{ background:'rgba(239,68,68,0.1)', border:'0.5px solid rgba(239,68,68,0.2)', borderRadius:6, padding:'7px 12px', fontSize:12, color:'#fca5a5' }}>{formError}</div>
      )}
    </div>
  );
}

// ─── Badges ───────────────────────────────────────────────────────────────────

function TypeBadge({ type }: { type?: string }) {
  const c = getTypeConfig(type);
  return <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'2px 9px', borderRadius:20, fontSize:11, fontWeight:500, color:c.color, background:c.bg, border:`0.5px solid ${c.border}`, whiteSpace:'nowrap' }}><span style={{ width:5, height:5, borderRadius:'50%', background:c.color, flexShrink:0 }} />{c.label}</span>;
}

function ActiveBadge({ active }: { active: boolean }) {
  return <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'2px 9px', borderRadius:20, fontSize:11, fontWeight:500, color: active ? '#4ade80' : 'rgba(255,255,255,0.35)', background: active ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.04)', border:`0.5px solid ${active ? 'rgba(74,222,128,0.2)' : 'rgba(255,255,255,0.08)'}` }}><span style={{ width:5, height:5, borderRadius:'50%', background: active ? '#4ade80' : 'rgba(255,255,255,0.2)', flexShrink:0 }} />{active ? 'Active' : 'Inactive'}</span>;
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:12, color: checked ? '#e2dfd8' : 'rgba(255,255,255,0.4)', userSelect:'none' }}><div onClick={() => onChange(!checked)} style={{ width:32, height:18, borderRadius:9, flexShrink:0, background: checked ? 'rgba(234,88,12,0.8)' : 'rgba(255,255,255,0.1)', border:`0.5px solid ${checked ? 'rgba(251,146,60,0.5)' : 'rgba(255,255,255,0.15)'}`, position:'relative', transition:'background 0.2s', cursor:'pointer' }}><div style={{ position:'absolute', top:2, left: checked ? 16 : 2, width:13, height:13, borderRadius:'50%', background:'#fff', transition:'left 0.2s', boxShadow:'0 1px 3px rgba(0,0,0,0.3)' }} /></div>{label}</label>;
}

// ─── Stats Bar ────────────────────────────────────────────────────────────────

function StatsBar({ warehouses, activeType, onTypeClick }: { warehouses: Warehouse[]; activeType: string | null; onTypeClick: (t: string | null) => void }) {
  const total   = warehouses.length;
  const active  = warehouses.filter(w => w.isActive).length;
  const tracked = warehouses.filter(w => (w as any).locationTrackingEnabled).length;
  return (
    <div style={{ display:'flex', gap:10, marginBottom:10, flexWrap:'wrap', flexShrink:0 }}>
      {WH_TYPES.map(t => {
        const count = warehouses.filter(w => w.warehouseType === t.value).length;
        const isActive = activeType === t.value;
        return <div key={t.value} onClick={() => onTypeClick(isActive ? null : t.value)} style={{ background: isActive ? t.bg : 'rgba(10,7,18,0.7)', border:`0.5px solid ${isActive ? t.color : t.border}`, borderRadius:8, padding:'8px 14px', display:'flex', flexDirection:'column', gap:2, minWidth:110, cursor:'pointer', transition:'all 0.15s', boxShadow: isActive ? `0 0 12px ${t.bg}` : 'none' }}><span style={{ fontSize:10, color:t.color, textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:500 }}>{t.label}</span><span style={{ fontSize:22, fontWeight:500, color: isActive ? t.color : '#f1ede8', fontFamily:"'IBM Plex Mono',monospace" }}>{count}</span></div>;
      })}
      <div style={{ background:'rgba(10,7,18,0.7)', border:'0.5px solid rgba(74,222,128,0.2)', borderRadius:8, padding:'8px 14px', display:'flex', flexDirection:'column', gap:2, minWidth:80 }}><span style={{ fontSize:10, color:'#4ade80', textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:500 }}>Active</span><span style={{ fontSize:22, fontWeight:500, color:'#f1ede8', fontFamily:"'IBM Plex Mono',monospace" }}>{active}</span></div>
      <div style={{ background:'rgba(10,7,18,0.7)', border:'0.5px solid rgba(96,165,250,0.2)', borderRadius:8, padding:'8px 14px', display:'flex', flexDirection:'column', gap:2, minWidth:80 }}><span style={{ fontSize:10, color:'#60a5fa', textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:500 }}>Location</span><span style={{ fontSize:22, fontWeight:500, color:'#f1ede8', fontFamily:"'IBM Plex Mono',monospace" }}>{tracked}</span></div>
      <div style={{ background:'rgba(10,7,18,0.7)', border:'0.5px solid rgba(251,146,60,0.2)', borderRadius:8, padding:'8px 14px', display:'flex', flexDirection:'column', gap:2, minWidth:70 }}><span style={{ fontSize:10, color:'rgba(251,146,60,0.6)', textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:500 }}>Total</span><span style={{ fontSize:22, fontWeight:500, color:'#fb923c', fontFamily:"'IBM Plex Mono',monospace" }}>{total}</span></div>
    </div>
  );
}

// ─── Warehouse Modal ──────────────────────────────────────────────────────────

function WarehouseModal({ open, onClose, onSaved, initial }: { open: boolean; onClose: () => void; onSaved: () => void; initial: Warehouse | null }) {
  const [form,       setForm]       = useState<CreateWarehouseDto>(EMPTY_WH_FORM);
  const [tab,        setTab]        = useState<'general' | 'locations'>('general');
  const [submitting, setSubmitting] = useState(false);
  const [error,      setError]      = useState('');
  const [stats,      setStats]      = useState<WarehouseStats | null>(null);
  const [statsKey,   setStatsKey]   = useState(0);

  useEffect(() => {
    if (open) {
      setError(''); setTab('general'); setStats(null);
      setForm(initial ? { code: initial.code, name: initial.name, warehouseType: initial.warehouseType ?? 'regular', address: initial.address ?? '', isActive: initial.isActive, locationTrackingEnabled: (initial as any).locationTrackingEnabled ?? false } : EMPTY_WH_FORM);
      if (initial) warehousesApi.getStats(initial.id).then(setStats).catch(() => {});
    }
  }, [open, initial]);

  const refreshStats = () => { if (initial) { warehousesApi.getStats(initial.id).then(setStats).catch(() => {}); setStatsKey(k => k + 1); } };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.code.trim() || !form.name.trim()) { setError('Code and name are required.'); return; }
    setSubmitting(true); setError('');
    try {
      if (initial) await warehousesApi.update(initial.id, form);
      else         await warehousesApi.create(form);
      onSaved(); onClose();
    } catch (err: any) { setError(err?.response?.data?.message ?? 'Operation failed.'); }
    finally { setSubmitting(false); }
  };

  if (!open) return null;

  const TABS = [{ key:'general', label:'General' }, ...(initial ? [{ key:'locations', label:'Location Tree' }] : [])];
  const FINP: React.CSSProperties = { background:'#0e0b1a', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:7, padding:'9px 12px', fontSize:13, fontFamily:"'IBM Plex Sans',sans-serif", color:'#f1ede8', outline:'none', width:'100%' };
  const FLBL: React.CSSProperties = { fontSize:11, fontWeight:500, letterSpacing:'0.08em', textTransform:'uppercase', color:'rgba(251,146,60,0.6)' };

  return (
    <>
      <style>{`
        .wm-overlay{position:fixed;inset:0;z-index:400;background:rgba(0,0,0,0.65);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:24px}
        .wm-box{background:#0e0b1a;border:0.5px solid rgba(251,146,60,0.2);border-radius:14px;width:100%;max-width:620px;max-height:92vh;display:flex;flex-direction:column;box-shadow:0 24px 60px rgba(0,0,0,0.7);position:relative}
        .wm-box::before{content:'';position:absolute;top:0;left:30px;right:30px;height:1px;background:linear-gradient(90deg,transparent,rgba(251,146,60,0.4),transparent);pointer-events:none}
        .wm-hdr{display:flex;align-items:center;justify-content:space-between;padding:14px 20px 0;flex-shrink:0}
        .wm-title{font-size:14px;font-weight:500;color:#f1ede8}
        .wm-close{width:24px;height:24px;border-radius:6px;background:rgba(255,255,255,0.06);border:none;cursor:pointer;color:rgba(255,255,255,0.45);font-size:16px;display:flex;align-items:center;justify-content:center}
        .wm-tabs{display:flex;padding:0 20px;border-bottom:0.5px solid rgba(255,255,255,0.06);flex-shrink:0}
        .wm-tab{padding:10px 14px;font-size:12px;cursor:pointer;color:rgba(255,255,255,0.4);border:none;border-bottom:2px solid transparent;background:none;font-family:'IBM Plex Sans',sans-serif;transition:color 0.15s}
        .wm-tab:hover{color:rgba(255,255,255,0.7)}
        .wm-tab-active{color:#fb923c !important;border-bottom-color:#fb923c !important}
        .wm-scroll{flex:1;overflow-y:auto;min-height:0}
        .wm-body{padding:16px 20px;display:flex;flex-direction:column;gap:12px}
        .wm-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
        .wm-field{display:flex;flex-direction:column;gap:5px}
        .wm-error{background:rgba(239,68,68,0.1);border:0.5px solid rgba(239,68,68,0.25);border-radius:7px;padding:8px 12px;font-size:12px;color:#fca5a5}
        .wm-ftr{display:flex;justify-content:flex-end;gap:8px;padding:12px 20px 18px;border-top:0.5px solid rgba(255,255,255,0.06);flex-shrink:0}
        .wm-btn-cancel{background:rgba(255,255,255,0.05);border:0.5px solid rgba(255,255,255,0.1);border-radius:7px;padding:8px 16px;font-size:13px;font-family:'IBM Plex Sans',sans-serif;color:rgba(255,255,255,0.5);cursor:pointer}
        .wm-btn-save{background:linear-gradient(135deg,#c2410c,#ea580c,#f97316);border:none;border-radius:7px;padding:8px 20px;font-size:13px;font-weight:500;font-family:'IBM Plex Sans',sans-serif;color:white;cursor:pointer;box-shadow:0 3px 12px rgba(234,88,12,0.35)}
        .wm-btn-save:disabled{opacity:0.5;cursor:not-allowed}
        .wm-section{font-size:10px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:rgba(255,255,255,0.25);padding:4px 0 2px;border-bottom:0.5px solid rgba(255,255,255,0.06);margin-top:4px}
        .wm-stat-row{display:flex;gap:10px;flex-wrap:wrap}
        .wm-stat{background:rgba(255,255,255,0.03);border:0.5px solid rgba(255,255,255,0.07);border-radius:8px;padding:8px 12px;display:flex;flex-direction:column;gap:2;min-width:80px}
        .wm-stat-lbl{font-size:10px;color:rgba(255,255,255,0.3);text-transform:uppercase;letter-spacing:0.08em}
        .wm-stat-val{font-size:16px;font-family:'IBM Plex Mono',monospace;color:#f1ede8;font-weight:500}
      `}</style>
      <div className="wm-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
        <div className="wm-box">
          <div className="wm-hdr">
            <span className="wm-title">{initial ? `Edit — ${initial.code}` : 'New Warehouse'}</span>
            <button className="wm-close" type="button" onClick={onClose}>×</button>
          </div>
          <div className="wm-tabs">
            {TABS.map(t => <button key={t.key} type="button" className={`wm-tab${tab === t.key ? ' wm-tab-active' : ''}`} onClick={() => setTab(t.key as any)}>{t.label}</button>)}
          </div>
          <div className="wm-scroll">
            <form onSubmit={handleSubmit}>
              <div className="wm-body">
                {error && <div className="wm-error">{error}</div>}

                {tab === 'general' && (<>
                  <div className="wm-row">
                    <div className="wm-field"><label style={FLBL}>Code *</label><input style={FINP} placeholder="WH-001" value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value }))} required /></div>
                    <div className="wm-field"><label style={FLBL}>Type</label>
                      <select style={FINP} value={form.warehouseType} onChange={e => setForm(f => ({ ...f, warehouseType: e.target.value as any }))}>
                        {WH_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="wm-field"><label style={FLBL}>Name *</label><input style={FINP} placeholder="Main Warehouse" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} required /></div>
                  <div className="wm-field"><label style={FLBL}>Address</label><textarea style={{ ...FINP, resize:'vertical', minHeight:64 }} placeholder="Industrial Zone…" value={form.address ?? ''} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} /></div>
                  <div className="wm-section">Configuration</div>
                  <div style={{ display:'flex', flexDirection:'column', gap:10, background:'rgba(255,255,255,0.02)', border:'0.5px solid rgba(255,255,255,0.06)', borderRadius:8, padding:'12px 14px' }}>
                    <Toggle label="Active" checked={form.isActive ?? true} onChange={v => setForm(f => ({ ...f, isActive: v }))} />
                    <Toggle label="Enable Location Tracking (Zone → Aisle → Rack → Level → Bin)" checked={(form as any).locationTrackingEnabled ?? false} onChange={v => setForm(f => ({ ...f, locationTrackingEnabled: v }))} />
                  </div>
                  {(form as any).locationTrackingEnabled && <div style={{ background:'rgba(96,165,250,0.05)', border:'0.5px solid rgba(96,165,250,0.2)', borderRadius:8, padding:'10px 14px', fontSize:12, color:'rgba(96,165,250,0.8)', lineHeight:1.6 }}>Location tracking enabled — configure zones in the <strong>Location Tree</strong> tab after saving.</div>}
                  {initial && stats && (<>
                    <div className="wm-section">Stock & Capacity</div>
                    <div className="wm-stat-row">
                      <div className="wm-stat"><span className="wm-stat-lbl">Stock Lines</span><span className="wm-stat-val">{stats.stockLines}</span></div>
                      <div className="wm-stat"><span className="wm-stat-lbl">Zones</span><span className="wm-stat-val">{stats.locations.zones}</span></div>
                      <div className="wm-stat"><span className="wm-stat-lbl">Levels</span><span className="wm-stat-val">{stats.locations.levels}</span></div>
                      <div className="wm-stat"><span className="wm-stat-lbl">Bins</span><span className="wm-stat-val">{stats.locations.bins}</span></div>
                      {stats.capacity.maxWeightKg && <div className="wm-stat"><span className="wm-stat-lbl">Cap. Weight</span><span className="wm-stat-val" style={{ fontSize:13 }}>{Number(stats.capacity.maxWeightKg).toLocaleString()}kg</span></div>}
                      {stats.capacity.maxPallets  && <div className="wm-stat"><span className="wm-stat-lbl">Cap. Pallets</span><span className="wm-stat-val">{stats.capacity.maxPallets}</span></div>}
                    </div>
                  </>)}
                </>)}

                {tab === 'locations' && initial && (
                  <LocationTree key={statsKey} warehouseId={initial.id} onStatsChange={refreshStats} />
                )}
              </div>
              <div className="wm-ftr">
                <button type="button" className="wm-btn-cancel" onClick={onClose}>{tab === 'locations' ? 'Close' : 'Cancel'}</button>
                {tab !== 'locations' && <button type="submit" className="wm-btn-save" disabled={submitting}>{submitting ? 'Saving…' : initial ? 'Save Changes' : 'Create Warehouse'}</button>}
              </div>
            </form>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Delete Confirm ───────────────────────────────────────────────────────────

function DeleteConfirm({ warehouse, onCancel, onConfirm, busy }: { warehouse: Warehouse; onCancel: () => void; onConfirm: () => void; busy: boolean }) {
  return (
    <div style={{ position:'fixed', inset:0, zIndex:400, background:'rgba(0,0,0,0.65)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ background:'#0e0b1a', border:'0.5px solid rgba(239,68,68,0.25)', borderRadius:14, width:'100%', maxWidth:420, padding:'24px 24px 20px', boxShadow:'0 24px 60px rgba(0,0,0,0.7)' }}>
        <div style={{ fontSize:14, fontWeight:500, color:'#f1ede8', marginBottom:10 }}>Delete warehouse?</div>
        <div style={{ fontSize:13, color:'rgba(255,255,255,0.5)', marginBottom:20, lineHeight:1.5 }}><strong style={{ color:'#f1ede8' }}>{warehouse.name}</strong> ({warehouse.code}) will be soft-deleted. Existing stock and location records will be preserved.</div>
        <div style={{ display:'flex', justifyContent:'flex-end', gap:8 }}>
          <button onClick={onCancel} style={{ background:'rgba(255,255,255,0.05)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:7, padding:'8px 16px', fontSize:13, fontFamily:"'IBM Plex Sans',sans-serif", color:'rgba(255,255,255,0.5)', cursor:'pointer' }}>Cancel</button>
          <button onClick={onConfirm} disabled={busy} style={{ background:'rgba(239,68,68,0.15)', border:'0.5px solid rgba(239,68,68,0.35)', borderRadius:7, padding:'8px 16px', fontSize:13, fontWeight:500, fontFamily:"'IBM Plex Sans',sans-serif", color:'#f87171', cursor: busy ? 'not-allowed' : 'pointer', opacity: busy ? 0.5 : 1 }}>{busy ? 'Deleting…' : 'Delete'}</button>
        </div>
      </div>
    </div>
  );
}

// ─── Table Columns ────────────────────────────────────────────────────────────

function WH_COLUMNS(onEdit: (w: Warehouse) => void, onDelete: (w: Warehouse) => void): ERPColumn<Warehouse>[] {
  return [
    { key:'code', header:'Code', width:110, sortable:true, value:r=>r.code, render:r=><span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:12, color:'#fb923c' }}>{r.code}</span> },
    { key:'name', header:'Name', sortable:true, value:r=>r.name, render:r=><div><div style={{ color:'#e2dfd8', fontWeight:500 }}>{r.name}</div>{r.address && <div style={{ fontSize:11, color:'rgba(255,255,255,0.3)', marginTop:2 }}>{r.address}</div>}</div> },
    { key:'warehouseType', header:'Type', width:130, sortable:true, value:r=>r.warehouseType??'regular', render:r=><TypeBadge type={r.warehouseType} /> },
    { key:'zoneCount', header:'Zones', width:80, sortable:true, align:'center', value:r=>(r as any).zoneCount??0, render:r=>{ const c=(r as any).zoneCount??0; return c>0?<span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:12, color:'#60a5fa' }}>{c}</span>:<span style={{ color:'rgba(255,255,255,0.2)', fontSize:12 }}>—</span>; } },
    { key:'stockCount', header:'Stock Lines', width:100, sortable:true, align:'center', value:r=>(r as any).stockCount??0, render:r=>{ const c=(r as any).stockCount??0; return c>0?<span style={{ display:'inline-flex', alignItems:'center', padding:'2px 7px', borderRadius:20, fontSize:10, color:'#4ade80', background:'rgba(74,222,128,0.08)', border:'0.5px solid rgba(74,222,128,0.2)' }}>{c}</span>:<span style={{ color:'rgba(255,255,255,0.2)', fontSize:12 }}>—</span>; } },
    { key:'locationTrackingEnabled', header:'Locations', width:90, sortable:true, align:'center', value:r=>(r as any).locationTrackingEnabled?1:0, render:r=>(r as any).locationTrackingEnabled?<span style={{ display:'inline-flex', alignItems:'center', gap:4, fontSize:11, color:'#60a5fa' }}><span style={{ width:5, height:5, borderRadius:'50%', background:'#60a5fa' }} />On</span>:<span style={{ color:'rgba(255,255,255,0.2)', fontSize:11 }}>Off</span> },
    { key:'isActive', header:'Status', width:100, sortable:true, value:r=>r.isActive?1:0, render:r=><ActiveBadge active={r.isActive} /> },
    { key:'_actions', header:'', width:110, sortable:false, render:r=>(
      <div style={{ display:'flex', gap:6 }}>
        <button style={{ padding:'5px 10px', borderRadius:6, fontSize:11, fontFamily:"'IBM Plex Sans',sans-serif", cursor:'pointer', background:'rgba(255,255,255,0.05)', color:'rgba(255,255,255,0.55)', border:'0.5px solid rgba(255,255,255,0.1)', whiteSpace:'nowrap' }} onClick={e=>{ e.stopPropagation(); onEdit(r); }}>Edit</button>
        <button style={{ padding:'5px 10px', borderRadius:6, fontSize:11, fontFamily:"'IBM Plex Sans',sans-serif", cursor:'pointer', background:'rgba(239,68,68,0.08)', color:'#f87171', border:'0.5px solid rgba(239,68,68,0.2)', whiteSpace:'nowrap' }} onClick={e=>{ e.stopPropagation(); onDelete(r); }}>Delete</button>
      </div>
    ) },
  ];
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function WarehousesPage() {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [modalOpen,  setModalOpen]  = useState(false);
  const [editing,    setEditing]    = useState<Warehouse | null>(null);
  const [deleting,   setDeleting]   = useState<Warehouse | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try { setLoading(true); const data = await warehousesApi.getAll(); setWarehouses(data); }
    catch (err) { setError(err instanceof Error ? err.message : 'Failed to load warehouses.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const whFilters = useMemo<ERPFilter<Warehouse>[]>(() => [
    { key:'warehouseType', label:'Type', type:'select', placeholder:'All Types', options: WH_TYPES.map(t => ({ value:t.value, label:t.label })), filterFn:(row,val)=>row.warehouseType===val },
    { key:'locationTracking', label:'Locations', type:'boolean', placeholder:'Location Tracking On', filterFn:(row,val)=>val===true?!!(row as any).locationTrackingEnabled:true },
    { key:'isActive', label:'Active Only', type:'boolean', placeholder:'Active Only', filterFn:(row,val)=>val===true?row.isActive:true },
  ], []);

  const { values:filterVals, setValue:setFilterVal, reset:resetFilters, activeCount:filterCount } = useERPFilters(whFilters);

  const filtered = useMemo(() => {
    const base = applyERPFilters(warehouses, whFilters, filterVals);
    return typeFilter ? base.filter(w => w.warehouseType === typeFilter) : base;
  }, [warehouses, whFilters, filterVals, typeFilter]);

  const handleDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try { await warehousesApi.remove(deleting.id); setDeleting(null); fetchAll(); }
    catch (err: any) { setError(err?.response?.data?.message ?? 'Delete failed.'); setDeleting(null); }
    finally { setDeleteBusy(false); }
  };

  return (
    <ERPShell breadcrumbs={['Home', 'Inventory', 'Warehouses']} title="Warehouses">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap');
        .wh-page{padding:0 18px 12px;display:flex;flex-direction:column;height:100%;overflow:hidden}
        .wh-toolbar{display:flex;align-items:flex-start;gap:10px;margin-bottom:10px;flex-wrap:wrap}
        .wh-btn-new{display:flex;align-items:center;gap:6px;margin-left:auto;background:linear-gradient(135deg,#c2410c,#ea580c,#f97316);border:none;border-radius:7px;padding:7px 14px;font-size:12px;font-weight:500;font-family:'IBM Plex Sans',sans-serif;color:white;cursor:pointer;box-shadow:0 3px 12px rgba(234,88,12,0.3);transition:opacity 0.15s;flex-shrink:0}
        .wh-btn-new:hover{opacity:0.88}
        .wh-error{background:rgba(239,68,68,0.08);border:0.5px solid rgba(239,68,68,0.2);border-radius:8px;padding:10px 14px;margin-bottom:10px;font-size:13px;color:#fca5a5}
      `}</style>
      <div className="wh-page">
        <StatsBar warehouses={warehouses} activeType={typeFilter} onTypeClick={setTypeFilter} />
        <div className="wh-toolbar">
          <div style={{ flex:1 }}>
            <ERPFilterBar filters={whFilters} values={filterVals} onChange={setFilterVal} onReset={() => { resetFilters(); setTypeFilter(null); }} activeCount={filterCount + (typeFilter ? 1 : 0)} />
          </div>
          <button className="wh-btn-new" onClick={() => { setEditing(null); setModalOpen(true); }}>+ New Warehouse</button>
        </div>
        {error && <div className="wh-error">{error}</div>}
        <div style={{ flex:1, minHeight:0, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          <ERPTable<Warehouse> columns={WH_COLUMNS(w => { setEditing(w); setModalOpen(true); }, w => setDeleting(w))} data={filtered} rowKey={r=>r.id} loading={loading} exportFilename="warehouses" emptyMessage={filterCount||typeFilter?'No warehouses match your filters.':'No warehouses yet.'} defaultPageSize={25} maxHeight="100%" />
        </div>
      </div>
      <WarehouseModal open={modalOpen} onClose={() => setModalOpen(false)} onSaved={fetchAll} initial={editing} />
      {deleting && <DeleteConfirm warehouse={deleting} onCancel={() => setDeleting(null)} onConfirm={handleDelete} busy={deleteBusy} />}
    </ERPShell>
  );
}