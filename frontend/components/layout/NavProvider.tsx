"use client";
// ============================================================================
// FILE: frontend/components/layout/NavProvider.tsx
// Holds the nav panel's open/mode state ABOVE the per-page ERPShell, so the
// panel survives client-side navigation (book/sidebar mode stays open) instead
// of resetting every time a page remounts its shell. Mounted once in the root
// layout. Display mode is persisted; open state lives in memory for the session.
// ============================================================================
import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { NavMode } from './NavPanel';

interface NavContextValue {
  open: boolean;
  mode: NavMode;
  setOpen: (v: boolean) => void;
  toggleOpen: () => void;
  toggleMode: () => void;
}

const NavContext = createContext<NavContextValue | null>(null);

export function useNav(): NavContextValue {
  const ctx = useContext(NavContext);
  if (!ctx) throw new Error('useNav must be used within <NavProvider>');
  return ctx;
}

export function NavProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<NavMode>('overlay');

  // Restore persisted display mode.
  useEffect(() => {
    const saved = localStorage.getItem('sunset-nav-mode');
    if (saved === 'sidebar' || saved === 'overlay') setMode(saved);
  }, []);

  const toggleOpen = useCallback(() => setOpen(o => !o), []);
  const toggleMode = useCallback(() => setMode(m => {
    const next: NavMode = m === 'overlay' ? 'sidebar' : 'overlay';
    localStorage.setItem('sunset-nav-mode', next);
    return next;
  }), []);

  // Global Ctrl/Cmd+K toggles the panel from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') { e.preventDefault(); setOpen(o => !o); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <NavContext.Provider value={{ open, mode, setOpen, toggleOpen, toggleMode }}>
      {children}
    </NavContext.Provider>
  );
}
