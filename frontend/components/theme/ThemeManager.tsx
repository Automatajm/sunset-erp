// ============================================================================
// FILE: frontend/components/theme/ThemeManager.tsx
// Global theme applier. Reads the "sunset-theme/accent/density" preferences and
// reflects them onto <html> (the `light` class + `data-accent`/`data-density`
// attributes that globals.css keys off). Runs on every page, reacts to the
// `sunset-theme-change` event the settings page dispatches, and follows the OS
// preference live while theme === 'system' — no page reload, no FOUC (the
// pre-paint inline script in layout.tsx sets the initial state).
// ============================================================================
"use client";

import { useEffect } from 'react';

function applyFromStorage() {
  const root = document.documentElement;
  const theme = localStorage.getItem('sunset-theme') ?? 'dark';
  const prefersLight = window.matchMedia('(prefers-color-scheme: light)').matches;
  const light = theme === 'light' || (theme === 'system' && prefersLight);
  root.classList.toggle('light', light);

  const accent = localStorage.getItem('sunset-accent');
  if (accent) root.setAttribute('data-accent', accent);
  else root.removeAttribute('data-accent');

  const density = localStorage.getItem('sunset-density');
  if (density) root.setAttribute('data-density', density);
  else root.removeAttribute('data-density');
}

export default function ThemeManager() {
  useEffect(() => {
    applyFromStorage();
    const onChange = () => applyFromStorage();
    window.addEventListener('sunset-theme-change', onChange);
    const mq = window.matchMedia('(prefers-color-scheme: light)');
    mq.addEventListener('change', onChange);
    return () => {
      window.removeEventListener('sunset-theme-change', onChange);
      mq.removeEventListener('change', onChange);
    };
  }, []);
  return null;
}
