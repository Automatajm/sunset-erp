"use client";

/**
 * SearchSelect — Sunset ERP global searchable single-select component.
 *
 * Usage:
 *   import SearchSelect, { SSOption } from '@/components/ui/SearchSelect';
 *
 *   const options: SSOption[] = items.map(i => ({
 *     value: i.id,
 *     label: `${i.code} — ${i.name}`,
 *     sublabel: i.category,          // optional second line
 *   }));
 *
 *   <SearchSelect
 *     options={options}
 *     value={selectedId}
 *     onChange={v => setSelectedId(v)}
 *     placeholder="Search items…"
 *     clearLabel="— Select item —"
 *   />
 *
 * Design:
 *   - Panel uses position:fixed computed from trigger getBoundingClientRect()
 *     so it never gets clipped by overflow:hidden/auto parent containers.
 *   - Detects available space and opens upward if not enough space below.
 *   - Search input receives focus automatically on open.
 *   - Keyboard: type to filter, click to select, click outside to close.
 *   - Consistent with Sunset ERP dark theme (#0e0b1a, orange accent #fb923c).
 */

import { useEffect, useRef, useState } from 'react';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface SSOption {
  value: string;
  label: string;
  sublabel?: string;   // shown as a second smaller line inside each option
}

export interface SearchSelectProps {
  options: SSOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;   // search input placeholder  — default: "Search…"
  clearLabel?: string;    // first option (empty value) — default: "— None —"
  disabled?: boolean;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function SearchSelect({
  options,
  value,
  onChange,
  placeholder = 'Search…',
  clearLabel  = '— None —',
  disabled    = false,
}: SearchSelectProps) {
  const [open,       setOpen]       = useState(false);
  const [query,      setQuery]      = useState('');
  const [panelStyle, setPanelStyle] = useState<React.CSSProperties>({});

  const triggerRef = useRef<HTMLDivElement>(null);
  const panelRef   = useRef<HTMLDivElement>(null);
  const inputRef   = useRef<HTMLInputElement>(null);

  // ── Open panel: compute fixed position from trigger rect ──────────────────
  const openPanel = () => {
    if (disabled || !triggerRef.current) return;
    const r          = triggerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const minBelow   = 180; // px — if less than this, open upward

    setPanelStyle(
      spaceBelow >= minBelow
        ? { position: 'fixed', top: r.bottom + 4, left: r.left, width: r.width, zIndex: 9999 }
        : { position: 'fixed', bottom: window.innerHeight - r.top + 4, left: r.left, width: r.width, zIndex: 9999 }
    );
    setOpen(true);
    setQuery('');
    // Delay focus so the panel is painted before we try to focus the input
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  // ── Close on outside click (capture phase, before other handlers) ─────────
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !panelRef.current?.contains(t)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', handler, true);
    return () => document.removeEventListener('mousedown', handler, true);
  }, [open]);

  // ── Filtered options ──────────────────────────────────────────────────────
  const selected = options.find(o => o.value === value);
  const filtered = query.trim()
    ? options.filter(o =>
        o.label.toLowerCase().includes(query.toLowerCase()) ||
        (o.sublabel ?? '').toLowerCase().includes(query.toLowerCase())
      )
    : options;

  const select = (v: string) => { onChange(v); setOpen(false); setQuery(''); };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      {/* ── Trigger ── */}
      <div
        ref={triggerRef}
        onClick={() => open ? setOpen(false) : openPanel()}
        style={{
          background:    disabled ? 'rgba(255,255,255,0.02)' : '#0e0b1a',
          border:        `0.5px solid ${open ? 'rgba(251,146,60,0.45)' : 'rgba(255,255,255,0.1)'}`,
          borderRadius:  7,
          padding:       '9px 12px',
          fontSize:      13,
          fontFamily:    "'IBM Plex Sans', sans-serif",
          color:         selected ? '#f1ede8' : 'rgba(255,255,255,0.25)',
          cursor:        disabled ? 'not-allowed' : 'pointer',
          opacity:       disabled ? 0.5 : 1,
          display:       'flex',
          alignItems:    'center',
          justifyContent:'space-between',
          gap:           8,
          userSelect:    'none',
          boxShadow:     open ? '0 0 0 2px rgba(234,88,12,0.1)' : 'none',
          transition:    'border-color 0.15s, box-shadow 0.15s',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {selected ? selected.label : clearLabel}
        </span>
        <svg
          width="10" height="10" viewBox="0 0 10 10" fill="none"
          style={{
            flexShrink: 0, opacity: 0.4,
            transform: open ? 'rotate(180deg)' : 'none',
            transition: 'transform 0.2s',
          }}
        >
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      {/* ── Dropdown panel — position:fixed escapes all overflow containers ── */}
      {open && (
        <div
          ref={panelRef}
          onMouseDown={e => e.stopPropagation()}
          style={{
            ...panelStyle,
            background:  '#0e0b1a',
            border:      '0.5px solid rgba(251,146,60,0.25)',
            borderRadius: 8,
            boxShadow:   '0 16px 48px rgba(0,0,0,0.8), 0 0 0 0.5px rgba(255,255,255,0.04) inset',
            overflow:    'hidden',
          }}
        >
          {/* Search input */}
          <div style={{ padding: '8px 10px', borderBottom: '0.5px solid rgba(255,255,255,0.07)' }}>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder={placeholder}
              style={{
                width:      '100%',
                background: 'rgba(255,255,255,0.05)',
                border:     '0.5px solid rgba(255,255,255,0.1)',
                borderRadius: 6,
                padding:    '6px 10px',
                fontSize:   12,
                fontFamily: "'IBM Plex Sans', sans-serif",
                color:      '#f1ede8',
                outline:    'none',
              }}
            />
          </div>

          {/* Options list */}
          <div style={{ maxHeight: 220, overflowY: 'auto' }}>
            {/* Clear / none option */}
            <div
              onClick={() => select('')}
              style={{
                padding:      '8px 12px',
                fontSize:     12,
                cursor:       'pointer',
                color:        'rgba(255,255,255,0.3)',
                fontFamily:   "'IBM Plex Sans', sans-serif",
                borderBottom: '0.5px solid rgba(255,255,255,0.04)',
                background:   'transparent',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {clearLabel}
            </div>

            {filtered.length === 0 ? (
              <div style={{
                padding:    12,
                fontSize:   12,
                color:      'rgba(255,255,255,0.25)',
                textAlign:  'center',
                fontFamily: "'IBM Plex Sans', sans-serif",
              }}>
                No results for &ldquo;{query}&rdquo;
              </div>
            ) : filtered.map(o => (
              <div
                key={o.value}
                onClick={() => select(o.value)}
                style={{
                  padding:    '8px 12px',
                  fontSize:   13,
                  cursor:     'pointer',
                  fontFamily: "'IBM Plex Sans', sans-serif",
                  color:      value === o.value ? '#fb923c' : '#e2dfd8',
                  background: value === o.value ? 'rgba(251,146,60,0.08)' : 'transparent',
                  borderLeft: value === o.value ? '2px solid #fb923c' : '2px solid transparent',
                }}
                onMouseEnter={e => { if (value !== o.value) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                onMouseLeave={e => { if (value !== o.value) e.currentTarget.style.background = 'transparent'; }}
              >
                <div>{o.label}</div>
                {o.sublabel && (
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 1 }}>
                    {o.sublabel}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}