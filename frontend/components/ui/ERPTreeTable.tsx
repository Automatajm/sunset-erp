"use client";

import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SortDir = 'asc' | 'desc' | null;

export interface ERPTreeColumn<T> {
  key: string;
  header: string;
  width?: string | number;
  align?: 'left' | 'center' | 'right';
  sortable?: boolean;
  render?: (row: T, index: number) => React.ReactNode;
  /** Value used for sorting/export when render is a component */
  value?: (row: T) => string | number;
}

export type ERPTreeFilterValue = string | string[] | boolean | null;

export interface ERPTreeFilterOption {
  value: string;
  label: string;
  color?: string;
  bg?: string;
  border?: string;
}

export type ERPTreeFilterType = 'select' | 'multiselect' | 'boolean' | 'search';

export interface ERPTreeFilter<T = any> {
  key: string;
  label: string;
  type: ERPTreeFilterType;
  options?: ERPTreeFilterOption[];
  filterFn?: (row: T, value: ERPTreeFilterValue) => boolean;
  defaultValue?: ERPTreeFilterValue;
  placeholder?: string;
}

export interface ERPTreeTableProps<T> {
  columns: ERPTreeColumn<T>[];
  data: T[];
  rowKey: (row: T) => string;
  /** Returns true if this row can be expanded */
  canExpand?: (row: T) => boolean;
  /** Content rendered in the expanded row below — receives the row */
  expandedRow?: (row: T) => React.ReactNode;
  /** Indent in px for the expanded panel left border (default: 36) */
  expandIndent?: number;
  pageSizes?: number[];
  defaultPageSize?: number;
  emptyMessage?: string;
  loading?: boolean;
  exportFilename?: string;
  onRowClick?: (row: T) => void;
  toolbarLeft?: React.ReactNode;
  filters?: ERPTreeFilter<T>[];
  externalFilters?: Record<string, ERPTreeFilterValue>;
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconSort({ dir }: { dir: SortDir }) {
  return (
    <span style={{ display:'inline-flex', flexDirection:'column', gap:1, marginLeft:4, verticalAlign:'middle', opacity:dir?1:0.3 }}>
      <svg width="7" height="4" viewBox="0 0 7 4" fill="none"><path d="M3.5 0L7 4H0L3.5 0Z" fill={dir==='asc'?'#fb923c':'rgba(255,255,255,0.4)'} /></svg>
      <svg width="7" height="4" viewBox="0 0 7 4" fill="none"><path d="M3.5 4L0 0H7L3.5 4Z" fill={dir==='desc'?'#fb923c':'rgba(255,255,255,0.4)'} /></svg>
    </span>
  );
}

function IconDownload() {
  return <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M6.5 1v7M4 6l2.5 2.5L9 6"/><path d="M1 10.5v1a.5.5 0 0 0 .5.5h10a.5.5 0 0 0 .5-.5v-1"/></svg>;
}

function IconChevron({ dir }: { dir: 'left' | 'right' }) {
  return <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">{dir==='left'?<path d="M8 2L4 6l4 4"/>:<path d="M4 2l4 4-4 4"/>}</svg>;
}

// ─── Export helpers ───────────────────────────────────────────────────────────

function doExportCSV<T>(columns: ERPTreeColumn<T>[], data: T[], filename: string) {
  const exportCols = columns.filter(c => c.key !== '_expand');
  const headers = exportCols.map(c => `"${c.header}"`).join(',');
  const rows = data.map(row => exportCols.map(c => {
    const val = c.value ? c.value(row) : (row as any)[c.key] ?? '';
    return `"${String(val).replace(/"/g,'""')}"`;
  }).join(','));
  const csv = [headers,...rows].join('\n');
  const blob = new Blob(['\uFEFF'+csv], { type:'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `${filename}.csv`; a.click(); URL.revokeObjectURL(url);
}

async function doExportXLSX<T>(columns: ERPTreeColumn<T>[], data: T[], filename: string) {
  const XLSX = await import('xlsx');
  const exportCols = columns.filter(c => c.key !== '_expand');
  const rows = data.map(row => Object.fromEntries(exportCols.map(c => [c.header, c.value ? c.value(row) : (row as any)[c.key] ?? ''])));
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Data'); XLSX.writeFile(wb, `${filename}.xlsx`);
}

// ─── Export Dropdown ──────────────────────────────────────────────────────────

function ExportDropdown({ onCSV, onXLSX }: { onCSV: () => void; onXLSX: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', h); return () => document.removeEventListener('mousedown', h);
  }, [open]);
  const BTN: React.CSSProperties = { display:'inline-flex', alignItems:'center', gap:5, padding:'5px 12px', borderRadius:6, fontSize:11, fontWeight:500, fontFamily:"'IBM Plex Sans',sans-serif", background:'rgba(251,146,60,0.08)', border:'0.5px solid rgba(251,146,60,0.2)', color:'#fb923c', cursor:'pointer' };
  const ITEM = (color: string): React.CSSProperties => ({ display:'flex', alignItems:'center', gap:8, width:'100%', padding:'9px 14px', background:'none', border:'none', fontSize:12, fontFamily:"'IBM Plex Sans',sans-serif", color, cursor:'pointer', textAlign:'left' });
  return (
    <div ref={ref} style={{ position:'relative' }}>
      <button style={BTN} onClick={() => setOpen(o => !o)}><IconDownload /> Export ▾</button>
      {open && (
        <div style={{ position:'absolute', right:0, top:'calc(100% + 4px)', zIndex:50, background:'#0e0b1a', border:'0.5px solid rgba(251,146,60,0.2)', borderRadius:8, overflow:'hidden', minWidth:130, boxShadow:'0 8px 24px rgba(0,0,0,0.5)' }}>
          <button style={ITEM('#e2dfd8')} onClick={() => { onCSV(); setOpen(false); }} onMouseEnter={e=>(e.currentTarget.style.background='rgba(251,146,60,0.08)')} onMouseLeave={e=>(e.currentTarget.style.background='none')}><IconDownload /> CSV</button>
          <button style={{ ...ITEM('#4ade80'), borderTop:'0.5px solid rgba(255,255,255,0.06)' }} onClick={() => { onXLSX(); setOpen(false); }} onMouseEnter={e=>(e.currentTarget.style.background='rgba(74,222,128,0.08)')} onMouseLeave={e=>(e.currentTarget.style.background='none')}><IconDownload /> Excel</button>
        </div>
      )}
    </div>
  );
}

// ─── Filter Bar ───────────────────────────────────────────────────────────────

function FilterBar<T>({ filters, values, onChange, activeCount, onClear }: {
  filters: ERPTreeFilter<T>[];
  values: Record<string, ERPTreeFilterValue>;
  onChange: (key: string, value: ERPTreeFilterValue) => void;
  activeCount: number;
  onClear: () => void;
}) {
  const SEL: React.CSSProperties = { background:'#0e0b1a', border:'0.5px solid rgba(255,255,255,0.12)', borderRadius:6, padding:'5px 8px', fontSize:11, fontFamily:"'IBM Plex Sans',sans-serif", color:'#e2dfd8', outline:'none', cursor:'pointer', colorScheme:'dark' as any };
  const INP: React.CSSProperties = { background:'#0e0b1a', border:'0.5px solid rgba(255,255,255,0.12)', borderRadius:6, padding:'5px 10px', fontSize:11, fontFamily:"'IBM Plex Sans',sans-serif", color:'#e2dfd8', outline:'none', minWidth:160 };
  const LBL: React.CSSProperties = { fontSize:10, fontWeight:500, letterSpacing:'0.08em', textTransform:'uppercase', color:'rgba(251,146,60,0.5)', marginBottom:3 };
  return (
    <div style={{ display:'flex', alignItems:'flex-end', gap:10, flexWrap:'wrap', padding:'10px 14px', borderBottom:'0.5px solid rgba(255,255,255,0.06)', background:'rgba(0,0,0,0.15)' }}>
      {filters.map(f => (
        <div key={f.key} style={{ display:'flex', flexDirection:'column' }}>
          <span style={LBL}>{f.label}</span>
          {f.type === 'search' && <input style={INP} placeholder={f.placeholder ?? `Search ${f.label}…`} value={(values[f.key] as string) ?? ''} onChange={e => onChange(f.key, e.target.value || null)} />}
          {f.type === 'select' && (
            <select style={SEL} value={(values[f.key] as string) ?? ''} onChange={e => onChange(f.key, e.target.value || null)}>
              <option value="">{f.placeholder ?? `All ${f.label}s`}</option>
              {f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          )}
          {f.type === 'multiselect' && (
            <div style={{ display:'flex', gap:4, flexWrap:'wrap', maxWidth:300 }}>
              {f.options?.map(o => {
                const selected = ((values[f.key] as string[]) ?? []).includes(o.value);
                return <button key={o.value} type="button" onClick={() => { const curr=(values[f.key] as string[])??[]; const next=selected?curr.filter(v=>v!==o.value):[...curr,o.value]; onChange(f.key,next.length?next:null); }} style={{ padding:'3px 9px', borderRadius:20, fontSize:10, fontFamily:"'IBM Plex Sans',sans-serif", cursor:'pointer', fontWeight:selected?500:400, color:selected?(o.color??'#fb923c'):'rgba(255,255,255,0.4)', background:selected?(o.bg??'rgba(251,146,60,0.12)'):'rgba(255,255,255,0.04)', border:`0.5px solid ${selected?(o.border??'rgba(251,146,60,0.3)'):'rgba(255,255,255,0.09)'}`, transition:'all 0.15s' }}>{o.label}</button>;
              })}
            </div>
          )}
          {f.type === 'boolean' && (
            <button type="button" onClick={() => onChange(f.key, values[f.key]===true?null:true)} style={{ padding:'5px 12px', borderRadius:6, fontSize:11, fontFamily:"'IBM Plex Sans',sans-serif", cursor:'pointer', color:values[f.key]===true?'#4ade80':'rgba(255,255,255,0.4)', background:values[f.key]===true?'rgba(74,222,128,0.1)':'rgba(255,255,255,0.04)', border:`0.5px solid ${values[f.key]===true?'rgba(74,222,128,0.3)':'rgba(255,255,255,0.09)'}`, transition:'all 0.15s', whiteSpace:'nowrap' }}>
              {values[f.key]===true?'✓ ':''}{f.label}
            </button>
          )}
        </div>
      ))}
      {activeCount > 0 && (
        <button type="button" onClick={onClear} style={{ padding:'5px 12px', borderRadius:6, fontSize:11, fontFamily:"'IBM Plex Sans',sans-serif", cursor:'pointer', color:'#f87171', background:'rgba(239,68,68,0.08)', border:'0.5px solid rgba(239,68,68,0.2)', alignSelf:'flex-end', transition:'all 0.15s', whiteSpace:'nowrap' }}>
          ↺ Clear ({activeCount})
        </button>
      )}
    </div>
  );
}

// ─── ERPTreeTable ─────────────────────────────────────────────────────────────

const PAGE_SIZES_DEFAULT = [10, 25, 50, 100];

export function ERPTreeTable<T>({
  columns,
  data,
  rowKey,
  canExpand,
  expandedRow,
  expandIndent = 36,
  pageSizes = PAGE_SIZES_DEFAULT,
  defaultPageSize = 25,
  emptyMessage = 'No records found.',
  loading = false,
  exportFilename = 'export',
  onRowClick,
  toolbarLeft,
  filters: filterDefs = [],
  externalFilters = {},
}: ERPTreeTableProps<T>) {

  const [sortKey,    setSortKey]    = useState<string | null>(null);
  const [sortDir,    setSortDir]    = useState<SortDir>(null);
  const [page,       setPage]       = useState(1);
  const [pageSize,   setPageSize]   = useState(defaultPageSize);
  const [filterVals, setFilterVals] = useState<Record<string, ERPTreeFilterValue>>({});
  const [search,     setSearch]     = useState('');
  const [expanded,   setExpanded]   = useState<Set<string>>(new Set());

  // ── Filter ────────────────────────────────────────────────────────────────
  const activeFilters = useMemo(() => ({ ...filterVals, ...externalFilters }), [filterVals, externalFilters]);

  const handleFilterChange = useCallback((key: string, value: ERPTreeFilterValue) => {
    setFilterVals(prev => ({ ...prev, [key]: value })); setPage(1);
  }, []);

  const activeFilterCount = useMemo(() =>
    Object.values(activeFilters).filter(v => v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)).length,
  [activeFilters]);

  const filtered = useMemo(() => {
    if (!filterDefs.length && !Object.keys(externalFilters).length) return data;
    return data.filter(row => {
      for (const fd of filterDefs) {
        const val = activeFilters[fd.key];
        if (val === null || val === undefined || val === '' || (Array.isArray(val) && !val.length)) continue;
        if (fd.filterFn) { if (!fd.filterFn(row, val)) return false; }
        else {
          const rowVal = (row as any)[fd.key];
          if (fd.type === 'boolean') { if (val === true && !rowVal) return false; }
          else if (fd.type === 'multiselect') { if (!(val as string[]).includes(String(rowVal??''))) return false; }
          else if (fd.type === 'search') { if (!String(rowVal??'').toLowerCase().includes(String(val).toLowerCase())) return false; }
          else { if (String(rowVal??'') !== String(val)) return false; }
        }
      }
      for (const [key, val] of Object.entries(externalFilters)) {
        if (val === null || val === undefined || val === '') continue;
        if (!filterDefs.find(fd => fd.key === key)) { const rowVal = (row as any)[key]; if (String(rowVal??'') !== String(val)) return false; }
      }
      return true;
    });
  }, [data, filterDefs, activeFilters, externalFilters]);

  // ── Search ────────────────────────────────────────────────────────────────
  const searched = useMemo(() => {
    if (!search.trim()) return filtered;
    const q = search.toLowerCase();
    return filtered.filter(row => columns.some(col => {
      const val = col.value ? col.value(row) : (row as any)[col.key];
      return val !== null && val !== undefined && String(val).toLowerCase().includes(q);
    }));
  }, [filtered, search, columns]);

  // ── Sort ──────────────────────────────────────────────────────────────────
  const handleSort = useCallback((key: string) => {
    setSortKey(prev => { if (prev !== key) { setSortDir('asc'); return key; } setSortDir(d => d==='asc'?'desc':d==='desc'?null:'asc'); return key; });
    setPage(1);
  }, []);

  const sorted = useMemo(() => {
    if (!sortKey || !sortDir) return searched;
    const col = columns.find(c => c.key === sortKey);
    return [...searched].sort((a, b) => {
      const av = col?.value ? col.value(a) : (a as any)[sortKey] ?? '';
      const bv = col?.value ? col.value(b) : (b as any)[sortKey] ?? '';
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv), undefined, { numeric:true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [searched, sortKey, sortDir, columns]);

  // ── Pagination ────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage   = Math.min(page, totalPages);
  const pageData   = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);
  const from = sorted.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to   = Math.min(safePage * pageSize, sorted.length);

  const pageRange = useMemo(() => {
    const r: number[] = [], delta = 2;
    for (let i = Math.max(1, safePage - delta); i <= Math.min(totalPages, safePage + delta); i++) r.push(i);
    return r;
  }, [safePage, totalPages]);

  // ── Expand ────────────────────────────────────────────────────────────────
  const toggleExpand = (id: string) => setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // ── Styles ────────────────────────────────────────────────────────────────
  const TH = (col: ERPTreeColumn<T>): React.CSSProperties => ({
    padding:'9px 14px', fontSize:10, fontWeight:500, letterSpacing:'0.1em', textTransform:'uppercase',
    color:'rgba(251,146,60,0.55)', background:'#0d0a1a',
    borderBottom:'0.5px solid rgba(255,255,255,0.06)',
    textAlign:(col.align??'left') as any, whiteSpace:'nowrap',
    cursor: col.sortable !== false && col.key !== '_expand' ? 'pointer' : 'default',
    userSelect:'none', width:col.width??'auto',
  });
  const TD = (col: ERPTreeColumn<T>): React.CSSProperties => ({
    padding:'10px 14px', borderBottom:'0.5px solid rgba(255,255,255,0.04)',
    verticalAlign:'middle', fontSize:13, textAlign:(col.align??'left') as any,
    color:'#e2dfd8', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
  });
  const SEL: React.CSSProperties = { background:'#0e0b1a', border:'0.5px solid rgba(255,255,255,0.15)', borderRadius:6, padding:'3px 8px', fontSize:11, fontFamily:"'IBM Plex Sans',sans-serif", color:'#e2dfd8', outline:'none', colorScheme:'dark' as any };
  const PAG = (active: boolean, disabled?: boolean): React.CSSProperties => ({ minWidth:28, height:26, padding:'0 6px', borderRadius:5, fontSize:11, fontFamily:"'IBM Plex Sans',sans-serif", cursor:disabled?'not-allowed':'pointer', opacity:disabled?0.35:1, background:active?'rgba(251,146,60,0.2)':'rgba(255,255,255,0.04)', border:`0.5px solid ${active?'rgba(251,146,60,0.4)':'rgba(255,255,255,0.09)'}`, color:active?'#fb923c':'rgba(255,255,255,0.5)', display:'inline-flex', alignItems:'center', justifyContent:'center', transition:'background 0.15s' });

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div style={{ display:'flex', flexDirection:'column', background:'rgba(10,7,18,0.7)', border:'0.5px solid rgba(251,146,60,0.12)', borderRadius:10, overflow:'hidden', flex:1, minHeight:0 }}>

      {/* Toolbar */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 14px', borderBottom:'0.5px solid rgba(255,255,255,0.06)', gap:8, flexShrink:0, background:'rgba(251,146,60,0.03)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, flex:1, minWidth:0 }}>
          <div style={{ position:'relative', flex:1, maxWidth:360 }}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="1.4" strokeLinecap="round" style={{ position:'absolute', left:9, top:'50%', transform:'translateY(-50%)', pointerEvents:'none' }}><circle cx="5.5" cy="5.5" r="4"/><line x1="8.5" y1="8.5" x2="12" y2="12"/></svg>
            <input value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} placeholder="Search all columns…" style={{ width:'100%', padding:'5px 28px 5px 28px', background:'rgba(255,255,255,0.04)', border:`0.5px solid ${search?'rgba(251,146,60,0.35)':'rgba(255,255,255,0.09)'}`, borderRadius:6, fontSize:12, fontFamily:"'IBM Plex Sans',sans-serif", color:'#e2dfd8', outline:'none', transition:'border-color 0.15s' }} />
            {search && <button onClick={() => { setSearch(''); setPage(1); }} style={{ position:'absolute', right:7, top:'50%', transform:'translateY(-50%)', background:'rgba(255,255,255,0.1)', border:'none', borderRadius:'50%', width:15, height:15, cursor:'pointer', color:'rgba(255,255,255,0.5)', fontSize:10, display:'flex', alignItems:'center', justifyContent:'center', padding:0 }}>×</button>}
          </div>
          {search && <span style={{ fontSize:11, color:'rgba(251,146,60,0.7)', whiteSpace:'nowrap', fontFamily:"'IBM Plex Mono',monospace" }}>{searched.length} of {filtered.length}</span>}
          {toolbarLeft}
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, flexShrink:0 }}>
          <span style={{ fontSize:11, color:'rgba(255,255,255,0.3)' }}>Rows:</span>
          <select style={SEL} value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}>{pageSizes.map(n => <option key={n} value={n}>{n}</option>)}</select>
          <ExportDropdown onCSV={() => doExportCSV(columns, sorted, exportFilename)} onXLSX={() => doExportXLSX(columns, sorted, exportFilename)} />
        </div>
      </div>

      {/* Filter Bar */}
      {filterDefs.length > 0 && (
        <FilterBar filters={filterDefs} values={filterVals} onChange={handleFilterChange} activeCount={activeFilterCount} onClear={() => { setFilterVals({}); setPage(1); }} />
      )}

      {/* Table */}
      <div style={{ overflowX:'auto', overflowY:'auto', flex:1, minHeight:0 }}>
        <table style={{ width:'100%', borderCollapse:'collapse', tableLayout:'auto' }}>
          <thead style={{ position:'sticky', top:0, zIndex:10 }}>
            <tr>
              {/* Expand column — auto-injected when canExpand is provided */}
              {canExpand && <th style={{ ...TH({ key:'_expand', header:'' }), width:36, cursor:'default' }} />}
              {columns.map(col => (
                <th key={col.key} style={TH(col)} onClick={() => col.sortable !== false && handleSort(col.key)}>
                  {col.header}{col.sortable !== false && <IconSort dir={sortKey===col.key?sortDir:null} />}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={columns.length + (canExpand ? 1 : 0)} style={{ textAlign:'center', padding:40, color:'rgba(255,255,255,0.25)', fontSize:13 }}>
                <div style={{ display:'inline-block', width:18, height:18, borderRadius:'50%', border:'2px solid rgba(251,146,60,0.2)', borderTopColor:'#fb923c', animation:'erp-tree-spin 0.7s linear infinite', marginBottom:8 }} /><div>Loading…</div>
              </td></tr>
            ) : pageData.length === 0 ? (
              <tr><td colSpan={columns.length + (canExpand ? 1 : 0)} style={{ textAlign:'center', padding:40, color:'rgba(255,255,255,0.2)', fontSize:13 }}>{emptyMessage}</td></tr>
            ) : pageData.map((row, idx) => {
              const id = rowKey(row);
              const expandable = canExpand ? canExpand(row) : false;
              const isExpanded = expanded.has(id);
              return (
                <React.Fragment key={id}>
                  <tr
                    style={{ cursor: onRowClick ? 'pointer' : 'default', transition:'background 0.1s' }}
                    onClick={() => onRowClick?.(row)}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(251,146,60,0.03)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}
                  >
                    {/* Expand chevron cell */}
                    {canExpand && (
                      <td style={{ padding:'10px 8px', textAlign:'center', borderBottom:'0.5px solid rgba(255,255,255,0.04)', verticalAlign:'middle', width:36 }}>
                        {expandable
                          ? <button onClick={e => { e.stopPropagation(); toggleExpand(id); }} style={{ background:'none', border:'none', cursor:'pointer', color:'rgba(255,255,255,0.35)', fontSize:11, padding:'2px 4px', borderRadius:4, display:'inline-block', transition:'transform 0.15s', transform:isExpanded?'rotate(90deg)':'rotate(0deg)' }}>▶</button>
                          : <span style={{ display:'inline-block', width:20 }} />
                        }
                      </td>
                    )}
                    {columns.map((col, colIdx) => (
                      <td key={col.key} style={TD(col)}>
                        {col.render ? col.render(row, idx) : (row as any)[col.key] ?? '—'}
                      </td>
                    ))}
                  </tr>
                  {/* Expanded content row */}
                  {expandable && isExpanded && expandedRow && (
                    <tr>
                      <td colSpan={columns.length + 1} style={{ padding:0, borderBottom:'0.5px solid rgba(255,255,255,0.06)', background:'rgba(0,0,0,0.2)' }}>
                        <div style={{ borderTop:'0.5px solid rgba(251,146,60,0.08)', borderLeft:'2px solid rgba(251,146,60,0.15)', marginLeft:expandIndent }}>
                          {expandedRow(row)}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'8px 14px', borderTop:'0.5px solid rgba(255,255,255,0.06)', flexShrink:0, flexWrap:'wrap', gap:8 }}>
        <span style={{ fontSize:11, color:'rgba(255,255,255,0.3)', fontFamily:"'IBM Plex Mono',monospace" }}>
          {sorted.length === 0 ? '0 records' : `${from}–${to} of ${sorted.length}`}
        </span>
        <div style={{ display:'flex', alignItems:'center', gap:4 }}>
          <button style={PAG(false, safePage===1)} disabled={safePage===1} onClick={() => setPage(1)}>«</button>
          <button style={PAG(false, safePage===1)} disabled={safePage===1} onClick={() => setPage(p=>p-1)}><IconChevron dir="left" /></button>
          {pageRange[0]>1 && <><button style={PAG(false)} onClick={() => setPage(1)}>1</button>{pageRange[0]>2 && <span style={{ color:'rgba(255,255,255,0.2)', fontSize:11, padding:'0 2px' }}>…</span>}</>}
          {pageRange.map(p => <button key={p} style={PAG(p===safePage)} onClick={() => setPage(p)}>{p}</button>)}
          {pageRange[pageRange.length-1]<totalPages && <>{pageRange[pageRange.length-1]<totalPages-1&&<span style={{ color:'rgba(255,255,255,0.2)', fontSize:11, padding:'0 2px' }}>…</span>}<button style={PAG(false)} onClick={() => setPage(totalPages)}>{totalPages}</button></>}
          <button style={PAG(false, safePage===totalPages)} disabled={safePage===totalPages} onClick={() => setPage(p=>p+1)}><IconChevron dir="right" /></button>
          <button style={PAG(false, safePage===totalPages)} disabled={safePage===totalPages} onClick={() => setPage(totalPages)}>»</button>
        </div>
      </div>

      <style>{`@keyframes erp-tree-spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
