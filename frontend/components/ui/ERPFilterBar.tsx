"use client";

import { useState, useMemo, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ERPFilterValue = string | string[] | boolean | null;

export interface ERPFilterOption {
  value: string;
  label: string;
  color?: string;
  bg?: string;
  border?: string;
}

export interface ERPFilter<T = any> {
  key:         string;
  label:       string;
  type:        'search' | 'select' | 'multiselect' | 'boolean';
  options?:    ERPFilterOption[];
  placeholder?: string;
  filterFn?:   (row: T, value: ERPFilterValue) => boolean;
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
      if (f.type === 'multiselect') return (val as string[]).includes(String(rowVal ?? ''));
      if (f.type === 'boolean')     return val === true ? !!rowVal : true;
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
}

export function ERPFilterBar<T>({
  filters, values, onChange, onReset, activeCount,
}: ERPFilterBarProps<T>) {

  const SEL: React.CSSProperties = {
    background: '#0e0b1a', border: '0.5px solid rgba(255,255,255,0.12)',
    borderRadius: 6, padding: '6px 8px', fontSize: 12,
    fontFamily: "'IBM Plex Sans',sans-serif", color: '#e2dfd8',
    outline: 'none', cursor: 'pointer', colorScheme: 'dark' as any,
  };
  const INP: React.CSSProperties = {
    ...SEL, cursor: 'text', padding: '6px 10px', minWidth: 180,
  };
  const LBL: React.CSSProperties = {
    fontSize: 10, fontWeight: 500, letterSpacing: '0.08em',
    textTransform: 'uppercase', color: 'rgba(251,146,60,0.5)',
    marginBottom: 4,
  };

  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 10, flexWrap: 'wrap' }}>
      {filters.map(f => {
        const val = values[f.key];

        if (f.type === 'search') return (
          <div key={f.key} style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={LBL}>{f.label}</span>
            <input
              style={INP}
              placeholder={f.placeholder ?? `Search…`}
              value={(val as string) ?? ''}
              onChange={e => onChange(f.key, e.target.value || null)}
            />
          </div>
        );

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
                        color:      active ? (o.color  ?? '#fb923c') : 'rgba(255,255,255,0.4)',
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

        if (f.type === 'boolean') return (
          <div key={f.key} style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={LBL}>{f.label}</span>
            <button type="button"
              style={{
                padding: '6px 12px', borderRadius: 6, fontSize: 11,
                fontFamily: "'IBM Plex Sans',sans-serif", cursor: 'pointer',
                color:      val === true ? '#4ade80' : 'rgba(255,255,255,0.4)',
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

      {activeCount > 0 && (
        <button type="button"
          style={{
            padding: '6px 12px', borderRadius: 6, fontSize: 11,
            fontFamily: "'IBM Plex Sans',sans-serif", cursor: 'pointer',
            color: '#f87171', background: 'rgba(239,68,68,0.08)',
            border: '0.5px solid rgba(239,68,68,0.2)',
            transition: 'all 0.15s', whiteSpace: 'nowrap', alignSelf: 'flex-end',
          }}
          onClick={onReset}
        >↺ Clear ({activeCount})</button>
      )}
    </div>
  );
}