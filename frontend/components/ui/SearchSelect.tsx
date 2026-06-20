// ============================================================================
// FILE: frontend/components/ui/SearchSelect.tsx
// ============================================================================
"use client";

import { useEffect, useRef, useState } from 'react';

export interface SSOption {
  value: string;
  label: string;
  sublabel?: string;
}

export interface SearchSelectProps {
  options: SSOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  clearLabel?: string;
  disabled?: boolean;
  /** Minimum width of the dropdown panel in px (default: 280) */
  minWidth?: number;
}

export default function SearchSelect({
  options,
  value,
  onChange,
  placeholder = 'Search…',
  clearLabel  = '— None —',
  disabled    = false,
  minWidth    = 280,
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
    const minBelow   = 200;
    // Panel is at least minWidth wide, anchored to trigger left edge
    const panelW     = Math.max(r.width, minWidth);

    setPanelStyle(
      spaceBelow >= minBelow
        ? { position: 'fixed', top: r.bottom + 4, left: r.left, width: panelW, zIndex: 9999 }
        : { position: 'fixed', bottom: window.innerHeight - r.top + 4, left: r.left, width: panelW, zIndex: 9999 }
    );
    setOpen(true);
    setQuery('');
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  // ── Close on outside click ────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!triggerRef.current?.contains(t) && !panelRef.current?.contains(t)) {
        setOpen(false); setQuery('');
      }
    };
    document.addEventListener('mousedown', handler, true);
    return () => document.removeEventListener('mousedown', handler, true);
  }, [open]);

  const selected = options.find(o => o.value === value);
  const filtered = query.trim()
    ? options.filter(o =>
        o.label.toLowerCase().includes(query.toLowerCase()) ||
        (o.sublabel ?? '').toLowerCase().includes(query.toLowerCase())
      )
    : options;

  const select = (v: string) => { onChange(v); setOpen(false); setQuery(''); };

  return (
    <>
      {/* ── Trigger ── */}
      <div
        ref={triggerRef}
        onClick={() => open ? setOpen(false) : openPanel()}
        style={{
          background:     disabled ? 'rgba(255,255,255,0.02)' : 'var(--surface)',
          border:         `0.5px solid ${open ? 'rgba(251,146,60,0.45)' : 'rgba(255,255,255,0.1)'}`,
          borderRadius:   7,
          padding:        '7px 12px',
          fontSize:       12,
          fontFamily:     "'IBM Plex Sans', sans-serif",
          color:          selected ? 'var(--text-strong)' : 'rgba(255,255,255,0.3)',
          cursor:         disabled ? 'not-allowed' : 'pointer',
          opacity:        disabled ? 0.5 : 1,
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          gap:            8,
          userSelect:     'none',
          boxShadow:      open ? '0 0 0 2px rgba(234,88,12,0.1)' : 'none',
          transition:     'border-color 0.15s, box-shadow 0.15s',
          minWidth:       minWidth,
          whiteSpace:     'nowrap',
          overflow:       'hidden',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>
          {selected ? selected.label : clearLabel}
        </span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"
          style={{ flexShrink: 0, opacity: 0.4, transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
          <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      {/* ── Dropdown panel ── */}
      {open && (
        <div
          ref={panelRef}
          onMouseDown={e => e.stopPropagation()}
          style={{
            ...panelStyle,
            background:   'var(--surface)',
            border:       '0.5px solid rgba(251,146,60,0.25)',
            borderRadius: 8,
            boxShadow:    '0 16px 48px rgba(0,0,0,0.8), 0 0 0 0.5px rgba(255,255,255,0.04) inset',
            overflow:     'hidden',
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
                width:        '100%',
                background:   'rgba(255,255,255,0.05)',
                border:       '0.5px solid rgba(255,255,255,0.1)',
                borderRadius: 6,
                padding:      '6px 10px',
                fontSize:     12,
                fontFamily:   "'IBM Plex Sans', sans-serif",
                color:        'var(--text-strong)',
                outline:      'none',
              }}
            />
          </div>

          {/* Options list */}
          <div style={{ maxHeight: 240, overflowY: 'auto' }}>
            {/* Clear option */}
            <div
              onClick={() => select('')}
              style={{
                padding:      '8px 14px',
                fontSize:     12,
                cursor:       'pointer',
                color:        'rgba(255,255,255,0.3)',
                fontFamily:   "'IBM Plex Sans', sans-serif",
                borderBottom: '0.5px solid rgba(255,255,255,0.04)',
                background:   'transparent',
                whiteSpace:   'nowrap',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              {clearLabel}
            </div>

            {filtered.length === 0 ? (
              <div style={{ padding: 12, fontSize: 12, color: 'rgba(255,255,255,0.25)', textAlign: 'center', fontFamily: "'IBM Plex Sans', sans-serif" }}>
                No results for &ldquo;{query}&rdquo;
              </div>
            ) : filtered.map(o => (
              <div
                key={o.value}
                onClick={() => select(o.value)}
                style={{
                  padding:    '9px 14px',
                  fontSize:   12,
                  cursor:     'pointer',
                  fontFamily: "'IBM Plex Sans', sans-serif",
                  color:      value === o.value ? 'var(--accent-strong)' : 'var(--text-primary)',
                  background: value === o.value ? 'rgba(251,146,60,0.08)' : 'transparent',
                  borderLeft: value === o.value ? '2px solid var(--accent-strong)' : '2px solid transparent',
                  whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => { if (value !== o.value) e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; }}
                onMouseLeave={e => { if (value !== o.value) e.currentTarget.style.background = 'transparent'; }}
              >
                <div>{o.label}</div>
                {o.sublabel && (
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{o.sublabel}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}