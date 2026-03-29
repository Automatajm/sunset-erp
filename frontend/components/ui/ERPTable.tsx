"use client";

import { useState, useMemo, useCallback, useRef } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type SortDir = 'asc' | 'desc' | null;

export interface ERPColumn<T> {
  key: string;
  header: string;
  width?: string | number;
  align?: 'left' | 'center' | 'right';
  sortable?: boolean;
  render?: (row: T, index: number) => React.ReactNode;
  /** Value used for sorting/export when render is a component */
  value?: (row: T) => string | number;
}

export interface ERPTableProps<T> {
  columns: ERPColumn<T>[];
  data: T[];
  rowKey: (row: T) => string;
  /** Page sizes to offer. Default: [10, 25, 50, 100] */
  pageSizes?: number[];
  defaultPageSize?: number;
  /** Empty state message */
  emptyMessage?: string;
  /** Loading state */
  loading?: boolean;
  /** Filename for CSV export (without extension) */
  exportFilename?: string;
  /** Called when a row is clicked */
  onRowClick?: (row: T) => void;
  /** Extra toolbar content rendered left of export button */
  toolbarLeft?: React.ReactNode;
  /** Table max height for tbody scroll (default: 'calc(100vh - 340px)') */
  maxHeight?: string;
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function IconSort({ dir }: { dir: SortDir }) {
  return (
    <span style={{ display: 'inline-flex', flexDirection: 'column', gap: 1, marginLeft: 4, verticalAlign: 'middle', opacity: dir ? 1 : 0.3 }}>
      <svg width="7" height="4" viewBox="0 0 7 4" fill="none">
        <path d="M3.5 0L7 4H0L3.5 0Z" fill={dir === 'asc' ? '#fb923c' : 'rgba(255,255,255,0.4)'} />
      </svg>
      <svg width="7" height="4" viewBox="0 0 7 4" fill="none">
        <path d="M3.5 4L0 0H7L3.5 4Z" fill={dir === 'desc' ? '#fb923c' : 'rgba(255,255,255,0.4)'} />
      </svg>
    </span>
  );
}

function IconDownload() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6.5 1v7M4 6l2.5 2.5L9 6" />
      <path d="M1 10.5v1a.5.5 0 0 0 .5.5h10a.5.5 0 0 0 .5-.5v-1" />
    </svg>
  );
}

function IconChevron({ dir }: { dir: 'left' | 'right' }) {
  return (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
      {dir === 'left'
        ? <path d="M8 2L4 6l4 4" />
        : <path d="M4 2l4 4-4 4" />}
    </svg>
  );
}

// ─── CSV Export ───────────────────────────────────────────────────────────────

function exportCSV<T>(columns: ERPColumn<T>[], data: T[], filename: string) {
  const headers = columns.map(c => `"${c.header}"`).join(',');
  const rows = data.map(row =>
    columns.map(c => {
      const val = c.value ? c.value(row) : (row as any)[c.key] ?? '';
      return `"${String(val).replace(/"/g, '""')}"`;
    }).join(',')
  );
  const csv = [headers, ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${filename}.csv`; a.click();
  URL.revokeObjectURL(url);
}

// ─── XLSX Export ─────────────────────────────────────────────────────────────

async function exportXLSX<T>(columns: ERPColumn<T>[], data: T[], filename: string) {
  const XLSX = await import('xlsx');
  const rows = data.map(row =>
    Object.fromEntries(columns.map(c => [
      c.header,
      c.value ? c.value(row) : (row as any)[c.key] ?? '',
    ]))
  );
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Data');
  XLSX.writeFile(wb, `${filename}.xlsx`);
}

// ─── Export Dropdown ─────────────────────────────────────────────────────────

function ExportDropdown({ onCSV, onXLSX }: { onCSV: () => void; onXLSX: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useState(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  });

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 5,
          padding: '5px 12px', borderRadius: 6,
          fontSize: 11, fontWeight: 500, fontFamily: "'IBM Plex Sans',sans-serif",
          background: 'rgba(251,146,60,0.08)',
          border: '0.5px solid rgba(251,146,60,0.2)',
          color: '#fb923c', cursor: 'pointer',
        }}
        onClick={() => setOpen(o => !o)}
      >
        <IconDownload /> Export ▾
      </button>
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 50,
          background: '#0e0b1a', border: '0.5px solid rgba(251,146,60,0.2)',
          borderRadius: 8, overflow: 'hidden', minWidth: 130,
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
        }}>
          <button onClick={() => { onCSV(); setOpen(false); }} style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
            padding: '9px 14px', background: 'none', border: 'none',
            fontSize: 12, fontFamily: "'IBM Plex Sans',sans-serif",
            color: '#e2dfd8', cursor: 'pointer', textAlign: 'left',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(251,146,60,0.08)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            <IconDownload /> CSV
          </button>
          <button onClick={() => { onXLSX(); setOpen(false); }} style={{
            display: 'flex', alignItems: 'center', gap: 8, width: '100%',
            padding: '9px 14px', background: 'none', border: 'none',
            fontSize: 12, fontFamily: "'IBM Plex Sans',sans-serif",
            color: '#4ade80', cursor: 'pointer', textAlign: 'left',
            borderTop: '0.5px solid rgba(255,255,255,0.06)',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = 'rgba(74,222,128,0.08)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            <IconDownload /> Excel
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────


const PAGE_SIZES_DEFAULT = [10, 25, 50, 100];

export function ERPTable<T>({
  columns,
  data,
  rowKey,
  pageSizes = PAGE_SIZES_DEFAULT,
  defaultPageSize = 25,
  emptyMessage = 'No records found.',
  loading = false,
  exportFilename = 'export',
  onRowClick,
  toolbarLeft,
  maxHeight = 'calc(100vh - 340px)',
}: ERPTableProps<T>) {

  const [sortKey,  setSortKey]  = useState<string | null>(null);
  const [sortDir,  setSortDir]  = useState<SortDir>(null);
  const [page,     setPage]     = useState(1);
  const [pageSize, setPageSize] = useState(defaultPageSize);

  // ── Sort ──────────────────────────────────────────────────────────────────
  const handleSort = useCallback((key: string) => {
    setSortKey(prev => {
      if (prev !== key) { setSortDir('asc'); return key; }
      setSortDir(d => d === 'asc' ? 'desc' : d === 'desc' ? null : 'asc');
      return key;
    });
    setPage(1);
  }, []);

  const sorted = useMemo(() => {
    if (!sortKey || !sortDir) return data;
    const col = columns.find(c => c.key === sortKey);
    return [...data].sort((a, b) => {
      const av = col?.value ? col.value(a) : (a as any)[sortKey] ?? '';
      const bv = col?.value ? col.value(b) : (b as any)[sortKey] ?? '';
      const cmp = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  }, [data, sortKey, sortDir, columns]);

  // ── Pagination ────────────────────────────────────────────────────────────
  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage   = Math.min(page, totalPages);
  const pageData   = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

  const handlePageSize = (n: number) => { setPageSize(n); setPage(1); };

  // Page range for buttons
  const pageRange = useMemo(() => {
    const range: number[] = [];
    const delta = 2;
    for (let i = Math.max(1, safePage - delta); i <= Math.min(totalPages, safePage + delta); i++) {
      range.push(i);
    }
    return range;
  }, [safePage, totalPages]);

  const from = sorted.length === 0 ? 0 : (safePage - 1) * pageSize + 1;
  const to   = Math.min(safePage * pageSize, sorted.length);

  // ── Styles ────────────────────────────────────────────────────────────────
  const S = {
    wrap: {
      display: 'flex', flexDirection: 'column' as const, gap: 0,
      background: 'rgba(10,7,18,0.7)',
      border: '0.5px solid rgba(251,146,60,0.12)',
      borderRadius: 10, overflow: 'hidden',
    } as React.CSSProperties,
    toolbar: {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '8px 14px', borderBottom: '0.5px solid rgba(255,255,255,0.06)',
      gap: 8, flexShrink: 0, background: 'rgba(251,146,60,0.03)',
    } as React.CSSProperties,
    tableWrap: {
      overflow: 'hidden', display: 'flex', flexDirection: 'column' as const, flex: 1,
    } as React.CSSProperties,
    thead: {
      flexShrink: 0,
    } as React.CSSProperties,
    tbody: {
      overflowY: 'auto' as const,
      maxHeight,
    } as React.CSSProperties,
    table: {
      width: '100%', borderCollapse: 'collapse' as const, tableLayout: 'fixed' as const,
    } as React.CSSProperties,
    th: (col: ERPColumn<T>) => ({
      padding: '9px 14px',
      fontSize: 10, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase' as const,
      color: 'rgba(251,146,60,0.55)',
      background: 'rgba(251,146,60,0.05)',
      borderBottom: '0.5px solid rgba(255,255,255,0.06)',
      textAlign: (col.align ?? 'left') as any,
      whiteSpace: 'nowrap' as const,
      cursor: col.sortable !== false ? 'pointer' : 'default',
      userSelect: 'none' as const,
      width: col.width ?? 'auto',
    }),
    td: (col: ERPColumn<T>) => ({
      padding: '10px 14px',
      borderBottom: '0.5px solid rgba(255,255,255,0.04)',
      verticalAlign: 'middle' as const,
      fontSize: 13,
      textAlign: (col.align ?? 'left') as any,
      color: '#e2dfd8',
      overflow: 'hidden' as const,
      textOverflow: 'ellipsis' as const,
      whiteSpace: 'nowrap' as const,
    }),
    footer: {
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '8px 14px', borderTop: '0.5px solid rgba(255,255,255,0.06)',
      flexShrink: 0, flexWrap: 'wrap' as const, gap: 8,
    } as React.CSSProperties,
    btnPage: (active: boolean, disabled?: boolean) => ({
      minWidth: 28, height: 26,
      padding: '0 6px',
      borderRadius: 5,
      fontSize: 11,
      fontFamily: "'IBM Plex Sans',sans-serif",
      cursor: disabled ? 'not-allowed' : 'pointer',
      opacity: disabled ? 0.35 : 1,
      background: active ? 'rgba(251,146,60,0.2)' : 'rgba(255,255,255,0.04)',
      border: `0.5px solid ${active ? 'rgba(251,146,60,0.4)' : 'rgba(255,255,255,0.09)'}`,
      color: active ? '#fb923c' : 'rgba(255,255,255,0.5)',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      transition: 'background 0.15s',
    } as React.CSSProperties),
    select: {
      background: '#0e0b1a',
      border: '0.5px solid rgba(255,255,255,0.15)',
      borderRadius: 6, padding: '3px 8px',
      fontSize: 11, fontFamily: "'IBM Plex Sans',sans-serif",
      color: '#e2dfd8', outline: 'none',
      colorScheme: 'dark',
    } as React.CSSProperties,
    btnExport: {
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '5px 12px', borderRadius: 6,
      fontSize: 11, fontWeight: 500, fontFamily: "'IBM Plex Sans',sans-serif",
      background: 'rgba(251,146,60,0.08)',
      border: '0.5px solid rgba(251,146,60,0.2)',
      color: '#fb923c', cursor: 'pointer',
    } as React.CSSProperties,
  };

  return (
    <div style={S.wrap}>

      {/* ── Toolbar ── */}
      <div style={S.toolbar}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {toolbarLeft}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>Rows:</span>
          <select style={S.select} value={pageSize} onChange={e => handlePageSize(Number(e.target.value))}>
            {pageSizes.map(n => <option key={n} value={n}>{n}</option>)}
          </select>
          <ExportDropdown
            onCSV={() => exportCSV(columns, sorted, exportFilename)}
            onXLSX={() => exportXLSX(columns, sorted, exportFilename)}
          />
        </div>
      </div>

      {/* ── Single table with sticky thead ── */}
      <div style={{ overflowY: 'auto', maxHeight, flex: 1 }}>
        <table style={{ ...S.table, tableLayout: 'auto' }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 2 }}>
            <tr>
              {columns.map(col => (
                <th
                  key={col.key}
                  style={S.th(col)}
                  onClick={() => col.sortable !== false && handleSort(col.key)}
                >
                  {col.header}
                  {col.sortable !== false && (
                    <IconSort dir={sortKey === col.key ? sortDir : null} />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={columns.length} style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.25)', fontSize: 13 }}>
                  <div style={{ display: 'inline-block', width: 18, height: 18, borderRadius: '50%', border: '2px solid rgba(251,146,60,0.2)', borderTopColor: '#fb923c', animation: 'erp-spin 0.7s linear infinite', marginBottom: 8 }} />
                  <div>Loading…</div>
                </td>
              </tr>
            ) : pageData.length === 0 ? (
              <tr>
                <td colSpan={columns.length} style={{ textAlign: 'center', padding: 40, color: 'rgba(255,255,255,0.2)', fontSize: 13 }}>
                  {emptyMessage}
                </td>
              </tr>
            ) : pageData.map((row, idx) => (
              <tr
                key={rowKey(row)}
                onClick={() => onRowClick?.(row)}
                style={{ cursor: onRowClick ? 'pointer' : 'default', transition: 'background 0.1s' }}
                onMouseEnter={e => { if (onRowClick) (e.currentTarget as HTMLElement).style.background = 'rgba(251,146,60,0.03)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; }}
              >
                {columns.map(col => (
                  <td key={col.key} style={S.td(col)}>
                    {col.render ? col.render(row, idx) : (row as any)[col.key] ?? '—'}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Footer / Pagination ── */}
      <div style={S.footer}>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', fontFamily: "'IBM Plex Mono',monospace" }}>
          {sorted.length === 0 ? '0 records' : `${from}–${to} of ${sorted.length}`}
        </span>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {/* First + Prev */}
          <button style={S.btnPage(false, safePage === 1)} disabled={safePage === 1} onClick={() => setPage(1)}>«</button>
          <button style={S.btnPage(false, safePage === 1)} disabled={safePage === 1} onClick={() => setPage(p => p - 1)}>
            <IconChevron dir="left" />
          </button>

          {/* Page numbers */}
          {pageRange[0] > 1 && (
            <>
              <button style={S.btnPage(false)} onClick={() => setPage(1)}>1</button>
              {pageRange[0] > 2 && <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11, padding: '0 2px' }}>…</span>}
            </>
          )}
          {pageRange.map(p => (
            <button key={p} style={S.btnPage(p === safePage)} onClick={() => setPage(p)}>{p}</button>
          ))}
          {pageRange[pageRange.length - 1] < totalPages && (
            <>
              {pageRange[pageRange.length - 1] < totalPages - 1 && <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 11, padding: '0 2px' }}>…</span>}
              <button style={S.btnPage(false)} onClick={() => setPage(totalPages)}>{totalPages}</button>
            </>
          )}

          {/* Next + Last */}
          <button style={S.btnPage(false, safePage === totalPages)} disabled={safePage === totalPages} onClick={() => setPage(p => p + 1)}>
            <IconChevron dir="right" />
          </button>
          <button style={S.btnPage(false, safePage === totalPages)} disabled={safePage === totalPages} onClick={() => setPage(totalPages)}>»</button>
        </div>
      </div>

      <style>{`@keyframes erp-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}