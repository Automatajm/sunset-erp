"use client";

import { useEffect, useState, useRef, useCallback } from 'react';
import apiClient from '@/lib/api/client';

// ---- Types ------------------------------------------------------------------

interface Item {
  id:              string;
  code:            string;
  name:            string;
  itemType:        string;
  barcodeInternal: string | null;
  barcodeExternal: string | null;
  baseUom:         string;
  purchaseUom?:    { code: string } | null;
  storageUom?:     { code: string } | null;
  category?:       { name: string; macroCategory: { name: string } } | null;
}

interface Location {
  id:        string;
  type:      'level' | 'bin';
  fullCode:  string;
  code:      string;
  name:      string | null;
  subType?:  string;
  zoneName:  string;
  aisleFull: string;
  rackFull:  string;
  levelFull: string;
  hasBins:   boolean;
}

interface Warehouse {
  id:   string;
  code: string;
  name: string;
}

type LabelType   = 'item' | 'location';
type LocFilter   = 'all' | 'levels' | 'bins';
type Unit        = 'mm' | 'cm' | 'in';
type BarcodeMode = 'internal' | 'external' | 'both';

interface SizeConfig {
  label:    string;
  wMm:      number;
  hMm:      number;
  desc:     string;
  category: string;
}

const SIZES: Record<string, SizeConfig> = {
  'brother-62x29': { label: '62 x 29 mm',   wMm: 62,    hMm: 29,    desc: 'Brother QL series',                        category: 'Thermal Printers' },
  'zebra-100x50':  { label: '100 x 50 mm',  wMm: 100,   hMm: 50,    desc: 'Zebra ZPL thermal roll',                   category: 'Thermal Printers' },
  'zebra-101x76':  { label: '101 x 76 mm',  wMm: 101.6, hMm: 76.2,  desc: 'Zebra 2x3 in',                            category: 'Thermal Printers' },
  'dymo-54x25':    { label: '54 x 25 mm',   wMm: 54,    hMm: 25,    desc: 'DYMO LabelWriter small',                   category: 'Thermal Printers' },
  'dymo-89x28':    { label: '89 x 28 mm',   wMm: 89,    hMm: 28,    desc: 'DYMO LabelWriter address',                 category: 'Thermal Printers' },
  'ship-51x76':    { label: '51 x 76 mm',   wMm: 50.8,  hMm: 76.2,  desc: '2x3 in - Mini shipping',                  category: 'Shipping Labels'  },
  'ship-51x101':   { label: '51 x 102 mm',  wMm: 50.8,  hMm: 101.6, desc: '2x4 in - Boutique/envelope',              category: 'Shipping Labels'  },
  'ship-102x152':  { label: '102 x 152 mm', wMm: 101.6, hMm: 152.4, desc: '4x6 in - Standard shipping (UPS/FedEx)',  category: 'Shipping Labels'  },
  'ship-102x203':  { label: '102 x 203 mm', wMm: 101.6, hMm: 203.2, desc: '4x8 in - Large shipping / B2B',           category: 'Shipping Labels'  },
  'ship-152x203':  { label: '152 x 203 mm', wMm: 152.4, hMm: 203.2, desc: '6x8 in - Pallet / extra large',           category: 'Shipping Labels'  },
  'avery-101x51':  { label: '101 x 51 mm',  wMm: 101,   hMm: 51,    desc: 'Avery 5163 - 2 per row laser',            category: 'Office / Laser'   },
  'avery-63x38':   { label: '63 x 38 mm',   wMm: 63.5,  hMm: 38.1,  desc: 'Avery 5160 - 3 per row laser (30/sheet)', category: 'Office / Laser'   },
  'avery-48x25':   { label: '48 x 25 mm',   wMm: 48.3,  hMm: 25.4,  desc: 'Avery 5167 - 4 per row laser (80/sheet)', category: 'Office / Laser'   },
  'a4sheet':       { label: 'A4 full sheet', wMm: 63.5,  hMm: 38.1,  desc: 'Multi-label A4 (30/sheet)',               category: 'Office / Laser'   },
  'custom':        { label: 'Custom',        wMm: 100,   hMm: 50,    desc: 'Enter your own dimensions',                category: 'Custom'           },
};

const toMm   = (v: number, u: Unit) => u === 'mm' ? v : u === 'cm' ? v * 10 : v * 25.4;
const fromMm = (mm: number, u: Unit) => u === 'mm' ? mm.toFixed(1) : u === 'cm' ? (mm / 10).toFixed(2) : (mm / 25.4).toFixed(3);

// ---- Barcode ----------------------------------------------------------------

function Barcode({ value, height = 36 }: { value: string; height?: number }) {
  const ref = useRef<SVGSVGElement>(null);
  useEffect(() => {
    if (!ref.current || !value) return;
    import('jsbarcode').then(mod => {
      const JsBarcode = mod.default ?? mod;
      try {
        JsBarcode(ref.current, value, {
          format: 'CODE128', width: 1.4, height,
          displayValue: true, fontSize: 8, margin: 2,
          background: 'transparent', lineColor: '#000000',
          textMargin: 1, fontOptions: 'bold',
        });
      } catch { /* invalid */ }
    });
  }, [value, height]);
  return <svg ref={ref} style={{ maxWidth: '100%' }} />;
}

// ---- Item Label -------------------------------------------------------------

function ItemLabel({ item, sz, barcodeMode }: { item: Item; sz: SizeConfig; barcodeMode: BarcodeMode }) {
  const small       = sz.hMm <= 30;
  const intVal      = item.barcodeInternal ?? item.code;
  const extVal      = item.barcodeExternal;
  const showInt     = barcodeMode === 'internal' || barcodeMode === 'both';
  const showExt     = (barcodeMode === 'external' || barcodeMode === 'both') && !!extVal;
  const bcH         = small ? 14 : barcodeMode === 'both' && showExt ? 18 : 26;

  return (
    <div style={{ width: `${sz.wMm}mm`, height: `${sz.hMm}mm`, border: '0.3mm solid #bbb', borderRadius: '1mm', padding: '1mm 1.5mm', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', overflow: 'hidden', background: 'white', boxSizing: 'border-box', breakInside: 'avoid', pageBreakInside: 'avoid' }}>
      {/* Header: code + type */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontFamily: 'monospace', fontWeight: 700, fontSize: small ? '7pt' : '9pt', color: '#000' }}>{item.code}</div>
        <div style={{ fontSize: '5pt', color: '#777', textAlign: 'right', maxWidth: '40%' }}>{item.itemType.replace('_', ' ')}</div>
      </div>
      {/* Name */}
      {!small && <div style={{ fontSize: '7pt', color: '#333', lineHeight: 1.2, overflow: 'hidden', maxHeight: '6mm', fontFamily: 'Arial, sans-serif' }}>{item.name}</div>}
      {/* Internal barcode */}
      {showInt && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', overflow: 'hidden', flex: 1, justifyContent: 'center' }}>
          {barcodeMode === 'both' && !small && <div style={{ fontSize: '4pt', color: '#aaa', fontFamily: 'Arial, sans-serif', marginBottom: 1 }}>INT</div>}
          <Barcode value={intVal} height={bcH} />
        </div>
      )}
      {/* External barcode */}
      {showExt && (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', overflow: 'hidden', flex: 1, justifyContent: 'center' }}>
          {barcodeMode === 'both' && !small && <div style={{ fontSize: '4pt', color: '#aaa', fontFamily: 'Arial, sans-serif', marginBottom: 1 }}>EXT</div>}
          <Barcode value={extVal!} height={bcH} />
        </div>
      )}
      {/* No external available */}
      {barcodeMode === 'external' && !extVal && !small && (
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '6pt', color: '#ccc', fontFamily: 'Arial, sans-serif' }}>No external barcode</div>
      )}
      {/* Footer */}
      {!small && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '5pt', color: '#666', fontFamily: 'Arial, sans-serif' }}>
          <span>{[item.storageUom?.code, item.purchaseUom?.code].filter(Boolean).join(' / ')}</span>
          {item.category && <span style={{ textAlign: 'right', maxWidth: '55%' }}>{item.category.macroCategory.name} &gt; {item.category.name}</span>}
        </div>
      )}
    </div>
  );
}

// ---- Location Label ---------------------------------------------------------

function LocationLabel({ loc, whName, sz }: { loc: Location; whName: string; sz: SizeConfig }) {
  const small = sz.hMm <= 30;
  const isBin = loc.type === 'bin';
  return (
    <div style={{ width: `${sz.wMm}mm`, height: `${sz.hMm}mm`, border: isBin ? '0.5mm solid #000' : '0.3mm solid #555', borderRadius: '1mm', padding: '1mm 1.5mm', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', overflow: 'hidden', background: 'white', boxSizing: 'border-box', breakInside: 'avoid', pageBreakInside: 'avoid' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontSize: '5pt', color: '#777', fontFamily: 'Arial, sans-serif' }}>{whName}</div>
        <div style={{ fontSize: '5pt', color: isBin ? '#000' : '#555', fontFamily: 'Arial, sans-serif', fontWeight: isBin ? 700 : 400 }}>{isBin ? 'BIN' : 'LEVEL'}{loc.zoneName ? ` - ${loc.zoneName}` : ''}</div>
      </div>
      <div style={{ textAlign: 'center', fontFamily: 'monospace', fontWeight: 700, fontSize: small ? '9pt' : '12pt', color: '#000', letterSpacing: '0.06em', lineHeight: 1 }}>{loc.fullCode}</div>
      <div style={{ display: 'flex', justifyContent: 'center', flex: 1, alignItems: 'center', overflow: 'hidden' }}>
        <Barcode value={loc.fullCode} height={small ? 14 : 24} />
      </div>
      {!small && <div style={{ fontSize: '4.5pt', color: '#999', textAlign: 'center', fontFamily: 'Arial, sans-serif' }}>{isBin && loc.subType ? `${loc.subType} bin` : !isBin && loc.hasBins ? 'Level (has bins)' : 'Level'}</div>}
    </div>
  );
}

// ---- Print Sheet ------------------------------------------------------------

function PrintSheet({ children, sz }: { children: React.ReactNode; sz: SizeConfig }) {
  return (
    <div className="print-sheet" style={{ display: 'flex', flexWrap: 'wrap', gap: '2mm', padding: '4mm', background: 'white', alignContent: 'flex-start' }}>
      {children}
    </div>
  );
}

// ---- Help Modal -------------------------------------------------------------

function HelpModal({ sz, onClose }: { sz: SizeConfig; onClose: () => void }) {
  const isLaser   = sz.category === 'Office / Laser';
  const isThermal = sz.category === 'Thermal Printers';
  const steps = [
    { n: 1, title: 'Click Print Labels', text: 'The print dialog will open.' },
    { n: 2, title: 'Select your printer', text: isThermal ? 'Select your label printer (Zebra, Brother, DYMO). Make sure the correct roll is loaded.' : 'Select your laser or inkjet printer with label sheets loaded.' },
    { n: 3, title: isLaser ? 'Set paper size to the sheet size' : 'Set paper size to match the label', text: isLaser ? 'Use Letter or A4 sheet. Labels are pre-sized to fit. Do NOT scale to fit.' : `Print dialog > More settings > Paper size > set to ${sz.wMm.toFixed(0)}mm x ${sz.hMm.toFixed(0)}mm (${(sz.wMm/25.4).toFixed(2)}" x ${(sz.hMm/25.4).toFixed(2)}").` },
    { n: 4, title: 'Set margins to None', text: 'More settings > Margins > None. Prevents white space around labels.' },
    { n: 5, title: 'Disable headers and footers', text: 'Uncheck "Headers and footers" to keep labels clean.' },
    { n: 6, title: isThermal ? 'Printer handles copies automatically' : 'Check page count', text: isThermal ? 'Each label is a separate page. Printer feeds and cuts automatically.' : 'Each page fits multiple labels. All pages print in sequence.' },
  ];
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--bg, #0a0712)', border: '0.5px solid rgba(96,165,250,0.2)', borderRadius: 14, width: '100%', maxWidth: 480, maxHeight: '85vh', overflow: 'hidden', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 64px rgba(0,0,0,0.8)' }}>
        <div style={{ padding: '16px 20px 12px', borderBottom: '0.5px solid var(--l07, rgba(255,255,255,0.07))', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary, #e2dfd8)' }}>How to Print Labels</div>
          <button onClick={onClose} style={{ background: 'var(--l05, rgba(255,255,255,0.05))', border: 'none', borderRadius: 6, padding: '4px 10px', fontSize: 13, color: 'var(--w40, rgba(255,255,255,0.4))', cursor: 'pointer' }}>x</button>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 14, fontFamily: "'IBM Plex Sans',sans-serif" }}>
          <div style={{ background: 'rgba(251,146,60,0.06)', border: '0.5px solid rgba(251,146,60,0.2)', borderRadius: 8, padding: '10px 14px' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent-strong, #fb923c)', marginBottom: 4 }}>Selected: {sz.label} - {sz.desc}</div>
            <div style={{ fontSize: 11, color: 'var(--w40, rgba(255,255,255,0.4))' }}>{sz.wMm.toFixed(1)} x {sz.hMm.toFixed(1)} mm</div>
          </div>
          {steps.map(s => (
            <div key={s.n} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(251,146,60,0.15)', border: '0.5px solid rgba(251,146,60,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: 'var(--accent-strong, #fb923c)', flexShrink: 0 }}>{s.n}</div>
              <div>
                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary, #e2dfd8)', marginBottom: 2 }}>{s.title}</div>
                <div style={{ fontSize: 11, color: 'var(--w45, rgba(255,255,255,0.45))', lineHeight: 1.5 }}>{s.text}</div>
              </div>
            </div>
          ))}
          <div style={{ background: 'rgba(74,222,128,0.06)', border: '0.5px solid rgba(74,222,128,0.2)', borderRadius: 8, padding: '10px 14px', fontSize: 11, color: 'rgba(74,222,128,0.8)', lineHeight: 1.5 }}>
            Tip: Save as PDF first to verify layout before printing on label stock.
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Shared styles ----------------------------------------------------------

const MONO: React.CSSProperties = { fontFamily: "'IBM Plex Mono', monospace" };
const INP:  React.CSSProperties = { background: 'var(--l04, rgba(255,255,255,0.04))', border: '0.5px solid var(--w10, rgba(255,255,255,0.1))', borderRadius: 7, padding: '7px 10px', fontSize: 12, fontFamily: "'IBM Plex Sans',sans-serif", color: 'var(--text-primary, #e2dfd8)', outline: 'none', width: '100%', boxSizing: 'border-box' as const };
const LBL:  React.CSSProperties = { fontSize: 10, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase' as const, color: 'var(--w35, rgba(255,255,255,0.35))', marginBottom: 5, display: 'block' };
const CHIP  = (active: boolean, color = 'var(--accent-strong, #fb923c)'): React.CSSProperties => ({ fontSize: 10, padding: '3px 9px', borderRadius: 20, border: 'none', cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif", fontWeight: 500, background: active ? `color-mix(in srgb, ${color} 13%, transparent)` : 'var(--l05, rgba(255,255,255,0.05))', color: active ? color : 'var(--w40, rgba(255,255,255,0.4))', outline: active ? `1px solid color-mix(in srgb, ${color} 27%, transparent)` : 'none' });
const SELROW = (active: boolean): React.CSSProperties => ({ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 7px', borderRadius: 6, cursor: 'pointer', background: active ? 'rgba(251,146,60,0.08)' : 'transparent', border: `0.5px solid ${active ? 'rgba(251,146,60,0.2)' : 'transparent'}` });
const LOCROW = (active: boolean): React.CSSProperties => ({ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 7px', borderRadius: 6, cursor: 'pointer', background: active ? 'rgba(96,165,250,0.08)' : 'transparent', border: `0.5px solid ${active ? 'rgba(96,165,250,0.2)' : 'transparent'}` });

// ---- Main Page --------------------------------------------------------------

export default function LabelPrintPage() {
  const [labelType,   setLabelType]   = useState<LabelType>('item');
  const [labelSize,   setLabelSize]   = useState<string>('avery-101x51');
  const [copies,      setCopies]      = useState(1);
  const [unit,        setUnit]        = useState<Unit>('mm');
  const [customW,     setCustomW]     = useState('100');
  const [customH,     setCustomH]     = useState('50');
  const [barcodeMode, setBarcodeMode] = useState<BarcodeMode>('internal');
  const [items,       setItems]       = useState<Item[]>([]);
  const [warehouses,  setWarehouses]  = useState<Warehouse[]>([]);
  const [locations,   setLocations]   = useState<Location[]>([]);
  const [selectedWh,  setSelectedWh]  = useState('');
  const [selItems,    setSelItems]    = useState<Set<string>>(new Set());
  const [selLocs,     setSelLocs]     = useState<Set<string>>(new Set());
  const [searchItem,  setSearchItem]  = useState('');
  const [typeFilter,  setTypeFilter]  = useState('');
  const [searchLoc,   setSearchLoc]   = useState('');
  const [locFilter,   setLocFilter]   = useState<LocFilter>('all');
  const [loading,     setLoading]     = useState(false);
  const [showHelp,    setShowHelp]    = useState(false);

  const sz: SizeConfig = labelSize === 'custom'
    ? { label: 'Custom', wMm: toMm(parseFloat(customW)||100, unit), hMm: toMm(parseFloat(customH)||50, unit), desc: 'Custom size', category: 'Custom' }
    : (SIZES[labelSize] ?? SIZES['avery-101x51']);

  // ---- Load -----------------------------------------------------------------

  useEffect(() => {
    // /items returns an envelope { items, count } (spec-003)
    apiClient.get('/items').then(r => setItems(r.data.items ?? [])).catch(() => {});
    apiClient.get('/warehouses').then(r => setWarehouses(r.data ?? [])).catch(() => {});
  }, []);

  const loadLocations = useCallback(async (whId: string) => {
    if (!whId) { setLocations([]); return; }
    setLoading(true);
    try {
      const flat: Location[] = [];
      const zonesRes = await apiClient.get(`/warehouse-locations/zones/by-warehouse/${whId}`);
      for (const zone of zonesRes.data ?? []) {
        const aislesRes = await apiClient.get(`/warehouse-locations/aisles/by-zone/${zone.id}`);
        for (const aisle of aislesRes.data ?? []) {
          const racksRes = await apiClient.get(`/warehouse-locations/racks/by-aisle/${aisle.id}`);
          for (const rack of racksRes.data ?? []) {
            const levelsRes = await apiClient.get(`/warehouse-locations/levels/by-rack/${rack.id}`);
            for (const level of levelsRes.data ?? []) {
              const binsRes = await apiClient.get(`/warehouse-locations/bins/by-level/${level.id}`);
              const bins = binsRes.data ?? [];
              flat.push({ id: level.id, type: 'level', fullCode: level.fullCode, code: level.code, name: level.name ?? null, zoneName: zone.name, aisleFull: aisle.fullCode, rackFull: rack.fullCode, levelFull: level.fullCode, hasBins: bins.length > 0 });
              for (const bin of bins) {
                flat.push({ id: bin.id, type: 'bin', fullCode: bin.fullCode, code: bin.code, name: bin.name ?? null, subType: bin.binType, zoneName: zone.name, aisleFull: aisle.fullCode, rackFull: rack.fullCode, levelFull: level.fullCode, hasBins: false });
              }
            }
          }
        }
      }
      setLocations(flat);
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { if (selectedWh) { loadLocations(selectedWh); setSelLocs(new Set()); } }, [selectedWh, loadLocations]);

  // ---- Derived --------------------------------------------------------------

  const itemTypes     = [...new Set(items.map(i => i.itemType))].sort();
  const filteredItems = items.filter(i => {
    const q = searchItem.toLowerCase();
    const matchSearch = !q || i.code.toLowerCase().includes(q) || i.name.toLowerCase().includes(q);
    const matchType   = !typeFilter || i.itemType === typeFilter;
    return matchSearch && matchType;
  });
  const filteredLocs = locations.filter(l =>
    (!searchLoc || l.fullCode.toLowerCase().includes(searchLoc.toLowerCase())) &&
    (locFilter === 'all' || l.type === (locFilter === 'bins' ? 'bin' : 'level'))
  );

  const toggle = (set: Set<string>, id: string) => { const n = new Set(set); n.has(id) ? n.delete(id) : n.add(id); return n; };

  const selItemData = items.filter(i => selItems.has(i.id));
  const selLocData  = locations.filter(l => selLocs.has(l.id));
  const itemsToPrint: Item[]     = [];
  const locsToPrint:  Location[] = [];
  for (let c = 0; c < copies; c++) { itemsToPrint.push(...selItemData); locsToPrint.push(...selLocData); }

  const whName      = warehouses.find(w => w.id === selectedWh)?.name ?? '';
  const selCount    = labelType === 'item' ? selItems.size : selLocs.size;
  const totalLabels = selCount * copies;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=IBM+Plex+Sans:wght@400;500;600&display=swap');
        @media print {
          .screen-ui  { display: none !important; }
          .print-only { display: block !important; }
          html, body  { overflow: visible !important; height: auto !important; background: white !important; margin: 0; }
          .print-sheet { display: flex !important; flex-wrap: wrap !important; align-content: flex-start !important; }
          .print-sheet > div { break-inside: avoid !important; page-break-inside: avoid !important; }
          @page { margin: 4mm; size: auto; }
        }
        @media screen { .print-only { display: none !important; } }
      `}</style>

      {/* Screen UI */}
      <div className="screen-ui" style={{ height: '100vh', background: '#06040f', color: 'var(--text-primary, #e2dfd8)', fontFamily: "'IBM Plex Sans',sans-serif", display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '14px 24px', borderBottom: '0.5px solid var(--l07, rgba(255,255,255,0.07))', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <button onClick={() => window.history.back()} style={{ background: 'var(--l05, rgba(255,255,255,0.05))', border: '0.5px solid var(--w10, rgba(255,255,255,0.1))', borderRadius: 7, padding: '6px 12px', fontSize: 12, color: 'var(--w50, rgba(255,255,255,0.5))', cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif" }}>Back</button>
            <div>
              <div style={{ fontSize: 17, fontWeight: 600 }}>Label Printing</div>
              <div style={{ fontSize: 11, color: 'var(--w35, rgba(255,255,255,0.35))', marginTop: 2 }}>Barcoded labels for items and warehouse locations (levels + bins)</div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button onClick={() => setShowHelp(true)} title="How to print labels" style={{ width: 32, height: 32, borderRadius: '50%', background: 'rgba(96,165,250,0.08)', border: '0.5px solid rgba(96,165,250,0.2)', fontSize: 14, fontWeight: 700, color: 'var(--accent-blue, #60a5fa)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>?</button>
            <button onClick={() => window.print()} disabled={selCount === 0} style={{ background: selCount > 0 ? 'linear-gradient(135deg,var(--accent-pressed, #c2410c),var(--accent, #ea580c),var(--accent-mid, #f97316))' : 'var(--l05, rgba(255,255,255,0.05))', border: 'none', borderRadius: 9, padding: '10px 24px', fontSize: 14, fontWeight: 600, color: selCount > 0 ? 'white' : 'var(--w20, rgba(255,255,255,0.2))', cursor: selCount > 0 ? 'pointer' : 'not-allowed', fontFamily: "'IBM Plex Sans',sans-serif" }}>
              Print {totalLabels} Label{totalLabels !== 1 ? 's' : ''}
            </button>
          </div>
        </div>

        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

          {/* ── Left panel ── */}
          <div style={{ width: 300, flexShrink: 0, borderRight: '0.5px solid var(--l07, rgba(255,255,255,0.07))', padding: 14, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 12 }}>

            {/* Label type */}
            <div>
              <label style={LBL}>Type</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['item','location'] as LabelType[]).map(t => (
                  <button key={t} onClick={() => setLabelType(t)} style={{ flex: 1, height: 34, borderRadius: 7, fontSize: 12, fontWeight: 500, border: 'none', cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif", background: labelType === t ? 'rgba(251,146,60,0.15)' : 'var(--l05, rgba(255,255,255,0.05))', color: labelType === t ? 'var(--accent-strong, #fb923c)' : 'var(--w40, rgba(255,255,255,0.4))', outline: labelType === t ? '1px solid rgba(251,146,60,0.3)' : 'none' }}>
                    {t === 'item' ? 'Items' : 'Locations'}
                  </button>
                ))}
              </div>
            </div>

            {/* Barcode mode — items only */}
            {labelType === 'item' && (
              <div>
                <label style={LBL}>Barcode to print</label>
                <div style={{ display: 'flex', gap: 4 }}>
                  {(['internal','external','both'] as BarcodeMode[]).map(m => (
                    <button key={m} onClick={() => setBarcodeMode(m)} style={{ flex: 1, height: 30, borderRadius: 6, fontSize: 11, fontWeight: 500, border: 'none', cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif", textTransform: 'capitalize' as const, background: barcodeMode === m ? 'rgba(96,165,250,0.15)' : 'var(--l05, rgba(255,255,255,0.05))', color: barcodeMode === m ? 'var(--accent-blue, #60a5fa)' : 'var(--w40, rgba(255,255,255,0.4))', outline: barcodeMode === m ? '1px solid rgba(96,165,250,0.3)' : 'none' }}>
                      {m}
                    </button>
                  ))}
                </div>
                <div style={{ fontSize: 9, color: 'var(--w25, rgba(255,255,255,0.25))', marginTop: 4, lineHeight: 1.4 }}>
                  {barcodeMode === 'internal' && 'Internal barcode only (auto-generated from item code)'}
                  {barcodeMode === 'external' && 'External barcode only (EAN-13, UPC, supplier code)'}
                  {barcodeMode === 'both' && 'Both barcodes — INT + EXT. Best for larger label sizes.'}
                </div>
              </div>
            )}

            {/* Unit */}
            <div>
              <label style={LBL}>Display Unit</label>
              <div style={{ display: 'flex', gap: 4 }}>
                {(['mm','cm','in'] as Unit[]).map(u => (
                  <button key={u} onClick={() => setUnit(u)} style={{ flex: 1, height: 28, borderRadius: 6, fontSize: 11, fontWeight: 500, border: 'none', cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif", background: unit === u ? 'rgba(251,146,60,0.15)' : 'var(--l05, rgba(255,255,255,0.05))', color: unit === u ? 'var(--accent-strong, #fb923c)' : 'var(--w40, rgba(255,255,255,0.4))', outline: unit === u ? '1px solid rgba(251,146,60,0.3)' : 'none', textTransform: 'uppercase' as const }}>
                    {u}
                  </button>
                ))}
              </div>
            </div>

            {/* Size */}
            <div>
              <label style={LBL}>Label Size</label>
              <select style={{ ...INP, cursor: 'pointer' }} value={labelSize} onChange={e => setLabelSize(e.target.value)}>
                {Object.entries(Object.entries(SIZES).reduce((acc,[k,v]) => { if (!acc[v.category]) acc[v.category]=[]; acc[v.category].push([k,v]); return acc; }, {} as Record<string,[string,SizeConfig][]>)).map(([cat,entries]) => (
                  <optgroup key={cat} label={cat}>
                    {entries.map(([k,v]) => <option key={k} value={k}>{v.label} ({fromMm(v.wMm,unit)} x {fromMm(v.hMm,unit)} {unit}) - {v.desc}</option>)}
                  </optgroup>
                ))}
              </select>
              {labelSize !== 'custom' && <div style={{ fontSize: 10, color: 'var(--w30, rgba(255,255,255,0.3))', marginTop: 4, fontFamily: "'IBM Plex Mono',monospace" }}>{fromMm(sz.wMm,unit)} x {fromMm(sz.hMm,unit)} {unit}</div>}
            </div>

            {/* Custom dimensions */}
            {labelSize === 'custom' && (
              <div>
                <label style={LBL}>Custom Dimensions ({unit})</label>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <input style={{ ...INP, width: '45%' }} type="number" min="10" step="0.1" placeholder={`W (${unit})`} value={customW} onChange={e => setCustomW(e.target.value)} />
                  <span style={{ color: 'var(--w30, rgba(255,255,255,0.3))', fontSize: 14 }}>x</span>
                  <input style={{ ...INP, width: '45%' }} type="number" min="10" step="0.1" placeholder={`H (${unit})`} value={customH} onChange={e => setCustomH(e.target.value)} />
                </div>
                <div style={{ fontSize: 10, color: 'var(--w30, rgba(255,255,255,0.3))', marginTop: 4, fontFamily: "'IBM Plex Mono',monospace" }}>= {toMm(parseFloat(customW)||0,unit).toFixed(1)} x {toMm(parseFloat(customH)||0,unit).toFixed(1)} mm</div>
              </div>
            )}

            {/* Copies */}
            <div>
              <label style={LBL}>Copies per label</label>
              <input style={INP} type="number" min={1} value={copies} onChange={e => setCopies(Math.max(1, parseInt(e.target.value)||1))} />
            </div>

            {/* ══ ITEM SELECTOR ══ */}
            {labelType === 'item' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>

                {/* Type filter chips */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  <button onClick={() => setTypeFilter('')} style={CHIP(typeFilter === '')}>All</button>
                  {itemTypes.map(t => (
                    <button key={t} onClick={() => setTypeFilter(typeFilter === t ? '' : t)} style={CHIP(typeFilter === t)}>
                      {t.replace('_',' ')} ({items.filter(i => i.itemType === t).length})
                    </button>
                  ))}
                </div>

                {/* Search */}
                <input style={INP} placeholder="Search by code or name..." value={searchItem} onChange={e => setSearchItem(e.target.value)} />

                {/* Bulk selection row */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 10, color: 'var(--w30, rgba(255,255,255,0.3))' }}>{selItems.size} selected · {filteredItems.length} shown</span>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button onClick={() => setSelItems(s => new Set([...s, ...filteredItems.map(i => i.id)]))} style={{ fontSize: 10, color: 'var(--accent-strong, #fb923c)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif" }}>+ Shown</button>
                    <button onClick={() => setSelItems(new Set(items.map(i => i.id)))} style={{ fontSize: 10, color: 'var(--accent-strong, #fb923c)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif" }}>All</button>
                    <button onClick={() => setSelItems(new Set())} style={{ fontSize: 10, color: 'var(--w35, rgba(255,255,255,0.35))', background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif" }}>None</button>
                  </div>
                </div>

                {/* Item list */}
                <div style={{ flex: 1, maxHeight: 260, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                  {filteredItems.map(item => (
                    <label key={item.id} style={SELROW(selItems.has(item.id))}>
                      <input type="checkbox" checked={selItems.has(item.id)} onChange={() => setSelItems(toggle(selItems, item.id))} style={{ accentColor: 'var(--accent-strong, #fb923c)' }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                          <span style={{ ...MONO, fontSize: 11, color: 'var(--accent-strong, #fb923c)' }}>{item.code}</span>
                          {item.barcodeExternal && (
                            <span style={{ fontSize: 8, padding: '1px 4px', borderRadius: 8, background: 'rgba(96,165,250,0.1)', color: 'var(--accent-blue, #60a5fa)', fontFamily: "'IBM Plex Sans',sans-serif" }}>EXT</span>
                          )}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--w40, rgba(255,255,255,0.4))', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {/* ══ LOCATION SELECTOR ══ */}
            {labelType === 'location' && (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>

                {/* Warehouse */}
                <div>
                  <label style={LBL}>Warehouse</label>
                  <select style={{ ...INP, cursor: 'pointer' }} value={selectedWh} onChange={e => setSelectedWh(e.target.value)}>
                    <option value="">Select warehouse...</option>
                    {warehouses.map(w => <option key={w.id} value={w.id}>{w.code} - {w.name}</option>)}
                  </select>
                </div>

                {selectedWh && (
                  <>
                    {/* Level/bin filter */}
                    <div style={{ display: 'flex', gap: 4 }}>
                      {(['all','levels','bins'] as LocFilter[]).map(f => (
                        <button key={f} onClick={() => setLocFilter(f)} style={{ flex: 1, height: 28, borderRadius: 6, fontSize: 10, fontWeight: 500, border: 'none', cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif", background: locFilter === f ? 'rgba(96,165,250,0.15)' : 'var(--l05, rgba(255,255,255,0.05))', color: locFilter === f ? 'var(--accent-blue, #60a5fa)' : 'var(--w40, rgba(255,255,255,0.4))', outline: locFilter === f ? '1px solid rgba(96,165,250,0.3)' : 'none', textTransform: 'capitalize' as const }}>
                          {f}
                        </button>
                      ))}
                    </div>

                    {/* Search */}
                    <input style={INP} placeholder="Search location code..." value={searchLoc} onChange={e => setSearchLoc(e.target.value)} />

                    {/* Bulk selection row */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 10, color: 'var(--w30, rgba(255,255,255,0.3))' }}>
                        {selLocs.size} sel · L({locations.filter(l=>l.type==='level').length}) B({locations.filter(l=>l.type==='bin').length})
                      </span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => setSelLocs(s => new Set([...s, ...filteredLocs.map(l => l.id)]))} style={{ fontSize: 10, color: 'var(--accent-blue, #60a5fa)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif" }}>+ Shown</button>
                        <button onClick={() => setSelLocs(new Set(locations.map(l => l.id)))} style={{ fontSize: 10, color: 'var(--accent-blue, #60a5fa)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif" }}>All</button>
                        <button onClick={() => setSelLocs(new Set())} style={{ fontSize: 10, color: 'var(--w35, rgba(255,255,255,0.35))', background: 'none', border: 'none', cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif" }}>None</button>
                      </div>
                    </div>

                    {/* Location list */}
                    <div style={{ flex: 1, maxHeight: 300, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 2 }}>
                      {loading ? (
                        <div style={{ fontSize: 12, color: 'var(--w30, rgba(255,255,255,0.3))', padding: 12, textAlign: 'center' }}>Loading...</div>
                      ) : filteredLocs.length === 0 ? (
                        <div style={{ fontSize: 12, color: 'var(--w30, rgba(255,255,255,0.3))', padding: 12, textAlign: 'center' }}>No locations found.</div>
                      ) : filteredLocs.map(loc => (
                        <label key={loc.id} style={LOCROW(selLocs.has(loc.id))}>
                          <input type="checkbox" checked={selLocs.has(loc.id)} onChange={() => setSelLocs(toggle(selLocs, loc.id))} style={{ accentColor: 'var(--accent-blue, #60a5fa)' }} />
                          <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ ...MONO, fontSize: 11, color: loc.type === 'bin' ? 'var(--text-primary, #e2dfd8)' : 'var(--accent-blue, #60a5fa)' }}>{loc.fullCode}</span>
                            <span style={{ fontSize: 9, padding: '1px 5px', borderRadius: 10, background: loc.type === 'bin' ? 'var(--l07, rgba(255,255,255,0.07))' : 'rgba(96,165,250,0.1)', color: loc.type === 'bin' ? 'var(--w40, rgba(255,255,255,0.4))' : 'var(--accent-blue, #60a5fa)', fontFamily: "'IBM Plex Sans',sans-serif" }}>{loc.type}</span>
                          </div>
                        </label>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* ── Right: preview ── */}
          <div style={{ flex: 1, padding: 16, overflowY: 'auto' }}>
            <div style={{ fontSize: 11, color: 'var(--w30, rgba(255,255,255,0.3))', marginBottom: 12, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
              Preview - {sz.label} ({sz.desc})
              {labelType === 'item' && <span style={{ marginLeft: 8, color: 'var(--accent-blue, #60a5fa)' }}>Barcode: {barcodeMode}</span>}
              {copies > 1 && <span style={{ marginLeft: 8, color: 'var(--accent-strong, #fb923c)' }}>x{copies} copies</span>}
            </div>
            {selCount === 0 ? (
              <div style={{ textAlign: 'center', color: 'var(--w20, rgba(255,255,255,0.2))', padding: 60, fontSize: 14 }}>
                Select {labelType === 'item' ? 'items' : 'locations'} on the left to preview labels
              </div>
            ) : (
              <div style={{ border: '1px dashed var(--w12, rgba(255,255,255,0.12))', borderRadius: 8, overflow: 'auto', background: '#e5e5e5', padding: 8 }}>
                <PrintSheet sz={sz}>
                  {labelType === 'item'
                    ? itemsToPrint.map((item,i) => <ItemLabel key={`${item.id}-${i}`} item={item} sz={sz} barcodeMode={barcodeMode} />)
                    : locsToPrint.map((loc,i)   => <LocationLabel key={`${loc.id}-${i}`} loc={loc} sz={sz} whName={whName} />)
                  }
                </PrintSheet>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Help Modal */}
      {showHelp && <HelpModal sz={sz} onClose={() => setShowHelp(false)} />}

      {/* Print-only output */}
      <div className="print-only">
        <PrintSheet sz={sz}>
          {labelType === 'item'
            ? itemsToPrint.map((item,i) => <ItemLabel key={`${item.id}-${i}`} item={item} sz={sz} barcodeMode={barcodeMode} />)
            : locsToPrint.map((loc,i)   => <LocationLabel key={`${loc.id}-${i}`} loc={loc} sz={sz} whName={whName} />)
          }
        </PrintSheet>
      </div>
    </>
  );
}