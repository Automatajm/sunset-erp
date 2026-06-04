"use client";

import { useState, useRef, useEffect, useCallback } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type DateSelection =
  | { type: 'day';        date: Date }
  | { type: 'range';      from: Date; to: Date }
  | { type: 'week';       year: number; week: number; from: Date; to: Date }
  | { type: 'week-range'; year: number; weekFrom: number; weekTo: number; from: Date; to: Date };

export interface ERPDatePickerProps {
  value?: DateSelection | null;
  onChange?: (val: DateSelection) => void;
  placeholder?: string;
  disabled?: boolean;
  /** Input width */
  width?: number | string;
}

// ─── ISO Week helpers ─────────────────────────────────────────────────────────

function isoWeekYear(d: Date): { week: number; year: number } {
  const dt = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (dt.getDay() + 6) % 7; // 0=Mon
  dt.setDate(dt.getDate() + 4 - day); // Thursday of this week
  const yearStart = new Date(dt.getFullYear(), 0, 1);
  const week = Math.ceil((((dt.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
  return { week, year: dt.getFullYear() };
}

function isoWeekStart(year: number, week: number): Date {
  const jan4 = new Date(year, 0, 4);
  const day = (jan4.getDay() + 6) % 7; // 0=Mon
  const weekStart = new Date(year, 0, 4 - day + (week - 1) * 7);
  return weekStart;
}

function isoWeekEnd(year: number, week: number): Date {
  const start = isoWeekStart(year, week);
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
}

function weeksInYear(year: number): number {
  const dec28 = new Date(Date.UTC(year, 11, 28));
  return isoWeekYear(dec28).week;
}

function sameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

function toLocal(d: Date) {
  // Keep local date — avoid UTC timezone shift
  const r = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return r;
}

function pad2(n: number) { return String(n).padStart(2, '0'); }

function fmtDate(d: Date) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function selectionLabel(sel: DateSelection | null | undefined): string {
  if (!sel) return '';
  if (sel.type === 'day') return fmtDate(sel.date);
  if (sel.type === 'range') return `${fmtDate(sel.from)} → ${fmtDate(sel.to)}`;
  if (sel.type === 'week') return `W${pad2(sel.week)} ${sel.year} (${fmtDate(sel.from)} → ${fmtDate(sel.to)})`;
  if (sel.type === 'week-range') return `W${pad2(sel.weekFrom)}–W${pad2(sel.weekTo)} ${sel.year} (${fmtDate(sel.from)} → ${fmtDate(sel.to)})`;
  return '';
}

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// ─── Calendar Grid ────────────────────────────────────────────────────────────

interface CalCell {
  date: Date;
  currentMonth: boolean;
  week: number;
  weekYear: number;
}

function buildGrid(year: number, month: number): CalCell[][] {
  const firstDay = new Date(year, month, 1);
  const dow = (firstDay.getDay() + 6) % 7; // 0=Mon
  const start = new Date(year, month, 1 - dow);
  const rows: CalCell[][] = [];
  let cur = new Date(start);
  // Always 6 rows for stable height — no calendar vibration
  for (let r = 0; r < 6; r++) {
    const row: CalCell[] = [];
    for (let c = 0; c < 7; c++) {
      const { week, year: wy } = isoWeekYear(cur);
      row.push({ date: new Date(cur), currentMonth: cur.getMonth() === month, week, weekYear: wy });
      cur.setDate(cur.getDate() + 1);
    }
    rows.push(row);
  }
  return rows;
}

// ─── Main Component ───────────────────────────────────────────────────────────

type PendingState =
  | { kind: 'none' }
  | { kind: 'day1'; date: Date }
  | { kind: 'week1'; week: number; year: number };

export function ERPDatePicker({
  value, onChange, placeholder = 'Select date…', disabled = false, width = 280,
}: ERPDatePickerProps) {
  const today = new Date();
  const [open,    setOpen]    = useState(false);
  const [viewY,   setViewY]   = useState(today.getFullYear());
  const [viewM,   setViewM]   = useState(today.getMonth());
  const [pending, setPending] = useState<PendingState>({ kind: 'none' });
  const [hover,   setHover]   = useState<Date | null>(null);
  const [hoverWk, setHoverWk] = useState<{ week: number; year: number } | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false); setPending({ kind: 'none' });
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const grid = buildGrid(viewY, viewM);

  // ── Navigation ──────────────────────────────────────────────────────────────
  const prevMonth = () => { if (viewM === 0) { setViewY(y => y - 1); setViewM(11); } else setViewM(m => m - 1); };
  const nextMonth = () => { if (viewM === 11) { setViewY(y => y + 1); setViewM(0); } else setViewM(m => m + 1); };
  const prevYear  = () => setViewY(y => y - 1);
  const nextYear  = () => setViewY(y => y + 1);

  // ── Day click ───────────────────────────────────────────────────────────────
  const handleDayClick = (d: Date) => {
    const dt = toLocal(d);
    if (pending.kind === 'none' || pending.kind === 'week1') {
      // First click — set anchor, wait for second click or OK
      setPending({ kind: 'day1', date: dt });
      setHoverWk(null);
    } else if (pending.kind === 'day1') {
      if (sameDay(pending.date, dt)) {
        // Same day — confirm single day immediately
        onChange?.({ type: 'day', date: dt });
        setOpen(false);
        setPending({ kind: 'none' });
        setHover(null);
        const t = new Date(); setViewY(t.getFullYear()); setViewM(t.getMonth());
      } else {
        // Second different day — confirm range immediately
        const from = pending.date < dt ? pending.date : dt;
        const to   = pending.date < dt ? dt : pending.date;
        onChange?.({ type: 'range', from, to });
        setOpen(false);
        setPending({ kind: 'none' });
        setHover(null);
        const t = new Date(); setViewY(t.getFullYear()); setViewM(t.getMonth());
      }
    }
  };

  // ── Week click ──────────────────────────────────────────────────────────────
  const handleWeekClick = (week: number, weekYear: number) => {
    setHover(null);
    if (pending.kind === 'none' || pending.kind === 'day1') {
      // First week click — set anchor
      setPending({ kind: 'week1', week, year: weekYear });
    } else if (pending.kind === 'week1') {
      if (pending.week === week && pending.year === weekYear) {
        // Same week — confirm single week immediately
        const from = isoWeekStart(weekYear, week);
        const to   = isoWeekEnd(weekYear, week);
        onChange?.({ type: 'week', year: weekYear, week, from, to });
        setOpen(false);
        setPending({ kind: 'none' });
        setHoverWk(null);
        const t = new Date(); setViewY(t.getFullYear()); setViewM(t.getMonth());
      } else {
        // Second different week — confirm week range immediately
        const s1 = isoWeekStart(pending.year, pending.week);
        const s2 = isoWeekStart(weekYear, week);
        const isChron = s1 <= s2;
        const from = isChron ? isoWeekStart(pending.year, pending.week) : isoWeekStart(weekYear, week);
        const to   = isChron ? isoWeekEnd(weekYear, week) : isoWeekEnd(pending.year, pending.week);
        const wf   = isChron ? pending.week : week;
        const wt   = isChron ? week : pending.week;
        onChange?.({ type: 'week-range', year: pending.year, weekFrom: wf, weekTo: wt, from, to });
        setOpen(false);
        setPending({ kind: 'none' });
        setHoverWk(null);
        const t = new Date(); setViewY(t.getFullYear()); setViewM(t.getMonth());
      }
    }
  };

  // ── OK ──────────────────────────────────────────────────────────────────────
  const handleOK = useCallback(() => {
    if (pending.kind === 'none') return;

    if (pending.kind === 'day1') {
      if (hover && !sameDay(hover, pending.date)) {
        const from = pending.date < toLocal(hover) ? pending.date : toLocal(hover);
        const to   = pending.date < toLocal(hover) ? toLocal(hover) : pending.date;
        onChange?.({ type: 'range', from, to });
      } else {
        onChange?.({ type: 'day', date: pending.date });
      }
    }

    if (pending.kind === 'week1') {
      if (hoverWk && (hoverWk.week !== pending.week || hoverWk.year !== pending.year)) {
        const s1 = isoWeekStart(pending.year, pending.week);
        const s2 = isoWeekStart(hoverWk.year, hoverWk.week);
        const isChron = s1 <= s2;
        const from = isChron ? isoWeekStart(pending.year, pending.week) : isoWeekStart(hoverWk.year, hoverWk.week);
        const to   = isChron ? isoWeekEnd(hoverWk.year, hoverWk.week)  : isoWeekEnd(pending.year, pending.week);
        const wf   = isChron ? pending.week : hoverWk.week;
        const wt   = isChron ? hoverWk.week : pending.week;
        onChange?.({ type: 'week-range', year: pending.year, weekFrom: wf, weekTo: wt, from, to });
      } else {
        const from = isoWeekStart(pending.year, pending.week);
        const to   = isoWeekEnd(pending.year, pending.week);
        onChange?.({ type: 'week', year: pending.year, week: pending.week, from, to });
      }
    }

    setOpen(false);
    setPending({ kind: 'none' });
    setHover(null);
    setHoverWk(null);
    // Reset view to today for next open
    const t = new Date();
    setViewY(t.getFullYear());
    setViewM(t.getMonth());
  }, [pending, hover, hoverWk, onChange]);

  // ── Keyboard ────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); setPending({ kind: 'none' }); setHover(null); setHoverWk(null); }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  // ── Day highlight logic ──────────────────────────────────────────────────────
  const getDayState = (d: Date) => {
    const dt = toLocal(d);

    if (pending.kind === 'day1') {
      const anchor = pending.date;
      const hv = hover ? toLocal(hover) : null;
      const isAnchor = sameDay(dt, anchor);
      const isHover  = hv ? sameDay(dt, hv) : false;
      const inRange  = hv && anchor !== hv
        ? (dt >= (anchor < hv ? anchor : hv) && dt <= (anchor < hv ? hv : anchor))
        : false;
      return { isAnchor, isHover, inRange };
    }

    if (pending.kind === 'week1') {
      const wStart = isoWeekStart(pending.year, pending.week);
      const wEnd   = isoWeekEnd(pending.year, pending.week);
      const hvWk   = hoverWk;
      if (hvWk && (hvWk.week !== pending.week || hvWk.year !== pending.year)) {
        const hvStart = isoWeekStart(hvWk.year, hvWk.week);
        const hvEnd   = isoWeekEnd(hvWk.year, hvWk.week);
        const from = wStart < hvStart ? wStart : hvStart;
        const to   = wEnd   > hvEnd   ? wEnd   : hvEnd;
        const inRange = dt >= from && dt <= to;
        return { isAnchor: false, isHover: false, inRange };
      }
      const inWeek = dt >= wStart && dt <= wEnd;
      return { isAnchor: false, isHover: false, inRange: inWeek };
    }

    return { isAnchor: false, isHover: false, inRange: false };
  };

  const getWeekState = (week: number, weekYear: number) => {
    if (pending.kind === 'week1') {
      const isPending = pending.week === week && pending.year === weekYear;
      const isHovered = hoverWk?.week === week && hoverWk?.year === weekYear;
      if (isPending || isHovered) return 'active';
      if (hoverWk && (hoverWk.week !== pending.week || hoverWk.year !== pending.year)) {
        const s1 = isoWeekStart(pending.year, pending.week);
        const s2 = isoWeekStart(hoverWk.year, hoverWk.week);
        const sw = isoWeekStart(weekYear, week);
        if (sw.getTime() >= Math.min(s1.getTime(), s2.getTime()) && sw.getTime() <= Math.max(s1.getTime(), s2.getTime())) return 'range';
      }
    }
    return 'none';
  };

  // ── Styles ──────────────────────────────────────────────────────────────────
  const C = {
    bg:      '#0a0712',
    border:  'rgba(251,146,60,0.2)',
    orange:  '#fb923c',
    text:    '#e2dfd8',
    muted:   'rgba(255,255,255,0.25)',
    active:  '#1e40af',
    range:   'rgba(59,130,246,0.25)',
    hover:   'rgba(59,130,246,0.15)',
  };

  const hasPending = pending.kind !== 'none';

  return (
    <div ref={wrapRef} style={{ position: 'relative', display: 'inline-block', width }}>
      {/* ── Trigger input ── */}
      <div
        onClick={() => {
          if (disabled) return;
          setOpen(o => {
            if (!o) {
              // Reset to today's month and clear any leftover state
              const t = new Date();
              setViewY(t.getFullYear());
              setViewM(t.getMonth());
              setPending({ kind: 'none' });
              setHover(null);
              setHoverWk(null);
            }
            return !o;
          });
        }}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: '#0e0b1a', border: `0.5px solid ${open ? C.orange : 'rgba(255,255,255,0.12)'}`,
          borderRadius: 7, padding: '8px 12px', cursor: disabled ? 'not-allowed' : 'pointer',
          fontSize: 12, fontFamily: "'IBM Plex Sans',sans-serif",
          color: value ? C.text : C.muted, opacity: disabled ? 0.5 : 1,
          transition: 'border-color 0.15s', userSelect: 'none',
          boxShadow: open ? `0 0 0 2px rgba(234,88,12,0.12)` : 'none',
        }}
      >
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {value ? selectionLabel(value) : placeholder}
        </span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0, marginLeft: 6, opacity: 0.5 }}>
          <rect x="1" y="2" width="10" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
          <path d="M4 1v2M8 1v2M1 5h10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
        </svg>
      </div>

      {/* ── Calendar panel ── */}
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 500,
          background: C.bg, border: `0.5px solid ${C.border}`,
          borderRadius: 10, padding: 12,
          boxShadow: '0 12px 40px rgba(0,0,0,0.6)',
          fontFamily: "'IBM Plex Sans',sans-serif",
          minWidth: 260,
        }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', gap: 2 }}>
              <NavBtn onClick={prevYear}>«</NavBtn>
              <NavBtn onClick={prevMonth}>‹</NavBtn>
            </div>
            <span style={{ fontSize: 13, fontWeight: 500, color: C.text }}>
              {MONTHS[viewM]} {viewY}
            </span>
            <div style={{ display: 'flex', gap: 2 }}>
              <NavBtn onClick={nextMonth}>›</NavBtn>
              <NavBtn onClick={nextYear}>»</NavBtn>
            </div>
          </div>

          {/* Weekday headers */}
          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <thead>
              <tr>
                <th style={{ width: 28, fontSize: 9, color: C.orange, textAlign: 'center', paddingBottom: 4, letterSpacing: '0.06em' }}>WK</th>
                {WEEKDAYS.map(d => (
                  <th key={d} style={{ width: 28, fontSize: 9, color: C.muted, textAlign: 'center', paddingBottom: 4, fontWeight: 500 }}>{d}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grid.map((row, ri) => {
                const { week, weekYear } = row[0];
                const wkState = getWeekState(week, weekYear);
                return (
                  <tr key={ri}>
                    {/* Week number */}
                    <td
                      onClick={() => handleWeekClick(week, weekYear)}
                      onMouseEnter={() => setHoverWk({ week, year: weekYear })}
                      onMouseLeave={() => setHoverWk(null)}
                      style={{
                        fontSize: 9, textAlign: 'center', cursor: 'pointer',
                        color: wkState === 'active' ? '#fff' : C.orange,
                        background: wkState === 'active' ? C.active : wkState === 'range' ? C.range : 'transparent',
                        borderRadius: 4, padding: '2px 3px',
                        fontWeight: wkState === 'active' ? 600 : 400,
                        transition: 'background 0.1s',
                      }}
                    >
                      {pad2(week)}
                    </td>
                    {/* Days */}
                    {row.map((cell, ci) => {
                      const { isAnchor, isHover: isDayHover, inRange } = getDayState(cell.date);
                      const isToday = sameDay(cell.date, today);
                      return (
                        <td
                          key={ci}
                          onClick={() => handleDayClick(cell.date)}
                          onMouseEnter={() => setHover(cell.date)}
                          onMouseLeave={() => setHover(null)}
                          style={{
                            width: 28, height: 26, textAlign: 'center',
                            fontSize: 11, cursor: 'pointer',
                            color: !cell.currentMonth ? 'rgba(255,255,255,0.2)'
                              : isAnchor || isDayHover ? '#fff'
                              : isToday ? C.orange
                              : C.text,
                            background: isAnchor || isDayHover ? C.active
                              : inRange ? C.range
                              : 'transparent',
                            borderRadius: isAnchor || isDayHover ? 4 : inRange ? 0 : 4,
                            fontWeight: isToday && !isAnchor ? 600 : 400,
                            outline: isToday && !isAnchor ? `1px solid rgba(251,146,60,0.3)` : 'none',
                            transition: 'background 0.1s',
                          }}
                        >
                          {cell.date.getDate()}
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Footer hint */}
          <div style={{ marginTop: 8, paddingTop: 6, borderTop: '0.5px solid rgba(255,255,255,0.07)' }}>
            <span style={{ fontSize: 10, color: C.muted }}>
              {pending.kind === 'none'
                ? 'Click a day or WK to select'
                : pending.kind === 'day1'
                ? hover && !sameDay(hover, pending.date)
                  ? 'Click to confirm range'
                  : 'Click another day for range'
                : hoverWk && (hoverWk.week !== pending.week || hoverWk.year !== pending.year)
                ? 'Click to confirm week range'
                : 'Click another WK for range'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Nav button ───────────────────────────────────────────────────────────────

function NavBtn({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        width: 24, height: 24, borderRadius: 4, border: 'none',
        background: 'rgba(255,255,255,0.05)', cursor: 'pointer',
        color: 'rgba(255,255,255,0.5)', fontSize: 13, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        fontFamily: "'IBM Plex Sans',sans-serif",
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => (e.currentTarget.style.background = 'rgba(251,146,60,0.12)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.05)')}
    >
      {children}
    </button>
  );
}

// ─── Re-export legacy DatePicker for compatibility ────────────────────────────
export { ERPDatePicker as DatePicker };