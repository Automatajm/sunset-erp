// ============================================================================
// FILE: frontend/app/procurement/goods-receipts/page.tsx
// ============================================================================
"use client";

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import { ERPTable, ERPColumn } from '@/components/ui/ERPTable';
import {
  ERPFilterBar, ERPFilter, useERPFilters, applyERPFilters, dateInSelection,
} from '@/components/ui/ERPFilterBar';
import { goodsReceiptsApi, GoodsReceipt, GrnStats, CreateGoodsReceiptDto } from '@/lib/api/goods-receipts';
import { purchaseOrdersApi } from '@/lib/api/purchase-orders';
import { warehousesApi } from '@/lib/api/warehouses';
import { suppliersApi } from '@/lib/api/suppliers';
import { supplierItemsApi } from '@/lib/api/supplier-items';
import { SupplierItem } from '@/lib/api/types';
import SearchSelect from '@/components/ui/SearchSelect';
import { DateSelection } from '@/components/ui/ERPDatePicker';
import { PrintButton } from '@/components/print/PrintButton';
import { ConfirmModal, useModal } from '@/components/ui/modal';

// ─── Types ────────────────────────────────────────────────────────────────────

interface PO {
  id: string; poNumber: string; status: string;
  warehouseId?: string;
  supplierId?: string;
  supplier?: { id: string; name: string; code: string };
  lines?: POLine[];
}
interface POLine {
  id: string; itemId: string;
  item?: { code: string; name: string; baseUom: string };
  orderedQuantity: string; receivedQuantity: string;
  uom: string; unitPrice: string;
}
interface Warehouse { id: string; code: string; name: string; }
interface Supplier  { id: string; code: string; name: string; }

interface PoolLine {
  key:             string;
  itemId:          string;
  itemCode:        string;
  itemName:        string;
  receivedQty:     string;
  uom:             string;
  unitCost:        string;
  lotNumber:       string;
  expiryDate:      string;
  notes:           string;
  poLineId?:       string;
  orderedQty?:     number;
  alreadyReceived?: number;
  skip:            boolean;
  isFromPo:        boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONO: React.CSSProperties = { fontFamily: "'IBM Plex Mono',monospace" };

function fmtAmt(v: number | string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(Number(v));
}
function fmtDate(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function fmtDateShort(d?: string) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function uid() { return Math.random().toString(36).slice(2, 9); }

// ─── Status / Condition config ────────────────────────────────────────────────

const STATUS_CFG = {
  posted:    { color: 'var(--success, #4ade80)', bg: 'rgba(74,222,128,0.1)',  border: 'rgba(74,222,128,0.2)',  label: 'Posted'    },
  cancelled: { color: 'var(--danger, #f87171)', bg: 'rgba(248,113,113,0.1)', border: 'rgba(248,113,113,0.2)', label: 'Cancelled' },
};

const CONDITION_CFG: Record<string, { color: string; label: string }> = {
  complete: { color: 'var(--success, #4ade80)', label: 'Complete' },
  partial:  { color: 'var(--accent-strong, #fb923c)', label: 'Partial'  },
  damaged:  { color: 'var(--danger, #f87171)', label: 'Damaged'  },
  rejected: { color: 'var(--danger, #f87171)', label: 'Rejected' },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_CFG[status as keyof typeof STATUS_CFG] ?? STATUS_CFG.posted;
  return (
    <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'2px 9px', borderRadius:20, fontSize:11, fontWeight:500, color:s.color, background:s.bg, border:`0.5px solid ${s.border}`, whiteSpace:'nowrap' }}>
      <span style={{ width:5, height:5, borderRadius:'50%', background:s.color, flexShrink:0 }} />{s.label}
    </span>
  );
}

// ─── GRN Detail Drawer ────────────────────────────────────────────────────────

function GrnDetailDrawer({ grn, onClose, onAction }: {
  grn: GoodsReceipt; onClose: () => void; onAction: () => void;
}) {
  const [detail,     setDetail]     = useState<GoodsReceipt | null>(null);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const cancelModal = useModal();

  useEffect(() => {
    goodsReceiptsApi.getById(grn.id)
      .then(d => setDetail(d))
      .catch(() => setError('Failed to load GRN details.'))
      .finally(() => setLoading(false));
  }, [grn.id]);

  // spec-frontend-002 adoption — ConfirmModal replaces the native confirm().
  // Throwing propagates to ConfirmModal, which keeps open + shows the error.
  const doCancel = async () => {
    await goodsReceiptsApi.cancel(grn.id);
    onAction();
    onClose();
  };

  return (
    <div style={{ position:'fixed', inset:0, zIndex:400, display:'flex' }}>
      <div style={{ flex:1, background:'rgba(0,0,0,0.5)', backdropFilter:'blur(2px)' }} onClick={onClose} />
      <div style={{ width:720, background:'var(--bg, #0a0712)', borderLeft:'0.5px solid rgba(74,222,128,0.15)', display:'flex', flexDirection:'column', overflowY:'auto' }}>
        <div style={{ padding:'16px 20px', borderBottom:'0.5px solid var(--l06)', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div>
            <div style={{ fontSize:14, fontWeight:500, color:'var(--text-strong, #f1ede8)', ...MONO }}>{grn.grnNumber}</div>
            <div style={{ fontSize:12, color:'var(--w40)', marginTop:2 }}>
              {grn.supplierName ? `${grn.supplierName} · ` : ''}{grn.warehouseName}
              {grn.poNumber && <span style={{ color:'rgba(251,146,60,0.5)', marginLeft:8 }}>· PO {grn.poNumber}</span>}
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <StatusBadge status={grn.status} />
            <PrintButton doc="goods-receipt" id={grn.id} style={{ padding:'6px 12px' }} />
            <button onClick={onClose} style={{ width:24, height:24, borderRadius:6, background:'var(--l06)', border:'none', cursor:'pointer', color:'var(--w45)', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
          </div>
        </div>

        {loading ? (
          <div style={{ flex:1, display:'flex', alignItems:'center', justifyContent:'center', color:'var(--w30)', fontSize:13 }}>Loading…</div>
        ) : detail ? (
          <div style={{ flex:1, overflowY:'auto', padding:'16px 20px', display:'flex', flexDirection:'column', gap:16 }}>
            {error && <div style={{ background:'rgba(239,68,68,0.08)', border:'0.5px solid rgba(239,68,68,0.2)', borderRadius:7, padding:'8px 12px', fontSize:12, color:'var(--danger-subtle, #fca5a5)' }}>{error}</div>}

            {/* Info grid */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10 }}>
              {[
                { label:'Received Date', value: fmtDate(detail.receivedDate) },
                { label:'Condition',     value: CONDITION_CFG[detail.condition]?.label ?? detail.condition },
                { label:'PO Number',     value: detail.poNumber ?? '—' },
                { label:'Warehouse',     value:`${detail.warehouseCode} — ${detail.warehouseName}` },
              ].map(item => (
                <div key={item.label} style={{ background:'var(--l03)', borderRadius:8, padding:'8px 12px' }}>
                  <div style={{ fontSize:10, color:'var(--w30)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>{item.label}</div>
                  <div style={{ fontSize:12, color:'var(--text-primary, #e2dfd8)' }}>{item.value}</div>
                </div>
              ))}
            </div>

            {/* Supplier ref */}
            {(detail as any).supplierRef && (
              <div style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 12px', background:'rgba(96,165,250,0.05)', border:'0.5px solid rgba(96,165,250,0.15)', borderRadius:7 }}>
                <span style={{ fontSize:10, color:'rgba(96,165,250,0.5)', textTransform:'uppercase', letterSpacing:'0.08em' }}>Supplier Ref</span>
                <span style={{ ...MONO, fontSize:12, color:'var(--accent-blue, #60a5fa)' }}>{(detail as any).supplierRef}</span>
              </div>
            )}

            {/* Lines table */}
            <div>
              <div style={{ fontSize:11, fontWeight:500, color:'rgba(74,222,128,0.6)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:8 }}>Receipt Lines</div>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead>
                  <tr>
                    {['#','Item','Qty','UOM','Unit Cost','Total','Lot','Expiry'].map(h => (
                      <th key={h} style={{ padding:'6px 8px', fontSize:10, color:'rgba(74,222,128,0.5)', fontWeight:500, letterSpacing:'0.08em', textTransform:'uppercase', textAlign:['Qty','Unit Cost','Total'].includes(h)?'right':'left', borderBottom:'0.5px solid var(--l06)', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {detail.lines?.map(line => (
                    <tr key={line.id} style={{ borderBottom:'0.5px solid var(--l04)' }}>
                      <td style={{ padding:'8px', color:'var(--w30)', ...MONO }}>{line.lineNumber}</td>
                      <td style={{ padding:'8px' }}>
                        <div style={{ ...MONO, color:'var(--accent-strong, #fb923c)', fontSize:11 }}>{line.item?.code}</div>
                        <div style={{ color:'var(--w55)', fontSize:11, marginTop:1 }}>{line.item?.name}</div>
                      </td>
                      <td style={{ padding:'8px', textAlign:'right', ...MONO, color:'var(--success, #4ade80)', fontWeight:500 }}>{Number(line.receivedQuantity).toLocaleString()}</td>
                      <td style={{ padding:'8px', color:'var(--w45)' }}>{line.uom}</td>
                      <td style={{ padding:'8px', textAlign:'right', ...MONO, fontSize:11 }}>{line.unitCost ? fmtAmt(line.unitCost) : '—'}</td>
                      <td style={{ padding:'8px', textAlign:'right', ...MONO, fontWeight:500, color:'var(--text-primary, #e2dfd8)' }}>
                        {line.unitCost ? fmtAmt(Number(line.receivedQuantity) * Number(line.unitCost)) : '—'}
                      </td>
                      <td style={{ padding:'8px', color:'var(--w35)', fontSize:11 }}>{line.lotNumber ?? '—'}</td>
                      <td style={{ padding:'8px', fontSize:11 }}>
                        {line.expiryDate ? (
                          <span style={{ color: new Date(line.expiryDate) < new Date() ? 'var(--danger, #f87171)' : 'var(--warning, #fbbf24)', ...MONO }}>
                            {fmtDateShort(line.expiryDate)}
                          </span>
                        ) : <span style={{ color:'var(--w20)' }}>—</span>}
                      </td>
                    </tr>
                  ))}
                  <tr style={{ background:'var(--l02)' }}>
                    <td colSpan={5} style={{ padding:'8px', fontSize:11, color:'var(--w30)', fontWeight:500 }}>TOTAL VALUE</td>
                    <td colSpan={3} style={{ padding:'8px', textAlign:'right', ...MONO, fontWeight:600, color:'var(--success, #4ade80)', fontSize:14 }}>
                      {fmtAmt(detail.lines?.reduce((sum, l) => sum + Number(l.receivedQuantity) * Number(l.unitCost ?? 0), 0) ?? 0)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            {detail.notes && (
              <div style={{ background:'var(--l02)', border:'0.5px solid var(--l06)', borderRadius:8, padding:'10px 14px' }}>
                <div style={{ fontSize:10, color:'var(--w30)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:4 }}>Notes</div>
                <div style={{ fontSize:12, color:'var(--w55)', lineHeight:1.6 }}>{detail.notes}</div>
              </div>
            )}

            {detail.status === 'posted' && (
              <div style={{ display:'flex', gap:8, paddingTop:8, borderTop:'0.5px solid var(--l06)' }}>
                <button onClick={cancelModal.openModal}
                  style={{ padding:'7px 16px', borderRadius:7, fontSize:12, cursor:'pointer', background:'rgba(239,68,68,0.08)', border:'0.5px solid rgba(239,68,68,0.2)', color:'var(--danger, #f87171)', fontFamily:"'IBM Plex Sans',sans-serif" }}>
                  Cancel GRN
                </button>
              </div>
            )}
          </div>
        ) : null}
      </div>

      <ConfirmModal
        open={cancelModal.open}
        onClose={cancelModal.closeModal}
        title={`Cancel GRN ${grn.grnNumber}?`}
        description="This reverses all stock movements created by this goods receipt. It cannot be undone."
        variant="destructive"
        confirmLabel="Cancel GRN"
        cancelLabel="Keep GRN"
        onConfirm={doCancel}
      />
    </div>
  );
}

// ─── Create GRN Modal ─────────────────────────────────────────────────────────

function CreateGrnModal({ open, onClose, onSaved, warehouses, suppliers }: {
  open: boolean; onClose: () => void; onSaved: () => void;
  warehouses: Warehouse[]; suppliers: Supplier[];
}) {
  const [mode, setMode] = useState<'po' | 'manual'>('po');

  // PO mode
  const [poOptions,    setPoOptions]    = useState<PO[]>([]);
  const [selectedPoId, setSelectedPoId] = useState('');
  const [selectedPo,   setSelectedPo]   = useState<PO | null>(null);
  const [poLoading,    setPoLoading]    = useState(false);
  const [poDetLoading, setPoDetLoading] = useState(false);

  // Manual mode
  const [selectedSupplierId,   setSelectedSupplierId]   = useState('');
  const [supplierItems,        setSupplierItems]        = useState<SupplierItem[]>([]);
  const [supplierItemsLoading, setSupplierItemsLoading] = useState(false);
  const [itemSearch,           setItemSearch]           = useState('');
  const [itemDropOpen,         setItemDropOpen]         = useState(false);
  const itemDropRef = useRef<HTMLDivElement>(null);

  // Shared
  const [warehouseId,  setWarehouseId]  = useState('');
  const [receivedDate, setReceivedDate] = useState('');
  const [condition,    setCondition]    = useState('complete');
  const [notes,        setNotes]        = useState('');
  const [supplierRef,  setSupplierRef]  = useState('');
  const [pool,         setPool]         = useState<PoolLine[]>([]);
  const [submitting,   setSubmitting]   = useState(false);
  const [error,        setError]        = useState('');

  // Reset on open
  useEffect(() => {
    if (!open) return;
    setMode('po');
    setSelectedPoId(''); setSelectedPo(null);
    setSelectedSupplierId(''); setSupplierItems([]);
    setWarehouseId('');
    setReceivedDate(new Date().toISOString().slice(0,10));
    setCondition('complete'); setNotes(''); setSupplierRef('');
    setPool([]); setError('');
    setItemSearch(''); setItemDropOpen(false);
  }, [open]);

  // Load POs
  useEffect(() => {
    if (!open || mode !== 'po') return;
    setPoLoading(true);
    Promise.all([
      purchaseOrdersApi.getAll({ status: 'confirmed' }),
      purchaseOrdersApi.getAll({ status: 'partially_received' }),
    ]).then(([conf, partial]) => {
      const combined = [...(conf as PO[]), ...(partial as PO[])];
      setPoOptions(Array.from(new Map(combined.map(p => [p.id, p])).values()));
    }).catch(() => setPoOptions([]))
      .finally(() => setPoLoading(false));
  }, [open, mode]);

  // Select PO
  const handlePoSelect = useCallback(async (poId: string) => {
    setSelectedPoId(poId);
    if (!poId) { setSelectedPo(null); setPool([]); setWarehouseId(''); return; }
    setPoDetLoading(true);
    try {
      const detail = await purchaseOrdersApi.getById(poId) as PO;
      setSelectedPo(detail);
      if (detail.warehouseId) setWarehouseId(detail.warehouseId);
      if (detail.lines?.length) {
        setPool(detail.lines.map(l => ({
          key:             uid(),
          itemId:          l.itemId,
          itemCode:        l.item?.code ?? '',
          itemName:        l.item?.name ?? '',
          receivedQty:     '',
          uom:             l.uom || l.item?.baseUom || 'PCS',
          unitCost:        l.unitPrice ?? '',
          lotNumber:       '',
          expiryDate:      '',
          notes:           '',
          poLineId:        l.id,
          orderedQty:      Number(l.orderedQuantity),
          alreadyReceived: Number(l.receivedQuantity),
          skip:            false,
          isFromPo:        true,
        })));
      }
      setError('');
    } catch { setError('Failed to load PO details.'); }
    finally { setPoDetLoading(false); }
  }, []);

  // Load supplier items
  useEffect(() => {
    if (!selectedSupplierId) { setSupplierItems([]); return; }
    setSupplierItemsLoading(true);
    supplierItemsApi.getBySupplier(selectedSupplierId)
      .then(items => setSupplierItems(items.filter((i: SupplierItem) => i.isActive)))
      .catch(() => setSupplierItems([]))
      .finally(() => setSupplierItemsLoading(false));
  }, [selectedSupplierId]);

  // Close item dropdown outside click
  useEffect(() => {
    if (!itemDropOpen) return;
    const handler = (e: MouseEvent) => {
      if (itemDropRef.current && !itemDropRef.current.contains(e.target as Node))
        setItemDropOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [itemDropOpen]);

  // Add item to pool
  const addItemToPool = (si: SupplierItem) => {
    if (pool.some(p => p.itemId === si.itemId)) {
      setError(`${si.item?.code} is already in the receipt.`);
      return;
    }
    setPool(prev => [...prev, {
      key:         uid(),
      itemId:      si.itemId,
      itemCode:    si.item?.code ?? si.supplierItemCode ?? '',
      itemName:    si.item?.name ?? si.supplierItemName ?? '',
      receivedQty: '',
      uom:         si.purchaseUom?.code ?? si.item?.baseUom ?? 'PCS',
      unitCost:    si.lastPrice ? String(si.lastPrice) : '',
      lotNumber:   '',
      expiryDate:  '',
      notes:       '',
      skip:        false,
      isFromPo:    false,
    }]);
    setItemSearch('');
    setItemDropOpen(false);
    setError('');
  };

  const updateLine = (key: string, field: keyof PoolLine, value: any) =>
    setPool(prev => prev.map(l => l.key === key ? { ...l, [field]: value } : l));

  const removeLine = (key: string) =>
    setPool(prev => prev.filter(l => l.key !== key));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!warehouseId) { setError('Warehouse is required.'); return; }
    const validLines = pool.filter(l => !l.skip && l.itemId && l.receivedQty && Number(l.receivedQty) > 0);
    if (!validLines.length) { setError('At least one line with item and quantity > 0 is required.'); return; }
    setSubmitting(true); setError('');
    try {
      const dto: CreateGoodsReceiptDto = {
        poId:        selectedPo?.id,
        supplierId:  mode === 'manual' ? (selectedSupplierId || undefined) : undefined,
        warehouseId,
        receivedDate: receivedDate || undefined,
        condition,
        notes:       notes || undefined,
        supplierRef: mode === 'manual' ? (supplierRef || undefined) : undefined,
        lines: validLines.map(l => ({
          poLineId:         l.poLineId,
          itemId:           l.itemId,
          receivedQuantity: Number(l.receivedQty),
          uom:              l.uom,
          unitCost:         l.unitCost ? Number(l.unitCost) : undefined,
          lotNumber:        l.lotNumber || undefined,
          expiryDate:       l.expiryDate || undefined,
          notes:            l.notes || undefined,
        })),
      };
      await goodsReceiptsApi.create(dto);
      onSaved(); onClose();
    } catch (err: any) { setError(err?.response?.data?.message || 'Failed to create GRN.'); }
    finally { setSubmitting(false); }
  };

  if (!open) return null;

  const INP: React.CSSProperties = { background:'var(--l04, rgba(255,255,255,0.04))', border:'0.5px solid var(--w10, rgba(255,255,255,0.1))', borderRadius:7, padding:'8px 12px', fontSize:12, fontFamily:"'IBM Plex Sans',sans-serif", color:'var(--text-strong, #f1ede8)', outline:'none', width:'100%' };
  const LBL: React.CSSProperties = { fontSize:10, fontWeight:500, letterSpacing:'0.08em', textTransform:'uppercase', color:'rgba(74,222,128,0.6)', display:'block', marginBottom:4 };
  const LINE_INP: React.CSSProperties = { background:'var(--l04, rgba(255,255,255,0.04))', border:'0.5px solid var(--w10, rgba(255,255,255,0.1))', borderRadius:5, padding:'5px 7px', fontSize:12, fontFamily:"'IBM Plex Sans',sans-serif", color:'var(--text-strong, #f1ede8)', outline:'none', width:'100%' };

  const filteredSupplierItems = supplierItems.filter(si =>
    !itemSearch.trim() ||
    si.item?.code?.toLowerCase().includes(itemSearch.toLowerCase()) ||
    si.item?.name?.toLowerCase().includes(itemSearch.toLowerCase()) ||
    si.supplierItemCode?.toLowerCase().includes(itemSearch.toLowerCase())
  );

  const poOptions_ss = poOptions.map(p => ({
    value: p.id,
    label: p.poNumber,
    sublabel: p.supplier?.name ?? '',
  }));

  return (
    <>
      <style>{`
        .grn-overlay{position:fixed;inset:0;z-index:400;background:rgba(0,0,0,0.7);backdrop-filter:blur(4px);display:flex;align-items:flex-start;justify-content:center;padding:20px;overflow-y:auto}
        .grn-box{background:var(--surface, #0e0b1a);border:0.5px solid rgba(74,222,128,0.2);border-radius:14px;width:100%;max-width:1060px;margin:auto;position:relative;box-shadow:0 24px 60px rgba(0,0,0,0.7)}
        .grn-box::before{content:'';position:absolute;top:0;left:30px;right:30px;height:1px;background:linear-gradient(90deg,transparent,rgba(74,222,128,0.4),transparent);pointer-events:none}
        .grn-section{font-size:10px;font-weight:500;letter-spacing:0.12em;text-transform:uppercase;color:var(--w25, rgba(255,255,255,0.25));padding:6px 0 4px;border-bottom:0.5px solid var(--l06, rgba(255,255,255,0.06));margin-top:4px;display:flex;align-items:center;justify-content:space-between}
        .grn-th{font-size:10px;color:rgba(74,222,128,0.5);text-transform:uppercase;letter-spacing:0.08em;padding:5px 8px;text-align:left;border-bottom:0.5px solid var(--l06, rgba(255,255,255,0.06));white-space:nowrap;font-weight:500}
        .mode-tab{padding:6px 14px;border-radius:6px;font-size:11px;font-weight:500;cursor:pointer;border:0.5px solid transparent;transition:all 0.15s;font-family:'IBM Plex Sans',sans-serif}
        .mode-tab-active{background:rgba(74,222,128,0.1);border-color:rgba(74,222,128,0.3);color:var(--success, #4ade80)}
        .mode-tab-inactive{background:var(--l03, rgba(255,255,255,0.03));border-color:var(--l08, rgba(255,255,255,0.08));color:var(--w35, rgba(255,255,255,0.35))}
        .pool-row{border-bottom:0.5px solid var(--l04, rgba(255,255,255,0.04))}
        .pool-row:hover{background:var(--l01, rgba(255,255,255,0.01))}
        .pool-row-skip{opacity:0.4}
        .item-drop{position:absolute;top:calc(100% + 4px);left:0;right:0;z-index:9999;background:var(--surface, #0e0b1a);border:0.5px solid rgba(74,222,128,0.2);border-radius:8px;box-shadow:0 12px 36px rgba(0,0,0,0.7);max-height:240px;overflow-y:auto}
        .item-drop-row{padding:9px 12px;cursor:pointer;display:flex;align-items:center;justify-content:space-between;transition:background 0.1s}
        .item-drop-row:hover{background:rgba(74,222,128,0.06)}
        .item-drop-row:not(:last-child){border-bottom:0.5px solid var(--l04, rgba(255,255,255,0.04))}
        .grn-date-inp{background:var(--l04, rgba(255,255,255,0.04));border:0.5px solid var(--w10, rgba(255,255,255,0.1));border-radius:5px;padding:5px 7px;font-size:12px;font-family:'IBM Plex Sans',sans-serif;color:var(--text-strong, #f1ede8);outline:none;width:100%;color-scheme:dark}
        .grn-date-inp::-webkit-calendar-picker-indicator{filter:invert(0.5) sepia(1) saturate(3) hue-rotate(10deg);cursor:pointer;opacity:0.6}
        .grn-date-inp::-webkit-calendar-picker-indicator:hover{opacity:1}
      `}</style>

      <div className="grn-overlay">
        <div className="grn-box">
          {/* Header */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'16px 20px 12px', borderBottom:'0.5px solid var(--l06, rgba(255,255,255,0.06))', position:'sticky', top:0, background:'var(--surface, #0e0b1a)', zIndex:10, borderRadius:'14px 14px 0 0' }}>
            <div style={{ display:'flex', alignItems:'center', gap:12 }}>
              <span style={{ fontSize:14, fontWeight:500, color:'var(--text-strong, #f1ede8)' }}>New Goods Receipt (GRN)</span>
              <div style={{ display:'flex', gap:4 }}>
                <button className={`mode-tab ${mode === 'po' ? 'mode-tab-active' : 'mode-tab-inactive'}`}
                  onClick={() => { setMode('po'); setPool([]); setSelectedSupplierId(''); setSupplierRef(''); }}>
                  From PO
                </button>
                <button className={`mode-tab ${mode === 'manual' ? 'mode-tab-active' : 'mode-tab-inactive'}`}
                  onClick={() => { setMode('manual'); setSelectedPoId(''); setSelectedPo(null); setPool([]); }}>
                  Manual
                </button>
              </div>
            </div>
            <button onClick={onClose} style={{ width:24, height:24, borderRadius:6, background:'var(--l06, rgba(255,255,255,0.06))', border:'none', cursor:'pointer', color:'var(--w45, rgba(255,255,255,0.45))', fontSize:16, display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
          </div>

          <form onSubmit={handleSubmit}>
            <div style={{ padding:'16px 20px', display:'flex', flexDirection:'column', gap:14 }}>
              {error && <div style={{ background:'rgba(239,68,68,0.1)', border:'0.5px solid rgba(239,68,68,0.25)', borderRadius:7, padding:'8px 12px', fontSize:12, color:'var(--danger-subtle, #fca5a5)' }}>{error}</div>}

              {/* ── FROM PO ── */}
              {mode === 'po' && (
                <>
                  <div className="grn-section">
                    <span>Purchase Order</span>
                    {poLoading && <span style={{ color:'var(--w25, rgba(255,255,255,0.25))', fontSize:10 }}>Loading POs…</span>}
                  </div>
                  <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                    <div style={{ flex:1 }}>
                      <label style={LBL}>PO Number (confirmed or partially received)</label>
                      <SearchSelect
                        options={poOptions_ss}
                        value={selectedPoId}
                        onChange={handlePoSelect}
                        placeholder="Search PO number or supplier…"
                        clearLabel="— Select a PO —"
                        minWidth={360}
                      />
                    </div>
                    {poDetLoading && <span style={{ fontSize:12, color:'var(--w30, rgba(255,255,255,0.3))', flexShrink:0 }}>Loading…</span>}
                    {selectedPo && (
                      <div style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 12px', background:'rgba(74,222,128,0.05)', border:'0.5px solid rgba(74,222,128,0.2)', borderRadius:7, flexShrink:0 }}>
                        <span style={{ fontSize:11, color:'var(--success, #4ade80)', ...MONO }}>{selectedPo.poNumber}</span>
                        {selectedPo.supplier?.name && <span style={{ fontSize:11, color:'var(--w40, rgba(255,255,255,0.4))' }}>{selectedPo.supplier.name}</span>}
                        <span style={{ fontSize:10, color:'var(--w25, rgba(255,255,255,0.25))', background:'var(--l05, rgba(255,255,255,0.05))', padding:'1px 6px', borderRadius:4 }}>{pool.length} lines</span>
                      </div>
                    )}
                  </div>
                </>
              )}

              {/* ── MANUAL ── */}
              {mode === 'manual' && (
                <>
                  <div className="grn-section"><span>Vendor & Items</span></div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
                    <div>
                      <label style={LBL}>Supplier</label>
                      <SearchSelect
                        options={suppliers.map(s => ({ value: s.id, label: s.code, sublabel: s.name }))}
                        value={selectedSupplierId}
                        onChange={v => { setSelectedSupplierId(v); setPool([]); setItemSearch(''); }}
                        placeholder="Search supplier…"
                        clearLabel="— Select supplier —"
                        minWidth={280}
                      />
                    </div>
                    <div style={{ position:'relative' }} ref={itemDropRef}>
                      <label style={{ ...LBL, color: selectedSupplierId ? 'rgba(74,222,128,0.6)' : 'var(--w20, rgba(255,255,255,0.2))' }}>
                        Add Item
                        {supplierItemsLoading && <span style={{ color:'var(--w25, rgba(255,255,255,0.25))', fontWeight:400 }}> — loading…</span>}
                        {selectedSupplierId && !supplierItemsLoading && <span style={{ color:'var(--w25, rgba(255,255,255,0.25))', fontWeight:400 }}> — {supplierItems.length} available</span>}
                      </label>
                      <input
                        style={{ ...INP, opacity: selectedSupplierId ? 1 : 0.4, cursor: selectedSupplierId ? 'text' : 'not-allowed' }}
                        placeholder={selectedSupplierId ? 'Search item code or name…' : 'Select a supplier first'}
                        disabled={!selectedSupplierId}
                        value={itemSearch}
                        onChange={e => { setItemSearch(e.target.value); setItemDropOpen(true); }}
                        onFocus={() => selectedSupplierId && setItemDropOpen(true)}
                      />
                      {itemDropOpen && selectedSupplierId && (
                        <div className="item-drop">
                          {filteredSupplierItems.length === 0 ? (
                            <div style={{ padding:'14px 12px', fontSize:12, color:'var(--w30, rgba(255,255,255,0.3))', textAlign:'center' }}>
                              {itemSearch ? `No items matching "${itemSearch}"` : 'No items for this supplier'}
                            </div>
                          ) : filteredSupplierItems.map(si => (
                            <div key={si.id} className="item-drop-row" onClick={() => addItemToPool(si)}>
                              <div>
                                <span style={{ ...MONO, fontSize:11, color:'var(--accent-strong, #fb923c)' }}>{si.item?.code ?? si.supplierItemCode}</span>
                                <span style={{ fontSize:11, color:'var(--w50, rgba(255,255,255,0.5))', marginLeft:8 }}>{si.item?.name ?? si.supplierItemName}</span>
                                {si.isPreferred && <span style={{ fontSize:9, color:'var(--success, #4ade80)', marginLeft:6, background:'rgba(74,222,128,0.1)', padding:'1px 5px', borderRadius:3 }}>preferred</span>}
                              </div>
                              <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
                                {si.lastPrice && <span style={{ fontSize:11, color:'var(--w40, rgba(255,255,255,0.4))', ...MONO }}>{fmtAmt(si.lastPrice)}</span>}
                                <span style={{ fontSize:10, color:'var(--accent-strong, #fb923c)', background:'rgba(251,146,60,0.08)', padding:'1px 6px', borderRadius:4, ...MONO }}>{si.purchaseUom?.code ?? 'PCS'}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}

              {/* ── Receipt Details ── */}
              <div className="grn-section"><span>Receipt Details</span></div>
              <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr', gap:10 }}>
                <div>
                  <label style={LBL}>Warehouse *</label>
                  <SearchSelect
                    options={warehouses.map(w => ({ value: w.id, label: `${w.code} — ${w.name}` }))}
                    value={warehouseId}
                    onChange={setWarehouseId}
                    placeholder="Search warehouse…"
                    clearLabel="— Select warehouse —"
                    minWidth={260}
                  />
                  {selectedPo?.warehouseId && warehouseId === selectedPo.warehouseId && (
                    <span style={{ display:'inline-flex', alignItems:'center', gap:3, fontSize:9, color:'rgba(74,222,128,0.5)', marginTop:2 }}>
                      <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                      auto-filled from PO
                    </span>
                  )}
                </div>
                <div>
                  <label style={LBL}>Received Date</label>
                  <input type="date" value={receivedDate} onChange={e => setReceivedDate(e.target.value)}
                    style={{ ...INP, colorScheme:'dark' }} />
                </div>
                <div>
                  <label style={LBL}>Condition</label>
                  <SearchSelect options={['complete','partial','damaged','rejected'].map(c => ({ value: c, label: c }))} value={condition} onChange={setCondition} placeholder="Condition…" minWidth={180} />
                </div>
                <div>
                  <label style={LBL}>Notes</label>
                  <input style={INP} placeholder="Optional…" value={notes} onChange={e => setNotes(e.target.value)} />
                </div>
              </div>

              {/* Supplier Ref — manual mode only */}
              {mode === 'manual' && (
                <div>
                  <label style={{ ...LBL, color:'rgba(96,165,250,0.6)' }}>Supplier Invoice / Reference #</label>
                  <input
                    style={{ ...INP, borderColor:'rgba(96,165,250,0.2)', background:'rgba(96,165,250,0.03)' }}
                    placeholder="e.g. INV-2026-00123 — supplier's invoice number"
                    value={supplierRef}
                    onChange={e => setSupplierRef(e.target.value)}
                  />
                </div>
              )}

              {/* ── Pool / Lines ── */}
              <div className="grn-section">
                <span>Receipt Lines</span>
                <span style={{ fontSize:10, color:'var(--w20, rgba(255,255,255,0.2))', fontWeight:400, textTransform:'none', letterSpacing:0 }}>
                  {pool.filter(l => !l.skip).length} active · {pool.filter(l => l.skip).length} skipped
                </span>
              </div>

              {pool.length === 0 ? (
                <div style={{ padding:'24px 12px', textAlign:'center', fontSize:12, color:'var(--w20, rgba(255,255,255,0.2))', border:'0.5px dashed var(--l08, rgba(255,255,255,0.08))', borderRadius:8 }}>
                  {mode === 'po' ? 'Select a PO above to pre-populate lines' : 'Select a supplier then search and click items to add them'}
                </div>
              ) : (
                <div style={{ border:'0.5px solid var(--l06, rgba(255,255,255,0.06))', borderRadius:8, overflow:'hidden' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse' }}>
                    <thead>
                      <tr style={{ background:'rgba(0,0,0,0.3)' }}>
                        {mode === 'po' && <th className="grn-th" style={{ width:32 }}>Skip</th>}
                        <th className="grn-th" style={{ minWidth:160 }}>Item</th>
                        <th className="grn-th" style={{ width:110 }}>Qty *</th>
                        <th className="grn-th" style={{ width:70 }}>UOM</th>
                        <th className="grn-th" style={{ width:100 }}>Unit Cost</th>
                        <th className="grn-th" style={{ width:110 }}>Lot Number</th>
                        <th className="grn-th" style={{ width:120 }}>Expiry Date</th>
                        <th className="grn-th">Notes</th>
                        {mode === 'manual' && <th className="grn-th" style={{ width:28 }}></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {pool.map(line => {
                        const pendingQty = line.isFromPo && line.orderedQty !== undefined && line.alreadyReceived !== undefined
                          ? line.orderedQty - line.alreadyReceived
                          : null;
                        const isExpired = line.expiryDate && new Date(line.expiryDate) < new Date();
                        return (
                          <tr key={line.key} className={`pool-row${line.skip ? ' pool-row-skip' : ''}`}>
                            {/* Skip */}
                            {mode === 'po' && (
                              <td style={{ padding:'8px', textAlign:'center', verticalAlign:'middle' }}>
                                <input type="checkbox" checked={line.skip}
                                  onChange={e => updateLine(line.key, 'skip', e.target.checked)}
                                  title="Skip this line" style={{ accentColor:'var(--danger, #f87171)', cursor:'pointer' }} />
                              </td>
                            )}
                            {/* Item */}
                            <td style={{ padding:'6px 8px', verticalAlign:'middle' }}>
                              <div style={{ display:'flex', flexDirection:'column', gap:1 }}>
                                <span style={{ ...MONO, fontSize:11, color:'var(--accent-strong, #fb923c)' }}>{line.itemCode}</span>
                                <span style={{ fontSize:10, color:'var(--w40, rgba(255,255,255,0.4))' }}>{line.itemName}</span>
                                {pendingQty !== null && (
                                  <span style={{ fontSize:9, color:'var(--w25, rgba(255,255,255,0.25))' }}>
                                    pending: {pendingQty} · rcvd: {line.alreadyReceived}
                                  </span>
                                )}
                              </div>
                            </td>
                            {/* Qty */}
                            <td style={{ padding:'4px 6px', verticalAlign:'middle' }}>
                              <input
                                style={{ ...LINE_INP, textAlign:'right', borderColor: line.receivedQty && Number(line.receivedQty) > 0 ? 'rgba(74,222,128,0.3)' : 'var(--w10, rgba(255,255,255,0.1))' }}
                                type="number" min="0" step="0.001"
                                placeholder={pendingQty !== null ? `max ${pendingQty}` : '0'}
                                value={line.receivedQty}
                                disabled={line.skip}
                                onChange={e => updateLine(line.key, 'receivedQty', e.target.value)}
                              />
                            </td>
                            {/* UOM */}
                            <td style={{ padding:'4px 3px', verticalAlign:'middle' }}>
                              <input
                                style={{ ...LINE_INP, color:'var(--accent-strong, #fb923c)', background:'rgba(251,146,60,0.04)', borderColor:'rgba(251,146,60,0.2)' }}
                                value={line.uom} disabled={line.skip}
                                onChange={e => updateLine(line.key, 'uom', e.target.value)}
                              />
                            </td>
                            {/* Unit Cost */}
                            <td style={{ padding:'4px 3px', verticalAlign:'middle' }}>
                              <input
                                style={{ ...LINE_INP, textAlign:'right' }}
                                type="number" min="0" step="0.0001" placeholder="0.00"
                                value={line.unitCost} disabled={line.skip}
                                onChange={e => updateLine(line.key, 'unitCost', e.target.value)}
                              />
                            </td>
                            {/* Lot */}
                            <td style={{ padding:'4px 3px', verticalAlign:'middle' }}>
                              <input style={LINE_INP} placeholder="LOT-001" value={line.lotNumber} disabled={line.skip}
                                onChange={e => updateLine(line.key, 'lotNumber', e.target.value)} />
                            </td>
                            {/* Expiry Date */}
                            <td style={{ padding:'4px 3px', verticalAlign:'middle' }}>
                              <input
                                type="date"
                                className="grn-date-inp"
                                style={{
                                  borderColor: isExpired ? 'rgba(248,113,113,0.5)'
                                    : line.expiryDate ? 'rgba(251,191,36,0.35)'
                                    : 'var(--w10, rgba(255,255,255,0.1))',
                                  color: isExpired ? 'var(--danger, #f87171)'
                                    : line.expiryDate ? 'var(--warning, #fbbf24)'
                                    : 'var(--text-strong, #f1ede8)',
                                }}
                                value={line.expiryDate}
                                disabled={line.skip}
                                onChange={e => updateLine(line.key, 'expiryDate', e.target.value)}
                              />
                            </td>
                            {/* Notes */}
                            <td style={{ padding:'4px 3px', verticalAlign:'middle' }}>
                              <input style={LINE_INP} placeholder="Optional…" value={line.notes} disabled={line.skip}
                                onChange={e => updateLine(line.key, 'notes', e.target.value)} />
                            </td>
                            {/* Remove — manual only */}
                            {mode === 'manual' && (
                              <td style={{ padding:'4px', verticalAlign:'middle' }}>
                                <button type="button"
                                  style={{ width:22, height:22, borderRadius:4, background:'rgba(239,68,68,0.1)', border:'0.5px solid rgba(239,68,68,0.2)', color:'var(--danger, #f87171)', cursor:'pointer', fontSize:13, display:'flex', alignItems:'center', justifyContent:'center' }}
                                  onClick={() => removeLine(line.key)}>×</button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Skip notice */}
              {mode === 'po' && pool.some(l => l.skip) && (
                <div style={{ display:'flex', alignItems:'flex-start', gap:6, fontSize:11, color:'rgba(251,146,60,0.6)', padding:'6px 10px', background:'rgba(251,146,60,0.05)', borderRadius:6, border:'0.5px solid rgba(251,146,60,0.15)', lineHeight:1.5 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink:0, marginTop:1 }}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                  <span>Skipped lines will not be received. Create a separate manual GRN for those items if needed, or raise a new PO for discrepant items.</span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div style={{ display:'flex', justifyContent:'flex-end', gap:8, padding:'12px 20px 18px', borderTop:'0.5px solid var(--l06, rgba(255,255,255,0.06))' }}>
              <button type="button" onClick={onClose}
                style={{ background:'var(--l05, rgba(255,255,255,0.05))', border:'0.5px solid var(--w10, rgba(255,255,255,0.1))', borderRadius:7, padding:'8px 16px', fontSize:13, fontFamily:"'IBM Plex Sans',sans-serif", color:'var(--w50, rgba(255,255,255,0.5))', cursor:'pointer' }}>
                Cancel
              </button>
              <button type="submit" disabled={submitting}
                style={{ background:'linear-gradient(135deg,#166534,#15803d,#16a34a)', border:'none', borderRadius:7, padding:'8px 20px', fontSize:13, fontWeight:500, fontFamily:"'IBM Plex Sans',sans-serif", color:'white', cursor:'pointer', boxShadow:'0 3px 12px rgba(22,163,74,0.3)', opacity:submitting?0.5:1 }}>
                {submitting ? 'Creating…' : `Create GRN (${pool.filter(l => !l.skip && l.receivedQty && Number(l.receivedQty) > 0).length} lines)`}
              </button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function GoodsReceiptsPage() {
  const [grns,       setGrns]       = useState<GoodsReceipt[]>([]);
  const [stats,      setStats]      = useState<GrnStats | null>(null);
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  const [suppliers,  setSuppliers]  = useState<Supplier[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [detailGrn,  setDetailGrn]  = useState<GoodsReceipt | null>(null);
  const [statusFilter, setStatusFilter] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    try {
      setLoading(true);
      const [grnData, statsData, whData, supData] = await Promise.all([
        goodsReceiptsApi.getAll(),
        goodsReceiptsApi.getStats(),
        warehousesApi.getAll(),
        suppliersApi.getAll(),
      ]);
      setGrns(grnData);
      setStats(statsData);
      setWarehouses(whData as Warehouse[]);
      setSuppliers(supData as Supplier[]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const filterDefs = useMemo<ERPFilter<GoodsReceipt>[]>(() => [
    {
      key: 'supplierId', label: 'Supplier', type: 'searchselect',
      placeholder: 'Search supplier…', selectWidth: 200,
      options: suppliers.map(s => ({ value: s.id, label: `${s.code} — ${s.name}` })),
      filterFn: (row, val) => (row as any).supplierId === val || row.supplierName === suppliers.find(s => s.id === val)?.name,
    },
    {
      key: 'poId', label: 'PO Number', type: 'searchselect',
      placeholder: 'Search PO…', selectWidth: 175,
      options: Array.from(new Map(grns.filter(g => g.poId && g.poNumber).map(g => [g.poId!, { value: g.poId!, label: g.poNumber!, sublabel: g.supplierName ?? undefined }])).values()),
      filterFn: (row, val) => row.poId === val,
    },
    {
      key: 'warehouseId', label: 'Warehouse', type: 'searchselect',
      placeholder: 'Search warehouse…', selectWidth: 190,
      options: warehouses.map(w => ({ value: w.id, label: `${w.code} — ${w.name}` })),
      filterFn: (row, val) => row.warehouseId === val,
    },
    {
      key: 'receivedDate', label: 'Received Date', type: 'daterange',
      placeholder: 'Received date…', dateWidth: 195,
      filterFn: (row, val) => dateInSelection(row.receivedDate, val as DateSelection),
    },
    {
      key: 'condition', label: 'Condition', type: 'multiselect',
      options: Object.entries(CONDITION_CFG).map(([v, c]) => ({
        value: v, label: c.label,
        color: c.color, bg: `color-mix(in srgb, ${c.color} 8%, transparent)`, border: `color-mix(in srgb, ${c.color} 19%, transparent)`,
      })),
      filterFn: (row, val) => (val as string[]).includes(row.condition),
    },
    {
      key: 'hasPo', label: 'Linked to PO', type: 'boolean',
      placeholder: 'Linked to PO',
      filterFn: (row, val) => val === true ? !!row.poId : true,
    },
  ], [warehouses, suppliers, grns]);

  const { values: filterVals, setValue: setFilterVal, reset: resetFilters, activeCount: filterCount } = useERPFilters(filterDefs);

  const filtered = useMemo(() => {
    const base = applyERPFilters(grns, filterDefs, filterVals);
    return statusFilter ? base.filter(g => g.status === statusFilter) : base;
  }, [grns, filterDefs, filterVals, statusFilter]);

  const columns = useMemo<ERPColumn<GoodsReceipt>[]>(() => [
    {
      key: 'grnNumber', header: 'GRN Number', width: 150, sortable: true,
      value: r => r.grnNumber,
      render: r => <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:12, color:'var(--success, #4ade80)', fontWeight:500 }}>{r.grnNumber}</span>,
    },
    {
      key: 'poNumber', header: 'PO / Ref', width: 140, sortable: true,
      value: r => r.poNumber ?? (r as any).supplierRef ?? '',
      render: r => r.poNumber
        ? <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color:'var(--accent-strong, #fb923c)' }}>{r.poNumber}</span>
        : (r as any).supplierRef
          ? <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color:'var(--accent-blue, #60a5fa)' }}>{(r as any).supplierRef}</span>
          : <span style={{ color:'var(--w20, rgba(255,255,255,0.2))', fontSize:12 }}>—</span>,
    },
    {
      key: 'supplierName', header: 'Supplier', sortable: true,
      value: r => r.supplierName ?? '',
      render: r => <span style={{ color:'var(--text-primary, #e2dfd8)', fontWeight:500 }}>{r.supplierName ?? '—'}</span>,
    },
    {
      key: 'warehouseCode', header: 'Warehouse', width: 140, sortable: true,
      value: r => r.warehouseCode,
      render: r => (
        <div>
          <div style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:11, color:'var(--accent-violet, #a78bfa)' }}>{r.warehouseCode}</div>
          <div style={{ fontSize:10, color:'var(--w30, rgba(255,255,255,0.3))', marginTop:1 }}>{r.warehouseName}</div>
        </div>
      ),
    },
    {
      key: 'receivedDate', header: 'Received', width: 110, sortable: true,
      value: r => r.receivedDate,
      render: r => <span style={{ fontSize:12, color:'var(--w50, rgba(255,255,255,0.5))' }}>{fmtDateShort(r.receivedDate)}</span>,
    },
    {
      key: 'lineCount', header: 'Lines', width: 65, align: 'center', sortable: true,
      value: r => r.lineCount ?? 0,
      render: r => <span style={{ fontSize:12, color:'var(--w40, rgba(255,255,255,0.4))' }}>{r.lineCount ?? 0}</span>,
    },
    {
      key: 'totalValue', header: 'Total Value', width: 120, align: 'right', sortable: true,
      value: r => r.totalValue ?? 0,
      render: r => r.totalValue
        ? <span style={{ fontFamily:"'IBM Plex Mono',monospace", fontSize:12, fontWeight:500, color:'var(--text-primary, #e2dfd8)' }}>{fmtAmt(r.totalValue)}</span>
        : <span style={{ color:'var(--w20, rgba(255,255,255,0.2))', fontSize:12 }}>—</span>,
    },
    {
      key: 'condition', header: 'Condition', width: 100, sortable: true,
      value: r => r.condition,
      render: r => {
        const c = CONDITION_CFG[r.condition];
        return c
          ? <span style={{ fontSize:11, color:c.color, background:`color-mix(in srgb, ${c.color} 8%, transparent)`, border:`0.5px solid color-mix(in srgb, ${c.color} 19%, transparent)`, padding:'2px 8px', borderRadius:20 }}>{c.label}</span>
          : <span style={{ fontSize:11, color:'var(--w40, rgba(255,255,255,0.4))' }}>{r.condition}</span>;
      },
    },
    {
      key: 'status', header: 'Status', width: 100, sortable: true,
      value: r => r.status,
      render: r => <StatusBadge status={r.status} />,
    },
    {
      key: '_actions', header: '', width: 70, sortable: false,
      render: r => (
        <button onClick={e => { e.stopPropagation(); setDetailGrn(r); }}
          style={{ padding:'4px 10px', borderRadius:6, fontSize:11, cursor:'pointer', background:'var(--l05, rgba(255,255,255,0.05))', border:'0.5px solid var(--w10, rgba(255,255,255,0.1))', color:'var(--w55, rgba(255,255,255,0.55))', fontFamily:"'IBM Plex Sans',sans-serif" }}>
          View
        </button>
      ),
    },
  ], []);

  return (
    <ERPShell breadcrumbs={['Home','Procurement','Goods Receipts']} title="Goods Receipts (GRN)">
      <style>{`
        .grn-page{padding:0 18px 12px;display:flex;flex-direction:column;height:100%;overflow:hidden}
        .grn-error{background:rgba(239,68,68,0.08);border:0.5px solid rgba(239,68,68,0.2);border-radius:8px;padding:10px 14px;margin-bottom:10px;font-size:13px;color:var(--danger-subtle, #fca5a5);flex-shrink:0}
      `}</style>
      <div className="grn-page">
        {/* Stats */}
        <div style={{ display:'flex', gap:10, marginBottom:10, flexShrink:0, flexWrap:'wrap' }}>
          {stats && [
            { key:'posted',    label:'Posted',    value:stats.posted,    color:'var(--success, #4ade80)', border:'rgba(74,222,128,0.2)'  },
            { key:'cancelled', label:'Cancelled', value:stats.cancelled, color:'var(--danger, #f87171)', border:'rgba(248,113,113,0.2)' },
            { key:'today',     label:'Today',     value:stats.today,     color:'var(--accent-blue, #60a5fa)', border:'rgba(96,165,250,0.2)'  },
          ].map(s => {
            const isActive = statusFilter === s.key;
            return (
              <div key={s.key} onClick={() => setStatusFilter(prev => prev === s.key ? null : s.key)}
                style={{ background: isActive ? `color-mix(in srgb, ${s.color} 8%, transparent)` : 'rgba(10,7,18,0.7)', border:`0.5px solid ${isActive ? s.color : s.border}`, borderRadius:8, padding:'8px 14px', display:'flex', flexDirection:'column', gap:2, minWidth:90, cursor:'pointer', transition:'all 0.15s' }}>
                <span style={{ fontSize:10, color:s.color, textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:500 }}>{s.label}</span>
                <span style={{ fontSize:22, fontWeight:500, color: isActive ? s.color : 'var(--text-strong, #f1ede8)', fontFamily:"'IBM Plex Mono',monospace" }}>{s.value}</span>
              </div>
            );
          })}
          {stats && (
            <div style={{ background:'rgba(10,7,18,0.7)', border:'0.5px solid rgba(74,222,128,0.15)', borderRadius:8, padding:'8px 14px', display:'flex', flexDirection:'column', gap:2, minWidth:130 }}>
              <span style={{ fontSize:10, color:'rgba(74,222,128,0.6)', textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:500 }}>Total Value</span>
              <span style={{ fontSize:16, fontWeight:500, color:'var(--success, #4ade80)', fontFamily:"'IBM Plex Mono',monospace" }}>{fmtAmt(stats.totalValue)}</span>
            </div>
          )}
          <div onClick={() => setStatusFilter(null)}
            style={{ background: !statusFilter ? 'rgba(74,222,128,0.08)' : 'rgba(10,7,18,0.7)', border:`0.5px solid ${!statusFilter ? 'rgba(74,222,128,0.3)' : 'var(--l07, rgba(255,255,255,0.07))'}`, borderRadius:8, padding:'8px 14px', display:'flex', flexDirection:'column', gap:2, minWidth:70, cursor:'pointer', transition:'all 0.15s' }}>
            <span style={{ fontSize:10, color:'rgba(74,222,128,0.6)', textTransform:'uppercase', letterSpacing:'0.08em', fontWeight:500 }}>Total</span>
            <span style={{ fontSize:22, fontWeight:500, color:'var(--success, #4ade80)', fontFamily:"'IBM Plex Mono',monospace" }}>{grns.length}</span>
          </div>
        </div>

        {/* Toolbar */}
        <div style={{ display:'flex', alignItems:'flex-end', gap:10, marginBottom:10, flexShrink:0, flexWrap:'wrap' }}>
          <div style={{ flex:1 }}>
            <ERPFilterBar filters={filterDefs} values={filterVals} onChange={setFilterVal} onReset={resetFilters} activeCount={filterCount} />
          </div>
          <button onClick={() => setCreateOpen(true)}
            style={{ display:'flex', alignItems:'center', gap:6, background:'linear-gradient(135deg,#166534,#15803d,#16a34a)', border:'none', borderRadius:7, padding:'7px 14px', fontSize:12, fontWeight:500, fontFamily:"'IBM Plex Sans',sans-serif", color:'white', cursor:'pointer', boxShadow:'0 3px 12px rgba(22,163,74,0.3)', flexShrink:0, alignSelf:'flex-end' }}>
            + New GRN
          </button>
        </div>

        {error && <div className="grn-error">{error}</div>}

        <div style={{ flex:1, minHeight:0, display:'flex', flexDirection:'column', overflow:'hidden' }}>
          <ERPTable<GoodsReceipt>
            columns={columns}
            data={filtered}
            rowKey={r => r.id}
            loading={loading}
            exportFilename="goods-receipts"
            emptyMessage={filterCount || statusFilter ? 'No GRNs match your filters.' : 'No goods receipts yet.'}
            defaultPageSize={25}
            maxHeight="100%"
            onRowClick={g => setDetailGrn(g)}
          />
        </div>
      </div>

      <CreateGrnModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onSaved={fetchAll}
        warehouses={warehouses}
        suppliers={suppliers}
      />

      {detailGrn && (
        <GrnDetailDrawer grn={detailGrn} onClose={() => setDetailGrn(null)} onAction={() => { setDetailGrn(null); fetchAll(); }} />
      )}
    </ERPShell>
  );
}