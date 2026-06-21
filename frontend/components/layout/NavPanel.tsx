"use client";
// ============================================================================
// FILE: frontend/components/layout/NavPanel.tsx
// Frosted-glass slide-in navigation panel. Replaces the old Ctrl+K command
// palette modal. Two display modes (overlay / sidebar) persisted by ERPShell.
// Shows the complete page directory grouped by module with live search.
// ============================================================================
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import apiClient from '@/lib/api/client';
import { useNav } from './NavProvider';

export type NavMode = 'overlay' | 'sidebar';

// Live-count badges: nav href → axios call that resolves to its count (or 0).
// All fail silently (handled by Promise.allSettled at the call site).
const BADGE_SOURCES: { href: string; load: () => Promise<number> }[] = [
  { href: '/accounting/je-queue', load: async () =>
      (await apiClient.get('/automation/queue/stats')).data?.pending ?? 0 },
  { href: '/settings/notifications', load: async () =>
      (await apiClient.get('/notifications', { params: { status: 'pending' } })).data?.count ?? 0 },
  { href: '/procurement/purchase-orders', load: async () =>
      (await apiClient.get('/purchase-orders', { params: { status: 'draft' } })).data?.count ?? 0 },
  { href: '/sales/sales-orders', load: async () =>
      (await apiClient.get('/sales-orders', { params: { status: 'draft' } })).data?.count ?? 0 },
];

export const NAV_PANEL_WIDTH = 320;

interface DirEntry { module: string; pages: [string, string][]; }

// Full page directory — every shipped route, nothing hidden. (Warehouse
// Locations is intentionally absent: no /inventory/warehouse-locations page.)
const DIRECTORY: DirEntry[] = [
  { module: 'Procurement', pages: [
    ['Suppliers', '/procurement/suppliers'],
    ['Supplier Items', '/procurement/supplier-items'],
    ['Purchase Requisitions', '/procurement/purchase-requisitions'],
    ['General Needs', '/procurement/general-needs'],
    ['RFQs', '/procurement/rfqs'],
    ['Purchase Orders', '/procurement/purchase-orders'],
    ['Goods Receipts', '/procurement/goods-receipts'],
    ['AP Invoices', '/procurement/ap-invoices'],
  ]},
  { module: 'Inventory', pages: [
    ['Items', '/inventory/items'],
    ['Macro Categories', '/inventory/macro-categories'],
    ['Categories', '/inventory/categories'],
    ['Consumption Groups', '/inventory/consumption-groups'],
    ['Warehouses', '/inventory/warehouses'],
    ['Stock Balance', '/inventory/stock-balance'],
    ['Stock Transactions', '/inventory/stock-transactions'],
    ['Stock Reconciliation', '/inventory/stock-reconciliation'],
    ['Stock Planning', '/inventory/stock-planning'],
    ['ABC Analysis', '/inventory/abc-analysis'],
    ['Inventory Turnover', '/inventory/inventory-turnover'],
    ['Slow Moving', '/inventory/slow-moving'],
    ['Stock Aging', '/inventory/stock-aging'],
    ['Valuation', '/inventory/valuation'],
    ['Labels', '/inventory/labels'],
    ['Ledger', '/inventory/ledger'],
  ]},
  { module: 'Manufacturing', pages: [
    ['Bill of Materials', '/manufacturing/bom'],
    ['BOMs', '/manufacturing/boms'],
    ['Work Centers', '/manufacturing/work-centers'],
    ['Production Plans', '/manufacturing/production-plans'],
    ['Production Orders', '/manufacturing/production-orders'],
  ]},
  { module: 'Sales', pages: [
    ['Customers', '/sales/customers'],
    ['Sales Orders', '/sales/sales-orders'],
    ['AR Invoices', '/sales/invoices'],
  ]},
  { module: 'Financial', pages: [
    ['Chart of Accounts', '/accounting/chart-of-accounts'],
    ['Journal Entries', '/accounting/journal-entries'],
    ['JE Review Queue', '/accounting/je-queue'],
    ['Budgets', '/accounting/budgets'],
    ['Cash Flow', '/accounting/cash-flow'],
    ['Fiscal Periods', '/accounting/fiscal-periods'],
    ['Financial Reports', '/accounting/reports'],
    ['Automation', '/accounting/automation'],
  ]},
  { module: 'Settings', pages: [
    ['General', '/settings/general'],
    ['UOM Catalog', '/settings/uom'],
    ['Users', '/settings/users'],
    ['Roles', '/settings/roles'],
    ['Tenants', '/settings/tenants'],
    ['Bulk Import', '/settings/bulk-import'],
    ['Notifications', '/settings/notifications'],
  ]},
];

export default function NavPanel({ open, mode, onClose, onToggleMode }: {
  open: boolean;
  mode: NavMode;
  onClose: () => void;
  onToggleMode: () => void;
}) {
  const router   = useRouter();
  const pathname = usePathname();
  const { recent, pins, togglePin } = useNav();
  const [query, setQuery] = useState('');
  const [badges, setBadges] = useState<Record<string, number>>({});
  const inputRef = useRef<HTMLInputElement>(null);

  // Focus the search only on a genuine closed→open transition — not when the
  // shell remounts while already open (book mode), which would steal focus on
  // every navigation. Reset the query on close.
  const prevOpen = useRef(open);
  useEffect(() => {
    if (open && !prevOpen.current) setTimeout(() => inputRef.current?.focus(), 60);
    if (!open) setQuery('');
    prevOpen.current = open;
  }, [open]);

  // Escape always closes; click-outside is handled by the overlay backdrop.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href + '/');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return DIRECTORY;
    return DIRECTORY
      .map(d => ({ module: d.module, pages: d.pages.filter(([label]) =>
        `${label} ${d.module}`.toLowerCase().includes(q)) }))
      .filter(d => d.pages.length > 0);
  }, [query]);

  const go = (href: string) => {
    router.push(href);
    if (mode === 'overlay') onClose();   // sidebar mode stays open
  };

  // ── Live badges: fetch on open, refresh every 60s while open, fail silently ──
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const load = async () => {
      const settled = await Promise.allSettled(BADGE_SOURCES.map(s => s.load()));
      if (cancelled) return;
      const next: Record<string, number> = {};
      settled.forEach((r, i) => {
        if (r.status === 'fulfilled' && typeof r.value === 'number' && r.value > 0) {
          next[BADGE_SOURCES[i].href] = r.value;
        }
      });
      setBadges(next);
    };
    load();
    const id = setInterval(load, 60000);
    return () => { cancelled = true; clearInterval(id); };
  }, [open]);

  // ── Directory lookup: resolve a visited path to its directory page ──────────
  const ALL = useMemo(() => DIRECTORY.flatMap(d => d.pages.map(([label, href]) => ({ label, href }))), []);
  const byHref = useMemo(() => new Map(ALL.map(p => [p.href, p])), [ALL]);
  const resolve = useCallback((path: string) => {
    const exact = byHref.get(path);
    if (exact) return exact;
    let best: { label: string; href: string } | null = null;
    for (const p of ALL) {
      if (path === p.href || path.startsWith(p.href + '/')) {
        if (!best || p.href.length > best.href.length) best = p;
      }
    }
    return best;
  }, [ALL, byHref]);

  const pinnedItems = useMemo(
    () => pins.map(h => byHref.get(h)).filter((p): p is { label: string; href: string } => !!p),
    [pins, byHref]);

  // Recent: resolved, deduped, current page + already-pinned excluded, top 5.
  const recentItems = useMemo(() => {
    const seen = new Set<string>();
    const out: { label: string; href: string }[] = [];
    for (const path of recent) {
      const p = resolve(path);
      if (!p || isActive(p.href) || pins.includes(p.href) || seen.has(p.href)) continue;
      seen.add(p.href);
      out.push(p);
      if (out.length >= 5) break;
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recent, pins, resolve, pathname]);

  const clockIcon = (
    <svg className="np-lead" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" /><path d="M12 7.5V12l3 1.8" />
    </svg>
  );

  const renderItem = (label: string, href: string, leading: React.ReactNode, keyPrefix: string) => {
    const active = isActive(href);
    const pinned = pins.includes(href);
    const count  = badges[href] ?? 0;
    return (
      <div key={`${keyPrefix}-${href}`} className={`np-item${active ? ' np-current' : ''}`} onClick={() => go(href)}>
        {leading}
        <span className="np-item-label">{label}</span>
        {count > 0 && <span className="np-badge">{count > 99 ? '99+' : count}</span>}
        <button className={`np-pin${pinned ? ' np-pinned' : ''}`} type="button"
          title={pinned ? 'Unpin from favorites' : 'Pin to favorites'}
          onClick={e => { e.stopPropagation(); togglePin(href); }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill={pinned ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2">
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        </button>
      </div>
    );
  };

  return (
    <>
      <style>{`
        .np-backdrop {
          position: fixed; inset: 0; z-index: 8000;
          background: var(--nav-scrim, rgba(0,0,0,0.4));
          backdrop-filter: blur(2px);
          opacity: 0; pointer-events: none; transition: opacity 200ms ease;
        }
        .np-backdrop.np-show { opacity: 1; pointer-events: auto; }
        .np-panel {
          position: fixed; top: 0; left: 0; z-index: 8001;
          width: ${NAV_PANEL_WIDTH}px; height: 100vh;
          display: flex; flex-direction: column;
          background: var(--nav-glass, rgba(10,7,18,0.82));
          -webkit-backdrop-filter: blur(12px) saturate(1.4);
          backdrop-filter: blur(12px) saturate(1.4);
          border-right: 0.5px solid var(--border, #2a2535);
          box-shadow: 4px 0 32px rgba(0,0,0,0.4);
          transform: translateX(-${NAV_PANEL_WIDTH}px);
          transition: transform 200ms ease;
          font-family: 'IBM Plex Sans', sans-serif;
        }
        .np-panel.np-open { transform: translateX(0); }
        /* Book/sidebar mode gets an orange edge to distinguish it from overlay. */
        .np-panel.np-sidebar { border-left: 2px solid var(--accent, #ea580c); }

        .np-head { padding: 14px 14px 10px; flex-shrink: 0; border-bottom: 0.5px solid var(--l06, rgba(255,255,255,0.06)); }
        .np-head-top { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; }
        .np-title { font-size: 13px; font-weight: 600; letter-spacing: 0.04em; color: var(--text-strong, #f1ede8); flex: 1; }
        .np-iconbtn {
          width: 26px; height: 26px; border-radius: 6px; flex-shrink: 0;
          display: flex; align-items: center; justify-content: center; cursor: pointer;
          background: none; border: none; color: var(--w40, rgba(255,255,255,0.4));
          transition: color 0.15s, background 0.15s;
        }
        .np-iconbtn:hover { color: var(--w70, rgba(255,255,255,0.7)); background: var(--l04, rgba(255,255,255,0.04)); }
        .np-iconbtn.np-mode-on { color: var(--accent-strong, #fb923c); }

        .np-search { display: flex; align-items: center; gap: 8px; background: var(--surface, #0e0b1a); border: 0.5px solid var(--border-strong, #3a3447); border-radius: 7px; padding: 7px 10px; }
        .np-search svg { flex-shrink: 0; color: var(--accent-strong, #fb923c); opacity: 0.55; }
        .np-search input { flex: 1; min-width: 0; background: transparent; border: none; outline: none; font-size: 13px; color: var(--text-strong, #f1ede8); font-family: 'IBM Plex Sans', sans-serif; }
        .np-search input::placeholder { color: var(--w30, rgba(255,255,255,0.3)); }

        .np-body { flex: 1; overflow-y: auto; padding: 8px 8px 16px; }
        .np-module { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.12em; color: var(--accent-strong, #fb923c); opacity: 0.55; padding: 12px 8px 5px; }
        .np-item {
          display: flex; align-items: center; gap: 8px; padding: 7px 10px;
          border-radius: 7px; cursor: pointer; font-size: 13px; white-space: nowrap;
          color: var(--w55, rgba(255,255,255,0.55));
          border-left: 2px solid transparent; margin-bottom: 1px;
          transition: background 0.1s, color 0.1s;
        }
        .np-item:hover { background: var(--l04, rgba(255,255,255,0.04)); color: var(--text-primary, #e2dfd8); }
        .np-item.np-current {
          color: var(--accent-strong, #fb923c); font-weight: 500;
          border-left-color: var(--accent-strong, #fb923c);
          background: color-mix(in srgb, var(--accent, #ea580c) 8%, transparent);
        }
        .np-dot { width: 5px; height: 5px; border-radius: 50%; flex-shrink: 0; background: currentColor; opacity: 0.5; }
        .np-lead { flex-shrink: 0; opacity: 0.5; }
        .np-item-label { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; }
        .np-badge {
          flex-shrink: 0; min-width: 18px; text-align: center;
          background: var(--accent, #ea580c); color: var(--white, #fff);
          font-size: 10px; font-weight: 600; line-height: 1.5;
          border-radius: 9px; padding: 1px 5px;
        }
        .np-pin {
          flex-shrink: 0; padding: 2px; background: none; border: none; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          color: var(--w40, rgba(255,255,255,0.4)); opacity: 0;
          transition: opacity 0.12s, color 0.12s;
        }
        .np-item:hover .np-pin { opacity: 0.55; }
        .np-pin:hover { opacity: 1; color: var(--w70, rgba(255,255,255,0.7)); }
        .np-item .np-pin.np-pinned, .np-item:hover .np-pin.np-pinned { opacity: 1; color: var(--accent, #ea580c); }
        .np-pin.np-pinned:hover { color: var(--accent-strong, #fb923c); }
        .np-empty { text-align: center; padding: 30px 16px; font-size: 12px; color: var(--w25, rgba(255,255,255,0.25)); }
      `}</style>

      <div className={`np-backdrop${open && mode === 'overlay' ? ' np-show' : ''}`}
           onClick={onClose} aria-hidden />

      <aside className={`np-panel${open ? ' np-open' : ''}${mode === 'sidebar' ? ' np-sidebar' : ''}`} aria-hidden={!open}>
        <div className="np-head">
          <div className="np-head-top">
            <span className="np-title">Navigation</span>
            <button className={`np-iconbtn${mode === 'sidebar' ? ' np-mode-on' : ''}`}
              onClick={onToggleMode}
              title={mode === 'overlay' ? 'Switch to book mode' : 'Switch to overlay mode'}>
              {mode === 'overlay' ? (
                // floating panel — overlay mode
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <rect x="2" y="3" width="20" height="18" rx="2" />
                  <rect x="2" y="3" width="8" height="18" fill="currentColor" opacity="0.3" />
                </svg>
              ) : (
                // open book — sidebar/book mode
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                  <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" />
                  <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
                </svg>
              )}
            </button>
            <button className="np-iconbtn" onClick={onClose} title="Close navigation">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
          <div className="np-search">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
              <line x1="10.5" y1="10.5" x2="14" y2="14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)}
              placeholder="Search pages, modules…" />
          </div>
        </div>

        <div className="np-body">
          {/* Pinned + Recent shortcuts — only when not actively searching */}
          {!query.trim() && pinnedItems.length > 0 && (
            <div>
              <div className="np-module">Pinned</div>
              {pinnedItems.map(p => renderItem(p.label, p.href, <span className="np-dot" />, 'pin'))}
            </div>
          )}
          {!query.trim() && recentItems.length > 0 && (
            <div>
              <div className="np-module">Recent</div>
              {recentItems.map(p => renderItem(p.label, p.href, clockIcon, 'rec'))}
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="np-empty">No pages found for &ldquo;{query}&rdquo;</div>
          ) : filtered.map(d => (
            <div key={d.module}>
              <div className="np-module">{d.module}</div>
              {d.pages.map(([label, href]) => renderItem(label, href, <span className="np-dot" />, 'mod'))}
            </div>
          ))}
        </div>
      </aside>
    </>
  );
}
