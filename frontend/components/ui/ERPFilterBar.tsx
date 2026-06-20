// ============================================================================
// FILE: frontend/components/ui/ERPFilterBar.tsx
// ============================================================================
"use client";

import SearchSelect from '@/components/ui/SearchSelect';
import { ERPDatePicker, DateSelection } from '@/components/ui/ERPDatePicker';
import { useState, useMemo, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ERPFilterValue = string | string[] | boolean | DateSelection | null;

export interface ERPFilterOption {
  value: string;
  label: string;
  sublabel?: string;
  color?: string;
  bg?: string;
  border?: string;
}

export interface ERPFilter<T = any> {
  key:          string;
  label:        string;
  type:         'search' | 'select' | 'multiselect' | 'boolean' | 'searchselect' | 'daterange';
  options?:     ERPFilterOption[];
  placeholder?: string;
  /** Width for daterange picker (default 240) */
  dateWidth?:   number;
  /** minWidth for searchselect trigger+panel (default 280) */
  selectWidth?: number;
  /** Width for search text input (default 180) */
  inputWidth?:  number;
  filterFn?:    (row: T, value: ERPFilterValue) => boolean;
}

export type ERPFilterValues = Record<string, ERPFilterValue>;

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useERPFilters(filters: ERPFilter[]) {
  const empty = useMemo<ERPFilterValues>(
    () => Object.fromEntries(filters.map(f => [f.key, null])),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const [values, setValues] = useState<ERPFilterValues>(empty);

  const setValue = useCallback((key: string, value: ERPFilterValue) =>
    setValues(prev => ({ ...prev, [key]: value })), []);

  const reset = useCallback(() => setValues(empty), [empty]);

  const activeCount = useMemo(() =>
    Object.values(values).filter(v =>
      v !== null && v !== '' && !(Array.isArray(v) && !v.length)
    ).length, [values]);

  return { values, setValue, reset, activeCount };
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

/** Extract { from, to } from a DateSelection for use in filterFn */
export function dateSelectionToRange(sel: DateSelection | null | undefined): { from: Date; to: Date } | null {
  if (!sel) return null;
  if (sel.type === 'day')        return { from: sel.date, to: sel.date };
  if (sel.type === 'range')      return { from: sel.from, to: sel.to };
  if (sel.type === 'week')       return { from: sel.from, to: sel.to };
  if (sel.type === 'week-range') return { from: sel.from, to: sel.to };
  return null;
}

/** Normalizes any date value to midnight local time (strips time component).
 *  This ensures day-level filtering regardless of timezone or time in the date string. */
function toLocalDay(d: Date | string): Date {
  const dt = typeof d === 'string' ? new Date(d) : d;
  return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

/** Returns true if dateStr (YYYY-MM-DD or ISO) falls within the DateSelection.
 *  Minimum granularity is always the day — hours/minutes are stripped before comparison. */
export function dateInSelection(dateStr: string | undefined | null, sel: DateSelection | null): boolean {
  if (!sel || !dateStr) return true;
  const range = dateSelectionToRange(sel);
  if (!range) return true;
  const d    = toLocalDay(dateStr);                    // strip time from the row value
  const from = toLocalDay(range.from);                 // strip time from range start
  const to   = toLocalDay(range.to);
  to.setDate(to.getDate() + 1);                        // make 'to' exclusive at day boundary
  return d >= from && d < to;
}

// ─── Filter function ──────────────────────────────────────────────────────────

export function applyERPFilters<T>(
  data: T[],
  filters: ERPFilter<T>[],
  values: ERPFilterValues,
): T[] {
  const active = filters.filter(f => {
    const v = values[f.key];
    return v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && !v.length);
  });
  if (!active.length) return data;
  return data.filter(row =>
    active.every(f => {
      const val = values[f.key];
      if (f.filterFn) return f.filterFn(row, val);
      const rowVal = (row as any)[f.key];
      if (f.type === 'search')      return String(rowVal ?? '').toLowerCase().includes(String(val).toLowerCase());
      if (f.type === 'select')      return String(rowVal ?? '') === String(val);
      if (f.type === 'searchselect')return String(rowVal ?? '') === String(val);
      if (f.type === 'multiselect') return (val as string[]).includes(String(rowVal ?? ''));
      if (f.type === 'boolean')     return val === true ? !!rowVal : true;
      if (f.type === 'daterange')   return dateInSelection(String(rowVal ?? ''), val as DateSelection);
      return true;
    })
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

interface ERPFilterBarProps<T> {
  filters:     ERPFilter<T>[];
  values:      ERPFilterValues;
  onChange:    (key: string, value: ERPFilterValue) => void;
  onReset:     () => void;
  activeCount: number;
  /** spec-frontend-002 — allow collapse/expand of the panel. Default true. */
  collapsible?: boolean;
  /** spec-frontend-002 — initial collapsed state. Default: collapsed when activeCount===0. */
  defaultCollapsed?: boolean;
  /** spec-frontend-002 — clear a single filter (falls back to onChange(key, null)). */
  onClearFilter?: (key: string) => void;
}

// Human-readable value for a collapsed badge: "label: value" or "label (N)".
function badgeText(f: ERPFilter, val: ERPFilterValue): string | null {
  if (val === null || val === undefined || val === '' || (Array.isArray(val) && !val.length)) return null;
  if (f.type === 'multiselect') return `${f.label} (${(val as string[]).length})`;
  if (f.type === 'boolean')     return f.label;
  if (f.type === 'daterange')   return `${f.label}: set`;
  if (f.type === 'select' || f.type === 'searchselect') {
    const opt = f.options?.find(o => o.value === String(val));
    return `${f.label}: ${opt?.label ?? String(val)}`;
  }
  return `${f.label}: ${String(val)}`;
}

export function ERPFilterBar<T>({
  filters, values, onChange, onReset, activeCount,
  collapsible = true,
  defaultCollapsed,
  onClearFilter,
}: ERPFilterBarProps<T>) {

  // Collapsed by default when no filter is active (spec §1). Persists per-page
  // within the session as component state (not localStorage).
  const [collapsed, setCollapsed] = useState<boolean>(
    defaultCollapsed ?? activeCount === 0,
  );
  const clearOne = useCallback(
    (key: string) => (onClearFilter ? onClearFilter(key) : onChange(key, null)),
    [onClearFilter, onChange],
  );

  const SEL: React.CSSProperties = {
    background: 'var(--surface)', border: '0.5px solid rgba(255,255,255,0.12)',
    borderRadius: 6, padding: '6px 8px', fontSize: 12,
    fontFamily: "'IBM Plex Sans',sans-serif", color: 'var(--text-primary)',
    outline: 'none', cursor: 'pointer', colorScheme: 'dark' as any,
  };
  const INP: React.CSSProperties = {
    ...SEL, cursor: 'text', padding: '6px 10px', minWidth: 180,
  };
  const LBL: React.CSSProperties = {
    fontSize: 10, fontWeight: 500, letterSpacing: '0.08em',
    textTransform: 'uppercase', color: 'rgba(251,146,60,0.5)',
    marginBottom: 5,
  };

  const showControls = !collapsible || !collapsed;

  const BADGE: React.CSSProperties = {
    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 6px 4px 10px',
    borderRadius: 20, fontSize: 11, fontFamily: "'IBM Plex Sans',sans-serif",
    color: 'var(--accent-strong)', background: 'rgba(251,146,60,0.1)',
    border: '0.5px solid rgba(251,146,60,0.25)', cursor: 'pointer',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

      {/* ── Header: toggle + (collapsed) badges + Clear all ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
        {collapsible && (
          <button
            type="button"
            aria-expanded={!collapsed}
            onClick={() => setCollapsed(c => !c)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 12px',
              borderRadius: 6, fontSize: 11, fontWeight: 500, fontFamily: "'IBM Plex Sans',sans-serif",
              cursor: 'pointer', color: 'rgba(255,255,255,0.6)',
              background: 'rgba(255,255,255,0.04)', border: '0.5px solid rgba(255,255,255,0.12)',
              whiteSpace: 'nowrap',
            }}
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ transform: collapsed ? 'rotate(0deg)' : 'rotate(90deg)', transition: 'transform 0.15s' }}><path d="M4 2l4 4-4 4" /></svg>
            Filters{activeCount > 0 ? ` (${activeCount})` : ''}
          </button>
        )}

        {collapsible && collapsed && filters.map(f => {
          const t = badgeText(f, values[f.key]);
          if (!t) return null;
          return (
            <span key={f.key} style={BADGE} onClick={() => setCollapsed(false)} title="Click to edit filters">
              {t}
              <button
                type="button"
                onClick={e => { e.stopPropagation(); clearOne(f.key); }}
                style={{ background: 'rgba(251,146,60,0.15)', border: 'none', borderRadius: '50%', width: 15, height: 15, cursor: 'pointer', color: 'var(--accent-strong)', fontSize: 10, lineHeight: 1, padding: 0, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
              >×</button>
            </span>
          );
        })}

        {activeCount > 0 && (
          <button type="button"
            onClick={onReset}
            style={{
              padding: '6px 12px', borderRadius: 6, fontSize: 11,
              fontFamily: "'IBM Plex Sans',sans-serif", cursor: 'pointer',
              color: 'var(--danger)', background: 'rgba(239,68,68,0.08)',
              border: '0.5px solid rgba(239,68,68,0.2)', whiteSpace: 'nowrap',
            }}
          >Clear all ({activeCount})</button>
        )}
      </div>

      {/* ── Controls (only when expanded) ── */}
      {showControls && (
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
      {filters.map(f => {
        const val = values[f.key];

        // ── Text search ──────────────────────────────────────────────────────
        if (f.type === 'search') return (
          <div key={f.key} style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={LBL}>{f.label}</span>
            <input
              style={{ ...INP, ...(f.inputWidth ? { minWidth: f.inputWidth, width: f.inputWidth } : {}) }}
              placeholder={f.placeholder ?? `Search…`}
              value={(val as string) ?? ''}
              onChange={e => onChange(f.key, e.target.value || null)}
            />
          </div>
        );

        // ── Select ───────────────────────────────────────────────────────────
        if (f.type === 'select') return (
          <div key={f.key} style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={LBL}>{f.label}</span>
            <select
              style={SEL}
              value={(val as string) ?? ''}
              onChange={e => onChange(f.key, e.target.value || null)}
            >
              <option value="">{f.placeholder ?? 'All'}</option>
              {f.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        );

        // ── Search Select ────────────────────────────────────────────────────
        if (f.type === 'searchselect') return (
          <div key={f.key} style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={LBL}>{f.label}</span>
            <SearchSelect
              options={f.options?.map(o => ({ value: o.value, label: o.label, sublabel: o.sublabel })) ?? []}
              value={(val as string) ?? ''}
              onChange={v => onChange(f.key, v || null)}
              placeholder={f.placeholder ?? `Search ${f.label}…`}
              clearLabel={`— All ${f.label}s —`}
              minWidth={f.selectWidth ?? 200}
            />
          </div>
        );

        // ── Date Range ───────────────────────────────────────────────────────
        if (f.type === 'daterange') return (
          <div key={f.key} style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={LBL}>
              {f.label}
              {val && (
                <button
                  onClick={() => onChange(f.key, null)}
                  style={{ marginLeft: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(248,113,113,0.7)', fontSize: 10, padding: 0, fontFamily: "'IBM Plex Sans',sans-serif" }}
                >× clear</button>
              )}
            </span>
            <ERPDatePicker
              value={(val as DateSelection) ?? null}
              onChange={sel => onChange(f.key, sel)}
              placeholder={f.placeholder ?? 'Select date range…'}
              width={f.dateWidth ?? 200}
            />
          </div>
        );

        // ── Multiselect ──────────────────────────────────────────────────────
        if (f.type === 'multiselect') {
          const sel = (val as string[]) ?? [];
          return (
            <div key={f.key} style={{ display: 'flex', flexDirection: 'column' }}>
              <span style={LBL}>{f.label}</span>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                {f.options?.map(o => {
                  const active = sel.includes(o.value);
                  return (
                    <button key={o.value} type="button"
                      style={{
                        padding: '4px 10px', borderRadius: 20, fontSize: 11,
                        fontFamily: "'IBM Plex Sans',sans-serif", cursor: 'pointer',
                        fontWeight: active ? 500 : 400,
                        color:      active ? (o.color  ?? 'var(--accent-strong)') : 'rgba(255,255,255,0.4)',
                        background: active ? (o.bg     ?? 'rgba(251,146,60,0.12)') : 'rgba(255,255,255,0.04)',
                        border: `0.5px solid ${active ? (o.border ?? 'rgba(251,146,60,0.3)') : 'rgba(255,255,255,0.09)'}`,
                        transition: 'all 0.15s', whiteSpace: 'nowrap',
                      }}
                      onClick={() => {
                        const next = active ? sel.filter(v => v !== o.value) : [...sel, o.value];
                        onChange(f.key, next.length ? next : null);
                      }}
                    >{o.label}</button>
                  );
                })}
              </div>
            </div>
          );
        }

        // ── Boolean toggle ───────────────────────────────────────────────────
        if (f.type === 'boolean') return (
          <div key={f.key} style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={LBL}>{f.label}</span>
            <button type="button"
              style={{
                padding: '6px 12px', borderRadius: 6, fontSize: 11,
                fontFamily: "'IBM Plex Sans',sans-serif", cursor: 'pointer',
                color:      val === true ? 'var(--success)' : 'rgba(255,255,255,0.4)',
                background: val === true ? 'rgba(74,222,128,0.1)' : 'rgba(255,255,255,0.04)',
                border: `0.5px solid ${val === true ? 'rgba(74,222,128,0.3)' : 'rgba(255,255,255,0.09)'}`,
                transition: 'all 0.15s', whiteSpace: 'nowrap',
              }}
              onClick={() => onChange(f.key, val === true ? null : true)}
            >
              {val === true ? '✓ ' : ''}{f.placeholder ?? f.label}
            </button>
          </div>
        );

        return null;
      })}
      </div>
      )}
    </div>
  );
}