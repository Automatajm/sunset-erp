"use client";
// ============================================================================
// FILE: frontend/components/layout/NavProvider.tsx
// Holds the nav panel's open/mode state ABOVE the per-page ERPShell, so the
// panel survives client-side navigation (book/sidebar mode stays open) instead
// of resetting every time a page remounts its shell. Mounted once in the root
// layout. Also owns cross-navigation state: recently-visited pages and pinned
// favorites (both localStorage-backed). Display mode is persisted; open state
// lives in memory for the session.
// ============================================================================
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import type { NavMode } from './NavPanel';

const LS_MODE   = 'sunset-nav-mode';
const LS_RECENT = 'sunset-nav-recent';
const LS_PINS   = 'sunset-nav-pins';
const RECENT_CAP = 8;

interface NavContextValue {
  open: boolean;
  mode: NavMode;
  setOpen: (v: boolean) => void;
  toggleOpen: () => void;
  toggleMode: () => void;
  recent: string[];
  pins: string[];
  togglePin: (href: string) => void;
}

const NavContext = createContext<NavContextValue | null>(null);

export function useNav(): NavContextValue {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error('useNav must be used within <NavProvider>');
  return ctx;
}

function readArray(key: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch { return []; }
}

export function NavProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<NavMode>('overlay');
  const [recent, setRecent] = useState<string[]>([]);
  const [pins, setPins] = useState<string[]>([]);
  const pathname = usePathname();

  // Restore persisted mode + pins on mount.
  useEffect(() => {
    const saved = localStorage.getItem(LS_MODE);
    if (saved === 'sidebar' || saved === 'overlay') setMode(saved);
    setPins(readArray(LS_PINS));
  }, []);

  // Record every navigation as a recent (newest first, deduped, capped).
  useEffect(() => {
    if (!pathname) return;
    setRecent(prev => {
      const base = prev.length === 0 ? readArray(LS_RECENT) : prev;
      const next = [pathname, ...base.filter(p => p !== pathname)].slice(0, RECENT_CAP);
      try { localStorage.setItem(LS_RECENT, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, [pathname]);

  const toggleOpen = useCallback(() => setOpen(o => !o), []);
  const toggleMode = useCallback(() => setMode(m => {
    const next: NavMode = m === 'overlay' ? 'sidebar' : 'overlay';
    localStorage.setItem(LS_MODE, next);
    return next;
  }), []);

  const togglePin = useCallback((href: string) => {
    setPins(prev => {
      const next = prev.includes(href) ? prev.filter(h => h !== href) : [...prev, href];
      try { localStorage.setItem(LS_PINS, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // Global Ctrl/Cmd+K toggles the panel from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setOpen(o => !o); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <NavContext.Provider value={{ open, mode, setOpen, toggleOpen, toggleMode, recent, pins, togglePin }}>
      {children}
    </NavContext.Provider>
  );
}
