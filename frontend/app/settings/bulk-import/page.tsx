"use client";

import * as XLSX from 'xlsx';
import { useState, useRef, useCallback } from 'react';
import ERPShell from '@/components/layout/ERPShell';
import apiClient from '@/lib/api/client';

type Entity = 'items' | 'customers' | 'suppliers' | 'warehouses' | 'work-centers' | 'accounts' | 'sales-orders' | 'purchase-orders' | 'budget-lines' | 'fiscal-periods' | 'boms' | 'bom-routings';
type Channel = 'file' | 'url' | 'api';
type Mode    = 'import' | 'export';

interface ImportError  { row: number; field: string; message: string }
interface ImportResult {
  entity: string; total: number; valid: number;
  inserted: number; updated: number; skipped: number;
  errors: ImportError[]; dryRun: boolean; upsert: boolean;
}

const ENTITIES: {
  value: Entity; label: string; color: string;
  requiredFields: string[]; optionalFields: string[];
  sampleRow: Record<string, string>;
  exportEndpoint: string;
}[] = [
  {
    value: 'items', label: 'Items', color: '#fb923c',
    requiredFields: ['code', 'name', 'itemType', 'baseUom'],
    optionalFields:  ['description', 'standardCost', 'leadTimeDays', 'safetyStock', 'reorderPoint', 'reorderQuantity', 'valuationMethod', 'isStockable', 'isPurchasable', 'isSaleable', 'isManufacturable'],
    sampleRow: { code:'ITM001', name:'Burger Patty 4oz', itemType:'raw_material', baseUom:'KG', description:'Fresh beef patty', standardCost:'2.50', leadTimeDays:'3', isStockable:'true', isPurchasable:'true', isSaleable:'false', isManufacturable:'false', valuationMethod:'average', safetyStock:'100', reorderPoint:'50', reorderQuantity:'500' },
    exportEndpoint: '/items',
  },
  {
    value: 'customers', label: 'Customers', color: '#60a5fa',
    requiredFields: ['code', 'name'],
    optionalFields:  ['legalName', 'taxId', 'phone', 'email', 'website', 'creditLimit', 'paymentTerms', 'currency', 'notes'],
    sampleRow: { code:'CUST001', name:'Acme Restaurants', legalName:'Acme Corp LLC', taxId:'123-456-789', phone:'+1-555-0100', email:'orders@acme.com', website:'www.acme.com', creditLimit:'50000', paymentTerms:'NET30', currency:'USD', notes:'Key account' },
    exportEndpoint: '/customers',
  },
  {
    value: 'suppliers', label: 'Suppliers', color: '#4ade80',
    requiredFields: ['code', 'name'],
    optionalFields:  ['legalName', 'taxId', 'phone', 'email', 'website', 'paymentTerms', 'currency', 'creditLimit', 'category', 'notes'],
    sampleRow: { code:'SUP001', name:'Best Foods Inc', legalName:'Best Foods LLC', taxId:'987-654-321', phone:'+1-555-0200', email:'sales@bestfoods.com', paymentTerms:'NET15', currency:'USD', creditLimit:'100000', category:'Food Supplier', notes:'Primary supplier' },
    exportEndpoint: '/suppliers',
  },
  {
    value: 'warehouses', label: 'Warehouses', color: '#a78bfa',
    requiredFields: ['code', 'name'],
    optionalFields:  ['warehouseType', 'address'],
    sampleRow: { code:'WH001', name:'Main Warehouse', warehouseType:'regular', address:'123 Industrial Ave, Miami FL' },
    exportEndpoint: '/warehouses',
  },
  {
    value: 'work-centers', label: 'Work Centers', color: '#fbbf24',
    requiredFields: ['code', 'name', 'workCenterType'],
    optionalFields:  ['capacityPerHour', 'efficiencyPercent', 'costPerHour'],
    sampleRow: { code:'WC001', name:'Kitchen Assembly Line', workCenterType:'assembly', capacityPerHour:'500', efficiencyPercent:'95', costPerHour:'25' },
    exportEndpoint: '/work-centers',
  },
  {
    value: 'accounts', label: 'Chart of Accounts', color: '#f87171',
    requiredFields: ['accountNumber', 'name', 'accountType'],
    optionalFields:  ['accountCategory', 'currency', 'isSystem', 'allowManualPosting', 'requireReconciliation'],
    sampleRow: { accountNumber:'1.1.01', name:'Cash and Equivalents', accountType:'asset', accountCategory:'Current Assets', currency:'USD', isSystem:'false', allowManualPosting:'true', requireReconciliation:'false' },
    exportEndpoint: '/chart-of-accounts',
  },
  {
    value: 'sales-orders', label: 'Sales Orders', color: '#34d399',
    requiredFields: ['customerCode', 'orderDate', 'itemCode', 'qty', 'unitPrice'],
    optionalFields:  ['currency', 'paymentTerms', 'promisedDate', 'uom', 'discount', 'notes'],
    sampleRow: { customerCode:'CUST001', orderDate:'2026-03-25', currency:'USD', paymentTerms:'NET30', promisedDate:'2026-04-15', itemCode:'FG-BURG', qty:'500', unitPrice:'8.50', uom:'PCS', discount:'0', notes:'Bulk order' },
    exportEndpoint: '/sales-orders',
  },
  {
    value: 'purchase-orders', label: 'Purchase Orders', color: '#818cf8',
    requiredFields: ['supplierCode', 'poDate', 'itemCode', 'qty', 'unitPrice'],
    optionalFields:  ['currency', 'paymentTerms', 'expectedDate', 'uom', 'discount', 'notes'],
    sampleRow: { supplierCode:'SUP001', poDate:'2026-03-25', currency:'USD', paymentTerms:'NET30', expectedDate:'2026-04-01', itemCode:'RM-BEEF', qty:'1000', unitPrice:'3.50', uom:'KG', discount:'0', notes:'' },
    exportEndpoint: '/purchase-orders',
  },
  {
    value: 'budget-lines', label: 'Budget Lines', color: '#fb7185',
    requiredFields: ['budgetCode', 'accountNumber', 'fiscalPeriod', 'amount'],
    optionalFields:  ['notes'],
    sampleRow: { budgetCode:'BUDGET-2026', accountNumber:'4.1.01', fiscalPeriod:'2026-01', amount:'500000', notes:'Q1 Revenue target' },
    exportEndpoint: '/budgets',
  },
  {
    value: 'fiscal-periods', label: 'Fiscal Periods', color: '#38bdf8',
    requiredFields: ['periodCode', 'periodName', 'startDate', 'endDate', 'fiscalYear'],
    optionalFields:  ['fiscalQuarter', 'status', 'isCurrent'],
    sampleRow: { periodCode:'2025-01', periodName:'January 2025', startDate:'2025-01-01', endDate:'2025-01-31', fiscalYear:'2025', fiscalQuarter:'Q1', status:'open', isCurrent:'false' },
    exportEndpoint: '/fiscal-periods',
  },
  {
    value: 'boms', label: 'BOMs', color: '#e879f9',
    requiredFields: ['bomNumber', 'parentItemCode', 'componentCode', 'quantityPer'],
    optionalFields:  ['uom', 'scrapPercent', 'version', 'isActive'],
    sampleRow: { bomNumber:'BOM-PROD-001', parentItemCode:'FG-001', componentCode:'RM-001', quantityPer:'2.5', uom:'KG', scrapPercent:'2', version:'1', isActive:'true' },
    exportEndpoint: '/bom',
  },
  {
    value: 'bom-routings', label: 'BOM Routings', color: '#fb923c',
    requiredFields: ['bomNumber', 'stepNumber', 'workCenterCode'],
    optionalFields:  ['description', 'setupTime', 'runTimePerUnit', 'notes'],
    sampleRow: { bomNumber:'BOM-PROD-001', stepNumber:'10', workCenterCode:'WC-CUT', description:'Cutting operation', setupTime:'0.5', runTimePerUnit:'0.002', notes:'' },
    exportEndpoint: '/bom',
  },
];

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
  const wb = XLSX.read(buffer, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, any>>(ws, { defval: '' });
}

const MONO: React.CSSProperties = { fontFamily: "'IBM Plex Mono',monospace", fontSize: 12 };
const INPUT: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.1)',
  borderRadius: 7, padding: '9px 12px', fontSize: 13,
  fontFamily: "'IBM Plex Sans',sans-serif", color: '#f1ede8', outline: 'none', width: '100%',
};
const LABEL: React.CSSProperties = {
  fontSize: 11, fontWeight: 500, letterSpacing: '0.08em',
  textTransform: 'uppercase', color: 'rgba(251,146,60,0.6)',
  fontFamily: "'IBM Plex Sans',sans-serif",
};

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
  const [exportBusy,  setExportBusy]  = useState(false);
  const [result,      setResult]      = useState<ImportResult | null>(null);
  const [parseError,  setParseError]  = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const entityCfg = ENTITIES.find(e => e.value === entity)!;

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
      const res = await apiClient.get(entityCfg.exportEndpoint);
      const data: Record<string, any>[] = Array.isArray(res.data) ? res.data : [];
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
    setFileName(file.name); setParseError(''); setResult(null); setRecords([]);
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

  const handleRun = async () => {
    setBusy(true); setResult(null); setParseError('');
    try {
      let body: any = { dryRun, upsert };
      if (channel === 'file') {
        if (records.length === 0) { setParseError('No records loaded. Upload a file first.'); setBusy(false); return; }
        body.records = records;
      } else if (channel === 'url') {
        if (!sourceUrl.trim()) { setParseError('Source URL is required.'); setBusy(false); return; }
        body.sourceUrl = sourceUrl; body.sourceToken = sourceToken || undefined;
      } else {
        if (records.length > 0) body.records    = records;
        if (sourceUrl.trim())   body.sourceUrl  = sourceUrl;
        if (sourceToken.trim()) body.sourceToken = sourceToken;
        if (!body.records && !body.sourceUrl) { setParseError('Provide records or a source URL.'); setBusy(false); return; }
      }
      const res = await apiClient.post(`/bulk-import/${entity}`, body);
      setResult(res.data);
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
        .bi-entity-grid { display:flex; gap:8px; flex-wrap:wrap; }
        .bi-entity-btn { padding:6px 14px; border-radius:7px; font-size:12px; font-family:'IBM Plex Sans',sans-serif; cursor:pointer; transition:all 0.15s; font-weight:500; }
        .bi-channel-tabs { display:flex; gap:0; background:rgba(255,255,255,0.04); border-radius:7px; border:0.5px solid rgba(255,255,255,0.08); overflow:hidden; margin-bottom:14px; width:fit-content; }
        .bi-channel-tab { padding:7px 16px; font-size:12px; font-family:'IBM Plex Sans',sans-serif; cursor:pointer; border:none; transition:all 0.15s; white-space:nowrap; }
        .bi-drop { border:1.5px dashed rgba(255,255,255,0.12); border-radius:8px; padding:28px; text-align:center; cursor:pointer; transition:all 0.15s; }
        .bi-drop:hover { border-color:rgba(251,146,60,0.3); background:rgba(251,146,60,0.02); }
        .bi-result-row { display:grid; grid-template-columns:repeat(5,1fr); gap:10px; margin-bottom:14px; }
        .bi-result-stat { background:rgba(255,255,255,0.03); border-radius:7px; padding:8px 12px; }
        .bi-error-table { width:100%; border-collapse:collapse; font-size:12px; }
        .bi-error-table th { padding:5px 10px; font-size:10px; color:rgba(248,113,113,0.6); font-weight:500; text-transform:uppercase; letter-spacing:0.08em; text-align:left; border-bottom:0.5px solid rgba(255,255,255,0.06); }
        .bi-error-table td { padding:6px 10px; border-bottom:0.5px solid rgba(255,255,255,0.04); }
        .bi-preview { background:rgba(255,255,255,0.02); border:0.5px solid rgba(255,255,255,0.07); border-radius:7px; padding:10px 14px; }
        .bi-format-badge { display:inline-flex; align-items:center; gap:5px; padding:2px 8px; border-radius:4px; font-size:10px; font-weight:500; text-transform:uppercase; letter-spacing:0.08em; }
        .bi-export-card { display:flex; flex-direction:column; gap:14px; }
        .bi-export-action { display:flex; align-items:center; justify-content:space-between; padding:14px 16px; background:rgba(255,255,255,0.03); border:0.5px solid rgba(255,255,255,0.08); border-radius:8px; gap:16px; flex-wrap:wrap; }
        .bi-opts { display:flex; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:12px; }
        .bi-opt-btn { padding:6px 14px; border-radius:7px; font-size:12px; cursor:pointer; font-family:'IBM Plex Sans',sans-serif; font-weight:500; transition:all 0.15s; }
      `}</style>

      <div className="bi-page">

        <div className="bi-mode-tabs">
          {([
            { value: 'import' as Mode, label: 'Import' },
            { value: 'export' as Mode, label: 'Export & Templates' },
          ]).map(m => (
            <button key={m.value} className="bi-mode-tab"
              onClick={() => { setMode(m.value); setResult(null); setParseError(''); }}
              style={{ background: mode === m.value ? 'rgba(251,146,60,0.12)' : 'transparent', color: mode === m.value ? '#fb923c' : 'rgba(255,255,255,0.4)' }}>
              {m.label}
            </button>
          ))}
        </div>

        {/* Entity selector — shared */}
        <div className="bi-card">
          <div className="bi-section-title">{mode === 'import' ? '1. Select Entity' : 'Select Entity'}</div>
          <div className="bi-entity-grid">
            {ENTITIES.map(e => (
              <button key={e.value} className="bi-entity-btn"
                onClick={() => { setEntity(e.value); setResult(null); setRecords([]); setFileName(''); setParseError(''); }}
                style={{ color: entity === e.value ? e.color : 'rgba(255,255,255,0.4)', background: entity === e.value ? `${e.color}15` : 'rgba(255,255,255,0.04)', border: `0.5px solid ${entity === e.value ? `${e.color}40` : 'rgba(255,255,255,0.08)'}` }}>
                {e.label}
              </button>
            ))}
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
            <div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>Required fields</div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {entityCfg.requiredFields.map(f => (
                  <span key={f} style={{ ...MONO, fontSize: 11, padding: '2px 7px', borderRadius: 4, background: `${entityCfg.color}15`, color: entityCfg.color, border: `0.5px solid ${entityCfg.color}30` }}>{f}</span>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 5 }}>Optional fields</div>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {entityCfg.optionalFields.map(f => (
                  <span key={f} style={{ ...MONO, fontSize: 11, padding: '2px 7px', borderRadius: 4, background: 'rgba(255,255,255,0.04)', color: 'rgba(255,255,255,0.4)', border: '0.5px solid rgba(255,255,255,0.08)' }}>{f}</span>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── IMPORT MODE ────────────────────────────────────────────────── */}
        {mode === 'import' && (
          <>
            {/* Data Source */}
            <div className="bi-card">
              <div className="bi-section-title">2. Data Source</div>
              <div className="bi-channel-tabs">
                {([
                  { value: 'file' as Channel, label: 'Upload File' },
                  { value: 'url'  as Channel, label: 'Fetch from URL' },
                  { value: 'api'  as Channel, label: 'API Reference' },
                ]).map(c => (
                  <button key={c.value} className="bi-channel-tab"
                    onClick={() => { setChannel(c.value); setResult(null); setParseError(''); }}
                    style={{ background: channel === c.value ? 'rgba(251,146,60,0.12)' : 'transparent', color: channel === c.value ? '#fb923c' : 'rgba(255,255,255,0.4)' }}>
                    {c.label}
                  </button>
                ))}
              </div>

              {channel === 'file' && (
                <>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {[{ label: 'CSV', color: '#4ade80' }, { label: 'Excel .xlsx', color: '#60a5fa' }, { label: 'Excel .xls', color: '#60a5fa' }].map(f => (
                        <span key={f.label} className="bi-format-badge" style={{ background: `${f.color}15`, color: f.color, border: `0.5px solid ${f.color}30` }}>{f.label}</span>
                      ))}
                    </div>
                    <button onClick={downloadTemplate} style={{ padding: '5px 12px', borderRadius: 6, fontSize: 11, cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif", fontWeight: 500, color: '#60a5fa', background: 'rgba(96,165,250,0.1)', border: '0.5px solid rgba(96,165,250,0.2)' }}>
                      Download Template
                    </button>
                  </div>
                  <div className="bi-drop" onClick={() => fileRef.current?.click()}>
                    <input ref={fileRef} type="file" accept=".csv,.xlsx,.xls" style={{ display: 'none' }} onChange={handleFile} onClick={e => { (e.target as HTMLInputElement).value = ''; }} />
                    {fileName ? (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'center', marginBottom: 4 }}>
                          <span style={{ fontSize: 13, color: '#4ade80', fontWeight: 500 }}>{fileName}</span>
                          {fileTypeLabel && (
                            <span className="bi-format-badge" style={{ background: fileTypeLabel === 'Excel' ? 'rgba(96,165,250,0.15)' : 'rgba(74,222,128,0.15)', color: fileTypeLabel === 'Excel' ? '#60a5fa' : '#4ade80', border: `0.5px solid ${fileTypeLabel === 'Excel' ? 'rgba(96,165,250,0.3)' : 'rgba(74,222,128,0.3)'}` }}>{fileTypeLabel}</span>
                          )}
                        </div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>{records.length} rows loaded — click to replace</div>
                      </div>
                    ) : (
                      <div>
                        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>Click to upload CSV or Excel file</div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>Accepts .csv, .xlsx, .xls — max 2,000 rows</div>
                      </div>
                    )}
                  </div>
                  {records.length > 0 && (
                    <div style={{ marginTop: 14 }}>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Preview — first {Math.min(5, records.length)} of {records.length} rows</div>
                      <div style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                          <thead>
                            <tr>{Object.keys(records[0]).map(h => (
                              <th key={h} style={{ padding: '4px 10px', fontSize: 10, color: entityCfg.color, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'left', borderBottom: '0.5px solid rgba(255,255,255,0.06)', whiteSpace: 'nowrap' }}>{h}</th>
                            ))}</tr>
                          </thead>
                          <tbody>
                            {records.slice(0, 5).map((row, i) => (
                              <tr key={i}>{Object.values(row).map((val, j) => (
                                <td key={j} style={{ padding: '5px 10px', borderBottom: '0.5px solid rgba(255,255,255,0.04)', ...MONO, color: 'rgba(255,255,255,0.6)', whiteSpace: 'nowrap' }}>{String(val)}</td>
                              ))}</tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </>
              )}

              {channel === 'url' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label style={LABEL}>Source URL *</label>
                    <input style={INPUT} placeholder="https://my-old-system.com/api/export/items" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} />
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label style={LABEL}>Auth Token (optional)</label>
                    <input style={INPUT} placeholder="Bearer eyJ... or plain token" value={sourceToken} onChange={e => setSourceToken(e.target.value)} />
                  </div>
                  <div style={{ background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.06)', borderRadius: 7, padding: '8px 12px', fontSize: 11, color: 'rgba(255,255,255,0.35)', lineHeight: 1.7 }}>
                    The URL must return a JSON array in Sunset ERP format. The server fetches and imports directly.
                  </div>
                </div>
              )}

              {channel === 'api' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div style={{ background: 'rgba(255,255,255,0.03)', border: '0.5px solid rgba(255,255,255,0.06)', borderRadius: 7, padding: '12px 16px' }}>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Endpoint</div>
                    <div style={{ ...MONO, fontSize: 13, color: '#4ade80', marginBottom: 12 }}>POST /api/bulk-import/{entity}</div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Option A — Direct payload</div>
                    <div className="bi-preview" style={{ marginBottom: 12 }}>
                      <pre style={{ ...MONO, fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7 }}>{`{
  "dryRun": true,
  "upsert": false,
  "records": [
    { ${entityCfg.requiredFields.map(f => `"${f}": "..."`).join(', ')} }
  ]
}`}</pre>
                    </div>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 6 }}>Option B — Pull from external URL</div>
                    <div className="bi-preview">
                      <pre style={{ ...MONO, fontSize: 11, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7 }}>{`{
  "dryRun": true,
  "upsert": true,
  "sourceUrl": "https://old-system.com/api/items",
  "sourceToken": "Bearer eyJ..."
}`}</pre>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    <label style={LABEL}>Pull from URL (test here)</label>
                    <input style={INPUT} placeholder="https://my-old-system.com/api/export/items" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} />
                  </div>
                  {sourceUrl && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                      <label style={LABEL}>Auth Token (optional)</label>
                      <input style={INPUT} placeholder="Bearer eyJ..." value={sourceToken} onChange={e => setSourceToken(e.target.value)} />
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Options + Run */}
            <div className="bi-card">
              <div className="bi-section-title">3. Options</div>
              <div className="bi-opts">
                {/* Dry Run toggle */}
                <button className="bi-opt-btn" onClick={() => setDryRun(v => !v)}
                  style={{ color: dryRun ? '#fbbf24' : '#4ade80', background: dryRun ? 'rgba(251,191,36,0.1)' : 'rgba(74,222,128,0.1)', border: `0.5px solid ${dryRun ? 'rgba(251,191,36,0.25)' : 'rgba(74,222,128,0.25)'}` }}>
                  {dryRun ? 'Dry Run — validate only' : 'Live Run — apply changes'}
                </button>

                {/* Upsert toggle */}
                <button className="bi-opt-btn" onClick={() => setUpsert(v => !v)}
                  style={{ color: upsert ? '#a78bfa' : 'rgba(255,255,255,0.4)', background: upsert ? 'rgba(167,139,250,0.1)' : 'rgba(255,255,255,0.04)', border: `0.5px solid ${upsert ? 'rgba(167,139,250,0.25)' : 'rgba(255,255,255,0.08)'}` }}>
                  {upsert ? 'Upsert — update if exists' : 'Skip — ignore duplicates'}
                </button>

                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', flex: 1 }}>
                  {dryRun
                    ? 'No changes applied — validates data only.'
                    : upsert
                    ? 'New records inserted. Existing records updated with new values.'
                    : 'New records inserted. Existing records skipped.'}
                </span>

                <button onClick={handleRun} disabled={busy || !canRun}
                  style={{ padding: '7px 22px', borderRadius: 7, fontSize: 13, fontWeight: 500, cursor: canRun && !busy ? 'pointer' : 'not-allowed', fontFamily: "'IBM Plex Sans',sans-serif", color: 'white', background: dryRun ? 'linear-gradient(135deg,#92400e,#d97706,#fbbf24)' : upsert ? 'linear-gradient(135deg,#4c1d95,#6d28d9,#7c3aed)' : 'linear-gradient(135deg,#14532d,#16a34a,#22c55e)', border: 'none', opacity: busy || !canRun ? 0.5 : 1, whiteSpace: 'nowrap', boxShadow: busy || !canRun ? 'none' : '0 3px 12px rgba(0,0,0,0.3)' }}>
                  {busy ? 'Running...' : dryRun ? 'Validate' : upsert ? `Upsert ${entityCfg.label}` : `Import ${entityCfg.label}`}
                </button>
              </div>
              {parseError && (
                <div style={{ background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.2)', borderRadius: 7, padding: '8px 12px', fontSize: 12, color: '#fca5a5' }}>{parseError}</div>
              )}
            </div>

            {/* Result */}
            {result && (
              <div className="bi-card">
                <div className="bi-section-title">
                  Result — {result.dryRun ? 'Dry Run' : result.upsert ? 'Upsert' : 'Import'}
                </div>
                <div className="bi-result-row">
                  {[
                    { label: 'Total',    value: result.total,    color: '#e2dfd8' },
                    { label: 'Valid',    value: result.valid,    color: '#4ade80' },
                    { label: result.dryRun ? 'Would Insert' : 'Inserted', value: result.dryRun ? result.valid - result.skipped - (result.updated ?? 0) : result.inserted, color: '#4ade80' },
                    { label: result.dryRun ? 'Would Update' : 'Updated',  value: result.dryRun ? (result.upsert ? result.skipped : 0) : (result.updated ?? 0), color: '#a78bfa' },
                    { label: 'Skipped', value: result.dryRun ? 0 : result.skipped, color: '#fbbf24' },
                  ].map(s => (
                    <div key={s.label} className="bi-result-stat">
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{s.label}</div>
                      <div style={{ ...MONO, fontSize: 22, fontWeight: 500, color: s.color }}>{s.value}</div>
                    </div>
                  ))}
                </div>
                {result.errors.length > 0 ? (
                  <>
                    <div style={{ fontSize: 10, color: 'rgba(248,113,113,0.6)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>
                      {result.errors.length} validation error{result.errors.length !== 1 ? 's' : ''}
                    </div>
                    <div style={{ maxHeight: 240, overflowY: 'auto', border: '0.5px solid rgba(255,255,255,0.06)', borderRadius: 7, overflow: 'hidden' }}>
                      <table className="bi-error-table">
                        <thead><tr><th>Row</th><th>Field</th><th>Message</th></tr></thead>
                        <tbody>
                          {result.errors.map((e, i) => (
                            <tr key={i}>
                              <td style={{ ...MONO, color: '#f87171' }}>{e.row}</td>
                              <td style={{ ...MONO, color: '#fbbf24' }}>{e.field}</td>
                              <td style={{ color: 'rgba(255,255,255,0.6)' }}>{e.message}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                ) : (
                  <div style={{ fontSize: 12, color: '#4ade80', padding: '4px 0' }}>
                    {result.dryRun
                      ? `All ${result.valid} records valid. Switch to Live Run to apply.`
                      : result.upsert
                      ? `${result.inserted} inserted, ${result.updated} updated.${result.skipped > 0 ? ` ${result.skipped} errors skipped.` : ''}`
                      : `${result.inserted} records inserted.${result.skipped > 0 ? ` ${result.skipped} duplicates skipped.` : ''}`}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ── EXPORT MODE ────────────────────────────────────────────────── */}
        {mode === 'export' && (
          <div className="bi-card">
            <div className="bi-section-title">Download Options</div>
            <div className="bi-export-card">
              <div className="bi-export-action">
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#e2dfd8', marginBottom: 4 }}>Import Template — {entityCfg.label}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
                    Empty Excel file with all columns pre-configured. Fill it in and upload via Import tab.
                    Required fields: <span style={{ color: entityCfg.color }}>{entityCfg.requiredFields.join(', ')}</span>
                  </div>
                </div>
                <button onClick={downloadTemplate} style={{ padding: '8px 18px', borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: "'IBM Plex Sans',sans-serif", color: '#60a5fa', background: 'rgba(96,165,250,0.1)', border: '0.5px solid rgba(96,165,250,0.2)', whiteSpace: 'nowrap' }}>
                  Download Template
                </button>
              </div>
              <div className="bi-export-action">
                <div>
                  <div style={{ fontSize: 13, fontWeight: 500, color: '#e2dfd8', marginBottom: 4 }}>Export Current Data — {entityCfg.label}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
                    Download all existing {entityCfg.label.toLowerCase()} records as Excel. Use for backups, analysis, or mass updates via Upsert.
                  </div>
                </div>
                <button onClick={handleExport} disabled={exportBusy} style={{ padding: '8px 18px', borderRadius: 7, fontSize: 12, fontWeight: 500, cursor: exportBusy ? 'not-allowed' : 'pointer', fontFamily: "'IBM Plex Sans',sans-serif", color: 'white', background: 'linear-gradient(135deg,#1e3a5f,#1d4ed8,#3b82f6)', border: 'none', whiteSpace: 'nowrap', opacity: exportBusy ? 0.5 : 1 }}>
                  {exportBusy ? 'Exporting...' : 'Export to Excel'}
                </button>
              </div>
              {parseError && (
                <div style={{ background: 'rgba(239,68,68,0.08)', border: '0.5px solid rgba(239,68,68,0.2)', borderRadius: 7, padding: '8px 12px', fontSize: 12, color: '#fca5a5' }}>{parseError}</div>
              )}
              <div style={{ background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.06)', borderRadius: 7, padding: '10px 14px', fontSize: 11, color: 'rgba(255,255,255,0.35)', lineHeight: 1.7 }}>
                Export a file, make changes, then re-import with Upsert enabled to apply mass updates across all records at once.
              </div>
            </div>
          </div>
        )}

      </div>
    </ERPShell>
  );
}