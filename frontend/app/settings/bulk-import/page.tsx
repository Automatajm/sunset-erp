"use client";

import * as XLSX from 'xlsx';
import { useState, useRef, useCallback } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import apiClient from '@/lib/api/client';

type Entity = 'items' | 'customers' | 'suppliers' | 'warehouses' | 'warehouse-locations' | 'work-centers' | 'accounts' | 'sales-orders' | 'purchase-orders' | 'budget-lines' | 'fiscal-periods' | 'boms' | 'bom-routings' | 'users' | 'roles';
type Channel = 'file' | 'url' | 'api';
type Mode    = 'import' | 'export';

interface ImportError  { row: number; field: string; message: string }
interface ImportResult {
  entity: string; total: number; valid: number;
  inserted: number; updated: number; skipped: number;
  errors: ImportError[]; dryRun: boolean; upsert: boolean;
}

const ENTITIES: {
  value: Entity; label: string; color: string; group: string;
  requiredFields: string[]; optionalFields: string[];
  sampleRow: Record<string, string>;
  exportEndpoint: string;
}[] = [
  // ── Inventory ──────────────────────────────────────────────────────────────
  {
    value: 'items', label: 'Items', color: 'var(--accent-strong)', group: 'Inventory',
    requiredFields: ['code', 'name', 'itemType', 'baseUom'],
    optionalFields:  ['description', 'standardCost', 'leadTimeDays', 'safetyStock', 'reorderPoint', 'reorderQuantity', 'valuationMethod', 'isStockable', 'isPurchasable', 'isSaleable', 'isManufacturable'],
    sampleRow: { code:'ITM001', name:'Burger Patty 4oz', itemType:'raw_material', baseUom:'KG', description:'Fresh beef patty', standardCost:'2.50', leadTimeDays:'3', isStockable:'true', isPurchasable:'true', isSaleable:'false', isManufacturable:'false', valuationMethod:'average', safetyStock:'100', reorderPoint:'50', reorderQuantity:'500' },
    exportEndpoint: '/items',
  },
  {
    value: 'warehouses', label: 'Warehouses', color: 'var(--accent-violet)', group: 'Inventory',
    requiredFields: ['name'],
    optionalFields:  ['code', 'warehouseType', 'address', 'isActive', 'locationTrackingEnabled'],
    sampleRow: { code:'', name:'Almacen Principal', warehouseType:'regular', address:'Zona Industrial', isActive:'true', locationTrackingEnabled:'true' },
    exportEndpoint: '/warehouses',
  },
  {
    value: 'warehouse-locations', label: 'WH Locations', color: '#c084fc', group: 'Inventory',
    requiredFields: ['warehouseCode', 'level', 'code', 'name'],
    optionalFields:  ['parentCode', 'zoneType', 'description', 'maxWeightKg', 'maxVolumeLtr', 'maxPallets', 'binType', 'allowMixedItems', 'notes'],
    sampleRow: { warehouseCode:'WH-REG-001', level:'zone', code:'STOR', name:'Storage Area', parentCode:'', zoneType:'storage', description:'', maxWeightKg:'', maxVolumeLtr:'', maxPallets:'', binType:'', allowMixedItems:'true', notes:'' },
    exportEndpoint: '/warehouses',
  },
  // ── Procurement ────────────────────────────────────────────────────────────
  {
    value: 'suppliers', label: 'Suppliers', color: 'var(--success)', group: 'Procurement',
    requiredFields: ['code', 'name'],
    optionalFields:  ['legalName', 'taxId', 'phone', 'email', 'website', 'paymentTerms', 'currency', 'creditLimit', 'category', 'notes'],
    sampleRow: { code:'SUP001', name:'Best Foods Inc', legalName:'Best Foods LLC', taxId:'987-654-321', phone:'+1-555-0200', email:'sales@bestfoods.com', paymentTerms:'NET15', currency:'USD', creditLimit:'100000', category:'Food Supplier', notes:'Primary supplier' },
    exportEndpoint: '/suppliers',
  },
  {
    value: 'purchase-orders', label: 'Purchase Orders', color: '#818cf8', group: 'Procurement',
    requiredFields: ['supplierCode', 'poDate', 'itemCode', 'qty', 'unitPrice'],
    optionalFields:  ['currency', 'paymentTerms', 'expectedDate', 'uom', 'discount', 'notes'],
    sampleRow: { supplierCode:'SUP001', poDate:'2026-03-25', currency:'USD', paymentTerms:'NET30', expectedDate:'2026-04-01', itemCode:'RM-BEEF', qty:'1000', unitPrice:'3.50', uom:'KG', discount:'0', notes:'' },
    exportEndpoint: '/purchase-orders',
  },
  // ── Sales ──────────────────────────────────────────────────────────────────
  {
    value: 'customers', label: 'Customers', color: 'var(--accent-blue)', group: 'Sales',
    requiredFields: ['code', 'name'],
    optionalFields:  ['legalName', 'taxId', 'phone', 'email', 'website', 'creditLimit', 'paymentTerms', 'currency', 'notes'],
    sampleRow: { code:'CUST001', name:'Acme Restaurants', legalName:'Acme Corp LLC', taxId:'123-456-789', phone:'+1-555-0100', email:'orders@acme.com', website:'www.acme.com', creditLimit:'50000', paymentTerms:'NET30', currency:'USD', notes:'Key account' },
    exportEndpoint: '/customers',
  },
  {
    value: 'sales-orders', label: 'Sales Orders', color: '#34d399', group: 'Sales',
    requiredFields: ['customerCode', 'orderDate', 'itemCode', 'qty', 'unitPrice'],
    optionalFields:  ['currency', 'paymentTerms', 'promisedDate', 'uom', 'discount', 'notes'],
    sampleRow: { customerCode:'CUST001', orderDate:'2026-03-25', currency:'USD', paymentTerms:'NET30', promisedDate:'2026-04-15', itemCode:'FG-BURG', qty:'500', unitPrice:'8.50', uom:'PCS', discount:'0', notes:'Bulk order' },
    exportEndpoint: '/sales-orders',
  },
  // ── Manufacturing ──────────────────────────────────────────────────────────
  {
    value: 'work-centers', label: 'Work Centers', color: 'var(--warning)', group: 'Manufacturing',
    requiredFields: ['code', 'name', 'workCenterType'],
    optionalFields:  ['capacityPerHour', 'efficiencyPercent', 'costPerHour'],
    sampleRow: { code:'WC001', name:'Kitchen Assembly Line', workCenterType:'assembly', capacityPerHour:'500', efficiencyPercent:'95', costPerHour:'25' },
    exportEndpoint: '/work-centers',
  },
  {
    value: 'boms', label: 'BOMs', color: '#e879f9', group: 'Manufacturing',
    requiredFields: ['bomNumber', 'parentItemCode', 'componentCode', 'quantityPer'],
    optionalFields:  ['uom', 'scrapPercent', 'version', 'isActive'],
    sampleRow: { bomNumber:'BOM-PROD-001', parentItemCode:'FG-001', componentCode:'RM-001', quantityPer:'2.5', uom:'KG', scrapPercent:'2', version:'1', isActive:'true' },
    exportEndpoint: '/bom',
  },
  {
    value: 'bom-routings', label: 'BOM Routings', color: '#f0abfc', group: 'Manufacturing',
    requiredFields: ['bomNumber', 'stepNumber', 'workCenterCode'],
    optionalFields:  ['description', 'setupTime', 'runTimePerUnit', 'notes'],
    sampleRow: { bomNumber:'BOM-PROD-001', stepNumber:'10', workCenterCode:'WC-CUT', description:'Cutting operation', setupTime:'0.5', runTimePerUnit:'0.002', notes:'' },
    exportEndpoint: '/bom',
  },
  // ── Accounting ─────────────────────────────────────────────────────────────
  {
    value: 'accounts', label: 'Chart of Accounts', color: 'var(--danger)', group: 'Accounting',
    requiredFields: ['accountNumber', 'name', 'accountType'],
    optionalFields:  ['accountCategory', 'currency', 'isSystem', 'allowManualPosting', 'requireReconciliation'],
    sampleRow: { accountNumber:'1.1.01', name:'Cash and Equivalents', accountType:'asset', accountCategory:'Current Assets', currency:'USD', isSystem:'false', allowManualPosting:'true', requireReconciliation:'false' },
    exportEndpoint: '/chart-of-accounts',
  },
  {
    value: 'budget-lines', label: 'Budget Lines', color: '#fb7185', group: 'Accounting',
    requiredFields: ['budgetCode', 'accountNumber', 'fiscalPeriod', 'amount'],
    optionalFields:  ['notes'],
    sampleRow: { budgetCode:'BUDGET-2026', accountNumber:'4.1.01', fiscalPeriod:'2026-01', amount:'500000', notes:'Q1 Revenue target' },
    exportEndpoint: '/budgets',
  },
  {
    value: 'fiscal-periods', label: 'Fiscal Periods', color: '#38bdf8', group: 'Accounting',
    requiredFields: ['periodCode', 'periodName', 'startDate', 'endDate', 'fiscalYear'],
    optionalFields:  ['fiscalQuarter', 'status', 'isCurrent'],
    sampleRow: { periodCode:'2025-01', periodName:'January 2025', startDate:'2025-01-01', endDate:'2025-01-31', fiscalYear:'2025', fiscalQuarter:'Q1', status:'open', isCurrent:'false' },
    exportEndpoint: '/fiscal-periods',
  },
  // ── Admin ──────────────────────────────────────────────────────────────────
  {
    value: 'roles', label: 'Roles', color: 'var(--accent-violet)', group: 'Admin',
    requiredFields: ['code', 'name'],
    optionalFields:  ['description', 'permissionCodes'],
    sampleRow: { code:'WAREHOUSE_SUPERVISOR', name:'Warehouse Supervisor', description:'Manages stock counts', permissionCodes:'INVENTORY:VIEW,INVENTORY:COUNT,INVENTORY:APPROVE' },
    exportEndpoint: '/roles',
  },
  {
    value: 'users', label: 'Users', color: 'var(--accent-blue)', group: 'Admin',
    requiredFields: ['email', 'password', 'firstName', 'lastName'],
    optionalFields:  ['phone', 'roleCodes'],
    sampleRow: { email:'juan.rivera@company.com', password:'TempPass123!', firstName:'Juan', lastName:'Rivera', phone:'+1-809-555-0001', roleCodes:'WAREHOUSE_SUPERVISOR' },
    exportEndpoint: '/users',
  },
];

// Group entities by group
const ENTITY_GROUPS = ENTITIES.reduce((acc, e) => {
  if (!acc[e.group]) acc[e.group] = [];
  acc[e.group].push(e);
  return acc;
}, {} as Record<string, typeof ENTITIES>);

function parseCsv(text: string): Record<string, any>[] {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
    const obj: Record<string, any> = {};
    headers.forEach((h, i) => { obj[h] = vals[i] ?? ''; });
    return obj;
  });
}

function parseExcel(buffer: ArrayBuffer): Record<string, any>[] {
  const wb = XLSX.read(buffer, { type: 'array', cellDates: true });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '', raw: false });
  return data.map(row => {
    const clean: Record<string, any> = {};
    for (const [key, val] of Object.entries(row)) {
      const k = key.trim();
      if (val instanceof Date) {
        clean[k] = val.toISOString().slice(0, 10);
      } else if (typeof val === 'string') {
        const v = val.trim().replace(/[\u00a0\u200b\ufeff]/g, '');
        const n = Number(v);
        if (!isNaN(n) && n > 40000 && n < 55000 && v.length <= 6) {
          clean[k] = new Date((n - 25569) * 86400 * 1000).toISOString().slice(0, 10);
        } else { clean[k] = v; }
      } else { clean[k] = val; }
    }
    return clean;
  });
}

const MONO: React.CSSProperties = { fontFamily: "'IBM Plex Mono',monospace", fontSize: 12 };
const INPUT: React.CSSProperties = { background:'rgba(255,255,255,0.04)', border:'0.5px solid rgba(255,255,255,0.1)', borderRadius:7, padding:'9px 12px', fontSize:13, fontFamily:"'IBM Plex Sans',sans-serif", color:'var(--text-strong)', outline:'none', width:'100%' };
const LABEL: React.CSSProperties = { fontSize:11, fontWeight:500, letterSpacing:'0.08em', textTransform:'uppercase', color:'rgba(251,146,60,0.6)', fontFamily:"'IBM Plex Sans',sans-serif" };

// ─── Entity Selector (searchable dropdown) ────────────────────────────────────
function EntitySelector({ entity, onSelect }: { entity: Entity; onSelect: (e: Entity) => void }) {
  const [open,   setOpen]   = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const cfg = ENTITIES.find(e => e.value === entity)!;

  const filtered = search.trim()
    ? ENTITIES.filter(e => e.label.toLowerCase().includes(search.toLowerCase()) || e.group.toLowerCase().includes(search.toLowerCase()))
    : null;

  const groups = filtered
    ? filtered.reduce((acc, e) => { if (!acc[e.group]) acc[e.group]=[]; acc[e.group].push(e); return acc; }, {} as Record<string, typeof ENTITIES>)
    : ENTITY_GROUPS;

  return (
    <div ref={ref} style={{ position: 'relative', maxWidth: 400 }}>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: 'rgba(255,255,255,0.04)', border: `0.5px solid color-mix(in srgb, ${cfg.color} 31%, transparent)`, borderRadius: 8, padding: '9px 14px', cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif" }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
        <span style={{ fontSize: 13, fontWeight: 600, color: cfg.color, flex: 1, textAlign: 'left' }}>{cfg.label}</span>
        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginRight: 4 }}>{cfg.group}</span>
        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>{open ? '▲' : '▼'}</span>
      </button>

      {/* Dropdown */}
      {open && (
        <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, right: 0, zIndex: 200, background: 'var(--surface)', border: '0.5px solid rgba(255,255,255,0.12)', borderRadius: 10, overflow: 'hidden', boxShadow: '0 16px 48px rgba(0,0,0,0.7)', minWidth: 320 }}>
          {/* Search */}
          <div style={{ padding: '10px 12px', borderBottom: '0.5px solid rgba(255,255,255,0.07)' }}>
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search entities..."
              style={{ ...INPUT, padding: '7px 10px', fontSize: 12, border: '0.5px solid rgba(255,255,255,0.1)' }}
            />
          </div>
          {/* Groups */}
          <div style={{ maxHeight: 360, overflowY: 'auto' }}>
            {Object.entries(groups).map(([group, items]) => (
              <div key={group}>
                <div style={{ padding: '8px 14px 4px', fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.25)' }}>{group}</div>
                {items.map(e => (
                  <button
                    key={e.value}
                    onClick={() => { onSelect(e.value); setOpen(false); setSearch(''); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 14px', background: entity === e.value ? `color-mix(in srgb, ${e.color} 7%, transparent)` : 'transparent', border: 'none', cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif", textAlign: 'left' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: e.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: entity === e.value ? e.color : 'var(--text-primary)', fontWeight: entity === e.value ? 600 : 400, flex: 1 }}>{e.label}</span>
                    {entity === e.value && <span style={{ fontSize: 10, color: e.color }}>✓</span>}
                  </button>
                ))}
              </div>
            ))}
            {Object.keys(groups).length === 0 && (
              <div style={{ padding: '20px 14px', fontSize: 12, color: 'rgba(255,255,255,0.3)', textAlign: 'center' }}>No entities found</div>
            )}
          </div>
        </div>
      )}

      {/* Backdrop */}
      {open && <div style={{ position: 'fixed', inset: 0, zIndex: 199 }} onClick={() => { setOpen(false); setSearch(''); }} />}
    </div>
  );
}

// ─── Dry Run Result Modal ─────────────────────────────────────────────────────
function DryRunModal({
  result, entityCfg, onClose, onRunLive, liveRunning,
}: {
  result: ImportResult; entityCfg: typeof ENTITIES[0];
  onClose: () => void; onRunLive: () => void; liveRunning: boolean;
}) {
  const hasErrors   = result.errors.length > 0;
  const wouldInsert = result.valid - result.skipped;

  return (
    <>
      <style>{`
        .drm-overlay{position:fixed;inset:0;z-index:500;background:rgba(0,0,0,0.7);backdrop-filter:blur(4px);display:flex;align-items:center;justify-content:center;padding:24px}
        .drm-box{background:var(--surface);border:0.5px solid rgba(251,146,60,0.25);border-radius:14px;width:100%;max-width:680px;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 24px 60px rgba(0,0,0,0.7);position:relative}
        .drm-box::before{content:'';position:absolute;top:0;left:30px;right:30px;height:1px;background:linear-gradient(90deg,transparent,rgba(251,146,60,0.4),transparent);pointer-events:none}
        .drm-hdr{display:flex;align-items:center;justify-content:space-between;padding:16px 20px 12px;flex-shrink:0;border-bottom:0.5px solid rgba(255,255,255,0.06)}
        .drm-scroll{flex:1;overflow-y:auto;padding:16px 20px;min-height:0}
        .drm-ftr{display:flex;align-items:center;justify-content:space-between;padding:12px 20px 18px;border-top:0.5px solid rgba(255,255,255,0.06);flex-shrink:0;gap:10px}
        .drm-stats{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:16px}
        .drm-stat{background:rgba(255,255,255,0.03);border:0.5px solid rgba(255,255,255,0.06);border-radius:8px;padding:8px 12px}
        .drm-err-table{width:100%;border-collapse:collapse;font-size:12px}
        .drm-err-table th{padding:5px 10px;font-size:10px;font-weight:500;text-transform:uppercase;letter-spacing:0.08em;text-align:left;border-bottom:0.5px solid rgba(255,255,255,0.06);color:rgba(248,113,113,0.6)}
        .drm-err-table td{padding:6px 10px;border-bottom:0.5px solid rgba(255,255,255,0.04)}
        .drm-err-table tr:last-child td{border-bottom:none}
      `}</style>
      <div className="drm-overlay">
        <div className="drm-box">
          <div className="drm-hdr">
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ fontSize:14, fontWeight:500, color:'var(--text-strong)' }}>
                Dry Run Result — <span style={{ color:entityCfg.color }}>{entityCfg.label}</span>
              </span>
              {hasErrors
                ? <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, background:'rgba(248,113,113,0.1)', color:'var(--danger)', border:'0.5px solid rgba(248,113,113,0.25)' }}>{result.errors.length} error{result.errors.length !== 1 ? 's' : ''}</span>
                : <span style={{ fontSize:11, padding:'2px 8px', borderRadius:20, background:'rgba(74,222,128,0.1)', color:'var(--success)', border:'0.5px solid rgba(74,222,128,0.25)' }}>All valid</span>
              }
            </div>
            <button onClick={onClose} style={{ width:24, height:24, borderRadius:6, background:'rgba(255,255,255,0.06)', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.45)', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>x</button>
          </div>
          <div className="drm-scroll">
            <div className="drm-stats">
              {[
                { label:'Total',        value:result.total,             color:'var(--text-primary)' },
                { label:'Valid',        value:result.valid,             color:'var(--success)' },
                { label:'Would Insert', value:wouldInsert,              color:'var(--success)' },
                { label:'Would Update', value:result.upsert ? result.skipped : 0, color:'var(--accent-violet)' },
                { label:'Errors',       value:result.errors.length,     color:result.errors.length > 0 ? 'var(--danger)' : 'var(--success)' },
              ].map(s => (
                <div key={s.label} className="drm-stat">
                  <div style={{ fontSize:9, color:'rgba(255,255,255,0.3)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>{s.label}</div>
                  <div style={{ ...MONO, fontSize:22, fontWeight:500, color:s.color }}>{s.value}</div>
                </div>
              ))}
            </div>
            {!hasErrors && (
              <div style={{ background:'rgba(74,222,128,0.06)', border:'0.5px solid rgba(74,222,128,0.2)', borderRadius:8, padding:'12px 14px', fontSize:13, color:'var(--success)', marginBottom:12 }}>
                All {result.valid} records passed validation. Click Run Live Import to apply changes.
              </div>
            )}
            {hasErrors && (
              <>
                <div style={{ fontSize:10, color:'rgba(248,113,113,0.6)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>
                  {result.errors.length} validation error{result.errors.length !== 1 ? 's' : ''} — fix before running Live Import
                </div>
                <div style={{ border:'0.5px solid rgba(255,255,255,0.06)', borderRadius:8, overflow:'hidden' }}>
                  <table className="drm-err-table">
                    <thead><tr><th>Row</th><th>Field</th><th>Message</th></tr></thead>
                    <tbody>
                      {result.errors.map((e, i) => (
                        <tr key={i}>
                          <td style={{ ...MONO, color:'var(--danger)', width:60 }}>{e.row}</td>
                          <td style={{ ...MONO, color:'var(--warning)', width:140 }}>{e.field}</td>
                          <td style={{ color:'rgba(255,255,255,0.6)', fontSize:12 }}>{e.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>
          <div className="drm-ftr">
            <span style={{ fontSize:11, color:'rgba(255,255,255,0.3)' }}>
              {hasErrors ? 'Fix errors in your file, re-upload and validate again.' : `Ready to insert ${wouldInsert} record${wouldInsert !== 1 ? 's' : ''}.`}
            </span>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={onClose} style={{ padding:'8px 18px', borderRadius:7, fontSize:13, fontFamily:"'IBM Plex Sans',sans-serif", color:'rgba(255,255,255,0.5)', background:'rgba(255,255,255,0.05)', border:'0.5px solid rgba(255,255,255,0.1)', cursor:'pointer' }}>Cancel</button>
              <button onClick={onRunLive} disabled={hasErrors || liveRunning}
                style={{ padding:'8px 22px', borderRadius:7, fontSize:13, fontWeight:500, fontFamily:"'IBM Plex Sans',sans-serif", color:'white', background:hasErrors?'rgba(255,255,255,0.08)':'linear-gradient(135deg,#14532d,#16a34a,#22c55e)', border:'none', cursor:hasErrors?'not-allowed':'pointer', opacity:hasErrors||liveRunning?0.5:1, whiteSpace:'nowrap', boxShadow:hasErrors?'none':'0 3px 12px rgba(22,163,74,0.3)' }}>
                {liveRunning ? 'Importing...' : `Run Live Import (${wouldInsert})`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Live Result Modal ────────────────────────────────────────────────────────
function LiveResultModal({ result, entityCfg, onClose }: { result: ImportResult; entityCfg: typeof ENTITIES[0]; onClose: () => void }) {
  return (
    <div style={{ position:'fixed', inset:0, zIndex:500, background:'rgba(0,0,0,0.7)', backdropFilter:'blur(4px)', display:'flex', alignItems:'center', justifyContent:'center', padding:24 }}>
      <div style={{ background:'var(--surface)', border:'0.5px solid rgba(74,222,128,0.25)', borderRadius:14, width:'100%', maxWidth:480, padding:'24px 24px 20px', boxShadow:'0 24px 60px rgba(0,0,0,0.7)', position:'relative' }}>
        <div style={{ position:'absolute', top:0, left:30, right:30, height:1, background:'linear-gradient(90deg,transparent,rgba(74,222,128,0.4),transparent)' }} />
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <span style={{ fontSize:14, fontWeight:500, color:'var(--text-strong)' }}>Import Complete — <span style={{ color:entityCfg.color }}>{entityCfg.label}</span></span>
          <button onClick={onClose} style={{ width:24, height:24, borderRadius:6, background:'rgba(255,255,255,0.06)', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.45)', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>x</button>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginBottom:16 }}>
          {[
            { label:'Inserted', value:result.inserted, color:'var(--success)' },
            { label:'Updated',  value:result.updated,  color:'var(--accent-violet)' },
            { label:'Skipped',  value:result.skipped,  color:'var(--warning)' },
          ].map(s => (
            <div key={s.label} style={{ background:'rgba(255,255,255,0.03)', border:'0.5px solid rgba(255,255,255,0.06)', borderRadius:8, padding:'10px 14px' }}>
              <div style={{ fontSize:9, color:'rgba(255,255,255,0.3)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>{s.label}</div>
              <div style={{ ...MONO, fontSize:26, fontWeight:500, color:s.color }}>{s.value}</div>
            </div>
          ))}
        </div>
        <div style={{ background:'rgba(74,222,128,0.06)', border:'0.5px solid rgba(74,222,128,0.2)', borderRadius:8, padding:'10px 14px', fontSize:12, color:'var(--success)', marginBottom:16 }}>
          {result.inserted} record{result.inserted !== 1 ? 's' : ''} inserted successfully.{result.skipped > 0 ? ` ${result.skipped} duplicates skipped.` : ''}
        </div>
        <div style={{ display:'flex', justifyContent:'flex-end' }}>
          <button onClick={onClose} style={{ padding:'8px 22px', borderRadius:7, fontSize:13, fontWeight:500, fontFamily:"'IBM Plex Sans',sans-serif", color:'white', background:'linear-gradient(135deg,#14532d,#16a34a,#22c55e)', border:'none', cursor:'pointer', boxShadow:'0 3px 12px rgba(22,163,74,0.3)' }}>Done</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function BulkImportPage() {
  const [mode,        setMode]        = useState<Mode>('import');
  const [entity,      setEntity]      = useState<Entity>('items');
  const [channel,     setChannel]     = useState<Channel>('file');
  const [dryRun,      setDryRun]      = useState(true);
  const [upsert,      setUpsert]      = useState(false);
  const [records,     setRecords]     = useState<Record<string, any>[]>([]);
  const [sourceUrl,   setSourceUrl]   = useState('');
  const [sourceToken, setSourceToken] = useState('');
  const [fileName,    setFileName]    = useState('');
  const [busy,        setBusy]        = useState(false);
  const [liveRunning, setLiveRunning] = useState(false);
  const [exportBusy,  setExportBusy]  = useState(false);
  const [dryResult,   setDryResult]   = useState<ImportResult | null>(null);
  const [liveResult,  setLiveResult]  = useState<ImportResult | null>(null);
  const [parseError,  setParseError]  = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const entityCfg = ENTITIES.find(e => e.value === entity)!;

  const handleEntitySelect = (e: Entity) => {
    setEntity(e); setDryResult(null); setLiveResult(null);
    setRecords([]); setFileName(''); setParseError('');
  };

  const downloadTemplate = useCallback(() => {
    const allFields = [...entityCfg.requiredFields, ...entityCfg.optionalFields];
    const ws = XLSX.utils.json_to_sheet([entityCfg.sampleRow], { header: allFields });
    ws['!cols'] = allFields.map(() => ({ wch: 22 }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, entityCfg.label);
    XLSX.writeFile(wb, `sunset-template-${entity}.xlsx`);
  }, [entity, entityCfg]);

  const handleExport = useCallback(async () => {
    setExportBusy(true); setParseError('');
    try {
      const res  = await apiClient.get(entityCfg.exportEndpoint);
      const data: Record<string, any>[] = Array.isArray(res.data) ? res.data : (res.data?.users ?? res.data?.roles ?? res.data?.accounts ?? res.data?.workCenters ?? res.data?.boms ?? res.data?.customers ?? []);
      if (data.length === 0) { setParseError(`No ${entityCfg.label} records found.`); return; }
      const allFields = [...entityCfg.requiredFields, ...entityCfg.optionalFields];
      const rows = data.map(record => {
        const row: Record<string, any> = {};
        allFields.forEach(f => { row[f] = record[f] !== undefined && record[f] !== null ? record[f] : ''; });
        return row;
      });
      const ws = XLSX.utils.json_to_sheet(rows, { header: allFields });
      ws['!cols'] = allFields.map(() => ({ wch: 22 }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, entityCfg.label);
      XLSX.writeFile(wb, `sunset-export-${entity}-${new Date().toISOString().slice(0,10)}.xlsx`);
    } catch (err: any) {
      setParseError(err.response?.data?.message || 'Export failed.');
    } finally { setExportBusy(false); }
  }, [entity, entityCfg]);

  const handleFile = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name); setParseError(''); setDryResult(null); setLiveResult(null); setRecords([]);
    const isExcel = file.name.endsWith('.xlsx') || file.name.endsWith('.xls');
    const reader  = new FileReader();
    const onParsed = (parsed: Record<string, any>[]) => {
      if (parsed.length === 0)  { setParseError('No data rows found in file.'); return; }
      if (parsed.length > 2000) { setParseError('Maximum 2,000 rows per import.'); return; }
      setRecords(parsed);
    };
    if (isExcel) {
      reader.onload = ev => { try { onParsed(parseExcel(ev.target?.result as ArrayBuffer)); } catch { setParseError('Failed to parse Excel file.'); } };
      reader.readAsArrayBuffer(file);
    } else {
      reader.onload = ev => { try { onParsed(parseCsv(ev.target?.result as string)); } catch { setParseError('Failed to parse CSV file.'); } };
      reader.readAsText(file);
    }
  }, []);

  const buildBody = (overrideDryRun?: boolean) => {
    const body: any = { dryRun: overrideDryRun ?? dryRun, upsert };
    if (channel === 'file') { body.records = records; }
    else if (channel === 'url') { body.sourceUrl = sourceUrl; if (sourceToken) body.sourceToken = sourceToken; }
    else { if (records.length > 0) body.records = records; if (sourceUrl.trim()) body.sourceUrl = sourceUrl; if (sourceToken.trim()) body.sourceToken = sourceToken; }
    return body;
  };

  const handleValidate = async () => {
    if (channel === 'file' && records.length === 0) { setParseError('No records loaded. Upload a file first.'); return; }
    if (channel === 'url' && !sourceUrl.trim()) { setParseError('Source URL is required.'); return; }
    setBusy(true); setParseError(''); setDryResult(null); setLiveResult(null);
    try {
      const res = await apiClient.post(`/bulk-import/${entity}`, buildBody(true));
      setDryResult(res.data);
    } catch (err: any) {
      setParseError(err.response?.data?.message || 'Validation failed.');
    } finally { setBusy(false); }
  };

  const handleRunLive = async () => {
    setLiveRunning(true);
    try {
      const res = await apiClient.post(`/bulk-import/${entity}`, buildBody(false));
      setDryResult(null); setLiveResult(res.data);
    } catch (err: any) {
      setParseError(err.response?.data?.message || 'Import failed.');
      setDryResult(null);
    } finally { setLiveRunning(false); }
  };

  const handleDirectLive = async () => {
    if (channel === 'file' && records.length === 0) { setParseError('No records loaded. Upload a file first.'); return; }
    if (channel === 'url' && !sourceUrl.trim()) { setParseError('Source URL is required.'); return; }
    setBusy(true); setParseError(''); setDryResult(null); setLiveResult(null);
    try {
      const res = await apiClient.post(`/bulk-import/${entity}`, buildBody(false));
      setLiveResult(res.data);
    } catch (err: any) {
      setParseError(err.response?.data?.message || 'Import failed.');
    } finally { setBusy(false); }
  };

  const canRun =
    channel === 'file' ? records.length > 0 :
    channel === 'url'  ? sourceUrl.trim() !== '' :
    records.length > 0 || sourceUrl.trim() !== '';

  const fileTypeLabel = fileName
    ? (fileName.endsWith('.xlsx') || fileName.endsWith('.xls') ? 'Excel' : 'CSV')
    : '';

  return (
    <ERPShell breadcrumbs={['Home', 'Settings', 'Bulk Import & Export']} title="Bulk Import & Export">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400&display=swap');
        .bi-page { padding: 0 18px 32px; display:flex; flex-direction:column; gap:16px; }
        .bi-card { background:rgba(10,7,18,0.7); border:0.5px solid rgba(251,146,60,0.12); border-radius:10px; padding:16px 18px; }
        .bi-section-title { font-size:10px; font-weight:500; letter-spacing:0.12em; text-transform:uppercase; color:rgba(251,146,60,0.55); margin-bottom:12px; }
        .bi-mode-tabs { display:flex; gap:0; background:rgba(255,255,255,0.04); border-radius:8px; border:0.5px solid rgba(255,255,255,0.08); overflow:hidden; width:fit-content; margin-bottom:16px; }
        .bi-mode-tab { padding:8px 20px; font-size:12px; font-weight:500; font-family:'IBM Plex Sans',sans-serif; cursor:pointer; border:none; transition:all 0.15s; }
        .bi-channel-tabs { display:flex; gap:0; background:rgba(255,255,255,0.04); border-radius:7px; border:0.5px solid rgba(255,255,255,0.08); overflow:hidden; margin-bottom:14px; width:fit-content; }
        .bi-channel-tab { padding:7px 16px; font-size:12px; font-family:'IBM Plex Sans',sans-serif; cursor:pointer; border:none; transition:all 0.15s; white-space:nowrap; }
        .bi-drop { border:1.5px dashed rgba(255,255,255,0.12); border-radius:8px; padding:28px; text-align:center; cursor:pointer; transition:all 0.15s; }
        .bi-drop:hover { border-color:rgba(251,146,60,0.3); background:rgba(251,146,60,0.02); }
        .bi-preview { background:rgba(255,255,255,0.02); border:0.5px solid rgba(255,255,255,0.07); border-radius:7px; padding:10px 14px; }
        .bi-format-badge { display:inline-flex; align-items:center; gap:5px; padding:2px 8px; border-radius:4px; font-size:10px; font-weight:500; text-transform:uppercase; letter-spacing:0.08em; }
        .bi-export-card { display:flex; flex-direction:column; gap:14px; }
        .bi-export-action { display:flex; align-items:center; justify-content:space-between; padding:14px 16px; background:rgba(255,255,255,0.03); border:0.5px solid rgba(255,255,255,0.08); border-radius:8px; gap:16px; flex-wrap:wrap; }
        .bi-opts { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:12px; }
        .bi-opt-btn { padding:6px 14px; border-radius:7px; font-size:12px; cursor:pointer; font-family:'IBM Plex Sans',sans-serif; font-weight:500; transition:all 0.15s; }
      `}</style>

      {dryResult  && <DryRunModal   result={dryResult}  entityCfg={entityCfg} onClose={() => setDryResult(null)}  onRunLive={handleRunLive} liveRunning={liveRunning} />}
      {liveResult && <LiveResultModal result={liveResult} entityCfg={entityCfg} onClose={() => { setLiveResult(null); setRecords([]); setFileName(''); }} />}

      <div className="bi-page">

        <div className="bi-mode-tabs">
          {([{ value:'import' as Mode, label:'Import' }, { value:'export' as Mode, label:'Export & Templates' }]).map(m => (
            <button key={m.value} className="bi-mode-tab"
              onClick={() => { setMode(m.value); setDryResult(null); setLiveResult(null); setParseError(''); }}
              style={{ background: mode === m.value ? 'rgba(251,146,60,0.12)' : 'transparent', color: mode === m.value ? 'var(--accent-strong)' : 'rgba(255,255,255,0.4)' }}>
              {m.label}
            </button>
          ))}
        </div>

        {/* ── Entity selector card ── */}
        <div className="bi-card">
          <div className="bi-section-title">{mode === 'import' ? '1. Select Entity' : 'Select Entity'}</div>

          <EntitySelector entity={entity} onSelect={handleEntitySelect} />

          {/* Fields info */}
          <div style={{ marginTop: 14, display:'flex', gap:16, flexWrap:'wrap' }}>
            <div>
              <div style={{ fontSize:10, color:'rgba(255,255,255,0.3)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:5 }}>Required fields</div>
              <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                {entityCfg.requiredFields.map(f => (
                  <span key={f} style={{ ...MONO, fontSize:11, padding:'2px 7px', borderRadius:4, background:`color-mix(in srgb, ${entityCfg.color} 8%, transparent)`, color:entityCfg.color, border:`0.5px solid color-mix(in srgb, ${entityCfg.color} 19%, transparent)` }}>{f}</span>
                ))}
              </div>
            </div>
            {entityCfg.optionalFields.length > 0 && (
              <div>
                <div style={{ fontSize:10, color:'rgba(255,255,255,0.3)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:5 }}>Optional fields</div>
                <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                  {entityCfg.optionalFields.map(f => (
                    <span key={f} style={{ ...MONO, fontSize:11, padding:'2px 7px', borderRadius:4, background:'rgba(255,255,255,0.04)', color:'rgba(255,255,255,0.4)', border:'0.5px solid rgba(255,255,255,0.08)' }}>{f}</span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── IMPORT MODE ── */}
        {mode === 'import' && (
          <>
            <div className="bi-card">
              <div className="bi-section-title">2. Data Source</div>
              <div className="bi-channel-tabs">
                {([{ value:'file' as Channel, label:'Upload File' }, { value:'url' as Channel, label:'Fetch from URL' }, { value:'api' as Channel, label:'API Reference' }]).map(c => (
                  <button key={c.value} className="bi-channel-tab"
                    onClick={() => { setChannel(c.value); setDryResult(null); setLiveResult(null); setParseError(''); }}
                    style={{ background: channel === c.value ? 'rgba(251,146,60,0.12)' : 'transparent', color: channel === c.value ? 'var(--accent-strong)' : 'rgba(255,255,255,0.4)' }}>
                    {c.label}
                  </button>
                ))}
              </div>

              {channel === 'file' && (
                <>
                  <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                    <div style={{ display:'flex', gap:6 }}>
                      {[{ label:'CSV', color:'var(--success)' }, { label:'Excel .xlsx', color:'var(--accent-blue)' }, { label:'Excel .xls', color:'var(--accent-blue)' }].map(f => (
                        <span key={f.label} className="bi-format-badge" style={{ background:`color-mix(in srgb, ${f.color} 8%, transparent)`, color:f.color, border:`0.5px solid color-mix(in srgb, ${f.color} 19%, transparent)` }}>{f.label}</span>
                      ))}
                    </div>
                    <button onClick={downloadTemplate} style={{ padding:'5px 12px', borderRadius:6, fontSize:11, cursor:'pointer', fontFamily:"'IBM Plex Sans',sans-serif", fontWeight:500, color:'var(--accent-blue)', background:'rgba(96,165,250,0.1)', border:'0.5px solid rgba(96,165,250,0.2)' }}>Download Template</button>
                  </div>
                  <div className="bi-drop" onClick={() => fileRef.current?.click()}>
                    <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display:'none' }} onChange={handleFile} onClick={e => { (e.target as HTMLInputElement).value = ''; }} />
                    {fileName ? (
                      <div>
                        <div style={{ display:'flex', alignItems:'center', gap:8, justifyContent:'center', marginBottom:4 }}>
                          <span style={{ fontSize:13, color:'var(--success)', fontWeight:500 }}>{fileName}</span>
                          {fileTypeLabel && <span className="bi-format-badge" style={{ background:fileTypeLabel==='Excel'?'rgba(96,165,250,0.15)':'rgba(74,222,128,0.15)', color:fileTypeLabel==='Excel'?'var(--accent-blue)':'var(--success)', border:`0.5px solid ${fileTypeLabel==='Excel'?'rgba(96,165,250,0.3)':'rgba(74,222,128,0.3)'}` }}>{fileTypeLabel}</span>}
                        </div>
                        <div style={{ fontSize:11, color:'rgba(255,255,255,0.3)' }}>{records.length} rows loaded — click to replace</div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ fontSize:13, color:'rgba(255,255,255,0.5)', marginBottom:6 }}>Click to upload CSV or Excel file</div>
                        <div style={{ fontSize:11, color:'rgba(255,255,255,0.25)' }}>Accepts .csv, .xlsx, .xls — max 2,000 rows</div>
                      </div>
                    )}
                  </div>
                  {records.length > 0 && (
                    <div style={{ marginTop:14 }}>
                      <div style={{ fontSize:10, color:'rgba(255,255,255,0.3)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:6 }}>Preview — first {Math.min(5, records.length)} of {records.length} rows</div>
                      <div style={{ overflowX:'auto' }}>
                        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                          <thead><tr>{Object.keys(records[0]).map(h => <th key={h} style={{ padding:'4px 10px', fontSize:10, color:entityCfg.color, fontWeight:500, textTransform:'uppercase', letterSpacing:'0.08em', textAlign:'left', borderBottom:'0.5px solid rgba(255,255,255,0.06)', whiteSpace:'nowrap' }}>{h}</th>)}</tr></thead>
                          <tbody>{records.slice(0,5).map((row,i) => <tr key={i}>{Object.values(row).map((val,j) => <td key={j} style={{ padding:'5px 10px', borderBottom:'0.5px solid rgba(255,255,255,0.04)', ...MONO, color:'rgba(255,255,255,0.6)', whiteSpace:'nowrap' }}>{String(val)}</td>)}</tr>)}</tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}

              {channel === 'url' && (
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  <div style={{ display:'flex', flexDirection:'column', gap:5 }}><label style={LABEL}>Source URL *</label><input style={INPUT} placeholder="https://my-old-system.com/api/export/items" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} /></div>
                  <div style={{ display:'flex', flexDirection:'column', gap:5 }}><label style={LABEL}>Auth Token (optional)</label><input style={INPUT} placeholder="Bearer eyJ... or plain token" value={sourceToken} onChange={e => setSourceToken(e.target.value)} /></div>
                  <div style={{ background:'rgba(255,255,255,0.03)', border:'0.5px solid rgba(255,255,255,0.06)', borderRadius:7, padding:'8px 12px', fontSize:11, color:'rgba(255,255,255,0.35)', lineHeight:1.7 }}>The URL must return a JSON array in Sunset ERP format.</div>
                </div>
              )}

              {channel === 'api' && (
                <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                  <div style={{ background:'rgba(255,255,255,0.03)', border:'0.5px solid rgba(255,255,255,0.06)', borderRadius:7, padding:'12px 16px' }}>
                    <div style={{ fontSize:10, color:'rgba(255,255,255,0.3)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>Endpoint</div>
                    <div style={{ ...MONO, fontSize:13, color:'var(--success)', marginBottom:12 }}>POST /api/bulk-import/{entity}</div>
                    <div className="bi-preview"><pre style={{ ...MONO, fontSize:11, color:'rgba(255,255,255,0.5)', lineHeight:1.7 }}>{`{\n  "dryRun": true,\n  "upsert": false,\n  "records": [\n    { ${entityCfg.requiredFields.map(f => `"${f}": "..."`).join(', ')} }\n  ]\n}`}</pre></div>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:5 }}><label style={LABEL}>Pull from URL (test here)</label><input style={INPUT} placeholder="https://my-old-system.com/api/export/items" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} /></div>
                  {sourceUrl && <div style={{ display:'flex', flexDirection:'column', gap:5 }}><label style={LABEL}>Auth Token (optional)</label><input style={INPUT} placeholder="Bearer eyJ..." value={sourceToken} onChange={e => setSourceToken(e.target.value)} /></div>}
                </div>
              )}
            </div>

            {/* Options + Run */}
            <div className="bi-card">
              <div className="bi-section-title">3. Options</div>
              <div className="bi-opts">
                <button className="bi-opt-btn" onClick={() => setDryRun(v => !v)}
                  style={{ color:dryRun?'var(--warning)':'var(--success)', background:dryRun?'rgba(251,191,36,0.1)':'rgba(74,222,128,0.1)', border:`0.5px solid ${dryRun?'rgba(251,191,36,0.25)':'rgba(74,222,128,0.25)'}` }}>
                  {dryRun ? 'Dry Run — validate only' : 'Live Run — apply changes'}
                </button>
                <button className="bi-opt-btn" onClick={() => setUpsert(v => !v)}
                  style={{ color:upsert?'var(--accent-violet)':'rgba(255,255,255,0.4)', background:upsert?'rgba(167,139,250,0.1)':'rgba(255,255,255,0.04)', border:`0.5px solid ${upsert?'rgba(167,139,250,0.25)':'rgba(255,255,255,0.08)'}` }}>
                  {upsert ? 'Upsert — update if exists' : 'Skip — ignore duplicates'}
                </button>
                <span style={{ fontSize:11, color:'rgba(255,255,255,0.3)', flex:1 }}>
                  {dryRun ? 'Validates data, shows result modal, you decide to run or cancel.' : upsert ? 'New records inserted. Existing records updated.' : 'New records inserted. Duplicates skipped.'}
                </span>
                <button
                  onClick={dryRun ? handleValidate : handleDirectLive}
                  disabled={busy || !canRun}
                  style={{ padding:'7px 22px', borderRadius:7, fontSize:13, fontWeight:500, cursor:canRun&&!busy?'pointer':'not-allowed', fontFamily:"'IBM Plex Sans',sans-serif", color:'white', background:dryRun?'linear-gradient(135deg,#92400e,#d97706,var(--warning))':upsert?'linear-gradient(135deg,#4c1d95,#6d28d9,#7c3aed)':'linear-gradient(135deg,#14532d,#16a34a,#22c55e)', border:'none', opacity:busy||!canRun?0.5:1, whiteSpace:'nowrap', boxShadow:busy||!canRun?'none':'0 3px 12px rgba(0,0,0,0.3)' }}>
                  {busy ? 'Running...' : dryRun ? 'Validate' : upsert ? `Upsert ${entityCfg.label}` : `Import ${entityCfg.label}`}
                </button>
              </div>
              {parseError && <div style={{ background:'rgba(239,68,68,0.08)', border:'0.5px solid rgba(239,68,68,0.2)', borderRadius:7, padding:'8px 12px', fontSize:12, color:'var(--danger-subtle)' }}>{parseError}</div>}
            </div>
          </>
        )}

        {/* ── EXPORT MODE ── */}
        {mode === 'export' && (
          <div className="bi-card">
            <div className="bi-section-title">Download Options</div>
            <div className="bi-export-card">
              <div className="bi-export-action">
                <div>
                  <div style={{ fontSize:13, fontWeight:500, color:'var(--text-primary)', marginBottom:4 }}>Import Template — {entityCfg.label}</div>
                  <div style={{ fontSize:12, color:'rgba(255,255,255,0.4)', lineHeight:1.6 }}>Empty Excel with all columns. Required: <span style={{ color:entityCfg.color }}>{entityCfg.requiredFields.join(', ')}</span></div>
                </div>
                <button onClick={downloadTemplate} style={{ padding:'8px 18px', borderRadius:7, fontSize:12, fontWeight:500, cursor:'pointer', fontFamily:"'IBM Plex Sans',sans-serif", color:'var(--accent-blue)', background:'rgba(96,165,250,0.1)', border:'0.5px solid rgba(96,165,250,0.2)', whiteSpace:'nowrap' }}>Download Template</button>
              </div>
              <div className="bi-export-action">
                <div>
                  <div style={{ fontSize:13, fontWeight:500, color:'var(--text-primary)', marginBottom:4 }}>Export Current Data — {entityCfg.label}</div>
                  <div style={{ fontSize:12, color:'rgba(255,255,255,0.4)', lineHeight:1.6 }}>Download all existing {entityCfg.label.toLowerCase()} records as Excel.</div>
                </div>
                <button onClick={handleExport} disabled={exportBusy} style={{ padding:'8px 18px', borderRadius:7, fontSize:12, fontWeight:500, cursor:exportBusy?'not-allowed':'pointer', fontFamily:"'IBM Plex Sans',sans-serif", color:'white', background:'linear-gradient(135deg,#1e3a5f,#1d4ed8,#3b82f6)', border:'none', whiteSpace:'nowrap', opacity:exportBusy?0.5:1 }}>
                  {exportBusy ? 'Exporting...' : 'Export to Excel'}
                </button>
              </div>
              {parseError && <div style={{ background:'rgba(239,68,68,0.08)', border:'0.5px solid rgba(239,68,68,0.2)', borderRadius:7, padding:'8px 12px', fontSize:12, color:'var(--danger-subtle)' }}>{parseError}</div>}
              <div style={{ background:'rgba(255,255,255,0.02)', border:'0.5px solid rgba(255,255,255,0.06)', borderRadius:7, padding:'10px 14px', fontSize:11, color:'rgba(255,255,255,0.35)', lineHeight:1.7 }}>Export → edit → re-import with Upsert for mass updates.</div>
            </div>
          </div>
        )}
      </div>
    </ERPShell>
  );
}